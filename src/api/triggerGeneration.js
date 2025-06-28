const processor = require('../index');
const logger = require('../utils/logger');

/**
 * Lambda handler that triggers the invoice generation process.
 * Accepts options via HTTP request body and forwards them to the main handler.
 */
exports.handler = async (event, context) => {
  let options = {};
  try {
    if (event.body) {
      options = JSON.parse(event.body);
    }
  } catch (err) {
    logger.warn('Failed to parse request body', err);
    return { statusCode: 400, body: 'Invalid JSON body.' };
  }

  try {
    const result = await processor.handler(options, context);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    logger.error('Invoice generation failed', err);
    return { statusCode: 500, body: 'Error triggering generation.' };
  }
};
