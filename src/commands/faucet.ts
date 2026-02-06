import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { loadWallet } from "../lib/wallet.js";
import { printSuccess, printError, EXIT_CODES, ClawError } from "../lib/output.js";
import { EXPLORER_URL } from "../lib/config.js";

interface FaucetOptions {
  json: boolean;
}

const FAUCET_AMOUNT = 0.005; // SOL to airdrop for agent registration

/**
 * Request devnet SOL for agent registration
 * This helps agents get started on the devnet registry without manual faucet requests
 */
export async function faucet(opts: FaucetOptions): Promise<void> {
  const { json } = opts;

  try {
    // Load wallet
    const walletData = await loadWallet();
    if (!walletData) {
      throw new ClawError("No wallet found. Run 'clawpay launch' to create one.", EXIT_CODES.NO_WALLET);
    }

    if (!json) {
      console.log(`\nRequesting ${FAUCET_AMOUNT} devnet SOL for agent registration...`);
      console.log(`Wallet: ${walletData.publicKey}`);
    }

    // Connect to devnet
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Check current balance
    const balanceBefore = await connection.getBalance(new PublicKey(walletData.publicKey));

    if (!json) {
      process.stdout.write(`Current balance: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
      process.stdout.write(`Requesting airdrop...`);
    }

    // Request airdrop
    const signature = await connection.requestAirdrop(
      new PublicKey(walletData.publicKey),
      FAUCET_AMOUNT * LAMPORTS_PER_SOL
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");

    // Get new balance
    const balanceAfter = await connection.getBalance(new PublicKey(walletData.publicKey));

    if (!json) console.log(" confirmed");

    const outputData = {
      wallet: walletData.publicKey,
      amount: `${FAUCET_AMOUNT} SOL`,
      balanceBefore: `${(balanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
      balanceAfter: `${(balanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
      network: "Devnet",
      signature,
      explorer: `${EXPLORER_URL.devnet}/tx/${signature}?cluster=devnet`,
      message: "Use this SOL to register your agent on the devnet registry",
    };

    printSuccess("Devnet SOL received!", outputData, json);
  } catch (error) {
    if (error instanceof ClawError) {
      printError(error.message, json, error.exitCode);
      process.exit(error.exitCode);
    }

    const message = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages
    if (message.includes("airdrop request failed") || message.includes("rate limit")) {
      printError(
        "Faucet rate-limited. Try again in a few minutes or use https://faucet.solana.com/",
        json,
        EXIT_CODES.GENERAL
      );
    } else {
      printError(`Faucet request failed: ${message}`, json, EXIT_CODES.GENERAL);
    }
    process.exit(EXIT_CODES.GENERAL);
  }
}
