// Reporting Utilities
const AWS = require('aws-sdk');
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const logger = require('./logger');
const config = require('../config');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Converts an array of objects to a CSV string.
 * @param {Array<object>} dataArray - Array of objects to convert.
 * @returns {string} CSV formatted string.
 */
function arrayToCsv(dataArray) {
  if (!dataArray || dataArray.length === 0) {
    return '';
  }
  
  // Filter out empty objects and ensure all objects have the same structure
  const validRows = dataArray.filter(row => row && Object.keys(row).length > 0);
  
  if (validRows.length === 0) {
    return '';
  }
  
  const headers = Object.keys(validRows[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of validRows) {
    const values = headers.map(header => {
      const value = row[header];
      // Handle undefined, null, and other falsy values
      const stringValue = value !== undefined && value !== null ? String(value) : '';
      const escaped = stringValue.replace(/"/g, '""'); // Escape double quotes
      return `"${escaped}"`; // Enclose in double quotes
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

/**
 * Generates the content for a report based on the provided data.
 * @param {object} reportData - The data to include in the report.
 * @returns {string} The generated report content as a CSV string.
 */
const generateReportContent = (reportData) => {
  const reportRows = [];

  // Add summary row
  reportRows.push({
    'Report Date': new Date(reportData.date).toLocaleDateString(),
    'Total Memberships Processed': reportData.totalMembershipsProcessed,
    'Successful Invoices': reportData.successfulInvoices,
    'Failed Invoices': reportData.failedInvoices,
    'Success Rate': reportData.totalMembershipsProcessed > 0 
      ? `${((reportData.successfulInvoices / reportData.totalMembershipsProcessed) * 100).toFixed(1)}%`
      : '0%'
  });

  // Add individual invoice details
  if (reportData.invoices && reportData.invoices.length > 0) {
    // Add spacing row with consistent structure
    reportRows.push({
      'Report Date': '',
      'Total Memberships Processed': '',
      'Successful Invoices': '',
      'Failed Invoices': '',
      'Success Rate': ''
    });
    
    reportRows.push({
      'Report Date': '=== SUCCESSFUL INVOICES ===',
      'Total Memberships Processed': '',
      'Successful Invoices': '',
      'Failed Invoices': '',
      'Success Rate': ''
    });

    reportData.invoices.forEach(invoice => {
      reportRows.push({
        'Report Date': invoice.name || 'Unknown',
        'Total Memberships Processed': invoice.id || 'N/A',
        'Successful Invoices': invoice.type || 'N/A',
        'Failed Invoices': invoice.invoiceId || 'N/A',
        'Success Rate': invoice.invoiceAmount || 'N/A'
      });
    });
  }

  // Add failure details
  if (reportData.failures && reportData.failures.length > 0) {
    // Add spacing row with consistent structure
    reportRows.push({
      'Report Date': '',
      'Total Memberships Processed': '',
      'Successful Invoices': '',
      'Failed Invoices': '',
      'Success Rate': ''
    });
    
    reportRows.push({
      'Report Date': '=== FAILED INVOICES ===',
      'Total Memberships Processed': '',
      'Successful Invoices': '',
      'Failed Invoices': '',
      'Success Rate': ''
    });

    reportData.failures.forEach(failure => {
      reportRows.push({
        'Report Date': failure.name || 'Unknown',
        'Total Memberships Processed': failure.id || 'N/A',
        'Successful Invoices': '',
        'Failed Invoices': '',
        'Success Rate': failure.reason || 'Unknown error'
      });
    });
  }

  return arrayToCsv(reportRows);
};

/**
 * Generates, and stores the report in an S3 bucket.
 *
 * @param {object} reportData - Data for the report (passed to generateReportContent).
 * @returns {Promise<string>} A promise that resolves to the S3 URL of the stored report.
 * @throws {Error} If S3 bucket name is not configured or S3 upload fails.
 */
const generateAndStoreReport = async (reportData) => {
  const reportContent = generateReportContent(reportData);
  const bucketName = config.S3_REPORTS_BUCKET_NAME;

  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured. Cannot store report.');
    throw new Error('S3 bucket name for reports is not configured.');
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // MM
  const day = now.getDate().toString().padStart(2, '0'); // DD
  const timestamp = now.getTime();
  const reportKey = `reports/${year}/${month}/${day}/invoice-summary-${timestamp}.csv`;

  logger.info(`Storing report in S3: s3://${bucketName}/${reportKey}`);
  const params = {
    Bucket: bucketName,
    Key: reportKey,
    Body: reportContent,
    ContentType: 'text/csv',
  };

  try {
    await s3.putObject(params).promise();
    logger.info(`Report successfully stored at s3://${bucketName}/${reportKey}`);
    return `s3://${bucketName}/${reportKey}`;
  } catch (error) {
    logger.error('Failed to store report in S3:', error);
    throw error; // Re-throw to be handled by the main lambda handler
  }
};

/**
 * Emails the report using Mailgun, attaching the report from S3 or including content.
 *
 * @param {string} reportS3Url - The S3 URL of the report.
 * @param {object} reportData - The raw report data for email body summary.
 * @returns {Promise<void>}
 * @throws {Error} If Mailgun configuration is missing or email sending fails.
 */
const sendReportEmail = async (reportS3Url, reportData) => {
  if (config.ENABLE_REPORT_EMAIL !== 'true') {
    logger.info('Report emails are disabled. Skipping Mailgun email for report.');
    return;
  }

  if (!config.MAILGUN_API_KEY || !config.MAILGUN_DOMAIN || !config.MAILGUN_REPORT_RECIPIENT_EMAIL) {
    logger.error('Mailgun configuration incomplete. Cannot send report email.');
    throw new Error('Mailgun email configuration for reports is missing.');
  }

  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({ username: 'api', key: config.MAILGUN_API_KEY });

  const subject = `HubSpot Invoicing Monthly Report - ${new Date(reportData.date).toLocaleDateString()}`;
  let bodyText = `HubSpot Invoicing Monthly Report\n\n`;
  bodyText += `Date: ${new Date(reportData.date).toLocaleString()}\n`;
  bodyText += `Total Memberships Processed: ${reportData.totalMembershipsProcessed || 0}\n`;
  bodyText += `Successful Invoices: ${reportData.successfulInvoices || 0}\n`;
  bodyText += `Failed Invoices: ${reportData.failedInvoices || 0}\n\n`;
  bodyText += `The full report is available at: ${reportS3Url}\n\n`;
  bodyText += `Summary of Successful Invoices:\n`;
  if (reportData.invoices && reportData.invoices.length > 0) {
    reportData.invoices.slice(0, 10).forEach(inv => { // Show first 10 as example
        bodyText += `- ${inv.name || 'Unknown'}: Invoice ID: ${inv.invoiceId || 'N/A'}, Amount: ${inv.invoiceAmount || 'N/A'}\n`;
    });
    if (reportData.invoices.length > 10) bodyText += `...and ${reportData.invoices.length - 10} more.\n`;
  } else {
    bodyText += `No invoices were successfully generated.\n`;
  }

  const messageData = {
    from: config.MAILGUN_SENDER_EMAIL,
    to: [config.MAILGUN_REPORT_RECIPIENT_EMAIL],
    subject: subject,
    text: bodyText
  };

  try {
    logger.info(`Sending report email to: ${config.MAILGUN_REPORT_RECIPIENT_EMAIL}`);
    await mg.messages.create(config.MAILGUN_DOMAIN, messageData);
    logger.info('Report email sent successfully.');
  } catch (error) {
    logger.error('Failed to send report email via Mailgun:', error);
    throw error; // Re-throw to be handled by the main lambda handler
  }
};

module.exports = {
  generateAndStoreReport,
  sendReportEmail,
  generateReportContent,
};