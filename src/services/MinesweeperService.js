// src/services/MinesweeperService.js
const logger = require('../utils/logger');
const { withTimeout, sleep, randomInt } = require('../utils/helpers');

/**
 * Service for handling Minesweeper game
 */
class MinesweeperService {
  /**
   * Create a new minesweeper service
   * @param {Object} api ApiClient instance
   * @param {Object} config Configuration
   * @param {Object} accountInfo Account information
   */
  constructor(api, config, accountInfo = {}) {
    this.api = api;
    this.config = config;
    this.accountIndex = accountInfo.accountIndex;
    this.logPrefix = accountInfo.accountIndex ? `[Account ${accountInfo.accountIndex}] ` : '';
    
    // Quest ID for minesweeper
    this.MINESWEEPER_ID = "44ec9674-6125-4f88-9e18-8d6d6be8f156";
    
    // Game parameters
    this.BOARD_SIZE = 10; // 10x10 grid
    this.MAX_ATTEMPTS = config.quests?.minesweeper?.max_attempts || 10;
    this.DIFFICULTY = config.quests?.minesweeper?.difficulty || "EASY";
    this.AUTO_RETRY = config.quests?.minesweeper?.auto_retry !== false;
  }
  
  /**
   * Play a complete minesweeper game
   * @returns {Promise<Object>} Game result
   */
  async playGame() {
    // Max 3 attempts per day as per platform limits
    const MAX_DAILY_ATTEMPTS = 3;
    let attempts = 0;
    let totalCredits = 0;
    let lastResult = null;
    
    logger.info(`${this.logPrefix}Starting minesweeper quest (difficulty: ${this.DIFFICULTY})`);
    
    // Check if quest is already completed for the day
    const isCompleted = await this._isQuestCompletedToday();
    if (isCompleted) {
      logger.info(`${this.logPrefix}Minesweeper quest already completed today`);
      return {
        questId: this.MINESWEEPER_ID,
        status: 'COMPLETED',
        message: 'Quest already completed today'
      };
    }
    
    // Get how many games we've already played today
    const gamesPlayed = await this._getGamesPlayedToday();
    const remainingGames = MAX_DAILY_ATTEMPTS - gamesPlayed;
    
    if (remainingGames <= 0) {
      logger.info(`${this.logPrefix}All ${MAX_DAILY_ATTEMPTS} daily minesweeper games already played`);
      return {
        questId: this.MINESWEEPER_ID,
        status: 'COMPLETED',
        message: 'Daily limit reached'
      };
    }
    
    logger.info(`${this.logPrefix}You have ${remainingGames}/${MAX_DAILY_ATTEMPTS} minesweeper games remaining today`);
    
    // Play the remaining games
    while (attempts < remainingGames) {
      attempts++;
      logger.info(`${this.logPrefix}Minesweeper game ${attempts}/${remainingGames}`);
      
      try {
        const gameResult = await this._playOneGame();
        lastResult = gameResult;
        
        if (gameResult?.credits > 0) {
          totalCredits += gameResult.credits;
          logger.success(`${this.logPrefix}Minesweeper game completed! +${gameResult.credits} credits`);
        } else if (gameResult?.exploded) {
          logger.info(`${this.logPrefix}Game ended - hit a mine!`);
        }
        
        // Wait before starting a new game
        await sleep(3000);
      } catch (error) {
        // Check for daily limit exceeded (400 error)
        if (error.message && (error.message.includes('400') || error.message.includes('Daily limit'))) {
          logger.info(`${this.logPrefix}Daily minesweeper limit reached (3 games per day)`);
          break;
        }
        
        logger.error(`${this.logPrefix}Error playing minesweeper: ${error.message}`);
        // Wait before trying the next game
        await sleep(5000);
      }
    }
    
    logger.info(`${this.logPrefix}Finished minesweeper quest (${totalCredits} total credits)`);
    return {
      questId: this.MINESWEEPER_ID,
      totalCredits,
      attempts,
      lastResult
    };
  }
  
