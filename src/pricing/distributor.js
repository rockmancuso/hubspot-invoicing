// Distributor Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the total invoice amount for a Distributor membership.
 *
 * Base fee: from config.DISTRIBUTOR_BASE_FEE
 * Additional charge: from config.DISTRIBUTOR_PER_TERRITORY_FEE per territory
 * Territory counts are read from HubSpot properties defined in config.
 *
 * @param {object} companyProperties - The HubSpot company properties object.
 *                                   Expected to contain properties like those defined in
 *                                   config.HUBSPOT_DISTRIBUTOR_US_STATES_PROPERTY, etc.
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 *           An object containing the total price, line items for the invoice, and calculation details.
 * @throws {Error} If required configuration for property names is missing.
 */
const calculateDistributorPrice = (companyProperties) => {
  const baseFee = config.DISTRIBUTOR_BASE_FEE;
  const perTerritoryCharge = config.DISTRIBUTOR_PER_TERRITORY_FEE;

  const usStatesProperty = config.HUBSPOT_DISTRIBUTOR_US_STATES_PROPERTY;
  const canadianProvincesProperty = config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_PROPERTY;
  const nonNATerritoriesProperty = config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_PROPERTY;

  if (!usStatesProperty || !canadianProvincesProperty || !nonNATerritoriesProperty) {
    const errorMessage = 'Missing configuration for distributor territory properties.';
    logger.error(errorMessage, {
        usStatesProperty, canadianProvincesProperty, nonNATerritoriesProperty
    });
    throw new Error(errorMessage);
  }

  const usStatesCount = parseInt(companyProperties[usStatesProperty], 10) || 0;
  const canadianProvincesCount = parseInt(companyProperties[canadianProvincesProperty], 10) || 0;
  const nonNATerritoriesCount = parseInt(companyProperties[nonNATerritoriesProperty], 10) || 0;

  if (companyProperties[usStatesProperty] === undefined) {
    logger.warn(`Property ${usStatesProperty} is undefined for company. Assuming 0 US states.`, { companyId: companyProperties.hs_object_id });
  }
  if (companyProperties[canadianProvincesProperty] === undefined) {
    logger.warn(`Property ${canadianProvincesProperty} is undefined for company. Assuming 0 Canadian provinces.`, { companyId: companyProperties.hs_object_id });
  }
  if (companyProperties[nonNATerritoriesProperty] === undefined) {
    logger.warn(`Property ${nonNATerritoriesProperty} is undefined for company. Assuming 0 non-NA territories.`, { companyId: companyProperties.hs_object_id });
  }

  const totalTerritories = usStatesCount + canadianProvincesCount + nonNATerritoriesCount;
  const territoriesCharge = totalTerritories * perTerritoryCharge;
  const totalPrice = baseFee + territoriesCharge;

  const lineItems = [
    {
      name: 'Distributor Membership Base Fee',
      quantity: 1,
      price: baseFee,
      description: `Annual base fee for Distributor Membership.`,
      // hs_product_id: config.HUBSPOT_PRODUCT_ID_DISTRIBUTOR_BASE, // If configured
    },
  ];

  if (totalTerritories > 0) {
    lineItems.push({
      name: `Membership Territory Charges`,
      quantity: totalTerritories,
      price: perTerritoryCharge,
      description: `Charge for ${totalTerritories} territories (${usStatesCount} US, ${canadianProvincesCount} CAN, ${nonNATerritoriesCount} Non-NA) at $${perTerritoryCharge} per territory.`,
      // hs_product_id: config.HUBSPOT_PRODUCT_ID_DISTRIBUTOR_TERRITORY, // If configured
    });
  }
  
  const calculationDetails = {
    membershipType: 'Distributor',
    baseFee,
    perTerritoryCharge,
    usStatesCount,
    canadianProvincesCount,
    nonNATerritoriesCount,
    totalTerritories,
    territoriesCharge,
    totalPrice,
  };

  logger.info(`Distributor price calculated for company ${companyProperties.hs_object_id || 'N/A'}`, calculationDetails);

  return {
    totalPrice,
    lineItems,
    details: calculationDetails,
  };
};

module.exports = calculateDistributorPrice;