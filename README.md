# m4g1c n3wt0n Bot

reliable bot for automating interactions with the m4g1c n3wt0n platform, including login and completing daily quests.

## Features

- **Robust Authentication**: Reliable wallet-based login with automatic captcha solving
- **Task Automation**: Automated daily quest completion
- **Multi-Account Support**: Process multiple wallets sequentially 
- **Proxy Support**: Configurable proxy rotation (sequential or random)
- **Integrated Captcha Solving**: Built-in support for Capsolver
- **Error Resilience**: Comprehensive error handling and automatic recovery

## System Requirements

- Node.js 16.x or newer
- Capsolver account with API key and sufficient credits
- Ethereum private keys for each account

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/Usernameusernamenotavailbleisnot/m4g1c-n3wt0n.git
   cd magic-newton
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create configuration files:
   - `config.yaml` (created automatically on first run if not present)
   - `pk.txt` (containing one Ethereum private key per line)
   - `proxy.txt` (optional, containing proxies in `user:pass@ip:port` format, one per line)

## Configuration

The bot uses a YAML configuration file with the following structure:

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
```

### Configuration Options

- **Referral**: Set your referral code for new accounts (optional)
- **Bot**: Configure timing between accounts and execution cycles
- **Proxy**: Enable and configure proxy usage
- **Wallet**: Specify private key file location
- **Captcha**: Configure captcha solving
- **Quests**: Enable/disable specific automated tasks

## Usage

1. Set up your configuration:
   - Add your Capsolver API key to `config.yaml`
   - Add your private keys to `pk.txt`
   - Add proxies to `proxy.txt` if using proxies

2. Run the bot:
   ```bash
   npm start
   ```

The bot will:
- Start processing accounts sequentially
- Log in using the provided private keys
- Complete the daily dice roll quest for each account
- Wait the configured time between accounts
- Repeat the cycle after all accounts are processed (after the configured delay)

## Error Handling

The bot includes comprehensive error handling:
- Automatic retries with exponential backoff
- Recovery from network issues
- Watchdog timers to prevent stuck processes
- Global error recovery to prevent crashes

## Security Notice

- Keep your private keys secure and never share them
- Consider using different private keys than your main wallets
- The bot stores your private keys as plain text, so secure your server

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This bot is created for educational purposes. Using bots may violate platform terms of service. Use at your own risk.
