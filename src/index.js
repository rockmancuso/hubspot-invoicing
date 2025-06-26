// AWS Lambda entry point for HubSpot Invoicing System
const hubspotClient = require('./hubspot/client');
const { getExpiringCompanyMemberships } = require('./hubspot/companies');
const { getPrimaryContact, getExpiringIndividualMemberships } = require('./hubspot/contacts');
const { createInvoice, findExistingOpenInvoice, updateCompanyMembershipDues, getInvoicePaymentLink } = require('./hubspot/invoices');
const calculateDistributorPrice = require('./pricing/distributor');
const calculateManufacturerPrice = require('./pricing/manufacturer');
const calculateServiceProviderPrice = require('./pricing/serviceProvider');
const calculateIndividualPrice = require('./pricing/individual');
const { logError, sendErrorNotification } = require('./utils/errorHandler');
const { generateAndStoreReport, sendReportEmail } = require('./utils/reporting');
const { storePdfInvoice } = require('./utils/storage');
const { loadTemplate, populateTemplate, generatePdf, generateQRCode } = require('./pdf/generator');
const logger = require('./utils/logger');
const config = require('./config');

// *** NEW – utility helper so we can throttle with sleep(…)
const util = require('util');
const sleep = util.promisify(setTimeout);

/**
 * Main handler for the HubSpot Invoicing Lambda.
 */
