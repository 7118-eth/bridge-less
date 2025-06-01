import { createPublicClient, createWalletClient, http, createTestClient } from "jsr:@wevm/viem@2";
import { anvil } from "jsr:@wevm/viem@2/chains";

// Create test client for Anvil
const testClient = createTestClient({
  chain: anvil,
  mode: "anvil",
  transport: http("http://127.0.0.1:8545"),
});

// Create public client
const publicClient = createPublicClient({
  chain: anvil,
  transport: http("http://127.0.0.1:8545"),
});

// Get accounts
const accounts = await testClient.getAddresses();
console.log("Anvil accounts:", accounts);

// Impersonate first account
await testClient.impersonateAccount({
  address: accounts[0],
});

// Create wallet client with impersonated account
const walletClient = createWalletClient({
  account: accounts[0],
  chain: anvil,
  transport: http("http://127.0.0.1:8545"),
});

// Test sending transaction
try {
  const hash = await walletClient.sendTransaction({
    account: accounts[0],
    to: accounts[1],
    value: 1000000000000000000n, // 1 ETH
  });
  console.log("Transaction hash:", hash);
  
  // Wait for receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Transaction receipt:", receipt);
} catch (error) {
  console.error("Error:", error);
}