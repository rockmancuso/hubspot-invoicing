// HubSpot Company Data Retrieval
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Fetches company memberships expiring at the end of the current month and enriches them with company data.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of enriched membership objects with company properties.
 * @throws {Error} If there's an issue fetching data from HubSpot.
 */
const getExpiringCompanyMemberships = async (hubspotClient) => {
  logger.info('Fetching company memberships expiring at the end of the current month...');

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
    'company_membership_name',
    'company_name',
    'status',
    nextRenewalDateProperty,
  ].filter(Boolean);


  const CUSTOM_OBJECT_TYPE_ID = "2-45511388";
  // Accumulate all results if pagination is needed
  let allMemberships = [];
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

      logger.info(`Searching for company memberships with ${nextRenewalDateProperty} = ${new Date(targetRenewalDateTimestamp).toISOString().split('T')[0]} (Timestamp: ${targetRenewalDateTimestamp})`, { searchRequest });

      const membershipsResponse = await hubspotClient.crm.objects.searchApi.doSearch(CUSTOM_OBJECT_TYPE_ID, searchRequest);

      logger.info(`Fetched ${membershipsResponse.results.length} memberships in this batch.`);
      allMemberships = allMemberships.concat(membershipsResponse.results);

      after = membershipsResponse.paging?.next?.after;
      if (after) {
        logger.info(`More results available, next 'after' cursor: ${after}`);
      }

    } while (after);

    logger.info(`Total company memberships found with expiring memberships: ${allMemberships.length}`);
    
    // Enrich memberships with associated company data
    const enrichedMemberships = [];
    
    for (const membership of allMemberships) {
      try {
        // Get associated company ID
        const associations = await hubspotClient.crm.objects.associationsApi.getAll(
          '2-45511388', // fromObjectTypeId for company_memberships
          membership.id,
          '0-2' // toObjectTypeId for Company
        );

        if (associations.results && associations.results.length > 0) {
          const companyId = associations.results[0].id;
          
          // Fetch company data
          const company = await hubspotClient.crm.companies.basicApi.getById(
            companyId,
            [
              'name',
              config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY,
              'number_of_territories',
              'annual_sales_volume',
              // Add other properties needed for pricing calculations
            ].filter(Boolean)
          );

          // Create enriched object with both membership and company data
          const enrichedMembership = {
            id: membership.id, // Keep membership ID for invoice creation
            companyId: companyId, // Add company ID for reference
            properties: {
              // Membership properties
              company_membership_name: membership.properties.company_membership_name,
              company_name: membership.properties.company_name,
              status: membership.properties.status,
              [config.HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY]: membership.properties[config.HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY],
              // Company properties for pricing calculations
              name: company.properties.name,
              [config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY]: company.properties[config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY],
              number_of_territories: company.properties.number_of_territories,
              annual_sales_volume: company.properties.annual_sales_volume,
            }
          };

          enrichedMemberships.push(enrichedMembership);
          logger.info(`Enriched membership ${membership.id} with company data from ${companyId}`);
        } else {
          logger.warn(`No associated company found for membership ${membership.id}. Skipping.`);
        }
      } catch (error) {
        logger.error(`Error enriching membership ${membership.id}:`, error.message);
        // Continue with other memberships
      }
    }

    logger.info(`Successfully enriched ${enrichedMemberships.length} out of ${allMemberships.length} memberships`);
    return enrichedMemberships;

  } catch (error) {
    logger.error('Error fetching company memberships from HubSpot:', error.body || error.message || error);
    if (error.body && error.body.message) {
      throw new Error(`HubSpot API Error: ${error.body.message}`);
    }
    throw error; // Re-throw the original error if no specific HubSpot message
  }
};

// Export both function names for compatibility
const getCompaniesWithExpiringMemberships = getExpiringCompanyMemberships;

module.exports = {
  getExpiringCompanyMemberships,
  getCompaniesWithExpiringMemberships
};