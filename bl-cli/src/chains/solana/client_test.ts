/**
 * Tests for Solana client
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@1";
import { MockSolanaClient } from "./mock_client.ts";
import { SolanaErrorCode } from "./types.ts";

Deno.test("MockSolanaClient - connect and disconnect", async () => {
  const client = new MockSolanaClient();
  
  // Should connect successfully
  await client.connect();
  
  // Should disconnect successfully
  await client.disconnect();
});

Deno.test("MockSolanaClient - get balance", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  // Check default balances
  const coordinatorBalance = await client.getBalance("coordinator");
  assertEquals(coordinatorBalance, 10000000000n); // 10 SOL
  
  const userBalance = await client.getBalance("user");
  assertEquals(userBalance, 5000000000n); // 5 SOL
  
  // Non-existent address should return 0
  const unknownBalance = await client.getBalance("unknown");
  assertEquals(unknownBalance, 0n);
  
  // Set custom balance
  client.setBalance("custom", 123456789n);
  const customBalance = await client.getBalance("custom");
  assertEquals(customBalance, 123456789n);
});

Deno.test("MockSolanaClient - get token balance", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  const tokenMint = "mock-token-mint";
  const owner = "mock-owner";
  
  // Default should be 0
  const balance1 = await client.getTokenBalance(tokenMint, owner);
  assertEquals(balance1, 0n);
  
  // Set token balance
  client.setTokenBalance(tokenMint, owner, 1000000n);
  const balance2 = await client.getTokenBalance(tokenMint, owner);
  assertEquals(balance2, 1000000n);
  
  // Different owner should have different balance
  const balance3 = await client.getTokenBalance(tokenMint, "other-owner");
  assertEquals(balance3, 0n);
});

Deno.test("MockSolanaClient - send transaction", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  // Mock transaction
  const tx = {} as any;
  
  const signature = await client.sendTransaction(tx);
  assertExists(signature);
  assertEquals(typeof signature, "string");
  assertEquals(signature.startsWith("mock-sig-"), true);
});

Deno.test("MockSolanaClient - wait for transaction", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  // Send transaction first
  const tx = {} as any;
  const signature = await client.sendTransaction(tx);
  
  // Wait for confirmation
  const confirmation = await client.waitForTransaction(signature);
  assertExists(confirmation);
  assertEquals(confirmation.signature, signature);
  assertEquals(confirmation.err, null);
  assertEquals(confirmation.confirmations, 32);
  assertExists(confirmation.slot);
  
  // Non-existent transaction should throw
  await assertRejects(
    async () => await client.waitForTransaction("non-existent"),
    Error,
    "Transaction not found"
  );
});

Deno.test("MockSolanaClient - get transaction", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  // Send transaction first
  const tx = {} as any;
  const signature = await client.sendTransaction(tx);
  
  // Get transaction details
  const details = await client.getTransaction(signature);
  assertExists(details);
  assertEquals(details?.signature, signature);
  assertExists(details?.slot);
  assertExists(details?.blockTime);
  assertEquals(details?.meta.err, null);
  assertEquals(details?.meta.fee, 5000);
  assertExists(details?.meta.logMessages);
  
  // Non-existent transaction should return null
  const notFound = await client.getTransaction("non-existent");
  assertEquals(notFound, null);
});

Deno.test("MockSolanaClient - subscribe to logs", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  const programId = "mock-program-id";
  const receivedLogs: any[] = [];
  
  // Subscribe to logs
  const unsubscribe = await client.subscribeToLogs(programId, (log) => {
    receivedLogs.push(log);
  });
  
  // Send transaction (should emit logs)
  const tx = {} as any;
  await client.sendTransaction(tx);
  
  // Check logs were received
  assertEquals(receivedLogs.length, 1);
  assertExists(receivedLogs[0].signature);
  assertExists(receivedLogs[0].logs);
  
  // Unsubscribe
  unsubscribe();
  
  // Send another transaction
  await client.sendTransaction(tx);
  
  // Should not receive more logs
  assertEquals(receivedLogs.length, 1);
});

Deno.test("MockSolanaClient - get slot and block time", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  const slot1 = await client.getSlot();
  assertExists(slot1);
  assertEquals(typeof slot1, "number");
  
  const blockTime = await client.getBlockTime();
  assertExists(blockTime);
  assertEquals(typeof blockTime, "number");
  
  // Slot should increment after transaction
  await client.sendTransaction({} as any);
  const slot2 = await client.getSlot();
  assertEquals(slot2, slot1 + 1);
});

Deno.test("MockSolanaClient - simulate HTLC events", async () => {
  const client = new MockSolanaClient();
  await client.connect();
  
  const programId = "mock-program-id";
  const receivedLogs: any[] = [];
  
  // Subscribe to logs
  await client.subscribeToLogs(programId, (log) => {
    receivedLogs.push(log);
  });
  
  // Simulate HTLC created
  const htlcId = new Uint8Array(32).fill(1);
  await client.simulateHTLCCreated(htlcId);
  
  assertEquals(receivedLogs.length, 1);
  assertEquals(receivedLogs[0].logs.some((l: string) => l.includes("CreateHtlc")), true);
  
  // Simulate HTLC withdrawn
  const preimage = new Uint8Array(32).fill(2);
  await client.simulateHTLCWithdrawn(htlcId, preimage);
  
  assertEquals(receivedLogs.length, 2);
  assertEquals(receivedLogs[1].logs.some((l: string) => l.includes("WithdrawToDestination")), true);
});