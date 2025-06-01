/**
 * Coordinator module exports
 * @module coordinator
 */

// Export types
export type {
  SwapDirection,
  SwapRequest,
  HTLCData,
  SwapStatus,
  LiquidityStatus,
  CoordinatorConfig,
  CoordinatorStats,
  ICoordinator,
  ILiquidityManager,
} from "./types.ts";

// Export enums and constants
export {
  ChainType,
  SwapState,
  CoordinatorError,
  ErrorCodes,
} from "./types.ts";

// Export implementations
export { Coordinator } from "./coordinator.ts";
export type { CoordinatorOptions } from "./coordinator.ts";

export { LiquidityManager } from "./liquidity.ts";
export type { LiquidityManagerOptions } from "./liquidity.ts";