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

/**
 * Stores the processing state (list of processed member IDs) in S3.
 * @param {Array<string>} processedMemberIds - Array of member IDs that have been processed
 * @param {string} runDate - Date string for the current run (YYYY-MM-DD format)
 * @param {object} options - Additional options for state tracking
 * @param {number} options.totalMembers - Total number of members to process
 * @param {boolean} options.isComplete - Whether all members have been processed
 * @returns {Promise<void>}
 */
const storeProcessingState = async (processedMemberIds, runDate, options = {}) => {
  const bucketName = config.S3_REPORTS_BUCKET_NAME;

  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured. Cannot store processing state.');
    throw new Error('S3 bucket name for reports is not configured.');
  }

  const stateData = {
    processedMemberIds,
    runDate,
    lastUpdated: new Date().toISOString(),
    totalProcessed: processedMemberIds.length,
    totalMembers: options.totalMembers || 0,
    isComplete: options.isComplete || false,
    completionPercentage: options.totalMembers > 0 ? Math.round((processedMemberIds.length / options.totalMembers) * 100) : 0,
    status: options.isComplete ? 'COMPLETED' : 'IN_PROGRESS'
  };

  const stateKey = `processing-state/${runDate}/invoice-processing-state.json`;
  
  logger.info(`Storing processing state in S3: s3://${bucketName}/${stateKey}`);
  logger.info(`Status: ${stateData.status}, Progress: ${stateData.totalProcessed}/${stateData.totalMembers} (${stateData.completionPercentage}%)`);
  
  const params = {
    Bucket: bucketName,
    Key: stateKey,
    Body: JSON.stringify(stateData, null, 2),
    ContentType: 'application/json',
  };

  try {
    await s3.putObject(params).promise();
    logger.info(`Processing state stored successfully at s3://${bucketName}/${stateKey}`);
    
    if (options.isComplete) {
      logger.info('🎉 PROCESSING COMPLETE! All members have been processed.');
    }
  } catch (error) {
    logger.error('Failed to store processing state in S3:', error);
    throw error;
  }
};

/**
 * Retrieves the processing state (list of processed member IDs) from S3.
 * @param {string} runDate - Date string for the current run (YYYY-MM-DD format)
 * @returns {Promise<Array<string>>} Array of member IDs that have already been processed
 */
const getProcessingState = async (runDate) => {
  const bucketName = config.S3_REPORTS_BUCKET_NAME;

  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured. Cannot retrieve processing state.');
    throw new Error('S3 bucket name for reports is not configured.');
  }

  const stateKey = `processing-state/${runDate}/invoice-processing-state.json`;
  
  logger.info(`Retrieving processing state from S3: s3://${bucketName}/${stateKey}`);
  
  try {
    const params = {
      Bucket: bucketName,
      Key: stateKey,
    };
    
    const result = await s3.getObject(params).promise();
    const stateData = JSON.parse(result.Body.toString());
    
    logger.info(`Retrieved processing state: ${stateData.processedMemberIds.length} members already processed`);
    return stateData.processedMemberIds || [];
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      logger.info('No existing processing state found. Starting fresh.');
      return [];
    }
    logger.error('Failed to retrieve processing state from S3:', error);
    throw error;
  }
};

/**
 * Clears the processing state for a given run date.
 * @param {string} runDate - Date string for the current run (YYYY-MM-DD format)
 * @returns {Promise<void>}
 */
const clearProcessingState = async (runDate) => {
  const bucketName = config.S3_REPORTS_BUCKET_NAME;

  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured. Cannot clear processing state.');
    throw new Error('S3 bucket name for reports is not configured.');
  }

  const stateKey = `processing-state/${runDate}/invoice-processing-state.json`;
  
  logger.info(`Clearing processing state in S3: s3://${bucketName}/${stateKey}`);
  
  try {
    const params = {
      Bucket: bucketName,
      Key: stateKey,
    };
    
    await s3.deleteObject(params).promise();
    logger.info(`Processing state cleared successfully`);
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      logger.info('No processing state to clear.');
      return;
    }
    logger.error('Failed to clear processing state from S3:', error);
    throw error;
  }
};

module.exports = {
  storePdfInvoice,
  storeProcessingState,
  getProcessingState,
  clearProcessingState,
};