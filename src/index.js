const figlet = require('figlet');
const chalk = require('chalk');
const logger = require('./utils/logger');
const RetryUtils = require('./utils/retry');
const configManager = require('./config/config');
const ApiClient = require('./services/api');
const AuthService = require('./services/auth');
const QuestService = require('./services/quest');
const WalletService = require('./services/wallet');
const ProxyService = require('./services/proxy');

/**
 * Display header ASCII art
 */
function displayHeader() {
  const header = figlet.textSync('NEWTON', {
    font: 'ANSI Shadow',
    horizontalLayout: 'default',
    verticalLayout: 'default',
    width: 80,
    whitespaceBreak: true
  });
  
  // Generate rainbow colors
  const colors = ['red', 'yellow', 'green', 'blue', 'magenta'];
  const coloredHeader = header
    .split('\n')
    .map((line, i) => chalk[colors[i % colors.length]](line))
    .join('\n');
  
  console.log(coloredHeader);
  console.log(chalk.cyan('Magic Newton Bot - v2.0.0 (Refactored)'));
  console.log(chalk.cyan('========================================='));
  console.log('');
}

/**
 * Run a single account
 * @param {Object} options Account options
 * @param {number} options.accountIndex Account index
 * @param {string} options.privateKey Private key
 * @param {string} options.proxy Proxy string
 * @param {Object} options.config Configuration
 * @returns {Promise<Object>} Account run result
 */
