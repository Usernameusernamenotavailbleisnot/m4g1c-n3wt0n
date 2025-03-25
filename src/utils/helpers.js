/**
 * Sleep for the specified duration
 * @param {number} ms Milliseconds to sleep
 * @returns {Promise} Resolves after the specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate a random integer between min and max (inclusive)
   * @param {number} min Minimum value
   * @param {number} max Maximum value
   * @returns {number} Random integer
   */
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * Executes a function with a timeout
   * @param {Promise} promise The promise to execute with timeout
   * @param {number} timeoutMs Timeout in milliseconds
   * @param {string} errorMessage Custom error message
   * @returns {Promise} The original promise, or rejects with timeout error
   */
  function withTimeout(promise, timeoutMs, errorMessage) {
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
  
  module.exports = {
    sleep,
    randomInt,
    withTimeout
  };