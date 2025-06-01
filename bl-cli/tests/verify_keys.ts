import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts";

const keys = {
  coordinator: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  user: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
};

console.log("Coordinator:");
const coordinatorAccount = privateKeyToAccount(keys.coordinator as `0x${string}`);
console.log("  Private Key:", keys.coordinator);
console.log("  Address:", coordinatorAccount.address);

console.log("\nUser:");
const userAccount = privateKeyToAccount(keys.user as `0x${string}`);
console.log("  Private Key:", keys.user);
console.log("  Address:", userAccount.address);

// Check if user address matches what's in .env
console.log("\nExpected user address from .env: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
console.log("Actual user address:", userAccount.address);
console.log("Match:", userAccount.address === "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");