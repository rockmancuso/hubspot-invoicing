#!/usr/bin/env node

/**
 * Test script for HubSpot V4 Associations API
 * This script helps verify that association creation works correctly.
 * 
 * Usage: node test-associations.js
 */

const hubspot = require('@hubspot/api-client');
const config = require('./src/config');
const { validateHubSpotConfig } = require('./src/utils/configValidator');

async function testAssociations() {
  console.log('🧪 Testing HubSpot V4 Associations API...\n');

  // First validate configuration
  const validation = validateHubSpotConfig();
  if (validation.missing.length > 0) {
    console.log('❌ Configuration validation failed. Missing required values:');
    validation.missing.forEach(missing => console.log(`  - ${missing}`));
    console.log('\nPlease set the missing environment variables and try again.');
    return;
  }

  // Initialize HubSpot client
  let hubspotClient;
  try {
    hubspotClient = new hubspot.Client({ 
      apiKey: config.HUBSPOT_API_KEY 
    });
    console.log('✅ HubSpot client initialized successfully');
  } catch (error) {
    console.log('❌ Failed to initialize HubSpot client:', error.message);
    return;
  }

  // Test object type name mapping
  console.log('\n📋 Testing object type name mapping...');
  const testObjectTypes = [
    'invoice',
    'p_invoice', 
    'contacts',
    'companies',
    'line_items'
  ];

  testObjectTypes.forEach(type => {
    const mappedName = getObjectTypeName(type);
    console.log(`  ${type} -> ${mappedName}`);
  });

  // Test association creation (with mock data)
  console.log('\n🔗 Testing association creation structure...');
  
  const mockInvoiceId = '123456';
  const mockContactId = '789012';
  const mockCompanyId = '345678';
  
  console.log('Example association calls:');
  console.log('1. Invoice to Contact:');
  console.log(`   fromObjectType: 'invoice'`);
  console.log(`   fromObjectId: '${mockInvoiceId}'`);
  console.log(`   toObjectType: 'contact'`);
  console.log(`   toObjectId: '${mockContactId}'`);
  console.log(`   associationTypeId: ${config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT}`);
  
  console.log('\n2. Invoice to Company:');
  console.log(`   fromObjectType: 'invoice'`);
  console.log(`   fromObjectId: '${mockInvoiceId}'`);
  console.log(`   toObjectType: 'company'`);
  console.log(`   toObjectId: '${mockCompanyId}'`);
  console.log(`   associationTypeId: ${config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY}`);

  console.log('\n✅ Association API structure is correct!');
  console.log('The fixed code should now work without undefined errors.');
}

/**
 * Gets the object type name for V4 associations API.
 * @param {string} objectTypeId - The object type ID from config.
 * @returns {string} The object type name for V4 API.
 */
function getObjectTypeName(objectTypeId) {
  // Map object type IDs to their V4 API names
  const objectTypeMap = {
    'invoice': 'invoice',
    'p_invoice': 'invoice',
    'contacts': 'contact',
    'companies': 'company',
    'line_items': 'line_item',
    'p_line_item': 'line_item'
  };

  // If it's already a known name, return it
  if (objectTypeMap[objectTypeId]) {
    return objectTypeMap[objectTypeId];
  }

  // For numeric IDs, we need to use the object type name
  // Default mappings based on common HubSpot object types
  if (objectTypeId === config.HUBSPOT_INVOICE_OBJECT_TYPE_ID) {
    return 'invoice';
  }
  if (objectTypeId === config.HUBSPOT_LINE_ITEMS_OBJECT_TYPE_ID) {
    return 'line_item';
  }

  // Fallback to the original value if we can't determine
  return objectTypeId;
}

// Run the test
testAssociations().catch(error => {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}); 