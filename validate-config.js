#!/usr/bin/env node

/**
 * HubSpot Configuration Validator
 * Run this script to check if all required environment variables are set.
 * 
 * Usage: node validate-config.js
 */

const { printConfigReport, getEnvTemplate } = require('./src/utils/configValidator');

console.log('🔍 Validating HubSpot Invoice Integration Configuration...\n');

const isValid = printConfigReport();

if (!isValid) {
  console.log('📝 Environment Variables Template:');
  console.log('Copy and customize these variables in your .env file or environment:\n');
  console.log(getEnvTemplate());
  
  console.log('🔗 How to find Association Type IDs:');
  console.log('1. Go to your HubSpot portal');
  console.log('2. Navigate to Settings > Objects > Invoices');
  console.log('3. Check the Associations tab');
  console.log('4. Note the Association Type IDs for:');
  console.log('   - Invoice to Contact');
  console.log('   - Invoice to Company');
  console.log('   - Invoice to Line Item');
  console.log('\n5. Set these values in your environment variables');
  
  process.exit(1);
} else {
  console.log('✅ All required configurations are present!');
  console.log('Your HubSpot invoice integration should work correctly.');
  process.exit(0);
} 