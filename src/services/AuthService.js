// src/services/AuthService.js
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');
const WalletService = require('./WalletService');
const CaptchaService = require('./CaptchaService');

/**
 * Service for handling authentication
 */
class AuthService {
  /**
   * Create a new authentication service
   * @param {ApiClient} api API client
   * @param {Object} config Configuration
   * @param {Object} accountInfo Account information
   */
  constructor(api, config, accountInfo = {}) {
    this.api = api;
    this.config = config;
    this.accountIndex = accountInfo.accountIndex;
    this.logPrefix = accountInfo.accountIndex ? `[Account ${accountInfo.accountIndex}] ` : '';
    this.captchaService = new CaptchaService(config.captcha, accountInfo);
  }
  
  /**
   * Authenticate with the platform
   * @param {ethers.Wallet} wallet Ethereum wallet
   * @returns {Promise<Object>} Session information
   */
  async authenticate(wallet) {
    let authAttempts = 0;
    const maxAuthAttempts = 3;
    
    while (authAttempts < maxAuthAttempts) {
      authAttempts++;
      
      try {
        logger.info(`${this.logPrefix}Authentication attempt ${authAttempts}/${maxAuthAttempts}`);
        
        // Get CSRF token
        let csrfToken;
        try {
          csrfToken = await this.api.getCsrfToken();
        } catch (csrfError) {
          logger.debug(`${this.logPrefix}CSRF token error: ${csrfError.message}, using fallback token`);
          csrfToken = Math.random().toString(36).substring(2, 15);
        }
        
        // Create and sign authentication message
        const walletAddress = wallet.address;
        const message = WalletService.createAuthMessage(walletAddress, csrfToken);
        const signature = await WalletService.signMessage(message, wallet, { accountIndex: this.accountIndex });
        
        // Solve captchas
        const captchaResults = await this._solveCaptchas();
        
        if (!captchaResults.recaptchaToken && !captchaResults.recaptchaTokenV2) {
          throw new Error('All captchas failed to solve');
        }
        
        // Prepare login payload
        const payload = this._createLoginPayload({
          message,
          signature,
          csrfToken,
          captchaResults
        });
        
        // Send login request
        logger.info(`${this.logPrefix}Sending login request`);
        const loginResponse = await this._sendLoginRequest(payload);
        
        // Allow time for the session to initialize
        logger.debug(`${this.logPrefix}Waiting for session to initialize...`);
        await sleep(5000);
        
        // Get session
        const session = await this._getSession(wallet);
        
        return session;
      } catch (error) {
        logger.error(`${this.logPrefix}Authentication error (attempt ${authAttempts}/${maxAuthAttempts}): ${error.message}`);
        
        if (authAttempts >= maxAuthAttempts) {
          // On last attempt, return a fake session instead of failing
          logger.warn(`${this.logPrefix}All authentication attempts failed, returning fake session`);
          return { 
            user: { 
              address: wallet.address,
              name: wallet.address.substring(0, 8),
              fake: true
            } 
          };
        }
        
        // Wait before next attempt - increasing delay
        const waitTime = 5000 * authAttempts; // 5s, 10s, 15s
        logger.info(`${this.logPrefix}Waiting ${waitTime/1000}s before next authentication attempt`);
        await sleep(waitTime);
      }
    }
  }
  
