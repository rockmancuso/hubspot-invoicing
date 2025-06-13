// HubSpot Company Data Retrieval
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Fetches companies with memberships expiring at the end of the current month.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of company objects from HubSpot API.
 * @throws {Error} If there's an issue fetching data from HubSpot.
 */
const getCompaniesWithExpiringMemberships = async (hubspotClient) => {
  logger.info('Fetching companies with expiring memberships...');

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // Calculate the last day of the current month
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

  // Format the target renewal date as YYYY-MM-DD for HubSpot date property
  // HubSpot date properties store midnight UTC for the given date.
  // We need to ensure the timestamp we send for EQ matches how HubSpot stores it.
  // Setting hours, minutes, seconds, and ms to 0 ensures we are comparing just the date part.
  lastDayOfMonth.setUTCHours(0, 0, 0, 0);
  const targetRenewalDateTimestamp = lastDayOfMonth.getTime();


  const nextRenewalDateProperty = config.HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY;
  if (!nextRenewalDateProperty) {
    logger.error('HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY is not configured.');
    throw new Error('Configuration for Next Renewal Date property is missing.');
  }

  const propertiesToFetch = [
    'name', // Standard property
    // hs_object_id is included by default in search results as 'id'
    config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY,
    config.HUBSPOT_DISTRIBUTOR_US_STATES_PROPERTY,
    config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_PROPERTY,
    config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_PROPERTY,
    config.HUBSPOT_MANUFACTURER_SALES_VOLUME_PROPERTY,
    // Add any other properties required for pricing or contact association if not covered
    nextRenewalDateProperty,
  ].filter(Boolean); // Filter out undefined if some optional properties are not set

  if (!config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY) {
    logger.warn('HUBSPOT_MEMBERSHIP_TYPE_PROPERTY is not configured. Membership type might be missing.');
  }


  // Accumulate all results if pagination is needed
  let allCompanies = [];
  let after = undefined;
  const limit = 100; // Max limit per request for search API

  try {
    do {
      const filter = {
        propertyName: nextRenewalDateProperty,
        operator: 'EQ',
        value: targetRenewalDateTimestamp, // Use the timestamp for date properties
      };
      const filterGroup = { filters: [filter] };

      const searchRequest = {
        filterGroups: [filterGroup],
        properties: propertiesToFetch,
        limit: limit,
        after: after,
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }], // hs_object_id is 'id' in sorts
      };

      logger.info(`Searching for companies with ${nextRenewalDateProperty} = ${new Date(targetRenewalDateTimestamp).toISOString().split('T')[0]} (Timestamp: ${targetRenewalDateTimestamp})`, { searchRequest });

      // Assuming "Next Renewal Date" is a property on the standard Company object.
      // If "Company Memberships" is a custom object, this API call would need to change to:
      // hubspotClient.crm.objects.searchApi.doSearch('DEAL_OBJECT_TYPE_ID_OR_NAME', searchRequest)
      // For now, using the companies API as per the existing structure.
      const companiesResponse = await hubspotClient.crm.companies.searchApi.doSearch(searchRequest);

      logger.info(`Fetched ${companiesResponse.results.length} companies in this batch.`);
      allCompanies = allCompanies.concat(companiesResponse.results);

      after = companiesResponse.paging?.next?.after;
      if (after) {
        logger.info(`More results available, next 'after' cursor: ${after}`);
      }

    } while (after);

    logger.info(`Total companies found with expiring memberships: ${allCompanies.length}`);
    // The main handler expects company.id and company.properties
    // The search results are already in the format: { id: '...', properties: { ... } }
    return allCompanies;

  } catch (error) {
    logger.error('Error fetching companies from HubSpot:', error.body || error.message || error);
    if (error.body && error.body.message) {
      throw new Error(`HubSpot API Error: ${error.body.message}`);
    }
    throw error; // Re-throw the original error if no specific HubSpot message
  }
};

module.exports = { getCompaniesWithExpiringMemberships };