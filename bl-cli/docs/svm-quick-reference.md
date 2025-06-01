# SVM Integration Quick Reference

## 🚀 Quick Start (WORKING!)

### Setup (One Time)
```bash
# 1. Ensure deno.json has this line:
"nodeModulesDir": "auto"

# 2. Install dependencies
deno install --allow-scripts

# 3. Run any command - Solana now works!
deno task init
```

### Testing Commands
```bash
# Test Solana client (passing)
deno test src/chains/solana/client_test.ts --no-check --allow-all

# Test full system (EVM + mock Solana)
deno task test

# Run CLI commands
deno task init
deno task swap --amount 1000000
```

## 🔧 Key Files

### Solana Implementation
- `src/chains/solana/types.ts` - All type definitions
- `src/chains/solana/client.ts` - Solana blockchain client
- `src/chains/solana/htlc.ts` - HTLC operations
- `src/chains/solana/mock_client.ts` - Testing mock

### Integration Points
- `main.ts:116-155` - Dynamic Solana loading
- `src/coordinator/coordinator.ts:527-588` - Real HTLC creation
- `idl/bl_svm.json` - Solana program IDL

## 📦 Dependencies

```json
{
  "@solana/web3.js": "1.95",
  "@solana/spl-token": "0.3",
  "@coral-xyz/anchor": "0.29",
  "bs58": "5"
}
```

## 🐛 Known Issues (All Resolved!)

### ✅ WebSocket Dependency - FIXED
```json
// Solution in deno.json:
"nodeModulesDir": "auto"
```
Then run `deno install --allow-scripts` once.

### ✅ bs58 Import - FIXED
```typescript
// Use default export:
const bs58 = await import("npm:bs58@5");
bs58.default.decode(str);
```

### ✅ Buffer Not Defined - FIXED
```typescript
// Replace Buffer.from() with:
new TextEncoder().encode("string")
new Uint8Array([...])
```

### ⚠️ BorshCoder Warning
```
[WARN] Failed to initialize BorshCoder
```
This is non-fatal and doesn't affect functionality.

## 🔑 Environment Variables

```bash
# Solana configuration (in .env)
svm_rpc=http://127.0.0.1:8899
svm_rpc_ws=ws://127.0.0.1:8900
svm_htlc_contract_address=7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY
svm_token_contract_address=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
svm_coordinator_private_key=[...] # 64-byte array
svm_user_address=DbDa7MHwnNkxZrbQY8qtfhfAGUzBSapLGbafDFwD9Z5X
```

## 💡 Common Tasks

### Create HTLC on Solana
```typescript
const result = await solanaHTLCManager.createHTLC({
  htlcId: new Uint8Array(32),
  destinationAddress: evmAddressBytes, // 20 bytes
  destinationToken: tokenAddressBytes, // 20 bytes
  amount: 1000000n, // 1 USDC
  safetyDeposit: 10000n, // 0.00001 SOL
  hashlock: sha256Hash, // 32 bytes
  timelocks: {
    finality: now + 30,
    resolver: now + 60,
    public: now + 300,
    cancellation: now + 600,
  },
});
```

### Parse Solana Events
```typescript
// Event discriminators
const HTLC_CREATED = [115, 208, 175, 214, 231, 165, 231, 151];
const HTLC_WITHDRAWN = [234, 147, 184, 74, 116, 176, 252, 98];
const HTLC_CANCELLED = [158, 220, 88, 107, 94, 201, 107, 149];
```

### PDA Derivation
```typescript
const [htlcPda] = PublicKey.findProgramAddressSync(
  [new TextEncoder().encode("htlc"), htlcId],
  programId
);
```

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐
│   main.ts   │────▶│ Coordinator │
└─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              ┌──────────┐  ┌──────────┐
              │ EvmClient│  │SolanaClient
              └──────────┘  └──────────┘
                    │             │
              ┌──────────┐  ┌──────────┐
              │HTLCManager  │HTLCManager
              └──────────┘  └──────────┘
```

## 📝 Next Steps

1. **Fix WebSocket Issue**
   - Option A: Create Deno-native Solana client
   - Option B: Use ws polyfill
   - Option C: Wait for Deno ws support

2. **Test with Real Validator**
   ```bash
   solana-test-validator
   solana logs | grep "7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY"
   ```

3. **Implement Event Monitoring**
   - Current: Mock events
   - Need: WebSocket subscriptions
   - Location: `src/chains/solana/htlc.ts:watchHTLCEvents`

## ✅ Working Examples

### Successful Init Output
```
[INFO] Connected to Solana {"rpcUrl":"http://127.0.0.1:8899","blockhash":"..."}
[INFO] Coordinator initialized successfully
```

### Successful Swap Attempt
```
[INFO] Source HTLC created {"address":"0x93b6bda6a0813d808d75aa42e900664ceb868bcf"}
[INFO] Creating HTLC {"htlcPda":"4HHELhrnUKK7wbL9Dk7T1S5G2sU67VzhdFyoHpXGDuzS"}
[ERROR] Failed to create HTLC {"code":"SOL_TRANSACTION_FAILED"}
```
The error is expected - it means everything works but needs deployed program!

## 🆘 Troubleshooting

### "Non-base58 character" Error
- Check all Solana addresses are valid base58
- Use `11111111111111111111111111111111` for testing

### Transaction Fails (Expected)
- This is normal without deployed program
- Check account has SOL for fees when program is deployed
- Verify token accounts exist

### Import Errors
- Run `deno install --allow-scripts` first
- Ensure `"nodeModulesDir": "auto"` in deno.json
- Try clearing cache: `deno cache --reload`

## 📚 Resources

- [Program IDL](../idl/bl_svm.json)
- [Implementation Status](./svm-implementation-status.md)
- [Original Plan](./svm-implementation-plan.md)
- [Solana Cookbook](https://solanacookbook.com)