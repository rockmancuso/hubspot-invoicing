// HubSpot Contact Data Operations
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Fetches the primary contact for a given company.
 * It prioritizes contacts with a specific association type if configured,
 * otherwise defaults to the first associated contact.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @param {string} companyId The ID of the HubSpot company.
 * @returns {Promise<object|null>} A promise that resolves to the primary contact object (HubSpot API contact object) or null if not found.
 * @throws {Error} If there's an issue fetching data from HubSpot.
 */
const getPrimaryContact = async (hubspotClient, companyId) => {
  logger.info(`Fetching primary contact for company ID: ${companyId}`);

  try {
    // Define the contact object type for association. In HubSpot API v3, this is typically 'contact'.
    const toObjectType = 'contact';
    let primaryContactId = null;

    // Fetch associations from Company to Contact
    // The AssociationsApi.getAll method in v3 SDK takes companyId and toObjectType.
    // It returns a list of Association objects, each having an 'id' (of the associated object) and 'type' (of the association).
    const associationsResponse = await hubspotClient.crm.companies.associationsApi.getAll(
      companyId,
      toObjectType
    );

    if (!associationsResponse.results || associationsResponse.results.length === 0) {
      logger.warn(`No contacts found associated with company ID: ${companyId}`);
      return null;
    }

    // Check if a specific primary contact association type ID is configured
    const primaryContactAssociationTypeId = config.HUBSPOT_PRIMARY_CONTACT_ASSOCIATION_TYPE_ID;

    if (primaryContactAssociationTypeId) {
      logger.info(`Looking for primary contact with association type ID: ${primaryContactAssociationTypeId}`);
      // The association object has `associationTypes` which is an array of { type, category }
      // We need to find an association where one of the associationTypes matches our configured ID.
      // The `type` in `associationTypes` is the actual ID (e.g., "2" for company_to_contact).
      // The `type` on the top-level association result item is the `toObjectType` (e.g. "contact")
      const primaryAssociation = associationsResponse.results.find(assoc =>
        assoc.associationTypes.some(at => at.type === primaryContactAssociationTypeId && at.category === 'HUBSPOT_DEFINED') // Or USER_DEFINED
      );

      if (primaryAssociation) {
        primaryContactId = primaryAssociation.toObjectId; // Corrected: use toObjectId
        logger.info(`Found primary contact via specific association type. Contact ID: ${primaryContactId}`);
      } else {
        logger.warn(`Primary contact association type ID ${primaryContactAssociationTypeId} not found for company ${companyId}. Falling back to first associated contact.`);
      }
    }

    // If no specific association type ID or if not found, take the first associated contact
    if (!primaryContactId && associationsResponse.results.length > 0) {
      primaryContactId = associationsResponse.results[0].toObjectId; // Corrected: use toObjectId
      logger.info(`Using first associated contact as primary. Contact ID: ${primaryContactId}`);
    }

    if (!primaryContactId) {
      logger.warn(`Could not determine a primary contact ID for company: ${companyId}`);
      return null;
    }

    // Now fetch the contact details
    const contactPropertiesToFetch = (config.HUBSPOT_CONTACT_PROPERTIES_TO_FETCH || 'email,firstname,lastname').split(',');
    logger.info(`Fetching details for contact ID: ${primaryContactId}`, { properties: contactPropertiesToFetch });

    const contact = await hubspotClient.crm.contacts.basicApi.getById(primaryContactId, contactPropertiesToFetch);

    logger.info(`Primary contact found for company ${companyId}: ${contact.properties.email || contact.id}`);
    // Return the full contact object as it might be useful for the caller
    return contact;

  } catch (error) {
    logger.error(`Error fetching primary contact for company ${companyId}:`, error.body || error.message || error);
    if (error.body && error.body.message) {
      throw new Error(`HubSpot API Error (getPrimaryContact): ${error.body.message}`);
    }
    throw error;
  }
};

module.exports = { getPrimaryContact };