async function runAccount(options) {
  const { accountIndex, privateKey, proxy, config } = options;
  
  // Set an absolute maximum time for any account (3 minutes)
  const ACCOUNT_TIMEOUT = 180000;
  const startTime = Date.now();
  
  // Set up a timeout check that will force completion after timeout
  const timeoutCheck = setTimeout(() => {
    logger.warn(`FORCED TIMEOUT: Account ${accountIndex} processing taking too long (over ${ACCOUNT_TIMEOUT/1000}s)`);
    // This will cause any pending promises to be rejected with a timeout error
  }, ACCOUNT_TIMEOUT);
  
  try {
    logger.info(`Starting account ${accountIndex}`);
    
    // Create wallet from private key
    let wallet;
    try {
      wallet = WalletService.createWallet(privateKey, { accountIndex });
    } catch (error) {
      logger.error(`Failed to create wallet for account ${accountIndex}: ${error.message}`, error);
      return {
        error: `Invalid private key: ${error.message}`,
        completedQuests: []
      };
    }
    
    // Create API client
    const api = new ApiClient({
      userAgent: config.bot.user_agent,
      proxy,
      accountIndex,
      retries: config.bot.retries
    });
    
    // Check if we've been running too long
    if (Date.now() - startTime > ACCOUNT_TIMEOUT - 30000) {
      logger.warn(`Account ${accountIndex} processing is taking too long, skipping authentication`);
      return {
        wallet: wallet.address,
        error: 'Processing timeout',
        completedQuests: []
      };
    }
    
    // Create authentication service
    const auth = new AuthService(api, config, { accountIndex });
    
    // Authenticate
    let session;
    try {
      const authPromise = auth.authenticate(wallet);
      session = await RetryUtils.withTimeout(
        authPromise,
        60000, // 60 seconds timeout for authentication
        `Authentication timed out after 60s for account ${accountIndex}`
      );
      
      // Wait a bit after authentication
      await RetryUtils.sleep(2000);
    } catch (authError) {
      logger.error(`Authentication failed for account ${accountIndex}: ${authError.message}`, authError);
      return {
        wallet: wallet.address,
        error: `Authentication failed: ${authError.message}`,
        completedQuests: []
      };
    }
    
    // Check if we've been running too long
    if (Date.now() - startTime > ACCOUNT_TIMEOUT - 30000) {
      logger.warn(`Account ${accountIndex} processing is taking too long, skipping quests`);
      return {
        wallet: wallet.address,
        error: 'Processing timeout after authentication',
        completedQuests: []
      };
    }
    
    // Create a result object that we'll populate with data
    const result = {
      wallet: wallet.address,
      completedQuests: []
    };
    
    try {
      // Get user info - this could fail but we continue
      try {
        const userInfoPromise = api.getUserInfo();
        const userInfo = await RetryUtils.withTimeout(
          userInfoPromise,
          15000, // 15 seconds timeout
          'User info retrieval timed out'
        );
        
        if (userInfo && userInfo.data) {
          logger.info(`User info retrieved: ${userInfo.data.name || userInfo.data.address || wallet.address}`);
          if (userInfo.data.refCode) {
            logger.info(`Referral code: ${userInfo.data.refCode}`);
          }
        } else {
          logger.warn(`Unable to retrieve user info, but continuing`);
        }
      } catch (userInfoError) {
        logger.warn(`Error getting user info: ${userInfoError.message}, but continuing`);
      }
      
      // Check if we've been running too long
      if (Date.now() - startTime > ACCOUNT_TIMEOUT - 30000) {
        logger.warn(`Account ${accountIndex} processing is taking too long, skipping quests`);
        return result;
      }
      
      // Create quest service
      const questService = new QuestService(api, config, { accountIndex });
      
      // Complete quests
      try {
        const questsPromise = questService.completeQuests();
        
        const completedQuests = await RetryUtils.withTimeout(
          questsPromise,
          90000, // 90 seconds timeout for quests
          `Quest completion timed out after 90s for account ${accountIndex}`
        );
        
        result.completedQuests = completedQuests || [];
        logger.success(`Account ${accountIndex} completed ${result.completedQuests.length} quests`);
      } catch (questError) {
        logger.error(`Error completing quests for account ${accountIndex}: ${questError.message}`, questError);
        result.questError = questError.message;
      }
      
      return result;
    } catch (innerError) {
      // If this part fails, just log it but don't stop the whole bot
      logger.error(`Error after authentication for account ${accountIndex}: ${innerError.message}`, innerError);
      
      return {
        wallet: wallet.address,
        error: innerError.message,
        completedQuests: result.completedQuests || []
      };
    }
  } catch (error) {
    logger.error(`Account ${accountIndex} error: ${error.message}`, error);
    
    // Return a result even if there's an error
    return {
      error: error.message,
      completedQuests: []
    };
  } finally {
    // Clear the timeout to prevent memory leaks
    clearTimeout(timeoutCheck);
    
    // Log total time taken
    const totalTime = (Date.now() - startTime) / 1000;
    logger.info(`Finished processing account ${accountIndex} (took ${totalTime.toFixed(1)}s)`);
  }
}

/**
 * Main function to run the bot
 */
