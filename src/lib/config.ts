// ClawPay configuration constants

export const WALLET_DIR = ".clawpay";
export const WALLET_FILE = "wallet.json";
export const LAUNCHES_FILE = "launches.json";

// Solana RPC endpoints
export const RPC_ENDPOINTS = {
  "mainnet-beta": process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
} as const;

// PumpFun API - IPFS uploads use official pump.fun endpoint
export const PUMPFUN_IPFS_API = "https://pump.fun/api/ipfs";

// PumpFun API - Trading uses pumpportal.fun
export const PUMPFUN_API = {
  "mainnet-beta": "https://pumpportal.fun/api",
  devnet: "https://pumpportal.fun/api/dev",
} as const;

export const PUMPFUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Solana native mints
export const NATIVE_SOL = "So11111111111111111111111111111111111111112";
export const WSOL = "So11111111111111111111111111111111111111112";

// Default parameters
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 120000;

// Memo program
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// Explorer URLs
export const EXPLORER_URL = {
  "mainnet-beta": "https://solscan.io",
  devnet: "https://solscan.io",
} as const;

export const PUMPFUN_URL = {
  "mainnet-beta": "https://pump.fun",
  devnet: "https://pump.fun",
} as const;
