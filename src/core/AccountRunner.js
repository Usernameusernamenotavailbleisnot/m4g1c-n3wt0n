// src/core/AccountRunner.js
const WalletService = require('../services/WalletService');
const ApiClient = require('../services/ApiClient');
const AuthService = require('../services/AuthService');
const QuestService = require('../services/QuestService');
const logger = require('../utils/logger');
const { withTimeout, sleep } = require('../utils/helpers');

/**
 * Handles the execution of a single account
 */
class AccountRunner {
  /**
   * Create a new AccountRunner
   * @param {Object} options Configuration options
   * @param {number} options.accountIndex Account index number
   * @param {string} options.privateKey Private key for the account
   * @param {string} options.proxy Proxy string if using proxies
   * @param {Object} options.config Global configuration object
   */
  constructor(options) {
    this.accountIndex = options.accountIndex;
    this.privateKey = options.privateKey;
    this.proxy = options.proxy;
    this.config = options.config;
    this.logPrefix = `[Account ${this.accountIndex}] `;
    
    // The maximum time allowed for account processing (3 minutes)
    this.ACCOUNT_TIMEOUT = 180000;
  }

  /**
   * Run the account processing
   * @returns {Promise<Object>} Processing result
   */
  async run() {
    const startTime = Date.now();
    let wallet = null;
    
    logger.info(`${this.logPrefix}Processing account`);
    
    try {
      // Create wallet from private key (minimal logging)
      try {
        wallet = WalletService.createWallet(this.privateKey, { accountIndex: this.accountIndex });
      } catch (error) {
        logger.error(`${this.logPrefix}Failed to create wallet: ${error.message}`);
        return {
          error: `Invalid private key: ${error.message}`,
          completedQuests: []
        };
      }
      
      // Create API client
      const api = new ApiClient({
        userAgent: this.config.bot.user_agent,
        proxy: this.proxy,
        accountIndex: this.accountIndex,
        retries: this.config.bot.retries
      });
      
      // Check for timeout
      if (this._isTimeoutApproaching(startTime)) {
        return {
          wallet: wallet.address,
          error: 'Processing timeout before authentication',
          completedQuests: []
        };
      }
      
      // Authenticate
      const auth = new AuthService(api, this.config, { accountIndex: this.accountIndex });
      let session;
      
      try {
        const authPromise = auth.authenticate(wallet);
        session = await withTimeout(
          authPromise,
          60000, // 60 seconds timeout
          `Authentication timed out for account ${this.accountIndex}`
        );
        
        // Wait after authentication
        await sleep(2000);
      } catch (authError) {
        logger.error(`${this.logPrefix}Authentication failed: ${authError.message}`);
        return {
          wallet: wallet.address,
          error: `Authentication failed: ${authError.message}`,
          completedQuests: []
        };
      }
      
      // Initialize result object
      const result = {
        wallet: wallet.address,
        completedQuests: []
      };
      
      // Get user info but don't log sensitive details
      try {
        await withTimeout(api.getUserInfo(), 15000, 'User info retrieval timed out');
        // No additional logging here
      } catch (userInfoError) {
        logger.debug(`${this.logPrefix}Error getting user info: ${userInfoError.message}`);
      }
      
      // Check for timeout
      if (this._isTimeoutApproaching(startTime)) {
        return {
          wallet: wallet.address,
          error: 'Processing timeout before quests',
          completedQuests: []
        };
      }
      
      // Complete quests
      try {
        const questService = new QuestService(api, this.config, { accountIndex: this.accountIndex });
        
        const questsPromise = questService.completeQuests();
        const completedQuests = await withTimeout(
          questsPromise,
          90000, // 90 seconds timeout
          `Quest completion timed out for account ${this.accountIndex}`
        );
        
        result.completedQuests = completedQuests || [];
        
        // Only log the number of completed quests
        if (result.completedQuests.length > 0) {
          logger.success(`${this.logPrefix}Completed ${result.completedQuests.length} quests`);
        } else {
          logger.info(`${this.logPrefix}No quests completed`);
        }
      } catch (questError) {
        logger.error(`${this.logPrefix}Quest error: ${questError.message}`);
        result.questError = questError.message;
      }
      
      return result;
    } catch (error) {
      logger.error(`${this.logPrefix}Account processing error: ${error.message}`);
      
      return {
        wallet: wallet ? wallet.address : null,
        error: error.message,
        completedQuests: []
      };
    } finally {
      const totalTime = (Date.now() - startTime) / 1000;
      logger.info(`${this.logPrefix}Finished (took ${totalTime.toFixed(1)}s)`);
    }
  }

  /**
   * Check if we're approaching the timeout limit
   * @param {number} startTime Processing start time
   * @returns {boolean} Whether we're approaching timeout
   * @private
   */
  _isTimeoutApproaching(startTime) {
    // Check if we have less than 30 seconds remaining
    return Date.now() - startTime > this.ACCOUNT_TIMEOUT - 30000;
  }
}

module.exports = AccountRunner;