/**
 * Coordinator service implementation
 * @module coordinator/coordinator
 */

import type {
  ICoordinator,
  ILiquidityManager,
  CoordinatorConfig,
  SwapRequest,
  SwapStatus,
  SwapState,
  LiquidityStatus,
  CoordinatorStats,
  HTLCData,
} from "./types.ts";
import { ChainType, CoordinatorError, ErrorCodes } from "./types.ts";
import type { IEvmClient, IHTLCManager, Hash, Address } from "../chains/evm/types.ts";
import { HTLCEventType } from "../chains/evm/types.ts";
import type { ISolanaClient, ISolanaHTLCManager } from "../chains/solana/types.ts";
import type { ISecretManager } from "../crypto/types.ts";
import { SecretManager } from "../crypto/secret.ts";
import { createLogger, type Logger } from "../utils/logger.ts";
import { LiquidityManager } from "./liquidity.ts";

/**
 * Coordinator constructor options
 */
export interface CoordinatorOptions {
  /** Coordinator configuration */
  config: CoordinatorConfig;
  /** EVM client instance */
  evmClient: IEvmClient;
  /** HTLC manager instance */
  htlcManager: IHTLCManager;
  /** Solana client instance (optional) */
  solanaClient?: ISolanaClient;
  /** Solana HTLC manager instance (optional) */
  solanaHTLCManager?: ISolanaHTLCManager;
  /** Secret manager instance (optional) */
  secretManager?: ISecretManager;
  /** Liquidity manager instance (optional) */
  liquidityManager?: ILiquidityManager;
  /** Logger instance (optional) */
  logger?: Logger;
}

/**
 * Internal swap data
 */
interface SwapData extends SwapStatus {
  /** Interval ID for monitoring */
  monitoringInterval?: number;
  /** Retry count */
  retryCount: number;
}

/**
 * Coordinator implementation
 */
export class Coordinator implements ICoordinator {
  private readonly config: CoordinatorConfig;
  private readonly evmClient: IEvmClient;
  private readonly htlcManager: IHTLCManager;
  private readonly solanaClient?: ISolanaClient;
  private readonly solanaHTLCManager?: ISolanaHTLCManager;
  private readonly secretManager: ISecretManager;
  private readonly liquidityManager: ILiquidityManager;
  private readonly logger: Logger;

  private initialized = false;
  private monitoring = false;
  private swaps = new Map<string, SwapData>();
  private monitoringInterval?: number;
  private eventUnsubscribers: (() => void)[] = [];

  constructor(options: CoordinatorOptions) {
    this.config = options.config;
    this.evmClient = options.evmClient;
    this.htlcManager = options.htlcManager;
    this.solanaClient = options.solanaClient;
    this.solanaHTLCManager = options.solanaHTLCManager;
    this.secretManager = options.secretManager || new SecretManager();
    this.liquidityManager = options.liquidityManager || new LiquidityManager({
      evmClient: this.evmClient,
      evmTokenAddress: this.config.evmConfig.tokenAddress,
    });

    this.logger = options.logger || createLogger({
      level: "info",
      json: false,
    }).child({ module: "coordinator" });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new CoordinatorError(
        "Coordinator already initialized",
        ErrorCodes.ALREADY_INITIALIZED
      );
    }

    this.logger.info("Initializing coordinator");

