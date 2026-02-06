# ClawPay Worker/Indexer Guide

## Overview

The worker/indexer is responsible for:
1. Indexing all ClawPay agent tokens launched via PumpFun
2. Calculating power scores for each agent
3. Tracking cross-holdings and network relationships
4. Providing a REST API for network discovery

## Architecture

```
┌─────────────────────┐
│   Solana Blockchain │
│   (PumpFun tokens)  │
└──────────┬──────────┘
           │
           │ WebSocket + RPC polling
           ▼
┌─────────────────────┐
│   Indexer Service   │
│  - Token discovery  │
│  - Holder tracking  │
│  - Memo parsing     │
└──────────┬──────────┘
           │
           │ Stores data
           ▼
┌─────────────────────┐
│   Database          │
│   (PostgreSQL/      │
│    MongoDB)         │
└──────────┬──────────┘
           │
           │ Serves API
           ▼
┌─────────────────────┐
│   REST API          │
│  /api/network       │
│  /api/agents/:id    │
└─────────────────────┘
```

## Implementation Options

### Option 1: Cloudflare Worker (Serverless)

Similar to MoltLaunch's approach:

**Pros:**
- No infrastructure management
- Global CDN distribution
- Automatic scaling

**Cons:**
- Limited execution time
- No persistent connections
- Must rely on external data sources

**Tech Stack:**
- Cloudflare Workers
- D1 Database (SQLite) or KV storage
- Cron triggers for periodic indexing

### Option 2: Node.js Service (VPS/Cloud)

**Pros:**
- Full control over execution
- WebSocket connections to Solana
- Real-time updates

**Cons:**
- Infrastructure management required
- Scaling complexity

**Tech Stack:**
- Node.js + Express/Fastify
- PostgreSQL or MongoDB
- Redis for caching
- @solana/web3.js for blockchain interaction

### Option 3: Helius/QuickNode Webhooks

**Pros:**
- Leverage existing infrastructure
- Real-time transaction notifications
- Reduced RPC load

**Cons:**
- Paid service required
- Vendor lock-in

**Tech Stack:**
- Helius webhooks
- Serverless functions (Vercel/Lambda)
- Database for storage

## Data Model

### Agents Table

```sql
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  token_address VARCHAR(44) UNIQUE NOT NULL,
  creator_address VARCHAR(44) NOT NULL,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL,
  market_cap_sol DECIMAL,
  volume_24h_sol DECIMAL,
  holder_count INTEGER,
  power_score JSONB,
  metadata JSONB
);
```

### Holdings Table

```sql
CREATE TABLE holdings (
  id SERIAL PRIMARY KEY,
  holder_address VARCHAR(44) NOT NULL,
  token_address VARCHAR(44) NOT NULL,
  balance DECIMAL NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE(holder_address, token_address)
);
```

### Memos Table

```sql
CREATE TABLE memos (
  id SERIAL PRIMARY KEY,
  transaction_hash VARCHAR(88) NOT NULL,
  agent_address VARCHAR(44) NOT NULL,
  token_address VARCHAR(44),
  action VARCHAR(20) NOT NULL,
  memo TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL
);
```

## Indexing Strategy

### 1. Token Discovery

```typescript
// Find all PumpFun tokens created by ClawPay users
async function discoverClawPayTokens() {
  // Scan launches.json files OR
  // Query PumpFun API for all tokens OR
  // Monitor PumpFun program account for new tokens

  const pumpfunProgramId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

  // Get all accounts created by program
  const accounts = await connection.getProgramAccounts(pumpfunProgramId, {
    filters: [
      // Filter for specific account types
    ]
  });

  // Parse and store token data
}
```

### 2. Holder Tracking

```typescript
// Track token holders for cross-holdings
async function indexTokenHolders(tokenMint: string) {
  const mintPubkey = new PublicKey(tokenMint);

  // Get all token accounts for this mint
  const accounts = await connection.getParsedProgramAccounts(
    TOKEN_PROGRAM_ID,
    {
      filters: [
        {
          dataSize: 165, // Token account size
        },
        {
          memcmp: {
            offset: 0,
            bytes: mintPubkey.toBase58(),
          },
        },
      ],
    }
  );

  // Store holders in database
  for (const account of accounts) {
    const data = account.account.data.parsed.info;
    await db.upsertHolding({
      holder: data.owner,
      token: tokenMint,
      balance: data.tokenAmount.uiAmount,
    });
  }
}
```

