/**
 * Coordinator types and interfaces
 * @module coordinator/types
 */

import type { Address, Hash } from "../chains/evm/types.ts";

/**
 * Supported blockchain types
 */
export enum ChainType {
  EVM = "evm",
  Solana = "solana",
}

/**
 * Swap direction
 */
export interface SwapDirection {
  /** Source chain type */
  from: ChainType;
  /** Destination chain type */
  to: ChainType;
}

/**
 * Swap request parameters
 */
export interface SwapRequest {
  /** Unique swap identifier */
  id?: string;
  /** Source chain */
  from: ChainType;
  /** Destination chain */
  to: ChainType;
  /** Amount to swap (in smallest unit) */
  amount: bigint;
  /** Sender address on source chain */
  sender: string;
  /** Receiver address on destination chain */
  receiver: string;
  /** Optional custom hashlock (32 bytes hex) */
  hashLock?: Hash;
  /** Optional custom secret (32 bytes hex) */
  secret?: Hash;
}

/**
 * Swap state
 */
export enum SwapState {
  /** Initial state */
  Pending = "pending",
  /** HTLC created on source chain */
  SourceLocked = "source_locked",
  /** HTLC created on destination chain */
  DestinationLocked = "destination_locked",
  /** Secret revealed, withdrawal in progress */
  Withdrawing = "withdrawing",
  /** Swap completed successfully */
  Completed = "completed",
  /** Swap failed, refund in progress */
  Refunding = "refunding",
  /** Swap failed and refunded */
  Refunded = "refunded",
  /** Swap failed permanently */
  Failed = "failed",
}

/**
 * HTLC information for a chain
 */
export interface HTLCData {
  /** HTLC contract address */
  contractAddress: Address;
  /** Transaction hash that created the HTLC */
  transactionHash: Hash;
  /** Block number when created */
  blockNumber: bigint;
  /** Timestamp when created */
  timestamp: number;
  /** Whether this HTLC has been withdrawn */
  withdrawn: boolean;
  /** Whether this HTLC has been refunded */
  refunded: boolean;
}

/**
 * Swap status with full details
 */
export interface SwapStatus {
  /** Unique swap identifier */
  id: string;
  /** Current state */
  state: SwapState;
  /** Swap request parameters */
  request: SwapRequest;
  /** Secret hash used for HTLCs */
  hashLock: Hash;
  /** Secret (revealed after withdrawal) */
  secret?: Hash;
  /** Source chain HTLC data */
  sourceHTLC?: HTLCData;
  /** Destination chain HTLC data */
  destinationHTLC?: HTLCData;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Error message if failed */
  error?: string;
  /** Estimated completion time */
  estimatedCompletionTime?: number;
}

/**
 * Liquidity status for a chain
 */
export interface LiquidityStatus {
  /** Chain type */
  chain: ChainType;
  /** Token contract address */
  tokenAddress: string;
  /** Total balance */
  balance: bigint;
  /** Amount locked in active swaps */
  locked: bigint;
  /** Available amount for new swaps */
  available: bigint;
  /** Number of active swaps */
  activeSwaps: number;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  /** EVM configuration */
  evmConfig: {
    /** RPC URL */
    rpcUrl: string;
    /** WebSocket RPC URL (optional) */
    rpcWsUrl?: string;
    /** Private key for coordinator wallet */
    privateKey: string;
    /** Token contract address */
    tokenAddress: Address;
    /** HTLC factory contract address */
    htlcFactoryAddress: Address;
  };
  /** Solana configuration (future) */
  solanaConfig?: {
    /** RPC URL */
    rpcUrl: string;
    /** WebSocket RPC URL (optional) */
    rpcWsUrl?: string;
    /** Private key for coordinator wallet */
    privateKey: string;
    /** Token mint address */
    tokenMintAddress: string;
    /** HTLC program address */
    htlcProgramAddress: string;
  };
  /** Timelock configuration */
  timelocks: {
    /** Finality period in seconds */
    finality: number;
    /** Resolver exclusive period in seconds */
    resolver: number;
    /** Public withdrawal period in seconds */
    public: number;
    /** Cancellation period in seconds */
    cancellation: number;
  };
  /** Swap limits */
  limits?: {
    /** Minimum swap amount */
    minAmount?: bigint;
    /** Maximum swap amount */
    maxAmount?: bigint;
    /** Maximum concurrent swaps */
    maxConcurrentSwaps?: number;
  };
}

/**
 * Coordinator statistics
 */
export interface CoordinatorStats {
  /** Total number of swaps */
  totalSwaps: number;
  /** Number of completed swaps */
  completedSwaps: number;
  /** Number of failed swaps */
  failedSwaps: number;
  /** Number of active swaps */
  activeSwaps: number;
  /** Total volume swapped */
  totalVolume: bigint;
  /** Average swap duration in seconds */
  averageSwapDuration: number;
  /** Success rate percentage */
  successRate: number;
}

/**
 * Coordinator interface
 */
export interface ICoordinator {
  /**
   * Initialize the coordinator
   * @returns Promise that resolves when initialized
   */
  initialize(): Promise<void>;

