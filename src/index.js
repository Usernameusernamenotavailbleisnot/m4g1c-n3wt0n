// src/index.js
const Bot = require('./core/Bot');
const logger = require('./utils/logger');

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
      startBot().catch(error => {
        logger.error('Failed to restart after critical error:', error);
        // Try again after a longer delay
        setTimeout(() => startBot(), 300000); // 5 minutes
      });
    } catch (e) {
      logger.error('Error during restart attempt:', e);
      // Final fallback - restart after long delay
      setTimeout(() => startBot(), 600000); // 10 minutes
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
      startBot().catch(error => {
        logger.error('Failed to restart after critical error:', error);
        // Try again after a longer delay
        setTimeout(() => startBot(), 300000); // 5 minutes
      });
    } catch (e) {
      logger.error('Error during restart attempt:', e);
      // Final fallback - restart after long delay
      setTimeout(() => startBot(), 600000); // 10 minutes
    }
  }, 30000); // 30 seconds
});

/**
 * Start the bot with extreme error handling
 */
async function startBot() {
  try {
    // Create new bot instance
    const bot = new Bot();
    
    // Initialize the bot (loads config)
    await bot.initialize();
    
    // Set logger options based on config
    const config = bot.config;
    if (config && config.logging) {
      logger.options.logLevel = config.logging.level || 'info';
      logger.options.enableFileLogging = config.logging.enable_file_logging || false;
      logger.options.logFilePath = config.logging.log_file_path || './logs/magic-newton.log';
      
      if (logger.options.enableFileLogging) {
        // Create logger file transport if file logging is enabled
        logger.setupFileLogging();
      }
    }
    
    // Setup keepalive
    bot.setupKeepalive();
    
    // Start the bot
    await bot.start();
    
    return bot;
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