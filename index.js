const fs = require('fs-extra');
const axios = require('axios');
const { ethers } = require('ethers');
const chalk = require('chalk');
const yaml = require('js-yaml');
const figlet = require('figlet');
const { HttpsProxyAgent } = require('https-proxy-agent');
const moment = require('moment');
// ===== CONFIGURATION =====
const DEFAULT_CONFIG = {
  referral: {
    code: "mbh531g1mgfgx9w2"  // Referral code
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

// ===== LOGGER =====
const logger = {
  debug: (message) => {
    // Debug dinonaktifkan
  },
  
  info: (message) => {
    console.info(chalk.blue(`[${moment().format('DD/MM/YYYY - HH:mm:ss')}] ${message}`));
  },
  
  warn: (message) => {
    console.warn(chalk.yellow(`[${moment().format('DD/MM/YYYY - HH:mm:ss')}] ${message}`));
  },
  
  error: (message) => {
    console.error(chalk.red(`[${moment().format('DD/MM/YYYY - HH:mm:ss')}] ${message}`));
  },
  
  success: (message) => {
    console.info(chalk.green(`[${moment().format('DD/MM/YYYY - HH:mm:ss')}] ${message}`));
  }
};

// ===== UTILITY FUNCTIONS =====
// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Random integer generator
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Display header
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
  console.log(chalk.cyan('Magic Newton Bot - v1.0.0 (Simplified)'));
  console.log(chalk.cyan('========================================='));
  console.log('');
}

// Load configuration
async function loadConfig() {
  try {
    // Check if config.yaml exists
    if (await fs.pathExists('./config.yaml')) {
      const fileContents = await fs.readFile('./config.yaml', 'utf8');
      const config = yaml.load(fileContents);
      
      // Merge with default config
      return { ...DEFAULT_CONFIG, ...config };
    } else {
      // Create default config file
      await fs.writeFile('./config.yaml', yaml.dump(DEFAULT_CONFIG));
      logger.info('Created default configuration file');
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    logger.error(`Error loading configuration: ${error.message}`);
    return DEFAULT_CONFIG;
  }
}

// Load proxies
async function loadProxies(filePath) {
  try {
    if (!await fs.pathExists(filePath)) {
      logger.warn(`Proxy file not found: ${filePath}. Creating empty file.`);
      await fs.writeFile(filePath, '');
      return [];
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    logger.error(`Error loading proxies: ${error.message}`);
    return [];
  }
}

// Load private keys
async function loadPrivateKeys(filePath) {
  try {
    if (!await fs.pathExists(filePath)) {
      logger.warn(`Private key file not found: ${filePath}. Creating empty file.`);
      await fs.writeFile(filePath, '');
      return [];
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    logger.error(`Error loading private keys: ${error.message}`);
    return [];
  }
}

// Setup proxy for axios
function setupProxy(axiosInstance, proxyString) {
  try {
    if (!proxyString) return axiosInstance;
    
    logger.info(`Setting up proxy: ${proxyString}`);
    
    // Parse proxy string (format: user:pass@host:port)
    let auth = null;
    let host = null;
    let port = null;
    
    if (proxyString.includes('@')) {
      const [authPart, hostPart] = proxyString.split('@');
      auth = authPart;
      
      if (hostPart.includes(':')) {
        const [hostValue, portValue] = hostPart.split(':');
        host = hostValue;
        port = parseInt(portValue);
      } else {
        host = hostPart;
        port = 80;
      }
    } else if (proxyString.includes(':')) {
      const [hostValue, portValue] = proxyString.split(':');
      host = hostValue;
      port = parseInt(portValue);
    } else {
      host = proxyString;
      port = 80;
    }
    
    // Construct proxy URL
    let proxyUrl;
    if (auth) {
      proxyUrl = `http://${auth}@${host}:${port}`;
    } else {
      proxyUrl = `http://${host}:${port}`;
    }
    
    // Create proxy agent
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    
    // Configure axios with proxy
    axiosInstance.defaults.proxy = false;
    axiosInstance.defaults.httpAgent = proxyAgent;
    axiosInstance.defaults.httpsAgent = proxyAgent;
    
    return axiosInstance;
  } catch (error) {
    logger.error(`Error setting up proxy: ${error.message}`);
    return axiosInstance;
  }
}

// ===== API CLIENT =====
function createApiClient(options) {
  const { userAgent, proxy, accountIndex, retries } = options;
  
  // Create axios instance
  let client = axios.create({
    baseURL: 'https://www.magicnewton.com/portal',
    headers: {
      'User-Agent': userAgent,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      'Origin': 'https://www.magicnewton.com',
      'Referer': 'https://www.magicnewton.com/portal',
      'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    },
    withCredentials: true,
    timeout: 30000
  });
  
  // Setup proxy if provided
  if (proxy) {
    client = setupProxy(client, proxy);
  }
  
  // Set up response interceptor for logging
  client.interceptors.response.use(
    response => {
      // Debug logging dihapus
      
      // Store cookies if they're in the response
      if (response.headers && response.headers['set-cookie']) {
        const cookies = response.headers['set-cookie'];
        client.defaults.headers.Cookie = cookies.join('; ');
      }
      
      return response;
    },
    error => {
      if (error.response) {
        logger.error(`API Error: ${error.response.status} ${error.config.method.toUpperCase()} ${error.config.url} - ${JSON.stringify(error.response.data || 'No response data')}`);
      } else if (error.request) {
        logger.error(`API Error: No response received for ${error.config.method.toUpperCase()} ${error.config.url} - ${error.message}`);
      } else {
        logger.error(`API Error: ${error.message}`);
      }
      return Promise.reject(error);
    }
  );
  
  // Implement a simple retry mechanism
  const retryRequest = async (fn, retryOptions) => {
    const { max_attempts, initial_delay, max_delay } = retryOptions;
    let attempts = 0;
    let lastError;
    
    while (attempts < max_attempts) {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        lastError = error;
        
        if (attempts >= max_attempts) break;
        
        // Calculate exponential backoff with jitter
        const delay = Math.min(initial_delay * Math.pow(2, attempts - 1), max_delay);
        const jitter = Math.random() * 0.3 * delay;
        const waitTime = Math.floor(delay + jitter);
        
        logger.warn(`Request failed, retrying in ${waitTime}ms (attempt ${attempts}/${max_attempts})`);
        await sleep(waitTime);
      }
    }
    
    throw lastError;
  };
  
  // API wrapper with retry functionality
  return {
    // Session and Auth
    getSession: async () => {
      return retryRequest(async () => {
        const response = await client.get('/api/auth/session');
        return response.data;
      }, retries);
    },
    
    getCsrfToken: async () => {
      return retryRequest(async () => {
        const response = await client.get('/api/auth/csrf');
        return response.data.csrfToken;
      }, retries);
    },
    
    login: async (payload, headers = {}) => {
      return retryRequest(async () => {
        const response = await client.post('/api/auth/callback/credentials', payload, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...headers
          }
        });
        return response.data;
      }, retries);
    },
    
    // User
    getUserInfo: async () => {
      return retryRequest(async () => {
        const response = await client.get('/api/user');
        return response.data;
      }, retries);
    },
    
    // Quests
    getQuests: async () => {
      return retryRequest(async () => {
        const response = await client.get('/api/quests');
        return response.data;
      }, retries);
    },
    
    getUserQuests: async () => {
      return retryRequest(async () => {
        const response = await client.get('/api/userQuests');
        return response.data;
      }, retries);
    },
    
    completeQuest: async (questId, metadata) => {
      return retryRequest(async () => {
        try {
          const response = await client.post('/api/userQuests', {
            questId,
            metadata
          });
          return response.data;
        } catch (error) {
          // Handle "Quest already completed" as a non-error case
          if (error.response && 
              error.response.status === 400 && 
              error.response.data && 
              error.response.data.message === "Quest already completed") {
            return {
              data: {
                status: 'COMPLETED',
                _rolled_credits: 0,
                message: 'Quest already completed'
              }
            };
          }
          throw error;
        }
      }, retries);
    }
  };
}

// ===== CAPTCHA SOLVER =====
async function solveCaptcha(options) {
  const { apiKey, siteKey, url, type, isInvisible = false, timeout = 120 } = options;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    try {
      if (!apiKey || !siteKey || !url || !type) {
        throw new Error('Missing required captcha parameters');
      }
      
      logger.info(`Captcha attempt ${attempts}/${maxAttempts} for ${type}${isInvisible ? ' (invisible)' : ''}`);
      
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
          logger.info(`Setting up invisible reCAPTCHA v2`);
        } else {
          logger.info(`Setting up standard reCAPTCHA v2`);
        }
      } else if (type === 'turnstile') {
        task = {
          type: 'AntiTurnstileTaskProxyless',
          websiteURL: url,
          websiteKey: siteKey
        };
        
        logger.info(`Setting up Turnstile captcha`);
      } else {
        throw new Error(`Unsupported captcha type: ${type}`);
      }
      
      // Create captcha task
      const createTaskResponse = await axios.post('https://api.capsolver.com/createTask', {
        clientKey: apiKey,
        task: task
      }, {
        timeout: 30000
      });
      
      if (createTaskResponse.data.errorId > 0) {
        const errorCode = createTaskResponse.data.errorCode;
        const errorDesc = createTaskResponse.data.errorDescription;
        throw new Error(`Capsolver error: [${errorCode}] ${errorDesc}`);
      }
      
      const taskId = createTaskResponse.data.taskId;
      logger.info(`Captcha task created: ${taskId}`);
      
      // Get task result
      let startTime = Date.now();
      let solution = null;
      
      logger.info(`Waiting for captcha solution (timeout: ${timeout}s)...`);
      
      while (Date.now() - startTime < timeout * 1000) {
        await sleep(3000); // Poll every 3 seconds
        
        const getTaskResponse = await axios.post('https://api.capsolver.com/getTaskResult', {
          clientKey: apiKey,
          taskId: taskId
        }, {
          timeout: 10000
        });
        
        if (getTaskResponse.data.errorId > 0) {
          const errorCode = getTaskResponse.data.errorCode;
          const errorDesc = getTaskResponse.data.errorDescription;
          throw new Error(`Capsolver error: [${errorCode}] ${errorDesc}`);
        }
        
        logger.info(`Captcha task status: ${getTaskResponse.data.status}`);
        
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
      
      logger.info(`Captcha solved successfully`);
      return solution;
    } catch (error) {
      logger.error(`Captcha solving error (attempt ${attempts}/${maxAttempts}): ${error.message}`);
      
      if (attempts >= maxAttempts) {
        throw error;
      }
      
      const waitTime = 5000 * attempts;
      await sleep(waitTime);
    }
  }
}

