/**
 * Type definitions for Solana chain integration
 */

// Re-export common types from web3.js that we'll use
export type {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  Connection,
} from "npm:@solana/web3.js@1.95";

/**
 * Transaction confirmation details
 */
export interface TransactionConfirmation {
  signature: string;
  slot: number;
  err: any | null;
  confirmations: number | null;
}

/**
 * Transaction details with metadata
 */
export interface TransactionDetails {
  signature: string;
  slot: number;
  blockTime: number | null;
  meta: {
    err: any | null;
    fee: number;
    logMessages?: string[];
  };
}

/**
 * Log event from transaction or subscription
 */
export interface LogEvent {
  signature: string;
  err: any | null;
  logs: string[];
  data?: Uint8Array;
}

/**
 * Solana client configuration
 */
export interface SolanaClientConfig {
  rpcUrl: string;
  rpcWsUrl?: string;
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Solana client interface for blockchain interactions
 */
export interface ISolanaClient {
  /**
   * Connect to Solana network
   */
  connect(): Promise<void>;

  /**
   * Disconnect from network
   */
  disconnect(): Promise<void>;

  /**
   * Get SOL balance for an address
   * @param address - Base58 encoded public key
   * @returns Balance in lamports
   */
  getBalance(address: string): Promise<bigint>;

  /**
   * Get SPL token balance
   * @param tokenMint - Token mint address
   * @param owner - Owner's public key
   * @returns Token balance (with decimals)
   */
  getTokenBalance(tokenMint: string, owner: string): Promise<bigint>;

  /**
   * Send a transaction
   * @param transaction - Signed transaction
   * @returns Transaction signature
   */
  sendTransaction(transaction: Transaction): Promise<string>;

  /**
   * Wait for transaction confirmation
   * @param signature - Transaction signature
   * @returns Confirmation details
   */
  waitForTransaction(signature: string): Promise<TransactionConfirmation>;

  /**
   * Get transaction details
   * @param signature - Transaction signature
   * @returns Transaction details or null if not found
   */
  getTransaction(signature: string): Promise<TransactionDetails | null>;

  /**
   * Subscribe to program logs
   * @param programId - Program to monitor
   * @param callback - Log event handler
   * @returns Unsubscribe function
   */
  subscribeToLogs(
    programId: string,
    callback: (log: LogEvent) => void
  ): Promise<() => void>;

  /**
   * Get current slot
   * @returns Current slot number
   */
  getSlot(): Promise<number>;

  /**
   * Get current block time
   * @returns Unix timestamp
   */
  getBlockTime(): Promise<number>;
}

/**
 * HTLC creation parameters
 */
export interface CreateHTLCParams {
  htlcId: Uint8Array;
  destinationAddress: Uint8Array; // EVM address (20 bytes)
  destinationToken: Uint8Array; // ERC20 address (20 bytes)
  amount: bigint;
  safetyDeposit: bigint;
  hashlock: Uint8Array;
  timelocks: {
    finality: number;
    resolver: number;
    public: number;
    cancellation: number;
  };
}

/**
 * HTLC creation result
 */
export interface CreateHTLCResult {
  htlcAddress: string; // PDA address
  transactionHash: string;
  slot: number;
}

/**
 * HTLC state on Solana
 */
export interface HTLCState {
  resolver: string;
  srcAddress: string;
  dstAddress: Uint8Array;
  srcToken: string;
  dstToken: Uint8Array;
  amount: bigint;
  safetyDeposit: bigint;
  hashlock: Uint8Array;
  htlcId: Uint8Array;
  finalityDeadline: number;
  resolverDeadline: number;
  publicDeadline: number;
  cancellationDeadline: number;
  withdrawn: boolean;
  cancelled: boolean;
  createdAt: number;
}

/**
 * HTLC event types
 */
export enum HTLCEventType {
  CREATED = "HTLCCreated",
  WITHDRAWN = "HTLCWithdrawn",
  CANCELLED = "HTLCCancelled",
}

/**
 * Base HTLC event
 */
export interface HTLCEvent {
  type: HTLCEventType;
  signature: string;
  slot: number;
  blockTime: number | null;
}

/**
 * HTLC created event
 */
export interface HTLCCreatedEvent extends HTLCEvent {
  type: HTLCEventType.CREATED;
  data: {
    htlcAccount: string;
    htlcId: Uint8Array;
    resolver: string;
    dstAddress: Uint8Array;
    amount: bigint;
    hashlock: Uint8Array;
    finalityDeadline: number;
  };
}

/**
 * HTLC withdrawn event
 */
export interface HTLCWithdrawnEvent extends HTLCEvent {
  type: HTLCEventType.WITHDRAWN;
  data: {
    htlcAccount: string;
    preimage: Uint8Array;
    executor: string;
    destination: Uint8Array;
  };
}

/**
 * HTLC cancelled event
 */
export interface HTLCCancelledEvent extends HTLCEvent {
  type: HTLCEventType.CANCELLED;
  data: {
    htlcAccount: string;
    executor: string;
  };
}

/**
 * Union type for all HTLC events
 */
export type SolanaHTLCEvent = HTLCCreatedEvent | HTLCWithdrawnEvent | HTLCCancelledEvent;

/**
 * Solana HTLC manager interface
 */
export interface ISolanaHTLCManager {
  /**
   * Create a new HTLC
   * @param params - HTLC parameters
   * @returns HTLC address and transaction hash
   */
  createHTLC(params: CreateHTLCParams): Promise<CreateHTLCResult>;

  /**
   * Withdraw from HTLC using preimage
   * @param htlcId - HTLC identifier
   * @param preimage - Secret preimage
   * @returns Transaction signature
   */
  withdrawToDestination(htlcId: Uint8Array, preimage: Uint8Array): Promise<string>;

  /**
   * Cancel HTLC after timeout
   * @param htlcId - HTLC identifier
   * @returns Transaction signature
   */
  cancel(htlcId: Uint8Array): Promise<string>;

  /**
   * Get HTLC state
   * @param htlcId - HTLC identifier
   * @returns HTLC state or null if not found
   */
  getHTLCState(htlcId: Uint8Array): Promise<HTLCState | null>;

  /**
   * Watch for HTLC events
   * @param callback - Event handler
   * @returns Unsubscribe function
   */
  watchHTLCEvents(callback: (event: SolanaHTLCEvent) => void): Promise<() => void>;

  /**
   * Get HTLC PDA address
   * @param htlcId - HTLC identifier
   * @returns PDA address
   */
  getHTLCAddress(htlcId: Uint8Array): Promise<string>;
}

/**
 * Solana-specific error class
 */
export class SolanaError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = "SolanaError";
  }
}

/**
 * Solana error codes
 */
export const SolanaErrorCode = {
  CONNECTION_FAILED: "SOL_CONNECTION_FAILED",
  INSUFFICIENT_BALANCE: "SOL_INSUFFICIENT_BALANCE",
  TRANSACTION_FAILED: "SOL_TRANSACTION_FAILED",
  INVALID_ACCOUNT: "SOL_INVALID_ACCOUNT",
  PROGRAM_ERROR: "SOL_PROGRAM_ERROR",
  TIMEOUT: "SOL_TIMEOUT",
  INVALID_INSTRUCTION: "SOL_INVALID_INSTRUCTION",
} as const;