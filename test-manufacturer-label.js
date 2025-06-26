// Test script to verify manufacturer membership level labels
const calculateManufacturerPrice = require('./src/pricing/manufacturer');
const config = require('./src/config');

console.log('Testing Manufacturer Membership Level Labels');
console.log('============================================');

// Test all the possible membership level values
const testCases = [
  { label: '$1,500 (<$5M)', expectedPrice: 1500 },
  { label: '$3,500 ($5M - $10M)', expectedPrice: 3500 },
  { label: '$5,000 ($10M - $20M)', expectedPrice: 5000 },
  { label: '$7,500 ($20M - $40M)', expectedPrice: 7500 },
  { label: '$10,000 ($40M+)', expectedPrice: 10000 }
];

testCases.forEach((testCase, index) => {
  console.log(`\nTest Case ${index + 1}: ${testCase.label}`);
  
  const testProperties = {
    hs_object_id: `test-${index + 1}`,
    [config.HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY]: testCase.label
  };

  try {
    const result = calculateManufacturerPrice(testProperties);
    console.log('✅ Success:');
    console.log(`  Price: $${result.totalPrice}`);
    console.log(`  Description: "${result.lineItems[0].description}"`);
    console.log(`  Expected Price: $${testCase.expectedPrice}`);
    
    if (result.totalPrice === testCase.expectedPrice) {
      console.log('  ✅ Price matches expected');
    } else {
      console.log('  ❌ Price does not match expected');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
});

console.log('\nConfiguration Check:');
console.log('HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY:', config.HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY); 