const logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');

/**
 * Service for handling quests
 */
class QuestService {
  /**
   * Create a new quest service
   * @param {Object} api ApiClient instance
   * @param {Object} config Configuration
   * @param {Object} accountInfo Account information
   */
  constructor(api, config, accountInfo = {}) {
    this.api = api;
    this.config = config;
    this.accountIndex = accountInfo.accountIndex;
    this.logPrefix = accountInfo.accountIndex ? `[Account ${accountInfo.accountIndex}] ` : '';
  }
  
  /**
   * Complete all configured quests
   * @returns {Promise<Array>} Completed quests
   */
  async completeQuests() {
    // Set an overall timeout for the entire function (90 seconds)
    const QUEST_TIMEOUT = 90000;
    const startTime = Date.now();
    
    try {
      logger.info(`${this.logPrefix}Starting quests completion`);
      
      const completedQuests = [];
      
      // Complete daily dice roll if enabled
      if (this.config.quests.daily_dice_roll && this.config.quests.daily_dice_roll.enabled) {
        try {
          logger.info(`${this.logPrefix}Attempting daily dice roll quest`);
          
          // Create a timeout promise for the dice roll
          const diceRollPromise = this.completeDailyDiceRoll();
          const diceRollResult = await RetryUtils.withTimeout(
            diceRollPromise,
            60000, // 60 seconds timeout
            `Daily dice roll timed out after 60s`
          );
          
          if (diceRollResult) {
            completedQuests.push(diceRollResult);
            logger.success(`${this.logPrefix}Successfully completed daily dice roll`);
          } else {
            logger.info(`${this.logPrefix}No dice roll result, it may have already been completed or failed`);
          }
        } catch (error) {
          logger.error(`${this.logPrefix}Failed to complete daily dice roll: ${error.message}`, error);
          logger.info(`${this.logPrefix}Continuing to next quest if any`);
          // Continue with other quests if any
        }
      } else {
        logger.info(`${this.logPrefix}Daily dice roll quest is disabled, skipping`);
      }
      
      // Check if we've been running too long
      if (Date.now() - startTime > QUEST_TIMEOUT) {
        logger.warn(`${this.logPrefix}Quest completion timed out after ${QUEST_TIMEOUT/1000}s`);
        return completedQuests; // Return any completed quests
      }
      
      // Here we could add more quest types in the future
      
      return completedQuests;
    } catch (error) {
      logger.error(`${this.logPrefix}Quest completion error: ${error.message}`, error);
      // Return empty array instead of throwing
      return [];
    } finally {
      // Log total time taken
      const totalTime = (Date.now() - startTime) / 1000;
      logger.info(`${this.logPrefix}Quest completion process finished (took ${totalTime.toFixed(1)}s)`);
    }
  }
  