async function main() {
  try {
    // Display ASCII art header
    displayHeader();
    
    // Load configuration
    const config = await configManager.load();
    
    // Load proxies if enabled
    let proxies = [];
    if (config.proxy.enabled) {
      proxies = await configManager.loadProxies();
      logger.info(`Loaded ${proxies.length} proxies`);
    }
    
    // Create proxy service
    const proxyService = new ProxyService(proxies, config.proxy);
    
    // Load private keys
    const privateKeys = await configManager.loadPrivateKeys();
    logger.info(`Loaded ${privateKeys.length} private keys`);
    
    // Track success/failure stats
    let successCount = 0;
    let failureCount = 0;
    
    // Run for each account
    for (let i = 0; i < privateKeys.length; i++) {
      try {
        const accountIndex = i + 1;
        logger.info(`Starting account ${accountIndex} of ${privateKeys.length}`);
        
        // Get proxy for this account if enabled
        const proxy = proxyService.getProxyForAccount(accountIndex);
        
        try {
          // Run account with error handling
          await runAccount({
            accountIndex,
            privateKey: privateKeys[i],
            proxy,
            config
          });
          
          // If we get here, the account was successful
          successCount++;
          
        } catch (accountError) {
          // Log the error but continue to the next account
          logger.error(`Account ${accountIndex} failed: ${accountError.message}`, accountError);
          failureCount++;
        }
        
      } catch (outerError) {
        // This is a fallback to catch any errors not caught by the inner try/catch
        logger.error(`Unexpected error during account processing: ${outerError.message}`, outerError);
        failureCount++;
      }
      
      // Always continue to the next account, even after errors
      if (i < privateKeys.length - 1) {
        logger.info(`Waiting ${config.bot.delay_between_accounts} seconds before next account`);
        await RetryUtils.sleep(config.bot.delay_between_accounts * 1000);
      }
    }
    
    // Log summary
    logger.info(`Account processing complete: ${successCount} successful, ${failureCount} failed`);
    
    // All accounts completed - wait before next run
    const delayHours = config.bot.delay_after_completion;
    logger.info(`All accounts completed. Waiting ${delayHours} hours before next run`);
    
    // Wait for the specified delay and then restart
    await RetryUtils.sleep(delayHours * 60 * 60 * 1000);
    
    // Restart the process
    logger.info('Restarting bot for next cycle');
    main();
  } catch (error) {
    logger.error(`Main process error: ${error.message}`, error);
    
    // Instead of exiting, wait 5 minutes and restart
    logger.info('Restarting bot in 5 minutes due to main process error');
    await RetryUtils.sleep(5 * 60 * 1000);
    main();
  }
}

/**
 * Helper function to force the bot to stay alive
 */
function keepAlive() {
  // Set an interval that runs every 5 minutes to make sure the process stays alive
  setInterval(() => {
    logger.info(`Bot keepalive check - process running`);
    
    // Force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
        logger.info('Manual garbage collection completed');
      } catch (e) {
        logger.error('Failed to run garbage collection:', e.message);
      }
    }
  }, 300000); // 5 minutes
}

/**
 * Error handling for uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  logger.error('CRITICAL ERROR - Uncaught exception:', err);
  logger.info('Bot recovering and continuing despite critical error...');
  
  // Force continue after a delay
  setTimeout(() => {
    try {
      logger.info('Attempting to restart bot after critical error...');
      main().catch(error => {
        logger.error('Failed to restart after critical error:', error);
        // Try again after a longer delay
        setTimeout(() => main(), 300000); // 5 minutes
      });
    } catch (e) {
      logger.error('Error during restart attempt:', e);
      // Final fallback - restart after long delay
      setTimeout(() => main(), 600000); // 10 minutes
    }
  }, 30000); // 30 seconds
});

/**
 * Error handling for unhandled rejections
 */
process.on('unhandledRejection', (err) => {
  logger.error('CRITICAL ERROR - Unhandled rejection:', err);
  logger.info('Bot recovering and continuing despite critical error...');
  
  // Force continue after a delay
  setTimeout(() => {
    try {
      logger.info('Attempting to restart bot after critical error...');
      main().catch(error => {
        logger.error('Failed to restart after critical error:', error);
        // Try again after a longer delay
        setTimeout(() => main(), 300000); // 5 minutes
      });
    } catch (e) {
      logger.error('Error during restart attempt:', e);
      // Final fallback - restart after long delay
      setTimeout(() => main(), 600000); // 10 minutes
    }
  }, 30000); // 30 seconds
});

/**
 * Start the bot with extreme error handling
 */
async function startBot() {
  try {
    // Start keepalive process
    keepAlive();
    
    // Start main bot loop
    await main();
  } catch (error) {
    logger.error('CRITICAL ERROR during bot startup:', error);
    
    // Wait and try again
    logger.info('Waiting 60 seconds before restarting bot...');
    setTimeout(startBot, 60000);
  }
}

// Start the bot
startBot().catch(error => {
  logger.error('FATAL ERROR in startBot:', error);
  // Restart after a delay
  setTimeout(() => startBot(), 300000); // 5 minutes
});