  /**
   * Get coordinator configuration
   * @returns Coordinator configuration
   */
  getConfig(): CoordinatorConfig;

  /**
   * Check if coordinator is ready
   * @returns True if ready to process swaps
   */
  isReady(): boolean;

  /**
   * Initiate a new swap
   * @param request Swap request parameters
   * @returns Swap status
   */
  initiateSwap(request: SwapRequest): Promise<SwapStatus>;

  /**
   * Get swap status
   * @param swapId Swap identifier
   * @returns Swap status or undefined if not found
   */
  getSwapStatus(swapId: string): Promise<SwapStatus | undefined>;

  /**
   * Get all active swaps
   * @returns Array of active swap statuses
   */
  getActiveSwaps(): Promise<SwapStatus[]>;

  /**
   * Get swap history
   * @param limit Maximum number of swaps to return
   * @param offset Offset for pagination
   * @returns Array of swap statuses
   */
  getSwapHistory(limit?: number, offset?: number): Promise<SwapStatus[]>;

  /**
   * Cancel a swap (if possible)
   * @param swapId Swap identifier
   * @returns Updated swap status
   */
  cancelSwap(swapId: string): Promise<SwapStatus>;

  /**
   * Retry a failed swap
   * @param swapId Swap identifier
   * @returns Updated swap status
   */
  retrySwap(swapId: string): Promise<SwapStatus>;

  /**
   * Get liquidity status for all chains
   * @returns Array of liquidity statuses
   */
  getLiquidityStatus(): Promise<LiquidityStatus[]>;

  /**
   * Fund coordinator wallets
   * @param amount Amount to fund each wallet
   * @returns Transaction hashes for funding transactions
   */
  fundWallets(amount: bigint): Promise<{ evm?: Hash; solana?: string }>;

  /**
   * Get coordinator statistics
   * @returns Coordinator statistics
   */
  getStats(): Promise<CoordinatorStats>;

  /**
   * Start monitoring swaps
   * @returns Promise that resolves when monitoring starts
   */
  startMonitoring(): Promise<void>;

  /**
   * Stop monitoring swaps
   * @returns Promise that resolves when monitoring stops
   */
  stopMonitoring(): Promise<void>;

  /**
   * Recover stuck swaps
   * @returns Number of swaps recovered
   */
  recoverStuckSwaps(): Promise<number>;

  /**
   * Shutdown the coordinator gracefully
   * @returns Promise that resolves when shutdown
   */
  shutdown(): Promise<void>;
}

/**
 * Liquidity manager interface
 */
export interface ILiquidityManager {
  /**
   * Check if sufficient liquidity is available
   * @param chain Chain type
   * @param amount Amount needed
   * @returns True if sufficient liquidity
   */
  hasLiquidity(chain: ChainType, amount: bigint): Promise<boolean>;

  /**
   * Lock liquidity for a swap
   * @param chain Chain type
   * @param amount Amount to lock
   * @param swapId Swap identifier
   * @returns True if successfully locked
   */
  lockLiquidity(chain: ChainType, amount: bigint, swapId: string): Promise<boolean>;

  /**
   * Release locked liquidity
   * @param chain Chain type
   * @param amount Amount to release
   * @param swapId Swap identifier
   */
  releaseLiquidity(chain: ChainType, amount: bigint, swapId: string): Promise<void>;

  /**
   * Get current liquidity status
   * @param chain Chain type
   * @returns Liquidity status
   */
  getStatus(chain: ChainType): Promise<LiquidityStatus>;

  /**
   * Update balance from chain
   * @param chain Chain type
   * @returns Updated balance
   */
  updateBalance(chain: ChainType): Promise<bigint>;

  /**
   * Get all locked amounts
   * @returns Map of swap ID to locked amounts by chain
   */
  getLockedAmounts(): Map<string, { chain: ChainType; amount: bigint }[]>;
}

/**
 * Coordinator error class
 */
export class CoordinatorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly swapId?: string
  ) {
    super(message);
    this.name = "CoordinatorError";
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  NOT_INITIALIZED: "NOT_INITIALIZED",
  ALREADY_INITIALIZED: "ALREADY_INITIALIZED",
  INVALID_CONFIG: "INVALID_CONFIG",
  INSUFFICIENT_LIQUIDITY: "INSUFFICIENT_LIQUIDITY",
  SWAP_NOT_FOUND: "SWAP_NOT_FOUND",
  INVALID_STATE: "INVALID_STATE",
  AMOUNT_TOO_LOW: "AMOUNT_TOO_LOW",
  AMOUNT_TOO_HIGH: "AMOUNT_TOO_HIGH",
  MAX_SWAPS_REACHED: "MAX_SWAPS_REACHED",
  CHAIN_NOT_SUPPORTED: "CHAIN_NOT_SUPPORTED",
  HTLC_CREATION_FAILED: "HTLC_CREATION_FAILED",
  WITHDRAWAL_FAILED: "WITHDRAWAL_FAILED",
  REFUND_FAILED: "REFUND_FAILED",
  MONITORING_ERROR: "MONITORING_ERROR",
} as const;