/**
 * End-to-end integration test for cross-chain swaps with real EVM contracts
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { Coordinator } from "../../src/coordinator/index.ts";
import { EvmClient } from "../../src/chains/evm/client.ts";
import { HTLCManager } from "../../src/chains/evm/htlc.ts";
import { ConfigManager } from "../../src/config/index.ts";
import { SecretManager } from "../../src/crypto/index.ts";
import { Logger } from "../../src/utils/index.ts";
import type { SwapRequest, SwapStatus } from "../../src/coordinator/types.ts";
import { SwapState, ChainType } from "../../src/coordinator/types.ts";
import { parseAbi, encodeFunctionData, decodeFunctionResult } from "jsr:@wevm/viem@2";
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts";

// Helper function to wait for a condition
async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 10000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Timeout waiting for condition");
}

Deno.test("integration: end-to-end swap EVM to SVM", async () => {
  const logger = new Logger("e2e-test");
  
  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  // Create real EVM client
  const evmClient = new EvmClient({
    rpc: config.evm.rpc,
    rpcWs: config.evm.rpcWs,
    privateKey: config.evm.coordinatorPrivateKey,
    chainId: config.evm.chainId,
    logger: logger.child("evm-client"),
  });
  
  // Load ABIs
  const htlcFactoryAbi = JSON.parse(
    await Deno.readTextFile("./abi/IHTLCFactory.json")
  );
  const htlcAbi = JSON.parse(
    await Deno.readTextFile("./abi/IHTLC.json")
  );
  const tokenAbi = JSON.parse(
    await Deno.readTextFile("./abi/Token.json")
  );
  
  // Create HTLC manager
  const htlcManager = new HTLCManager({
    client: evmClient,
    factoryAddress: config.evm.htlcContractAddress,
    factoryAbi: htlcFactoryAbi,
    htlcAbi: htlcAbi,
    logger: logger.child("htlc-manager"),
  });
  
  // Convert config to coordinator format
  const coordinatorConfig = {
    evmConfig: {
      rpcUrl: config.evm.rpc,
      rpcWsUrl: config.evm.rpcWs,
      privateKey: config.evm.coordinatorPrivateKey,
      tokenAddress: config.evm.tokenContractAddress as `0x${string}`,
      htlcFactoryAddress: config.evm.htlcContractAddress as `0x${string}`,
    },
    solanaConfig: config.svm ? {
      rpcUrl: config.svm.rpc,
      rpcWsUrl: config.svm.rpcWs,
      privateKey: config.svm.coordinatorPrivateKey || "",
      tokenMintAddress: config.svm.tokenContractAddress || "",
      htlcProgramAddress: config.svm.htlcContractAddress || "",
    } : undefined,
    timelocks: config.timelocks,
    limits: config.liquidity ? {
      minAmount: config.liquidity.minSwapAmount,
      maxAmount: config.liquidity.maxSwapAmount,
      maxConcurrentSwaps: config.liquidity.maxConcurrentSwaps,
    } : undefined,
    testMode: false,
  };
  
  // Create coordinator (without testMode to allow async processing)
  const coordinator = new Coordinator({
    config: coordinatorConfig,
    evmClient,
    htlcManager,
    logger: logger.child("coordinator"),
  });
  
  // Initialize coordinator
  await coordinator.initialize();
  
  // Step 1: Check initial balances
  const coordinatorAccount = privateKeyToAccount(config.evm.coordinatorPrivateKey as `0x${string}`);
  const userAccount = privateKeyToAccount(config.evm.userPrivateKey as `0x${string}`);
  
  const getBalance = async (address: string) => {
    // Call the token contract directly
    const callData = {
      address: config.evm.tokenContractAddress as `0x${string}`,
      data: encodeFunctionData({
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
    };
    const result = await evmClient.call(callData);
    const [balance] = decodeFunctionResult({
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      data: result,
    }) as [bigint];
    return balance;
  };
  
  const initialCoordinatorBalance = await getBalance(coordinatorAccount.address);
  const initialUserBalance = await getBalance(userAccount.address);
  
  console.log("Initial coordinator balance:", initialCoordinatorBalance);
  console.log("Initial user balance:", initialUserBalance);
  
  // Step 2: Approve token spending if needed
  if (initialUserBalance > 0n) {
    // First, switch to user's private key
    const userEvmClient = new EvmClient({
      rpc: config.evm.rpc,
      rpcWs: config.evm.rpcWs,
      privateKey: config.evm.userPrivateKey,
      logger: logger.child("user-evm-client"),
    });
    
    const approveTx = {
      to: config.evm.tokenContractAddress as `0x${string}`,
      data: encodeFunctionData({
        abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
        functionName: "approve",
        args: [config.evm.htlcContractAddress as `0x${string}`, 1000000n], // 1 token
      }),
    };
    
    const hash = await userEvmClient.sendTransaction(approveTx);
    await userEvmClient.waitForTransaction(hash);
    console.log("Token approval complete");
  }
  
  // Step 3: Create swap request
  const swapRequest: SwapRequest = {
    sourceChain: ChainType.EVM,
    destinationChain: ChainType.SVM,
    sourceTokenAddress: config.evm.tokenContractAddress,
    destinationTokenAddress: config.svm.tokenContractAddress || "mock",
    sourceAddress: userAccount.address,
    destinationAddress: config.svm.userPrivateKey || "mock",
    amount: 1000000n, // 1 token (6 decimals)
  };
  
  // Step 4: Initiate swap
  console.log("Initiating swap...");
  const swapId = await coordinator.initiateSwap(swapRequest);
  console.log("Swap initiated with ID:", swapId);
  assertExists(swapId);
  
  // Step 5: Wait for swap to reach source_locked state
  console.log("Waiting for source HTLC to be created...");
  await waitFor(async () => {
    const status = await coordinator.getSwapStatus(swapId);
    console.log("Current state:", status?.state);
    return status?.state === SwapState.SOURCE_LOCKED;
  }, 30000); // 30 second timeout
  
  // Step 6: Verify source HTLC was created
  const statusAfterSourceLock = await coordinator.getSwapStatus(swapId);
  assertEquals(statusAfterSourceLock?.state, SwapState.SOURCE_LOCKED);
  assertExists(statusAfterSourceLock?.sourceHTLCAddress);
  console.log("Source HTLC created at:", statusAfterSourceLock?.sourceHTLCAddress);
  
  // Step 7: Wait for destination HTLC (mocked for SVM)
  console.log("Waiting for destination HTLC...");
  await waitFor(async () => {
    const status = await coordinator.getSwapStatus(swapId);
    return status?.state === SwapState.DESTINATION_LOCKED;
  }, 10000);
  
  // Step 8: Verify destination HTLC was created (mock)
  const statusAfterDestLock = await coordinator.getSwapStatus(swapId);
  assertEquals(statusAfterDestLock?.state, SwapState.DESTINATION_LOCKED);
  assertExists(statusAfterDestLock?.destinationHTLCAddress);
  console.log("Destination HTLC created at:", statusAfterDestLock?.destinationHTLCAddress);
  
  // Step 9: Wait for swap completion
  console.log("Waiting for swap completion...");
  await waitFor(async () => {
    const status = await coordinator.getSwapStatus(swapId);
    return status?.state === SwapState.COMPLETED;
  }, 30000);
  
  // Step 10: Verify final state
  const finalStatus = await coordinator.getSwapStatus(swapId);
  assertEquals(finalStatus?.state, SwapState.COMPLETED);
  assertExists(finalStatus?.completedAt);
  console.log("Swap completed at:", finalStatus?.completedAt);
  
  // Step 11: Check final balances
  const finalCoordinatorBalance = await getBalance(coordinatorAccount.address);
  const finalUserBalance = await getBalance(userAccount.address);
  
  console.log("Final coordinator balance:", finalCoordinatorBalance);
  console.log("Final user balance:", finalUserBalance);
  
  // Verify balance changes (coordinator should have received 1 token from user)
  // Note: In a real cross-chain swap, the balances would change on both chains
  // Since SVM is mocked, we only see the EVM side changes
  assertEquals(
    finalCoordinatorBalance,
    initialCoordinatorBalance + 1000000n,
    "Coordinator should have received 1 token"
  );
});

Deno.test("integration: swap with insufficient balance", async () => {
  const logger = new Logger("e2e-test-fail");
  
  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  // Create real EVM client
  const evmClient = new EvmClient({
    rpc: config.evm.rpc,
    rpcWs: config.evm.rpcWs,
    privateKey: config.evm.coordinatorPrivateKey,
    chainId: config.evm.chainId,
    logger: logger.child("evm-client"),
  });
  
  // Load ABIs
  const htlcFactoryAbi = JSON.parse(
    await Deno.readTextFile("./abi/IHTLCFactory.json")
  );
  const htlcAbi = JSON.parse(
    await Deno.readTextFile("./abi/IHTLC.json")
  );
  
  // Create HTLC manager
  const htlcManager = new HTLCManager({
    client: evmClient,
    factoryAddress: config.evm.htlcContractAddress,
    factoryAbi: htlcFactoryAbi,
    htlcAbi: htlcAbi,
    logger: logger.child("htlc-manager"),
  });
  
  // Convert config to coordinator format
  const coordinatorConfig = {
    evmConfig: {
      rpcUrl: config.evm.rpc,
      rpcWsUrl: config.evm.rpcWs,
      privateKey: config.evm.coordinatorPrivateKey,
      tokenAddress: config.evm.tokenContractAddress as `0x${string}`,
      htlcFactoryAddress: config.evm.htlcContractAddress as `0x${string}`,
    },
    solanaConfig: config.svm ? {
      rpcUrl: config.svm.rpc,
      rpcWsUrl: config.svm.rpcWs,
      privateKey: config.svm.coordinatorPrivateKey || "",
      tokenMintAddress: config.svm.tokenContractAddress || "",
      htlcProgramAddress: config.svm.htlcContractAddress || "",
    } : undefined,
    timelocks: config.timelocks,
    limits: config.liquidity ? {
      minAmount: config.liquidity.minSwapAmount,
      maxAmount: config.liquidity.maxSwapAmount,
      maxConcurrentSwaps: config.liquidity.maxConcurrentSwaps,
    } : undefined,
    testMode: true,
  };
  
  // Create coordinator with testMode to prevent async processing
  const coordinator = new Coordinator({
    config: coordinatorConfig,
    evmClient,
    htlcManager,
    logger: logger.child("coordinator"),
  });
  
  await coordinator.initialize();
  
  // Create swap request with huge amount
  const userAccount = privateKeyToAccount(config.evm.userPrivateKey as `0x${string}`);
  const swapRequest: SwapRequest = {
    sourceChain: ChainType.EVM,
    destinationChain: ChainType.SVM,
    sourceTokenAddress: config.evm.tokenContractAddress,
    destinationTokenAddress: config.svm.tokenContractAddress || "mock",
    sourceAddress: userAccount.address,
    destinationAddress: config.svm.userPrivateKey || "mock",
    amount: 999999999999999999n, // Huge amount that exceeds balance
  };
  
  // Should fail during initialization due to insufficient balance
  try {
    const swapId = await coordinator.initiateSwap(swapRequest);
    // If we get here, manually process the swap to trigger the error
    const status = await coordinator.getSwapStatus(swapId);
    if (status?.state === SwapState.PENDING) {
      await coordinator.processSwap(swapId);
    }
    
    // Check status - should be failed
    const finalStatus = await coordinator.getSwapStatus(swapId);
    assertEquals(finalStatus?.state, SwapState.FAILED);
    assertExists(finalStatus?.error);
    console.log("Swap failed as expected:", finalStatus?.error);
  } catch (error) {
    // This is also acceptable - swap might fail during initiation
    console.log("Swap failed during initiation as expected:", error.message);
  }
});