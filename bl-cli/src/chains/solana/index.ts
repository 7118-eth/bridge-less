/**
 * Solana chain integration module exports
 */

export * from "./types.ts";
export { SolanaClientKit as SolanaClient } from "./client.ts";
export { SolanaHTLCManagerKit as SolanaHTLCManager, type HTLCManagerConfig } from "./htlc.ts";