    try {
      // Verify chain connectivity
      const chainId = await this.evmClient.getChainId();
      this.logger.debug("Connected to EVM chain", { chainId });

      // Update liquidity balances
      await this.liquidityManager.updateBalance(ChainType.EVM);

      this.initialized = true;
      this.logger.info("Coordinator initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize coordinator", { error });
      throw new CoordinatorError(
        `Initialization failed: ${error instanceof Error ? error.message : "unknown error"}`,
        ErrorCodes.INVALID_CONFIG
      );
    }
  }

  getConfig(): CoordinatorConfig {
    return this.config;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async initiateSwap(request: SwapRequest): Promise<SwapStatus> {
    if (!this.initialized) {
      throw new CoordinatorError(
        "Coordinator not initialized",
        ErrorCodes.NOT_INITIALIZED
      );
    }

    // Validate request
    this.validateSwapRequest(request);

    // Check concurrent swap limit
    const activeSwaps = Array.from(this.swaps.values()).filter(
      s => this.isActiveState(s.state)
    ).length;

    if (
      this.config.limits?.maxConcurrentSwaps &&
      activeSwaps >= this.config.limits.maxConcurrentSwaps
    ) {
      throw new CoordinatorError(
        "Maximum concurrent swaps reached",
        ErrorCodes.MAX_SWAPS_REACHED
      );
    }

    // Check liquidity
    const hasLiquidity = await this.liquidityManager.hasLiquidity(
      request.from,
      request.amount
    );
    if (!hasLiquidity) {
      throw new CoordinatorError(
        "Insufficient liquidity",
        ErrorCodes.INSUFFICIENT_LIQUIDITY
      );
    }

    // Generate swap ID and secret
    const swapId = request.id || crypto.randomUUID();
    const secretBytes = request.secret ? 
      this.hexToBytes(request.secret) : 
      await this.secretManager.generateSecret();
    
    // Verify secret length before hashing
    if (secretBytes.length !== 32) {
      throw new CoordinatorError(
        `Generated secret has invalid length: ${secretBytes.length} bytes`,
        ErrorCodes.INVALID_CONFIG
      );
    }
    
    const hashResult = await this.secretManager.hashSecret(secretBytes);
    const hashLock = hashResult.hashHex;
    const secret = request.secret || this.bytesToHex(secretBytes) as Hash;

    // Create swap data
    const now = Date.now();
    const swapData: SwapData = {
      id: swapId,
      state: "pending" as SwapState,
      request: { ...request, id: swapId },
      hashLock,
      secret,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      estimatedCompletionTime: now + 300000, // 5 minutes estimate
    };

    // Store swap
    this.swaps.set(swapId, swapData);

    // Lock liquidity
    await this.liquidityManager.lockLiquidity(request.from, request.amount, swapId);

    this.logger.info("Swap initiated", {
      swapId,
      from: request.from,
      to: request.to,
      amount: request.amount.toString(),
    });

    // Start processing the swap asynchronously (only in production)
    // For testing, we'll manually control the state transitions
    if (!this.config.testMode) {
      this.processSwap(swapId).catch(error => {
        this.logger.error("Swap processing failed", { swapId, error });
        this.updateSwapState(swapId, "failed" as SwapState, error.message);
      });
    }

    return this.getSwapStatusFromData(swapData);
  }

  async getSwapStatus(swapId: string): Promise<SwapStatus | undefined> {
    const swapData = this.swaps.get(swapId);
    return swapData ? this.getSwapStatusFromData(swapData) : undefined;
  }

  async getActiveSwaps(): Promise<SwapStatus[]> {
    const activeSwaps = Array.from(this.swaps.values())
      .filter(s => this.isActiveState(s.state))
      .map(s => this.getSwapStatusFromData(s));

    return activeSwaps;
  }

  async getSwapHistory(limit = 100, offset = 0): Promise<SwapStatus[]> {
    const allSwaps = Array.from(this.swaps.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit)
      .map(s => this.getSwapStatusFromData(s));

    return allSwaps;
  }

  async cancelSwap(swapId: string): Promise<SwapStatus> {
    const swapData = this.swaps.get(swapId);
    if (!swapData) {
      throw new CoordinatorError(
        "Swap not found",
        ErrorCodes.SWAP_NOT_FOUND,
        swapId
      );
    }

    if (!this.isActiveState(swapData.state)) {
      throw new CoordinatorError(
        "Cannot cancel swap in current state",
        ErrorCodes.INVALID_STATE,
        swapId
      );
    }

    // Update state
    this.updateSwapState(swapId, "failed" as SwapState, "Cancelled by user");

    // Release liquidity
    await this.liquidityManager.releaseLiquidity(
      swapData.request.from,
      swapData.request.amount,
      swapId
    );

    // TODO: Trigger refund if HTLCs were created

    this.logger.info("Swap cancelled", { swapId });

    return this.getSwapStatusFromData(swapData);
  }

  async retrySwap(swapId: string): Promise<SwapStatus> {
    const swapData = this.swaps.get(swapId);
    if (!swapData) {
      throw new CoordinatorError(
        "Swap not found",
        ErrorCodes.SWAP_NOT_FOUND,
        swapId
      );
    }

    if (swapData.state !== "failed" as SwapState) {
      throw new CoordinatorError(
        "Can only retry failed swaps",
        ErrorCodes.INVALID_STATE,
        swapId
      );
    }

    // Create new swap with same parameters
    const newRequest = {
      ...swapData.request,
      id: undefined, // Generate new ID
    };

    return this.initiateSwap(newRequest);
  }

  async getLiquidityStatus(): Promise<LiquidityStatus[]> {
    const evmStatus = await this.liquidityManager.getStatus(ChainType.EVM);
    
    // Add Solana when implemented
    return [evmStatus];
  }

  async fundWallets(amount: bigint): Promise<{ evm?: Hash; solana?: string }> {
    // This would typically involve transferring tokens from a funding source
    // For now, return mock transaction hash
    this.logger.info("Funding wallets", { amount: amount.toString() });
    
    return {
      evm: "0xfund000000000000000000000000000000000000000000000000000000000000" as Hash,
    };
  }

  async getStats(): Promise<CoordinatorStats> {
    const allSwaps = Array.from(this.swaps.values());
    const completedSwaps = allSwaps.filter(s => s.state === "completed" as SwapState);
    const failedSwaps = allSwaps.filter(s => s.state === "failed" as SwapState);
    const activeSwaps = allSwaps.filter(s => this.isActiveState(s.state));

    const totalVolume = completedSwaps.reduce(
      (sum, swap) => sum + swap.request.amount,
      0n
    );

    const durations = completedSwaps
      .filter(s => s.updatedAt > s.createdAt)
      .map(s => (s.updatedAt - s.createdAt) / 1000); // in seconds

    const averageSwapDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const successRate = allSwaps.length > 0
      ? (completedSwaps.length / allSwaps.length) * 100
      : 0;

    return {
      totalSwaps: allSwaps.length,
      completedSwaps: completedSwaps.length,
      failedSwaps: failedSwaps.length,
      activeSwaps: activeSwaps.length,
      totalVolume,
      averageSwapDuration,
      successRate,
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.monitoring) {
      return;
    }

    this.monitoring = true;
    this.logger.info("Starting swap monitoring");

    // Monitor active swaps every 10 seconds
    this.monitoringInterval = setInterval(() => {
      this.monitorActiveSwaps().catch(error => {
        this.logger.error("Error monitoring swaps", { error });
      });
    }, 10000);

    // Subscribe to HTLC events
    // TODO: Implement event subscription
  }

  async stopMonitoring(): Promise<void> {
    if (!this.monitoring) {
      return;
    }

    this.monitoring = false;
    this.logger.info("Stopping swap monitoring");

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Unsubscribe from events
    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];
  }

  async recoverStuckSwaps(): Promise<number> {
    const activeSwaps = Array.from(this.swaps.values()).filter(s =>
      this.isActiveState(s.state)
    );

    let recovered = 0;

    for (const swap of activeSwaps) {
      try {
        const timeSinceUpdate = Date.now() - swap.updatedAt;
        
        // Consider swap stuck if no update for 10 minutes
        if (timeSinceUpdate > 600000) {
          this.logger.warn("Recovering stuck swap", { swapId: swap.id });
          
          // Check HTLC states and recover accordingly
          if (swap.sourceHTLC && !swap.destinationHTLC) {
            // Source locked but destination not created - create destination HTLC
            await this.createDestinationHTLC(swap.id);
            recovered++;
          } else if (swap.sourceHTLC && swap.destinationHTLC) {
            // Both created - check if we can withdraw or need to refund
            const canWithdraw = await this.checkWithdrawConditions(swap.id);
            if (canWithdraw) {
              await this.executeWithdrawals(swap.id);
            } else {
              await this.executeRefunds(swap.id);
            }
            recovered++;
          }
        }
      } catch (error) {
        this.logger.error("Failed to recover swap", { swapId: swap.id, error });
      }
    }

    return recovered;
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down coordinator");

    // Stop monitoring
    await this.stopMonitoring();

    // Clear all intervals
    for (const swap of this.swaps.values()) {
      if (swap.monitoringInterval) {
        clearInterval(swap.monitoringInterval);
      }
    }

    // Mark as not initialized
    this.initialized = false;

    this.logger.info("Coordinator shutdown complete");
  }

  /**
   * Process a swap through its lifecycle
   */
  private async processSwap(swapId: string): Promise<void> {
    try {
      // Create source HTLC
      await this.createSourceHTLC(swapId);

      // Create destination HTLC
      await this.createDestinationHTLC(swapId);

      // Monitor for withdrawals
      await this.monitorWithdrawals(swapId);
    } catch (error) {
      this.logger.error("Swap processing failed", { swapId, error });
      throw error;
    }
  }

  /**
   * Create HTLC on source chain
   */
  private async createSourceHTLC(swapId: string): Promise<void> {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error("Swap not found");

    this.updateSwapState(swapId, "source_locked" as SwapState);

    try {
      // For EVM source
      if (swap.request.from === ChainType.EVM) {
        const htlcResult = await this.htlcManager.createHTLC({
          sender: swap.request.sender as Address,
          receiver: this.config.evmConfig.privateKey.slice(0, 42) as Address, // Coordinator address
          tokenContract: this.config.evmConfig.tokenAddress,
          amount: swap.request.amount,
          hashLock: swap.hashLock,
          timelock: BigInt(Math.floor(Date.now() / 1000) + this.config.timelocks.cancellation),
        });

        swap.sourceHTLC = {
          contractAddress: htlcResult.contractAddress,
          transactionHash: htlcResult.transactionHash,
          blockNumber: 0n, // Would get from receipt
          timestamp: Date.now(),
          withdrawn: false,
          refunded: false,
        };

        this.swaps.set(swapId, swap);
        this.logger.info("Source HTLC created", { swapId, address: htlcResult.contractAddress });
      }
    } catch (error) {
      this.updateSwapState(swapId, "failed" as SwapState, `Failed to create source HTLC: ${error}`);
      throw error;
    }
  }

  /**
   * Create HTLC on destination chain
   */
  private async createDestinationHTLC(swapId: string): Promise<void> {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error("Swap not found");

    this.updateSwapState(swapId, "destination_locked" as SwapState);

    try {
      // For Solana destination
      if (swap.request.to === ChainType.Solana) {
        if (!this.solanaHTLCManager || !this.solanaClient) {
          // Fallback to mock for testing
          swap.destinationHTLC = {
            contractAddress: "0xdest000000000000000000000000000000000000" as Address,
            transactionHash: "0xdest000000000000000000000000000000000000000000000000000000000000" as Hash,
            blockNumber: 0n,
            timestamp: Date.now(),
            withdrawn: false,
            refunded: false,
          };
          this.swaps.set(swapId, swap);
          this.logger.info("Destination HTLC created (mock)", { swapId });
          return;
        }

        // Create real Solana HTLC
        const htlcId = new Uint8Array(32);
        const encoder = new TextEncoder();
        const idBytes = encoder.encode(swap.id);
        htlcId.set(idBytes.slice(0, 32));
        
        const destinationAddress = new Uint8Array(20);
        // For Solana address, we'll use first 20 bytes of the address
        const destBytes = encoder.encode(swap.request.receiver);
        destinationAddress.set(destBytes.slice(0, 20));
        
        const destinationToken = new Uint8Array(20);
        // Use the configured EVM token address
        const tokenHex = this.config.evmConfig.tokenAddress.replace('0x', '');
        for (let i = 0; i < Math.min(20, tokenHex.length / 2); i++) {
          destinationToken[i] = parseInt(tokenHex.substr(i * 2, 2), 16);
        }
        
        const hashlock = new Uint8Array(32);
        if (swap.hashLock) {
          const hashHex = swap.hashLock.replace('0x', '');
          for (let i = 0; i < Math.min(32, hashHex.length / 2); i++) {
            hashlock[i] = parseInt(hashHex.substr(i * 2, 2), 16);
          }
        }
        
        const now = Math.floor(Date.now() / 1000);
        const result = await this.solanaHTLCManager.createHTLC({
          htlcId: new Uint8Array(htlcId),
          destinationAddress: new Uint8Array(destinationAddress),
          destinationToken: new Uint8Array(destinationToken),
          amount: swap.request.amount,
          safetyDeposit: 10000n, // 0.00001 SOL
          hashlock: new Uint8Array(hashlock),
          timelocks: {
            finality: now + this.config.timelocks.finality,
            resolver: now + this.config.timelocks.resolver,
            public: now + this.config.timelocks.public,
            cancellation: now + this.config.timelocks.cancellation,
          },
        });

        swap.destinationHTLC = {
          contractAddress: result.htlcAddress as Address,
          transactionHash: result.transactionHash as Hash,
          blockNumber: BigInt(result.slot),
          timestamp: Date.now(),
          withdrawn: false,
          refunded: false,
        };

        this.swaps.set(swapId, swap);
        this.logger.info("Destination HTLC created on Solana", { 
          swapId,
          htlcAddress: result.htlcAddress,
          txHash: result.transactionHash,
        });
      }
    } catch (error) {
      this.updateSwapState(swapId, "refunding" as SwapState, `Failed to create destination HTLC: ${error}`);
      // TODO: Refund source HTLC
      throw error;
    }
  }

  /**
   * Monitor for withdrawals
   */
  private async monitorWithdrawals(swapId: string): Promise<void> {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error("Swap not found");

    // In a real implementation, we would:
    // 1. Watch for withdrawal events on destination HTLC
    // 2. Capture the revealed secret
    // 3. Use it to withdraw from source HTLC

    // For now, simulate successful withdrawal after a delay
    setTimeout(async () => {
      try {
        await this.executeWithdrawals(swapId);
      } catch (error) {
        this.logger.error("Failed to execute withdrawals", { swapId, error });
      }
    }, 5000);
  }

  /**
   * Execute withdrawals on both chains
   */
  private async executeWithdrawals(swapId: string): Promise<void> {
    const swap = this.swaps.get(swapId);
    if (!swap || !swap.secret) throw new Error("Swap not found or secret missing");

    this.updateSwapState(swapId, "withdrawing" as SwapState);

    // Withdraw from source HTLC
    if (swap.sourceHTLC && !swap.sourceHTLC.withdrawn) {
      await this.htlcManager.withdraw(swap.sourceHTLC.contractAddress, swap.secret);
      swap.sourceHTLC.withdrawn = true;
    }

    // Mark as completed
    this.updateSwapState(swapId, "completed" as SwapState);

    // Release liquidity
    await this.liquidityManager.releaseLiquidity(
      swap.request.from,
      swap.request.amount,
      swapId
    );

    this.logger.info("Swap completed successfully", { swapId });
  }

  /**
   * Execute refunds on both chains
   */
  private async executeRefunds(swapId: string): Promise<void> {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error("Swap not found");

    this.updateSwapState(swapId, "refunding" as SwapState);

    // Refund HTLCs if they exist and haven't been withdrawn
    if (swap.sourceHTLC && !swap.sourceHTLC.withdrawn && !swap.sourceHTLC.refunded) {
      const canRefund = await this.htlcManager.canRefund(swap.sourceHTLC.contractAddress);
      if (canRefund) {
        await this.htlcManager.refund(swap.sourceHTLC.contractAddress);
        swap.sourceHTLC.refunded = true;
      }
    }

    this.updateSwapState(swapId, "refunded" as SwapState);

    // Release liquidity
    await this.liquidityManager.releaseLiquidity(
      swap.request.from,
      swap.request.amount,
      swapId
    );

    this.logger.info("Swap refunded", { swapId });
  }

  /**
   * Monitor active swaps
   */
  private async monitorActiveSwaps(): Promise<void> {
    const activeSwaps = Array.from(this.swaps.values()).filter(s =>
      this.isActiveState(s.state)
    );

    for (const swap of activeSwaps) {
      try {
        // Check for timeouts
        const now = Date.now();
        const elapsed = now - swap.createdAt;

        // If swap is taking too long, attempt recovery
        if (elapsed > 600000) { // 10 minutes
          await this.recoverStuckSwaps();
        }
      } catch (error) {
        this.logger.error("Error monitoring swap", { swapId: swap.id, error });
      }
    }
  }

  /**
   * Check if withdrawals can be executed
   */
  private async checkWithdrawConditions(swapId: string): Promise<boolean> {
    const swap = this.swaps.get(swapId);
    if (!swap || !swap.secret) return false;

    // Check if destination has been withdrawn (user revealed secret)
    // In real implementation, would check chain state
    return true; // Mock implementation
  }

  /**
   * Validate swap request
   */
  private validateSwapRequest(request: SwapRequest): void {
    // Check amount limits
    if (this.config.limits?.minAmount && request.amount < this.config.limits.minAmount) {
      throw new CoordinatorError(
        `Amount below minimum: ${this.config.limits.minAmount}`,
        ErrorCodes.AMOUNT_TOO_LOW
      );
    }

    if (this.config.limits?.maxAmount && request.amount > this.config.limits.maxAmount) {
      throw new CoordinatorError(
        `Amount exceeds maximum: ${this.config.limits.maxAmount}`,
        ErrorCodes.AMOUNT_TOO_HIGH
      );
    }

    // Validate chain support
    if (request.from !== ChainType.EVM && request.from !== ChainType.Solana) {
      throw new CoordinatorError(
        `Unsupported source chain: ${request.from}`,
        ErrorCodes.CHAIN_NOT_SUPPORTED
      );
    }

    if (request.to !== ChainType.EVM && request.to !== ChainType.Solana) {
      throw new CoordinatorError(
        `Unsupported destination chain: ${request.to}`,
        ErrorCodes.CHAIN_NOT_SUPPORTED
      );
    }

    // For now, only support EVM -> Solana
    if (!(request.from === ChainType.EVM && request.to === ChainType.Solana)) {
      throw new CoordinatorError(
        "Currently only EVM to Solana swaps are supported",
        ErrorCodes.CHAIN_NOT_SUPPORTED
      );
    }
  }

  /**
   * Update swap state
   */
  private updateSwapState(swapId: string, state: SwapState, error?: string): void {
    const swap = this.swaps.get(swapId);
    if (!swap) return;

    swap.state = state;
    swap.updatedAt = Date.now();
    if (error) {
      swap.error = error;
    }

    this.swaps.set(swapId, swap);

    this.logger.debug("Swap state updated", { swapId, state, error });
  }

  /**
   * Set swap state (for testing only)
   */
  public setSwapStateForTesting(swapId: string, state: SwapState): void {
    if (!this.config.testMode) {
      throw new CoordinatorError("Method only available in test mode", ErrorCodes.INVALID_STATE);
    }
    this.updateSwapState(swapId, state);
  }

  /**
   * Check if state is active
   */
  private isActiveState(state: SwapState): boolean {
    return ![
      "completed" as SwapState,
      "refunded" as SwapState,
      "failed" as SwapState,
    ].includes(state);
  }

  /**
   * Get swap status from internal data
   */
  private getSwapStatusFromData(data: SwapData): SwapStatus {
    const { monitoringInterval, retryCount, ...status } = data;
    return status;
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * Convert bytes to hex string
   */
  private bytesToHex(bytes: Uint8Array): `0x${string}` {
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }
}