const logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');

/**
 * Service for managing proxies
 */
class ProxyService {
  /**
   * Create a new proxy service
   * @param {Array<string>} proxies Array of proxy strings
   * @param {Object} config Proxy configuration
   */
  constructor(proxies = [], config = {}) {
    this.proxies = proxies;
    this.config = config;
    this.currentIndex = 0;
  }
  
  /**
   * Get a proxy for an account
   * @param {number} accountIndex Account index
   * @returns {string|null} Proxy string or null if no proxies or proxies disabled
   */
  getProxyForAccount(accountIndex) {
    // If no proxies or proxies disabled, return null
    if (!this.config.enabled || !this.proxies || this.proxies.length === 0) {
      return null;
    }
    
    let proxyIndex;
    
    // Determine proxy index based on rotation mode
    if (this.config.rotation.mode === 'sequential') {
      // Use every proxy for N accounts, then move to the next proxy
      proxyIndex = Math.floor((accountIndex - 1) / this.config.rotation.switch_after) % this.proxies.length;
    } else if (this.config.rotation.mode === 'random') {
      // Choose a random proxy
      proxyIndex = Math.floor(Math.random() * this.proxies.length);
    } else {
      // Default to sequential
      proxyIndex = (accountIndex - 1) % this.proxies.length;
    }
    
    // Save current index for reference
    this.currentIndex = proxyIndex;
    
    logger.info(`[Account ${accountIndex}] Using proxy ${proxyIndex + 1}/${this.proxies.length}`);
    return this.proxies[proxyIndex];
  }
  
  /**
   * Get the next proxy in the list
   * @returns {string|null} Next proxy or null if no proxies
   */
  getNextProxy() {
    if (!this.proxies || this.proxies.length === 0) {
      return null;
    }
    
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return this.proxies[this.currentIndex];
  }
  
  /**
   * Get a random proxy from the list
   * @returns {string|null} Random proxy or null if no proxies
   */
  getRandomProxy() {
    if (!this.proxies || this.proxies.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * this.proxies.length);
    this.currentIndex = randomIndex;
    return this.proxies[randomIndex];
  }
  
  /**
   * Check if proxies are available and enabled
   * @returns {boolean} Whether proxies are available and enabled
   */
  areProxiesAvailable() {
    return this.config.enabled && this.proxies && this.proxies.length > 0;
  }
  
  /**
   * Get the current proxy being used
   * @returns {string|null} Current proxy or null if no proxies
   */
  getCurrentProxy() {
    if (!this.proxies || this.proxies.length === 0) {
      return null;
    }
    
    return this.proxies[this.currentIndex];
  }
}

module.exports = ProxyService;