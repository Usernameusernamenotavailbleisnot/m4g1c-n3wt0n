# Magic Newton Bot

A simple bot that automates interactions with the Magic Newton platform, including login and completing daily quests.

## Features

- Automated login using Ethereum wallet
- Daily quest completion (daily dice roll)
- Multiple account support
- Proxy support (with rotation)
- Automated captcha solving (Capsolver)
- Single JavaScript file for ease of use

## Requirements

- Node.js (version 16 or newer)
- Capsolver account with sufficient credits
- Ethereum private keys for login

## Installation

1. Clone or download this repository
2. Install required dependencies:

```bash
npm install fs-extra axios ethers chalk js-yaml figlet https-proxy-agent moment
```

3. Set up configuration and data files:
   - `config.yaml` (created automatically if not present)
   - `pk.txt` (containing Ethereum private keys, one key per line)
   - `proxy.txt` (containing proxies in `user:pass@ip:port` format, one proxy per line)

## Usage

1. Make sure to add your Capsolver API key in `config.yaml`
2. Run the bot with the command:

```bash
node magic-newton-bot.js
```

3. The bot will automatically:
   - Log in to each account using the provided private keys
   - Complete the daily dice roll
   - Switch to the next account with configured delay
   - Restart after all accounts are finished (based on configured delay)

## Configuration

Edit the `config.yaml` file to customize bot settings:

```yaml
referral:
  code: ""  # Your referral code (optional)

bot:
  delay_between_accounts: 5 # seconds
  delay_after_completion: 25 # hours
  retries:
    max_attempts: 5
    initial_delay: 1000 # ms
    max_delay: 30000 # ms
  user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"

proxy:
  enabled: true
  file: "./proxy.txt"
  rotation:
    mode: "sequential" # sequential or random
    switch_after: 1 # number of accounts before switching proxy

wallet:
  private_key_file: "./pk.txt"

captcha:
  service: "capsolver"
  api_key: "" # IMPORTANT: Add your Capsolver API key here
  timeout: 120 # seconds
  types:
    recaptcha_v2:
      invisible_sitekey: "6LcGDIMqAAAAAH4O4-y9yAYaEAEJsCwsr8tC6VBJ"
      visible_sitekey: "6LcUI9wqAAAAAMvmAeHBxYKzp193-ymQ-pH3hf6O"
    turnstile:
      enabled: true

quests:
  daily_dice_roll:
    enabled: true
    rolls: 5
```

## Important Settings

- **Capsolver API Key**: Fill in `captcha.api_key` in `config.yaml` with your Capsolver API key.
- **Private Keys**: Add your Ethereum private keys in the `pk.txt` file (one key per line).
- **Proxies**: If using proxies, enable in `config.yaml` and fill the `proxy.txt` file with your proxy list.

## Note

This bot is created for educational purposes. Using bots may violate platform terms of service. Use at your own risk.

## License

This project is licensed under the MIT License. See the LICENSE file for full details.
