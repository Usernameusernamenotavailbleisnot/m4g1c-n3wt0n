// src/services/QuestService.js
const logger = require('../utils/logger');
const { withTimeout, sleep } = require('../utils/helpers');

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
    const QUEST_TIMEOUT = 90000;
    const startTime = Date.now();
    
    try {
      logger.info(`${this.logPrefix}Starting quests completion`);
      
      const completedQuests = [];
      
      // Complete daily dice roll if enabled
      if (this.config.quests.daily_dice_roll && this.config.quests.daily_dice_roll.enabled) {
        try {
          logger.info(`${this.logPrefix}Attempting daily dice roll quest`);
          
          const diceRollPromise = this.completeDailyDiceRoll();
          const diceRollResult = await withTimeout(
            diceRollPromise,
            60000, // 60 seconds timeout
            `Daily dice roll timed out after 60s`
          );
          
          if (diceRollResult) {
            completedQuests.push(diceRollResult);
            logger.success(`${this.logPrefix}Successfully completed daily dice roll`);
          } else {
            logger.info(`${this.logPrefix}No dice roll result, may have already been completed`);
          }
        } catch (error) {
          logger.error(`${this.logPrefix}Failed to complete daily dice roll: ${error.message}`);
          logger.info(`${this.logPrefix}Continuing to next quest if any`);
        }
      } else {
        logger.info(`${this.logPrefix}Daily dice roll quest is disabled, skipping`);
      }
      
      // Check for timeout
      if (Date.now() - startTime > QUEST_TIMEOUT) {
        logger.warn(`${this.logPrefix}Quest completion timed out after ${QUEST_TIMEOUT/1000}s`);
        return completedQuests;
      }
      
      // Add more quest types here in the future
      
      return completedQuests;
    } catch (error) {
      logger.error(`${this.logPrefix}Quest completion error: ${error.message}`);
      return [];
    } finally {
      const totalTime = (Date.now() - startTime) / 1000;
      logger.debug(`${this.logPrefix}Quest completion process finished (took ${totalTime.toFixed(1)}s)`);
    }
  }
  
  /**
   * Complete daily dice roll quest
   * @returns {Promise<Object>} Quest result
   */
  async completeDailyDiceRoll() {
    const OVERALL_TIMEOUT = 60000;
    const startTime = Date.now();
    
    try {
      logger.info(`${this.logPrefix}Starting daily dice roll quest`);
      
      // Get quests with timeout
      let questsResponse;
      try {
        const questsPromise = this.api.getQuests();
        questsResponse = await withTimeout(
          questsPromise, 
          10000, 
          'Getting quests timed out after 10s'
        );
      } catch (error) {
        logger.error(`${this.logPrefix}Failed to get quests: ${error.message}`);
        return null;
      }
      
      const quests = questsResponse.data || [];
      
      // Check for timeout
      if (Date.now() - startTime > OVERALL_TIMEOUT - 5000) {
        logger.warn(`${this.logPrefix}Daily dice roll timed out after ${OVERALL_TIMEOUT/1000 - 5}s`);
        return null;
      }
      
      // Find daily dice roll quest
      const diceRollQuest = quests.find(q => q.title === 'Daily Dice Roll');
      
      if (!diceRollQuest) {
        logger.warn(`${this.logPrefix}Daily dice roll quest not found`);
        return null;
      }
      
      logger.debug(`${this.logPrefix}Found daily dice roll quest: ${diceRollQuest.id}`);
      
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
      
      // Complete the dice roll quest once (not multiple times like in the old code)
      logger.info(`${this.logPrefix}Executing daily dice roll`);
      
      try {
        // Complete quest with empty metadata (based on the new requirement)
        const rollPromise = this.api.completeQuest(diceRollQuest.id, {});
        const rollResponse = await withTimeout(
          rollPromise,
          15000,
          `Dice roll timed out after 15s`
        );
        
        // Extract just the relevant information (credits)
        const credits = rollResponse.data.credits || 0;
        logger.success(`${this.logPrefix}Dice roll complete: +${credits} credits`);
        
        return rollResponse.data;
      } catch (error) {
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
        
        logger.error(`${this.logPrefix}Error during dice roll: ${error.message}`);
        throw error;
      }
    } catch (error) {
      logger.error(`${this.logPrefix}Daily dice roll error: ${error.message}`);
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
      // Get user quests to check if already completed
      let userQuestsResponse;
      try {
        const userQuestsPromise = this.api.getUserQuests();
        userQuestsResponse = await withTimeout(
          userQuestsPromise,
          10000,
          'Getting user quests timed out after 10s'
        );
      } catch (error) {
        logger.error(`${this.logPrefix}Failed to get user quests: ${error.message}`);
        return false; // Assume not completed if we can't check
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
      logger.error(`${this.logPrefix}Error checking quest completion: ${error.message}`);
      return false; // Assume not completed if check fails
    }
  }
}

module.exports = QuestService;