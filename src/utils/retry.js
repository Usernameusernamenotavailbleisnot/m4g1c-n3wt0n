// src/utils/retry.js
const logger = require('./logger');
const { sleep, randomInt } = require('./helpers');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn Function to retry (must return a Promise)
 * @param {Object} options Retry options
 * @returns {Promise} Resolves with the result of the function call
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 5,
    initialDelayMs = 1000, 
    maxDelayMs = 30000,
    retryableErrors = [],
    logPrefix = ''
  } = options;
  
  let attempts = 0;
  let lastError;
  
  while (attempts < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      attempts++;
      lastError = error;
      
      // Check if this error type should trigger a retry
      const shouldRetry = retryableErrors.length === 0 || 
        retryableErrors.some(errMsg => error.message && error.message.includes(errMsg));
      
      if (!shouldRetry || attempts >= maxAttempts) break;
      
      // Check for connection errors
      const isConnectionError = error.message && (
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('socket hang up') ||
        error.message.includes('network error')
      );
      
      // Calculate exponential backoff with jitter
      let delay = Math.min(initialDelayMs * Math.pow(2, attempts - 1), maxDelayMs);
      
      // Add more delay for connection errors
      if (isConnectionError) {
        delay = Math.min(delay * 2, maxDelayMs);
        logger.debug(`${logPrefix}Connection error detected, waiting longer before retry...`);
      }
      
      // Add jitter to prevent thundering herd problem
      const jitter = randomInt(0, Math.floor(delay * 0.3));
      const waitTime = Math.floor(delay + jitter);
      
      logger.debug(`${logPrefix}Request failed (${error.message}), retrying in ${waitTime}ms (attempt ${attempts}/${maxAttempts})`);
      await sleep(waitTime);
    }
  }
  
  throw lastError;
}

module.exports = { retry };