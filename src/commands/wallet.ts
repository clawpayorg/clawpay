import { loadWallet, getWalletBalance } from "../lib/wallet.js";
import { printError, EXIT_CODES, ClawError } from "../lib/output.js";
import type { Network } from "../types.js";

interface WalletOptions {
  json: boolean;
}

export async function wallet(opts: WalletOptions): Promise<void> {
  const { json } = opts;

  try {
    const walletData = await loadWallet();
    if (!walletData) {
      throw new ClawError("No wallet found. Run 'clawlaunch launch' to create one.", EXIT_CODES.NO_WALLET);
    }

    const balance = await getWalletBalance(walletData.publicKey, "mainnet-beta");

    if (json) {
      console.log(JSON.stringify({
        success: true,
        address: walletData.publicKey,
        balance: balance.toFixed(4),
        createdAt: walletData.createdAt,
      }, null, 2));
      return;
    }

    console.log(`\nWallet Information:`);
    console.log(`  Address: ${walletData.publicKey}`);
    console.log(`  Balance: ${balance.toFixed(4)} SOL`);
    console.log(`  Created: ${new Date(walletData.createdAt).toLocaleDateString()}`);
    console.log(`  Path: ~/.clawlaunch/wallet.json\n`);
  } catch (error) {
    if (error instanceof ClawError) {
      printError(error.message, json, error.exitCode);
      process.exit(error.exitCode);
    }
    const message = error instanceof Error ? error.message : String(error);
    printError(message, json, EXIT_CODES.GENERAL);
    process.exit(EXIT_CODES.GENERAL);
  }
}
