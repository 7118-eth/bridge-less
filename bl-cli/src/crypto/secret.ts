import type {
  ISecretManager,
  Secret,
  SecretHash,
  GenerateSecretOptions,
  HashResult,
} from "./types.ts";
import { CryptoError } from "./types.ts";

/**
 * Implementation of secret management for HTLC operations
 */
export class SecretManager implements ISecretManager {
  private readonly encoder = new TextEncoder();

  async generateSecret(options?: GenerateSecretOptions): Promise<Secret> {
    if (options?.seed) {
      // Deterministic generation for testing only
      // Use the seed to generate a deterministic output
      const hash = await crypto.subtle.digest("SHA-256", options.seed);
      return new Uint8Array(hash);
    }

    // Generate cryptographically secure random bytes
    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    return secret;
  }

  async hashSecret(secret: Secret): Promise<HashResult> {
    if (secret.length !== 32) {
      throw new CryptoError(
        "Secret must be exactly 32 bytes",
        "INVALID_SECRET_LENGTH"
      );
    }

    // Use SHA-256 for cross-chain compatibility
    const hashBuffer = await crypto.subtle.digest("SHA-256", secret);
    const hash = new Uint8Array(hashBuffer);

    return {
      hash,
      hashHex: this.bytesToHex(hash),
    };
  }

  async verifySecret(secret: Secret, hash: SecretHash): Promise<boolean> {
    if (secret.length !== 32) {
      throw new CryptoError(
        "Secret must be exactly 32 bytes",
        "INVALID_SECRET_LENGTH"
      );
    }

    const { hash: computedHash } = await this.hashSecret(secret);
    return this.constantTimeEqual(computedHash, hash);
  }

  hexToBytes(hex: string): Uint8Array {
    // Remove 0x prefix if present
    if (hex.startsWith("0x") || hex.startsWith("0X")) {
      hex = hex.slice(2);
    }

    // Validate hex string
    if (hex.length % 2 !== 0) {
      throw new CryptoError(
        "Hex string must have even length",
        "INVALID_HEX_LENGTH"
      );
    }

    if (!/^[0-9a-fA-F]*$/.test(hex)) {
      throw new CryptoError("Invalid hex string", "INVALID_HEX_CHARS");
    }

    // Convert to bytes
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    return bytes;
  }

  bytesToHex(bytes: Uint8Array): string {
    return "0x" + Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }

    return result === 0;
  }
}

// Export a singleton instance for convenience
export const secretManager = new SecretManager();