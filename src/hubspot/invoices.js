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
 * Validates that required configuration values are present.
 * @throws {Error} If required configuration is missing.
 */
function validateInvoiceConfig() {
  const requiredConfigs = [
    'HUBSPOT_INVOICE_OBJECT_TYPE_ID',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM'
  ];

  const missingConfigs = requiredConfigs.filter(key => !config[key]);
  
  if (missingConfigs.length > 0) {
    throw new Error(`Missing required configuration: ${missingConfigs.join(', ')}`);
  }
}

/**
 * Gets the object type name for V4 associations API.
 * @param {string} objectTypeId - The object type ID from config.
 * @returns {string} The object type name for V4 API.
 */
function getObjectTypeName(objectTypeId) {
  // Map object type IDs to their V4 API names
  const objectTypeMap = {
    'invoice': 'invoice',
    'p_invoice': 'invoice',
    'contacts': 'contact',
    'companies': 'company',
    'line_items': 'line_item',
    'p_line_item': 'line_item'
  };

  // If it's already a known name, return it
  if (objectTypeMap[objectTypeId]) {
    return objectTypeMap[objectTypeId];
  }

  // For numeric IDs, we need to use the object type name
  // Default mappings based on common HubSpot object types
  if (objectTypeId === config.HUBSPOT_INVOICE_OBJECT_TYPE_ID) {
    return 'invoice';
  }
  if (objectTypeId === config.HUBSPOT_LINE_ITEMS_OBJECT_TYPE_ID) {
    return 'line_item';
  }

  // Fallback to the original value if we can't determine
  return objectTypeId;
}

/**
 * Creates an association between two objects using HubSpot V4 API.
 * @param {hubspot.Client} hubspotClient - The HubSpot client.
 * @param {string} fromObjectType - Source object type.
 * @param {string} fromObjectId - Source object ID.
 * @param {string} toObjectType - Target object type.
 * @param {string} toObjectId - Target object ID.
 * @param {number} associationTypeId - Association type ID.
 */
