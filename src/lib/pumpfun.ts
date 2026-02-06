import axios from "axios";
import FormData from "form-data";
import { readFile, stat } from "node:fs/promises";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction, TransactionMessage } from "@solana/web3.js";
import bs58 from "bs58";
import BN from "bn.js";
import { PumpSdk } from "@pump-fun/pump-sdk";
import { generateVanityKeypairAsync } from "./vanity.js";
import { PUMPFUN_API, PUMPFUN_IPFS_API, MAX_IMAGE_SIZE_BYTES, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./config.js";
import { ClawError, EXIT_CODES } from "./output.js";
import type { Network, PumpFunToken } from "../types.js";

interface PumpFunCreateResponse {
  signature: string;
  mint: string;
  metadataUri: string;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    image: string;
  };
}

interface IPFSUploadResponse {
  ipfs: string;
  metadataUri: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload image to IPFS via PumpFun
 */
export async function uploadImage(imagePath: string, network: Network = "mainnet-beta"): Promise<string> {
  const fileStat = await stat(imagePath);
  if (fileStat.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ClawError(
      `Image exceeds 5MB limit (${(fileStat.size / 1024 / 1024).toFixed(1)}MB)`,
      EXIT_CODES.UPLOAD_FAIL
    );
  }

  const formData = new FormData();
  const fileBuffer = await readFile(imagePath);
  formData.append("file", fileBuffer, {
    filename: "image.png",
    contentType: "image/png",
  });

  try {
    const response = await axios.post(PUMPFUN_IPFS_API, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    return response.data.metadataUri || response.data.ipfs || response.data.url;
  } catch (error: any) {
    throw new ClawError(
      `Failed to upload image: ${error.response?.data?.message || error.message}`,
      EXIT_CODES.UPLOAD_FAIL
    );
  }
}

/**
 * Create token metadata and upload to IPFS
 */
export async function uploadMetadata(params: {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}, network: Network = "mainnet-beta"): Promise<string> {
  const formData = new FormData();

  // Create metadata JSON
  const metadata = {
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    image: params.imageUrl,
    showName: true,
    createdOn: "https://pump.fun",
    twitter: params.twitter || "",
    telegram: params.telegram || "",
    website: params.website || "",
  };

  // Send as file parameter
  formData.append("file", JSON.stringify(metadata), {
    filename: "metadata.json",
    contentType: "application/json",
  });

  try {
    const response = await axios.post(PUMPFUN_IPFS_API, formData, {
      headers: formData.getHeaders(),
    });

    return response.data.metadataUri || response.data.ipfs || response.data.url;
  } catch (error: any) {
    throw new ClawError(
      `Failed to upload metadata: ${error.response?.data?.message || error.message}`,
      EXIT_CODES.UPLOAD_FAIL
    );
  }
}

/**
 * Launch a token on PumpFun using the official SDK
 */
export async function launchToken(params: {
  name: string;
  symbol: string;
  metadataUri: string;
  initialBuySOL?: number;
}, keypair: Keypair, connection: Connection): Promise<PumpFunCreateResponse> {
  try {
    // Initialize Pump SDK
    const pumpSdk = new PumpSdk();

    // Generate vanity mint keypair ending in "pump"
    console.log("Generating vanity address ending in 'pump'...");
    const mintKeypair = await generateVanityKeypairAsync("pump", (attempts) => {
      if (attempts % 50000 === 0) {
        process.stdout.write(`\rAttempts: ${attempts.toLocaleString()}...`);
      }
    });
    console.log(`\n✓ Found vanity address: ${mintKeypair.publicKey.toBase58()}`);

    // Create the token creation instruction using createV2 (Token2022-based)
    const createIx = await pumpSdk.createV2Instruction({
      mint: mintKeypair.publicKey,
      name: params.name,
      symbol: params.symbol,
      uri: params.metadataUri,
      creator: keypair.publicKey,
      user: keypair.publicKey,
      mayhemMode: false, // Set to false for standard tokens
    });

    const instructions = [createIx];

    // TODO: Add initial buy support when needed
    // For now, just create the token without initial buy

    // Build and send transaction
    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    // Sign with both keypairs (wallet and mint)
    transaction.sign([keypair, mintKeypair]);

    // Send transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");

    return {
      signature,
      mint: mintKeypair.publicKey.toBase58(),
      metadataUri: params.metadataUri,
      metadata: {
        name: params.name,
        symbol: params.symbol,
        description: "",
        image: "",
      },
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    throw new ClawError(
      `Failed to launch token: ${errorMsg}`,
      EXIT_CODES.LAUNCH_FAIL
    );
  }
}

/**
 * Get token info from PumpFun
 */
export async function getTokenInfo(mint: string, network: Network = "mainnet-beta"): Promise<PumpFunToken | null> {
  try {
    const response = await axios.get(`https://frontend-api.pump.fun/coins/${mint}`);
    return response.data as PumpFunToken;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw new ClawError(
      `Failed to fetch token info: ${error.response?.data?.message || error.message}`,
      EXIT_CODES.GENERAL
    );
  }
}

/**
 * Get all PumpFun tokens created by a creator
 */
export async function getTokensByCreator(creator: string): Promise<PumpFunToken[]> {
  try {
    const response = await axios.get(`https://frontend-api.pump.fun/users/${creator}/tokens`);
    return response.data as PumpFunToken[];
  } catch (error: any) {
    throw new ClawError(
      `Failed to fetch creator tokens: ${error.response?.data?.message || error.message}`,
      EXIT_CODES.GENERAL
    );
  }
}
