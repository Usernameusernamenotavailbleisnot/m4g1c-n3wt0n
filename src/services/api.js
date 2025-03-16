const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');

/**
 * API Client for Magic Newton platform
 * Handles all API requests with proper error handling and retries
 */
class ApiClient {
  /**
   * Create a new API client
   * @param {Object} options API client options
   * @param {string} options.userAgent User agent string
   * @param {string} options.proxy Proxy string (user:pass@host:port)
   * @param {number} options.accountIndex Account index for logging
   * @param {Object} options.retries Retry configuration
   */
  constructor(options = {}) {
    this.options = options;
    this.accountIndex = options.accountIndex;
    this.logPrefix = options.accountIndex ? `[Account ${options.accountIndex}] ` : '';
    
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: 'https://www.magicnewton.com/portal',
      headers: {
        'User-Agent': options.userAgent,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Origin': 'https://www.magicnewton.com',
        'Referer': 'https://www.magicnewton.com/portal',
        'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      withCredentials: true,
      timeout: 30000
    });
    
    // Set up proxy if provided
    if (options.proxy) {
      this._setupProxy(options.proxy);
    }
    
    // Set up response interceptor for logging and cookie handling
    this._setupInterceptors();
  }
  
  /**
   * Set up proxy for axios
   * @param {string} proxyString Proxy string (user:pass@host:port)
   * @private
   */
  _setupProxy(proxyString) {
    try {
      if (!proxyString) return;
      
      logger.info(`${this.logPrefix}Setting up proxy: ${proxyString}`);
      
      // Parse proxy string (format: user:pass@host:port)
      let auth = null;
      let host = null;
      let port = null;
      
      if (proxyString.includes('@')) {
        const [authPart, hostPart] = proxyString.split('@');
        auth = authPart;
        
        if (hostPart.includes(':')) {
          const [hostValue, portValue] = hostPart.split(':');
          host = hostValue;
          port = parseInt(portValue);
        } else {
          host = hostPart;
          port = 80;
        }
      } else if (proxyString.includes(':')) {
        const [hostValue, portValue] = proxyString.split(':');
        host = hostValue;
        port = parseInt(portValue);
      } else {
        host = proxyString;
        port = 80;
      }
      
      // Construct proxy URL
      let proxyUrl;
      if (auth) {
        proxyUrl = `http://${auth}@${host}:${port}`;
      } else {
        proxyUrl = `http://${host}:${port}`;
      }
      
      // Create proxy agent
      const proxyAgent = new HttpsProxyAgent(proxyUrl);
      
      // Configure axios with proxy
      this.client.defaults.proxy = false;
      this.client.defaults.httpAgent = proxyAgent;
      this.client.defaults.httpsAgent = proxyAgent;
    } catch (error) {
      logger.error(`${this.logPrefix}Error setting up proxy: ${error.message}`, error);
    }
  }
  
  /**
   * Set up axios interceptors for logging and cookie handling
   * @private
   */
  _setupInterceptors() {
    // Response interceptor
    this.client.interceptors.response.use(
      response => {
        // Store cookies if they're in the response
        if (response.headers && response.headers['set-cookie']) {
          const cookies = response.headers['set-cookie'];
          this.client.defaults.headers.Cookie = cookies.join('; ');
        }
        
        return response;
      },
      error => {
        if (error.response) {
          logger.error(`${this.logPrefix}API Error: ${error.response.status} ${error.config.method.toUpperCase()} ${error.config.url}`, 
            error.response.data ? { data: error.response.data } : undefined);
        } else if (error.request) {
          logger.error(`${this.logPrefix}API Error: No response received for ${error.config.method.toUpperCase()} ${error.config.url} - ${error.message}`);
        } else {
          logger.error(`${this.logPrefix}API Error: ${error.message}`, error);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get session information
   * @returns {Promise<Object>} Session data
   */
  async getSession() {
    return RetryUtils.retry(async () => {
      try {
        const response = await this.client.get('/api/auth/session');
        return response.data;
      } catch (error) {
        // Handle 401 Unauthorized as a special case (logout/session expired)
        if (error.response && error.response.status === 401) {
          return { user: null };
        }
        throw error;
      }
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix
    });
  }
  
  /**
   * Get CSRF token
   * @returns {Promise<string>} CSRF token
   */
  async getCsrfToken() {
    return RetryUtils.retry(async () => {
      const response = await this.client.get('/api/auth/csrf');
      return response.data.csrfToken;
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix
    });
  }
  
  /**
   * Log in to the platform
   * @param {URLSearchParams} payload Login payload
   * @param {Object} headers Additional headers
   * @returns {Promise<Object>} Login response
   */
  async login(payload, headers = {}) {
    return RetryUtils.retry(async () => {
      const response = await this.client.post('/api/auth/callback/credentials', payload, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers
        }
      });
      return response.data;
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix
    });
  }
  
  /**
   * Get user information
   * @returns {Promise<Object>} User data
   */
  async getUserInfo() {
    return RetryUtils.retry(async () => {
      try {
        const response = await this.client.get('/api/user');
        return response.data;
      } catch (error) {
        // Special handling for 401 errors - session might be expired
        if (error.response && error.response.status === 401) {
          throw new Error('Session expired or unauthorized');
        }
        throw error;
      }
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix
    });
  }
  
  /**
   * Get available quests
   * @returns {Promise<Object>} Quests data
   */
  async getQuests() {
    return RetryUtils.retry(async () => {
      try {
        const response = await this.client.get('/api/quests');
        return response.data;
      } catch (error) {
        // Handle empty data gracefully
        if (error.response && error.response.status === 204) {
          return { data: [] };
        }
        throw error;
      }
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix
    });
  }
  
  /**
   * Get user quests
   * @returns {Promise<Object>} User quests data
   */
  async getUserQuests() {
    return RetryUtils.retry(async () => {
      try {
        const response = await this.client.get('/api/userQuests');
        return response.data;
      } catch (error) {
        // Handle empty data gracefully
        if (error.response && error.response.status === 204) {
          return { data: [] };
        }
        throw error;
      }
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix
    });
  }
  
  /**
   * Complete a quest
   * @param {string} questId Quest ID
   * @param {Object} metadata Quest metadata
   * @returns {Promise<Object>} Quest completion response
   */
  async completeQuest(questId, metadata) {
    return RetryUtils.retry(async () => {
      try {
        const response = await this.client.post('/api/userQuests', {
          questId,
          metadata
        });
        return response.data;
      } catch (error) {
        // Handle "Quest already completed" as a non-error case
        if (error.response && 
            error.response.status === 400 && 
            error.response.data && 
            error.response.data.message === "Quest already completed") {
          return {
            data: {
              status: 'COMPLETED',
              _rolled_credits: 0,
              message: 'Quest already completed'
            }
          };
        }
        throw error;
      }
    }, {
      maxAttempts: this.options.retries?.max_attempts || 5,
      initialDelayMs: this.options.retries?.initial_delay || 1000,
      maxDelayMs: this.options.retries?.max_delay || 30000,
      logPrefix: this.logPrefix,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'socket hang up', 'network error', 'timeout']
    });
  }
}

module.exports = ApiClient;