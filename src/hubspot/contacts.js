// HubSpot Contact Data Operations
const config = require('../config');
const logger = require('../utils/logger');
const { calculateTargetDate } = require('./invoices');

/**
 * Fetches the primary contact for a given company.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @param {string} companyId The ID of the HubSpot company.
 * @returns {Promise<object|null>} The primary contact object, or null if not found.
 */
const getPrimaryContact = async (hubspotClient, companyId) => {
  logger.info(`Fetching primary contact for company ID: ${companyId}`);

  try {
    const toObjectType = 'contact';
    let primaryContactId = null;

    const associationsResponse = await hubspotClient.crm.associations.v4.basicApi.getPage(
      'companies',      // fromObjectType
      companyId,        // fromObjectId
      'contacts',       // toObjectType
      undefined,        // after (pagination)
      100               // limit (adjust as needed)
    );

    if (!associationsResponse.results?.length) {
      logger.warn(`No contacts found associated with company ID: ${companyId}`);
      return null;
    }

    // If a specific "primary contact" association type is configured, try that first
    const primaryContactAssociationTypeId = config.HUBSPOT_PRIMARY_CONTACT_ASSOCIATION_TYPE_ID;
    if (primaryContactAssociationTypeId) {
      const primaryAssoc = associationsResponse.results.find((assoc) =>
        assoc.associationTypes.some(
          (at) =>
            at.type === primaryContactAssociationTypeId &&
            at.category === 'HUBSPOT_DEFINED' // or 'USER_DEFINED' depending on setup
        )
      );
      if (primaryAssoc) {
        primaryContactId = primaryAssoc.toObjectId;
      }
    }

    // Fallback: just grab the first associated contact
    if (!primaryContactId) {
      primaryContactId = associationsResponse.results[0].toObjectId;
    }

    if (!primaryContactId) {
      logger.warn(`Could not determine a primary contact ID for company: ${companyId}`);
      return null;
    }

    const contactProps = (
      config.HUBSPOT_CONTACT_PROPERTIES_TO_FETCH ||
      'email,firstname,lastname,address,city,state,zip'
    ).split(',');

    const contact = await hubspotClient.crm.contacts.basicApi.getById(
      primaryContactId,
      contactProps
    );

    logger.info(`Primary contact found for company ${companyId}: ${contact.properties.email || contact.id}`);
    return contact;
  } catch (error) {
    logger.error(
      `Error fetching primary contact for company ${companyId}:`,
      error.body || error.message || error
    );
    throw error.body?.message
      ? new Error(`HubSpot API Error (getPrimaryContact): ${error.body.message}`)
      : error;
  }
};

/**
 * Fetches individual members whose memberships expire at the configured target date.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @returns {Promise<Array<object>>} Array of contact objects.
 */
const getExpiringIndividualMemberships = async (hubspotClient) => {
  logger.info('Fetching individual members with expiring memberships…');

  const paidThroughProp = config.HUBSPOT_INDIVIDUAL_PAID_THROUGH_DATE_PROPERTY;
  if (!paidThroughProp) {
    throw new Error('Configuration for Individual Paid Through Date property is missing.');
  }

  // Use the new target date calculation instead of hardcoding last day of current month
  const targetDateTimestamp = calculateTargetDate();

  const propertiesToFetch = [
    'firstname',
    'lastname',
    'email',
    'address',
    'city',
    'state',
    'zip',
    paidThroughProp,
  ].filter(Boolean);

  const limit = 100;
  let after;
  const contacts = [];

  try {
    do {
      const searchRequest = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: paidThroughProp,
                operator: 'EQ',
                value: targetDateTimestamp,
              },
            ],
          },
        ],
        properties: propertiesToFetch,
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
        limit,
        after,
      };

      const response = await hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
      contacts.push(...response.results);
      after = response.paging?.next?.after;
    } while (after);

    logger.info(`Found ${contacts.length} individual memberships expiring this month.`);
    return contacts;
  } catch (error) {
    logger.error('Error fetching expiring individual members from HubSpot:', error.body || error.message);
    throw error;
  }
};

module.exports = {
  getPrimaryContact,
  getExpiringIndividualMemberships,
};