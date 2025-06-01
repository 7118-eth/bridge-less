/**
 * EVM chain integration module
 * @module chains/evm
 */

// Export types
export type {
  Address,
  Hash,
  PrivateKey,
  TransactionRequest,
  TransactionReceipt,
  Log,
  Block,
  EventFilter,
  EvmClientConfig,
  ContractCallParams,
  IEvmClient,
  HTLCParams,
  HTLCInfo,
  HTLCEvent,
  IHTLCManager,
} from "./types.ts";

// Export enums and error class
export {
  EvmError,
  HTLCState,
  HTLCEventType,
} from "./types.ts";

// Export implementations
export { EvmClient } from "./client.ts";
export { HTLCManager } from "./htlc.ts";
export type { HTLCManagerConfig } from "./htlc.ts";

// Export mock client for testing
export { MockEvmClient } from "./mock_client.ts";