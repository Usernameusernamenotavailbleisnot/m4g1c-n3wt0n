const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  referral: {
    code: ""  // Referral code
  },
  bot: {
    delay_between_accounts: 5, // seconds
    delay_after_completion: 25, // hours
    retries: {
      max_attempts: 5,
      initial_delay: 1000, // ms
      max_delay: 30000 // ms
    },
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
  },
  proxy: {
    enabled: true,
    file: "./proxy.txt",
    rotation: {
      mode: "sequential", // sequential or random
      switch_after: 1 // number of accounts before switching proxy
    }
  },
  wallet: {
    private_key_file: "./pk.txt"
  },
  captcha: {
    service: "capsolver",
    api_key: "", // Add your API key here
    timeout: 120, // seconds
    types: {
      recaptcha_v2: {
        invisible_sitekey: "6LcGDIMqAAAAAH4O4-y9yAYaEAEJsCwsr8tC6VBJ",
        visible_sitekey: "6LcUI9wqAAAAAMvmAeHBxYKzp193-ymQ-pH3hf6O"
      },
      turnstile: {
        enabled: true
      }
    }
  },
  quests: {
    daily_dice_roll: {
      enabled: true,
      rolls: 5
    }
  }
};

/**
 * Configuration Manager for the Magic Newton Bot
 * Handles loading, validation, and accessing configuration
 */
class ConfigManager {
  constructor() {
    this.config = null;
    this.configPath = './config.yaml';
  }

  /**
   * Load configuration from file
   * @returns {Object} The loaded configuration
   */
  async load() {
    try {
      // Check if config file exists
      if (await fs.pathExists(this.configPath)) {
        const fileContents = await fs.readFile(this.configPath, 'utf8');
        const loadedConfig = yaml.load(fileContents);
        
        // Deep merge with default config
        this.config = this._deepMerge(DEFAULT_CONFIG, loadedConfig);
        logger.info('Configuration loaded successfully');
      } else {
        // Create default config file
        await fs.writeFile(this.configPath, yaml.dump(DEFAULT_CONFIG));
        logger.info('Created default configuration file');
        this.config = DEFAULT_CONFIG;
      }
      
      // Validate critical configuration values
      this._validateConfig();
      
      return this.config;
    } catch (error) {
      logger.error(`Error loading configuration: ${error.message}`, error);
      logger.info('Using default configuration');
      this.config = DEFAULT_CONFIG;
      return this.config;
    }
  }
  
  /**
   * Load data from text file
   * @param {string} filePath Path to file
   * @param {string} description Description for logging
   * @returns {Array<string>} Array of lines from file
   */
  async loadTextFile(filePath, description) {
    try {
      if (!await fs.pathExists(filePath)) {
        logger.warn(`${description} file not found: ${filePath}. Creating empty file.`);
        await fs.ensureFile(filePath);
        return [];
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      return content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    } catch (error) {
      logger.error(`Error loading ${description}: ${error.message}`, error);
      return [];
    }
  }
  
  /**
   * Load proxies from file
   * @returns {Array<string>} Array of proxy strings
   */
  async loadProxies() {
    if (!this.config) await this.load();
    return this.loadTextFile(
      this.config.proxy.file,
      'Proxy'
    );
  }
  
  /**
   * Load private keys from file
   * @returns {Array<string>} Array of private keys
   */
  async loadPrivateKeys() {
    if (!this.config) await this.load();
    return this.loadTextFile(
      this.config.wallet.private_key_file,
      'Private key'
    );
  }
  
  /**
   * Get the current configuration
   * @returns {Object} Current configuration
   */
  get() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }
  
  /**
   * Deep merge two objects
   * @param {Object} target Target object
   * @param {Object} source Source object
   * @returns {Object} Merged object
   * @private
   */
  _deepMerge(target, source) {
    const output = { ...target };
    
    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this._deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }
  
  /**
   * Check if value is an object
   * @param {*} item Item to check
   * @returns {boolean} True if item is an object
   * @private
   */
  _isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }
  
  /**
   * Validate critical configuration values
   * @private
   */
  _validateConfig() {
    // Check for critical configuration values
    if (!this.config.captcha.api_key) {
      logger.warn('Captcha API key not configured. The bot may not work properly.');
    }
    
    // Validate delays are reasonable
    if (this.config.bot.delay_between_accounts < 0) {
      logger.warn('Negative delay between accounts detected, setting to 5 seconds');
      this.config.bot.delay_between_accounts = 5;
    }
    
    if (this.config.bot.delay_after_completion < 0) {
      logger.warn('Negative delay after completion detected, setting to 1 hour');
      this.config.bot.delay_after_completion = 1;
    }
  }
}

// Export singleton instance
const configManager = new ConfigManager();
module.exports = configManager;