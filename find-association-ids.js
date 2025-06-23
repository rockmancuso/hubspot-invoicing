#!/usr/bin/env node

/**
 * Script to find HubSpot Association Type IDs
 * This script queries your HubSpot portal to find the correct association type IDs
 * for invoice associations.
 */

const hubspot = require('@hubspot/api-client');
const config = require('./src/config');

async function findAssociationIds() {
  console.log('🔍 Finding HubSpot Association Type IDs...\n');

  // Check if we have API access
  if (!config.HUBSPOT_API_KEY) {
    console.log('❌ HUBSPOT_API_KEY not found. Please set your HubSpot API key.');
    console.log('You can find this in your HubSpot portal under Settings > Account Setup > Integrations > API Keys');
    return;
  }

  try {
    // Initialize HubSpot client
    const hubspotClient = new hubspot.Client({ 
      apiKey: config.HUBSPOT_API_KEY 
    });
    console.log('✅ Connected to HubSpot API\n');

    // Try to get association types using a different approach
    console.log('📋 Fetching available association types...');
    
    // First, let's try to get the object types to understand what's available
    console.log('Getting object types...');
    const objectTypes = await hubspotClient.crm.objects.basicApi.getPage('invoice');
    console.log('Invoice object types found:', objectTypes.results.length);
    
    // Now let's try to get association types using the v3 API
    console.log('Getting association types...');
    const associationTypes = await hubspotClient.crm.associations.v3.basicApi.getPage('invoice', 'contact');
    console.log('Association types found:', associationTypes.results.length);
    
    if (associationTypes.results.length > 0) {
      console.log('\n=== Available Association Types ===');
      associationTypes.results.forEach(type => {
        console.log(`Type ID: ${type.typeId}`);
        console.log(`Category: ${type.category}`);
        console.log(`Label: ${type.label || 'No label'}`);
        console.log('---');
      });
    } else {
      console.log('❌ No association types found for invoice -> contact');
      console.log('This might mean:');
      console.log('1. Your HubSpot portal doesn\'t have invoice objects configured');
      console.log('2. The associations haven\'t been set up in your portal');
      console.log('3. You need to create the associations manually first');
    }

  } catch (error) {
    console.log('❌ Error connecting to HubSpot API:', error.message);
    if (error.body && error.body.message) {
      console.log('HubSpot API Error:', error.body.message);
    }
    console.log('\n💡 Alternative approach:');
    console.log('1. Go to your HubSpot portal');
    console.log('2. Navigate to Settings > Objects > Invoices');
    console.log('3. Check the Associations tab');
    console.log('4. Note the Association Type IDs for:');
    console.log('   - Invoice to Contact');
    console.log('   - Invoice to Company');
    console.log('   - Invoice to Line Item');
    console.log('\n5. Set these as environment variables:');
    console.log('   HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT=<ID>');
    console.log('   HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY=<ID>');
    console.log('   HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM=<ID>');
  }
}

// Run the script
findAssociationIds().catch(console.error); 