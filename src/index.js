// AWS Lambda entry point for HubSpot Invoicing System
const hubspotClient = require('./hubspot/client');
const { getCompaniesWithExpiringMemberships } = require('./hubspot/companies');
const { getPrimaryContact } = require('./hubspot/contacts');
const { createInvoice, updateCompanyMembershipDues } = require('./hubspot/invoices');
const calculateDistributorPrice = require('./pricing/distributor');
const calculateManufacturerPrice = require('./pricing/manufacturer');
const calculateServiceProviderPrice = require('./pricing/serviceProvider');
const { logError, sendErrorNotification } = require('./utils/errorHandler');
const { generateAndStoreReport, sendReportEmail } = require('./utils/reporting');
const logger = require('./utils/logger');
const config = require('./config');

/**
 * Handles the incoming event and context.
 *
 * @param {object} event The event object.
 * @param {object} context The context object.
 */
exports.handler = async (event, context) => {
  logger.info('HubSpot Invoicing Lambda triggered', { event });

  try {
    // 1. Authentication (HubSpot client is initialized with API key from config)
    const hsClient = hubspotClient.getClient();
    logger.info('HubSpot client initialized.');

    // 2. Data Retrieval
    logger.info('Fetching company memberships with expiring renewal dates...');
    const companies = await getCompaniesWithExpiringMemberships(hsClient);
    logger.info(`Found ${companies.length} memberships with expiring renewal dates.`);

    if (companies.length === 0) {
      logger.info('No memberships to process. Exiting.');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No memberships with expiring renewal dates found.' }),
      };
    }

    const processedInvoices = [];
    const failedInvoices = [];

    for (const membership of companies) {
      try {
        logger.info(`Processing membership: ${membership.properties.company_name} (Membership ID: ${membership.id}, Company ID: ${membership.companyId})`);

        // Retrieve primary contact using the company ID
        const primaryContact = await getPrimaryContact(hsClient, membership.companyId);
        if (!primaryContact) {
          logger.warn(`No primary contact found for company ID: ${membership.companyId}. Skipping invoice generation.`);
          failedInvoices.push({
            companyId: membership.companyId,
            companyName: membership.properties.name,
            membershipId: membership.id,
            reason: 'No primary contact found'
          });
          continue;
        }
        logger.info(`Primary contact for ${membership.properties.name}: ${primaryContact.properties.firstname} ${primaryContact.properties.lastname} (ID: ${primaryContact.id})`);

        // 3. Price Calculation
        let invoiceAmount;
        let lineItems = []; // Define lineItems here to be populated by pricing functions
        const membershipType = membership.properties[config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY]; // e.g., 'membership_type'
        logger.info(`Membership type for ${membership.properties.name}: ${membershipType}`);

        // Company properties are now available in membership.properties for pricing functions
        // e.g. membership.properties.number_of_territories, membership.properties.annual_sales_volume

        switch (membershipType) {
          case config.MEMBERSHIP_TYPE_DISTRIBUTOR:
            ({ totalPrice: invoiceAmount, lineItems } = calculateDistributorPrice(membership.properties));
            break;
          case config.MEMBERSHIP_TYPE_MANUFACTURER:
            ({ totalPrice: invoiceAmount, lineItems } = calculateManufacturerPrice(membership.properties));
            break;
          case config.MEMBERSHIP_TYPE_SERVICE_PROVIDER:
            ({ totalPrice: invoiceAmount, lineItems } = calculateServiceProviderPrice(membership.properties));
            break;
          default:
            logger.warn(`Unknown membership type: ${membershipType} for membership ID: ${membership.id}. Skipping.`);
            failedInvoices.push({
              companyId: membership.companyId,
              companyName: membership.properties.name,
              membershipId: membership.id,
              reason: `Unknown membership type: ${membershipType}`
            });
            continue;
        }
        logger.info(`Calculated invoice amount for ${membership.properties.name}: $${invoiceAmount}`);

        // 4. Invoice Generation
        // Ensure lineItems are correctly formatted for HubSpot API
        const formattedLineItems = lineItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          // hs_product_id: item.hs_product_id, // If using HubSpot product IDs
          description: item.description,
        }));


        const invoiceData = {
          contactId: primaryContact.id,
          companyMembershipId: membership.id, // Pass membership ID as expected by createInvoice
          invoiceAmount,
          lineItems: formattedLineItems,
          // TODO: Add other necessary invoice properties (due date, etc.) from config or defaults
          currency: config.INVOICE_CURRENCY || 'USD',
          // dueDate: calculateDueDate(), // Example
        };

        logger.info(`Creating invoice for company: ${membership.properties.name}`, { invoiceData });
        const createdInvoice = await createInvoice(hsClient, invoiceData);
        logger.info(`Invoice created for ${membership.properties.name}. Invoice ID: ${createdInvoice.id}`);

        // 5. Data Update (update company's membership dues property)
        await updateCompanyMembershipDues(hsClient, membership.companyId, invoiceAmount);
        logger.info(`Updated membership dues for company ${membership.companyId} to ${invoiceAmount}`);

        // 6. Email Delivery (Handled by HubSpot upon invoice creation/sending - confirm this behavior)
        // If separate email step is needed, implement here.

        processedInvoices.push({
          companyId: membership.companyId,
          companyName: membership.properties.name,
          membershipId: membership.id,
          contactId: primaryContact.id,
          contactName: `${primaryContact.properties.firstname} ${primaryContact.properties.lastname}`,
          invoiceId: createdInvoice.id,
          invoiceAmount,
          membershipType,
        });

      } catch (membershipError) {
        logger.error(`Error processing membership ID ${membership.id} (${membership.properties.name || 'N/A'}):`, membershipError);
        failedInvoices.push({
          companyId: membership.companyId,
          companyName: membership.properties.name || 'N/A',
          membershipId: membership.id,
          reason: membershipError.message
        });
        // Continue to next membership
      }
    }

    // 7. Reporting
    logger.info('Generating and storing report...');
    const reportData = {
      date: new Date().toISOString(),
      totalMembershipsProcessed: companies.length,
      successfulInvoices: processedInvoices.length,
      failedInvoices: failedInvoices.length,
      invoices: processedInvoices,
      failures: failedInvoices,
    };
    const reportUrl = await generateAndStoreReport(reportData);
    logger.info(`Report stored at: ${reportUrl}`);

    if (config.ENABLE_REPORT_EMAIL === 'true') {
      await sendReportEmail(reportUrl, reportData);
      logger.info('Report email sent.');
    }

    logger.info('HubSpot Invoicing process completed successfully.');
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'HubSpot Invoicing process completed.',
        processedInvoices: processedInvoices.length,
        failedInvoices: failedInvoices.length,
        reportUrl,
      }),
    };
  } catch (error) {
    logger.error('Critical error in HubSpot Invoicing Lambda:', error);
    await logError(error); // Log to CloudWatch via logger is already happening
    if (config.ENABLE_ERROR_NOTIFICATIONS === 'true') {
      await sendErrorNotification(error, event, context);
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Critical error in HubSpot Invoicing Lambda.', error: error.message }),
    };
  }
};