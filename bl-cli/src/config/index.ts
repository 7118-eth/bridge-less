/**
 * Configuration management for the HTLC bridge coordinator
 * @module config
 */

export { ConfigManager, configManager } from "./config.ts";
export type {
  CoordinatorConfig,
  EvmConfig,
  SvmConfig,
  TimelockConfig,
  LiquidityConfig,
  ConfigValidationResult,
  IConfigManager,
} from "./types.ts";
export { ConfigError } from "./types.ts";