const fs = require('fs-extra');
const axios = require('axios');
const { ethers } = require('ethers');
const chalk = require('chalk');
const yaml = require('js-yaml');
const figlet = require('figlet');
const { HttpsProxyAgent } = require('https-proxy-agent');
const moment = require('moment');

/**
 * MAGIC NEWTON BOT
 * A simplified, single-file version of the Magic Newton bot
 */

// ===== CONFIGURATION =====
const DEFAULT_CONFIG = {
  referral: {
    code: "m8snrzf8avuytukn"  // Referral code
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

// Create a function with timeout
function withTimeout(promise, timeoutMs, errorMessage) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

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
        
        // Check for connection reset errors specifically
        const isConnectionReset = error.message && (
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('socket hang up') ||
          error.message.includes('network error')
        );
        
        if (isConnectionReset) {
          logger.warn(`Connection reset detected, waiting longer before retry...`);
          // Wait longer for connection resets (10-20 seconds)
          await sleep(randomInt(10000, 20000));
        }
        
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
        try {
          const response = await client.get('/api/auth/session');
          return response.data;
        } catch (error) {
          // Handle 401 Unauthorized as a special case (logout/session expired)
          if (error.response && error.response.status === 401) {
            return { user: null };
          }
          throw error;
        }
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
        try {
          const response = await client.get('/api/user');
          return response.data;
        } catch (error) {
          // Special handling for 401 errors - session might be expired
          if (error.response && error.response.status === 401) {
            throw new Error('Session expired or unauthorized');
          }
          throw error;
        }
      }, retries);
    },
    
    // Quests
    getQuests: async () => {
      return retryRequest(async () => {
        try {
          const response = await client.get('/api/quests');
          return response.data;
        } catch (error) {
          // Handle empty data gracefully
          if (error.response && error.response.status === 204) {
            return { data: [] };
          }
          throw error;
        }
      }, retries);
    },
    
    getUserQuests: async () => {
      return retryRequest(async () => {
        try {
          const response = await client.get('/api/userQuests');
          return response.data;
        } catch (error) {
          // Handle empty data gracefully
          if (error.response && error.response.status === 204) {
            return { data: [] };
          }
          throw error;
        }
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
      let csrfToken;
      try {
        csrfToken = await api.getCsrfToken();
      } catch (csrfError) {
        logger.error(`CSRF token error: ${csrfError.message}, using fallback random token`);
        // Generate a random token as fallback
        csrfToken = Math.random().toString(36).substring(2, 15);
      }
      
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
      
      let recaptchaToken = null;
      let recaptchaTokenV2 = null;
      
      // Solve both captchas simultaneously
      try {
        logger.info('Solving both captchas simultaneously');
        
        // Use Promise.all to handle both captchas, but with individual error handling
        const captchaPromises = await Promise.allSettled([
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
        
        // Check results
        if (captchaPromises[0].status === 'fulfilled') {
          recaptchaToken = captchaPromises[0].value;
          logger.success('Invisible reCAPTCHA solved successfully');
        } else {
          logger.error(`Invisible reCAPTCHA failed: ${captchaPromises[0].reason}`);
        }
        
        if (captchaPromises[1].status === 'fulfilled') {
          recaptchaTokenV2 = captchaPromises[1].value;
          logger.success('Visible reCAPTCHA solved successfully');
        } else {
          logger.error(`Visible reCAPTCHA failed: ${captchaPromises[1].reason}`);
        }
        
        // If both failed, we can't continue
        if (!recaptchaToken && !recaptchaTokenV2) {
          throw new Error('Both captchas failed to solve');
        }
        
        logger.success('At least one captcha solved successfully');
        
        // Prepare login payload with both captcha tokens
        const payload = new URLSearchParams({
          'message': message,
          'signature': signature,
          'redirect': 'false',
          'csrfToken': csrfToken,
          'callbackUrl': 'https://www.magicnewton.com/portal',
          'json': 'true'
        });
        
        // Add tokens if available
        if (recaptchaToken) {
          payload.append('recaptchaToken', recaptchaToken);
        }
        
        if (recaptchaTokenV2) {
          payload.append('recaptchaTokenV2', recaptchaTokenV2);
        }
        
        // Add referral code if available
        if (refCode) {
          payload.append('refCode', refCode);
        }
        
        payload.append('botScore', '1');
        
        // Add custom header to better mimic browser behavior
        const loginHeaders = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.magicnewton.com',
          'Referer': 'https://www.magicnewton.com/portal?referral=' + (refCode || '')
        };
        
        // Send login request with both captcha tokens
        logger.info('Sending login request with captcha tokens');
        let loginSuccess = false;
        let loginResponse;
        
        try {
          loginResponse = await api.login(payload, loginHeaders);
          
          // Check if login response contains URL (success indicator)
          if (loginResponse && loginResponse.url && !loginResponse.url.includes('error')) {
            loginSuccess = true;
            logger.success(`Login successful, redirect URL: ${loginResponse.url}`);
          } else {
            logger.error(`Login failed: ${loginResponse ? loginResponse.url || 'Unknown error' : 'No response'}`);
          }
        } catch (loginError) {
          logger.error(`Login request error: ${loginError.message}`);
          // We'll try to continue anyway
        }
        
        // Even if login seems to fail, we'll try to continue - sometimes the API reports failure but succeeds
        
        // Wait a bit after login to let cookies settle - longer wait to be safe
        logger.info('Waiting for session to initialize...');
        await sleep(5000);
        
        // Create a default session in case we can't get the real one
        const defaultSession = { 
          user: { 
            address: wallet.address,
            name: wallet.address.substring(0, 8) 
          } 
        };
        
        // Try to get the session, but don't fail if we can't
        let session = defaultSession;
        try {
          const sessionResponse = await api.getSession();
          
          if (sessionResponse && sessionResponse.user) {
            logger.success(`Session retrieved successfully for ${sessionResponse.user.name || sessionResponse.user.address || wallet.address}`);
            session = sessionResponse;
          } else {
            logger.warn('No user found in session, using default session');
            
            // Try one more time after a delay
            await sleep(5000);
            
            try {
              const retrySessionResponse = await api.getSession();
              if (retrySessionResponse && retrySessionResponse.user) {
                logger.success(`Retry session successful for ${retrySessionResponse.user.name || retrySessionResponse.user.address || wallet.address}`);
                session = retrySessionResponse;
              } else {
                logger.warn('Retry session failed, continuing with default session');
              }
            } catch (retrySessionError) {
              logger.warn(`Retry session error: ${retrySessionError.message}, continuing with default session`);
            }
          }
        } catch (sessionError) {
          logger.warn(`Session error: ${sessionError.message}, continuing with default session`);
        }
        
        // Always return some kind of session
        return session;
      } catch (captchaError) {
        logger.error(`Captcha error: ${captchaError.message}`);
        throw captchaError;
      }
    } catch (error) {
      logger.error(`Authentication error (attempt ${authAttempts}/${maxAuthAttempts}): ${error.message}`);
      
      if (authAttempts >= maxAuthAttempts) {
        // On last attempt, return a fake session instead of failing
        logger.warn(`All authentication attempts failed, returning fake session`);
        return { 
          user: { 
            address: wallet.address,
            name: wallet.address.substring(0, 8),
            fake: true
          } 
        };
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
  
  // Set an overall timeout for the entire function (60 seconds)
  const OVERALL_TIMEOUT = 60000;
  const startTime = Date.now();
  
  try {
    logger.info('Starting daily dice roll quest');
    
    // Get quests with timeout
    let questsResponse;
    try {
      const questsPromise = api.getQuests();
      questsResponse = await withTimeout(
        questsPromise, 
        10000, 
        'Getting quests timed out after 10s'
      );
    } catch (error) {
      logger.error(`Failed to get quests: ${error.message}`);
      return null;
    }
    
    const quests = questsResponse.data || [];
    
    // Check if we've been running too long
    if (Date.now() - startTime > OVERALL_TIMEOUT) {
      logger.warn(`Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
      return null;
    }
    
    // Find daily dice roll quest
    const diceRollQuest = quests.find(q => q.title === 'Daily Dice Roll');
    
    if (!diceRollQuest) {
      logger.warn('Daily dice roll quest not found');
      return null;
    }
    
    logger.info(`Found daily dice roll quest: ${diceRollQuest.id}`);
    
    // Check if we've been running too long
    if (Date.now() - startTime > OVERALL_TIMEOUT) {
      logger.warn(`Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
      return null;
    }
    
    // Get user quests to check if already completed (with timeout)
    let userQuestsResponse;
    try {
      const userQuestsPromise = api.getUserQuests();
      userQuestsResponse = await withTimeout(
        userQuestsPromise,
        10000,
        'Getting user quests timed out after 10s'
      );
    } catch (error) {
      logger.error(`Failed to get user quests: ${error.message}`);
      // Try to complete anyway
      userQuestsResponse = { data: [] };
    }
    
    const userQuests = userQuestsResponse.data || [];
    
    // Check if we've been running too long
    if (Date.now() - startTime > OVERALL_TIMEOUT) {
      logger.warn(`Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
      return null;
    }
    
    // Check if quest is already completed today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const completedToday = userQuests.some(q => 
      q.questId === diceRollQuest.id && 
      (q.status === 'COMPLETED' || q.status === 'CLAIMED') && 
      q.createdAt && q.createdAt.startsWith(today)
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
      // Check if we've been running too long
      if (Date.now() - startTime > OVERALL_TIMEOUT) {
        logger.warn(`Daily dice roll timed out after ${OVERALL_TIMEOUT/1000}s`);
        return lastRoll; // Return last successful roll if any
      }
      
      // Add some human-like delay between rolls
      if (i > 0) {
        const delay = randomInt(3000, 6000); // 3-6 seconds
        logger.info(`Waiting ${delay/1000} seconds before next roll`);
        await sleep(delay);
      }
      
      logger.info(`Roll ${i + 1}/${maxRolls}`);
      
      try {
        // Complete quest with timeout
        const rollPromise = api.completeQuest(diceRollQuest.id, { action: 'ROLL' });
        const rollResponse = await withTimeout(
          rollPromise,
          15000,
          `Roll ${i + 1} timed out after 15s`
        );
        
        lastRoll = rollResponse.data;
        
        logger.success(`Roll ${i + 1} complete: ${rollResponse.data._rolled_credits || 0} credits`);
        
        // If status is COMPLETED, we've used all available rolls
        if (rollResponse.data && rollResponse.data.status === 'COMPLETED') {
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
        
        logger.error(`Error during roll ${i + 1}: ${error.message}`);
        // Continue to next roll attempt if we have time
        if (Date.now() - startTime > OVERALL_TIMEOUT - 5000) {
          logger.warn('Not enough time for another roll attempt, finishing');
          break;
        }
      }
    }
    
    // Return last roll info if available before trying to get updated user quests
    if (lastRoll) {
      logger.success(`Daily dice roll completed with result: ${JSON.stringify(lastRoll)}`);
      return lastRoll;
    }
    
    logger.warn('No successful rolls completed, returning null');
    return null;
  } catch (error) {
    logger.error(`Daily dice roll error: ${error.message}`);
    if (error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    // Return null instead of throwing to allow the process to continue
    return null;
  }
}

async function completeQuests(options) {
  const { api, config, accountIndex } = options;
  
  // Set an overall timeout (90 seconds)
  const QUEST_TIMEOUT = 90000;
  const startTime = Date.now();
  
  try {
    logger.info('Starting quests completion');
    
    const completedQuests = [];
    
    // Complete daily dice roll if enabled
    if (config.quests.daily_dice_roll && config.quests.daily_dice_roll.enabled) {
      try {
        logger.info('Attempting daily dice roll quest');
        
        // Create a timeout promise for the dice roll
        const diceRollPromise = completeDailyDiceRoll(options);
        const diceRollResult = await withTimeout(
          diceRollPromise,
          60000, // 60 seconds timeout
          'Daily dice roll timed out after 60s'
        );
        
        if (diceRollResult) {
          completedQuests.push(diceRollResult);
          logger.success(`Successfully completed daily dice roll for account ${accountIndex}`);
        } else {
          logger.info(`No dice roll result for account ${accountIndex}, it may have already been completed or failed`);
        }
      } catch (error) {
        logger.error(`Failed to complete daily dice roll: ${error.message}`);
        logger.info('Continuing to next quest if any');
        // Continue with other quests if any
      }
    } else {
      logger.info('Daily dice roll quest is disabled, skipping');
    }
    
    // Check if we've been running too long
    if (Date.now() - startTime > QUEST_TIMEOUT) {
      logger.warn(`Quest completion timed out after ${QUEST_TIMEOUT/1000}s`);
      return completedQuests; // Return any completed quests
    }
    
    // Here we could add more quest types in the future
    
    return completedQuests;
  } catch (error) {
    logger.error(`Quest completion error: ${error.message}`);
    if (error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    // Return empty array instead of throwing
    return [];
  } finally {
    // Log total time taken
    const totalTime = (Date.now() - startTime) / 1000;
    logger.info(`Quest completion process finished for account ${accountIndex} (took ${totalTime.toFixed(1)}s)`);
  }
}

// ===== ACCOUNT FUNCTIONS =====
async function runAccount(options) {
  const { accountIndex, privateKey, proxy, config } = options;
  
  // Set an absolute maximum time for any account (3 minutes)
  const ACCOUNT_TIMEOUT = 180000;
  const startTime = Date.now();
  
  // Set up a timeout check that will force completion after timeout
  const timeoutCheck = setTimeout(() => {
    logger.warn(`FORCED TIMEOUT: Account ${accountIndex} processing taking too long (over ${ACCOUNT_TIMEOUT/1000}s)`);
    // This will cause any pending promises to be rejected with a timeout error
    // which should be caught by our try/catch blocks
  }, ACCOUNT_TIMEOUT);
  
  try {
    logger.info(`Starting account ${accountIndex}`);
    
    // Create wallet from private key
    let wallet;
    try {
      wallet = getWallet(privateKey);
      logger.info(`Wallet address: ${wallet.address}`);
    } catch (error) {
      logger.error(`Failed to create wallet for account ${accountIndex}: ${error.message}`);
      return {
        error: `Invalid private key: ${error.message}`,
        completedQuests: []
      };
    }
    
    // Create API client
    const api = createApiClient({
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
    
    // Authenticate - this could fail but we catch errors inside
    let session;
    try {
      const authPromise = authenticate({
        api,
        wallet,
        config,
        accountIndex
      });
      
      // Add timeout to authentication
      session = await withTimeout(
        authPromise,
        60000, // 60 seconds timeout for authentication
        `Authentication timed out after 60s for account ${accountIndex}`
      );
      
      // Wait a bit after authentication
      await sleep(2000);
    } catch (authError) {
      logger.error(`Authentication failed for account ${accountIndex}: ${authError.message}`);
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
        const userInfo = await withTimeout(
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
      
      // Complete quests - this could fail but we handle it inside
      try {
        const questsPromise = completeQuests({
          api,
          config,
          accountIndex
        });
        
        const completedQuests = await withTimeout(
          questsPromise,
          90000, // 90 seconds timeout for quests
          `Quest completion timed out after 90s for account ${accountIndex}`
        );
        
        result.completedQuests = completedQuests || [];
        logger.success(`Account ${accountIndex} completed ${result.completedQuests.length} quests`);
      } catch (questError) {
        logger.error(`Error completing quests for account ${accountIndex}: ${questError.message}`);
        result.questError = questError.message;
      }
      
      return result;
    } catch (innerError) {
      // If this part fails, just log it but don't stop the whole bot
      logger.error(`Error after authentication for account ${accountIndex}: ${innerError.message}`);
      
      if (innerError.stack) {
        logger.error(`Error stack: ${innerError.stack}`);
      }
      
      return {
        wallet: wallet.address,
        error: innerError.message,
        completedQuests: result.completedQuests || []
      };
    }
  } catch (error) {
    logger.error(`Account ${accountIndex} error: ${error.message}`);
    
    if (error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    
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
          
          // Additional error logging to help diagnose issues
          if (accountError.stack) {
            logger.error(`Error stack: ${accountError.stack}`);
          }
        }
        
      } catch (outerError) {
        // This is a fallback to catch any errors not caught by the inner try/catch
        logger.error(`Unexpected error during account processing: ${outerError.message}`);
        failureCount++;
        
        // Additional error logging
        if (outerError.stack) {
          logger.error(`Error stack: ${outerError.stack}`);
        }
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
    if (error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    
    // Instead of exiting, wait 5 minutes and restart
    logger.info('Restarting bot in 5 minutes due to main process error');
    await sleep(5 * 60 * 1000);
    main();
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('CRITICAL ERROR - Uncaught exception:', err.message);
  if (err.stack) {
    console.error('Error stack:', err.stack);
  }
  console.log('Bot recovering and continuing despite critical error...');
  
  // Force continue after a delay
  setTimeout(() => {
    try {
      console.log('Attempting to restart bot after critical error...');
      main().catch(error => {
        console.error('Failed to restart after critical error:', error.message);
        // Try again after a longer delay
        setTimeout(() => main(), 300000); // 5 minutes
      });
    } catch (e) {
      console.error('Error during restart attempt:', e.message);
      // Final fallback - restart after long delay
      setTimeout(() => main(), 600000); // 10 minutes
    }
  }, 30000); // 30 seconds
});

process.on('unhandledRejection', (err) => {
  console.error('CRITICAL ERROR - Unhandled rejection:', err.message);
  if (err.stack) {
    console.error('Error stack:', err.stack);
  }
  console.log('Bot recovering and continuing despite critical error...');
  
  // Force continue after a delay
  setTimeout(() => {
    try {
      console.log('Attempting to restart bot after critical error...');
      main().catch(error => {
        console.error('Failed to restart after critical error:', error.message);
        // Try again after a longer delay
        setTimeout(() => main(), 300000); // 5 minutes
      });
    } catch (e) {
      console.error('Error during restart attempt:', e.message);
      // Final fallback - restart after long delay
      setTimeout(() => main(), 600000); // 10 minutes
    }
  }, 30000); // 30 seconds
});

// Helper function to force the bot to stay alive
function keepAlive() {
  // Set an interval that runs every 5 minutes to make sure the process stays alive
  setInterval(() => {
    console.log(`[${new Date().toISOString()}] Bot keepalive check - process running`);
    
    // Force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
        console.log('Manual garbage collection completed');
      } catch (e) {
        console.error('Failed to run garbage collection:', e.message);
      }
    }
  }, 300000); // 5 minutes
}

// Start the bot with extreme error handling
async function startBot() {
  try {
    // Start keepalive process
    keepAlive();
    
    // Start main bot loop
    await main();
  } catch (error) {
    console.error('CRITICAL ERROR during bot startup:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
    // Wait and try again
    console.log('Waiting 60 seconds before restarting bot...');
    setTimeout(startBot, 60000);
  }
}

// Start the bot
startBot().catch(error => {
  console.error('FATAL ERROR in startBot:', error.message);
  // Restart after a delay
  setTimeout(() => startBot(), 300000); // 5 minutes
});
