/**
 * Type definitions for EVM chain integration
 * @module chains/evm/types
 */

import type { LogContext } from "../../utils/index.ts";

/**
 * EVM address type - 20 bytes hex string with 0x prefix
 */
export type Address = `0x${string}`;

/**
 * Transaction hash type - 32 bytes hex string with 0x prefix
 */
export type Hash = `0x${string}`;

/**
 * Private key type - 32 bytes hex string with 0x prefix
 */
export type PrivateKey = `0x${string}`;

/**
 * Custom error class for EVM-related errors
 */
export class EvmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "EvmError";
  }
}

/**
 * Transaction request parameters
 */
export interface TransactionRequest {
  /** Target address */
  to: Address;
  /** Transaction data */
  data?: `0x${string}`;
  /** Transaction value in wei */
  value?: bigint;
  /** Gas limit */
  gas?: bigint;
  /** Gas price in wei */
  gasPrice?: bigint;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
  /** Transaction nonce */
  nonce?: number;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  /** Transaction hash */
  transactionHash: Hash;
  /** Block hash */
  blockHash: Hash;
  /** Block number */
  blockNumber: bigint;
  /** Transaction index in block */
  transactionIndex: number;
  /** From address */
  from: Address;
  /** To address */
  to: Address | null;
  /** Gas used */
  gasUsed: bigint;
  /** Cumulative gas used */
  cumulativeGasUsed: bigint;
  /** Effective gas price */
  effectiveGasPrice: bigint;
  /** Transaction status (1 = success, 0 = failure) */
  status: 0 | 1;
  /** Contract address if deployment */
  contractAddress: Address | null;
  /** Logs emitted */
  logs: Log[];
}

/**
 * Event log
 */
export interface Log {
  /** Log index in block */
  logIndex: number;
  /** Transaction index */
  transactionIndex: number;
  /** Transaction hash */
  transactionHash: Hash;
  /** Block hash */
  blockHash: Hash;
  /** Block number */
  blockNumber: bigint;
  /** Emitting contract address */
  address: Address;
  /** Log data */
  data: `0x${string}`;
  /** Indexed topics */
  topics: Hash[];
  /** Whether log was removed */
  removed: boolean;
}

/**
 * Block information
 */
export interface Block {
  /** Block hash */
  hash: Hash;
  /** Parent block hash */
  parentHash: Hash;
  /** Block number */
  number: bigint;
  /** Block timestamp */
  timestamp: bigint;
  /** Block nonce */
  nonce: string | null;
  /** Base fee per gas */
  baseFeePerGas: bigint | null;
  /** Gas limit */
  gasLimit: bigint;
  /** Gas used */
  gasUsed: bigint;
  /** Miner address */
  miner: Address;
  /** Transaction hashes */
  transactions: Hash[];
}

/**
 * EVM client configuration
 */
export interface EvmClientConfig {
  /** RPC endpoint URL */
  rpcUrl: string;
  /** WebSocket RPC URL (optional) */
  rpcWsUrl?: string;
  /** Chain ID */
  chainId?: number;
  /** Private key for signing transactions */
  privateKey?: PrivateKey;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retryOptions?: {
    maxAttempts?: number;
    initialDelay?: number;
  };
  /** Logger context */
  logContext?: LogContext;
}

/**
 * Contract call parameters
 */
export interface ContractCallParams {
  /** Contract address */
  address: Address;
  /** ABI-encoded function data */
  data: `0x${string}`;
  /** Value to send (optional) */
  value?: bigint;
}

/**
 * Event filter parameters
 */
export interface EventFilter {
  /** Contract address */
  address?: Address;
  /** Event topics */
  topics?: (Hash | Hash[] | null)[];
  /** From block */
  fromBlock?: bigint | "latest" | "pending" | "earliest";
  /** To block */
  toBlock?: bigint | "latest" | "pending" | "earliest";
}

/**
 * EVM client interface
 */
export interface IEvmClient {
  /**
   * Get the current chain ID
   * @returns The chain ID
   */
  getChainId(): Promise<number>;

  /**
   * Get the current block number
   * @returns The latest block number
   */
  getBlockNumber(): Promise<bigint>;

  /**
   * Get a block by number or hash
   * @param blockHashOrNumber - Block hash or number
   * @returns Block information
   */
  getBlock(blockHashOrNumber: Hash | bigint): Promise<Block>;

  /**
   * Get account balance
   * @param address - Account address
   * @returns Balance in wei
   */
  getBalance(address: Address): Promise<bigint>;

  /**
   * Get transaction count (nonce)
   * @param address - Account address
   * @returns Transaction count
   */
  getTransactionCount(address: Address): Promise<number>;

  /**
   * Get gas price
   * @returns Current gas price in wei
   */
  getGasPrice(): Promise<bigint>;

  /**
   * Estimate gas for a transaction
   * @param tx - Transaction request
   * @returns Estimated gas amount
   */
  estimateGas(tx: TransactionRequest): Promise<bigint>;

  /**
   * Send a raw transaction
   * @param signedTx - Signed transaction data
   * @returns Transaction hash
   */
  sendRawTransaction(signedTx: `0x${string}`): Promise<Hash>;

  /**
   * Send a transaction (sign and send)
   * @param tx - Transaction request
   * @returns Transaction hash
   */
  sendTransaction(tx: TransactionRequest): Promise<Hash>;

  /**
   * Wait for transaction receipt
   * @param txHash - Transaction hash
   * @param confirmations - Number of confirmations to wait for
   * @returns Transaction receipt
   */
  waitForTransaction(txHash: Hash, confirmations?: number): Promise<TransactionReceipt>;

  /**
   * Call a contract function (read-only)
   * @param params - Contract call parameters
   * @returns Call result
   */
  call(params: ContractCallParams): Promise<`0x${string}`>;