// ===== WALLET FUNCTIONS =====
function getWallet(privateKey) {
  try {
    return new ethers.Wallet(privateKey);
  } catch (error) {
    logger.error(`Error creating wallet: ${error.message}`);
    throw error;
  }
}

async function signMessage(message, wallet) {
  try {
    return await wallet.signMessage(message);
  } catch (error) {
    logger.error(`Error signing message: ${error.message}`);
    throw error;
  }
}

// ===== AUTHENTICATION =====
async function authenticate(options) {
  const { api, wallet, config } = options;
  let authAttempts = 0;
  const maxAuthAttempts = 3;
  
  while (authAttempts < maxAuthAttempts) {
    authAttempts++;
    
    try {
      logger.info(`Authentication attempt ${authAttempts}/${maxAuthAttempts}`);
      
      // Get CSRF token
      const csrfToken = await api.getCsrfToken();
      
      // Prepare wallet signature
      const walletAddress = wallet.address;
      const timestamp = new Date().toISOString();
      
      const message = `www.magicnewton.com wants you to sign in with your Ethereum account:
${walletAddress}

Please sign with your account

URI: https://www.magicnewton.com
Version: 1
Chain ID: 1
Nonce: ${csrfToken}
Issued At: ${timestamp}`;
      
      logger.info(`Signing message with wallet`);
      const signature = await signMessage(message, wallet);
      
      // Prepare referral code if available
      let refCode = '';
      if (config.referral && config.referral.code) {
        refCode = config.referral.code;
      }
      
      // Solve both captchas simultaneously
      try {
        logger.info('Solving both captchas simultaneously');
        
        // Use Promise.all to handle both captchas
        const [recaptchaToken, recaptchaTokenV2] = await Promise.all([
          // Invisible reCAPTCHA
          solveCaptcha({
            apiKey: config.captcha.api_key,
            siteKey: config.captcha.types.recaptcha_v2.invisible_sitekey,
            url: 'https://www.magicnewton.com/portal',
            type: 'recaptchaV2',
            isInvisible: true,
            timeout: config.captcha.timeout || 120
          }),
          
          // Visible reCAPTCHA
          solveCaptcha({
            apiKey: config.captcha.api_key,
            siteKey: config.captcha.types.recaptcha_v2.visible_sitekey,
            url: 'https://www.magicnewton.com/portal',
            type: 'recaptchaV2',
            isInvisible: false,
            timeout: config.captcha.timeout || 120
          })
        ]);
        
        logger.success('Both captchas solved successfully');
        
        // Prepare login payload with both captcha tokens
        const payload = new URLSearchParams({
          'message': message,
          'signature': signature,
          'redirect': 'false',
          'recaptchaToken': recaptchaToken,
          'recaptchaTokenV2': recaptchaTokenV2,
          'refCode': refCode,
          'botScore': '1',
          'csrfToken': csrfToken,
          'callbackUrl': 'https://www.magicnewton.com/portal',
          'json': 'true'
        });
        
        // Add custom header to better mimic browser behavior
        const loginHeaders = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.magicnewton.com',
          'Referer': 'https://www.magicnewton.com/portal?referral=' + (refCode || '')
        };
        
        // Send login request with both captcha tokens
        logger.info('Sending login request with both captcha tokens');
        const loginResponse = await api.login(payload, loginHeaders);
        
        // Check if login response contains URL (success indicator)
        if (!loginResponse.url || loginResponse.url.includes('error')) {
          throw new Error(`Login failed: ${loginResponse.url || 'Unknown error'}`);
        }
        
        logger.success(`Login successful, redirect URL: ${loginResponse.url}`);
        
        // Wait a bit after login to let cookies settle
        await sleep(3000);
        
        // Get session to verify login worked
        const session = await api.getSession();
        
        if (session.user) {
          logger.success(`Authentication successful for ${session.user.name}`);
          return session;
        } else {
          // Try one more time after a delay
          logger.warn('No user found in session, retrying after delay');
          await sleep(3000);
          
          const retrySession = await api.getSession();
          if (retrySession.user) {
            logger.success(`Authentication successful for ${retrySession.user.name}`);
            return retrySession;
          } else {
            throw new Error('Authentication failed - no user in session');
          }
        }
      } catch (captchaError) {
        logger.error(`Captcha error: ${captchaError.message}`);
        throw captchaError;
      }
    } catch (error) {
      logger.error(`Authentication error (attempt ${authAttempts}/${maxAuthAttempts}): ${error.message}`);
      
      if (authAttempts >= maxAuthAttempts) {
        throw error;
      }
      
      // Wait before next attempt - increasing delay
      const waitTime = 5000 * authAttempts; // 5s, 10s, 15s
      logger.info(`Waiting ${waitTime/1000}s before next authentication attempt`);
      await sleep(waitTime);
    }
  }
}