  /**
   * Complete daily dice roll quest
   * @returns {Promise<Object>} Quest result
   */
  async completeDailyDiceRoll() {
    // Set an overall timeout for the entire function (60 seconds)
    const OVERALL_TIMEOUT = 60000;
    const startTime = Date.now();
    
    try {
      logger.info(`${this.logPrefix}Starting daily dice roll quest`);
      
      // Get quests with timeout
      let questsResponse;
      try {
        const questsPromise = this.api.getQuests();
        questsResponse = await RetryUtils.withTimeout(
          questsPromise, 
          10000, 
          'Getting quests timed out after 10s'
        );
      } catch (error) {
        logger.error(`${this.logPrefix}Failed to get quests: ${error.message}`, error);
        return null;
      }
      
      const quests = questsResponse.data || [];
      
      // Check if we've been running too long
      if (Date.now() - startTime > OVERALL_TIMEOUT) {
        logger.warn(`${this.logPrefix}Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
        return null;
      }
      
      // Find daily dice roll quest
      const diceRollQuest = quests.find(q => q.title === 'Daily Dice Roll');
      
      if (!diceRollQuest) {
        logger.warn(`${this.logPrefix}Daily dice roll quest not found`);
        return null;
      }
      
      logger.info(`${this.logPrefix}Found daily dice roll quest: ${diceRollQuest.id}`);
      
      // Check if we've been running too long
      if (Date.now() - startTime > OVERALL_TIMEOUT) {
        logger.warn(`${this.logPrefix}Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
        return null;
      }
      
      // Check if quest is already completed today
      const isCompleted = await this._isQuestCompletedToday(diceRollQuest.id);
      if (isCompleted) {
        logger.info(`${this.logPrefix}Daily dice roll already completed today`);
        return {
          questId: diceRollQuest.id,
          status: 'COMPLETED',
          message: 'Quest already completed'
        };
      }
      
      // Complete the roll quest
      logger.info(`${this.logPrefix}Rolling dice`);
      
      let lastRoll = null;
      const maxRolls = this.config.quests.daily_dice_roll.rolls || 5;
      
      for (let i = 0; i < maxRolls; i++) {
        // Check if we've been running too long
        if (Date.now() - startTime > OVERALL_TIMEOUT) {
          logger.warn(`${this.logPrefix}Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
          return lastRoll; // Return last successful roll if any
        }
        
        // Add some human-like delay between rolls
        if (i > 0) {
          const delay = RetryUtils.randomInt(3000, 6000); // 3-6 seconds
          logger.info(`${this.logPrefix}Waiting ${delay/1000} seconds before next roll`);
          await RetryUtils.sleep(delay);
        }
        
        logger.info(`${this.logPrefix}Roll ${i + 1}/${maxRolls}`);
        
        try {
          // Complete quest with timeout
          const rollPromise = this.api.completeQuest(diceRollQuest.id, { action: 'ROLL' });
          const rollResponse = await RetryUtils.withTimeout(
            rollPromise,
            15000,
            `Roll ${i + 1} timed out after 15s`
          );
          
          lastRoll = rollResponse.data;
          
          logger.success(`${this.logPrefix}Roll ${i + 1} complete: ${rollResponse.data._rolled_credits || 0} credits`);
          
          // If status is COMPLETED, we've used all available rolls
          if (rollResponse.data && rollResponse.data.status === 'COMPLETED') {
            logger.info(`${this.logPrefix}All rolls completed`);
            break;
          }
        } catch (error) {
          // Check for "Quest already completed" error
          if (error.response && 
              error.response.data && 
              error.response.data.message === "Quest already completed") {
            logger.info(`${this.logPrefix}Quest already completed during roll attempt`);
            return { 
              questId: diceRollQuest.id, 
              status: 'COMPLETED', 
              message: 'Quest already completed' 
            };
          }
          
          logger.error(`${this.logPrefix}Error during roll ${i + 1}: ${error.message}`, error);
          // Continue to next roll attempt if we have time
          if (Date.now() - startTime > OVERALL_TIMEOUT - 5000) {
            logger.warn(`${this.logPrefix}Not enough time for another roll attempt, finishing`);
            break;
          }
        }
      }
      
      // Return last roll info if available
      if (lastRoll) {
        logger.success(`${this.logPrefix}Daily dice roll completed with result: ${JSON.stringify(lastRoll)}`);
        return lastRoll;
      }
      
      logger.warn(`${this.logPrefix}No successful rolls completed, returning null`);
      return null;
    } catch (error) {
      logger.error(`${this.logPrefix}Daily dice roll error: ${error.message}`, error);
      // Return null instead of throwing to allow the process to continue
      return null;
    }
  }
  
  /**
   * Check if a quest is already completed today
   * @param {string} questId Quest ID
   * @returns {Promise<boolean>} Whether the quest is completed today
   * @private
   */
  async _isQuestCompletedToday(questId) {
    try {
      // Get user quests to check if already completed (with timeout)
      let userQuestsResponse;
      try {
        const userQuestsPromise = this.api.getUserQuests();
        userQuestsResponse = await RetryUtils.withTimeout(
          userQuestsPromise,
          10000,
          'Getting user quests timed out after 10s'
        );
      } catch (error) {
        logger.error(`${this.logPrefix}Failed to get user quests: ${error.message}`, error);
        // Assume not completed if we can't check
        return false;
      }
      
      const userQuests = userQuestsResponse.data || [];
      
      // Check if quest is already completed today
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const completedToday = userQuests.some(q => 
        q.questId === questId && 
        (q.status === 'COMPLETED' || q.status === 'CLAIMED') && 
        q.createdAt && q.createdAt.startsWith(today)
      );
      
      return completedToday;
    } catch (error) {
      logger.error(`${this.logPrefix}Error checking quest completion: ${error.message}`, error);
      // Assume not completed if check fails
      return false;
    }
  }
}

module.exports = QuestService;