  /**
   * Get logs matching filter
   * @param filter - Event filter
   * @returns Matching logs
   */
  getLogs(filter: EventFilter): Promise<Log[]>;

  /**
   * Get the wallet address
   * @returns Wallet address if private key is configured
   */
  getAddress(): Address | undefined;

  /**
   * Subscribe to new blocks (requires WebSocket)
   * @param callback - Callback for new blocks
   * @returns Unsubscribe function
   */
  subscribeToBlocks(callback: (block: Block) => void): Promise<() => void>;

  /**
   * Subscribe to logs (requires WebSocket)
   * @param filter - Event filter
   * @param callback - Callback for new logs
   * @returns Unsubscribe function
   */
  subscribeToLogs(filter: EventFilter, callback: (log: Log) => void): Promise<() => void>;
}

/**
 * HTLC parameters for creating a new HTLC
 */
export interface HTLCParams {
  /** Sender address */
  sender: Address;
  /** Receiver address */
  receiver: Address;
  /** Token contract address */
  tokenContract: Address;
  /** Amount in token units */
  amount: bigint;
  /** Secret hash (32 bytes) */
  hashLock: Hash;
  /** Timelock timestamp */
  timelock: bigint;
  /** Resolver address (optional) */
  resolver?: Address;
  /** Resolver timelock (optional) */
  resolverTimelock?: bigint;
}

/**
 * HTLC state
 */
export enum HTLCState {
  /** HTLC is active and can be withdrawn or refunded */
  Active = "active",
  /** HTLC has been withdrawn by receiver */
  Withdrawn = "withdrawn",
  /** HTLC has been refunded to sender */
  Refunded = "refunded",
}

/**
 * HTLC information
 */
export interface HTLCInfo {
  /** HTLC contract address */
  contractAddress: Address;
  /** Current state */
  state: HTLCState;
  /** Sender address */
  sender: Address;
  /** Receiver address */
  receiver: Address;
  /** Token contract address */
  tokenContract: Address;
  /** Amount in token units */
  amount: bigint;
  /** Secret hash */
  hashLock: Hash;
  /** Timelock timestamp */
  timelock: bigint;
  /** Resolver address (if set) */
  resolver?: Address;
  /** Resolver timelock (if set) */
  resolverTimelock?: bigint;
  /** Secret (if revealed) */
  secret?: Hash;
}

/**
 * HTLC event types
 */
export enum HTLCEventType {
  /** HTLC created */
  Created = "HTLCCreated",
  /** HTLC withdrawn */
  Withdrawn = "HTLCWithdrawn",
  /** HTLC refunded */
  Refunded = "HTLCRefunded",
}

/**
 * HTLC event
 */
export interface HTLCEvent {
  /** Event type */
  type: HTLCEventType;
  /** HTLC contract address */
  contractAddress: Address;
  /** Transaction hash */
  transactionHash: Hash;
  /** Block number */
  blockNumber: bigint;
  /** Event-specific data */
  data: {
    /** For Created event */
    sender?: Address;
    receiver?: Address;
    amount?: bigint;
    hashLock?: Hash;
    timelock?: bigint;
    /** For Withdrawn event */
    secret?: Hash;
    /** For all events */
    by?: Address;
  };
}

/**
 * HTLC manager interface
 */
export interface IHTLCManager {
  /**
   * Get the HTLC factory contract address
   * @returns Factory contract address
   */
  getFactoryAddress(): Address;

  /**
   * Create a new HTLC
   * @param params - HTLC parameters
   * @returns HTLC contract address and transaction hash
   */
  createHTLC(params: HTLCParams): Promise<{
    contractAddress: Address;
    transactionHash: Hash;
  }>;

  /**
   * Get HTLC information
   * @param contractAddress - HTLC contract address
   * @returns HTLC information
   */
  getHTLCInfo(contractAddress: Address): Promise<HTLCInfo>;

  /**
   * Withdraw from HTLC with secret
   * @param contractAddress - HTLC contract address
   * @param secret - The secret (32 bytes)
   * @returns Transaction hash
   */
  withdraw(contractAddress: Address, secret: `0x${string}`): Promise<Hash>;

  /**
   * Refund HTLC after timelock
   * @param contractAddress - HTLC contract address
   * @returns Transaction hash
   */
  refund(contractAddress: Address): Promise<Hash>;

  /**
   * Check if HTLC can be withdrawn
   * @param contractAddress - HTLC contract address
   * @param secret - The secret to check
   * @returns Whether withdrawal is possible
   */
  canWithdraw(contractAddress: Address, secret: `0x${string}`): Promise<boolean>;

  /**
   * Check if HTLC can be refunded
   * @param contractAddress - HTLC contract address
   * @returns Whether refund is possible
   */
  canRefund(contractAddress: Address): Promise<boolean>;

  /**
   * Get HTLC events for a specific HTLC
   * @param contractAddress - HTLC contract address
   * @param fromBlock - Starting block (optional)
   * @returns HTLC events
   */
  getHTLCEvents(contractAddress: Address, fromBlock?: bigint): Promise<HTLCEvent[]>;

  /**
   * Watch HTLC events
   * @param contractAddress - HTLC contract address
   * @param callback - Event callback
   * @returns Unsubscribe function
   */
  watchHTLCEvents(
    contractAddress: Address,
    callback: (event: HTLCEvent) => void
  ): Promise<() => void>;

  /**
   * Get all HTLCs created by a specific address
   * @param creator - Creator address
   * @param fromBlock - Starting block (optional)
   * @returns Array of HTLC contract addresses
   */
  getHTLCsByCreator(creator: Address, fromBlock?: bigint): Promise<Address[]>;
}