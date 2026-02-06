// Core types for ClawLaunch

export type Network = "mainnet-beta" | "devnet";

export interface WalletData {
  publicKey: string;
  privateKey: string; // base58 encoded
  createdAt: string;
}

export interface LaunchRecord {
  name: string;
  symbol: string;
  mint: string;
  signature: string;
  bondingCurve?: string;
  network: Network;
  walletAddress: string;
  launchedAt: string;
  pumpfunUrl?: string;
}

export interface LaunchParams {
  name: string;
  symbol: string;
  description: string;
  imagePath?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  initialBuy?: number;
  devnet: boolean;
  json: boolean;
}

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  devnet: boolean;
  json: boolean;
  memo?: string;
}

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  inputMint: string;
  outputMint: string;
  route: any;
}

export interface Holding {
  mint: string;
  name?: string;
  symbol?: string;
  balance: number;
  decimals: number;
  uiAmount: string;
}

export interface NetworkAgent {
  tokenAddress: string;
  name: string;
  symbol: string;
  creator: string;
  marketCapSOL: number;
  volume24hSOL: number;
  priceChange24h: number;
  claimableSOL: number;
  walletSOL: number;
  holders: number;
  image: string;
  description: string;
  pumpfunUrl: string;
  powerScore: PowerScore;
  type: "agent" | "human" | "unknown";
}

export interface PowerScore {
  total: number;
  revenue: number;
  market: number;
  network: number;
  vitality: number;
}

export interface MemoData {
  agent: string;
  action: "buy" | "sell" | "launch" | "claim";
  token?: string;
  memo: string;
  timestamp: number;
}

export interface PumpFunToken {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  metadata_uri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  bonding_curve?: string;
  associated_bonding_curve?: string;
  creator: string;
  created_timestamp?: number;
  raydium_pool?: string;
  complete?: boolean;
  market_cap?: string;
  volume?: string;
  price_change_24h?: number;
  holder_count?: number;
  txn_count_24h?: number;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
}

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number;
  routePlan: any[];
}