// ===== QUEST FUNCTIONS =====
async function completeDailyDiceRoll(options) {
  const { api, config } = options;
  
  try {
    logger.info('Starting daily dice roll quest');
    
    // Get quests
    const questsResponse = await api.getQuests();
    const quests = questsResponse.data;
    
    // Find daily dice roll quest
    const diceRollQuest = quests.find(q => q.title === 'Daily Dice Roll');
    
    if (!diceRollQuest) {
      throw new Error('Daily dice roll quest not found');
    }
    
    logger.info(`Found daily dice roll quest: ${diceRollQuest.id}`);
    
    // Get user quests to check if already completed
    const userQuestsResponse = await api.getUserQuests();
    const userQuests = userQuestsResponse.data;
    
    // Check if quest is already completed today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const completedToday = userQuests.some(q => 
      q.questId === diceRollQuest.id && 
      (q.status === 'COMPLETED' || q.status === 'CLAIMED') && 
      q.createdAt.startsWith(today)
    );
    
    if (completedToday) {
      logger.info('Daily dice roll already completed today');
      return null;
    }
    
    // Complete the roll quest
    logger.info('Rolling dice');
    
    let lastRoll = null;
    const maxRolls = config.quests.daily_dice_roll.rolls || 5;
    
    for (let i = 0; i < maxRolls; i++) {
      // Add some human-like delay between rolls
      if (i > 0) {
        const delay = randomInt(3000, 6000); // 3-6 seconds
        logger.info(`Waiting ${delay/1000} seconds before next roll`);
        await sleep(delay);
      }
      
      logger.info(`Roll ${i + 1}/${maxRolls}`);
      
      try {
        const rollResponse = await api.completeQuest(diceRollQuest.id, { 
          action: 'ROLL' 
        });
        
        lastRoll = rollResponse.data;
        
        logger.success(`Roll ${i + 1} complete: ${rollResponse.data._rolled_credits} credits`);
        
        // If status is COMPLETED, we've used all available rolls
        if (rollResponse.data.status === 'COMPLETED') {
          logger.info('All rolls completed');
          break;
        }
      } catch (error) {
        // Check for "Quest already completed" error
        if (error.response && 
            error.response.data && 
            error.response.data.message === "Quest already completed") {
          logger.info('Quest already completed during roll attempt');
          return { 
            questId: diceRollQuest.id, 
            status: 'COMPLETED', 
            message: 'Quest already completed' 
          };
        }
        
        // Re-throw other errors
        throw error;
      }
    }
    
    // Get updated user quests
    const updatedUserQuestsResponse = await api.getUserQuests();
    const completedQuest = updatedUserQuestsResponse.data.find(q => 
      q.questId === diceRollQuest.id && 
      q.status === 'COMPLETED' && 
      q.createdAt.startsWith(today)
    );
    
    if (completedQuest) {
      logger.success(`Daily dice roll completed, earned ${completedQuest.credits} credits`);
      return completedQuest;
    } else if (lastRoll) {
      logger.success(`Daily dice roll partially completed, earned ${lastRoll._rolled_credits} credits`);
      return lastRoll;
    } else {
      throw new Error('Failed to complete daily dice roll');
    }
  } catch (error) {
    logger.error(`Daily dice roll error: ${error.message}`);
    throw error;
  }
}

