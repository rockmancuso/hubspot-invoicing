// Manufacturer Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Parses the dollar amount from a membership level string.
 * Extracts the price that appears before any parentheses.
 * @param {string} membershipLevelString - The membership level string (e.g., "$1,500 (<$5M)")
 * @returns {number} - The parsed price amount
 */
const parseMembershipLevelPrice = (membershipLevelString) => {
  // Extract the part before the first parenthesis (if any)
  const beforeParenthesis = membershipLevelString.split('(')[0].trim();
  
  // Remove dollar sign and commas, then parse as float
  const cleanPrice = beforeParenthesis.replace(/[$,]/g, '');
  const parsedPrice = parseFloat(cleanPrice);
  
  return parsedPrice;
};

/**
 * Maps manufacturer membership level to the corresponding product ID
 * @param {number} price - The membership fee amount
 * @returns {string} - The product ID for the membership level
 */
const getManufacturerProductId = (price) => {
  const productIdMap = {
    1500: '2463329893', // $1,500
    3500: '2463329894', // $3,500
    5000: '2463329895', // $5,000
    7500: '2463312808', // $7,500
    10000: '2463329896', // $10,000
  };
  
  return productIdMap[price] || null;
};

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
    // Log the issue but use a default price instead of throwing an error
    const warningMsg = `Manufacturer membership level property '${membershipLevelProperty}' is missing or empty for company: ${companyProperties.hs_object_id || 'N/A'}. Using default price.`;
    logger.warn(warningMsg);
    
    // Use a default price when the property is missing
    const defaultPrice = config.MANUFACTURER_DEFAULT_FEE || 1500; // Default manufacturer membership fee
    const determinedPrice = defaultPrice;
    const determinedTierDescription = `Default price (membership level property missing)`;

    const lineItems = [
      {
        name: `Manufacturer Membership Fee`,
        quantity: 1,
        price: determinedPrice,
        description: `Default membership fee (membership level property missing).`,
        productId: getManufacturerProductId(determinedPrice), // Will be null for default
        billing_frequency: 'One-Time'
      },
    ];
    
    const calculationDetails = {
      membershipType: 'Manufacturer',
      membershipLevel: 'DEFAULT (missing property)',
      totalPrice: determinedPrice,
    };

    logger.info(`Manufacturer price calculated for company ${companyProperties.hs_object_id || 'N/A'} (using default)`, calculationDetails);

    return {
      totalPrice: determinedPrice,
      lineItems,
      details: calculationDetails,
    };
  }

  // Parse the string value (e.g., "$1,500" or "1500") into a number
  const parsedPrice = parseMembershipLevelPrice(membershipLevelString);

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
      description: membershipLevelString,
      productId: getManufacturerProductId(determinedPrice),
      billing_frequency: 'One-Time'
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