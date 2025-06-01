/**
 * Integration test to verify EVM RPC connection and contract accessibility
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import * as viem from "jsr:@wevm/viem@2";
import { createPublicClient, createWalletClient, http, parseAbi } from "jsr:@wevm/viem@2";
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts";
import { localhost } from "jsr:@wevm/viem@2/chains";
import { ConfigManager } from "../../src/config/index.ts";

Deno.test("integration: verify EVM RPC connection", async () => {
  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  console.log("Testing connection to:", config.evm.rpc);
  
  // Create public client
  const publicClient = createPublicClient({
    chain: localhost,
    transport: http(config.evm.rpc),
  });
  
  // Test 1: Get chain ID
  const chainId = await publicClient.getChainId();
  console.log("Chain ID:", chainId);
  assertEquals(chainId, 31337); // Hardhat/Anvil default chain ID
  
  // Test 2: Get latest block
  const block = await publicClient.getBlockNumber();
  console.log("Latest block:", block);
  assertExists(block);
});

Deno.test("integration: verify deployed contracts", async () => {
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  const publicClient = createPublicClient({
    chain: localhost,
    transport: http(config.evm.rpc),
  });
  
  // Test 1: Check token contract
  const tokenCode = await publicClient.getCode({
    address: config.evm.tokenContractAddress as `0x${string}`,
  });
  console.log("Token contract code length:", tokenCode?.length);
  assertExists(tokenCode);
  assertEquals(tokenCode !== "0x" && tokenCode !== undefined, true, "Token contract not deployed");
  
  // Test 2: Check HTLC factory contract
  const htlcCode = await publicClient.getCode({
    address: config.evm.htlcContractAddress as `0x${string}`,
  });
  console.log("HTLC factory contract code length:", htlcCode?.length);
  assertExists(htlcCode);
  assertEquals(htlcCode !== "0x" && htlcCode !== undefined, true, "HTLC factory contract not deployed");
});

Deno.test("integration: verify account balances", async () => {
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  const publicClient = createPublicClient({
    chain: localhost,
    transport: http(config.evm.rpc),
  });
  
  // Get coordinator account
  const coordinatorAccount = privateKeyToAccount(config.evm.coordinatorPrivateKey as `0x${string}`);
  const userAccount = privateKeyToAccount(config.evm.userPrivateKey as `0x${string}`);
  
  // Check ETH balances
  const coordinatorBalance = await publicClient.getBalance({
    address: coordinatorAccount.address,
  });
  console.log("Coordinator ETH balance:", coordinatorBalance);
  assertExists(coordinatorBalance);
  
  const userBalance = await publicClient.getBalance({
    address: userAccount.address,
  });
  console.log("User ETH balance:", userBalance);
  assertExists(userBalance);
  
  // Check token balances (using balanceOf function)
  const tokenAbi = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
  ]);
  
  const coordinatorTokenBalance = await publicClient.readContract({
    address: config.evm.tokenContractAddress as `0x${string}`,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [coordinatorAccount.address],
  });
  console.log("Coordinator token balance:", coordinatorTokenBalance);
  assertExists(coordinatorTokenBalance);
  
  const userTokenBalance = await publicClient.readContract({
    address: config.evm.tokenContractAddress as `0x${string}`,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [userAccount.address],
  });
  console.log("User token balance:", userTokenBalance);
  assertExists(userTokenBalance);
});