/**
 * Liquidity manager implementation
 * @module coordinator/liquidity
 */

import type { ILiquidityManager, LiquidityStatus, ChainType } from "./types.ts";
import { CoordinatorError, ErrorCodes } from "./types.ts";
import type { IEvmClient, Address } from "../chains/evm/types.ts";
import { createLogger, type Logger } from "../utils/logger.ts";

/**
 * Liquidity manager options
 */
export interface LiquidityManagerOptions {
  /** EVM client instance */
  evmClient: IEvmClient;
  /** EVM token contract address */
  evmTokenAddress: Address;
  /** Solana client instance (future) */
  solanaClient?: any;
  /** Solana token mint address (future) */
  solanaTokenMint?: string;
}

/**
 * Locked amount entry
 */
interface LockedAmount {
  /** Chain type */
  chain: ChainType;
  /** Locked amount */
  amount: bigint;
  /** Lock timestamp */
  timestamp: number;
}

/**
 * Liquidity manager implementation
 */
export class LiquidityManager implements ILiquidityManager {
  private readonly evmClient: IEvmClient;
  private readonly evmTokenAddress: Address;
  private readonly logger: Logger;

  // Balances by chain
  private balances = new Map<ChainType, bigint>();
  
  // Locked amounts by swap ID
  private lockedAmounts = new Map<string, LockedAmount[]>();

  constructor(options: LiquidityManagerOptions) {
    this.evmClient = options.evmClient;
    this.evmTokenAddress = options.evmTokenAddress;

    this.logger = createLogger({
      level: "info",
      json: false,
    }).child({ module: "liquidity-manager" });
  }

  async hasLiquidity(chain: ChainType, amount: bigint): Promise<boolean> {
    const status = await this.getStatus(chain);
    return status.available >= amount;
  }

  async lockLiquidity(
    chain: ChainType,
    amount: bigint,
    swapId: string
  ): Promise<boolean> {
    // Check availability
    const hasLiq = await this.hasLiquidity(chain, amount);
    if (!hasLiq) {
      return false;
    }

    // Lock the amount
    const existing = this.lockedAmounts.get(swapId) || [];
    existing.push({
      chain,
      amount,
      timestamp: Date.now(),
    });
    this.lockedAmounts.set(swapId, existing);

    this.logger.debug("Liquidity locked", {
      swapId,
      chain,
      amount: amount.toString(),
    });

    return true;
  }

  async releaseLiquidity(
    chain: ChainType,
    amount: bigint,
    swapId: string
  ): Promise<void> {
    const locked = this.lockedAmounts.get(swapId);
    if (!locked) {
      this.logger.warn("No locked amounts found for swap", { swapId });
      return;
    }

    // Remove the lock for this chain
    const updated = locked.filter(l => l.chain !== chain);
    if (updated.length === 0) {
      this.lockedAmounts.delete(swapId);
    } else {
      this.lockedAmounts.set(swapId, updated);
    }

    this.logger.debug("Liquidity released", {
      swapId,
      chain,
      amount: amount.toString(),
    });
  }

  async getStatus(chain: ChainType): Promise<LiquidityStatus> {
    // Get or update balance
    let balance = this.balances.get(chain);
    if (balance === undefined) {
      balance = await this.updateBalance(chain);
    }

    // Calculate total locked for this chain
    let totalLocked = 0n;
    let activeSwaps = 0;

    for (const locks of this.lockedAmounts.values()) {
      for (const lock of locks) {
        if (lock.chain === chain) {
          totalLocked += lock.amount;
          activeSwaps++;
        }
      }
    }

    const available = balance - totalLocked;

    return {
      chain,
      tokenAddress: this.getTokenAddress(chain),
      balance,
      locked: totalLocked,
      available: available > 0n ? available : 0n,
      activeSwaps,
    };
  }

  async updateBalance(chain: ChainType): Promise<bigint> {
    try {
      let balance = 0n;

      if (chain === "evm" as ChainType) {
        // Get coordinator's address from private key
        // In real implementation, would derive from private key
        const coordinatorAddress = "0x1234567890123456789012345678901234567890" as Address;

        // Mock balance check
        // In real implementation, would call token contract
        balance = 10000000000n; // 10,000 tokens with 6 decimals
      } else if (chain === "solana" as ChainType) {
        // Mock Solana balance
        balance = 10000000000n; // 10,000 tokens
      }

      this.balances.set(chain, balance);

      this.logger.info("Balance updated", {
        chain,
        balance: balance.toString(),
      });

      return balance;
    } catch (error) {
      this.logger.error("Failed to update balance", { chain, error });
      throw new CoordinatorError(
        `Failed to update balance for ${chain}`,
        ErrorCodes.MONITORING_ERROR
      );
    }
  }

  getLockedAmounts(): Map<string, { chain: ChainType; amount: bigint }[]> {
    const result = new Map<string, { chain: ChainType; amount: bigint }[]>();
    
    for (const [swapId, locks] of this.lockedAmounts.entries()) {
      result.set(
        swapId,
        locks.map(l => ({ chain: l.chain, amount: l.amount }))
      );
    }

    return result;
  }

  /**
   * Get token address for a chain
   */
  private getTokenAddress(chain: ChainType): string {
    if (chain === "evm" as ChainType) {
      return this.evmTokenAddress;
    } else if (chain === "solana" as ChainType) {
      return "SoLaNaToKeNaDdReSs1111111111111111111111111"; // Mock
    }
    return "";
  }
}