// Reporting Utilities
const AWS = require('aws-sdk');
const logger = require('./logger');
const config = require('../config');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });
const ses = new AWS.SES({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Converts an array of objects to a CSV string.
 * @param {Array<object>} dataArray - Array of objects to convert.
 * @returns {string} CSV formatted string.
 */
function arrayToCsv(dataArray) {
  if (!dataArray || dataArray.length === 0) {
    return '';
  }
  const headers = Object.keys(dataArray[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of dataArray) {
    const values = headers.map(header => {
      const escaped = ('' + row[header]).replace(/"/g, '""'); // Escape double quotes
      return `"${escaped}"`; // Enclose in double quotes
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

/**
 * Generates a summary report content based on the provided data.
 *
 * @param {object} reportData - Data for the report.
 * @param {string} reportData.date - ISO date string for the report.
 * @param {number} reportData.totalCompaniesProcessed - Total companies processed.
 * @param {number} reportData.successfulInvoices - Count of successful invoices.
 * @param {number} reportData.failedInvoices - Count of failed invoices.
 * @param {Array<object>} reportData.invoices - Details of successful invoices.
 * @param {Array<object>} reportData.failures - Details of failed attempts.
 * @returns {string} The report content (CSV format).
 */
const generateReportContent = (reportData) => {
  logger.info('Generating monthly invoice report content...');
  let reportContent = `Monthly Invoice Generation Report\n`;
  reportContent += `Date: ${reportData.date}\n`;
  reportContent += `Total Companies Processed: ${reportData.totalCompaniesProcessed}\n`;
  reportContent += `Total Successful Invoices: ${reportData.successfulInvoices}\n`;
  reportContent += `Total Failed Attempts: ${reportData.failedInvoices}\n\n`;

  reportContent += 'Successful Invoices:\n';
  if (reportData.invoices && reportData.invoices.length > 0) {
    reportContent += arrayToCsv(reportData.invoices) + '\n';
  } else {
    reportContent += 'No invoices were successfully generated.\n';
  }

  reportContent += '\nFailed Attempts:\n';
  if (reportData.failures && reportData.failures.length > 0) {
    reportContent += arrayToCsv(reportData.failures) + '\n';
  } else {
    reportContent += 'No failed attempts recorded.\n';
  }

  logger.info('Monthly report content generated.');
  return reportContent;
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
 * Emails the report using Amazon SES, attaching the report from S3 or including content.
 *
 * @param {string} reportS3Url - The S3 URL of the report.
 * @param {object} reportData - The raw report data for email body summary.
 * @returns {Promise<void>}
 * @throws {Error} If SES configuration is missing or email sending fails.
 */
const sendReportEmail = async (reportS3Url, reportData) => {
  if (config.ENABLE_REPORT_EMAIL !== 'true') {
    logger.info('Report emails are disabled. Skipping SES email for report.');
    return;
  }

  const toAddress = config.SES_REPORT_RECIPIENT_EMAIL;
  const fromAddress = config.SES_SENDER_EMAIL;

  if (!toAddress || !fromAddress) {
    logger.error('SES recipient or sender email for reports not configured. Cannot send report email.');
    throw new Error('SES email configuration for reports is missing.');
  }

  const subject = `HubSpot Invoicing Monthly Report - ${new Date(reportData.date).toLocaleDateString()}`;
  let bodyText = `HubSpot Invoicing Monthly Report\n\n`;
  bodyText += `Date: ${new Date(reportData.date).toLocaleString()}\n`;
  bodyText += `Total Companies Processed: ${reportData.totalCompaniesProcessed}\n`;
  bodyText += `Successful Invoices: ${reportData.successfulInvoices}\n`;
  bodyText += `Failed Invoices: ${reportData.failedInvoices}\n\n`;
  bodyText += `The full report is available at: ${reportS3Url}\n\n`;
  bodyText += `Summary of Successful Invoices:\n`;
  if (reportData.invoices && reportData.invoices.length > 0) {
    reportData.invoices.slice(0, 10).forEach(inv => { // Show first 10 as example
        bodyText += `- Company: ${inv.companyName || inv.companyId}, Invoice ID: ${inv.invoiceId}, Amount: ${inv.invoiceAmount}\n`;
    });
    if (reportData.invoices.length > 10) bodyText += `...and ${reportData.invoices.length - 10} more.\n`;
  } else {
    bodyText += `No invoices were successfully generated.\n`;
  }

  const params = {
    Source: fromAddress,
    Destination: { ToAddresses: [toAddress] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: { Data: bodyText, Charset: 'UTF-8' },
      },
    },
  };

  try {
    logger.info(`Sending report email to: ${toAddress}`);
    await ses.sendEmail(params).promise();
    logger.info('Report email sent successfully.');
  } catch (error) {
    logger.error('Failed to send report email via SES:', error);
    throw error; // Re-throw to be handled by the main lambda handler
  }
};

module.exports = {
  generateAndStoreReport,
  sendReportEmail,
};