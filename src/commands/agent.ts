import { AgentRuntime, GrowthStrategy, ValueStrategy, type AgentConfig, type AgentStrategy } from "../lib/agent-runtime.js";
import { printError, EXIT_CODES, ClawError } from "../lib/output.js";
import type { Network } from "../types.js";

interface AgentOptions {
  devnet: boolean;
  strategy: string;
  interval: number;
  maxPosition: number;
  maxPortfolio: number;
  minPower: number;
  dryRun: boolean;
}

const STRATEGIES: Record<string, AgentStrategy> = {
  growth: GrowthStrategy,
  value: ValueStrategy,
};

/**
 * Run autonomous agent
 */
export async function agent(opts: AgentOptions): Promise<void> {
  const { devnet, strategy: strategyName, interval, maxPosition, maxPortfolio, minPower, dryRun } = opts;
  const network: Network = devnet ? "devnet" : "mainnet-beta";

  try {
    // Validate strategy
    const strategy = STRATEGIES[strategyName.toLowerCase()];
    if (!strategy) {
      throw new ClawError(
        `Unknown strategy: ${strategyName}. Available: ${Object.keys(STRATEGIES).join(", ")}`,
        EXIT_CODES.GENERAL
      );
    }

    // Build config
    const config: AgentConfig = {
      network,
      intervalMs: interval * 1000,
      maxPositionSOL: maxPosition,
      maxPortfolioSOL: maxPortfolio,
      minPowerScore: minPower,
      strategy,
    };

    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║              ClawPay Autonomous Agent Runtime                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    console.log("Configuration:");
    console.log(`  Strategy: ${strategy.name}`);
    console.log(`  Network: ${network}`);
    console.log(`  Interval: ${interval}s`);
    console.log(`  Max Position: ${maxPosition} SOL`);
    console.log(`  Max Portfolio: ${maxPortfolio} SOL`);
    console.log(`  Min Power Score: ${minPower}`);

    if (dryRun) {
      console.log("\n⚠️  DRY RUN MODE - No trades will be executed\n");
    } else {
      console.log("\n⚠️  LIVE MODE - Real trades will be executed!\n");
    }

    // Start runtime
    const runtime = new AgentRuntime(config);

    // Handle shutdown gracefully
    process.on("SIGINT", () => {
      console.log("\n\n🛑 Shutting down agent...");
      runtime.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n\n🛑 Shutting down agent...");
      runtime.stop();
      process.exit(0);
    });

    await runtime.start();

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    if (error instanceof ClawError) {
      printError(error.message, false, error.exitCode);
      process.exit(error.exitCode);
    }
    const message = error instanceof Error ? error.message : String(error);
    printError(message, false, EXIT_CODES.GENERAL);
    process.exit(EXIT_CODES.GENERAL);
  }
}
