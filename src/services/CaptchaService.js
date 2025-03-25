// src/services/CaptchaService.js
const axios = require('axios');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

/**
 * Service for solving captchas
 */
class CaptchaService {
  /**
   * Create a new captcha service
   * @param {Object} config Captcha configuration
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
        
        // Simplified logging - remove excessive status updates
        logger.debug(`${this.logPrefix}Solving ${type} captcha${isInvisible ? ' (invisible)' : ''}`);
        
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
          }
        } else if (type === 'turnstile') {
          task = {
            type: 'AntiTurnstileTaskProxyless',
            websiteURL: url,
            websiteKey: siteKey
          };
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
          throw new Error(`Capsolver error: [${createTaskResponse.data.errorCode}] ${createTaskResponse.data.errorDescription}`);
        }
        
        const taskId = createTaskResponse.data.taskId;
        logger.debug(`${this.logPrefix}Captcha task created: ${taskId}`);
        
        // Get task result
        let startTime = Date.now();
        let solution = null;
        
        logger.debug(`${this.logPrefix}Waiting for captcha solution (timeout: ${timeout}s)...`);
        
        while (Date.now() - startTime < timeout * 1000) {
          await sleep(3000); // Poll every 3 seconds
          
          const getTaskResponse = await axios.post('https://api.capsolver.com/getTaskResult', {
            clientKey: this.config.api_key,
            taskId: taskId
          }, {
            timeout: 10000
          });
          
          if (getTaskResponse.data.errorId > 0) {
            throw new Error(`Capsolver error: [${getTaskResponse.data.errorCode}] ${getTaskResponse.data.errorDescription}`);
          }
          
          logger.debug(`${this.logPrefix}Captcha task status: ${getTaskResponse.data.status}`);
          
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
        
        logger.debug(`${this.logPrefix}Captcha solved successfully`);
        return solution;
      } catch (error) {
        logger.error(`${this.logPrefix}Captcha solving error (attempt ${attempts}/${maxAttempts}): ${error.message}`);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        const waitTime = 5000 * attempts;
        await sleep(waitTime);
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
      logger.info(`${this.logPrefix}Solving captchas`);
      
      // Use Promise.allSettled to handle all captchas
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
        } else {
          results[key] = null;
          logger.debug(`${this.logPrefix}${config.type} captcha failed: ${result.reason}`);
        }
      });
      
      // Skip logging individual captcha results
      const successCount = Object.values(results).filter(r => r !== null).length;
      if (successCount > 0) {
        logger.info(`${this.logPrefix}${successCount}/${captchaConfigs.length} captchas solved successfully`);
      } else {
        throw new Error('All captchas failed to solve');
      }
      
      return results;
    } catch (error) {
      logger.error(`${this.logPrefix}Captcha solving error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = CaptchaService;