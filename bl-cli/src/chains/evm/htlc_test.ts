import { assertEquals, assertRejects, assertExists } from "jsr:@std/assert@1";
import type { 
  IHTLCManager, 
  HTLCParams, 
  HTLCInfo, 
  HTLCEvent,
  Address,
  Hash,
} from "./types.ts";
import { EvmError, HTLCState, HTLCEventType } from "./types.ts";

/**
 * Tests for HTLC manager
 */

Deno.test("HTLCManager", async (t) => {
  let manager: IHTLCManager;
  let mockClient: any;
  
  // This will be set when we import the actual implementation
  const setup = async () => {
    const { HTLCManager } = await import("./htlc.ts");
    const { MockEvmClient } = await import("./mock_client.ts");
    
    mockClient = new MockEvmClient({
      rpcUrl: "http://localhost:8545",
      privateKey: "0x0123456789012345678901234567890123456789012345678901234567890123",
    });
    
    manager = new HTLCManager({
      client: mockClient,
      factoryAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address,
      tokenAbi: [],
      htlcAbi: [],
      factoryAbi: [],
    });
  };

  await t.step("constructor", async (t) => {
    await t.step("creates manager with valid config", async () => {
      await setup();
      assertExists(manager);
    });

    await t.step("returns factory address", async () => {
      await setup();
      const factoryAddress = manager.getFactoryAddress();
      assertEquals(factoryAddress, "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
    });
  });

  await t.step("createHTLC", async (t) => {
    await setup();

    await t.step("creates HTLC with valid params", async () => {
      const params: HTLCParams = {
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n, // 1 token with 6 decimals
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      };

      const result = await manager.createHTLC(params);
      
      assertExists(result.contractAddress);
      assertExists(result.transactionHash);
      assertEquals(result.contractAddress.startsWith("0x"), true);
      assertEquals(result.contractAddress.length, 42);
      assertEquals(result.transactionHash.startsWith("0x"), true);
      assertEquals(result.transactionHash.length, 66);
    });

    await t.step("creates HTLC with resolver", async () => {
      const params: HTLCParams = {
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) + 3600),
        resolver: "0x3333333333333333333333333333333333333333" as Address,
        resolverTimelock: BigInt(Math.floor(Date.now() / 1000) + 1800), // 30 min
      };

      const result = await manager.createHTLC(params);
      assertExists(result.contractAddress);
      assertExists(result.transactionHash);
    });

    await t.step("validates timelock is in future", async () => {
      const params: HTLCParams = {
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
      };

      await assertRejects(
        async () => await manager.createHTLC(params),
        EvmError,
        "Timelock must be in the future"
      );
    });

    await t.step("validates resolver timelock", async () => {
      const now = Math.floor(Date.now() / 1000);
      const params: HTLCParams = {
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(now + 3600),
        resolver: "0x3333333333333333333333333333333333333333" as Address,
        resolverTimelock: BigInt(now + 7200), // After timelock
      };

      await assertRejects(
        async () => await manager.createHTLC(params),
        EvmError,
        "Resolver timelock must be before main timelock"
      );
    });
  });

  await t.step("getHTLCInfo", async (t) => {
    await setup();

    await t.step("gets info for active HTLC", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const info = await manager.getHTLCInfo(contractAddress);
      
      assertExists(info);
      assertEquals(info.contractAddress, contractAddress);
      assertEquals(info.state, HTLCState.Active);
      assertExists(info.sender);
      assertExists(info.receiver);
      assertExists(info.tokenContract);
      assertEquals(info.amount > 0n, true);
      assertExists(info.hashLock);
      assertExists(info.timelock);
    });

    await t.step("gets info for withdrawn HTLC", async () => {
      const contractAddress = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
      const info = await manager.getHTLCInfo(contractAddress);
      
      assertEquals(info.state, HTLCState.Withdrawn);
      assertExists(info.secret);
    });

    await t.step("gets info for refunded HTLC", async () => {
      const contractAddress = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
      const info = await manager.getHTLCInfo(contractAddress);
      
      assertEquals(info.state, HTLCState.Refunded);
    });
  });

  await t.step("withdraw", async (t) => {
    await setup();

    await t.step("withdraws with valid secret", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const secret = "0x1234567890123456789012345678901234567890123456789012345678901234";
      
      const txHash = await manager.withdraw(contractAddress, secret);
      
      assertExists(txHash);
      assertEquals(txHash.startsWith("0x"), true);
      assertEquals(txHash.length, 66);
    });

    await t.step("validates secret length", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const invalidSecret = "0x1234"; // Too short
      
      await assertRejects(
        async () => await manager.withdraw(contractAddress, invalidSecret),
        EvmError,
        "Secret must be 32 bytes"
      );
    });

    await t.step("fails for already withdrawn HTLC", async () => {
      const contractAddress = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
      const secret = "0x1234567890123456789012345678901234567890123456789012345678901234";
      
      await assertRejects(
        async () => await manager.withdraw(contractAddress, secret),
        EvmError,
        "HTLC already withdrawn"
      );
    });
  });

  await t.step("refund", async (t) => {
    await setup();

    await t.step("refunds after timelock", async () => {
      const contractAddress = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      const txHash = await manager.refund(contractAddress);
      
      assertExists(txHash);
      assertEquals(txHash.startsWith("0x"), true);
      assertEquals(txHash.length, 66);
    });

    await t.step("fails before timelock", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      
      await assertRejects(
        async () => await manager.refund(contractAddress),
        EvmError,
        "Timelock not yet expired"
      );
    });

    await t.step("fails for already refunded HTLC", async () => {
      const contractAddress = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
      
      await assertRejects(
        async () => await manager.refund(contractAddress),
        EvmError,
        "HTLC already refunded"
      );
    });
  });

  await t.step("canWithdraw", async (t) => {
    await setup();

    await t.step("returns true for valid secret", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const secret = "0x1234567890123456789012345678901234567890123456789012345678901234";
      
      const canWithdraw = await manager.canWithdraw(contractAddress, secret);
      assertEquals(canWithdraw, true);
    });

    await t.step("returns false for invalid secret", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const wrongSecret = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      
      const canWithdraw = await manager.canWithdraw(contractAddress, wrongSecret);
      assertEquals(canWithdraw, false);
    });

    await t.step("returns false for withdrawn HTLC", async () => {
      const contractAddress = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
      const secret = "0x1234567890123456789012345678901234567890123456789012345678901234";
      
      const canWithdraw = await manager.canWithdraw(contractAddress, secret);
      assertEquals(canWithdraw, false);
    });
  });

  await t.step("canRefund", async (t) => {
    await setup();

    await t.step("returns true after timelock", async () => {
      const contractAddress = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      const canRefund = await manager.canRefund(contractAddress);
      assertEquals(canRefund, true);
    });

    await t.step("returns false before timelock", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const canRefund = await manager.canRefund(contractAddress);
      assertEquals(canRefund, false);
    });

    await t.step("returns false for refunded HTLC", async () => {
      const contractAddress = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
      const canRefund = await manager.canRefund(contractAddress);
      assertEquals(canRefund, false);
    });
  });

  await t.step("getHTLCEvents", async (t) => {
    await setup();

    await t.step("gets all events for HTLC", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const events = await manager.getHTLCEvents(contractAddress);
      
      assertEquals(Array.isArray(events), true);
      assertEquals(events.length > 0, true);
      
      for (const event of events) {
        assertExists(event.type);
        assertEquals(event.contractAddress, contractAddress);
        assertExists(event.transactionHash);
        assertExists(event.blockNumber);
        assertExists(event.data);
      }
    });

    await t.step("gets events from specific block", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const fromBlock = 1000n;
      const events = await manager.getHTLCEvents(contractAddress, fromBlock);
      
      assertEquals(Array.isArray(events), true);
      for (const event of events) {
        assertEquals(event.blockNumber >= fromBlock, true);
      }
    });

    await t.step("identifies event types correctly", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const events = await manager.getHTLCEvents(contractAddress);
      
      const createdEvent = events.find(e => e.type === HTLCEventType.Created);
      assertExists(createdEvent);
      assertExists(createdEvent?.data.sender);
      assertExists(createdEvent?.data.receiver);
      assertExists(createdEvent?.data.amount);
      assertExists(createdEvent?.data.hashLock);
      assertExists(createdEvent?.data.timelock);
    });
  });

  await t.step("watchHTLCEvents", async (t) => {
    await setup();

    await t.step("watches for new events", async () => {
      const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      let eventCount = 0;
      const events: HTLCEvent[] = [];
      
      const unsubscribe = await manager.watchHTLCEvents(
        contractAddress,
        (event) => {
          eventCount++;
          events.push(event);
        }
      );
      
      assertEquals(typeof unsubscribe, "function");
      
      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 100));
      
      assertEquals(eventCount > 0, true);
      assertEquals(events.length, eventCount);
      
      unsubscribe();
    });
  });

  await t.step("getHTLCsByCreator", async (t) => {
    await setup();

    await t.step("gets all HTLCs created by address", async () => {
      const creator = "0x1111111111111111111111111111111111111111" as Address;
      const htlcs = await manager.getHTLCsByCreator(creator);
      
      assertEquals(Array.isArray(htlcs), true);
      assertEquals(htlcs.length > 0, true);
      
      for (const htlc of htlcs) {
        assertEquals(htlc.startsWith("0x"), true);
        assertEquals(htlc.length, 42);
      }
    });

    await t.step("gets HTLCs from specific block", async () => {
      const creator = "0x1111111111111111111111111111111111111111" as Address;
      const fromBlock = 1000n;
      const htlcs = await manager.getHTLCsByCreator(creator, fromBlock);
      
      assertEquals(Array.isArray(htlcs), true);
    });

    await t.step("returns empty array for address with no HTLCs", async () => {
      const creator = "0x9999999999999999999999999999999999999999" as Address;
      const htlcs = await manager.getHTLCsByCreator(creator);
      
      assertEquals(Array.isArray(htlcs), true);
      assertEquals(htlcs.length, 0);
    });
  });
});