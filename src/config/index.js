// Configuration Management
// Loads configuration from environment variables and provides a centralized point of access.
const logger = require('../utils/logger'); // Assuming logger is available or use console

const config = {
  // General Application Configuration
  APP_NAME: process.env.APP_NAME || 'HubSpotInvoicingLambda',
  NODE_ENV: process.env.NODE_ENV || 'development',
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',

  // HubSpot API and Secrets
  HUBSPOT_API_KEY: process.env.HUBSPOT_API_KEY, // For local dev, primarily from Secrets Manager
  HUBSPOT_API_KEY_SECRET_ID: process.env.HUBSPOT_API_KEY_SECRET_ID || 'HubSpotApiKey', // Name/ARN of the secret in Secrets Manager

  // HubSpot Company Properties (Internal Names)
  HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY: process.env.HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY || 'next_renewal_date',
  HUBSPOT_MEMBERSHIP_TYPE_PROPERTY: process.env.HUBSPOT_MEMBERSHIP_TYPE_PROPERTY || 'membership_type',
  HUBSPOT_COMPANY_MEMBERSHIP_DUES_PROPERTY: process.env.HUBSPOT_COMPANY_MEMBERSHIP_DUES_PROPERTY || 'membership_dues_invoiced_amount',

  // HubSpot Distributor Membership Properties
  HUBSPOT_DISTRIBUTOR_US_STATES_PROPERTY: process.env.HUBSPOT_DISTRIBUTOR_US_STATES_PROPERTY || 'distributor_us_states_count',
  HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_PROPERTY: process.env.HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_PROPERTY || 'distributor_canadian_provinces_count',
  HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_PROPERTY: process.env.HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_PROPERTY || 'distributor_non_na_territories_count',

  // HubSpot Manufacturer Membership Properties
  HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY: process.env.HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY || 'manufacturer_membership_level', // Property holding values like "$1,500"

  // HubSpot Contact Properties & Associations
  HUBSPOT_PRIMARY_CONTACT_ASSOCIATION_TYPE_ID: process.env.HUBSPOT_PRIMARY_CONTACT_ASSOCIATION_TYPE_ID, // e.g., '2' (numeric ID for 'company_to_contact' if it's primary)
  HUBSPOT_CONTACT_PROPERTIES_TO_FETCH: process.env.HUBSPOT_CONTACT_PROPERTIES_TO_FETCH || 'email,firstname,lastname',

  // HubSpot Invoice Object and Properties
  HUBSPOT_INVOICE_OBJECT_TYPE_ID: process.env.HUBSPOT_INVOICE_OBJECT_TYPE_ID || 'invoice', // The object type ID for Invoices (e.g., 'p_invoice' or a numeric ID for custom objects)
  HUBSPOT_INVOICE_AMOUNT_PROPERTY: process.env.HUBSPOT_INVOICE_AMOUNT_PROPERTY || 'hs_invoice_amount',
  HUBSPOT_INVOICE_DUE_DATE_PROPERTY: process.env.HUBSPOT_INVOICE_DUE_DATE_PROPERTY || 'hs_due_date',
  HUBSPOT_INVOICE_BILLING_CONTACT_ID_PROPERTY: process.env.HUBSPOT_INVOICE_BILLING_CONTACT_ID_PROPERTY || 'hs_billing_contact_id',
  HUBSPOT_INVOICE_CURRENCY_PROPERTY: process.env.HUBSPOT_INVOICE_CURRENCY_PROPERTY || 'hs_currency_code',
  HUBSPOT_INVOICE_STATUS_PROPERTY: process.env.HUBSPOT_INVOICE_STATUS_PROPERTY || 'hs_status',
  HUBSPOT_INVOICE_DEFAULT_STATUS: process.env.HUBSPOT_INVOICE_DEFAULT_STATUS || 'DRAFT', // e.g., DRAFT, SENT, PAID
  HUBSPOT_INVOICE_LINE_ITEMS_PROPERTY: process.env.HUBSPOT_INVOICE_LINE_ITEMS_PROPERTY || 'hs_line_items', // Property where line items are stored (might be complex)

  // HubSpot Association Type IDs (Numeric)
  HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY: process.env.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY, // e.g., '280'
  HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT: process.env.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT, // e.g., '279'

  // Membership Types (Values stored in HUBSPOT_MEMBERSHIP_TYPE_PROPERTY)
  MEMBERSHIP_TYPE_DISTRIBUTOR: process.env.MEMBERSHIP_TYPE_DISTRIBUTOR || 'Distributor',
  MEMBERSHIP_TYPE_MANUFACTURER: process.env.MEMBERSHIP_TYPE_MANUFACTURER || 'Manufacturer',
  MEMBERSHIP_TYPE_SERVICE_PROVIDER: process.env.MEMBERSHIP_TYPE_SERVICE_PROVIDER || 'Service Provider',

  // Pricing Configuration (Referenced by pricing modules)
  // Distributor Pricing
  DISTRIBUTOR_BASE_FEE: parseFloat(process.env.DISTRIBUTOR_BASE_FEE) || 929,
  DISTRIBUTOR_PER_TERRITORY_FEE: parseFloat(process.env.DISTRIBUTOR_PER_TERRITORY_FEE) || 70,
  // Manufacturer Pricing Tiers are now derived directly from HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY
  // Service Provider Pricing
  SERVICE_PROVIDER_FLAT_FEE: parseFloat(process.env.SERVICE_PROVIDER_FLAT_FEE) || 1250,

  // Invoice Settings
  INVOICE_CURRENCY: process.env.INVOICE_CURRENCY || 'USD',
  INVOICE_DUE_DAYS: parseInt(process.env.INVOICE_DUE_DAYS, 10) || 30,

  // S3 Reporting Configuration
  S3_REPORTS_BUCKET_NAME: process.env.S3_REPORTS_BUCKET_NAME,
  // S3_REPORT_KEY_PREFIX: process.env.S3_REPORT_KEY_PREFIX || 'reports', // Prefix is handled in reporting.js

  // SES Email Configuration
  ENABLE_ERROR_NOTIFICATIONS: process.env.ENABLE_ERROR_NOTIFICATIONS || 'true', // 'true' or 'false'
  SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL,
  SES_ERROR_RECIPIENT_EMAIL: process.env.SES_ERROR_RECIPIENT_EMAIL,
  ENABLE_REPORT_EMAIL: process.env.ENABLE_REPORT_EMAIL || 'true', // 'true' or 'false'
  SES_REPORT_RECIPIENT_EMAIL: process.env.SES_REPORT_RECIPIENT_EMAIL,
};

