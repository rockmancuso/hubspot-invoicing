const AWS = require('aws-sdk');
const config = require('./config');
const logger = require('./utils/logger');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Lambda handler to download/stream an invoice PDF directly from S3.
 */
exports.handler = async (event) => {
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

logger.info(`Attempting to download invoice with S3 key: ${key}`);


  try {
    // Get the object from S3
    const s3Object = await s3.getObject({
      Bucket: bucketName,
      Key: key,
    }).promise();

    // Determine content type
    const contentType = s3Object.ContentType || 'application/pdf';
    
    // Get filename from key
    const filename = key.split('/').pop() || 'invoice.pdf';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': s3Object.ContentLength,
        'Cache-Control': 'no-cache',
      },
      body: s3Object.Body.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    if (err.code === 'NoSuchKey') {
      logger.error(`Invoice not found: ${key}`, err);
      return { statusCode: 404, body: 'Invoice not found.' };
    }
    logger.error('Failed to download invoice', err);
    return { statusCode: 500, body: 'Error downloading invoice.' };
  }
}; 