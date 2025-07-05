const AWS = require('aws-sdk');
const config = require('./config');
const logger = require('./utils/logger');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Lambda handler to generate a pre-signed URL for an invoice PDF in S3.
 */
exports.handler = async (event) => {
  console.log('=== LAMBDA GET INVOICE HANDLER STARTED ===');
  console.log('Event:', JSON.stringify(event, null, 2));

  const bucketName = config.S3_REPORTS_BUCKET_NAME;
  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured.');
    return { statusCode: 500, body: 'S3 bucket not configured.' };
  }

  // Accept both 'key' and 'id' parameters for flexibility
  let key = event.pathParameters?.key || event.pathParameters?.id || event.queryStringParameters?.key;
  if (!key) {
    return { statusCode: 400, body: 'Missing invoice key.' };
  }

  // URL decode the key if it's encoded
  try {
    key = decodeURIComponent(key);
  } catch (err) {
    logger.warn('Failed to URL decode key, using as-is:', err);
  }

// Ensure the key starts with 'invoices/' prefix
if (!key.startsWith('invoices/')) {
  key = `invoices/${key}`;
}

logger.info(`Attempting to get invoice with S3 key: ${key}`);

  const expires = parseInt(event.queryStringParameters?.expires, 10) || 900;

  try {
    const url = await s3.getSignedUrlPromise('getObject', {
      Bucket: bucketName,
      Key: key,
      Expires: expires,
    });
    return { statusCode: 200, body: JSON.stringify({ url }) };
  } catch (err) {
    logger.error('Failed to create signed URL', err);
    return { statusCode: 500, body: 'Error generating URL.' };
  }
}; 