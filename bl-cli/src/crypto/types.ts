/**
 * Types for cryptographic operations in the HTLC bridge
 */

/**
 * A 32-byte secret used for HTLC operations
 */
export type Secret = Uint8Array;

/**
 * A 32-byte hash of a secret (SHA256)
 */
export type SecretHash = Uint8Array;

/**
 * Options for generating a secret
 */
export interface GenerateSecretOptions {
  /**
   * Optional seed for deterministic generation (testing only)
   * @deprecated Only use for testing
   */
  seed?: Uint8Array;
}

/**
 * Result of hashing a secret
 */
export interface HashResult {
  /**
   * The resulting hash
   */
  hash: SecretHash;
  /**
   * Hex representation of the hash
   */
  hashHex: string;
}

/**
 * Interface for secret management operations
 */
export interface ISecretManager {
  /**
   * Generate a cryptographically secure random secret
   * @param options - Optional configuration for secret generation
   * @returns A 32-byte secret
   * @example
   * ```typescript
   * const secret = await secretManager.generateSecret();
   * console.log(secret.length); // 32
   * ```
   */
  generateSecret(options?: GenerateSecretOptions): Promise<Secret>;

  /**
   * Hash a secret using SHA256
   * @param secret - The secret to hash
   * @returns The hash result with both raw and hex representations
   * @throws {Error} If secret is not 32 bytes
   * @example
   * ```typescript
   * const result = await secretManager.hashSecret(secret);
   * console.log(result.hashHex); // "0x1234..."
   * ```
   */
  hashSecret(secret: Secret): Promise<HashResult>;

  /**
   * Verify that a secret matches a given hash
   * @param secret - The secret to verify
   * @param hash - The hash to verify against
   * @returns True if the secret matches the hash
   * @example
   * ```typescript
   * const isValid = await secretManager.verifySecret(secret, hash);
   * if (!isValid) throw new Error("Invalid secret");
   * ```
   */
  verifySecret(secret: Secret, hash: SecretHash): Promise<boolean>;

  /**
   * Convert a hex string to bytes
   * @param hex - The hex string (with or without 0x prefix)
   * @returns The byte array
   * @throws {Error} If hex string is invalid
   */
  hexToBytes(hex: string): Uint8Array;

  /**
   * Convert bytes to a hex string
   * @param bytes - The byte array
   * @returns The hex string with 0x prefix
   */
  bytesToHex(bytes: Uint8Array): string;

  /**
   * Securely compare two byte arrays in constant time
   * @param a - First byte array
   * @param b - Second byte array
   * @returns True if arrays are equal
   */
  constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

/**
 * Error thrown when cryptographic operations fail
 */
export class CryptoError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CryptoError";
  }
}