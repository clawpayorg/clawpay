import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadWallet, getConnection, loadLaunchRecords } from "../lib/wallet.js";
import { getTokenInfo } from "../lib/pumpfun.js";
import { printError, EXIT_CODES, ClawError } from "../lib/output.js";
import type { Network } from "../types.js";

interface FeesOptions {
  json: boolean;
  devnet: boolean;
}

interface FeeInfo {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  volume24hSOL: number;
  estimatedFeesSOL: number;
  claimableSOL: number;
}

/**
 * Check claimable fees for tokens launched from this wallet
 *
 * NOTE: This is a placeholder implementation. Full fee collection requires:
 * 1. A Solana program (smart contract) to escrow fees
 * 2. Integration with Jupiter to capture swap fees
 * 3. On-chain fee distribution mechanism
 *
 * For now, this estimates potential fees based on volume.
 */
export async function fees(opts: FeesOptions): Promise<void> {
  const { json, devnet } = opts;
  const network: Network = devnet ? "devnet" : "mainnet-beta";

  try {
    const wallet = await loadWallet();
    if (!wallet) {
      throw new ClawError(
        "No wallet found. Run 'clawpay launch' to create one.",
        EXIT_CODES.NO_WALLET
      );
    }

    const connection = getConnection(network);
    const launches = await loadLaunchRecords();
    const localTokens = launches.filter((l) => l.network === network);

    if (!json) {
      console.log("\n💰 Checking claimable fees...\n");
    }

    const feeInfos: FeeInfo[] = [];
    let totalClaimable = 0;

    for (const launch of localTokens) {
      try {
        const tokenInfo = await getTokenInfo(launch.mint, network);
        if (!tokenInfo) continue;

        const volumeSOL = parseFloat(tokenInfo.volume || "0") / LAMPORTS_PER_SOL;

        // Estimate fees (1% of volume)
        // TODO: Replace with actual on-chain fee tracking
        const estimatedFees = volumeSOL * 0.01;

        // For now, claimable is 0 since we don't have on-chain collection yet
        const claimable = 0;

        feeInfos.push({
          tokenAddress: launch.mint,
          tokenName: launch.name,
          tokenSymbol: launch.symbol,
          volume24hSOL: volumeSOL,
          estimatedFeesSOL: estimatedFees,
          claimableSOL: claimable,
        });

        totalClaimable += claimable;
      } catch (error) {
        // Skip tokens that fail to fetch
        continue;
      }
    }

    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            network,
            totalClaimableSOL: totalClaimable,
            fees: feeInfos,
            note: "Fee collection requires custom Solana program - coming soon",
          },
          null,
          2
        )
      );
      return;
    }

    if (feeInfos.length === 0) {
      console.log("No tokens found. Launch a token with 'clawpay launch'!\n");
      return;
    }

    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                     Trading Fee Estimates                     ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    for (const fee of feeInfos) {
      console.log(`💎 ${fee.tokenName} (${fee.tokenSymbol})`);
      console.log(`   24h Volume: ${fee.volume24hSOL.toFixed(4)} SOL`);
      console.log(`   Estimated Fees (1%): ${fee.estimatedFeesSOL.toFixed(4)} SOL`);
      console.log(`   Claimable: ${fee.claimableSOL.toFixed(4)} SOL`);
      console.log();
    }

    console.log(`Total Claimable: ${totalClaimable.toFixed(4)} SOL\n`);
    console.log("ℹ️  Note: Fee collection requires a custom Solana program.");
    console.log("   Estimated fees shown are 1% of 24h volume.");
    console.log("   Use 'clawpay claim' once fee collection is live.\n");

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
