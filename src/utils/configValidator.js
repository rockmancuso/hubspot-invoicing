/**
 * Configuration Validator for HubSpot Invoice Integration
 * This utility helps identify missing or incorrect configuration values.
 */

const config = require('../config');
const logger = require('./logger');

/**
 * Validates all HubSpot configuration values and provides detailed feedback.
 * @returns {object} Validation results with missing and valid configurations.
 */
function validateHubSpotConfig() {
  const results = {
    missing: [],
    valid: [],
    warnings: [],
    suggestions: []
  };

  // Required HubSpot API configuration
  const requiredApiConfigs = [
    'HUBSPOT_API_KEY',
    'HUBSPOT_API_KEY_SECRET_ID'
  ];

  // Required Invoice object configuration
  const requiredInvoiceConfigs = [
    'HUBSPOT_INVOICE_OBJECT_TYPE_ID',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM'
  ];

  // Check API configuration
  const hasApiKey = config.HUBSPOT_API_KEY || config.HUBSPOT_API_KEY_SECRET_ID;
  if (!hasApiKey) {
    results.missing.push(...requiredApiConfigs);
  } else {
    results.valid.push('HubSpot API authentication configured');
  }

  // Check Invoice configuration
  requiredInvoiceConfigs.forEach(key => {
    if (!config[key]) {
      results.missing.push(key);
    } else {
      results.valid.push(`${key}: ${config[key]}`);
    }
  });

  // Check optional but recommended configurations
  const optionalConfigs = [
    'HUBSPOT_LINE_ITEMS_OBJECT_TYPE_ID',
    'HUBSPOT_INVOICE_PDF_LINK_PROPERTY',
    'HUBSPOT_INVOICE_STATUS_PROPERTY'
  ];

  optionalConfigs.forEach(key => {
    if (!config[key]) {
      results.warnings.push(`${key} not configured - using default values`);
    } else {
      results.valid.push(`${key}: ${config[key]}`);
    }
  });

  // Check Mailgun email configuration
  if (!config.MAILGUN_API_KEY) {
    results.warnings.push('MAILGUN_API_KEY not configured - error notifications and reports may fail');
    results.suggestions.push('Set MAILGUN_API_KEY');
  } else {
    results.valid.push('MAILGUN_API_KEY: Configured');
  }

  if (!config.MAILGUN_DOMAIN) {
    results.warnings.push('MAILGUN_DOMAIN not configured - error notifications and reports may fail');
    results.suggestions.push('Set MAILGUN_DOMAIN');
  } else {
    results.valid.push(`MAILGUN_DOMAIN: ${config.MAILGUN_DOMAIN}`);
  }

  if (!config.MAILGUN_SENDER_EMAIL) {
    results.warnings.push('MAILGUN_SENDER_EMAIL not configured - error notifications and reports may fail');
    results.suggestions.push('Set MAILGUN_SENDER_EMAIL');
  } else {
    results.valid.push(`MAILGUN_SENDER_EMAIL: ${config.MAILGUN_SENDER_EMAIL}`);
  }

  if (!config.MAILGUN_ERROR_RECIPIENT_EMAIL) {
    results.warnings.push('MAILGUN_ERROR_RECIPIENT_EMAIL not configured - error notifications may fail');
    results.suggestions.push('Set MAILGUN_ERROR_RECIPIENT_EMAIL');
  } else {
    results.valid.push(`MAILGUN_ERROR_RECIPIENT_EMAIL: ${config.MAILGUN_ERROR_RECIPIENT_EMAIL}`);
  }

  if (!config.MAILGUN_REPORT_RECIPIENT_EMAIL) {
    results.warnings.push('MAILGUN_REPORT_RECIPIENT_EMAIL not configured - report emails may fail');
    results.suggestions.push('Set MAILGUN_REPORT_RECIPIENT_EMAIL');
  } else {
    results.valid.push(`MAILGUN_REPORT_RECIPIENT_EMAIL: ${config.MAILGUN_REPORT_RECIPIENT_EMAIL}`);
  }

  // Check S3 configuration
  if (!config.S3_REPORTS_BUCKET_NAME) {
    results.warnings.push('S3_REPORTS_BUCKET_NAME not configured - S3 reports may fail');
    results.suggestions.push('Set AWS_S3_REPORT_BUCKET_NAME or S3_REPORTS_BUCKET_NAME');
  } else {
    results.valid.push(`S3_REPORTS_BUCKET_NAME: ${config.S3_REPORTS_BUCKET_NAME}`);
  }

  return results;
}

/**
 * Prints a formatted configuration validation report.
 */
function printConfigReport() {
  const results = validateHubSpotConfig();
  
  console.log('\n=== HubSpot Configuration Validation Report ===\n');
  
  if (results.valid.length > 0) {
    console.log('✅ Valid Configurations:');
    results.valid.forEach(config => console.log(`  - ${config}`));
    console.log('');
  }
  
  if (results.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    results.warnings.forEach(warning => console.log(`  - ${warning}`));
    console.log('');
  }

  if (results.suggestions.length > 0) {
    console.log('💡 Suggestions:');
    results.suggestions.forEach(suggestion => console.log(`  - ${suggestion}`));
    console.log('');
  }
  
  if (results.missing.length > 0) {
    console.log('❌ Missing Required Configurations:');
    results.missing.forEach(missing => console.log(`  - ${missing}`));
    console.log('');
    console.log('Please set these environment variables before running the application.');
  }
  
  console.log('===============================================\n');
  
  return results.missing.length === 0;
}

/**
 * Gets the recommended environment variables template.
 * @returns {string} A template of environment variables to set.
 */
function getEnvTemplate() {
  return `# HubSpot API Configuration
HUBSPOT_API_KEY=your_api_key_here
# OR use Secrets Manager
HUBSPOT_API_KEY_SECRET_ID=HubSpotApiKey

# HubSpot Invoice Object Configuration
HUBSPOT_INVOICE_OBJECT_TYPE_ID=invoice
HUBSPOT_LINE_ITEMS_OBJECT_TYPE_ID=line_items

# HubSpot Association Type IDs (REQUIRED - get these from your HubSpot portal)
HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT=177
HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY=179
HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM=409
HUBSPOT_ASSOCIATION_TYPE_ID_CONTACT_TO_INVOICE=178

# HubSpot Invoice Properties
HUBSPOT_INVOICE_PDF_LINK_PROPERTY=printable_invoice_url
HUBSPOT_INVOICE_STATUS_PROPERTY=hs_status

# Invoice Settings
INVOICE_CURRENCY=USD
INVOICE_DUE_DAYS=30

# Mailgun Email Configuration (for error notifications and reports)
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=your-domain.com
MAILGUN_SENDER_EMAIL=noreply@your-domain.com
MAILGUN_ERROR_RECIPIENT_EMAIL=your-error-email@domain.com
MAILGUN_REPORT_RECIPIENT_EMAIL=your-report-email@domain.com

# S3 Configuration
S3_REPORTS_BUCKET_NAME=your-s3-bucket-name

# Other configurations...
`;
}

module.exports = {
  validateHubSpotConfig,
  printConfigReport,
  getEnvTemplate
}; 