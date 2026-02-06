import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { loadLaunchRecords, loadWallet, getConnection } from "../lib/wallet.js";
import { getTokenInfo, getTokensByCreator } from "../lib/pumpfun.js";
import { getAllAgents } from "../lib/registry.js";
import { printError, EXIT_CODES, ClawError } from "../lib/output.js";
import type { Network, NetworkAgent, PowerScore } from "../types.js";

interface NetworkOptions {
  json: boolean;
  devnet: boolean;
  sort: string;
}

/**
 * Calculate power score for an agent
 */
function calculatePowerScore(agent: {
  marketCapSOL: number;
  volumeSOL: number;
  holders: number;
  recentSwaps: number;
}): PowerScore {
  // Market component (0-25 points): based on market cap
  const marketScore = Math.min(25, (agent.marketCapSOL / 100) * 25);

  // Volume component (0-25 points): based on 24h volume
  const volumeScore = Math.min(25, (agent.volumeSOL / 10) * 25);

  // Network component (0-25 points): based on holder count
  const networkScore = Math.min(25, (agent.holders / 100) * 25);

  // Vitality component (0-25 points): based on recent activity
  const vitalityScore = Math.min(25, (agent.recentSwaps / 20) * 25);

  const total = marketScore + volumeScore + networkScore + vitalityScore;

  return {
    total: Math.round(total * 10) / 10,
    market: Math.round(marketScore * 10) / 10,
    revenue: 0, // TODO: Implement fee tracking
    network: Math.round(networkScore * 10) / 10,
    vitality: Math.round(vitalityScore * 10) / 10,
  };
}

/**
 * Fetch agent data from PumpFun
 */
async function fetchAgentData(
  tokenAddress: string,
  creatorAddress: string,
  connection: Connection
): Promise<NetworkAgent | null> {
  try {
    const tokenInfo = await getTokenInfo(tokenAddress);
    if (!tokenInfo) return null;

    // Get creator SOL balance
    const creatorPubkey = new PublicKey(creatorAddress);
    const balance = await connection.getBalance(creatorPubkey);
    const walletSOL = balance / LAMPORTS_PER_SOL;

    // Calculate market cap in SOL (PumpFun provides this)
    const marketCapSOL = parseFloat(tokenInfo.market_cap || "0") / LAMPORTS_PER_SOL;
    const volumeSOL = parseFloat(tokenInfo.volume || "0") / LAMPORTS_PER_SOL;
    const holders = tokenInfo.holder_count || 0;
    const recentSwaps = tokenInfo.txn_count_24h || 0;

    // Calculate power score
    const powerScore = calculatePowerScore({
      marketCapSOL,
      volumeSOL,
      holders,
      recentSwaps,
    });

    return {
      tokenAddress,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      creator: creatorAddress,
      marketCapSOL,
      volume24hSOL: volumeSOL,
      priceChange24h: tokenInfo.price_change_24h || 0,
      claimableSOL: 0, // TODO: Implement fee tracking
      walletSOL,
      image: tokenInfo.image || "",
      description: tokenInfo.description || "",
      pumpfunUrl: `https://pump.fun/${tokenAddress}`,
      holders,
      powerScore,
      type: "agent", // Assume all ClawPay tokens are agents
    };
  } catch (error) {
    console.error(`Failed to fetch data for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Network discovery command
 */
export async function network(opts: NetworkOptions): Promise<void> {
  const { json, devnet, sort } = opts;
  const networkType: Network = devnet ? "devnet" : "mainnet-beta";

  try {
    const wallet = await loadWallet();
    if (!wallet) {
      throw new ClawError(
        "No wallet found. Run 'clawpay launch' to create one.",
        EXIT_CODES.NO_WALLET
      );
    }

    const connection = getConnection(networkType);

    if (!json) {
      console.log("\n🔍 Discovering ClawPay agent network...\n");
    }

    // First try to get agents from on-chain registry (devnet only for now)
    let tokenAddresses: string[] = [];

    if (devnet) {
      try {
        if (!json) console.log("Fetching agents from on-chain registry...");

        const registeredAgents = await getAllAgents(connection, networkType);

        if (registeredAgents.length > 0) {
          tokenAddresses = registeredAgents.map((a) => a.tokenMint.toBase58());
          if (!json) {
            console.log(`Found ${tokenAddresses.length} registered agent(s) on-chain\n`);
          }
        } else {
          if (!json) console.log("No agents found in registry yet\n");
        }
      } catch (error) {
        if (!json) console.log("Registry not available, falling back to local launches\n");
      }
    }

    // Fallback to local launches if registry is empty or not available
    if (tokenAddresses.length === 0) {
      const launches = await loadLaunchRecords();
      tokenAddresses = launches
        .filter((l) => l.network === networkType)
        .map((l) => l.mint);

      if (!json && tokenAddresses.length > 0) {
        console.log(`Found ${tokenAddresses.length} token(s) from local launches\n`);
      }
    }

    // Fetch agent data for all tokens
    const agents: NetworkAgent[] = [];

    for (const tokenAddress of tokenAddresses) {
      const agent = await fetchAgentData(tokenAddress, wallet.publicKey, connection);
      if (agent) {
        agents.push(agent);
      }
    }

    // Sort agents
    const sortField = sort.toLowerCase();
    agents.sort((a, b) => {
      switch (sortField) {
        case "mcap":
        case "marketcap":
          return b.marketCapSOL - a.marketCapSOL;
        case "volume":
          return b.volume24hSOL - a.volume24hSOL;
        case "holders":
          return b.holders - a.holders;
        case "power":
        case "score":
          return b.powerScore.total - a.powerScore.total;
        default:
          return b.marketCapSOL - a.marketCapSOL;
      }
    });

    // Output results
    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            network: networkType,
            agentCount: agents.length,
            agents,
          },
          null,
          2
        )
      );
      return;
    }

    if (agents.length === 0) {
      console.log("No agents found. Launch your first token with 'clawpay launch'!\n");
      return;
    }

    // Display agents
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                    ClawPay Agent Network                       ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    for (const agent of agents) {
      console.log(`📊 ${agent.name} (${agent.symbol})`);
      console.log(`   Address: ${agent.tokenAddress}`);
      console.log(`   Market Cap: ${agent.marketCapSOL.toFixed(4)} SOL`);
      console.log(`   24h Volume: ${agent.volume24hSOL.toFixed(4)} SOL`);
      console.log(`   Holders: ${agent.holders}`);
      console.log(`   Power Score: ${agent.powerScore.total.toFixed(1)}/100`);
      console.log(
        `     └─ Market: ${agent.powerScore.market.toFixed(1)} | Network: ${agent.powerScore.network.toFixed(1)} | Vitality: ${agent.powerScore.vitality.toFixed(1)}`
      );
      console.log(`   URL: ${agent.pumpfunUrl}`);
      console.log();
    }

    console.log(`Total: ${agents.length} agent(s)\n`);
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
