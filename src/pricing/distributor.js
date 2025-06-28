// Distributor Membership Pricing Calculation
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Normalizes state names to handle variations in how states might be stored
 * (e.g., "West Virginia" vs "WV", "California" vs "CA")
 * @param {string} stateName - The state name to normalize
 * @returns {string} - The normalized state abbreviation
 */
const normalizeStateName = (stateName) => {
  if (!stateName) return '';
  
  const stateNameUpper = stateName.trim().toUpperCase();
  
  // State name to abbreviation mapping
  const stateMap = {
    'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
    'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
    'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
    'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
    'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
    'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
    'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
    'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
    // Canadian provinces
    'ALBERTA': 'AB', 'BRITISH COLUMBIA': 'BC', 'MANITOBA': 'MB', 'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND AND LABRADOR': 'NL', 'NORTHWEST TERRITORIES': 'NT', 'NOVA SCOTIA': 'NS',
    'NUNAVUT': 'NU', 'ONTARIO': 'ON', 'PRINCE EDWARD ISLAND': 'PE', 'QUEBEC': 'QC',
    'SASKATCHEWAN': 'SK', 'YUKON': 'YT'
  };
  
  // If it's already a 2-letter code, return it
  if (stateNameUpper.length === 2 && stateMap[stateNameUpper]) {
    return stateNameUpper;
  }
  
  // Try to find the abbreviation
  return stateMap[stateNameUpper] || stateNameUpper;
};

/**
 * Counts territories excluding the home state
 * @param {string} territoryString - Semicolon-delimited territory string
 * @param {string} homeState - The home state to exclude
 * @returns {number} - Count of territories excluding home state
 */
const countTerritoriesExcludingHomeState = (territoryString, homeState) => {
  if (!territoryString) return 0;
  
  const territories = territoryString.split(';').filter(Boolean);
  const normalizedHomeState = normalizeStateName(homeState);
  
  if (!normalizedHomeState) {
    logger.warn(`Could not normalize home state: "${homeState}"`);
    return territories.length;
  }
  
  const filteredTerritories = territories.filter(territory => {
    const normalizedTerritory = normalizeStateName(territory);
    const isHomeState = normalizedTerritory === normalizedHomeState;
    
    if (isHomeState) {
      logger.info(`Excluding home state "${territory}" (${normalizedTerritory}) from billing for company based in ${homeState} (${normalizedHomeState})`);
    }
    
    return !isHomeState;
  });
  
  return filteredTerritories.length;
};

/**
 * Calculates the total invoice amount for a Distributor membership by counting
 * items from multi-checkbox properties on the Company Membership object.
 * Excludes the distributor's home state from billing calculations.
 *
 * @param {object} membershipProperties - The HubSpot company membership properties object.
 * @returns {{totalPrice: number, lineItems: Array<object>, details: object}}
 */
const calculateDistributorPrice = (membershipProperties) => {
  const baseFee = config.DISTRIBUTOR_BASE_FEE || 929;
  const perTerritoryCharge = config.DISTRIBUTOR_PER_TERRITORY_FEE || 70;

  // Get the property names from config
  const usStatesProperty = config.HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY;
  const canadianProvincesProperty = config.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY;
  const nonNATerritoriesProperty = config.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY;

  // Get the string values from the membership properties (e.g., "CA;NV;AZ")
  const usStatesString = membershipProperties[usStatesProperty] || '';
  const canadianProvincesString = membershipProperties[canadianProvincesProperty] || '';
  const nonNATerritoriesString = membershipProperties[nonNATerritoriesProperty] || '';

  // Get the home state from company address
  const homeState = membershipProperties.state || '';
  
  // Count territories excluding home state
  const usStatesCount = countTerritoriesExcludingHomeState(usStatesString, homeState);
  const canadianProvincesCount = countTerritoriesExcludingHomeState(canadianProvincesString, homeState);
  const nonNATerritoriesCount = countTerritoriesExcludingHomeState(nonNATerritoriesString, homeState);

  // Calculate total billable territories
  const totalBillableTerritories = usStatesCount + canadianProvincesCount + nonNATerritoriesCount;
  
  // Charge for all billable territories (home state is already excluded)
  const territoriesCharge = totalBillableTerritories * perTerritoryCharge;
  const totalPrice = baseFee + territoriesCharge;

  const lineItems = [
    {
      name: 'Distributor Membership Base Fee',
      quantity: 1,
      price: baseFee,
      description: 'Annual base fee for Distributor Membership.',
      productId: '2463768667', // $929 membership product ID
      billing_frequency: 'One-Time'
    },
    {
      name: 'Home State Listing',
      quantity: 1,
      price: 0,
      description: `FREE listing in home state of ${homeState || 'Not specified'}`,
      productId: '25230586526', // HubSpot product ID for free home state listing
      billing_frequency: 'One-Time'
    }
  ];

  if (totalBillableTerritories > 0) {
    lineItems.push({
      name: `Additional Territory Listings`,
      quantity: totalBillableTerritories,
      price: perTerritoryCharge,
      description: `Charge for ${totalBillableTerritories} territories (home state excluded).`, 
      // No productId - this will be created as a custom line item
    });
  }
  
  const calculationDetails = {
    membershipType: 'Distributor',
    homeState: homeState || 'Not specified',
    totalBillableTerritories,
    totalPrice,
  };

  logger.info(`Distributor price calculated for company ${membershipProperties.company_name}`, calculationDetails);

  return {
    totalPrice,
    lineItems,
    details: calculationDetails,
  };
};

module.exports = calculateDistributorPrice; 