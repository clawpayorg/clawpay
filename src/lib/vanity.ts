import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Generate a vanity keypair with a specific suffix
 * @param suffix - The desired suffix (e.g., "pump")
 * @param maxAttempts - Maximum number of attempts (default: 1 million)
 * @returns Keypair with the desired suffix
 */
export function generateVanityKeypair(
  suffix: string,
  maxAttempts: number = 1_000_000
): Keypair | null {
  const targetSuffix = suffix.toLowerCase();

  for (let i = 0; i < maxAttempts; i++) {
    const keypair = Keypair.generate();
    const publicKeyStr = keypair.publicKey.toBase58();

    if (publicKeyStr.toLowerCase().endsWith(targetSuffix)) {
      return keypair;
    }

    // Log progress every 10k attempts
    if (i > 0 && i % 10000 === 0) {
      console.log(`Vanity address generation: ${i.toLocaleString()} attempts...`);
    }
  }

  return null;
}

/**
 * Generate a vanity keypair asynchronously (won't block)
 * @param suffix - The desired suffix (e.g., "pump")
 * @param onProgress - Optional progress callback
 * @returns Promise<Keypair>
 */
export async function generateVanityKeypairAsync(
  suffix: string,
  onProgress?: (attempts: number) => void
): Promise<Keypair> {
  return new Promise((resolve, reject) => {
    const targetSuffix = suffix.toLowerCase();
    let attempts = 0;
    const batchSize = 1000;

    const generateBatch = () => {
      for (let i = 0; i < batchSize; i++) {
        attempts++;
        const keypair = Keypair.generate();
        const publicKeyStr = keypair.publicKey.toBase58();

        if (publicKeyStr.toLowerCase().endsWith(targetSuffix)) {
          resolve(keypair);
          return;
        }
      }

      // Report progress
      if (onProgress) {
        onProgress(attempts);
      }

      // Continue in next tick to avoid blocking
      setImmediate(generateBatch);
    };

    generateBatch();
  });
}

/**
 * Estimate difficulty of generating a vanity address
 * For base58 alphabet (58 characters), probability is roughly 1/58^n where n is suffix length
 */
export function estimateVanityDifficulty(suffix: string): number {
  return Math.pow(58, suffix.length);
}
