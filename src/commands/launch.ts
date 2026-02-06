import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { loadOrCreateWallet, getKeypairFromWallet, getConnection, saveLaunchRecord } from "../lib/wallet.js";
import { uploadImage, uploadMetadata, launchToken } from "../lib/pumpfun.js";
import { registerAgent } from "../lib/registry.js";
import { printSuccess, printError, EXIT_CODES, ClawError } from "../lib/output.js";
import { PUMPFUN_URL, EXPLORER_URL } from "../lib/config.js";
import type { LaunchParams, Network } from "../types.js";

export async function launch(opts: LaunchParams): Promise<void> {
  const { name, symbol, description, website, twitter, telegram, devnet, json } = opts;
  const network: Network = devnet ? "devnet" : "mainnet-beta";

  try {
    // Step 1: Load or create wallet
    const { wallet, isNew } = await loadOrCreateWallet();

    if (!json) {
      if (isNew) {
        console.log(`\nWallet created: ${wallet.publicKey}`);
        console.log(`Key saved to ~/.clawlaunch/wallet.json (never share this file)\n`);
      } else {
        console.log(`\nUsing wallet: ${wallet.publicKey}`);
      }
    }

    // Step 2: Upload image to IPFS (if provided)
    let imageUrl: string;

    if (opts.imagePath) {
      const resolvedImage = resolve(opts.imagePath);
      try {
        await access(resolvedImage);
      } catch {
        printError(`Image not found: ${resolvedImage}`, json, EXIT_CODES.UPLOAD_FAIL);
        process.exit(EXIT_CODES.UPLOAD_FAIL);
      }

      if (!json) process.stdout.write("Uploading image to IPFS...");
      imageUrl = await uploadImage(resolvedImage, network);
      if (!json) console.log(` ${imageUrl.slice(0, 20)}...`);
    } else {
      // Use placeholder image
      imageUrl = "https://via.placeholder.com/512";
      if (!json) console.log("Using placeholder image (provide --image for custom logo)");
    }

    // Step 3: Upload metadata to IPFS
    if (!json) process.stdout.write("Creating metadata...");
    const metadataUri = await uploadMetadata({
      name,
      symbol,
      description,
      imageUrl,
      twitter,
      telegram,
      website,
    }, network);
    if (!json) console.log(` ${metadataUri.slice(0, 20)}...`);

    // Step 4: Launch token on PumpFun
    if (!json) process.stdout.write("Launching token on PumpFun...");

    const keypair = getKeypairFromWallet(wallet);
    const connection = getConnection(network);

    const result = await launchToken({
      name,
      symbol,
      metadataUri,
      initialBuySOL: opts.initialBuy,
    }, keypair, connection);

    if (!json) console.log(" done");

    if (!result.mint || !result.signature) {
      throw new ClawError(
        "Launch completed but missing mint or signature",
        EXIT_CODES.LAUNCH_FAIL
      );
    }

    const pumpfunUrl = `${PUMPFUN_URL[network]}/${result.mint}`;

    // Step 5: Register agent on-chain (devnet only for now)
    if (devnet) {
      try {
        if (!json) process.stdout.write("Registering agent on-chain...");

        const registrySignature = await registerAgent({
          tokenMint: new PublicKey(result.mint),
          name,
          symbol,
          description,
          imageUri: imageUrl,
          wallet,
          connection,
          network,
        });

        if (!json) console.log(` ${registrySignature.slice(0, 8)}...`);
      } catch (error) {
        // Don't fail the launch if registry fails
        if (!json) console.log(" (registry registration failed - continuing)");
        console.error("Registry error:", error);
      }
    }

    // Step 6: Save launch record locally
    await saveLaunchRecord({
      name,
      symbol,
      mint: result.mint,
      signature: result.signature,
      network,
      walletAddress: wallet.publicKey,
      launchedAt: new Date().toISOString(),
      pumpfunUrl,
    });

    // Output result
    const outputData: Record<string, unknown> = {
      mint: result.mint,
      signature: result.signature,
      name,
      symbol,
      network: network === "mainnet-beta" ? "Mainnet" : "Devnet",
      explorer: `${EXPLORER_URL[network]}/tx/${result.signature}`,
      pumpfun: pumpfunUrl,
      wallet: wallet.publicKey,
    };

    if (isNew) {
      outputData.walletPath = "~/.clawlaunch/wallet.json";
      outputData.walletNote = "Key saved locally — never share this file";
    }

    printSuccess("Token launched successfully!", outputData, json);
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
