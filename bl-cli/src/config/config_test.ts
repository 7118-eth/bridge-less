import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { IConfigManager, CoordinatorConfig, EvmConfig } from "./types.ts";
import { ConfigError } from "./types.ts";

/**
 * Tests for configuration management
 */

Deno.test("ConfigManager", async (t) => {
  let configManager: IConfigManager;

  // This will be set when we import the actual implementation
  const setup = async () => {
    const { ConfigManager } = await import("./config.ts");
    configManager = new ConfigManager();
  };

  await t.step("loadFromEnv", async (t) => {
    await setup();

    await t.step("loads valid configuration from environment", async () => {
      // Set up test environment variables
      const testEnv = {
        evm_rpc: "http://test.localhost:8545",
        evm_rpc_ws: "ws://test.localhost:8545",
        evm_coordinator_private_key: "0x1234567890123456789012345678901234567890123456789012345678901234",
        evm_user_private_key: "0xabcdef0123456789012345678901234567890123456789012345678901234567",
        evm_token_contract_address: "0x1111111111111111111111111111111111111111",
        evm_htlc_contract_address: "0x2222222222222222222222222222222222222222",
        svm_rpc: "http://test.localhost:8899",
        svm_rpc_ws: "ws://test.localhost:8900",
      };

      // Save current env and set test values
      const savedEnv: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(testEnv)) {
        savedEnv[key] = Deno.env.get(key);
        Deno.env.set(key, value);
      }

      try {
        const config = await configManager.loadFromEnv();
        
        assertEquals(config.evm.rpc, testEnv.evm_rpc);
        assertEquals(config.evm.rpcWs, testEnv.evm_rpc_ws);
        assertEquals(config.evm.coordinatorPrivateKey, testEnv.evm_coordinator_private_key);
        assertEquals(config.evm.userPrivateKey, testEnv.evm_user_private_key);
        assertEquals(config.evm.tokenContractAddress, testEnv.evm_token_contract_address);
        assertEquals(config.evm.htlcContractAddress, testEnv.evm_htlc_contract_address);
        assertEquals(config.svm.rpc, testEnv.svm_rpc);
        assertEquals(config.svm.rpcWs, testEnv.svm_rpc_ws);
        
        // Check defaults are applied
        assertEquals(config.timelocks.finality, 30);
        assertEquals(config.timelocks.resolverExclusive, 60);
        assertEquals(config.timelocks.publicWithdrawal, 300);
        assertEquals(config.timelocks.cancellation, 600);
        assertEquals(config.liquidity.initialAmount, 10000);
        assertEquals(config.liquidity.minimumBalance, 100);
      } finally {
        // Restore original env
        for (const [key, value] of Object.entries(savedEnv)) {
          if (value === undefined) {
            Deno.env.delete(key);
          } else {
            Deno.env.set(key, value);
          }
        }
      }
    });

    await t.step("throws for missing required EVM variables", async () => {
      // Clear required env var
      const saved = Deno.env.get("evm_coordinator_private_key");
      Deno.env.delete("evm_coordinator_private_key");

      try {
        await assertRejects(
          async () => await configManager.loadFromEnv(),
          ConfigError,
          "Missing required environment variable: evm_coordinator_private_key"
        );
      } finally {
        if (saved) Deno.env.set("evm_coordinator_private_key", saved);
      }
    });

    await t.step("uses defaults for optional variables", async () => {
      // Set only required vars
      const testEnv = {
        evm_coordinator_private_key: "0x1234567890123456789012345678901234567890123456789012345678901234",
        evm_user_private_key: "0xabcdef0123456789012345678901234567890123456789012345678901234567",
        evm_token_contract_address: "0x1111111111111111111111111111111111111111",
        evm_htlc_contract_address: "0x2222222222222222222222222222222222222222",
      };

      const savedEnv: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(testEnv)) {
        savedEnv[key] = Deno.env.get(key);
        Deno.env.set(key, value);
      }

      // Delete optional vars
      const optionalVars = ["evm_rpc", "evm_rpc_ws", "svm_rpc", "svm_rpc_ws"];
      for (const key of optionalVars) {
        savedEnv[key] = Deno.env.get(key);
        Deno.env.delete(key);
      }

      try {
        const config = await configManager.loadFromEnv();
        
        // Check defaults are used
        assertEquals(config.evm.rpc, "http://localhost:8545");
        assertEquals(config.evm.rpcWs, "ws://localhost:8545");
        assertEquals(config.svm.rpc, "http://localhost:8899");
        assertEquals(config.svm.rpcWs, "ws://localhost:8900");
      } finally {
        // Restore env
        for (const [key, value] of Object.entries(savedEnv)) {
          if (value === undefined) {
            Deno.env.delete(key);
          } else {
            Deno.env.set(key, value);
          }
        }
      }
    });
  });

  await t.step("loadFromFile", async (t) => {
    await setup();

    await t.step("loads valid configuration from JSON file", async () => {
      // Create a temporary config file
      const tempFile = await Deno.makeTempFile({ suffix: ".json" });
      
      const testConfig = {
        evm: {
          rpc: "http://file.localhost:8545",
          rpcWs: "ws://file.localhost:8545",
          coordinatorPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
          userPrivateKey: "0x2222222222222222222222222222222222222222222222222222222222222222",
          tokenContractAddress: "0x3333333333333333333333333333333333333333",
          htlcContractAddress: "0x4444444444444444444444444444444444444444",
        },
        svm: {
          rpc: "http://file.localhost:8899",
          rpcWs: "ws://file.localhost:8900",
        },
        timelocks: {
          finality: 45,
          resolverExclusive: 90,
          publicWithdrawal: 450,
          cancellation: 900,
        },
        liquidity: {
          initialAmount: 5000,
          minimumBalance: 50,
        },
        debug: true,
        logLevel: "debug",
      };

      await Deno.writeTextFile(tempFile, JSON.stringify(testConfig, null, 2));

      try {
        const config = await configManager.loadFromFile(tempFile);
        
        assertEquals(config.evm.rpc, testConfig.evm.rpc);
        assertEquals(config.timelocks.finality, testConfig.timelocks.finality);
        assertEquals(config.liquidity.initialAmount, testConfig.liquidity.initialAmount);
        assertEquals(config.debug, testConfig.debug);
        assertEquals(config.logLevel, testConfig.logLevel);
      } finally {
        await Deno.remove(tempFile);
      }
    });

    await t.step("throws for non-existent file", async () => {
      await assertRejects(
        async () => await configManager.loadFromFile("/non/existent/file.json"),
        ConfigError,
        "Configuration file not found"
      );
    });

    await t.step("throws for invalid JSON", async () => {
      const tempFile = await Deno.makeTempFile({ suffix: ".json" });
      await Deno.writeTextFile(tempFile, "{ invalid json ]");

      try {
        await assertRejects(
          async () => await configManager.loadFromFile(tempFile),
          ConfigError,
          "Invalid JSON in configuration file"
        );
      } finally {
        await Deno.remove(tempFile);
      }
    });

    await t.step("merges with defaults for partial config", async () => {
      const tempFile = await Deno.makeTempFile({ suffix: ".json" });
      
      const partialConfig = {
        evm: {
          rpc: "http://partial.localhost:8545",
          coordinatorPrivateKey: "0x5555555555555555555555555555555555555555555555555555555555555555",
          userPrivateKey: "0x6666666666666666666666666666666666666666666666666666666666666666",
          tokenContractAddress: "0x7777777777777777777777777777777777777777",
          htlcContractAddress: "0x8888888888888888888888888888888888888888",
        },
      };

      await Deno.writeTextFile(tempFile, JSON.stringify(partialConfig, null, 2));

      try {
        const config = await configManager.loadFromFile(tempFile);
        
        // Check partial values are used
        assertEquals(config.evm.rpc, partialConfig.evm.rpc);
        
        // Check defaults are applied for missing values
        assertEquals(config.evm.rpcWs, "ws://localhost:8545");
        assertEquals(config.timelocks.finality, 30);
        assertEquals(config.liquidity.initialAmount, 10000);
      } finally {
        await Deno.remove(tempFile);
      }
    });
  });

  await t.step("validate", async (t) => {
    await setup();

    await t.step("validates complete valid configuration", () => {
      const validConfig: CoordinatorConfig = configManager.getDefaults();
      const result = configManager.validate(validConfig);
      
      assertEquals(result.valid, true);
      assertEquals(result.errors.length, 0);
    });

    await t.step("detects missing required EVM fields", () => {
      const invalidConfig: Partial<CoordinatorConfig> = {
        evm: {
          rpc: "http://localhost:8545",
          rpcWs: "ws://localhost:8545",
          coordinatorPrivateKey: "",
          userPrivateKey: "",
          tokenContractAddress: "",
          htlcContractAddress: "",
        },
      };
      // Clear required fields to test validation
      invalidConfig.evm!.coordinatorPrivateKey = "";
      invalidConfig.evm!.userPrivateKey = "";
      invalidConfig.evm!.tokenContractAddress = "";
      invalidConfig.evm!.htlcContractAddress = "";

      const result = configManager.validate(invalidConfig);
      
      assertEquals(result.valid, false);
      assertEquals(result.errors.includes("Missing required field: evm.coordinatorPrivateKey"), true);
      assertEquals(result.errors.includes("Missing required field: evm.userPrivateKey"), true);
      assertEquals(result.errors.includes("Missing required field: evm.tokenContractAddress"), true);
      assertEquals(result.errors.includes("Missing required field: evm.htlcContractAddress"), true);
    });

    await t.step("validates private key format", () => {
      const config = configManager.getDefaults();
      config.evm.coordinatorPrivateKey = "invalid-key";

      const result = configManager.validate(config);
      
      assertEquals(result.valid, false);
      assertEquals(result.errors.includes("Invalid private key format: evm.coordinatorPrivateKey"), true);
    });

    await t.step("validates address format", () => {
      const config = configManager.getDefaults();
      config.evm.tokenContractAddress = "not-an-address";

      const result = configManager.validate(config);
      
      assertEquals(result.valid, false);
      assertEquals(result.errors.includes("Invalid address format: evm.tokenContractAddress"), true);
    });

    await t.step("validates URL format", () => {
      const config = configManager.getDefaults();
      config.evm.rpc = "not-a-url";

      const result = configManager.validate(config);
      
      assertEquals(result.valid, false);
      assertEquals(result.errors.includes("Invalid URL format: evm.rpc"), true);
    });

    await t.step("validates timelock values", () => {
      const config = configManager.getDefaults();
      config.timelocks.finality = -1;
      config.timelocks.resolverExclusive = 0;

      const result = configManager.validate(config);
      
      assertEquals(result.valid, false);
      assertEquals(result.errors.includes("Timelock value must be positive: timelocks.finality"), true);
      assertEquals(result.errors.includes("Timelock value must be positive: timelocks.resolverExclusive"), true);
    });

    await t.step("validates liquidity values", () => {
      const config = configManager.getDefaults();
      config.liquidity.initialAmount = -100;
      config.liquidity.minimumBalance = -10;

      const result = configManager.validate(config);
      
      assertEquals(result.valid, false);
      assertEquals(result.errors.includes("Liquidity amount must be non-negative: liquidity.initialAmount"), true);
      assertEquals(result.errors.includes("Liquidity amount must be non-negative: liquidity.minimumBalance"), true);
    });
  });

  await t.step("getDefaults", async (t) => {
    await setup();

    await t.step("returns complete default configuration", () => {
      const defaults = configManager.getDefaults();
      
      // Check structure
      assertEquals(typeof defaults.evm, "object");
      assertEquals(typeof defaults.svm, "object");
      assertEquals(typeof defaults.timelocks, "object");
      assertEquals(typeof defaults.liquidity, "object");
      
      // Check default values
      assertEquals(defaults.evm.rpc, "http://localhost:8545");
      assertEquals(defaults.evm.rpcWs, "ws://localhost:8545");
      assertEquals(defaults.svm.rpc, "http://localhost:8899");
      assertEquals(defaults.svm.rpcWs, "ws://localhost:8900");
      assertEquals(defaults.timelocks.finality, 30);
      assertEquals(defaults.timelocks.resolverExclusive, 60);
      assertEquals(defaults.timelocks.publicWithdrawal, 300);
      assertEquals(defaults.timelocks.cancellation, 600);
      assertEquals(defaults.liquidity.initialAmount, 10000);
      assertEquals(defaults.liquidity.minimumBalance, 100);
      assertEquals(defaults.debug, false);
      assertEquals(defaults.logLevel, "info");
    });

    // Snapshot test removed - can be added later if needed
  });
});