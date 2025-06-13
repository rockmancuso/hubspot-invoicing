// Error Handling Utilities
const AWS = require('aws-sdk');
const logger =require('./logger');
const config = require('../config');

/**
 * Logs an error with additional context.
 *
 * @param {Error} errorObject - The error object.
 * @param {string} [contextMessage] - A message describing the context where the error occurred.
 * @param {object} [additionalInfo={}] - Optional additional information to log.
 */
const logError = (errorObject, contextMessage, additionalInfo = {}) => {
  const message = contextMessage ? `${contextMessage}: ${errorObject.message}` : errorObject.message;
  logger.error(message, {
    errorMessage: errorObject.message,
    errorStack: errorObject.stack,
    errorName: errorObject.name,
    ...additionalInfo,
  });
};

/**
 * Sends an error notification via Amazon SES.
 *
 * @async
 * @param {Error} errorObject - The error object.
 * @param {object} [lambdaEvent={}] - The AWS Lambda event object.
 * @param {object} [lambdaContext={}] - The AWS Lambda context object.
 * @returns {Promise<void>}
 */
const sendErrorNotification = async (errorObject, lambdaEvent = {}, lambdaContext = {}) => {
  if (config.ENABLE_ERROR_NOTIFICATIONS !== 'true') {
    logger.info('Error notifications are disabled. Skipping SES email.');
    return;
  }

  if (!config.SES_ERROR_RECIPIENT_EMAIL || !config.SES_SENDER_EMAIL) {
    logger.error('SES recipient or sender email not configured. Cannot send error notification.');
    return;
  }

  const ses = new AWS.SES({ region: config.AWS_REGION || 'us-east-1' });
  const subject = `Error in HubSpot Invoicing Lambda: ${lambdaContext.functionName || 'N/A'}`;

  let bodyText = `An error occurred in the HubSpot Invoicing Lambda function.\n\n`;
  bodyText += `Function Name: ${lambdaContext.functionName || 'N/A'}\n`;
  bodyText += `AWS Request ID: ${lambdaContext.awsRequestId || 'N/A'}\n`;
  bodyText += `Log Stream Name: ${lambdaContext.logStreamName || 'N/A'}\n\n`;
  bodyText += `Error Message: ${errorObject.message}\n\n`;
  bodyText += `Error Stack:\n${errorObject.stack}\n\n`;
  bodyText += `Event Details:\n${JSON.stringify(lambdaEvent, null, 2)}\n`;

  const params = {
    Destination: {
      ToAddresses: [config.SES_ERROR_RECIPIENT_EMAIL],
    },
    Message: {
      Body: {
        Text: {
          Data: bodyText,
          Charset: 'UTF-8',
        },
      },
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
    },
    Source: config.SES_SENDER_EMAIL,
  };

  try {
    logger.info(`Sending error notification to ${config.SES_ERROR_RECIPIENT_EMAIL}`);
    await ses.sendEmail(params).promise();
    logger.info('Error notification email sent successfully.');
  } catch (emailError) {
    logger.error('Failed to send error notification email via SES:', emailError);
    // Log this failure, but don't let it crash the main error handling flow
  }
};

module.exports = {
  logError,
  sendErrorNotification,
};