const logger = require('./logger');

/**
 * Utility class for handling retries, timeouts, and delays
 */
class RetryUtils {
  /**
   * Sleep for the specified duration
   * @param {number} ms Milliseconds to sleep
   * @returns {Promise} Resolves after the specified time
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate a random integer between min and max (inclusive)
   * @param {number} min Minimum value
   * @param {number} max Maximum value
   * @returns {number} Random integer
   */
  static randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Executes a function with a timeout
   * @param {Promise} promise The promise to execute with timeout
   * @param {number} timeoutMs Timeout in milliseconds
   * @param {string} errorMessage Custom error message
   * @returns {Promise} The original promise, or rejects with timeout error
   */
  static withTimeout(promise, timeoutMs, errorMessage) {
    const timeoutPromise = new Promise((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    return Promise.race([
      promise,
      timeoutPromise
    ]);
  }

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn Function to retry (must return a Promise)
   * @param {Object} options Retry options
   * @param {number} options.maxAttempts Maximum number of attempts
   * @param {number} options.initialDelayMs Initial delay in ms
   * @param {number} options.maxDelayMs Maximum delay in ms
   * @param {Array<string>} options.retryableErrors Error messages that should trigger a retry
   * @returns {Promise} Resolves with the result of the function call
   */
  static async retry(fn, options = {}) {
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
        
        // Check for connection errors to potentially wait longer
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
          logger.warn(`${logPrefix}Connection error detected, waiting longer before retry...`);
        }
        
        // Add jitter to prevent thundering herd problem
        const jitter = this.randomInt(0, Math.floor(delay * 0.3));
        const waitTime = Math.floor(delay + jitter);
        
        logger.warn(`${logPrefix}Request failed (${error.message}), retrying in ${waitTime}ms (attempt ${attempts}/${maxAttempts})`);
        await this.sleep(waitTime);
      }
    }
    
    throw lastError;
  }
}

module.exports = RetryUtils;