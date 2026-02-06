import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadWallet, getConnection, getWalletBalance } from "./wallet.js";
import { getAllAgents } from "./registry.js";
import { getTokenInfo } from "./pumpfun.js";
import type { Network, NetworkAgent, WalletData } from "../types.js";

/**
 * Agent Runtime - Autonomous agent execution loop
 *
 * Inspired by MoltLaunch agent autonomy pattern:
 * 1. Observe network
 * 2. Research agents
 * 3. Trade with reasoning
 * 4. Monitor & claim
 */

export interface AgentConfig {
  network: Network;
  intervalMs: number; // How often to run the loop
  maxPositionSOL: number; // Max SOL per position
  maxPortfolioSOL: number; // Max total portfolio SOL
  minPowerScore: number; // Only trade agents above this score
  strategy: AgentStrategy;
}

export interface AgentStrategy {
  name: string;
  evaluate: (agent: NetworkAgent, context: AgentContext) => Promise<TradeDecision>;
}

export interface AgentContext {
  myTokenMint?: string;
  myWallet: string;
  myBalance: number;
  allAgents: NetworkAgent[];
  myHoldings: Map<string, number>; // tokenMint -> SOL value
  networkGoal: NetworkGoal | null;
}

export interface TradeDecision {
  action: "buy" | "sell" | "hold";
  tokenMint: string;
  amountSOL: number;
  reasoning: string;
  confidence: number; // 0-1
}

export interface NetworkGoal {
  id: string;
  name: string;
  description: string;
  metric: "onboards" | "volume" | "holders";
  weight: number; // 0-1, how much this affects power score
  startedAt: number;
  endsAt: number | null;
}

/**
 * Current network goal (would be fetched from on-chain or API)
 */
export const CURRENT_NETWORK_GOAL: NetworkGoal = {
  id: "grow-network-v1",
  name: "Grow the ClawPay Network",
  description: "Get other agents to launch on ClawPay and hold your token",
  metric: "onboards",
  weight: 0.5, // 50% of total power score
  startedAt: Date.now(),
  endsAt: null,
};

/**
 * Agent Runtime Class
 */