async function completeQuests(options) {
  const { api, config } = options;
  
  try {
    logger.info('Starting quests completion');
    
    const completedQuests = [];
    
    // Complete daily dice roll if enabled
    if (config.quests.daily_dice_roll.enabled) {
      const diceRollResult = await completeDailyDiceRoll(options);
      if (diceRollResult) {
        completedQuests.push(diceRollResult);
      }
    }
    
    return completedQuests;
  } catch (error) {
    logger.error(`Quest completion error: ${error.message}`);
    throw error;
  }
}

// ===== ACCOUNT FUNCTIONS =====
async function runAccount(options) {
  const { accountIndex, privateKey, proxy, config } = options;
  
  try {
    logger.info(`Starting account ${accountIndex}`);
    
    // Create wallet from private key
    const wallet = getWallet(privateKey);
    logger.info(`Wallet address: ${wallet.address}`);
    
    // Create API client
    const api = createApiClient({
      userAgent: config.bot.user_agent,
      proxy,
      accountIndex,
      retries: config.bot.retries
    });
    
    // Authenticate
    await authenticate({
      api,
      wallet,
      config,
      accountIndex
    });
    
    // Wait a bit after authentication
    await sleep(2000);
    
    try {
      // Get user info
      const userInfo = await api.getUserInfo();
      logger.info(`User info retrieved: ${userInfo.data.name}`);
      logger.info(`Referral code: ${userInfo.data.refCode}`);
      
      // Complete quests
      const completedQuests = await completeQuests({
        api,
        config,
        accountIndex
      });
      
      logger.success(`Account ${accountIndex} completed ${completedQuests.length} quests`);
      
      return {
        wallet: wallet.address,
        completedQuests
      };
    } catch (innerError) {
      // If this part fails, just log it but don't stop the whole bot
      logger.error(`Error after authentication for account ${accountIndex}: ${innerError.message}`);
      return {
        wallet: wallet.address,
        error: innerError.message,
        completedQuests: []
      };
    }
  } catch (error) {
    logger.error(`Account ${accountIndex} error: ${error.message}`);
    throw error;
  } finally {
    // Always log when an account is finished processing
    logger.info(`Finished processing account ${accountIndex}`);
  }
}

