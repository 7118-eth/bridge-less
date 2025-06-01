/**
 * Cryptographic utilities for HTLC operations
 * @module crypto
 */

export { SecretManager, secretManager } from "./secret.ts";
export type {
  Secret,
  SecretHash,
  GenerateSecretOptions,
  HashResult,
  ISecretManager,
} from "./types.ts";
export { CryptoError } from "./types.ts";