async function createAssociation(hubspotClient, fromObjectType, fromObjectId, toObjectType, toObjectId, associationTypeId) {
  if (!fromObjectId || !toObjectId || !associationTypeId) {
    logger.warn(`Skipping association creation - missing required parameters: fromObjectId=${fromObjectId}, toObjectId=${toObjectId}, associationTypeId=${associationTypeId}`);
    logger.warn(`To fix this, set the required environment variables: HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT and HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY`);
    return;
  }

  const fromTypeName = getObjectTypeName(fromObjectType);
  const toTypeName = getObjectTypeName(toObjectType);

  logger.info(`Creating association: ${fromTypeName}:${fromObjectId} -> ${toTypeName}:${toObjectId} (type: ${associationTypeId})`);

  try {
    // The V4 API expects an array of associations
    const associations = [{
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: parseInt(associationTypeId, 10)
    }];

    // DEBUG LOGGING: Print all relevant values before making the API call
    logger.info('DEBUG: About to create association', {
      fromTypeName,
      fromObjectId,
      toTypeName,
      toObjectId,
      associationTypeId,
      associations,
      typeof_associationTypeId: typeof associationTypeId,
      isNaN: isNaN(parseInt(associationTypeId, 10)),
      env: {
        HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT: process.env.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT,
        HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY: process.env.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY,
        HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM: process.env.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM,
      }
    });

    await hubspotClient.crm.associations.v4.basicApi.create(
      fromTypeName,
      fromObjectId.toString(),
      toTypeName,
      toObjectId.toString(),
      associations
    );
    logger.info(`Successfully created association between ${fromTypeName}:${fromObjectId} and ${toTypeName}:${toObjectId}`);
  } catch (error) {
    logger.error(`Failed to create association between ${fromTypeName}:${fromObjectId} and ${toTypeName}:${toObjectId}:`, error.body || error.message);
    
    // Provide helpful debugging information
    if (error.body && error.body.message) {
      logger.error(`HubSpot API Error Details: ${error.body.message}`);
    }
    
    // Log the exact parameters being sent for debugging
    logger.error(`Association parameters: fromType=${fromTypeName}, fromId=${fromObjectId}, toType=${toTypeName}, toId=${toObjectId}, typeId=${associationTypeId}`);
    
    throw error;
  }
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
      // Use the correct association search structure for v4 API
      filters.push({
        propertyName: "hs_object_id",
        operator: "HAS_PROPERTY",
        associationCategory: "HUBSPOT_DEFINED",
        associationTypeId: config.HUBSPOT_ASSOCIATION_TYPE_ID_CONTACT_TO_INVOICE || 1
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
 * Creates an invoice record in HubSpot following the official API workflow.
 * Step 1: Create draft invoice with minimal properties
 * Step 2: Add associations (contact, line items, company)
 * Step 3: Update properties and move to open status
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

  // Validate configuration before proceeding
  try {
    validateInvoiceConfig();
  } catch (error) {
    logger.error('Configuration validation failed:', error.message);
    throw error;
  }

  try {
    // STEP 1: Create draft invoice with minimal properties
    const draftInvoiceProperties = {
      'hs_currency': config.INVOICE_CURRENCY || 'USD',
      // Add PDF link if we have one
      ...(pdfLink && { [config.HUBSPOT_INVOICE_PDF_LINK_PROPERTY]: pdfLink })
    };

    const createInvoiceRequest = {
      properties: draftInvoiceProperties
    };

    logger.info('Step 1: Creating draft invoice with properties:', draftInvoiceProperties);
    const createdInvoiceResponse = await hubspotClient.crm.objects.basicApi.create(
      config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
      createInvoiceRequest
    );

    const invoiceId = createdInvoiceResponse.id;
    logger.info(`Draft invoice created successfully. Invoice ID: ${invoiceId}`);

    // STEP 2: Add associations using v4 API
    logger.info('Step 2: Adding associations...');

    // Add contact association (required)
    if (contactId) {
      await createAssociation(
        hubspotClient,
        config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
        invoiceId,
        'contacts',
        contactId,
        config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT
      );
    }

    // Add company association (optional)
    if (companyId) {
      await createAssociation(
        hubspotClient,
        config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
        invoiceId,
        'companies',
        companyId,
        config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY
      );
    }

    // Add line items associations
    for (const lineItem of lineItems) {
      if (lineItem.productId) {
        // Create a line item from the product first
        try {
          const lineItemData = {
            properties: {
              hs_product_id: lineItem.productId.toString(),
              quantity: lineItem.quantity.toString(),
              price: lineItem.price.toString(),
              name: lineItem.name || '',
              description: lineItem.description || '',
              billing_frequency: 'One-Time'
            }
          };

          logger.info(`Creating line item from product ${lineItem.productId}...`);
          const createdLineItem = await hubspotClient.crm.lineItems.basicApi.create(lineItemData);
          const lineItemId = createdLineItem.id;
          logger.info(`Line item ${lineItemId} created successfully from product ${lineItem.productId}`);

          // Now associate the line item with the invoice
          await createAssociation(
            hubspotClient,
            config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
            invoiceId,
            'line_items',
            lineItemId,
            config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM
          );
          logger.info(`Successfully associated line item ${lineItemId} with invoice ${invoiceId}`);
        } catch (error) {
          // If the product doesn't exist, log a warning but don't fail the invoice creation
          if (error.body && error.body.message && error.body.message.includes('not found')) {
            logger.warn(`Product ${lineItem.productId} does not exist in HubSpot. Skipping line item creation. Error: ${error.body.message}`);
            logger.warn(`Consider creating the product in HubSpot or using a different product ID.`);
          } else {
            // For other errors, re-throw to maintain existing behavior
            logger.error(`Error creating line item from product ${lineItem.productId}:`, error.body || error.message);
            throw error;
          }
        }
      } else {
        // Create custom line item for state addons (Distributor territories)
        const customLineItemData = {
          properties: {
            name: lineItem.name,
            quantity: lineItem.quantity.toString(),
            price: lineItem.price.toString(),
            hs_product_id: null, // Custom line item, no product ID
            description: lineItem.description || '',
            billing_frequency: 'One-Time'
          }
        };

        const customLineItem = await hubspotClient.crm.lineItems.basicApi.create(customLineItemData);

        // Associate the custom line item
        await createAssociation(
          hubspotClient,
          config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
          invoiceId,
          'line_items',
          customLineItem.id,
          config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM
        );
        logger.info(`Custom line item ${customLineItem.id} created and associated with invoice ${invoiceId}`);
      }
    }

    // STEP 3: Update invoice properties and move to open status
    logger.info('Step 3: Updating invoice properties and setting status to open...');
    
    // Validate that we have the required associations for setting status to "open"
    // HubSpot requires: one contact and at least one line item must be associated
    if (!contactId) {
      throw new Error('Cannot set invoice status to "open" - contact association is required');
    }
    
    if (!lineItems || lineItems.length === 0) {
      throw new Error('Cannot set invoice status to "open" - at least one line item association is required');
    }
    
    const updateProperties = {
      'hs_due_date': calculateDueDate(),
      'hs_invoice_status': 'open', // Set status to open as per HubSpot API guidance
      // Add any other properties that need to be set after associations
    };

    await hubspotClient.crm.objects.basicApi.update(
      config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
      invoiceId,
      { properties: updateProperties }
    );

    logger.info(`Invoice ${invoiceId} updated with properties:`, updateProperties);
    logger.info(`Invoice status set to "open" - invoice is now payable and can be shared`);
    logger.info(`Invoice record created successfully. Invoice ID: ${invoiceId}`);
    
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

/**
 * Fetches the HubSpot invoice payment link after the invoice has been created.
 * 
 * @async
 * @param {hubspot.Client} hubspotClient - The initialized HubSpot client.
 * @param {string} invoiceId - The ID of the created invoice.
 * @returns {Promise<string|null>} A promise that resolves to the invoice payment link or null if not found.
 */
const getInvoicePaymentLink = async (hubspotClient, invoiceId) => {
  if (!invoiceId) {
    logger.warn('getInvoicePaymentLink called without invoiceId');
    return null;
  }

  logger.info(`Fetching payment link for invoice ID: ${invoiceId}`);
  
  try {
    const invoiceResponse = await hubspotClient.crm.objects.basicApi.getById(
      config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
      invoiceId,
      ['hs_invoice_link']
    );
    
    const paymentLink = invoiceResponse.properties.hs_invoice_link;
    
    if (paymentLink) {
      logger.info(`Retrieved payment link for invoice ${invoiceId}: ${paymentLink}`);
      return paymentLink;
    } else {
      logger.warn(`No payment link found for invoice ${invoiceId}`);
      return null;
    }
    
  } catch (error) {
    logger.error(`Error fetching payment link for invoice ${invoiceId}:`, error.body || error.message);
    return null;
  }
};

module.exports = { createInvoice, findExistingOpenInvoice, updateCompanyMembershipDues, getInvoicePaymentLink };