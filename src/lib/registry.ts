import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import { getKeypairFromWallet } from "./wallet.js";
import type { WalletData, Network } from "../types.js";

// BN type for registry timestamps
class BN {
  constructor(public value: number) {}
  toNumber(): number {
    return this.value;
  }
}

// ClawPay Registry Program ID
export const CLAWPAY_REGISTRY_PROGRAM_ID = {
  "mainnet-beta": null, // Not deployed yet
  devnet: "AB95WrrNSUFwxHwa2PnvCDQJwP3nVtGvC7dCHPj2PY5z", // Deployed ✅
} as const;

/**
 * Agent account structure
 */
export interface AgentAccount {
  tokenMint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  registeredAt: BN;
  bump: number;
}

/**
 * Get the PDA for an agent
 */
export function getAgentPDA(tokenMint: PublicKey, programId: PublicKey | null): [PublicKey, number] | null {
  if (!programId) return null;
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), tokenMint.toBuffer()],
    programId
  );
}

/**
 * Register a new ClawPay agent on-chain
 */
export async function registerAgent(params: {
  tokenMint: PublicKey;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  wallet: WalletData;
  connection: Connection;
  network: Network;
}): Promise<string> {
  const { tokenMint, name, symbol, description, imageUri, wallet, connection, network } = params;

  const programIdStr = CLAWPAY_REGISTRY_PROGRAM_ID[network];
  if (!programIdStr) {
    throw new Error("Registry program not deployed yet");
  }

  const programId = new PublicKey(programIdStr);
  const pdaResult = getAgentPDA(tokenMint, programId);
  if (!pdaResult) {
    throw new Error("Failed to get agent PDA");
  }
  const [agentPDA] = pdaResult;
  const creator = getKeypairFromWallet(wallet);

  // Build instruction data
  const data = Buffer.concat([
    Buffer.from([0]), // Instruction discriminator for register_agent
    tokenMint.toBuffer(),
    encodeString(name),
    encodeString(symbol),
    encodeString(description),
    encodeString(imageUri),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: creator.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = creator.publicKey;

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  transaction.sign(creator);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

/**
 * Get agent account data
 */
export async function getAgent(
  tokenMint: PublicKey,
  connection: Connection,
  network: Network
): Promise<AgentAccount | null> {
  const programIdStr = CLAWPAY_REGISTRY_PROGRAM_ID[network];
  if (!programIdStr) {
    return null; // Registry not deployed
  }

  const programId = new PublicKey(programIdStr);
  const pdaResult = getAgentPDA(tokenMint, programId);
  if (!pdaResult) {
    return null;
  }
  const [agentPDA] = pdaResult;

  try {
    const accountInfo = await connection.getAccountInfo(agentPDA);
    if (!accountInfo) return null;

    // Deserialize account data
    const data = accountInfo.data;

    // Skip 8-byte discriminator
    let offset = 8;

    const tokenMintBytes = data.slice(offset, offset + 32);
    offset += 32;

    const creatorBytes = data.slice(offset, offset + 32);
    offset += 32;

    const name = decodeString(data, offset);
    offset += 4 + name.length;

    const symbol = decodeString(data, offset);
    offset += 4 + symbol.length;

    const description = decodeString(data, offset);
    offset += 4 + description.length;

    const imageUri = decodeString(data, offset);
    offset += 4 + imageUri.length;

    const registeredAtLE = data.slice(offset, offset + 8);
    const registeredAt = new BN(Number(registeredAtLE.readBigInt64LE()));
    offset += 8;

    const bump = data[offset];

    return {
      tokenMint: new PublicKey(tokenMintBytes),
      creator: new PublicKey(creatorBytes),
      name,
      symbol,
      description,
      imageUri,
      registeredAt,
      bump,
    };
  } catch (error) {
    console.error("Failed to fetch agent:", error);
    return null;
  }
}

/**
 * Get all registered agents
 */
export async function getAllAgents(
  connection: Connection,
  network: Network
): Promise<AgentAccount[]> {
  const programIdStr = CLAWPAY_REGISTRY_PROGRAM_ID[network];
  if (!programIdStr) {
    return []; // Registry not deployed, return empty array
  }

  const programId = new PublicKey(programIdStr);

  try {
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        {
          dataSize: 627, // Agent account size
        },
      ],
    });

    const agents: AgentAccount[] = [];

    for (const { account } of accounts) {
      const data = account.data;
      let offset = 8; // Skip discriminator

      const tokenMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const creator = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const name = decodeString(data, offset);
      offset += 4 + name.length;

      const symbol = decodeString(data, offset);
      offset += 4 + symbol.length;

      const description = decodeString(data, offset);
      offset += 4 + description.length;

      const imageUri = decodeString(data, offset);
      offset += 4 + imageUri.length;

      const registeredAtLE = data.slice(offset, offset + 8);
    const registeredAt = new BN(Number(registeredAtLE.readBigInt64LE()));
      offset += 8;

      const bump = data[offset];

      agents.push({
        tokenMint,
        creator,
        name,
        symbol,
        description,
        imageUri,
        registeredAt,
        bump,
      });
    }

    // Sort by registration time (newest first)
    agents.sort((a, b) => b.registeredAt.toNumber() - a.registeredAt.toNumber());

    return agents;
  } catch (error) {
    console.error("Failed to fetch all agents:", error);
    return [];
  }
}

/**
 * Helper: Encode string for instruction data
 */
function encodeString(str: string): Buffer {
  const bytes = Buffer.from(str, "utf-8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/**
 * Helper: Decode string from account data
 */
function decodeString(data: Buffer, offset: number): string {
  const length = data.readUInt32LE(offset);
  const bytes = data.slice(offset + 4, offset + 4 + length);
  return bytes.toString("utf-8");
}