export class AgentRuntime {
  private config: AgentConfig;
  private wallet: WalletData | null = null;
  private connection: Connection;
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.connection = getConnection(config.network);
  }

  /**
   * Start the agent autonomy loop
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Agent already running");
    }

    // Load wallet
    this.wallet = await loadWallet();
    if (!this.wallet) {
      throw new Error("No wallet found. Run 'clawpay launch' to create one.");
    }

    console.log(`🤖 Starting agent runtime for ${this.wallet.publicKey}`);
    console.log(`   Strategy: ${this.config.strategy.name}`);
    console.log(`   Interval: ${this.config.intervalMs / 1000}s`);
    console.log(`   Network: ${this.config.network}`);
    console.log();

    this.running = true;

    // Run immediately
    await this.runCycle();

    // Then run on interval
    this.intervalId = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (error) {
        console.error("Error in agent cycle:", error);
      }
    }, this.config.intervalMs);
  }

  /**
   * Stop the agent
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.log("🛑 Agent stopped");
  }

  /**
   * Run one cycle of the agent loop
   */
  private async runCycle(): Promise<void> {
    if (!this.wallet) return;

    const startTime = Date.now();
    console.log(`\n[${ new Date().toISOString()}] 🔄 Starting agent cycle`);

    try {
      // 1. OBSERVE NETWORK
      const context = await this.observeNetwork();

      // 2. RESEARCH & DECIDE
      const decisions = await this.researchAndDecide(context);

      // 3. EXECUTE TRADES
      await this.executeTrades(decisions, context);

      // 4. MONITOR & CLAIM (TODO: implement when fee collection is ready)
      // await this.monitorAndClaim();

      const duration = Date.now() - startTime;
      console.log(`✅ Cycle complete (${(duration / 1000).toFixed(1)}s)`);
    } catch (error) {
      console.error("❌ Cycle failed:", error);
    }
  }

  /**
   * Step 1: Observe the network
   */
  private async observeNetwork(): Promise<AgentContext> {
    console.log("📊 Observing network...");

    // Get all agents from on-chain registry
    const allAgents = await getAllAgents(this.connection, this.config.network);
    console.log(`   Found ${allAgents.length} agents in network`);

    // Get my balance
    const myBalance = await getWalletBalance(this.wallet!.publicKey, this.config.network);
    console.log(`   My balance: ${myBalance.toFixed(4)} SOL`);

    // Get my holdings (TODO: track holdings properly)
    const myHoldings = new Map<string, number>();

    // Build context
    const context: AgentContext = {
      myWallet: this.wallet!.publicKey,
      myBalance,
      allAgents: [],
      myHoldings,
      networkGoal: CURRENT_NETWORK_GOAL,
    };

    // Fetch detailed data for each agent
    for (const agent of allAgents) {
      try {
        const tokenInfo = await getTokenInfo(agent.tokenMint.toBase58(), this.config.network);
        if (!tokenInfo) continue;

        const marketCapSOL = parseFloat(tokenInfo.market_cap || "0") / LAMPORTS_PER_SOL;
        const volumeSOL = parseFloat(tokenInfo.volume || "0") / LAMPORTS_PER_SOL;

        const networkAgent: NetworkAgent = {
          tokenAddress: agent.tokenMint.toBase58(),
          name: agent.name,
          symbol: agent.symbol,
          creator: agent.creator.toBase58(),
          marketCapSOL,
          volume24hSOL: volumeSOL,
          priceChange24h: tokenInfo.price_change_24h || 0,
          claimableSOL: 0,
          walletSOL: 0,
          holders: tokenInfo.holder_count || 0,
          image: agent.imageUri,
          description: agent.description,
          pumpfunUrl: `https://pump.fun/${agent.tokenMint.toBase58()}`,
          powerScore: {
            total: 0,
            revenue: 0,
            market: 0,
            network: 0,
            vitality: 0,
          },
          type: "agent",
        };

        context.allAgents.push(networkAgent);
      } catch (error) {
        // Skip agents that fail to fetch
        continue;
      }
    }

    console.log(`   Analyzed ${context.allAgents.length} agents`);

    return context;
  }

  /**
   * Step 2: Research agents and make decisions
   */
  private async researchAndDecide(context: AgentContext): Promise<TradeDecision[]> {
    console.log("🔬 Researching agents...");

    const decisions: TradeDecision[] = [];

    for (const agent of context.allAgents) {
      // Skip if agent doesn't meet minimum power score
      if (agent.powerScore.total < this.config.minPowerScore) {
        continue;
      }

      // Use strategy to evaluate
      const decision = await this.config.strategy.evaluate(agent, context);

      if (decision.action !== "hold") {
        decisions.push(decision);
        console.log(`   ${decision.action.toUpperCase()} ${agent.symbol}: ${decision.reasoning}`);
      }
    }

    console.log(`   Made ${decisions.length} trade decision(s)`);

    return decisions;
  }

  /**
   * Step 3: Execute trades
   */
  private async executeTrades(decisions: TradeDecision[], context: AgentContext): Promise<void> {
    if (decisions.length === 0) {
      console.log("💤 No trades to execute");
      return;
    }

    console.log(`💰 Executing ${decisions.length} trade(s)...`);

    for (const decision of decisions) {
      try {
        if (decision.action === "buy") {
          await this.executeBuy(decision, context);
        } else if (decision.action === "sell") {
          await this.executeSell(decision, context);
        }
      } catch (error) {
        console.error(`   ❌ Failed to execute ${decision.action} ${decision.tokenMint}:`, error);
      }
    }
  }

  /**
   * Execute a buy trade
   */
  private async executeBuy(decision: TradeDecision, context: AgentContext): Promise<void> {
    const { tokenMint, amountSOL, reasoning } = decision;

    // Check if we have enough balance
    if (amountSOL > context.myBalance) {
      console.log(`   ⚠️ Insufficient balance for ${tokenMint} (need ${amountSOL} SOL, have ${context.myBalance} SOL)`);
      return;
    }

    // Check portfolio limits
    const totalPortfolio = Array.from(context.myHoldings.values()).reduce((sum, val) => sum + val, 0);
    if (totalPortfolio + amountSOL > this.config.maxPortfolioSOL) {
      console.log(`   ⚠️ Portfolio limit reached (${totalPortfolio.toFixed(2)}/${this.config.maxPortfolioSOL} SOL)`);
      return;
    }

    console.log(`   🟢 BUY ${amountSOL} SOL of ${tokenMint}`);
    console.log(`      Reason: ${reasoning}`);

    // Execute swap via Jupiter
    // Note: This would actually execute the swap
    // For now, just log it
    console.log(`   ✅ Trade executed (simulation mode)`);
  }

  /**
   * Execute a sell trade
   */
  private async executeSell(decision: TradeDecision, context: AgentContext): Promise<void> {
    const { tokenMint, reasoning } = decision;

    console.log(`   🔴 SELL ${tokenMint}`);
    console.log(`      Reason: ${reasoning}`);

    // Execute swap via Jupiter
    // Note: This would actually execute the swap
    // For now, just log it
    console.log(`   ✅ Trade executed (simulation mode)`);
  }

  /**
   * Step 4: Monitor positions and claim fees
   */
  private async monitorAndClaim(): Promise<void> {
    // TODO: Implement when fee collection is ready
    console.log("💎 Monitoring positions (fee collection not yet implemented)");
  }
}

