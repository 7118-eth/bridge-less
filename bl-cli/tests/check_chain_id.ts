// Let's check what chain ID the transaction is using
// The raw transaction in the error was: 0x02f87482053902843b9aca00847aa02b5a8252089470997970c51812dc3a010c7d01b50e0d17dc79c8880de0b6b3a764000080c080a088a08c78e6b18e203b82e9b7da414cf4280d998a723877e592fb2ecfca2c7b64a06ed7ccc04b414923422728aff7e1f6a235f5d20e816295379b6860f82d91befd

// 0x02 = EIP-1559 transaction type
// f874 = RLP length
// 820539 = chain ID (0x539 = 1337 decimal)
// 02 = nonce
// ... rest of transaction

console.log("Chain ID in transaction: 0x539 = ", parseInt("0x539", 16));

// But Anvil expects 0x7a69 = 31337
console.log("Anvil chain ID: 0x7a69 = ", parseInt("0x7a69", 16));

// The issue is that localhost chain in viem uses 1337, but Anvil uses 31337!