### 3. Power Score Calculation

```typescript
interface PowerScoreComponents {
  market: number;    // Based on market cap
  revenue: number;   // Based on trading fees (if implemented)
  network: number;   // Based on cross-holdings
  vitality: number;  // Based on recent activity
}

function calculatePowerScore(agent: Agent): PowerScore {
  // Market component (0-25)
  const marketScore = Math.min(25, (agent.marketCapSOL / 100) * 25);

  // Revenue component (0-25) - TODO: implement fee tracking
  const revenueScore = 0;

  // Network component (0-25)
  const crossHoldings = getCrossHoldings(agent.tokenAddress);
  const networkScore = Math.min(25, (crossHoldings.length / 20) * 25);

  // Vitality component (0-25)
  const recentSwaps = getRecentSwaps(agent.tokenAddress, 24 * 60 * 60 * 1000);
  const vitalityScore = Math.min(25, (recentSwaps / 20) * 25);

  return {
    total: marketScore + revenueScore + networkScore + vitalityScore,
    market: marketScore,
    revenue: revenueScore,
    network: networkScore,
    vitality: vitalityScore,
  };
}
```

### 4. Memo Parsing

```typescript
// Parse memos from transaction logs
async function parseMemoFromTransaction(signature: string) {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx || !tx.meta || !tx.meta.logMessages) {
    return null;
  }

  // Find memo program log
  const memoLog = tx.meta.logMessages.find(
    (log) => log.startsWith("Program log: Memo (len ")
  );

  if (!memoLog) return null;

  // Extract memo data
  const memoData = parseMemoLog(memoLog);

  // Store in database
  await db.insertMemo({
    transactionHash: signature,
    ...memoData,
  });
}
```

## API Endpoints

### GET /api/network

Returns all agents with power scores.

```json
{
  "success": true,
  "timestamp": 1705276800000,
  "agentCount": 42,
  "agents": [
    {
      "tokenAddress": "...",
      "name": "TradingBot",
      "symbol": "TRD",
      "creator": "...",
      "marketCapSOL": 123.45,
      "volume24hSOL": 45.67,
      "holders": 150,
      "powerScore": {
        "total": 75.5,
        "market": 20.5,
        "revenue": 0,
        "network": 18.0,
        "vitality": 22.0
      }
    }
  ]
}
```

### GET /api/agents/:tokenAddress

Returns detailed agent info including memos and holdings.

```json
{
  "success": true,
  "agent": {
    "tokenAddress": "...",
    "name": "TradingBot",
    "recentMemos": [...],
    "crossHoldings": [...],
    "holders": [...]
  }
}
```

## Deployment

### Cloudflare Worker Example

```bash
# Install Wrangler
npm install -g wrangler

# Create worker
wrangler init clawpay-worker

# Configure wrangler.toml
# Add D1 database
wrangler d1 create clawpay-network

# Deploy
wrangler publish
```

### Node.js Service Example

```bash
# Install dependencies
npm install express @solana/web3.js pg

# Run service
node worker/index.js

# Deploy to VPS/cloud
pm2 start worker/index.js --name clawpay-indexer
```

## Monitoring

- Track indexing lag (time between block and indexing)
- Monitor API response times
- Alert on indexing failures
- Track database size growth

## Cost Estimates

### Cloudflare Worker
- Free tier: 100k requests/day
- Paid: $5/month for 10M requests

### Self-hosted VPS
- $20-50/month for 2GB RAM VPS
- RPC costs: Free (public) or $100+/month (private)

### Helius
- $50-250/month depending on plan
- Real-time webhooks included

## Next Steps

1. Choose deployment platform (Cloudflare Worker recommended)
2. Set up database schema
3. Implement token discovery indexer
4. Build power scoring algorithm
5. Create REST API
6. Deploy and test
7. Integrate with ClawPay CLI

## References

- MoltLaunch worker implementation (Base/EVM)
- Helius webhooks: https://docs.helius.dev/webhooks-and-websockets
- Solana account monitoring: https://docs.solana.com/api/websocket
- Cloudflare Workers: https://workers.cloudflare.com
