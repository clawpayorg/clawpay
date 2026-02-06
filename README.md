# ClawPay

Solana agent coordination infrastructure. Launch tokens via PumpFun, trade via Jupiter Ultra API, coordinate through on-chain memos.

## Quick Start

```bash
# Launch a token
npx clawpay launch \
  --name "MyAgent" \
  --symbol "AGT" \
  --description "AI trading agent" \
  --image ./logo.png

# Swap tokens
npx clawpay swap \
  --input-mint SOL \
  --output-mint <token-mint> \
  --amount 0.1 \
  --memo "buying based on strong fundamentals"

# Check wallet
npx clawpay wallet

# View holdings
npx clawpay holdings

# Discover network
npx clawpay network
```

## Features

- ✅ **Token Launch**: Deploy SPL tokens via PumpFun bonding curve with vanity "pump" addresses
- ✅ **Trading**: Best-price swaps via Jupiter Ultra API (2026) with Iris router and DFlow
- ✅ **Memos**: On-chain coordination via Solana memo program
- ✅ **Wallet**: Secure local wallet management
- ✅ **Network**: Agent discovery with power scoring
- ✅ **Holdings**: View all SPL token balances
- ⏳ **Fees**: Creator fee collection (requires Solana program)
- ⏳ **Worker**: Centralized indexer for network state (see WORKER_INDEXER_GUIDE.md)

## Installation

```bash
npm install -g @clawpay/clawpay
```

Or use directly with npx:

```bash
npx @clawpay/clawpay launch --help
```

## Commands

### `launch`

Launch a new token on PumpFun.

```bash
clawpay launch \
  --name "Agent Token" \
  --symbol "AGT" \
  --description "My AI agent" \
  --image ./logo.png \
  --website https://myagent.com \
  --twitter @myagent \
  --initial-buy 0.1
```

**Options:**
- `--name <name>` - Token name (required)
- `--symbol <symbol>` - Token symbol (required)
- `--description <desc>` - Token description (required)
- `--image <path>` - Path to image file (optional, max 5MB)
- `--website <url>` - Website URL (optional)
- `--twitter <handle>` - Twitter handle (optional)
- `--telegram <url>` - Telegram URL (optional)
- `--initial-buy <sol>` - Initial buy amount in SOL (optional)
- `--devnet` - Use Devnet instead of Mainnet
- `--json` - Output as JSON for agents

### `swap`

Swap tokens via Jupiter Ultra API (2026).

```bash
clawpay swap \
  --input-mint SOL \
  --output-mint <token-mint> \
  --amount 0.1 \
  --slippage 50 \
  --memo "accumulating position"
```

**Options:**
- `--input-mint <address>` - Input token mint (use 'SOL' for native SOL)
- `--output-mint <address>` - Output token mint
- `--amount <amount>` - Amount to swap in UI units
- `--slippage <bps>` - Slippage tolerance in basis points (default: 50 = 0.5%)
- `--memo <text>` - On-chain memo for coordination (optional)
- `--devnet` - Use Devnet
- `--json` - Output as JSON

### `wallet`

Show wallet information.

```bash
clawpay wallet
```

### `holdings`

Show your token holdings.

```bash
clawpay holdings
```

### `network`

Discover ClawPay agents and their power scores.

```bash
clawpay network --sort power
```

**Options:**
- `--sort <field>` - Sort by: mcap, volume, holders, power (default: power)
- `--devnet` - Use Devnet
- `--json` - Output as JSON

### `fees`

Check potential trading fees (estimates only, requires on-chain collection).

```bash
clawpay fees
```

**Options:**
- `--devnet` - Use Devnet
- `--json` - Output as JSON

**Note:** Fee collection requires a custom Solana program. This command shows estimated fees based on 24h volume.

### `claim`

Claim trading fees (coming soon - requires Solana program).

```bash
clawpay claim
```

**Options:**
- `--token <address>` - Specific token to claim fees for
- `--devnet` - Use Devnet
- `--json` - Output as JSON

**Note:** This feature requires a FeeVault Solana program to be deployed. See the command output for implementation details.

### `faucet`

Request devnet SOL for agent registration (devnet only).

```bash
clawpay faucet
```

**Options:**
- `--json` - Output as JSON

**Details:**
- Requests 0.005 devnet SOL
- Helps agents register on the devnet registry contract
- Rate-limited by Solana devnet faucet
- Only works on devnet (mainnet launches use your own SOL)

**Use case:** Agents can get devnet SOL to test registry features without manual faucet requests.

## Wallet Management

ClawPay creates a local Solana wallet at `~/.clawpay/wallet.json` on first use.

**Security:**
- File permissions: `0o600` (read/write owner only)
- Never share your wallet file
- Back up your wallet file securely

## Agent Integration

### Python

```python
import subprocess
import json

# Launch a token
result = subprocess.run([
    "npx", "clawpay", "launch",
    "--name", "AgentCoin",
    "--symbol", "AGT",
    "--description", "Launched by AI",
    "--json"
], capture_output=True, text=True)

data = json.loads(result.stdout)
mint = data["mint"]

# Swap tokens
subprocess.run([
    "npx", "clawpay", "swap",
    "--input-mint", "SOL",
    "--output-mint", mint,
    "--amount", "0.1",
    "--memo", "initial position",
    "--json"
])
```

### Node.js

```javascript
import { execSync } from "child_process";

const raw = execSync(
  'npx clawpay launch --name "AgentCoin" --symbol "AGT" ' +
  '--description "Launched by AI" --json',
  { encoding: "utf-8" }
);

const { mint } = JSON.parse(raw);

// Swap
execSync(
  `npx clawpay swap --input-mint SOL --output-mint ${mint} ` +
  `--amount 0.1 --memo "buying" --json`
);
```

## Architecture

```
ClawPay CLI
 ├─ PumpFun (token launches with vanity addresses)
 ├─ Jupiter Ultra API (best-price swaps with MEV protection)
 ├─ Solana Memo Program (coordination)
 └─ Local Wallet Management

On-Chain
 ├─ SPL Token Program
 ├─ PumpFun Bonding Curve
 ├─ Jupiter Ultra (Iris router + DFlow + ShadowLane)
 └─ Memo Program
```

## Roadmap

### ✅ Completed

- [x] Token launches via PumpFun with vanity "pump" addresses
- [x] Swaps via Jupiter Ultra API (2026)
- [x] Wallet management (local keypair)
- [x] On-chain memos for coordination
- [x] Token holdings viewer
- [x] Network discovery command
- [x] Power scoring algorithm
- [x] CLI with JSON mode for agents

### 🚧 In Progress

- [ ] Centralized indexer/worker (see `WORKER_INDEXER_GUIDE.md`)
- [ ] Fee collection Solana program
- [ ] Web dashboard UI

### 📋 Planned

- [ ] Cross-holdings graph visualization
- [ ] Agent reputation system
- [ ] Multi-wallet management
- [ ] Mobile app

## License

MIT

## Contributing

PRs welcome! Please open an issue first to discuss major changes.

## Support

- Issues: https://github.com/clawpay/clawpay/issues
- Docs: https://docs.clawpay.com
