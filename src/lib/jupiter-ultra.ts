import axios from "axios";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ClawError, EXIT_CODES } from "./output.js";
import { NATIVE_SOL } from "./config.js";
import type { Network, SwapResult } from "../types.js";

// Jupiter Ultra API endpoints (2026)
const JUPITER_ULTRA_API = {
  "mainnet-beta": "https://lite-api.jup.ag/ultra/v1",
  devnet: "https://lite-api.jup.ag/ultra/v1", // Ultra API primarily for mainnet
} as const;

interface JupiterUltraOrder {
  transaction: string; // Base64 encoded unsigned transaction
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  slippageBps: number;
  requestId: string;
  routePlan: any[];
}

/**
 * Execute a swap using Jupiter Ultra API (2026)
 * - Handles native SOL properly (no wrapped SOL account needed)
 * - Better routing with Iris router and DFlow
 * - Superior MEV protection and transaction landing
 */
export async function executeJupiterUltraSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  keypair: Keypair;
  connection: Connection;
  network?: Network;
}): Promise<SwapResult> {
  const network = params.network || "mainnet-beta";
  const endpoint = JUPITER_ULTRA_API[network];

  try {
    // Step 1: Get order from Jupiter Ultra API
    const orderResponse = await axios.get(`${endpoint}/order`, {
      params: {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount.toString(),
        slippageBps: params.slippageBps || 50,
        taker: params.keypair.publicKey.toBase58(), // Required to get transaction
      },
      timeout: 15000,
    });

    const order: JupiterUltraOrder = orderResponse.data;

    if (!order.transaction) {
      throw new Error("No transaction returned from Jupiter Ultra API. Ensure 'taker' parameter is provided.");
    }

    // Step 2: Deserialize the unsigned transaction
    const txBuffer = Buffer.from(order.transaction, "base64");
    const transaction = VersionedTransaction.deserialize(txBuffer);

    // Step 3: Sign the transaction
    transaction.sign([params.keypair]);

    // Step 4: Send the signed transaction
    const signature = await params.connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    // Step 5: Confirm the transaction
    const confirmation = await params.connection.confirmTransaction(signature, "confirmed");

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      signature,
      inputAmount: parseInt(order.inAmount),
      outputAmount: parseInt(order.outAmount),
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      route: order.routePlan,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message || String(error);
    throw new ClawError(
      `Jupiter Ultra swap failed: ${errorMsg}`,
      EXIT_CODES.SWAP_FAIL
    );
  }
}

/**
 * Get a swap quote from Jupiter Ultra API
 */
export async function getJupiterUltraQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  walletAddress: string;
}): Promise<{
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: string;
  routePlan: any[];
}> {
  try {
    const response = await axios.get(`${JUPITER_ULTRA_API["mainnet-beta"]}/order`, {
      params: {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount.toString(),
        slippageBps: params.slippageBps || 50,
        taker: params.walletAddress,
      },
      timeout: 15000,
    });

    const order = response.data;

    return {
      inputAmount: order.inAmount,
      outputAmount: order.outAmount,
      priceImpactPct: order.priceImpactPct,
      routePlan: order.routePlan,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    throw new ClawError(
      `Failed to get Jupiter Ultra quote: ${errorMsg}`,
      EXIT_CODES.SWAP_FAIL
    );
  }
}

/**
 * Helper to convert UI amount to token amount (with decimals)
 */
export function toTokenAmount(uiAmount: number, decimals: number): number {
  return Math.floor(uiAmount * Math.pow(10, decimals));
}

/**
 * Helper to convert token amount to UI amount
 */
export function toUIAmount(tokenAmount: number, decimals: number): number {
  return tokenAmount / Math.pow(10, decimals);
}

/**
 * Get token decimals from mint
 */
export async function getTokenDecimals(mint: string, connection: Connection): Promise<number> {
  if (mint === NATIVE_SOL) {
    return 9; // SOL decimals
  }

  try {
    const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
    if (!mintInfo.value) {
      throw new Error("Mint account not found");
    }

    const data = mintInfo.value.data as any;
    return data.parsed?.info?.decimals ?? 9;
  } catch (error: any) {
    throw new ClawError(
      `Failed to get token decimals: ${error.message}`,
      EXIT_CODES.GENERAL
    );
  }
}
