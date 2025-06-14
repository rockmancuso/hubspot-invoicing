// HubSpot Invoice Generation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the due date for an invoice.
 * @returns {string} ISO formatted date string (YYYY-MM-DD).
 */
function calculateDueDate() {
  const dueDays = parseInt(config.INVOICE_DUE_DAYS, 10) || 30;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);
  return dueDate.toISOString().split('T')[0];
}

/**
 * Checks if an open (unpaid and not voided) invoice already exists for a contact or company.
 *
 * @async
 * @param {hubspot.Client} hubspotClient - The initialized HubSpot client.
 * @param {object} params
 * @param {string} [params.companyId] - The ID of the associated company.
 * @param {string} [params.contactId] - The ID of the associated contact.
 * @returns {Promise<object|null>} A promise that resolves to the first found open invoice object, or null if none are found.
 */
const findExistingOpenInvoice = async (hubspotClient, { companyId, contactId }) => {
  if (!companyId && !contactId) {
    logger.warn('findExistingOpenInvoice called without companyId or contactId. Cannot check.');
    return null;
  }

  logger.info(`Checking for existing open invoices for companyId: ${companyId}, contactId: ${contactId}`);
  const INVOICE_OBJECT_TYPE_ID = config.HUBSPOT_INVOICE_OBJECT_TYPE_ID;
  const INVOICE_STATUS_PROPERTY = config.HUBSPOT_INVOICE_STATUS_PROPERTY || 'hs_status';

  // Define statuses that mean an invoice is "open" and should not be duplicated.
  // This might include 'SENT', 'DRAFT', 'PROCESSING', etc.
  const openStatuses = ['SENT', 'DRAFT', 'PROCESSING', 'OVERDUE'];

  try {
    const filters = [];
    if (contactId) {
      // Create a filter to find invoices associated with the given contact.
      // This requires knowing the association type from Contact to Invoice.
      filters.push({
        associationCategory: "HUBSPOT_DEFINED",
        associationTypeId: config.HUBSPOT_ASSOCIATION_TYPE_ID_CONTACT_TO_INVOICE, // You must configure this ID
        operator: "HAS_PROPERTY",
        propertyName: "hs_object_id" // Check for existence of an associated contact
      });
    }

    // Add a filter for invoice status
    filters.push({
      propertyName: INVOICE_STATUS_PROPERTY,
      operator: 'IN',
      values: openStatuses
    });

    const searchRequest = {
      filterGroups: [{ filters }],
      properties: ['hs_object_id', INVOICE_STATUS_PROPERTY],
      limit: 1, // We only need to know if at least one exists
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }]
    };

    const searchResults = await hubspotClient.crm.objects.searchApi.doSearch(INVOICE_OBJECT_TYPE_ID, searchRequest);

    if (searchResults.results.length > 0) {
      const existingInvoice = searchResults.results[0];
      logger.info(`Found existing open invoice ${existingInvoice.id} for contact ${contactId}.`);
      return existingInvoice;
    }

    logger.info(`No existing open invoices found for contact ${contactId}.`);
    return null;
  } catch (error) {
    logger.error(`Error searching for existing invoices:`, error.body || error.message);
    // In case of error, we default to assuming no invoice exists to avoid blocking, but log it.
    return null;
  }
};


/**
 * Creates an invoice record in HubSpot. This function is now generic and works for both
 * company and individual memberships.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @param {object} invoiceData - Data for creating the invoice.
 * @param {string} invoiceData.contactId - ID of the billing contact.
 * @param {string} [invoiceData.companyId] - ID of the associated company (if applicable).
 * @param {number} invoiceData.invoiceAmount - The total amount for the invoice.
 * @param {Array<object>} invoiceData.lineItems - Line items for the invoice.
 * @param {string} invoiceData.pdfLink - The public URL to the generated PDF invoice in S3.
 * @returns {Promise<object>} A promise that resolves to the created HubSpot invoice object.
 */
const createInvoice = async (hubspotClient, invoiceData) => {
  const { contactId, companyId, invoiceAmount, lineItems, pdfLink } = invoiceData;

  logger.info(`Creating HubSpot invoice record for Company ID: ${companyId}, Contact ID: ${contactId}, Amount: ${invoiceAmount}`);

  if (!config.HUBSPOT_INVOICE_OBJECT_TYPE_ID) {
    throw new Error('Configuration for Invoice Object Type ID is missing.');
  }

  try {
    const invoiceProperties = {
      [config.HUBSPOT_INVOICE_AMOUNT_PROPERTY || 'hs_invoice_amount']: invoiceAmount.toString(),
      [config.HUBSPOT_INVOICE_DUE_DATE_PROPERTY || 'hs_due_date']: calculateDueDate(),
      [config.HUBSPOT_INVOICE_BILLING_CONTACT_ID_PROPERTY || 'hs_billing_contact_id']: contactId,
      [config.HUBSPOT_INVOICE_STATUS_PROPERTY || 'hs_status']: config.HUBSPOT_INVOICE_DEFAULT_STATUS || 'DRAFT',
      [config.HUBSPOT_INVOICE_LINE_ITEMS_PROPERTY || 'hs_line_items']: JSON.stringify(lineItems),
      // NEW: Add the link to the printable PDF generated by our Lambda
      [config.HUBSPOT_INVOICE_PDF_LINK_PROPERTY]: pdfLink,
    };

    const associations = [];
    if (companyId && config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY) {
      associations.push({
        to: { id: companyId },
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: parseInt(config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY, 10)
        }]
      });
    }
    if (contactId && config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT) {
      associations.push({
        to: { id: contactId },
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: parseInt(config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT, 10)
        }]
      });
    }

    const createInvoiceRequest = {
      properties: invoiceProperties,
      associations: associations,
    };

    logger.info('Sending create invoice request to HubSpot:', { request: createInvoiceRequest });
    const createdInvoiceResponse = await hubspotClient.crm.objects.basicApi.create(
      config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
      createInvoiceRequest
    );
    logger.info(`Invoice record created successfully. Invoice ID: ${createdInvoiceResponse.id}`);
    return createdInvoiceResponse;

  } catch (error) {
    logger.error('Error creating HubSpot invoice:', error.body || error.message || error);
    if (error.body && error.body.message) {
      throw new Error(`HubSpot API Error (createInvoice): ${error.body.message}`);
    }
    throw error;
  }
};

/**
 * Updates the company's membership dues property in HubSpot.
 * (This function remains unchanged, as it's specific to companies).
 */
const updateCompanyMembershipDues = async (hubspotClient, companyId, amount) => {
    // ... Function body remains the same as your original ...
    const duesProperty = config.HUBSPOT_COMPANY_MEMBERSHIP_DUES_PROPERTY;
    if (!duesProperty) {
      logger.warn('HUBSPOT_COMPANY_MEMBERSHIP_DUES_PROPERTY is not configured. Cannot update company dues.');
      return;
    }
    try {
        const companyUpdatePayload = { properties: { [duesProperty]: amount.toString() } };
        await hubspotClient.crm.companies.basicApi.update(companyId, companyUpdatePayload);
        logger.info(`Company ${companyId} updated successfully with new membership dues.`);
    } catch (error) {
        logger.error(`Error updating membership dues for company ${companyId}:`, error.body || error.message);
    }
};

module.exports = { createInvoice, findExistingOpenInvoice, updateCompanyMembershipDues };