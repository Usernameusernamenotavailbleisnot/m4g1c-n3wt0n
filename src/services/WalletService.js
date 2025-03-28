// src/services/WalletService.js
const { ethers } = require('ethers');
const logger = require('../utils/logger');

/**
 * Service for handling wallet operations
 */
class WalletService {
  /**
   * Create a wallet from a private key
   * @param {string} privateKey Ethereum private key
   * @param {Object} accountInfo Account information for logging
   * @returns {ethers.Wallet} Wallet instance
   */
  static createWallet(privateKey, accountInfo = {}) {
    const logPrefix = accountInfo.accountIndex ? `[Account ${accountInfo.accountIndex}] ` : '';
    
    try {
      const wallet = new ethers.Wallet(privateKey);
      // Only log last 4 characters of address for identification
      const shortAddress = wallet.address.substring(0, 6) + '...' + wallet.address.slice(-4);
      logger.debug(`${logPrefix}Wallet created: ${shortAddress}`);
      return wallet;
    } catch (error) {
      logger.error(`${logPrefix}Invalid private key`, error);
      throw new Error(`Invalid private key: ${error.message}`);
    }
  }
  
  /**
   * Sign a message with a wallet
   * @param {string} message Message to sign
   * @param {ethers.Wallet} wallet Wallet to sign with
   * @param {Object} accountInfo Account information for logging
   * @returns {Promise<string>} Signature
   */
  static async signMessage(message, wallet, accountInfo = {}) {
    const logPrefix = accountInfo.accountIndex ? `[Account ${accountInfo.accountIndex}] ` : '';
    
    try {
      logger.debug(`${logPrefix}Signing message with wallet`);
      return await wallet.signMessage(message);
    } catch (error) {
      logger.error(`${logPrefix}Error signing message: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create authentication message for Magic Newton
   * @param {string} walletAddress Wallet address
   * @param {string} csrfToken CSRF token
   * @returns {string} Authentication message to sign
   */
  static createAuthMessage(walletAddress, csrfToken) {
    const timestamp = new Date().toISOString();
    
    return `www.magicnewton.com wants you to sign in with your Ethereum account:
${walletAddress}

Please sign with your account

URI: https://www.magicnewton.com
Version: 1
Chain ID: 1
Nonce: ${csrfToken}
Issued At: ${timestamp}`;
  }
}

module.exports = WalletService;