  /**
   * Play a single minesweeper game
   * @returns {Promise<Object>} Game result
   * @private
   */
  async _playOneGame() {
    // Start a new game
    let gameResponse;
    try {
      const startPayload = {
        action: "START",
        difficulty: this.DIFFICULTY
      };
      
      logger.info(`${this.logPrefix}Starting new minesweeper game (${this.DIFFICULTY})`);
      gameResponse = await this.api.completeQuest(this.MINESWEEPER_ID, startPayload);
      
      if (!gameResponse?.data?._minesweeper) {
        if (gameResponse?.data?.message === "Quest already completed") {
          logger.info(`${this.logPrefix}Minesweeper limit reached for today`);
          throw new Error("Daily limit reached");
        }
        throw new Error("Invalid game response");
      }
    } catch (error) {
      logger.error(`${this.logPrefix}Failed to start minesweeper game: ${error.message}`);
      throw error;
    }
    
    // Game initialized
    let gameState = gameResponse.data;
    const userQuestId = gameState.id;
    
    // Continue playing until game is over or we've made too many moves
    let moveCount = 0;
    const MAX_MOVES = 90; // Safety limit to prevent infinite loops
    
    logger.info(`${this.logPrefix}Beginning to play minesweeper - will continue until game over`);
    
    while (moveCount < MAX_MOVES) {
      // If game is already over (exploded or won), exit loop
      if (gameState._minesweeper.gameOver) {
        if (gameState._minesweeper.exploded) {
          logger.info(`${this.logPrefix}Game over - hit a mine after ${moveCount} moves`);
        } else {
          logger.success(`${this.logPrefix}Game won after ${moveCount} moves!`);
        }
        break;
      }
      
      // Make random move from remaining unopened tiles
      const randomMove = this._findRandomUnexploredTile(gameState._minesweeper.tiles);
      
      if (!randomMove) {
        logger.info(`${this.logPrefix}No more moves available`);
        break;
      }
      
      try {
        moveCount++;
        const clickPayload = {
          action: "CLICK",
          userQuestId,
          x: randomMove.x,
          y: randomMove.y
        };
        
        logger.debug(`${this.logPrefix}Move ${moveCount}: Clicking (${randomMove.x}, ${randomMove.y})`);
        const moveResponse = await this.api.completeQuest(this.MINESWEEPER_ID, clickPayload);
        gameState = moveResponse.data;
        
        // Short delay between moves to avoid rate limiting
        await sleep(300);
      } catch (error) {
        logger.error(`${this.logPrefix}Error making move: ${error.message}`);
        // Try another move if this one failed
        continue;
      }
    }
    
    // If we maxed out moves without ending the game
    if (moveCount >= MAX_MOVES && !gameState._minesweeper.gameOver) {
      logger.warn(`${this.logPrefix}Reached maximum moves (${MAX_MOVES}) without completing game`);
    }
    
    return {
      userQuestId,
      exploded: gameState._minesweeper.exploded,
      gameOver: gameState._minesweeper.gameOver,
      credits: gameState.credits || 0,
      moves: moveCount
    };
  }
  
  /**
   * Get the number of minesweeper games played today
   * @returns {Promise<number>} Number of games played today
   * @private
   */
  async _getGamesPlayedToday() {
    try {
      // Get user quests
      let userQuestsResponse;
      try {
        userQuestsResponse = await this.api.getUserQuests();
      } catch (error) {
        logger.error(`${this.logPrefix}Failed to get user quests: ${error.message}`);
        return 0; // Assume none played if we can't check
      }
      
      const userQuests = userQuestsResponse.data || [];
      
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // Count minesweeper games played today
      const todayGames = userQuests.filter(q => 
        q.questId === this.MINESWEEPER_ID && 
        q.createdAt && q.createdAt.startsWith(today)
      );
      
      return todayGames.length;
    } catch (error) {
      logger.error(`${this.logPrefix}Error counting games played: ${error.message}`);
      return 0; // Assume none played if check fails
    }
  }
  
  /**
   * Check if minesweeper quest has already been completed today
   * @returns {Promise<boolean>} Whether the quest is completed today
   * @private
   */
  async _isQuestCompletedToday() {
    try {
      const gamesPlayed = await this._getGamesPlayedToday();
      
      // If we have 3 or more games today, we've reached the limit
      if (gamesPlayed >= 3) {
        logger.info(`${this.logPrefix}Minesweeper daily limit reached (${gamesPlayed} games played today)`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`${this.logPrefix}Error checking quest completion: ${error.message}`);
      return false; // Assume not completed if check fails
    }
  }
  
  /**
   * Find a random unexplored tile
   * @param {Array<Array>} tiles Current board state
   * @returns {Object|null} Random unexplored tile coordinates {x, y} or null if no unexplored tiles
   * @private
   */
  _findRandomUnexploredTile(tiles) {
    const unexploredTiles = [];
    
    // Find all unexplored tiles
    for (let y = 0; y < this.BOARD_SIZE; y++) {
      for (let x = 0; x < this.BOARD_SIZE; x++) {
        if (tiles[y][x] === null) {
          unexploredTiles.push({ x, y });
        }
      }
    }
    
    if (unexploredTiles.length === 0) {
      return null;
    }
    
    // Pick a random tile
    const randomIndex = Math.floor(Math.random() * unexploredTiles.length);
    return unexploredTiles[randomIndex];
  }
}

module.exports = MinesweeperService;
