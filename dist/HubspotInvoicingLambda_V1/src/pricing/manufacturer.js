// Manufacturer Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Calculates the total invoice amount for a Manufacturer membership based on sales volume tiers.
 * Pricing tiers are defined in config.MANUFACTURER_PRICING_TIERS.
 * Sales volume is read from a HubSpot property defined in config.HUBSPOT_MANUFACTURER_SALES_VOLUME_PROPERTY.
 *
 * @param {object} companyProperties - The HubSpot company properties object.
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 *           An object containing the total price, line item, and the determined sales tier details.
 * @throws {Error} If sales volume property configuration is missing, or if sales volume is invalid or not found.
 */
const calculateManufacturerPrice = (companyProperties) => {
  const salesVolumeProperty = config.HUBSPOT_MANUFACTURER_SALES_VOLUME_PROPERTY;
  const pricingTiers = config.MANUFACTURER_PRICING_TIERS;

  if (!salesVolumeProperty) {
    const errorMsg = 'Configuration for manufacturer sales volume property is missing.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (!pricingTiers || !Array.isArray(pricingTiers) || pricingTiers.length === 0) {
    const errorMsg = 'Manufacturer pricing tiers are not configured or invalid.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const salesVolumeString = companyProperties[salesVolumeProperty];

  if (salesVolumeString === undefined || salesVolumeString === null || String(salesVolumeString).trim() === '') {
    const errorMsg = `Sales volume property '${salesVolumeProperty}' is missing or empty for company: ${companyProperties.hs_object_id || 'N/A'}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const salesVolume = parseFloat(salesVolumeString);

  if (isNaN(salesVolume)) {
    const errorMsg = `Sales volume property '${salesVolumeProperty}' ('${salesVolumeString}') is not a valid number for company: ${companyProperties.hs_object_id || 'N/A'}`;
    logger.error(errorMsg);
    throw new Error(`Sales volume '${salesVolumeString}' is not a valid number.`);
  }

  let determinedPrice;
  let determinedTierDescription = 'N/A';

  // Sort tiers by maxSales to ensure correct matching
  const sortedTiers = [...pricingTiers].sort((a, b) => a.maxSales - b.maxSales);

  for (const tier of sortedTiers) {
    if (salesVolume <= tier.maxSales) {
      determinedPrice = tier.fee;
      // Construct a more descriptive tier name if not provided in config
      determinedTierDescription = tier.description || `Sales up to $${tier.maxSales.toLocaleString()}`;
      if (tier.minSales) { // Assuming tiers might have minSales for more clarity
        determinedTierDescription = tier.description || `Sales from $${tier.minSales.toLocaleString()} to $${tier.maxSales.toLocaleString()}`;
      }
      if (tier.maxSales === Infinity) {
         determinedTierDescription = tier.description || `Sales over $${sortedTiers[sortedTiers.length-2].maxSales.toLocaleString()}`;
      }
      break;
    }
  }

  if (determinedPrice === undefined) {
    // This case should ideally be caught by the last tier having maxSales: Infinity
    const errorMsg = `Could not determine pricing tier for sales volume: $${salesVolume.toLocaleString()} for company ${companyProperties.hs_object_id || 'N/A'}. Check pricing tier configuration.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const lineItems = [
    {
      name: `Manufacturer Membership Fee`,
      quantity: 1,
      price: determinedPrice,
      description: `Membership fee based on sales volume tier: ${determinedTierDescription}. Reported Sales Volume: $${salesVolume.toLocaleString()}`,
      // hs_product_id: `config.HUBSPOT_PRODUCT_ID_MANUFACTURER_TIER_${determinedPrice}` // If configured
    },
  ];
  
  const calculationDetails = {
    membershipType: 'Manufacturer',
    salesVolume,
    tierDescription: determinedTierDescription,
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