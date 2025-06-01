#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Bridge-less CLI - Coordinator for HTLC cross-chain swaps
 */

import { parseArgs } from "jsr:@std/cli@1";
import { load } from "jsr:@std/dotenv@0";
import { Coordinator, type CoordinatorConfig, ChainType, type SwapRequest } from "./src/coordinator/index.ts";
import { EvmClient, HTLCManager } from "./src/chains/evm/index.ts";
import { createLogger } from "./src/utils/logger.ts";
import { readFileSync } from "node:fs";

// Load environment variables
await load({ export: true });

const logger = createLogger({ level: "info", json: false });

/**
 * Load configuration from environment
 */
function loadConfig(): CoordinatorConfig {
  const config: CoordinatorConfig = {
    evmConfig: {
      rpcUrl: Deno.env.get("evm_rpc") || "http://localhost:8545",
      rpcWsUrl: Deno.env.get("evm_rpc_ws"),
      privateKey: Deno.env.get("evm_coordinator_private_key") || "",
      tokenAddress: (Deno.env.get("evm_token_contract_address") || "") as any,
      htlcFactoryAddress: (Deno.env.get("evm_htlc_factory_contract_address") || "") as any,
    },
    timelocks: {
      finality: parseInt(Deno.env.get("finality_period") || "30"),
      resolver: parseInt(Deno.env.get("resolver_period") || "60"),
      public: parseInt(Deno.env.get("public_period") || "300"),
      cancellation: parseInt(Deno.env.get("cancellation_period") || "600"),
    },
    limits: {
      minAmount: BigInt(Deno.env.get("min_swap_amount") || "100000"), // 0.1 token
      maxAmount: BigInt(Deno.env.get("max_swap_amount") || "10000000000"), // 10,000 tokens
      maxConcurrentSwaps: parseInt(Deno.env.get("max_concurrent_swaps") || "10"),
    },
  };

  // Validate required config
  if (!config.evmConfig.privateKey) {
    throw new Error("EVM coordinator private key not configured");
  }
  if (!config.evmConfig.tokenAddress) {
    throw new Error("EVM token contract address not configured");
  }
  if (!config.evmConfig.htlcFactoryAddress) {
    throw new Error("EVM HTLC factory contract address not configured");
  }

  return config;
}

/**
 * Load ABI files
 */
function loadABIs() {
  try {
    const tokenAbi = JSON.parse(readFileSync("./abi/Token.json", "utf-8"));
    const htlcAbi = JSON.parse(readFileSync("./abi/IHTLC.json", "utf-8"));
    const factoryAbi = JSON.parse(readFileSync("./abi/IHTLCFactory.json", "utf-8"));
    
    return { tokenAbi, htlcAbi, factoryAbi };
  } catch (error) {
    logger.error("Failed to load ABI files", { error });
    throw new Error("ABI files not found. Ensure abi/ directory contains Token.json, IHTLC.json, and IHTLCFactory.json");
  }
}

/**
 * Create and initialize coordinator
 */
async function createCoordinator(): Promise<Coordinator> {
  const config = loadConfig();
  const { tokenAbi, htlcAbi, factoryAbi } = loadABIs();

  // Create EVM client
  const evmClient = new EvmClient({
    rpcUrl: config.evmConfig.rpcUrl,
    rpcWsUrl: config.evmConfig.rpcWsUrl,
    privateKey: config.evmConfig.privateKey as `0x${string}`,
  });

  // Create HTLC manager
  const htlcManager = new HTLCManager({
    client: evmClient,
    factoryAddress: config.evmConfig.htlcFactoryAddress,
    tokenAbi,
    htlcAbi,
    factoryAbi,
  });

  // Create coordinator
  const coordinator = new Coordinator({
    config,
    evmClient,
    htlcManager,
  });

  await coordinator.initialize();
  return coordinator;
}

/**
 * CLI Commands
 */
