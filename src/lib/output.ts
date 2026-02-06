// Output formatting utilities

export function printSuccess(message: string, data?: Record<string, any>, json = false): void {
  if (json) {
    console.log(JSON.stringify({ success: true, message, ...data }, null, 2));
  } else {
    console.log(`\n✓ ${message}`);
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, " $1").trim();
        const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
        console.log(`  ${capitalizedLabel}: ${value}`);
      });
    }
    console.log();
  }
}

export function printError(message: string, json = false, exitCode = 1): void {
  if (json) {
    console.error(JSON.stringify({ success: false, error: message, exitCode }, null, 2));
  } else {
    console.error(`\n✗ Error: ${message}\n`);
  }
}

export function printInfo(message: string): void {
  console.log(`ℹ ${message}`);
}

export function printWarning(message: string): void {
  console.log(`⚠ ${message}`);
}

export class ClawError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = "ClawError";
  }
}

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL: 1,
  NO_WALLET: 2,
  UPLOAD_FAIL: 3,
  LAUNCH_FAIL: 4,
  TIMEOUT: 5,
  NO_GAS: 6,
  SWAP_FAIL: 7,
  NOT_IMPLEMENTED: 8,
} as const;
