import { TransactionInstruction, PublicKey } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "./config.js";
import type { MemoData } from "../types.js";

/**
 * Create a memo instruction for Solana transactions
 * Memos are visible on-chain and used for agent coordination
 */
export function createMemoInstruction(data: MemoData): TransactionInstruction {
  const json = JSON.stringify(data);
  const memoBytes = Buffer.from(json, "utf-8");

  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [],
    data: memoBytes,
  });
}

/**
 * Parse memo from transaction logs
 */
export function parseMemoFromLogs(logs: string[]): MemoData | null {
  for (const log of logs) {
    if (log.startsWith("Program log: Memo")) {
      try {
        const memoText = log.replace("Program log: Memo (len ", "").split("): ")[1];
        if (!memoText) continue;

        // Try to parse as JSON
        const decoded = JSON.parse(memoText.slice(1, -1)); // Remove quotes
        return decoded as MemoData;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Create a simple text memo
 */
export function createTextMemo(text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [],
    data: Buffer.from(text, "utf-8"),
  });
}
