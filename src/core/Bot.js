// src/core/Bot.js
const figlet = require('figlet');
const chalk = require('chalk');

const ConfigManager = require('./ConfigManager');
const AccountRunner = require('./AccountRunner');
const ProxyManager = require('../services/ProxyManager');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

/**
 * Main Bot controller class that manages the overall execution flow
 */
class Bot {
  /**
   * Create a new Bot instance
   */
  constructor() {
    this.configManager = new ConfigManager();
    this.proxyManager = null;
    this.config = null;
    this.privateKeys = [];
    this.isRunning = false;
    this.successCount = 0;
    this.failureCount = 0;
  }

  /**
   * Display the bot header with ASCII art
   */
  displayHeader() {
    const header = figlet.textSync('NEWTON', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 80,
      whitespaceBreak: true
    });
    
    const colors = ['red', 'yellow', 'green', 'blue', 'magenta'];
    const coloredHeader = header
      .split('\n')
      .map((line, i) => chalk[colors[i % colors.length]](line))
      .join('\n');
    
    console.log(coloredHeader);
    console.log(chalk.cyan('Magic Newton Bot - v3.0.0 (Refactored)'));
    console.log(chalk.cyan('========================================='));
    console.log('');
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    try {
      // Load configuration
      this.config = await this.configManager.load();
      
      // Load proxies if enabled
      if (this.config.proxy.enabled) {
        const proxies = await this.configManager.loadTextFile(
          this.config.proxy.file,
          'Proxy'
        );
        this.proxyManager = new ProxyManager(proxies, this.config.proxy);
        logger.info(`Loaded ${proxies.length} proxies`);
      } else {
        this.proxyManager = new ProxyManager([], this.config.proxy);
      }
      
      // Load private keys
      this.privateKeys = await this.configManager.loadTextFile(
        this.config.wallet.private_key_file,
        'Private key'
      );
      logger.info(`Loaded ${this.privateKeys.length} private keys`);
      
      return true;
    } catch (error) {
      logger.error(`Bot initialization error: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Start the bot operation
   */
  async start() {
    this.isRunning = true;
    this.displayHeader();
    
    if (!(await this.initialize())) {
      logger.error('Failed to initialize bot, retrying in 60 seconds');
      await sleep(60000);
      return this.start();
    }
    
    try {
      await this.runMainLoop();
    } catch (error) {
      logger.error(`Main loop error: ${error.message}`, error);
      logger.info('Restarting bot in 5 minutes due to main loop error');
      await sleep(5 * 60 * 1000);
      this.start();
    }
  }

  /**
   * Run the main processing loop
   */
  async runMainLoop() {
    this.successCount = 0;
    this.failureCount = 0;

    logger.info(`Starting processing for ${this.privateKeys.length} accounts`);

    // Process each account
    for (let i = 0; i < this.privateKeys.length; i++) {
      if (!this.isRunning) break;
      
      const accountIndex = i + 1;
      logger.info(`Starting account ${accountIndex} of ${this.privateKeys.length}`);
      
      // Get proxy for this account (minimal logging)
      const proxy = this.proxyManager.getProxyForAccount(accountIndex);
      
      try {
        // Create account runner
        const accountRunner = new AccountRunner({
          accountIndex,
          privateKey: this.privateKeys[i],
          proxy,
          config: this.config
        });
        
        // Run the account
        const result = await accountRunner.run();
        
        if (result.error) {
          logger.error(`Account ${accountIndex} failed: ${result.error}`);
          this.failureCount++;
        } else {
          // No need for additional success log as AccountRunner already logs it
          this.successCount++;
        }
      } catch (error) {
        logger.error(`Error for account ${accountIndex}: ${error.message}`);
        this.failureCount++;
      }
      
      // Wait before processing next account
      if (i < this.privateKeys.length - 1 && this.isRunning) {
        logger.info(`Waiting ${this.config.bot.delay_between_accounts} seconds before next account`);
        await sleep(this.config.bot.delay_between_accounts * 1000);
      }
    }
    
    // Log summary
    logger.info(`Completed: ${this.successCount} successful, ${this.failureCount} failed`);
    
    // Wait before next cycle
    if (this.isRunning) {
      logger.info(`Waiting ${this.config.bot.delay_after_completion} hours before next run`);
      await sleep(this.config.bot.delay_after_completion * 60 * 60 * 1000); 
      
      // Restart the cycle
      if (this.isRunning) {
        this.runMainLoop();
      }
    }
  }

  /**
   * Stop the bot operation
   */
  stop() {
    logger.info('Stopping bot operation');
    this.isRunning = false;
  }

  /**
   * Setup keepalive mechanism to prevent the process from exiting
   */
  setupKeepalive() {
    setInterval(() => {
      if (this.isRunning) {
        logger.debug('Bot keepalive check - process running');
      }
      
      // Force garbage collection if available
      if (global.gc) {
        try {
          global.gc();
          logger.debug('Manual garbage collection completed');
        } catch (e) {
          logger.error('Failed to run garbage collection:', e.message);
        }
      }
    }, 300000); // 5 minutes
  }
}

module.exports = Bot;