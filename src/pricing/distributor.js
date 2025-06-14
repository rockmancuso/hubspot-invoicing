// Distributor Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the total invoice amount for a Distributor membership by counting
 * items from multi-checkbox properties.
 *
 * @param {object} companyProperties - The HubSpot company properties object.
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 */
const calculateDistributorPrice = (companyProperties) => {
  const baseFee = config.DISTRIBUTOR_BASE_FEE || 929;
  const perTerritoryCharge = config.DISTRIBUTOR_PER_TERRITORY_FEE || 70;

  // Get the property names from config
  const usStatesProperty = config.HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY;
  const canadianProvincesProperty = config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY;
  const nonNATerritoriesProperty = config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY;

  // Get the string values from the company properties (e.g., "CA;NV;AZ")
  const usStatesString = companyProperties[usStatesProperty] || '';
  const canadianProvincesString = companyProperties[canadianProvincesProperty] || '';
  const nonNATerritoriesString = companyProperties[nonNATerritoriesProperty] || '';

  // --- THIS IS THE NEW LOGIC ---
  // Count the number of selected items by splitting the string by the semicolon delimiter.
  // If the string is empty, this safely results in a count of 0.
  const usStatesCount = usStatesString ? usStatesString.split(';').length : 0;
  const canadianProvincesCount = canadianProvincesString ? canadianProvincesString.split(';').length : 0;
  const nonNATerritoriesCount = nonNATerritoriesString ? nonNATerritoriesString.split(';').length : 0;

  // The rest of the math remains identical
  const totalTerritories = usStatesCount + canadianProvincesCount + nonNATerritoriesCount;
  const additionalTerritories = Math.max(0, totalTerritories - 1);
  const territoriesCharge = additionalTerritories * perTerritoryCharge;
  const totalPrice = baseFee + territoriesCharge;

  const lineItems = [
    {
      name: 'Distributor Membership Base Fee',
      quantity: 1,
      price: baseFee,
      description: 'Annual base fee for Distributor Membership (includes 1st territory).',
    },
  ];

  if (additionalTerritories > 0) {
    lineItems.push({
      name: `Additional Membership Territory Charges`,
      quantity: additionalTerritories,
      price: perTerritoryCharge,
      // The description can be enhanced later in index.js to list the states
      description: `Charge for ${additionalTerritories} additional territories.`, 
    });
  }
  
  const calculationDetails = {
    membershipType: 'Distributor',
    totalPrice,
    // You can add more details here for reporting if needed
  };

  logger.info(`Distributor price calculated for company ${companyProperties.name}`, calculationDetails);

  return {
    totalPrice,
    lineItems,
    details: calculationDetails,
  };
};

module.exports = calculateDistributorPrice; 