// ===== MAIN FUNCTION =====
async function main() {
  try {
    // Display ASCII art header
    displayHeader();
    
    // Load configuration
    const config = await loadConfig();
    
    // Load proxies if enabled
    let proxies = [];
    if (config.proxy.enabled) {
      proxies = await loadProxies(config.proxy.file);
      logger.info(`Loaded ${proxies.length} proxies`);
    }
    
    // Load private keys
    const privateKeys = await loadPrivateKeys(config.wallet.private_key_file);
    logger.info(`Loaded ${privateKeys.length} private keys`);
    
    // Track success/failure stats
    let successCount = 0;
    let failureCount = 0;
    
    // Run for each account
    for (let i = 0; i < privateKeys.length; i++) {
      try {
        const accountIndex = i + 1;
        logger.info(`Starting account ${accountIndex} of ${privateKeys.length}`);
        
        // Setup proxy for this account if enabled
        let proxy = null;
        if (config.proxy.enabled && proxies.length > 0) {
          const proxyIndex = config.proxy.rotation.mode === 'sequential' 
            ? Math.floor(i / config.proxy.rotation.switch_after) % proxies.length
            : Math.floor(Math.random() * proxies.length);
          proxy = proxies[proxyIndex];
          logger.info(`Using proxy ${proxyIndex + 1} for account ${accountIndex}`);
        }
        
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
          logger.error(`Account ${accountIndex} failed: ${accountError.message}`);
          failureCount++;
        }
        
      } catch (outerError) {
        // This is a fallback to catch any errors not caught by the inner try/catch
        logger.error(`Unexpected error during account processing: ${outerError.message}`);
        failureCount++;
      }
      
      // Always continue to the next account, even after errors
      if (i < privateKeys.length - 1) {
        logger.info(`Waiting ${config.bot.delay_between_accounts} seconds before next account`);
        await sleep(config.bot.delay_between_accounts * 1000);
      }
    }
    
    // Log summary
    logger.info(`Account processing complete: ${successCount} successful, ${failureCount} failed`);
    
    // All accounts completed - wait before next run
    const delayHours = config.bot.delay_after_completion;
    logger.info(`All accounts completed. Waiting ${delayHours} hours before next run`);
    
    // Wait for the specified delay and then restart
    await sleep(delayHours * 60 * 60 * 1000);
    
    // Restart the process
    logger.info('Restarting bot for next cycle');
    main();
  } catch (error) {
    logger.error(`Main process error: ${error.message}`);
    console.error(error);
    
    // Instead of exiting, wait 5 minutes and restart
    logger.info('Restarting bot in 5 minutes due to main process error');
    await sleep(5 * 60 * 1000);
    main();
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  console.log('Bot continuing despite error...');
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  console.log('Bot continuing despite error...');
});

// Start the bot
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  // Restart after a delay
  setTimeout(() => main(), 300000); // 5 minutes
});
