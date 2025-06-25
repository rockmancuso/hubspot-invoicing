// Error Handling Utilities
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const logger = require('./logger');
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
 * Sends an error notification via Mailgun.
 *
 * @async
 * @param {Error} errorObject - The error object.
 * @param {object} [lambdaEvent={}] - The AWS Lambda event object.
 * @param {object} [lambdaContext={}] - The AWS Lambda context object.
 * @returns {Promise<void>}
 */
const sendErrorNotification = async (errorObject, lambdaEvent = {}, lambdaContext = {}) => {
  if (config.ENABLE_ERROR_NOTIFICATIONS !== 'true') {
    logger.info('Error notifications are disabled. Skipping Mailgun email.');
    return;
  }

  if (!config.MAILGUN_API_KEY || !config.MAILGUN_DOMAIN || !config.MAILGUN_ERROR_RECIPIENT_EMAIL) {
    logger.error('Mailgun configuration incomplete. Cannot send error notification.');
    return;
  }

  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({ username: 'api', key: config.MAILGUN_API_KEY });

  const subject = `Error in HubSpot Invoicing Lambda: ${lambdaContext.functionName || 'N/A'}`;

  let bodyText = `An error occurred in the HubSpot Invoicing Lambda function.\n\n`;
  bodyText += `Function Name: ${lambdaContext.functionName || 'N/A'}\n`;
  bodyText += `AWS Request ID: ${lambdaContext.awsRequestId || 'N/A'}\n`;
  bodyText += `Log Stream Name: ${lambdaContext.logStreamName || 'N/A'}\n\n`;
  bodyText += `Error Message: ${errorObject.message}\n\n`;
  bodyText += `Error Stack:\n${errorObject.stack}\n\n`;
  bodyText += `Event Details:\n${JSON.stringify(lambdaEvent, null, 2)}\n`;

  const messageData = {
    from: config.MAILGUN_SENDER_EMAIL,
    to: [config.MAILGUN_ERROR_RECIPIENT_EMAIL],
    subject: subject,
    text: bodyText
  };

  try {
    logger.info(`Sending error notification to ${config.MAILGUN_ERROR_RECIPIENT_EMAIL}`);
    await mg.messages.create(config.MAILGUN_DOMAIN, messageData);
    logger.info('Error notification email sent successfully.');
  } catch (emailError) {
    logger.error('Failed to send error notification email via Mailgun:', emailError);
    // Log this failure, but don't let it crash the main error handling flow
  }
};

module.exports = { logError, sendErrorNotification };