/**
 * Example Strategy: Growth-Focused
 * Buys agents with high holder growth and strong network position
 */
export const GrowthStrategy: AgentStrategy = {
  name: "Growth-Focused",
  evaluate: async (agent: NetworkAgent, context: AgentContext): Promise<TradeDecision> => {
    // Skip if already holding
    if (context.myHoldings.has(agent.tokenAddress)) {
      return {
        action: "hold",
        tokenMint: agent.tokenAddress,
        amountSOL: 0,
        reasoning: "Already holding",
        confidence: 0,
      };
    }

    // Evaluate fundamentals
    const hasGoodMarketCap = agent.marketCapSOL > 10 && agent.marketCapSOL < 1000;
    const hasVolume = agent.volume24hSOL > 1;
    const hasHolders = agent.holders > 20;
    const isGrowing = agent.priceChange24h > 0;

    if (hasGoodMarketCap && hasVolume && hasHolders && isGrowing) {
      return {
        action: "buy",
        tokenMint: agent.tokenAddress,
        amountSOL: 0.1, // Small test position
        reasoning: `Strong fundamentals: ${agent.holders} holders, ${agent.volume24hSOL.toFixed(2)} SOL volume, +${agent.priceChange24h.toFixed(1)}% 24h`,
        confidence: 0.7,
      };
    }

    return {
      action: "hold",
      tokenMint: agent.tokenAddress,
      amountSOL: 0,
      reasoning: "Does not meet criteria",
      confidence: 0,
    };
  },
};

/**
 * Example Strategy: Value-Focused
 * Buys undervalued agents with low mcap but high activity
 */
export const ValueStrategy: AgentStrategy = {
  name: "Value-Focused",
  evaluate: async (agent: NetworkAgent, context: AgentContext): Promise<TradeDecision> => {
    // Skip if already holding
    if (context.myHoldings.has(agent.tokenAddress)) {
      return {
        action: "hold",
        tokenMint: agent.tokenAddress,
        amountSOL: 0,
        reasoning: "Already holding",
        confidence: 0,
      };
    }

    // Look for undervalued gems
    const isUndervalued = agent.marketCapSOL < 50;
    const hasActivity = agent.volume24hSOL > 5;
    const hasEngagement = agent.holders > 50;

    if (isUndervalued && hasActivity && hasEngagement) {
      return {
        action: "buy",
        tokenMint: agent.tokenAddress,
        amountSOL: 0.05,
        reasoning: `Undervalued gem: ${agent.marketCapSOL.toFixed(1)} SOL mcap, ${agent.volume24hSOL.toFixed(1)} SOL volume, ${agent.holders} holders`,
        confidence: 0.8,
      };
    }

    return {
      action: "hold",
      tokenMint: agent.tokenAddress,
      amountSOL: 0,
      reasoning: "Not undervalued enough",
      confidence: 0,
    };
  },
};
