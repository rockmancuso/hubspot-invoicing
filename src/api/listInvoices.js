const AWS = require('aws-sdk');
const config = require('../config');
const logger = require('../utils/logger');

const s3 = new AWS.S3({ region: config.AWS_REGION || 'us-east-1' });

/**
 * Lambda handler to list invoice objects stored in S3.
 * Returns an array of keys and their metadata.
 */
exports.handler = async (event) => {
  const bucketName = config.S3_REPORTS_BUCKET_NAME;
  if (!bucketName) {
    logger.error('S3_REPORTS_BUCKET_NAME is not configured.');
    return { statusCode: 500, body: 'S3 bucket not configured.' };
  }

  const prefix = event.queryStringParameters?.prefix || '';

  try {
    const listParams = { Bucket: bucketName, Prefix: prefix };
    const listed = await s3.listObjectsV2(listParams).promise();
    const results = [];

    for (const obj of listed.Contents || []) {
      let metadata = {};
      try {
        const head = await s3.headObject({ Bucket: bucketName, Key: obj.Key }).promise();
        metadata = head.Metadata;
      } catch (err) {
        logger.warn(`Failed to fetch metadata for ${obj.Key}`, err);
      }
      results.push({ key: obj.Key, metadata });
    }

    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };
  } catch (err) {
    logger.error('Failed to list invoices from S3', err);
    return { statusCode: 500, body: 'Error listing invoices.' };
  }
};