// Basic validation for critical configurations
if (config.NODE_ENV !== 'test') {
  if (!config.HUBSPOT_API_KEY && !config.HUBSPOT_API_KEY_SECRET_ID) {
    (logger || console).warn(
      'Warning: Neither HUBSPOT_API_KEY (for local dev) nor HUBSPOT_API_KEY_SECRET_ID (for Secrets Manager) is set. ' +
      'The application will likely fail to connect to HubSpot.'
    );
  }
  if (!config.S3_REPORTS_BUCKET_NAME) {
    (logger || console).warn('Warning: S3_REPORTS_BUCKET_NAME is not set. Storing reports to S3 will fail.');
  }
  if (config.ENABLE_ERROR_NOTIFICATIONS === 'true' && (!config.SES_SENDER_EMAIL || !config.SES_ERROR_RECIPIENT_EMAIL)) {
    (logger || console).warn('Warning: Error notifications are enabled, but SES_SENDER_EMAIL or SES_ERROR_RECIPIENT_EMAIL is not set.');
  }
  if (config.ENABLE_REPORT_EMAIL === 'true' && (!config.SES_SENDER_EMAIL || !config.SES_REPORT_RECIPIENT_EMAIL)) {
    (logger || console).warn('Warning: Report emails are enabled, but SES_SENDER_EMAIL or SES_REPORT_RECIPIENT_EMAIL is not set.');
  }
  if (!config.HUBSPOT_INVOICE_OBJECT_TYPE_ID) {
    (logger || console).warn('Warning: HUBSPOT_INVOICE_OBJECT_TYPE_ID is not set. Invoice creation will likely fail.');
  }
}

module.exports = config;