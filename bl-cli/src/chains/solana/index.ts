/**
 * Solana chain integration module exports
 */

export * from "./types.ts";
export { SolanaClient } from "./client.ts";
export { SolanaHTLCManager, type HTLCManagerConfig } from "./htlc.ts";