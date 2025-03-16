const chalk = require('chalk');
const moment = require('moment');
const winston = require('winston');

/**
 * Enhanced logger service for the Magic Newton Bot
 * Provides console logging with color and timestamp formatting
 * and optional file logging for debugging and troubleshooting
 */
class Logger {
  constructor(options = {}) {
    this.options = {
      enableFileLogging: false,
      logLevel: 'info',
      logFilePath: './logs/magic-newton.log',
      ...options
    };

    // Setup Winston logger if file logging is enabled
    if (this.options.enableFileLogging) {
      this.fileLogger = winston.createLogger({
        level: this.options.logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.File({ 
            filename: this.options.logFilePath,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          })
        ]
      });
    }
  }

  /**
   * Format timestamp for console logs
   * @returns {string} Formatted timestamp
   */
  getTimestamp() {
    return `[${moment().format('DD/MM/YYYY - HH:mm:ss')}]`;
  }

  /**
   * Log a debug message (only if debug level is enabled)
   * @param {string} message Message to log
   * @param {Object} data Optional data to include
   */
  debug(message, data = null) {
    if (this.options.logLevel === 'debug') {
      console.debug(chalk.gray(`${this.getTimestamp()} ${message}`));
      if (data) console.debug(data);
    }
    
    if (this.fileLogger) {
      this.fileLogger.debug(message, { data });
    }
  }
  
  /**
   * Log an info message
   * @param {string} message Message to log
   * @param {Object} data Optional data to include
   */
  info(message, data = null) {
    console.info(chalk.blue(`${this.getTimestamp()} ${message}`));
    if (data) console.info(data);
    
    if (this.fileLogger) {
      this.fileLogger.info(message, { data });
    }
  }
  
  /**
   * Log a warning message
   * @param {string} message Message to log
   * @param {Object} data Optional data to include
   */
  warn(message, data = null) {
    console.warn(chalk.yellow(`${this.getTimestamp()} ${message}`));
    if (data) console.warn(data);
    
    if (this.fileLogger) {
      this.fileLogger.warn(message, { data });
    }
  }
  
  /**
   * Log an error message
   * @param {string} message Message to log
   * @param {Error|Object} error Optional error object
   */
  error(message, error = null) {
    console.error(chalk.red(`${this.getTimestamp()} ${message}`));
    
    if (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`${this.getTimestamp()} ${error.message}`));
        if (error.stack) {
          console.error(chalk.red(`${this.getTimestamp()} ${error.stack}`));
        }
      } else {
        console.error(error);
      }
    }
    
    if (this.fileLogger) {
      this.fileLogger.error(message, { 
        error: error instanceof Error 
          ? { message: error.message, stack: error.stack } 
          : error 
      });
    }
  }
  
  /**
   * Log a success message
   * @param {string} message Message to log
   * @param {Object} data Optional data to include
   */
  success(message, data = null) {
    console.info(chalk.green(`${this.getTimestamp()} ${message}`));
    if (data) console.info(data);
    
    if (this.fileLogger) {
      this.fileLogger.info(`SUCCESS: ${message}`, { data });
    }
  }
}

// Export a singleton instance for use across the application
const logger = new Logger();

module.exports = logger;