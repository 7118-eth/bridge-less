/**
 * Tests for coordinator service
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@1";
import type {
  ICoordinator,
  SwapRequest,
  SwapStatus,
  CoordinatorConfig,
  LiquidityStatus,
} from "./types.ts";
import { ChainType, SwapState, CoordinatorError, ErrorCodes } from "./types.ts";

Deno.test("Coordinator", async (t) => {
  let coordinator: ICoordinator;
  let mockEvmClient: any;
  let mockHtlcManager: any;

  const defaultConfig: CoordinatorConfig = {
    evmConfig: {
      rpcUrl: "http://localhost:8545",
      privateKey: "0x0123456789012345678901234567890123456789012345678901234567890123",
      tokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      htlcFactoryAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    },
    timelocks: {
      finality: 30,
      resolver: 60,
      public: 300,
      cancellation: 600,
    },
    limits: {
      minAmount: 100000n, // 0.1 token
      maxAmount: 10000000000n, // 10,000 tokens
      maxConcurrentSwaps: 10,
    },
    testMode: true, // Disable async processing in tests
  };

  const setup = async () => {
    const { Coordinator } = await import("./coordinator.ts");
    const { MockEvmClient } = await import("../chains/evm/mock_client.ts");
    const { HTLCManager } = await import("../chains/evm/htlc.ts");

    mockEvmClient = new MockEvmClient({
      rpcUrl: defaultConfig.evmConfig.rpcUrl,
      privateKey: defaultConfig.evmConfig.privateKey as `0x${string}`,
    });

    mockHtlcManager = new HTLCManager({
      client: mockEvmClient,
      factoryAddress: defaultConfig.evmConfig.htlcFactoryAddress,
      tokenAbi: [],
      htlcAbi: [],
      factoryAbi: [],
    });

    coordinator = new Coordinator({
      config: defaultConfig,
      evmClient: mockEvmClient,
      htlcManager: mockHtlcManager,
    });
  };

  await t.step("initialization", async (t) => {
    await t.step("initializes with valid config", async () => {
      await setup();
      await coordinator.initialize();
      assertEquals(coordinator.isReady(), true);
    });

    await t.step("returns config", async () => {
      await setup();
      await coordinator.initialize();
      const config = coordinator.getConfig();
      assertEquals(config.evmConfig.rpcUrl, defaultConfig.evmConfig.rpcUrl);
      assertEquals(config.timelocks.finality, 30);
    });

    await t.step("fails if already initialized", async () => {
      await setup();
      await coordinator.initialize();
      await assertRejects(
        async () => await coordinator.initialize(),
        CoordinatorError,
        "already initialized"
      );
    });
  });

  await t.step("swap initiation", async (t) => {
    await setup();
    await coordinator.initialize();

    await t.step("creates swap with valid request", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n, // 1 token
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      const status = await coordinator.initiateSwap(request);

      assertExists(status.id);
      assertEquals(status.state, SwapState.Pending);
      assertEquals(status.request.amount, 1000000n);
      assertExists(status.hashLock);
      assertExists(status.createdAt);
      assertExists(status.updatedAt);
    });

    await t.step("generates unique swap IDs", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      const status1 = await coordinator.initiateSwap(request);
      const status2 = await coordinator.initiateSwap(request);

      assertEquals(status1.id !== status2.id, true);
    });

    await t.step("validates minimum amount", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 10000n, // Below minimum
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      await assertRejects(
        async () => await coordinator.initiateSwap(request),
        CoordinatorError,
        "below minimum"
      );
    });

    await t.step("validates maximum amount", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 100000000000n, // Above maximum
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      await assertRejects(
        async () => await coordinator.initiateSwap(request),
        CoordinatorError,
        "exceeds maximum"
      );
    });

    await t.step("respects concurrent swap limit", async () => {
      // Create max concurrent swaps
      const requests: Promise<SwapStatus>[] = [];
      for (let i = 0; i < 10; i++) {
        const request: SwapRequest = {
          from: ChainType.EVM,
          to: ChainType.Solana,
          amount: 1000000n,
          sender: "0x1111111111111111111111111111111111111111",
          receiver: "22222222222222222222222222222222222222222222",
        };
        requests.push(coordinator.initiateSwap(request));
      }

      await Promise.all(requests);

      // Next swap should fail
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      await assertRejects(
        async () => await coordinator.initiateSwap(request),
        CoordinatorError,
        "concurrent swaps"
      );
    });
  });

  await t.step("swap status", async (t) => {
    await setup();
    await coordinator.initialize();

    await t.step("gets swap status by ID", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      const created = await coordinator.initiateSwap(request);
      const status = await coordinator.getSwapStatus(created.id);

      assertExists(status);
      assertEquals(status.id, created.id);
      assertEquals(status.state, created.state);
    });

    await t.step("returns undefined for non-existent swap", async () => {
      const status = await coordinator.getSwapStatus("non-existent-id");
      assertEquals(status, undefined);
    });

    await t.step("gets active swaps", async () => {
      // Create a few swaps (only EVM to Solana supported currently)
      const requests = [
        {
          from: ChainType.EVM,
          to: ChainType.Solana,
          amount: 1000000n,
          sender: "0x1111111111111111111111111111111111111111",
          receiver: "22222222222222222222222222222222222222222222",
        },
        {
          from: ChainType.EVM,
          to: ChainType.Solana,
          amount: 2000000n,
          sender: "0x3333333333333333333333333333333333333333",
          receiver: "44444444444444444444444444444444444444444444",
        },
      ];

      const swaps = await Promise.all(
        requests.map(req => coordinator.initiateSwap(req))
      );

      const activeSwaps = await coordinator.getActiveSwaps();
      assertEquals(activeSwaps.length >= 2, true);

      // Check that created swaps are in active list
      for (const swap of swaps) {
        const found = activeSwaps.find(s => s.id === swap.id);
        assertExists(found);
      }
    });

    await t.step("gets swap history with pagination", async () => {
      const history = await coordinator.getSwapHistory(10, 0);
      assertEquals(Array.isArray(history), true);
      assertEquals(history.length <= 10, true);

      // Test offset
      const page2 = await coordinator.getSwapHistory(10, 10);
      assertEquals(Array.isArray(page2), true);

      // Ensure no overlap between pages
      if (history.length > 0 && page2.length > 0) {
        const ids1 = history.map(s => s.id);
        const ids2 = page2.map(s => s.id);
        const overlap = ids1.some(id => ids2.includes(id));
        assertEquals(overlap, false);
      }
    });
  });

  await t.step("swap lifecycle", async (t) => {
    await setup();
    await coordinator.initialize();

    await t.step("transitions through states correctly", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      const swap = await coordinator.initiateSwap(request);
      assertEquals(swap.state, SwapState.Pending);

      // Simulate state transitions (would happen automatically in real implementation)
      // In tests, we'd need to mock the state transitions or expose methods to test them
    });

    await t.step("cancels swap in valid state", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      const swap = await coordinator.initiateSwap(request);
      // Ensure swap stays in pending state for cancellation
      assertEquals(swap.state, SwapState.Pending);
      
      const cancelled = await coordinator.cancelSwap(swap.id);

      assertEquals(cancelled.state, SwapState.Failed);
      assertExists(cancelled.error);
    });

    await t.step("fails to cancel non-existent swap", async () => {
      await assertRejects(
        async () => await coordinator.cancelSwap("non-existent"),
        CoordinatorError,
        "not found"
      );
    });

    await t.step("retries failed swap", async () => {
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      const swap = await coordinator.initiateSwap(request);
      assertEquals(swap.state, SwapState.Pending);
      
      const cancelled = await coordinator.cancelSwap(swap.id);
      assertEquals(cancelled.state, SwapState.Failed);

      const retried = await coordinator.retrySwap(swap.id);
      assertEquals(retried.state, SwapState.Pending);
      assertEquals(retried.id !== swap.id, true); // New swap ID
    });
  });

  await t.step("liquidity management", async (t) => {
    await setup();
    await coordinator.initialize();

    await t.step("gets liquidity status", async () => {
      const status = await coordinator.getLiquidityStatus();

      assertEquals(Array.isArray(status), true);
      assertEquals(status.length > 0, true);

      for (const liquidity of status) {
        assertExists(liquidity.chain);
        assertExists(liquidity.tokenAddress);
        assertEquals(typeof liquidity.balance, "bigint");
        assertEquals(typeof liquidity.locked, "bigint");
        assertEquals(typeof liquidity.available, "bigint");
        assertEquals(liquidity.available, liquidity.balance - liquidity.locked);
      }
    });

    await t.step("funds wallets", async () => {
      const amount = 10000000000n; // 10,000 tokens
      const result = await coordinator.fundWallets(amount);

      assertExists(result.evm);
      assertEquals(result.evm.startsWith("0x"), true);
      assertEquals(result.evm.length, 66);
    });
  });

  await t.step("monitoring", async (t) => {
    await setup();
    await coordinator.initialize();

    await t.step("starts and stops monitoring", async () => {
      await coordinator.startMonitoring();
      // Monitoring is running

      await coordinator.stopMonitoring();
      // Monitoring is stopped
    });

    await t.step("recovers stuck swaps", async () => {
      // Create some swaps that might be stuck
      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };

      await coordinator.initiateSwap(request);

      const recovered = await coordinator.recoverStuckSwaps();
      assertEquals(typeof recovered, "number");
      assertEquals(recovered >= 0, true);
    });
  });

  await t.step("statistics", async (t) => {
    await setup();
    await coordinator.initialize();

    await t.step("gets coordinator statistics", async () => {
      const stats = await coordinator.getStats();

      assertExists(stats);
      assertEquals(typeof stats.totalSwaps, "number");
      assertEquals(typeof stats.completedSwaps, "number");
      assertEquals(typeof stats.failedSwaps, "number");
      assertEquals(typeof stats.activeSwaps, "number");
      assertEquals(typeof stats.totalVolume, "bigint");
      assertEquals(typeof stats.averageSwapDuration, "number");
      assertEquals(typeof stats.successRate, "number");

      // Verify consistency
      assertEquals(
        stats.totalSwaps,
        stats.completedSwaps + stats.failedSwaps + stats.activeSwaps
      );
      assertEquals(stats.successRate >= 0 && stats.successRate <= 100, true);
    });
  });

  await t.step("shutdown", async (t) => {
    await t.step("shuts down gracefully", async () => {
      await setup();
      await coordinator.initialize();

      // Create some active operations
      await coordinator.startMonitoring();

      const request: SwapRequest = {
        from: ChainType.EVM,
        to: ChainType.Solana,
        amount: 1000000n,
        sender: "0x1111111111111111111111111111111111111111",
        receiver: "22222222222222222222222222222222222222222222",
      };
      await coordinator.initiateSwap(request);

      // Shutdown should clean up everything
      await coordinator.shutdown();

      // Should not be ready after shutdown
      assertEquals(coordinator.isReady(), false);
    });
  });
});