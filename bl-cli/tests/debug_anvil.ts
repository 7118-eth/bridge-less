import { createPublicClient, createWalletClient, http, getAddress } from "jsr:@wevm/viem@2";
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts";
import { localhost } from "jsr:@wevm/viem@2/chains";

const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Create account
const account = privateKeyToAccount(privateKey as `0x${string}`);
console.log("Account address:", account.address);
console.log("Checksummed:", getAddress(account.address));

// Create clients
const publicClient = createPublicClient({
  chain: localhost,
  transport: http("http://127.0.0.1:8545"),
});

const walletClient = createWalletClient({
  account,
  chain: localhost,
  transport: http("http://127.0.0.1:8545"),
});

// Test getting balance
try {
  const balance = await publicClient.getBalance({
    address: account.address,
  });
  console.log("Balance:", balance);
} catch (error) {
  console.error("Error getting balance:", error);
}

// Test sending a simple ETH transfer
try {
  const hash = await walletClient.sendTransaction({
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    value: 1000000000000000000n, // 1 ETH
  });
  console.log("Transaction hash:", hash);
} catch (error) {
  console.error("Error sending transaction:", error);
}