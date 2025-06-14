// S3 Storage Utility
const AWS = require('aws-sdk');
const config = require('../config');
const logger = require('./logger');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Uploads a generated PDF invoice to the S3 reports bucket.
 *
 * @param {Buffer} pdfBuffer - The generated PDF content as a buffer.
 * @param {string} key - The desired S3 object key (e.g., 'invoices/2025/06/invoice-123.pdf').
 * @returns {Promise<string>} A promise that resolves to the public URL of the uploaded file.
 * @throws {Error} If S3 bucket name is not configured or the upload fails.
 */
const storePdfInvoice = async (pdfBuffer, key) => {
  const bucketName = config.S3_REPORTS_BUCKET_NAME;

  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured. Cannot store PDF invoice.');
    throw new Error('S3 bucket name for reports is not configured.');
  }

  logger.info(`Storing PDF invoice in S3: s3://${bucketName}/${key}`);
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    ContentDisposition: 'inline', // Ensures the file opens in the browser instead of downloading
  };

  try {
    await s3.putObject(params).promise();
    const fileUrl = `https://${bucketName}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;
    logger.info(`PDF invoice stored successfully. URL: ${fileUrl}`);
    return fileUrl;
  } catch (error) {
    logger.error('Failed to store PDF invoice in S3:', error);
    throw error;
  }
};

module.exports = {
  storePdfInvoice,
};