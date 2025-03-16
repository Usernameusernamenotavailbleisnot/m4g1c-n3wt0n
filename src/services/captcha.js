const axios = require('axios');
const logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');

/**
 * Service for solving captchas
 */
class CaptchaService {
  /**
   * Create a new captcha service
   * @param {Object} config Captcha configuration
   * @param {string} config.api_key Captcha API key
   * @param {number} config.timeout Timeout in seconds
   * @param {Object} accountInfo Account information for logging
   */
  constructor(config, accountInfo = {}) {
    this.config = config;
    this.accountIndex = accountInfo.accountIndex;
    this.logPrefix = accountInfo.accountIndex ? `[Account ${accountInfo.accountIndex}] ` : '';
  }
  
  /**
   * Solve a captcha
   * @param {Object} options Captcha options
   * @param {string} options.siteKey Captcha site key
   * @param {string} options.url Website URL
   * @param {string} options.type Captcha type (recaptchaV2, turnstile)
   * @param {boolean} options.isInvisible Whether the captcha is invisible
   * @param {number} options.timeout Timeout in seconds
   * @returns {Promise<string>} Captcha solution
   */
  async solve(options) {
    const { 
      siteKey, 
      url, 
      type, 
      isInvisible = false, 
      timeout = this.config.timeout || 120 
    } = options;
    
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      try {
        if (!this.config.api_key || !siteKey || !url || !type) {
          throw new Error('Missing required captcha parameters');
        }
        
        logger.info(`${this.logPrefix}Captcha attempt ${attempts}/${maxAttempts} for ${type}${isInvisible ? ' (invisible)' : ''}`);
        
        // Create task based on captcha type
        let task;
        if (type === 'recaptchaV2') {
          task = {
            type: 'ReCaptchaV2TaskProxyless',
            websiteURL: url,
            websiteKey: siteKey
          };
          
          if (isInvisible) {
            task.isInvisible = true;
            logger.info(`${this.logPrefix}Setting up invisible reCAPTCHA v2`);
          } else {
            logger.info(`${this.logPrefix}Setting up standard reCAPTCHA v2`);
          }
        } else if (type === 'turnstile') {
          task = {
            type: 'AntiTurnstileTaskProxyless',
            websiteURL: url,
            websiteKey: siteKey
          };
          
          logger.info(`${this.logPrefix}Setting up Turnstile captcha`);
        } else {
          throw new Error(`Unsupported captcha type: ${type}`);
        }
        
        // Create captcha task
        const createTaskResponse = await axios.post('https://api.capsolver.com/createTask', {
          clientKey: this.config.api_key,
          task: task
        }, {
          timeout: 30000
        });
        
        if (createTaskResponse.data.errorId > 0) {
          const errorCode = createTaskResponse.data.errorCode;
          const errorDesc = createTaskResponse.data.errorDescription;
          throw new Error(`Capsolver error: [${errorCode}] ${errorDesc}`);
        }
        
        const taskId = createTaskResponse.data.taskId;
        logger.info(`${this.logPrefix}Captcha task created: ${taskId}`);
        
        // Get task result
        let startTime = Date.now();
        let solution = null;
        
        logger.info(`${this.logPrefix}Waiting for captcha solution (timeout: ${timeout}s)...`);
        
        while (Date.now() - startTime < timeout * 1000) {
          await RetryUtils.sleep(3000); // Poll every 3 seconds
          
          const getTaskResponse = await axios.post('https://api.capsolver.com/getTaskResult', {
            clientKey: this.config.api_key,
            taskId: taskId
          }, {
            timeout: 10000
          });
          
          if (getTaskResponse.data.errorId > 0) {
            const errorCode = getTaskResponse.data.errorCode;
            const errorDesc = getTaskResponse.data.errorDescription;
            throw new Error(`Capsolver error: [${errorCode}] ${errorDesc}`);
          }
          
          logger.info(`${this.logPrefix}Captcha task status: ${getTaskResponse.data.status}`);
          
          if (getTaskResponse.data.status === 'ready') {
            if (type === 'recaptchaV2') {
              solution = getTaskResponse.data.solution.gRecaptchaResponse;
            } else if (type === 'turnstile') {
              solution = getTaskResponse.data.solution.token;
            }
            break;
          } else if (getTaskResponse.data.status === 'failed') {
            throw new Error(`Captcha task failed: ${getTaskResponse.data.errorDescription || 'Unknown error'}`);
          }
        }
        
        if (!solution) {
          throw new Error(`Captcha solving timeout after ${timeout} seconds`);
        }
        
        logger.success(`${this.logPrefix}Captcha solved successfully`);
        return solution;
      } catch (error) {
        logger.error(`${this.logPrefix}Captcha solving error (attempt ${attempts}/${maxAttempts}): ${error.message}`, error);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        const waitTime = 5000 * attempts;
        await RetryUtils.sleep(waitTime);
      }
    }
  }
  
  /**
   * Solve multiple captchas simultaneously
   * @param {Array<Object>} captchaConfigs Array of captcha configs
   * @returns {Promise<Object>} Object with captcha solutions
   */
  async solveMultiple(captchaConfigs) {
    try {
      logger.info(`${this.logPrefix}Solving ${captchaConfigs.length} captchas simultaneously`);
      
      // Use Promise.allSettled to handle all captchas, with individual error handling
      const captchaPromises = await Promise.allSettled(
        captchaConfigs.map(config => this.solve(config))
      );
      
      // Process results into an object
      const results = {};
      
      captchaConfigs.forEach((config, index) => {
        const result = captchaPromises[index];
        const key = config.name || `captcha${index}`;
        
        if (result.status === 'fulfilled') {
          results[key] = result.value;
          logger.success(`${this.logPrefix}${config.type} captcha solved successfully`);
        } else {
          results[key] = null;
          logger.error(`${this.logPrefix}${config.type} captcha failed: ${result.reason}`);
        }
      });
      
      // Check if all captchas failed
      const allFailed = Object.values(results).every(result => result === null);
      if (allFailed) {
        throw new Error('All captchas failed to solve');
      }
      
      return results;
    } catch (error) {
      logger.error(`${this.logPrefix}Multiple captcha solving error: ${error.message}`, error);
      throw error;
    }
  }
}

module.exports = CaptchaService;