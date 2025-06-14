// AWS Lambda entry point for HubSpot Invoicing System
const hubspotClient = require('./hubspot/client');
const { getExpiringCompanyMemberships } = require('./hubspot/companies');
const { getPrimaryContact, getExpiringIndividualMemberships } = require('./hubspot/contacts');
const { createInvoice, findExistingOpenInvoice, updateCompanyMembershipDues } = require('./hubspot/invoices');
const calculateDistributorPrice = require('./pricing/distributor');
const calculateManufacturerPrice = require('./pricing/manufacturer');
const calculateServiceProviderPrice = require('./pricing/serviceProvider');
const calculateIndividualPrice = require('./pricing/individual');
const { logError, sendErrorNotification } = require('./utils/errorHandler');
const { generateAndStoreReport, sendReportEmail } = require('./utils/reporting');
const { storePdfInvoice } = require('./utils/storage');
const { loadTemplate, populateTemplate, generatePdf } = require('./pdf/generator');
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
  logger.info('HubSpot Invoicing Lambda triggered', { event, isDryRun, testLimit });

  if (isDryRun) {
    logger.warn('--- RUNNING IN DRY-RUN MODE --- No data will be written to HubSpot or S3.');
  }
  if (testLimit) {
    logger.warn(`--- RUNNING IN PDF-TEST MODE --- Processing up to ${testLimit} members.`);
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

        switch (member.type === 'Company' ? companyMembershipType : 'Individual') {
          case config.MEMBERSHIP_TYPE_DISTRIBUTOR:      priceResult = calculateDistributorPrice(memberInfo.properties);    break;
          case config.MEMBERSHIP_TYPE_MANUFACTURER:     priceResult = calculateManufacturerPrice(memberInfo.properties);   break;
          case config.MEMBERSHIP_TYPE_SERVICE_PROVIDER: priceResult = calculateServiceProviderPrice(memberInfo.properties);break;
          case 'Individual':                            priceResult = calculateIndividualPrice(memberInfo.properties);    break;
          default: throw new Error(`Unknown membership type: ${companyMembershipType || 'Individual'}`);
        }
        logger.info(`Invoice amount for ${memberInfo.name}: $${priceResult.totalPrice}`);

        //-------------------------------------------------------------------
        // D. PDF GENERATION
        //-------------------------------------------------------------------
        const invoiceDate = new Date().toLocaleDateString('en-US');
        const pdfData = {
          logo_base64     : logoBase64,
          invoice_number  : `INV-${memberInfo.id}-${Date.now()}`,
          invoice_date    : invoiceDate,
          due_date        : new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('en-US'),
          bill_to_address : member.type === 'Company'
              ? `${memberInfo.contactName}<br>${memberInfo.properties.name}<br>${memberInfo.properties.address || ''}<br>${memberInfo.properties.city || ''}, ${memberInfo.properties.state || ''} ${memberInfo.properties.zip || ''}`
              : `${memberInfo.name}<br>${memberInfo.properties.address || ''}<br>${memberInfo.properties.city || ''}, ${memberInfo.properties.state || ''} ${memberInfo.properties.zip || ''}`,
          line_items      : priceResult.lineItems.map(li =>
              `<tr><td><b>${li.name}</b><br><small>${li.description}</small></td><td style="text-align:center;">${li.quantity}</td><td class="price">$${li.price.toFixed(2)}</td><td class="amount">$${(li.price*li.quantity).toFixed(2)}</td></tr>`
          ).join(''),
          subtotal        : `$${priceResult.totalPrice.toFixed(2)}`,
          total           : `$${priceResult.totalPrice.toFixed(2)}`,
          balance_due     : `$${priceResult.totalPrice.toFixed(2)}`
        };

        const populatedHtml = populateTemplate(templateHtml, pdfData);
        const pdfBuffer     = await generatePdf(populatedHtml);

        //-------------------------------------------------------------------
        // E. STORE PDF IN S3  (always—even in test mode)
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

        //-------------------------------------------------------------------
        // F. CREATE HUBSPOT INVOICE RECORD
        //     • Skip when dry-run OR pdf-test
        //-------------------------------------------------------------------
        let createdInvoice;
        if (isDryRun || testLimit) {                                  // *** NEW
          logger.info(`[DRY/PDF TEST RUN] Would create HubSpot Invoice for ${memberInfo.name}`);
          createdInvoice = { id: 'fake-invoice-id-test-run' };
        } else {
          createdInvoice = await createInvoice(hsClient, {
            contactId    : memberInfo.contactId,
            companyId    : memberInfo.companyId,
            invoiceAmount: priceResult.totalPrice,
            lineItems    : priceResult.lineItems,
            pdfLink      : pdfLink,
          });
        }

        //-------------------------------------------------------------------
        // G. UPDATE COMPANY DUES  (company only; skip in test/dry modes)
        //-------------------------------------------------------------------
        if (member.type === 'Company') {
          if (isDryRun || testLimit) {                               // *** NEW
            logger.info(`[DRY/PDF TEST RUN] Would update dues for Company ${memberInfo.companyId}`);
          } else {
            await updateCompanyMembershipDues(hsClient, memberInfo.companyId, priceResult.totalPrice);
          }
        }

        //-------------------------------------------------------------------
        // H. BOOK-KEEPING
        //-------------------------------------------------------------------
        processedInvoices.push({
          name        : memberInfo.name,
          id          : memberInfo.id,
          type        : memberInfo.type,
          invoiceId   : createdInvoice.id,
          invoiceAmount: priceResult.totalPrice,
          pdfLink     : pdfLink,
        });

      } catch (memberError) {
        logger.error(`Failed ${memberInfo.name || member.data.id}:`, memberError);
        failedInvoices.push({
          name  : memberInfo.name || 'Unknown',
          id    : memberInfo.id   || member.data.id,
          reason: memberError.message,
        });
      }

      // Throttle so we don’t hammer the PDF generator/API
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