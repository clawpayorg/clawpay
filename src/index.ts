#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { launch } from "./commands/launch.js";
import { swap } from "./commands/swap.js";
import { wallet } from "./commands/wallet.js";
import { holdings } from "./commands/holdings.js";
import { network } from "./commands/network.js";
import { fees } from "./commands/fees.js";
import { claim } from "./commands/claim.js";
import { agent } from "./commands/agent.js";
import { faucet } from "./commands/faucet.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);

const program = new Command();

program
  .name("clawpay")
  .description("ClawPay — Solana agent coordination infrastructure")
  .version(packageJson.version);

// Launch command
program
  .command("launch")
  .description("Launch a new token on PumpFun")
  .requiredOption("--name <name>", "Token name")
  .requiredOption("--symbol <symbol>", "Token symbol")
  .requiredOption("--description <desc>", "Token description")
  .option("--image <path>", "Path to token image (max 5MB)")
  .option("--website <url>", "Website URL")
  .option("--twitter <handle>", "Twitter handle")
  .option("--telegram <url>", "Telegram URL")
  .option("--initial-buy <sol>", "Initial buy amount in SOL", parseFloat)
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--json", "Output as JSON (for agents)", false)
  .action((opts) =>
    launch({
      name: opts.name,
      symbol: opts.symbol,
      description: opts.description,
      imagePath: opts.image,
      website: opts.website,
      twitter: opts.twitter,
      telegram: opts.telegram,
      initialBuy: opts.initialBuy,
      devnet: opts.devnet,
      json: opts.json,
    })
  );

// Swap command
program
  .command("swap")
  .description("Swap tokens via Jupiter")
  .requiredOption("--input-mint <address>", "Input token mint address (use 'SOL' for native SOL)")
  .requiredOption("--output-mint <address>", "Output token mint address")
  .requiredOption("--amount <amount>", "Amount to swap (in UI units)", parseFloat)
  .option("--slippage <bps>", "Slippage tolerance in basis points", "50")
  .option("--memo <text>", "On-chain memo for coordination")
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    // Convert "SOL" to native mint address
    const inputMint = opts.inputMint === "SOL"
      ? "So11111111111111111111111111111111111111112"
      : opts.inputMint;
    const outputMint = opts.outputMint === "SOL"
      ? "So11111111111111111111111111111111111111112"
      : opts.outputMint;

    swap({
      inputMint,
      outputMint,
      amount: opts.amount,
      slippageBps: parseInt(opts.slippage, 10),
      devnet: opts.devnet,
      json: opts.json,
      memo: opts.memo,
    });
  });

// Wallet command
program
  .command("wallet")
  .description("Show wallet address and balance")
  .option("--json", "Output as JSON", false)
  .action((opts) => wallet({ json: opts.json }));

// Holdings command
program
  .command("holdings")
  .description("Show your token holdings")
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--json", "Output as JSON", false)
  .action((opts) => holdings({ json: opts.json, devnet: opts.devnet }));

// Network command
program
  .command("network")
  .description("Discover ClawPay agents and their tokens")
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--json", "Output as JSON", false)
  .option("--sort <field>", "Sort by: mcap, volume, holders, power", "power")
  .action((opts) => network({ json: opts.json, devnet: opts.devnet, sort: opts.sort }));

// Fees command
program
  .command("fees")
  .description("Check claimable trading fees")
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--json", "Output as JSON", false)
  .action((opts) => fees({ json: opts.json, devnet: opts.devnet }));

// Claim command
program
  .command("claim")
  .description("Claim trading fees (coming soon)")
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--json", "Output as JSON", false)
  .option("--token <address>", "Specific token to claim fees for")
  .action((opts) => claim({ json: opts.json, devnet: opts.devnet, token: opts.token }));

// Agent command
program
  .command("agent")
  .description("Run autonomous trading agent")
  .option("--devnet", "Use Devnet instead of Mainnet", false)
  .option("--strategy <name>", "Trading strategy: growth, value", "growth")
  .option("--interval <seconds>", "Loop interval in seconds", "60")
  .option("--max-position <sol>", "Max SOL per position", "0.1")
  .option("--max-portfolio <sol>", "Max total portfolio SOL", "1.0")
  .option("--min-power <score>", "Min power score to trade", "0")
  .option("--dry-run", "Simulate trades without executing", false)
  .action((opts) =>
    agent({
      devnet: opts.devnet,
      strategy: opts.strategy,
      interval: parseInt(opts.interval, 10),
      maxPosition: parseFloat(opts.maxPosition),
      maxPortfolio: parseFloat(opts.maxPortfolio),
      minPower: parseFloat(opts.minPower),
      dryRun: opts.dryRun,
    })
  );

// Faucet command (devnet only)
program
  .command("faucet")
  .description("Request 0.005 devnet SOL for agent registration")
  .option("--json", "Output as JSON", false)
  .action((opts) => faucet({ json: opts.json }));

program.parse();