exports.handler = async (event, context) => {
  // ------------------------------------------------------------------------
  //  DRY-RUN  &  PDF-TEST flags
  // ------------------------------------------------------------------------
  const isDryRun = event.dry_run === true;
  const testLimit = event.pdf_test_limit;        // *** NEW
  const fullTestLimit = event.full_test_limit;   // *** NEW - for limited full runs
  const keepDraft = event.keep_draft === true;   // *** NEW - keep invoices in draft status
  logger.info('HubSpot Invoicing Lambda triggered', { event, isDryRun, testLimit, fullTestLimit, keepDraft });

  if (isDryRun) {
    logger.warn('--- RUNNING IN DRY-RUN MODE --- No data will be written to HubSpot or S3.');
  }
  if (testLimit) {
    logger.warn(`--- RUNNING IN PDF-TEST MODE --- Processing up to ${testLimit} members.`);
  }
  if (fullTestLimit) {
    logger.warn(`--- RUNNING IN LIMITED FULL MODE --- Processing up to ${fullTestLimit} members with full HubSpot operations.`);
  }
  if (keepDraft) {
    logger.warn('--- KEEPING INVOICES IN DRAFT STATUS --- Invoices will not be set to "open" status.');
  }
  // ------------------------------------------------------------------------

  try {
    // Correctly await the async client initialization
    const hsClient = await hubspotClient.getClient();
    logger.info('HubSpot client initialized.');

    // Load HTML template and logo once to be reused
    const { templateHtml, logoBase64 } = loadTemplate();

    // 1. DATA RETRIEVAL
    const expiringCompanies    = await getExpiringCompanyMemberships(hsClient);
    const expiringIndividuals  = await getExpiringIndividualMemberships(hsClient);
    logger.info(`Found ${expiringCompanies.length} company and ${expiringIndividuals.length} individual memberships.`);

    // Unify members into a single list for processing
    let allMembers = [
      ...expiringCompanies.map(m => ({ type: 'Company',    data: m })),
      ...expiringIndividuals.map(m => ({ type: 'Individual', data: m }))
    ];

    // *** NEW – limit for PDF test runs
    if (testLimit && allMembers.length > testLimit) {
      logger.info(`Limiting run from ${allMembers.length} to ${testLimit} members for PDF test.`);
      allMembers = allMembers.slice(0, testLimit);
    }
    
    // *** NEW – limit for full test runs
    if (fullTestLimit && allMembers.length > fullTestLimit) {
      logger.info(`Limiting run from ${allMembers.length} to ${fullTestLimit} members for full test.`);
      allMembers = allMembers.slice(0, fullTestLimit);
    }

    if (allMembers.length === 0) {
      logger.info('No memberships to process. Exiting.');
      return { statusCode: 200, body: JSON.stringify({ message: 'No memberships to process.' }) };
    }

    const processedInvoices = [];
    const failedInvoices    = [];

    // 2. PROCESS EACH MEMBER
    for (const member of allMembers) {
      let memberInfo = {};  // normalized container for data

      try {
        //-------------------------------------------------------------------
        // A. Standardize member data
        //-------------------------------------------------------------------
        if (member.type === 'Company') {
          memberInfo = {
            type:       'Company',
            id:         member.data.id,
            name:       member.data.properties.name,
            companyId:  member.data.companyId,
            properties: member.data.properties,
          };

          const primaryContact = await getPrimaryContact(hsClient, memberInfo.companyId);
          if (!primaryContact) throw new Error(`No primary contact found for company ${memberInfo.companyId}`);

          memberInfo.contactId         = primaryContact.id;
          memberInfo.contactName       = `${primaryContact.properties.firstname} ${primaryContact.properties.lastname}`;
          memberInfo.contactProperties = primaryContact.properties;

        } else {  // Individual
          memberInfo = {
            type:       'Individual',
            id:         member.data.id,
            name:       `${member.data.properties.firstname} ${member.data.properties.lastname}`,
            contactId:  member.data.id,
            companyId:  null,
            properties: member.data.properties,
          };
        }
        logger.info(`Processing ${memberInfo.type} member: ${memberInfo.name} (${memberInfo.id})`);

        //-------------------------------------------------------------------
        // B. DUPLICATE CHECK
        //-------------------------------------------------------------------
        const existingInvoice = await findExistingOpenInvoice(hsClient, { contactId: memberInfo.contactId });
        if (existingInvoice) {
          logger.warn(`Skipping ${memberInfo.name} – open invoice ${existingInvoice.id} already exists.`);
          failedInvoices.push({ name: memberInfo.name, id: memberInfo.id, reason: `Open invoice ${existingInvoice.id}` });
          continue;
        }

        //-------------------------------------------------------------------
        // C. PRICE CALCULATION
        //-------------------------------------------------------------------
        let priceResult;
        const companyMembershipType = memberInfo.properties[config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY];
        
        // Add debug logging for membership type
        logger.info(`Membership type for ${memberInfo.name}: ${companyMembershipType || 'Individual'}`);
        if (companyMembershipType === config.MEMBERSHIP_TYPE_MANUFACTURER) {
          const membershipLevel = memberInfo.properties[config.HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY];
          logger.info(`Manufacturer membership level for ${memberInfo.name}: ${membershipLevel || 'MISSING'}`);
        }

        switch (member.type === 'Company' ? companyMembershipType : 'Individual') {
          case config.MEMBERSHIP_TYPE_DISTRIBUTOR:
            priceResult = calculateDistributorPrice(memberInfo.properties);
            // NEW: Enhance the line item description with the list of territories (excluding home state)
            const allTerritoryNames = [
                ...(memberInfo.properties[config.HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY] || '').split(';'),
                ...(memberInfo.properties[config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY] || '').split(';'),
                ...(memberInfo.properties[config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY] || '').split(';')
            ].filter(Boolean); // .filter(Boolean) removes any empty strings from the array

            // Get home state and exclude it from the territories list using the same logic as pricing
            const homeState = memberInfo.properties.state || '';
            const billableTerritoryNames = allTerritoryNames.filter(territory => {
              // Use the same normalization logic as the pricing function
              const normalizeStateName = (stateName) => {
                if (!stateName) return '';
                const stateNameUpper = stateName.trim().toUpperCase();
                const stateMap = {
                  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
                  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
                  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
                  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
                  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
                  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
                  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
                  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
                  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
                  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
                  'ALBERTA': 'AB', 'BRITISH COLUMBIA': 'BC', 'MANITOBA': 'MB', 'NEW BRUNSWICK': 'NB',
                  'NEWFOUNDLAND AND LABRADOR': 'NL', 'NORTHWEST TERRITORIES': 'NT', 'NOVA SCOTIA': 'NS',
                  'NUNAVUT': 'NU', 'ONTARIO': 'ON', 'PRINCE EDWARD ISLAND': 'PE', 'QUEBEC': 'QC',
                  'SASKATCHEWAN': 'SK', 'YUKON': 'YT'
                };
                if (stateNameUpper.length === 2 && stateMap[stateNameUpper]) {
                  return stateNameUpper;
                }
                return stateMap[stateNameUpper] || stateNameUpper;
              };
              
              const normalizedTerritory = normalizeStateName(territory);
              const normalizedHomeState = normalizeStateName(homeState);
              const isHomeState = normalizedTerritory === normalizedHomeState;
              
              return !isHomeState;
            });

            if (billableTerritoryNames.length > 0) {
                const territoryLineItem = priceResult.lineItems.find(item => item.name.includes('Territory'));
                if (territoryLineItem) {
                    territoryLineItem.description = `For territories: ${billableTerritoryNames.join(', ')} (home state excluded)`;
                }
            }
            break;
          case config.MEMBERSHIP_TYPE_MANUFACTURER:
            priceResult = calculateManufacturerPrice(memberInfo.properties);
            break;
          case config.MEMBERSHIP_TYPE_SERVICE_PROVIDER:
            priceResult = calculateServiceProviderPrice(memberInfo.properties);
            break;
          case 'Individual':
            priceResult = calculateIndividualPrice(memberInfo.properties);
            break;
          default:
            throw new Error(`Unknown membership type: ${companyMembershipType || 'Individual'}`);
        }
        logger.info(`Invoice amount for ${memberInfo.name}: $${priceResult.totalPrice}`);

        //-------------------------------------------------------------------
        // D. CREATE HUBSPOT INVOICE RECORD FIRST (without PDF initially)
        //     • Skip when dry-run OR pdf-test (but allow full-test)
        //-------------------------------------------------------------------
        
        // Get the paid through date from the appropriate property based on member type
        let paidThroughDate = null;
        if (member.type === 'Company') {
          // For company memberships, use the next renewal date property
          paidThroughDate = memberInfo.properties[config.HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY];
        } else {
          // For individual memberships, use the individual paid through date property
          paidThroughDate = memberInfo.properties[config.HUBSPOT_INDIVIDUAL_PAID_THROUGH_DATE_PROPERTY];
        }
        
        logger.info(`Paid through date for ${memberInfo.name}: ${paidThroughDate ? new Date(paidThroughDate).toISOString().split('T')[0] : 'Not found'}`);
        
        let createdInvoice;
        if (isDryRun || testLimit) {                                  // Skip only dry-run and PDF-test
          logger.info(`[DRY/PDF TEST RUN] Would create HubSpot Invoice for ${memberInfo.name}`);
          createdInvoice = { id: 'fake-invoice-id-test-run' };
        } else {
          createdInvoice = await createInvoice(hsClient, {
            contactId    : memberInfo.contactId,
            companyId    : memberInfo.companyId,
            invoiceAmount: priceResult.totalPrice,
            lineItems    : priceResult.lineItems,
            pdfLink      : '', // Will be updated after PDF generation
            keepDraft    : keepDraft, // *** NEW - control invoice status
            paidThroughDate: paidThroughDate, // *** NEW - use paid through date as due date
          });
        }

        //-------------------------------------------------------------------
        // E. FETCH PAYMENT LINK AND GENERATE QR CODE
        //-------------------------------------------------------------------
        let paymentLink = null;
        let qrCodeDataUrl = null;

        if (!isDryRun && !testLimit) {
          // Fetch the payment link from HubSpot
          paymentLink = await getInvoicePaymentLink(hsClient, createdInvoice.id);
          
          if (paymentLink) {
            // Generate QR code from payment link
            qrCodeDataUrl = await generateQRCode(paymentLink);
          } else {
            logger.warn(`No payment link available for invoice ${createdInvoice.id}`);
          }
        } else {
          // For test/dry runs, use dummy data
          paymentLink = 'https://app.hubspot.com/contacts/12345/objects/2-18/invoice/67890';
          qrCodeDataUrl = await generateQRCode(paymentLink);
        }

        //-------------------------------------------------------------------
        // F. PDF GENERATION (now with QR code)
        //-------------------------------------------------------------------
        const invoiceDate = new Date().toLocaleDateString('en-US');
        
        // Calculate due date for PDF (same logic as HubSpot invoice)
        const { calculateDueDate } = require('./hubspot/invoices');
        const pdfDueDate = calculateDueDate(paidThroughDate);
        const formattedDueDate = new Date(pdfDueDate).toLocaleDateString('en-US');
        
        // DEBUG: Log address data for company memberships
        if (member.type === 'Company') {
          logger.info(`Company address data for ${memberInfo.name}:`, {
            companyName: memberInfo.properties.name,
            address: memberInfo.properties.address,
            city: memberInfo.properties.city,
            state: memberInfo.properties.state,
            zip: memberInfo.properties.zip,
            contactName: memberInfo.contactName
          });
        }
        
        const pdfData = {
          logo_base64     : logoBase64,
          invoice_number  : `INV-${memberInfo.id}-${Date.now()}`,
          invoice_date    : invoiceDate,
          due_date        : formattedDueDate, // *** NEW - use calculated due date
          bill_to_address : member.type === 'Company'
              ? (() => {
                  const contactName = memberInfo.contactName || 'Primary Contact';
                  const companyName = memberInfo.properties.name || 'Company';
                  const address = memberInfo.properties.address || '';
                  const city = memberInfo.properties.city || '';
                  const state = memberInfo.properties.state || '';
                  const zip = memberInfo.properties.zip || '';
                  
                  // Build address line - only include if we have meaningful data
                  const addressParts = [address, city, state, zip].filter(Boolean);
                  const addressLine = addressParts.length > 0 ? addressParts.join(', ') : '';
                  
                  return `${contactName}<br>${companyName}${addressLine ? '<br>' + addressLine : ''}`;
                })()
              : (() => {
                  const contactName = memberInfo.name || 'Contact';
                  const address = memberInfo.properties.address || '';
                  const city = memberInfo.properties.city || '';
                  const state = memberInfo.properties.state || '';
                  const zip = memberInfo.properties.zip || '';
                  
                  // Build address line - only include if we have meaningful data
                  const addressParts = [address, city, state, zip].filter(Boolean);
                  const addressLine = addressParts.length > 0 ? addressParts.join(', ') : '';
                  
                  return `${contactName}${addressLine ? '<br>' + addressLine : ''}`;
                })(),
          line_items      : priceResult.lineItems.map(li =>
              `<tr><td><b>${li.name}</b><br><small>${li.description}</small></td><td style="text-align:center;">${li.quantity}</td><td class="price">${li.price.toFixed(2)}</td><td class="amount">${(li.price*li.quantity).toFixed(2)}</td></tr>`
          ).join(''),
          subtotal        : `${priceResult.totalPrice.toFixed(2)}`,
          total           : `${priceResult.totalPrice.toFixed(2)}`,
          balance_due     : `${priceResult.totalPrice.toFixed(2)}`,
          qr_code         : qrCodeDataUrl || '', // QR code for payment
          payment_link    : paymentLink || ''    // Direct payment link
        };

        const populatedHtml = populateTemplate(templateHtml, pdfData);
        const pdfBuffer     = await generatePdf(populatedHtml);

        //-------------------------------------------------------------------
        // G. STORE PDF IN S3  (always—even in test mode)
        //-------------------------------------------------------------------
        const pdfS3Key = `invoices/${new Date().getFullYear()}/${new Date().getMonth()+1}/${memberInfo.type}-${memberInfo.id}.pdf`;
        let pdfLink;

        if (isDryRun) {
          logger.info(`[DRY RUN] Would store PDF in S3 at ${pdfS3Key}`);
          pdfLink = `s3://fake-bucket-for-dry-run/${pdfS3Key}`;
        } else {
          pdfLink = await storePdfInvoice(pdfBuffer, pdfS3Key);
        }
        logger.info(`PDF stored at: ${pdfLink}`);

        // TODO: Optionally update the HubSpot invoice with the PDF link
        // This would require adding an updateInvoice function to hubspot/invoices.js

        //-------------------------------------------------------------------
        // H. UPDATE COMPANY DUES  (company only; skip in test/dry modes)
        //-------------------------------------------------------------------
        if (member.type === 'Company') {
          if (isDryRun || testLimit) {                               // *** NEW
            logger.info(`[DRY/PDF TEST RUN] Would update dues for Company ${memberInfo.companyId}`);
          } else {
            await updateCompanyMembershipDues(hsClient, memberInfo.companyId, priceResult.totalPrice);
          }
        }

        //-------------------------------------------------------------------
        // I. BOOK-KEEPING
        //-------------------------------------------------------------------
        processedInvoices.push({
          name        : memberInfo.name,
          id          : memberInfo.id,
          type        : memberInfo.type,
          invoiceId   : createdInvoice.id,
          invoiceAmount: priceResult.totalPrice,
          pdfLink     : pdfLink,
          paymentLink : paymentLink,
        });

      } catch (memberError) {
        logger.error(`Failed ${memberInfo.name || member.data.id}:`, memberError);
        failedInvoices.push({
          name  : memberInfo.name || 'Unknown',
          id    : memberInfo.id   || member.data.id,
          reason: memberError.message,
        });
      }

      // Throttle so we don't hammer the PDF generator/API
      await sleep(200);
    }

    // ----------------------------------------------------------------------
    // 3. FINAL REPORTING
    // ----------------------------------------------------------------------
    const reportData = {
      date                   : new Date().toISOString(),
      totalMembershipsProcessed: allMembers.length,
      successfulInvoices     : processedInvoices.length,
      failedInvoices         : failedInvoices.length,
      invoices               : processedInvoices,
      failures               : failedInvoices,
    };

    const reportUrl = await generateAndStoreReport(reportData);
    logger.info(`Report stored at: ${reportUrl}`);

    if (config.ENABLE_REPORT_EMAIL === 'true') {
      await sendReportEmail(reportUrl, reportData);
    }

    logger.info('HubSpot Invoicing process completed.');
    return {
      statusCode: 200,
      body      : JSON.stringify({
        message  : 'HubSpot Invoicing complete.',
        processed: processedInvoices.length,
        failed   : failedInvoices.length,
        reportUrl,
      }),
    };

  } catch (error) {
    logger.error('Critical error in HubSpot Invoicing Lambda:', error);
    await logError(error);
    if (config.ENABLE_ERROR_NOTIFICATIONS === 'true') {
      await sendErrorNotification(error, event, context);
    }
    return {
      statusCode: 500,
      body      : JSON.stringify({ message: 'Critical error', error: error.message }),
    };
  }
};