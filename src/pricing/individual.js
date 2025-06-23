// Individual Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the total invoice amount for an Individual membership.
 * @param {object} contactProperties - The HubSpot contact properties object.
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 */
const calculateIndividualPrice = (contactProperties) => {
  const flatRate = config.INDIVIDUAL_MEMBERSHIP_FEE || 349;

  const lineItems = [
    {
      name: 'Individual Membership Fee',
      quantity: 1,
      price: flatRate,
      description: `Annual fee for Individual Membership.`,
      productId: '2695542944', // $349 (Membership RENEWAL) product ID
      billing_frequency: 'One-Time'
    },
  ];

  const calculationDetails = {
    membershipType: 'Individual',
    flatRate,
    totalPrice: flatRate,
  };

  logger.info(`Individual price calculated for contact ${contactProperties.hs_object_id || 'N/A'}`, calculationDetails);

  return {
    totalPrice: flatRate,
    lineItems,
    details: calculationDetails,
  };
};

module.exports = calculateIndividualPrice;