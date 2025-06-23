// Service Provider Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the total invoice amount for a Service Provider membership.
 * Flat rate is defined in config.SERVICE_PROVIDER_FLAT_FEE.
 *
 * @param {object} companyProperties - The HubSpot company properties object (used for logging).
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 *           An object containing the total price, line item, and calculation details.
 */
const calculateServiceProviderPrice = (companyProperties) => {
  const flatRate = config.SERVICE_PROVIDER_FLAT_FEE;

  if (flatRate === undefined || flatRate === null) {
    const errorMsg = 'Service Provider flat fee is not configured.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const lineItems = [
    {
      name: 'Service Provider Membership Fee',
      quantity: 1,
      price: flatRate,
      description: `Annual flat rate fee for Service Provider Membership.`,
      productId: '2853281631', // $1,250 service provider product ID
      billing_frequency: 'One-Time'
    },
  ];

  const calculationDetails = {
    membershipType: 'Service Provider',
    flatRate,
    totalPrice: flatRate,
  };

  logger.info(`Service Provider price calculated for company ${companyProperties.hs_object_id || 'N/A'}`, calculationDetails);

  return {
    totalPrice: flatRate,
    lineItems,
    details: calculationDetails,
  };
};

module.exports = calculateServiceProviderPrice;