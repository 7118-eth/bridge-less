import { assertEquals, assertRejects, assertExists } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import type {
  IEvmClient,
  EvmClientConfig,
  TransactionRequest,
  TransactionReceipt,
  Block,
  Log,
  EventFilter,
  Address,
  Hash,
} from "./types.ts";
import { EvmError } from "./types.ts";

/**
 * Tests for EVM client
 */

Deno.test("EvmClient", async (t) => {
  let client: IEvmClient;
  
  // This will be set when we import the actual implementation
  const setup = async (config?: Partial<EvmClientConfig>) => {
    const { EvmClient } = await import("./client.ts");
    client = new EvmClient({
      rpcUrl: "http://localhost:8545",
      chainId: 1,
      privateKey: "0x0123456789012345678901234567890123456789012345678901234567890123",
      ...config,
    });
  };

  await t.step("constructor", async (t) => {
    await t.step("creates client with valid config", async () => {
      await setup();
      assertExists(client);
    });

    await t.step("creates client without private key", async () => {
      await setup({ privateKey: undefined });
      assertExists(client);
      assertEquals(client.getAddress(), undefined);
    });

    await t.step("validates private key format", async () => {
      await assertRejects(
        async () => await setup({ privateKey: "invalid-key" as any }),
        EvmError,
        "Invalid private key format"
      );
    });
  });

  await t.step("getChainId", async (t) => {
    await setup();

    await t.step("returns configured chain ID", async () => {
      const chainId = await client.getChainId();
      assertEquals(chainId, 1);
    });
  });

  await t.step("getBlockNumber", async (t) => {
    await setup();

    await t.step("returns current block number", async () => {
      // Mock implementation will return a test value
      const blockNumber = await client.getBlockNumber();
      assertEquals(typeof blockNumber, "bigint");
      assertEquals(blockNumber > 0n, true);
    });
  });

  await t.step("getBlock", async (t) => {
    await setup();

    await t.step("gets block by number", async () => {
      const block = await client.getBlock(1n);
      assertExists(block);
      assertEquals(block.number, 1n);
      assertExists(block.hash);
      assertExists(block.timestamp);
    });

    await t.step("gets block by hash", async () => {
      const blockHash = "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash;
      const block = await client.getBlock(blockHash);
      assertExists(block);
      assertEquals(block.hash, blockHash);
    });
  });

  await t.step("getBalance", async (t) => {
    await setup();

    await t.step("returns account balance", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const balance = await client.getBalance(address);
      assertEquals(typeof balance, "bigint");
      assertEquals(balance >= 0n, true);
    });
  });

  await t.step("getTransactionCount", async (t) => {
    await setup();

    await t.step("returns transaction count", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const count = await client.getTransactionCount(address);
      assertEquals(typeof count, "number");
      assertEquals(count >= 0, true);
    });
  });

  await t.step("getGasPrice", async (t) => {
    await setup();

    await t.step("returns current gas price", async () => {
      const gasPrice = await client.getGasPrice();
      assertEquals(typeof gasPrice, "bigint");
      assertEquals(gasPrice > 0n, true);
    });
  });

  await t.step("estimateGas", async (t) => {
    await setup();

    await t.step("estimates gas for transaction", async () => {
      const tx: TransactionRequest = {
        to: "0x1234567890123456789012345678901234567890" as Address,
        value: 1000000000000000000n, // 1 ETH
      };
      const gas = await client.estimateGas(tx);
      assertEquals(typeof gas, "bigint");
      assertEquals(gas > 0n, true);
    });

    await t.step("estimates gas for contract call", async () => {
      const tx: TransactionRequest = {
        to: "0x1234567890123456789012345678901234567890" as Address,
        data: "0x095ea7b3", // approve function selector
      };
      const gas = await client.estimateGas(tx);
      assertEquals(typeof gas, "bigint");
      assertEquals(gas > 0n, true);
    });
  });

  await t.step("sendTransaction", async (t) => {
    await setup();

    await t.step("sends transaction with private key", async () => {
      const tx: TransactionRequest = {
        to: "0x1234567890123456789012345678901234567890" as Address,
        value: 1000000000000000000n,
      };
      const txHash = await client.sendTransaction(tx);
      assertExists(txHash);
      assertEquals(txHash.startsWith("0x"), true);
      assertEquals(txHash.length, 66);
    });

    await t.step("throws without private key", async () => {
      await setup({ privateKey: undefined });
      const tx: TransactionRequest = {
        to: "0x1234567890123456789012345678901234567890" as Address,
        value: 1000000000000000000n,
      };
      await assertRejects(
        async () => await client.sendTransaction(tx),
        EvmError,
        "Private key required for sending transactions"
      );
    });

    await t.step("handles gas estimation", async () => {
      const tx: TransactionRequest = {
        to: "0x1234567890123456789012345678901234567890" as Address,
        value: 1000000000000000000n,
        // No gas specified - should be estimated
      };
      const txHash = await client.sendTransaction(tx);
      assertExists(txHash);
    });
  });

  await t.step("waitForTransaction", async (t) => {
    await setup();

    await t.step("waits for transaction confirmation", async () => {
      const txHash = "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash;
      const receipt = await client.waitForTransaction(txHash);
      
      assertExists(receipt);
      assertEquals(receipt.transactionHash, txHash);
      assertEquals(receipt.status, 1);
      assertExists(receipt.blockNumber);
      assertExists(receipt.gasUsed);
    });

    await t.step("waits for multiple confirmations", async () => {
      const txHash = "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash;
      const receipt = await client.waitForTransaction(txHash, 3);
      
      assertExists(receipt);
      assertEquals(receipt.transactionHash, txHash);
    });

    await t.step("throws for failed transaction", async () => {
      const txHash = "0xfailed0123456789012345678901234567890123456789012345678901234567" as Hash;
      const receipt = await client.waitForTransaction(txHash);
      assertEquals(receipt.status, 0);
    });
  });

  await t.step("call", async (t) => {
    await setup();

    await t.step("calls contract function", async () => {
      const result = await client.call({
        address: "0x1234567890123456789012345678901234567890" as Address,
        data: "0x18160ddd", // totalSupply()
      });
      
      assertExists(result);
      assertEquals(result.startsWith("0x"), true);
    });

    await t.step("calls with value", async () => {
      const result = await client.call({
        address: "0x1234567890123456789012345678901234567890" as Address,
        data: "0x095ea7b3",
        value: 1000000000000000000n,
      });
      
      assertExists(result);
    });
  });

  await t.step("getLogs", async (t) => {
    await setup();

    await t.step("gets logs with filter", async () => {
      const filter: EventFilter = {
        address: "0x1234567890123456789012345678901234567890" as Address,
        fromBlock: 1000n,
        toBlock: 2000n,
      };
      const logs = await client.getLogs(filter);
      
      assertEquals(Array.isArray(logs), true);
      for (const log of logs) {
        assertExists(log.address);
        assertExists(log.blockNumber);
        assertExists(log.transactionHash);
        assertExists(log.topics);
      }
    });

    await t.step("gets logs with topics", async () => {
      const filter: EventFilter = {
        address: "0x1234567890123456789012345678901234567890" as Address,
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hash, // Transfer event
        ],
      };
      const logs = await client.getLogs(filter);
      
      assertEquals(Array.isArray(logs), true);
    });
  });

  await t.step("getAddress", async (t) => {
    await t.step("returns address when private key is set", async () => {
      await setup();
      const address = client.getAddress();
      assertExists(address);
      assertEquals(address?.startsWith("0x"), true);
      assertEquals(address?.length, 42);
    });

    await t.step("returns undefined without private key", async () => {
      await setup({ privateKey: undefined });
      const address = client.getAddress();
      assertEquals(address, undefined);
    });
  });

  await t.step("subscriptions", async (t) => {
    await t.step("subscribeToBlocks requires WebSocket", async () => {
      await setup();
      await assertRejects(
        async () => await client.subscribeToBlocks(() => {}),
        EvmError,
        "WebSocket URL required for subscriptions"
      );
    });

    await t.step("subscribeToBlocks works with WebSocket", async () => {
      await setup({ rpcWsUrl: "ws://localhost:8545" });
      
      let blockCount = 0;
      const unsubscribe = await client.subscribeToBlocks((block) => {
        assertExists(block.number);
        assertExists(block.hash);
        blockCount++;
      });
      
      assertEquals(typeof unsubscribe, "function");
      
      // Simulate receiving blocks
      await new Promise(resolve => setTimeout(resolve, 100));
      assertEquals(blockCount > 0, true);
      
      unsubscribe();
    });

    await t.step("subscribeToLogs requires WebSocket", async () => {
      await setup();
      const filter: EventFilter = {
        address: "0x1234567890123456789012345678901234567890" as Address,
      };
      await assertRejects(
        async () => await client.subscribeToLogs(filter, () => {}),
        EvmError,
        "WebSocket URL required for subscriptions"
      );
    });

    await t.step("subscribeToLogs works with WebSocket", async () => {
      await setup({ rpcWsUrl: "ws://localhost:8545" });
      
      let logCount = 0;
      const filter: EventFilter = {
        address: "0x1234567890123456789012345678901234567890" as Address,
      };
      
      const unsubscribe = await client.subscribeToLogs(filter, (log) => {
        assertExists(log.address);
        assertExists(log.blockNumber);
        logCount++;
      });
      
      assertEquals(typeof unsubscribe, "function");
      
      // Simulate receiving logs
      await new Promise(resolve => setTimeout(resolve, 100));
      
      unsubscribe();
    });
  });

  await t.step("error handling", async (t) => {
    await setup();

    await t.step("handles RPC errors", async () => {
      // Mock client that throws errors
      const { EvmClient } = await import("./client.ts");
      const errorClient = new EvmClient({
        rpcUrl: "http://invalid-url",
        privateKey: "0x0123456789012345678901234567890123456789012345678901234567890123",
      });

      await assertRejects(
        async () => await errorClient.getBlockNumber(),
        EvmError
      );
    });

    await t.step("retries on transient errors", async () => {
      await setup({
        retryOptions: {
          maxAttempts: 3,
          initialDelay: 10,
        },
      });
      
      // Implementation should retry and eventually succeed
      const blockNumber = await client.getBlockNumber();
      assertExists(blockNumber);
    });
  });
});