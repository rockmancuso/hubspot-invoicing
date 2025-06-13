// Manufacturer Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the total invoice amount for a Manufacturer membership.
 * The fee is directly read from a HubSpot company property specified in
 * config.HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY.
 * This property is expected to store the dues amount as a string (e.g., "$1,500", "3500").
 *
 * @param {object} companyProperties - The HubSpot company properties object.
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 *           An object containing the total price, line item, and the determined dues.
 * @throws {Error} If the membership level property configuration is missing,
 *                 or if the property value is invalid, not found, or cannot be parsed to a number.
 */
const calculateManufacturerPrice = (companyProperties) => {
  const membershipLevelProperty = config.HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY;

  if (!membershipLevelProperty) {
    const errorMsg = 'Configuration for manufacturer membership level property is missing.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const membershipLevelString = companyProperties[membershipLevelProperty];

  if (membershipLevelString === undefined || membershipLevelString === null || String(membershipLevelString).trim() === '') {
    const errorMsg = `Manufacturer membership level property '${membershipLevelProperty}' is missing or empty for company: ${companyProperties.hs_object_id || 'N/A'}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Parse the string value (e.g., "$1,500" or "1500") into a number
  const parsedPrice = parseFloat(String(membershipLevelString).replace(/[^0-9.-]+/g, ""));

  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    const errorMsg = `Manufacturer membership level property '${membershipLevelProperty}' ('${membershipLevelString}') does not contain a valid positive price for company: ${companyProperties.hs_object_id || 'N/A'}`;
    logger.error(errorMsg);
    throw new Error(`Invalid membership level price: '${membershipLevelString}'.`);
  }

  const determinedPrice = parsedPrice;
  const determinedTierDescription = `Based on membership level: ${membershipLevelString}`;

  const lineItems = [
    {
      name: `Manufacturer Membership Fee`,
      quantity: 1,
      price: determinedPrice,
      description: `Membership fee based on level: ${membershipLevelString}.`,
    },
  ];
  
  const calculationDetails = {
    membershipType: 'Manufacturer',
    membershipLevel: membershipLevelString,
    totalPrice: determinedPrice,
  };

  logger.info(`Manufacturer price calculated for company ${companyProperties.hs_object_id || 'N/A'}`, calculationDetails);

  return {
    totalPrice: determinedPrice,
    lineItems,
    details: calculationDetails,
  };
};

module.exports = calculateManufacturerPrice;