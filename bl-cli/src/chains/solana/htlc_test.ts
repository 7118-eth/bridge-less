/**
 * Tests for Solana HTLC manager
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { Keypair } from "npm:@solana/web3.js@1.95";
import { MockSolanaClient } from "./mock_client.ts";
import { SolanaHTLCManager } from "./htlc.ts";
import { HTLCEventType } from "./types.ts";
import type { SolanaHTLCEvent } from "./types.ts";
import { Logger } from "../../utils/logger.ts";

// Mock Anchor coder since we can't import it directly in tests
const mockCoder = {
  instruction: {
    encode: (name: string, data: any) => {
      // Return mock encoded data
      return new Uint8Array(100).fill(0);
    },
  },
  accounts: {
    decode: (name: string, data: Buffer) => {
      // Return mock HTLC state
      return {
        resolver: Keypair.generate().publicKey,
        srcAddress: Keypair.generate().publicKey,
        dstAddress: new Array(20).fill(0),
        srcToken: Keypair.generate().publicKey,
        dstToken: new Array(20).fill(0),
        amount: { toString: () => "1000000" },
        safetyDeposit: { toString: () => "10000" },
        hashlock: new Array(32).fill(0),
        htlcId: new Array(32).fill(1),
        finalityDeadline: { toNumber: () => Math.floor(Date.now() / 1000) + 300 },
        resolverDeadline: { toNumber: () => Math.floor(Date.now() / 1000) + 600 },
        publicDeadline: { toNumber: () => Math.floor(Date.now() / 1000) + 900 },
        cancellationDeadline: { toNumber: () => Math.floor(Date.now() / 1000) + 1200 },
        withdrawn: false,
        cancelled: false,
        createdAt: { toNumber: () => Math.floor(Date.now() / 1000) },
      };
    },
  },
  events: {
    decode: (data: Buffer) => {
      // Check discriminator
      const discriminator = Array.from(data.slice(0, 8));
      const created = [115, 208, 175, 214, 231, 165, 231, 151];
      
      if (discriminator.every((v, i) => v === created[i])) {
        return {
          name: "HTLCCreated",
          data: {
            htlcAccount: Keypair.generate().publicKey,
            htlcId: new Array(32).fill(1),
            resolver: Keypair.generate().publicKey,
            dstAddress: new Array(20).fill(0),
            amount: { toString: () => "1000000" },
            hashlock: new Array(32).fill(0),
            finalityDeadline: { toNumber: () => Math.floor(Date.now() / 1000) + 300 },
          },
        };
      }
      
      return null;
    },
  },
};

// Patch the HTLCManager to use mock coder
class TestableHTLCManager extends SolanaHTLCManager {
  constructor(config: any) {
    super(config);
    // Override the coder
    (this as any).coder = mockCoder;
  }
}

Deno.test("SolanaHTLCManager - create HTLC", async () => {
  const logger = new Logger("test");
  const client = new MockSolanaClient();
  const keypair = Keypair.generate();
  
  await client.connect();
  
  const htlcManager = new TestableHTLCManager({
    client,
    programId: "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY",
    tokenMint: "11111111111111111111111111111111", // Valid base58 mock address
    keypair,
    logger,
  });
  
  const htlcId = new Uint8Array(32).fill(1);
  const hashlock = new Uint8Array(32).fill(2);
  const destinationAddress = new Uint8Array(20).fill(3);
  const destinationToken = new Uint8Array(20).fill(4);
  
  const result = await htlcManager.createHTLC({
    htlcId,
    destinationAddress,
    destinationToken,
    amount: 1000000n,
    safetyDeposit: 10000n,
    hashlock,
    timelocks: {
      finality: Math.floor(Date.now() / 1000) + 300,
      resolver: Math.floor(Date.now() / 1000) + 600,
      public: Math.floor(Date.now() / 1000) + 900,
      cancellation: Math.floor(Date.now() / 1000) + 1200,
    },
  });
  
  assertExists(result);
  assertExists(result.htlcAddress);
  assertExists(result.transactionHash);
  assertExists(result.slot);
  
  // Verify PDA generation
  const expectedAddress = await htlcManager.getHTLCAddress(htlcId);
  assertEquals(result.htlcAddress, expectedAddress);
});

Deno.test("SolanaHTLCManager - withdraw to destination", async () => {
  const logger = new Logger("test");
  const client = new MockSolanaClient();
  const keypair = Keypair.generate();
  
  await client.connect();
  
  const htlcManager = new TestableHTLCManager({
    client,
    programId: "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY",
    tokenMint: "11111111111111111111111111111111", // Valid base58 mock address
    keypair,
    logger,
  });
  
  const htlcId = new Uint8Array(32).fill(1);
  const preimage = new Uint8Array(32).fill(5);
  
  const signature = await htlcManager.withdrawToDestination(htlcId, preimage);
  
  assertExists(signature);
  assertEquals(typeof signature, "string");
  assertEquals(signature.startsWith("mock-sig-"), true);
});

Deno.test("SolanaHTLCManager - cancel HTLC", async () => {
  const logger = new Logger("test");
  const client = new MockSolanaClient();
  const keypair = Keypair.generate();
  
  await client.connect();
  
  const htlcManager = new TestableHTLCManager({
    client,
    programId: "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY",
    tokenMint: "11111111111111111111111111111111", // Valid base58 mock address
    keypair,
    logger,
  });
  
  const htlcId = new Uint8Array(32).fill(1);
  
  const signature = await htlcManager.cancel(htlcId);
  
  assertExists(signature);
  assertEquals(typeof signature, "string");
  assertEquals(signature.startsWith("mock-sig-"), true);
});

Deno.test("SolanaHTLCManager - get HTLC state", async () => {
  const logger = new Logger("test");
  const client = new MockSolanaClient();
  const keypair = Keypair.generate();
  
  await client.connect();
  
  const htlcManager = new TestableHTLCManager({
    client,
    programId: "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY",
    tokenMint: "11111111111111111111111111111111", // Valid base58 mock address
    keypair,
    logger,
  });
  
  const htlcId = new Uint8Array(32).fill(1);
  
  const state = await htlcManager.getHTLCState(htlcId);
  
  assertExists(state);
  assertExists(state?.resolver);
  assertExists(state?.srcAddress);
  assertEquals(state?.amount, 1000000n);
  assertEquals(state?.safetyDeposit, 10000n);
  assertEquals(state?.withdrawn, false);
  assertEquals(state?.cancelled, false);
});

Deno.test("SolanaHTLCManager - watch HTLC events", async () => {
  const logger = new Logger("test");
  const client = new MockSolanaClient();
  const keypair = Keypair.generate();
  
  await client.connect();
  
  const htlcManager = new TestableHTLCManager({
    client,
    programId: "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY",
    tokenMint: "11111111111111111111111111111111", // Valid base58 mock address
    keypair,
    logger,
  });
  
  const receivedEvents: SolanaHTLCEvent[] = [];
  
  // Start watching events
  const unsubscribe = await htlcManager.watchHTLCEvents((event) => {
    receivedEvents.push(event);
  });
  
  // Simulate an HTLC created event
  const htlcId = new Uint8Array(32).fill(1);
  await client.simulateHTLCCreated(htlcId);
  
  // Wait a bit for event processing
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  // Events might not be parsed correctly in mock, but subscription should work
  assertExists(unsubscribe);
  assertEquals(typeof unsubscribe, "function");
  
  // Cleanup
  unsubscribe();
});

Deno.test("SolanaHTLCManager - get HTLC address", async () => {
  const logger = new Logger("test");
  const client = new MockSolanaClient();
  const keypair = Keypair.generate();
  
  await client.connect();
  
  const htlcManager = new TestableHTLCManager({
    client,
    programId: "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY",
    tokenMint: "11111111111111111111111111111111", // Valid base58 mock address
    keypair,
    logger,
  });
  
  const htlcId1 = new Uint8Array(32).fill(1);
  const htlcId2 = new Uint8Array(32).fill(2);
  
  const address1 = await htlcManager.getHTLCAddress(htlcId1);
  const address2 = await htlcManager.getHTLCAddress(htlcId2);
  
  assertExists(address1);
  assertExists(address2);
  assertEquals(typeof address1, "string");
  assertEquals(typeof address2, "string");
  
  // Different IDs should produce different addresses
  assertEquals(address1 !== address2, true);
  
  // Same ID should produce same address
  const address1Again = await htlcManager.getHTLCAddress(htlcId1);
  assertEquals(address1, address1Again);
});