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
    logger.info('Fetching companies with expiring memberships...');
    const companies = await getCompaniesWithExpiringMemberships(hsClient);
    logger.info(`Found ${companies.length} companies with expiring memberships.`);

    if (companies.length === 0) {
      logger.info('No companies to process. Exiting.');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No companies with expiring memberships found.' }),
      };
    }

    const processedInvoices = [];
    const failedInvoices = [];

    for (const company of companies) {
      try {
        logger.info(`Processing company: ${company.properties.name} (ID: ${company.id})`);

        // Retrieve primary contact
        const primaryContact = await getPrimaryContact(hsClient, company.id);
        if (!primaryContact) {
          logger.warn(`No primary contact found for company ID: ${company.id}. Skipping invoice generation.`);
          failedInvoices.push({ companyId: company.id, companyName: company.properties.name, reason: 'No primary contact found' });
          continue;
        }
        logger.info(`Primary contact for ${company.properties.name}: ${primaryContact.properties.firstname} ${primaryContact.properties.lastname} (ID: ${primaryContact.id})`);

        // 3. Price Calculation
        let invoiceAmount;
        let lineItems = []; // Define lineItems here to be populated by pricing functions
        const membershipType = company.properties[config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY]; // e.g., 'membership_type'
        logger.info(`Membership type for ${company.properties.name}: ${membershipType}`);

        // TODO: Ensure company object has all necessary properties for pricing functions
        // e.g. company.properties.number_of_territories, company.properties.annual_sales_volume

        switch (membershipType) {
          case config.MEMBERSHIP_TYPE_DISTRIBUTOR:
            ({ totalPrice: invoiceAmount, lineItems } = calculateDistributorPrice(company.properties));
            break;
          case config.MEMBERSHIP_TYPE_MANUFACTURER:
            ({ totalPrice: invoiceAmount, lineItems } = calculateManufacturerPrice(company.properties));
            break;
          case config.MEMBERSHIP_TYPE_SERVICE_PROVIDER:
            ({ totalPrice: invoiceAmount, lineItems } = calculateServiceProviderPrice(company.properties));
            break;
          default:
            logger.warn(`Unknown membership type: ${membershipType} for company ID: ${company.id}. Skipping.`);
            failedInvoices.push({ companyId: company.id, companyName: company.properties.name, reason: `Unknown membership type: ${membershipType}` });
            continue;
        }
        logger.info(`Calculated invoice amount for ${company.properties.name}: $${invoiceAmount}`);

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
          contactId: primaryContact.id, // This might need to be companyId depending on HubSpot API
          companyId: company.id,
          invoiceAmount,
          lineItems: formattedLineItems,
          // TODO: Add other necessary invoice properties (due date, etc.) from config or defaults
          currency: config.INVOICE_CURRENCY || 'USD',
          // dueDate: calculateDueDate(), // Example
        };

        logger.info(`Creating invoice for company: ${company.properties.name}`, { invoiceData });
        const createdInvoice = await createInvoice(hsClient, invoiceData);
        logger.info(`Invoice created for ${company.properties.name}. Invoice ID: ${createdInvoice.id}`);

        // 5. Data Update (update company's membership dues property)
        await updateCompanyMembershipDues(hsClient, company.id, invoiceAmount);
        logger.info(`Updated membership dues for company ${company.id} to ${invoiceAmount}`);

        // 6. Email Delivery (Handled by HubSpot upon invoice creation/sending - confirm this behavior)
        // If separate email step is needed, implement here.

        processedInvoices.push({
          companyId: company.id,
          companyName: company.properties.name,
          contactId: primaryContact.id,
          contactName: `${primaryContact.properties.firstname} ${primaryContact.properties.lastname}`,
          invoiceId: createdInvoice.id,
          invoiceAmount,
          membershipType,
        });

      } catch (companyError) {
        logger.error(`Error processing company ID ${company.id} (${company.properties.name || 'N/A'}):`, companyError);
        failedInvoices.push({ companyId: company.id, companyName: company.properties.name || 'N/A', reason: companyError.message });
        // Continue to next company
      }
    }

    // 7. Reporting
    logger.info('Generating and storing report...');
    const reportData = {
      date: new Date().toISOString(),
      totalCompaniesProcessed: companies.length,
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