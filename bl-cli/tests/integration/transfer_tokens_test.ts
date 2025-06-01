/**
 * Test to transfer tokens from coordinator to user
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { ConfigManager } from "../../src/config/index.ts";
import { EvmClient } from "../../src/chains/evm/index.ts";
import { Logger } from "../../src/utils/index.ts";
import { parseAbi, encodeFunctionData } from "jsr:@wevm/viem@2";
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts";

Deno.test("integration: transfer tokens from coordinator to user", async () => {
  const logger = new Logger("transfer-test");
  
  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  // Create EVM client with coordinator's private key
  const evmClient = new EvmClient({
    rpc: config.evm.rpc,
    rpcWs: config.evm.rpcWs,
    privateKey: config.evm.coordinatorPrivateKey,
    chainId: config.evm.chainId || 31337,
    logger: logger.child("evm-client"),
  });
  
  const coordinatorAccount = privateKeyToAccount(config.evm.coordinatorPrivateKey as `0x${string}`);
  const userAccount = privateKeyToAccount(config.evm.userPrivateKey as `0x${string}`);
  
  logger.info("Transferring tokens", {
    from: coordinatorAccount.address,
    to: userAccount.address,
    amount: "1000000000" // 1000 tokens
  });
  
  // Transfer tokens
  const transferTx = {
    to: config.evm.tokenContractAddress as `0x${string}`,
    data: encodeFunctionData({
      abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
      functionName: "transfer",
      args: [userAccount.address as `0x${string}`, 1000000000n], // 1000 tokens
    }),
  };
  
  const hash = await evmClient.sendTransaction(transferTx);
  logger.info("Transfer transaction sent", { hash });
  
  const receipt = await evmClient.waitForTransaction(hash);
  logger.info("Transfer confirmed", { 
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString()
  });
  
  assertEquals(receipt.status, 1, "Transfer should succeed");
  
  // Verify balance after transfer
  const getBalance = async (address: string) => {
    const callData = {
      address: config.evm.tokenContractAddress as `0x${string}`,
      data: encodeFunctionData({
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
    };
    const result = await evmClient.call(callData);
    // Simple decode for uint256
    const balance = BigInt(result);
    return balance;
  };
  
  const userBalance = await getBalance(userAccount.address);
  logger.info("User balance after transfer", { balance: userBalance.toString() });
  
  assertEquals(userBalance >= 1000000000n, true, "User should have at least 1000 tokens");
});