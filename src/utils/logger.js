// Logging Utilities

/**
 * Logs an informational message.
 * @param {string} message - The message to log.
 * @param {object} [details] - Optional details object to log.
 */
const info = (message, details) => {
  console.log(`INFO: ${message}`, details || '');
};

/**
 * Logs a warning message.
 * @param {string} message - The message to log.
 * @param {object} [details] - Optional details object to log.
 */
const warn = (message, details) => {
  console.warn(`WARN: ${message}`, details || '');
};

/**
 * Logs an error message.
 * @param {string} message - The message to log.
 * @param {Error|object} [error] - Optional error object or details.
 */
const error = (message, errorDetails) => {
  console.error(`ERROR: ${message}`, errorDetails || '');
};

module.exports = {
  info,
  warn,
  error,
};