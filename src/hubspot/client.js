// HubSpot API Client Setup
const hubspot = require('@hubspot/api-client');
const AWS = require('aws-sdk');
const config = require('../config');
const logger = require('../utils/logger');

let clientInstance;

/**
 * Retrieves the HubSpot API key, first trying environment variables,
 * then AWS Secrets Manager.
 * @async
 * @returns {string} The HubSpot API key.
 * @throws {Error} If the API key cannot be retrieved.
 */
const getApiKey = async () => {
  if (process.env.HUBSPOT_API_KEY) {
    logger.info('Using HubSpot API key from environment variable.');
    return process.env.HUBSPOT_API_KEY;
  }

  if (config.HUBSPOT_API_KEY_SECRET_ID) {
    logger.info(`Attempting to retrieve HubSpot API key from AWS Secrets Manager (Secret ID: ${config.HUBSPOT_API_KEY_SECRET_ID}).`);
    const secretsManager = new AWS.SecretsManager({ region: config.AWS_REGION });
    try {
      const secretValue = await secretsManager.getSecretValue({ SecretId: config.HUBSPOT_API_KEY_SECRET_ID }).promise();
      if (secretValue.SecretString) {
        const secret = JSON.parse(secretValue.SecretString);
        // Assuming the secret is stored as a JSON object with a key like 'HUBSPOT_API_KEY'
        // Adjust the key name if it's different in your secret.
        const apiKey = secret.HUBSPOT_API_KEY || secret.apiKey || secret.api_key;
        if (apiKey) {
          logger.info('Successfully retrieved HubSpot API key from AWS Secrets Manager.');
          return apiKey;
        }
        logger.error('API key not found within the secret string from Secrets Manager.', { secretName: config.HUBSPOT_API_KEY_SECRET_ID });
        throw new Error(`API key not found within the secret string from Secrets Manager: ${config.HUBSPOT_API_KEY_SECRET_ID}`);
      }
      logger.error('SecretString is empty in the response from Secrets Manager.', { secretName: config.HUBSPOT_API_KEY_SECRET_ID });
      throw new Error(`SecretString is empty for secret: ${config.HUBSPOT_API_KEY_SECRET_ID}`);
    } catch (error) {
      logger.error('Error retrieving HubSpot API key from AWS Secrets Manager:', error);
      throw new Error(`Failed to retrieve HubSpot API key from Secrets Manager: ${error.message}`);
    }
  }

  logger.error('HubSpot API Key not found. Set HUBSPOT_API_KEY environment variable or HUBSPOT_API_KEY_SECRET_ID in config.');
  throw new Error('HubSpot API Key is missing.');
};

/**
 * Initializes and returns a HubSpot API client.
 * Uses a singleton pattern to avoid re-initializing the client on subsequent calls within the same Lambda invocation.
 *
 * @async
 * @returns {hubspot.Client} The initialized HubSpot client.
 */
const getClient = async () => {
  if (clientInstance) {
    logger.info('Returning existing HubSpot client instance.');
    return clientInstance;
  }

  try {
    const apiKey = await getApiKey();
    clientInstance = new hubspot.Client({ accessToken: apiKey });
    logger.info('HubSpot client initialized successfully.');
    return clientInstance;
  } catch (error) {
    logger.error('Failed to initialize HubSpot client:', error);
    // Re-throw the error to be caught by the main handler
    throw error;
  }
};

// Export getClient directly as it's the primary function to be used.
// getApiKey is an internal helper.
module.exports = { getClient };