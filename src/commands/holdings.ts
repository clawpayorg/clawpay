import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { loadWallet, getConnection } from "../lib/wallet.js";
import { printError, EXIT_CODES, ClawError } from "../lib/output.js";
import type { Network, Holding } from "../types.js";

interface HoldingsOptions {
  json: boolean;
  devnet: boolean;
}

export async function holdings(opts: HoldingsOptions): Promise<void> {
  const { json, devnet } = opts;
  const network: Network = devnet ? "devnet" : "mainnet-beta";

  try {
    const walletData = await loadWallet();
    if (!walletData) {
      throw new ClawError("No wallet found. Run 'clawlaunch launch' to create one.", EXIT_CODES.NO_WALLET);
    }

    const connection = getConnection(network);
    const publicKey = new PublicKey(walletData.publicKey);

    if (!json) {
      console.log(`\nFetching holdings for ${walletData.publicKey}...`);
    }

    // Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    const holdings: Holding[] = [];

    for (const { account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      const balance = parsedInfo.tokenAmount.uiAmount;

      if (balance > 0) {
        holdings.push({
          mint: parsedInfo.mint,
          balance: parsedInfo.tokenAmount.amount,
          decimals: parsedInfo.tokenAmount.decimals,
          uiAmount: balance.toString(),
        });
      }
    }

    if (json) {
      console.log(JSON.stringify({
        success: true,
        count: holdings.length,
        holdings,
      }, null, 2));
      return;
    }

    if (holdings.length === 0) {
      console.log("\nNo token holdings found.\n");
      return;
    }

    console.log(`\n${holdings.length} token(s):\n`);

    for (const holding of holdings) {
      console.log(`  ${holding.mint}`);
      console.log(`    Balance: ${holding.uiAmount}`);
      console.log();
    }

    console.log(`${holdings.length} token(s) total\n`);
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
