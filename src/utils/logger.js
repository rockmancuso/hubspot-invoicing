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

/**
 * Formats a number as currency with thousands separators and dollar sign.
 * @param {number} amount - The amount to format.
 * @param {string} [currency='USD'] - The currency code.
 * @returns {string} The formatted currency string (e.g., "$1,500.00").
 */
const formatCurrency = (amount, currency = 'USD') => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '$0.00';
  }
  
  // Format with thousands separators and 2 decimal places
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  
  return formatted;
};

module.exports = {
  info,
  warn,
  error,
  formatCurrency
};