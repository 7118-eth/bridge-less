import type {
  IConfigManager,
  CoordinatorConfig,
  ConfigValidationResult,
  EvmConfig,
  SvmConfig,
  TimelockConfig,
  LiquidityConfig,
} from "./types.ts";
import { ConfigError } from "./types.ts";

/**
 * Implementation of configuration management
 */
export class ConfigManager implements IConfigManager {
  async loadFromEnv(): Promise<CoordinatorConfig> {
    const defaults = this.getDefaults();

    // Load EVM config
    const evmConfig: EvmConfig = {
      rpc: Deno.env.get("evm_rpc") || defaults.evm.rpc,
      rpcWs: Deno.env.get("evm_rpc_ws") || defaults.evm.rpcWs,
      coordinatorPrivateKey: this.getRequiredEnv("evm_coordinator_private_key"),
      userPrivateKey: this.getRequiredEnv("evm_user_private_key"),
      tokenContractAddress: this.getRequiredEnv("evm_token_contract_address"),
      htlcContractAddress: this.getRequiredEnv("evm_htlc_contract_address"),
    };

    // Load SVM config (all optional for now)
    const svmConfig: SvmConfig = {
      rpc: Deno.env.get("svm_rpc") || defaults.svm.rpc,
      rpcWs: Deno.env.get("svm_rpc_ws") || defaults.svm.rpcWs,
      coordinatorPrivateKey: Deno.env.get("svm_coordinator_private_key"),
      userPrivateKey: Deno.env.get("svm_user_private_key"),
      tokenContractAddress: Deno.env.get("svm_token_contract_address"),
      htlcContractAddress: Deno.env.get("svm_htlc_contract_address"),
    };

    // Construct full config
    const config: CoordinatorConfig = {
      evm: evmConfig,
      svm: svmConfig,
      timelocks: defaults.timelocks,
      liquidity: defaults.liquidity,
      debug: defaults.debug,
      logLevel: defaults.logLevel,
    };

    // Validate before returning
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new ConfigError(
        `Invalid configuration: ${validation.errors.join(", ")}`,
        "INVALID_CONFIG"
      );
    }

    return config;
  }

  async loadFromFile(path: string): Promise<CoordinatorConfig> {
    let fileContent: string;
    
    try {
      fileContent = await Deno.readTextFile(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new ConfigError(
          "Configuration file not found",
          "FILE_NOT_FOUND"
        );
      }
      throw new ConfigError(
        `Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`,
        "FILE_READ_ERROR"
      );
    }

    let parsedConfig: Partial<CoordinatorConfig>;
    try {
      parsedConfig = JSON.parse(fileContent);
    } catch (error) {
      throw new ConfigError(
        "Invalid JSON in configuration file",
        "INVALID_JSON"
      );
    }

    // Merge with defaults
    const defaults = this.getDefaults();
    const config: CoordinatorConfig = {
      evm: { ...defaults.evm, ...parsedConfig.evm },
      svm: { ...defaults.svm, ...parsedConfig.svm },
      timelocks: { ...defaults.timelocks, ...parsedConfig.timelocks },
      liquidity: { ...defaults.liquidity, ...parsedConfig.liquidity },
      debug: parsedConfig.debug ?? defaults.debug,
      logLevel: parsedConfig.logLevel ?? defaults.logLevel,
    };

    // Validate before returning
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new ConfigError(
        `Invalid configuration: ${validation.errors.join(", ")}`,
        "INVALID_CONFIG"
      );
    }

    return config;
  }

  validate(config: Partial<CoordinatorConfig>): ConfigValidationResult {
    const errors: string[] = [];

    // Validate EVM config
    if (!config.evm) {
      errors.push("Missing required section: evm");
    } else {
      // Required fields
      if (!config.evm.coordinatorPrivateKey) {
        errors.push("Missing required field: evm.coordinatorPrivateKey");
      } else if (!this.isValidPrivateKey(config.evm.coordinatorPrivateKey)) {
        errors.push("Invalid private key format: evm.coordinatorPrivateKey");
      }

      if (!config.evm.userPrivateKey) {
        errors.push("Missing required field: evm.userPrivateKey");
      } else if (!this.isValidPrivateKey(config.evm.userPrivateKey)) {
        errors.push("Invalid private key format: evm.userPrivateKey");
      }

      if (!config.evm.tokenContractAddress) {
        errors.push("Missing required field: evm.tokenContractAddress");
      } else if (!this.isValidAddress(config.evm.tokenContractAddress)) {
        errors.push("Invalid address format: evm.tokenContractAddress");
      }

      if (!config.evm.htlcContractAddress) {
        errors.push("Missing required field: evm.htlcContractAddress");
      } else if (!this.isValidAddress(config.evm.htlcContractAddress)) {
        errors.push("Invalid address format: evm.htlcContractAddress");
      }

      // Optional fields with validation
      if (config.evm.rpc && !this.isValidUrl(config.evm.rpc)) {
        errors.push("Invalid URL format: evm.rpc");
      }

      if (config.evm.rpcWs && !this.isValidUrl(config.evm.rpcWs)) {
        errors.push("Invalid URL format: evm.rpcWs");
      }
    }

    // Validate SVM config (optional)
    if (config.svm) {
      if (config.svm.rpc && !this.isValidUrl(config.svm.rpc)) {
        errors.push("Invalid URL format: svm.rpc");
      }

      if (config.svm.rpcWs && !this.isValidUrl(config.svm.rpcWs)) {
        errors.push("Invalid URL format: svm.rpcWs");
      }
    }

    // Validate timelocks
    if (config.timelocks) {
      const timelockFields: (keyof TimelockConfig)[] = [
        "finality",
        "resolverExclusive",
        "publicWithdrawal",
        "cancellation",
      ];

      for (const field of timelockFields) {
        const value = config.timelocks[field];
        if (value !== undefined && value <= 0) {
          errors.push(`Timelock value must be positive: timelocks.${field}`);
        }
      }
    }

    // Validate liquidity
    if (config.liquidity) {
      if (config.liquidity.initialAmount !== undefined && config.liquidity.initialAmount < 0) {
        errors.push("Liquidity amount must be non-negative: liquidity.initialAmount");
      }

      if (config.liquidity.minimumBalance !== undefined && config.liquidity.minimumBalance < 0) {
        errors.push("Liquidity amount must be non-negative: liquidity.minimumBalance");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getDefaults(): CoordinatorConfig {
    return {
      evm: {
        rpc: "http://localhost:8545",
        rpcWs: "ws://localhost:8545",
        coordinatorPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
        userPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
        tokenContractAddress: "0x0000000000000000000000000000000000000000",
        htlcContractAddress: "0x0000000000000000000000000000000000000000",
      },
      svm: {
        rpc: "http://localhost:8899",
        rpcWs: "ws://localhost:8900",
      },
      timelocks: {
        finality: 30,
        resolverExclusive: 60,
        publicWithdrawal: 300,
        cancellation: 600,
      },
      liquidity: {
        initialAmount: 10000,
        minimumBalance: 100,
      },
      debug: false,
      logLevel: "info",
    };
  }

  private getRequiredEnv(key: string): string {
    const value = Deno.env.get(key);
    if (!value) {
      throw new ConfigError(
        `Missing required environment variable: ${key}`,
        "MISSING_ENV_VAR"
      );
    }
    return value;
  }

  private isValidPrivateKey(key: string): boolean {
    // Check for hex format with 0x prefix
    return /^0x[0-9a-fA-F]{64}$/.test(key);
  }

  private isValidAddress(address: string): boolean {
    // Check for ethereum address format
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const configManager = new ConfigManager();