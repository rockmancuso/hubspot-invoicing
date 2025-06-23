// HubSpot Company Data Retrieval
const config  = require('../config');
const logger  = require('../utils/logger');

/**
 * Fetches company memberships expiring at the end of the current month and
 * enriches them with company data.
 *
 * @async
 * @param {hubspot.Client} hubspotClient The initialized HubSpot client.
 * @returns {Promise<Array<object>>} Array of enriched membership objects.
 */
const getExpiringCompanyMemberships = async (hubspotClient) => {
  logger.info('Fetching company memberships expiring at the end of the current month…');

  // Determine the target (last day of this month, midnight UTC)
  const today              = new Date();
  const lastDayOfMonth     = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  lastDayOfMonth.setUTCHours(0, 0, 0, 0);
  const targetTs = lastDayOfMonth.getTime();

  // Configured renewal-date property
  const nextRenewalDateProperty = config.HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY;
  if (!nextRenewalDateProperty) {
    throw new Error('Configuration for Next Renewal Date property is missing.');
  }

  // Properties we need from the membership object
  const propertiesToFetch = [
    'company_membership_name',
    'company_name',
    'status',
    nextRenewalDateProperty,          // ← variable, not a string literal
    config.HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY,
    config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY,
    config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY,
  ].filter(Boolean);

  const CUSTOM_OBJECT_TYPE_ID = '2-45511388';
  let after;
  const limit = 100;
  const allMemberships = [];

  try {
    do {
      // Search for memberships whose renewal date == last day of month
      const searchRequest = {
        filterGroups: [{
          filters: [{
            propertyName: nextRenewalDateProperty,     // ← variable here too
            operator: 'EQ',
            value: targetTs,
          }],
        }],
        properties: propertiesToFetch,
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
        limit,
        after,
      };

      logger.info(
        `Searching memberships where ${nextRenewalDateProperty} = ${lastDayOfMonth.toISOString().slice(0,10)}`,
        { searchRequest }
      );

      const rsp = await hubspotClient.crm.objects.searchApi.doSearch(
        CUSTOM_OBJECT_TYPE_ID,
        searchRequest,
      );

      allMemberships.push(...rsp.results);
      after = rsp.paging?.next?.after;
    } while (after);

    logger.info(`Total expiring memberships found: ${allMemberships.length}`);

    // Enrich each membership with its associated company data
    const enriched = [];
    for (const membership of allMemberships) {
      try {
        const assocResponse = await hubspotClient.crm.associations.v4.basicApi.getPage(
          CUSTOM_OBJECT_TYPE_ID,
          membership.id,
          '0-2', // "0-2" = Company object type
          undefined, // after
          1 // limit
        );

        const assoc = assocResponse.results;

        if (!assoc?.length) {
          logger.warn(`No company associated with membership ${membership.id}; skipping`);
          continue;
        }

        const companyId = assoc[0].toObjectId;

        const company = await hubspotClient.crm.companies.basicApi.getById(companyId, [
          'name',
          'address',
          'city',
          'state',
          'zip',
          config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY,
          'annual_sales_volume',
        ].filter(Boolean));

        // DEBUG: Log the raw company data retrieved from HubSpot
        logger.info(`Raw company data for ${companyId}:`, {
          name: company.properties.name,
          address: company.properties.address,
          city: company.properties.city,
          state: company.properties.state,
          zip: company.properties.zip,
          membershipType: company.properties[config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY]
        });

        enriched.push({
          id: membership.id,
          companyId,
          properties: {
            company_membership_name:        membership.properties.company_membership_name,
            company_name:                   membership.properties.company_name,
            status:                         membership.properties.status,
            [nextRenewalDateProperty]:      membership.properties[nextRenewalDateProperty],
            name:                           company.properties.name,
            address:                        company.properties.address,
            city:                           company.properties.city,
            state:                          company.properties.state,
            zip:                            company.properties.zip,
            [config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY]:
                                            company.properties[config.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY],
            number_of_territories:          company.properties.number_of_territories,
            annual_sales_volume:            company.properties.annual_sales_volume,
            // Distributor territory properties now come from membership object
            [config.HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY]:
                                            membership.properties[config.HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY],
            [config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY]:
                                            membership.properties[config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY],
            [config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY]:
                                            membership.properties[config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY],
          },
        });

        logger.info(`Enriched membership ${membership.id} with company ${companyId}`);
      } catch (err) {
        logger.error(`Error enriching membership ${membership.id}:`, err.message);
      }
    }

    logger.info(`Successfully enriched ${enriched.length} memberships`);
    return enriched;
  } catch (err) {
    logger.error('Error fetching company memberships:', err.body || err.message || err);
    throw err.body?.message
      ? new Error(`HubSpot API Error: ${err.body.message}`)
      : err;
  }
};

// Alias for backward compatibility
const getCompaniesWithExpiringMemberships = getExpiringCompanyMemberships;

module.exports = {
  getExpiringCompanyMemberships,
  getCompaniesWithExpiringMemberships,
};