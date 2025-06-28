const AWS = require('aws-sdk');
const config = require('../config');
const logger = require('../utils/logger');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Lambda handler to generate a pre-signed URL for an invoice PDF in S3.
 */
exports.handler = async (event) => {
  const bucketName = config.S3_REPORTS_BUCKET_NAME;
  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured.');
    return { statusCode: 500, body: 'S3 bucket not configured.' };
  }

  const key = event.pathParameters?.key || event.queryStringParameters?.key;
  if (!key) {
    return { statusCode: 400, body: 'Missing invoice key.' };
  }

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