const commands = {
  async init() {
    logger.info("Initializing coordinator...");
    
    try {
      const coordinator = await createCoordinator();
      const config = coordinator.getConfig();
      
      logger.info("Coordinator initialized successfully", {
        evmRpc: config.evmConfig.rpcUrl,
        htlcFactory: config.evmConfig.htlcFactoryAddress,
        tokenContract: config.evmConfig.tokenAddress,
      });

      const liquidity = await coordinator.getLiquidityStatus();
      for (const status of liquidity) {
        logger.info(`${status.chain} liquidity`, {
          balance: status.balance.toString(),
          available: status.available.toString(),
          locked: status.locked.toString(),
        });
      }
    } catch (error) {
      logger.error("Failed to initialize", { error });
      Deno.exit(1);
    }
  },

  async fund(args: any) {
    const amount = BigInt(args.amount || "10000000000"); // Default 10,000 tokens
    
    logger.info("Funding coordinator wallets", { amount: amount.toString() });
    
    try {
      const coordinator = await createCoordinator();
      const result = await coordinator.fundWallets(amount);
      
      if (result.evm) {
        logger.info("EVM funding transaction", { txHash: result.evm });
      }
      if (result.solana) {
        logger.info("Solana funding transaction", { txHash: result.solana });
      }
    } catch (error) {
      logger.error("Failed to fund wallets", { error });
      Deno.exit(1);
    }
  },

  async swap(args: any) {
    const from = args.from || "evm";
    const to = args.to || "solana";
    const amount = BigInt(args.amount || "1000000"); // Default 1 token
    const sender = args.sender || Deno.env.get("evm_user_address") || "";
    const receiver = args.receiver || Deno.env.get("svm_user_address") || "";

    if (!sender || !receiver) {
      logger.error("Sender and receiver addresses required");
      Deno.exit(1);
    }

    logger.info("Initiating swap", {
      from,
      to,
      amount: amount.toString(),
      sender,
      receiver,
    });

    try {
      const coordinator = await createCoordinator();
      
      const request: SwapRequest = {
        from: from as ChainType,
        to: to as ChainType,
        amount,
        sender,
        receiver,
      };

      const swap = await coordinator.initiateSwap(request);
      
      logger.info("Swap initiated", {
        swapId: swap.id,
        state: swap.state,
        hashLock: swap.hashLock,
      });

      // Start monitoring
      await coordinator.startMonitoring();

      // Monitor swap progress
      let lastState = swap.state;
      const checkInterval = setInterval(async () => {
        const status = await coordinator.getSwapStatus(swap.id);
        if (!status) {
          clearInterval(checkInterval);
          return;
        }

        if (status.state !== lastState) {
          logger.info("Swap state changed", {
            swapId: swap.id,
            oldState: lastState,
            newState: status.state,
          });
          lastState = status.state;
        }

        if (["completed", "failed", "refunded"].includes(status.state)) {
          clearInterval(checkInterval);
          logger.info("Swap finished", {
            swapId: swap.id,
            finalState: status.state,
            error: status.error,
          });
          await coordinator.shutdown();
          Deno.exit(status.state === "completed" ? 0 : 1);
        }
      }, 2000);

    } catch (error) {
      logger.error("Failed to initiate swap", { error });
      Deno.exit(1);
    }
  },

  async monitor() {
    logger.info("Starting swap monitor...");
    
    try {
      const coordinator = await createCoordinator();
      await coordinator.startMonitoring();

      // Display active swaps periodically
      setInterval(async () => {
        const activeSwaps = await coordinator.getActiveSwaps();
        const stats = await coordinator.getStats();

        console.clear();
        logger.info("Coordinator Statistics", {
          totalSwaps: stats.totalSwaps,
          activeSwaps: stats.activeSwaps,
          completedSwaps: stats.completedSwaps,
          failedSwaps: stats.failedSwaps,
          successRate: `${stats.successRate.toFixed(2)}%`,
        });

        if (activeSwaps.length > 0) {
          logger.info(`Active swaps: ${activeSwaps.length}`);
          for (const swap of activeSwaps) {
            logger.info(`Swap ${swap.id}`, {
              state: swap.state,
              from: swap.request.from,
              to: swap.request.to,
              amount: swap.request.amount.toString(),
              age: `${Math.floor((Date.now() - swap.createdAt) / 1000)}s`,
            });
          }
        } else {
          logger.info("No active swaps");
        }
      }, 5000);

      // Keep process running
      await new Promise(() => {});
    } catch (error) {
      logger.error("Failed to start monitor", { error });
      Deno.exit(1);
    }
  },

  async recover() {
    logger.info("Recovering stuck swaps...");
    
    try {
      const coordinator = await createCoordinator();
      const recovered = await coordinator.recoverStuckSwaps();
      
      logger.info(`Recovered ${recovered} stuck swaps`);
      
      await coordinator.shutdown();
    } catch (error) {
      logger.error("Failed to recover swaps", { error });
      Deno.exit(1);
    }
  },

  async status(args: any) {
    const swapId = args.id;
    if (!swapId) {
      logger.error("Swap ID required");
      Deno.exit(1);
    }

    try {
      const coordinator = await createCoordinator();
      const status = await coordinator.getSwapStatus(swapId);
      
      if (!status) {
        logger.error("Swap not found", { swapId });
        Deno.exit(1);
      }

      logger.info("Swap status", {
        id: status.id,
        state: status.state,
        from: status.request.from,
        to: status.request.to,
        amount: status.request.amount.toString(),
        createdAt: new Date(status.createdAt).toISOString(),
        updatedAt: new Date(status.updatedAt).toISOString(),
        error: status.error,
      });

      if (status.sourceHTLC) {
        logger.info("Source HTLC", {
          address: status.sourceHTLC.contractAddress,
          txHash: status.sourceHTLC.transactionHash,
          withdrawn: status.sourceHTLC.withdrawn,
          refunded: status.sourceHTLC.refunded,
        });
      }

      if (status.destinationHTLC) {
        logger.info("Destination HTLC", {
          address: status.destinationHTLC.contractAddress,
          txHash: status.destinationHTLC.transactionHash,
          withdrawn: status.destinationHTLC.withdrawn,
          refunded: status.destinationHTLC.refunded,
        });
      }

      await coordinator.shutdown();
    } catch (error) {
      logger.error("Failed to get status", { error });
      Deno.exit(1);
    }
  },

  help() {
    console.log(`
Bridge-less CLI - Coordinator for HTLC cross-chain swaps

Usage: deno run --allow-net --allow-env --allow-read main.ts <command> [options]

Commands:
  init                  Initialize coordinator and check configuration
  fund [--amount]       Fund coordinator wallets with tokens
  swap [options]        Execute a cross-chain swap
    --from <chain>      Source chain (evm, solana)
    --to <chain>        Destination chain (evm, solana)
    --amount <value>    Amount to swap (in smallest unit)
    --sender <address>  Sender address
    --receiver <addr>   Receiver address
  monitor               Monitor active swaps
  recover               Recover stuck swaps
  status --id <swapId>  Get status of a specific swap
  help                  Show this help message

Examples:
  # Initialize and check config
  deno run --allow-net --allow-env --allow-read main.ts init

  # Fund coordinator with 10,000 tokens
  deno run --allow-net --allow-env --allow-read main.ts fund --amount 10000000000

  # Execute a swap
  deno run --allow-net --allow-env --allow-read main.ts swap --from evm --to solana --amount 1000000

  # Monitor swaps
  deno run --allow-net --allow-env --allow-read main.ts monitor

  # Check swap status
  deno run --allow-net --allow-env --allow-read main.ts status --id abc123
    `);
  }
};

// Main CLI handler
if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["from", "to", "amount", "sender", "receiver", "id"],
    boolean: ["help"],
    default: {
      help: false,
    },
  });

  const command = args._[0]?.toString() || "help";

  if (command in commands) {
    await (commands as any)[command](args);
  } else {
    logger.error(`Unknown command: ${command}`);
    commands.help();
    Deno.exit(1);
  }
}
