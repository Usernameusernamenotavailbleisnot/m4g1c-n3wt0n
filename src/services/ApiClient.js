// src/services/ApiClient.js
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

/**
 * API Client for Magic Newton platform
 */
class ApiClient {
  /**
   * Create a new API client
   * @param {Object} options API client options
   */
  constructor(options = {}) {
    this.options = options;
    this.accountIndex = options.accountIndex;
    this.logPrefix = options.accountIndex ? `[Account ${options.accountIndex}] ` : '';
    
    // Create axios instance
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
    
    // Set up interceptors
    this._setupInterceptors();
  }
  
  /**
   * Set up proxy for axios
   * @param {string} proxyString Proxy string
   * @private
   */
  _setupProxy(proxyString) {
    try {
      if (!proxyString) return;
      
      logger.debug(`${this.logPrefix}Setting up proxy: ${proxyString}`);
      
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
      let proxyUrl = auth 
        ? `http://${auth}@${host}:${port}`
        : `http://${host}:${port}`;
      
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
   * Set up axios interceptors
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
          logger.debug(`${this.logPrefix}API Error: ${error.response.status} ${error.config.method.toUpperCase()} ${error.config.url}`);
        } else if (error.request) {
          logger.debug(`${this.logPrefix}API Error: No response for ${error.config.method.toUpperCase()} ${error.config.url} - ${error.message}`);
        } else {
          logger.debug(`${this.logPrefix}API Error: ${error.message}`);
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
    return retry(async () => {
      try {
        const response = await this.client.get('/api/auth/session');
        return response.data;
      } catch (error) {
        // Handle 401 Unauthorized as a special case
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
    return retry(async () => {
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
    return retry(async () => {
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
    return retry(async () => {
      try {
        const response = await this.client.get('/api/user');
        return response.data;
      } catch (error) {
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
    return retry(async () => {
      try {
        const response = await this.client.get('/api/quests');
        return response.data;
      } catch (error) {
        // Handle empty data
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
    return retry(async () => {
      try {
        const response = await this.client.get('/api/userQuests');
        return response.data;
      } catch (error) {
        // Handle empty data
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
   * Start a minesweeper game
   * @param {string} difficulty Game difficulty (EASY, NORMAL, HARD)
   * @returns {Promise<Object>} Game response
   */
  async startMinesweeperGame(difficulty = "EASY") {
    return retry(async () => {
      try {
        const response = await this.client.post('/api/userQuests', {
          questId: "44ec9674-6125-4f88-9e18-8d6d6be8f156",
          metadata: {
            action: "START",
            difficulty
          }
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

  /**
   * Make a move in minesweeper game
   * @param {string} userQuestId User quest ID
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @returns {Promise<Object>} Move response
   */
  async clickMinesweeperTile(userQuestId, x, y) {
    return retry(async () => {
      try {
        const response = await this.client.post('/api/userQuests', {
          questId: "44ec9674-6125-4f88-9e18-8d6d6be8f156",
          metadata: {
            action: "CLICK",
            userQuestId,
            x,
            y
          }
        });
        return response.data;
      } catch (error) {
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

  /**
   * Flag a minesweeper tile
   * @param {string} userQuestId User quest ID
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @returns {Promise<Object>} Flag response
   */
  async flagMinesweeperTile(userQuestId, x, y) {
    return retry(async () => {
      try {
        const response = await this.client.post('/api/userQuests', {
          questId: "44ec9674-6125-4f88-9e18-8d6d6be8f156",
          metadata: {
            action: "FLAG",
            userQuestId,
            x,
            y
          }
        });
        return response.data;
      } catch (error) {
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
  /**
   * Complete a quest
   * @param {string} questId Quest ID
   * @param {Object} metadata Quest metadata (empty object for daily dice roll)
   * @returns {Promise<Object>} Quest completion response
   */
  async completeQuest(questId, metadata = {}) {
    return retry(async () => {
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