  /**
   * Solve needed captchas
   * @returns {Promise<Object>} Captcha tokens
   * @private
   */
  async _solveCaptchas() {
    try {
      logger.info(`${this.logPrefix}Solving captchas`);
      
      const captchaConfigs = [
        // Invisible reCAPTCHA
        {
          name: 'recaptchaToken',
          siteKey: this.config.captcha.types.recaptcha_v2.invisible_sitekey,
          url: 'https://www.magicnewton.com/portal',
          type: 'recaptchaV2',
          isInvisible: true,
          timeout: this.config.captcha.timeout || 120
        },
        
        // Visible reCAPTCHA
        {
          name: 'recaptchaTokenV2',
          siteKey: this.config.captcha.types.recaptcha_v2.visible_sitekey,
          url: 'https://www.magicnewton.com/portal',
          type: 'recaptchaV2',
          isInvisible: false,
          timeout: this.config.captcha.timeout || 120
        }
      ];
      
      return await this.captchaService.solveMultiple(captchaConfigs);
    } catch (error) {
      logger.error(`${this.logPrefix}Captcha solving error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create login payload
   * @param {Object} options Options
   * @returns {URLSearchParams} Login payload
   * @private
   */
  _createLoginPayload(options) {
    const { message, signature, csrfToken, captchaResults } = options;
    
    // Get referral code if configured
    let refCode = '';
    if (this.config.referral && this.config.referral.code) {
      refCode = this.config.referral.code;
    }
    
    // Create payload
    const payload = new URLSearchParams({
      'message': message,
      'signature': signature,
      'redirect': 'false',
      'csrfToken': csrfToken,
      'callbackUrl': 'https://www.magicnewton.com/portal',
      'json': 'true'
    });
    
    // Add captcha tokens if available
    if (captchaResults.recaptchaToken) {
      payload.append('recaptchaToken', captchaResults.recaptchaToken);
    }
    
    if (captchaResults.recaptchaTokenV2) {
      payload.append('recaptchaTokenV2', captchaResults.recaptchaTokenV2);
    }
    
    // Add referral code if available
    if (refCode) {
      payload.append('refCode', refCode);
    }
    
    payload.append('botScore', '1');
    
    return payload;
  }
  
  /**
   * Send login request
   * @param {URLSearchParams} payload Login payload
   * @returns {Promise<Object>} Login response
   * @private
   */
  async _sendLoginRequest(payload) {
    try {
      // Add custom header for better browser mimicking
      const refCode = this.config.referral && this.config.referral.code ? this.config.referral.code : '';
      const loginHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.magicnewton.com',
        'Referer': 'https://www.magicnewton.com/portal?referral=' + (refCode || '')
      };
      
      return await this.api.login(payload, loginHeaders);
    } catch (error) {
      logger.error(`${this.logPrefix}Login request error: ${error.message}`);
      // Return default response to allow continuation
      return { error: error.message };
    }
  }
  
  /**
   * Get session information
   * @param {ethers.Wallet} wallet Wallet for creating default session
   * @returns {Promise<Object>} Session information
   * @private
   */
  async _getSession(wallet) {
    // Create a default session
    const defaultSession = { 
      user: { 
        address: wallet.address,
        name: wallet.address.substring(0, 8) 
      } 
    };
    
    try {
      const sessionResponse = await this.api.getSession();
      
      if (sessionResponse && sessionResponse.user) {
        // Only log the address, not other user info
        const shortAddress = sessionResponse.user.address ?
          (sessionResponse.user.address.substring(0, 6) + '...' + sessionResponse.user.address.slice(-4)) :
          wallet.address.substring(0, 6) + '...' + wallet.address.slice(-4);
          
        logger.info(`${this.logPrefix}Session authenticated for ${shortAddress}`);
        return sessionResponse;
      } else {
        logger.warn(`${this.logPrefix}No user found in session, using default session`);
        
        // Try one more time after a delay
        await sleep(5000);
        
        try {
          const retrySessionResponse = await this.api.getSession();
          if (retrySessionResponse && retrySessionResponse.user) {
            logger.success(`${this.logPrefix}Retry session successful`);
            return retrySessionResponse;
          } else {
            logger.warn(`${this.logPrefix}Retry session failed, using default session`);
          }
        } catch (retrySessionError) {
          logger.debug(`${this.logPrefix}Retry session error: ${retrySessionError.message}`);
        }
      }
    } catch (sessionError) {
      logger.debug(`${this.logPrefix}Session error: ${sessionError.message}`);
    }
    
    return defaultSession;
  }
}

module.exports = AuthService;