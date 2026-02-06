import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadWallet, getKeypairFromWallet, getConnection, getWalletBalance } from "../lib/wallet.js";
import { executeJupiterUltraSwap, toTokenAmount, getTokenDecimals } from "../lib/jupiter-ultra.js";
import { createMemoInstruction } from "../lib/memo.js";
import { printSuccess, printError, EXIT_CODES, ClawError } from "../lib/output.js";
import { EXPLORER_URL, PUMPFUN_URL, NATIVE_SOL } from "../lib/config.js";
import type { SwapParams, Network } from "../types.js";

export async function swap(opts: SwapParams): Promise<void> {
  const { inputMint, outputMint, amount, slippageBps, json } = opts;
  const network: Network = opts.devnet ? "devnet" : "mainnet-beta";

  try {
    // Load wallet
    const walletData = await loadWallet();
    if (!walletData) {
      throw new ClawError("No wallet found. Run 'clawlaunch launch' to create one.", EXIT_CODES.NO_WALLET);
    }

    // Check balance
    const balance = await getWalletBalance(walletData.publicKey, network);
    if (balance === 0) {
      throw new ClawError(
        `Wallet ${walletData.publicKey} has 0 SOL. Please fund your wallet first.`,
        EXIT_CODES.NO_GAS
      );
    }

    if (!json) {
      console.log(`\nSwapping on Solana ${network === "mainnet-beta" ? "Mainnet" : "Devnet"}...`);
      console.log(`Wallet: ${walletData.publicKey} (${balance.toFixed(4)} SOL)`);
    }

    const keypair = getKeypairFromWallet(walletData);
    const connection = getConnection(network);

    // Get token decimals
    const inputDecimals = await getTokenDecimals(inputMint, connection);
    const tokenAmount = toTokenAmount(amount, inputDecimals);

    if (!json) {
      process.stdout.write(`\nFinding best route via Jupiter Ultra...`);
    }

    // Use Jupiter Ultra API (2026) - properly handles native SOL swaps
    const result = await executeJupiterUltraSwap({
      inputMint,
      outputMint,
      amount: tokenAmount,
      slippageBps,
      keypair,
      connection,
      network,
    });

    if (!json) console.log(" done");
    if (!json) process.stdout.write("Confirming transaction...");

    // Wait for final confirmation
    await connection.confirmTransaction(result.signature, "finalized");

    if (!json) console.log(" confirmed");

    // Build output
    const inputSymbol = inputMint === NATIVE_SOL ? "SOL" : "tokens";
    const outputSymbol = outputMint === NATIVE_SOL ? "SOL" : "tokens";

    const outputData: Record<string, unknown> = {
      signature: result.signature,
      inputAmount: `${amount} ${inputSymbol}`,
      outputAmount: `${(result.outputAmount / Math.pow(10, 9)).toFixed(6)} ${outputSymbol}`,
      inputMint,
      outputMint,
      network: network === "mainnet-beta" ? "Mainnet" : "Devnet",
      explorer: `${EXPLORER_URL[network]}/tx/${result.signature}`,
    };

    if (opts.memo) {
      outputData.memo = opts.memo;
    }

    printSuccess("Swap completed!", outputData, json);
  } catch (error) {
    if (error instanceof ClawError) {
      printError(error.message, json, error.exitCode);
      process.exit(error.exitCode);
    }
    const message = error instanceof Error ? error.message : String(error);
    printError(message, json, EXIT_CODES.SWAP_FAIL);
    process.exit(EXIT_CODES.SWAP_FAIL);
  }
}
