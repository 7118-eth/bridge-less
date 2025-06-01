/**
 * Configuration types for the HTLC bridge coordinator
 */

/**
 * EVM chain configuration
 */
export interface EvmConfig {
  /**
   * HTTP RPC endpoint URL
   */
  rpc: string;

  /**
   * WebSocket RPC endpoint URL
   */
  rpcWs: string;

  /**
   * Coordinator's private key (hex string with 0x prefix)
   */
  coordinatorPrivateKey: string;

  /**
   * User's private key for testing (hex string with 0x prefix)
   */
  userPrivateKey: string;

  /**
   * Token contract address
   */
  tokenContractAddress: string;

  /**
   * HTLC factory contract address
   */
  htlcContractAddress: string;

  /**
   * Chain ID (optional, will be fetched if not provided)
   */
  chainId?: number;
}

/**
 * Solana (SVM) chain configuration
 */
export interface SvmConfig {
  /**
   * HTTP RPC endpoint URL
   */
  rpc: string;

  /**
   * WebSocket RPC endpoint URL
   */
  rpcWs: string;

  /**
   * Coordinator's private key (base58 or hex)
   */
  coordinatorPrivateKey?: string;

  /**
   * User's private key for testing (base58 or hex)
   */
  userPrivateKey?: string;

  /**
   * Token mint address
   */
  tokenContractAddress?: string;

  /**
   * HTLC program address
   */
  htlcContractAddress?: string;
}

/**
 * Timelock configuration for HTLC operations
 */
export interface TimelockConfig {
  /**
   * Time for transaction finality (seconds)
   */
  finality: number;

  /**
   * Exclusive time window for resolver (seconds)
   */
  resolverExclusive: number;

  /**
   * Time window for public withdrawal (seconds)
   */
  publicWithdrawal: number;

  /**
   * Time before cancellation is allowed (seconds)
   */
  cancellation: number;
}

/**
 * Liquidity configuration
 */
export interface LiquidityConfig {
  /**
   * Initial liquidity amount per chain (in token units)
   */
  initialAmount: number;

  /**
   * Minimum balance threshold for warnings (in token units)
   */
  minimumBalance: number;
}

/**
 * Complete coordinator configuration
 */
export interface CoordinatorConfig {
  /**
   * EVM chain configuration
   */
  evm: EvmConfig;

  /**
   * Solana chain configuration
   */
  svm: SvmConfig;

  /**
   * Timelock configuration
   */
  timelocks: TimelockConfig;

  /**
   * Liquidity configuration
   */
  liquidity: LiquidityConfig;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom log level
   */
  logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /**
   * Whether the configuration is valid
   */
  valid: boolean;

  /**
   * Validation errors if any
   */
  errors: string[];
}

/**
 * Interface for configuration management
 */
export interface IConfigManager {
  /**
   * Load configuration from environment variables
   * @returns The loaded configuration
   * @throws {ConfigError} If required variables are missing
   * @example
   * ```typescript
   * const config = await configManager.loadFromEnv();
   * console.log(config.evm.rpc); // "http://localhost:8545"
   * ```
   */
  loadFromEnv(): Promise<CoordinatorConfig>;

  /**
   * Load configuration from a JSON file
   * @param path - Path to the configuration file
   * @returns The loaded configuration
   * @throws {ConfigError} If file is invalid or missing required fields
   * @example
   * ```typescript
   * const config = await configManager.loadFromFile("./config.json");
   * ```
   */
  loadFromFile(path: string): Promise<CoordinatorConfig>;

  /**
   * Validate a configuration object
   * @param config - The configuration to validate
   * @returns Validation result with any errors
   * @example
   * ```typescript
   * const result = configManager.validate(config);
   * if (!result.valid) {
   *   console.error("Config errors:", result.errors);
   * }
   * ```
   */
  validate(config: Partial<CoordinatorConfig>): ConfigValidationResult;

  /**
   * Get default configuration values
   * @returns Default configuration
   */
  getDefaults(): CoordinatorConfig;
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ConfigError";
  }
}