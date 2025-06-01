# Solana Kit Migration Plan

## Overview
This document outlines the complete migration from `@solana/web3.js@1.95` to the new `@solana/kit` for the bl-cli project. This migration will modernize our Solana integration, reduce bundle size, and improve type safety.

## Current State
- Using `@solana/web3.js@1.95` via npm imports in Deno
- Working HTLC creation with manual instruction encoding
- Coordinator successfully funded with ~7 SOL
- 158 tests passing

## Migration Strategy

### Phase 1: Package Replacement

#### Dependencies to Change
```typescript
// OLD
import { Connection, PublicKey, Keypair, Transaction, ... } from "npm:@solana/web3.js@1.95";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "npm:@solana/spl-token@0.3";
import { BorshCoder } from "npm:@coral-xyz/anchor@0.29";
import bs58 from "npm:bs58@5";

// NEW (Deno imports)
import { createSolanaRpc, address, generateKeyPair, signTransaction } from "jsr:@solana/kit@2";
import { getAddressEncoder, getAddressDecoder } from "jsr:@solana/kit@2/addresses";
import { createTransaction, setTransactionFeePayer } from "jsr:@solana/kit@2/transactions";
import { getBase58Encoder, getBase58Decoder } from "jsr:@solana/kit@2/codecs";
```

**Note**: Need to verify if `@solana/kit` is available on JSR. If not, use:
```typescript
import { ... } from "npm:@solana/kit@2";
```

### Phase 2: File-by-File Migration

#### 1. `src/chains/solana/types.ts`
- Update all type imports from web3.js to kit equivalents
- Replace `PublicKey` type with `Address` from kit
- Update transaction types to use kit's transaction interfaces

#### 2. `src/chains/solana/client.ts`
Key changes:
```typescript
// OLD
this.connection = new Connection(config.rpcUrl, config.commitment);

// NEW
this.rpc = createSolanaRpc(config.rpcUrl);
```

Method updates:
- `getBalance()` → `rpc.getBalance(address).send()`
- `sendRawTransaction()` → Custom implementation using rpc
- `confirmTransaction()` → `rpc.getSignatureStatuses().send()`
- Event subscriptions → Use kit's subscription system

#### 3. `src/chains/solana/htlc.ts`
Major refactoring needed:
- Replace `PublicKey.findProgramAddressSync()` with kit's PDA derivation
- Update `Transaction` building to use kit's functional approach
- Replace `TransactionInstruction` with kit's instruction builder
- Update signing logic to use kit's signing utilities

Critical changes:
```typescript
// OLD
const [htlcPda, bump] = PublicKey.findProgramAddressSync(
  [new TextEncoder().encode("htlc"), htlcId],
  this.programId
);

// NEW
// Need to implement PDA derivation using kit's address utilities
const htlcPda = await deriveAddress({
  programId: this.programId,
  seeds: [
    new TextEncoder().encode("htlc"),
    htlcId
  ]
});
```

#### 4. `main.ts`
- Update Keypair parsing to use kit's key utilities
- Replace `Keypair.fromSecretKey()` with kit's key generation

### Phase 3: Testing Updates

#### Files to Update:
1. `src/chains/solana/client_test.ts`
2. `src/chains/solana/htlc_test.ts`
3. `src/chains/solana/mock_client.ts`
4. Integration tests

### Phase 4: Critical Implementation Details

#### Manual Instruction Encoding (WORKING CODE TO PRESERVE)
```typescript
// This manual encoding works! Keep it as fallback
const discriminator = new Uint8Array([217, 24, 248, 19, 247, 183, 68, 88]);
const data = new Uint8Array(8 + 32 + 20 + 20 + 8 + 8 + 32 + 8 + 8 + 8 + 8);
// ... rest of manual encoding logic
```

#### Account Keys Order (CRITICAL)
The instruction expects accounts in this exact order:
1. resolver (signer, writable)
2. htlc PDA (writable)
3. token mint
4. resolver token account (writable)
5. htlc vault (writable)
6. System Program
7. Token Program
8. Associated Token Program

#### Working Transaction Parameters
- Program ID: `7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY`
- Token Mint: `91K7aRKwfXUYz7FVw9NVedE23jQurigFHCBaNuhy9HxK`
- Coordinator: `HaKrr9KogfXWLBQGifmuf1CEgDTpYQDJGzFYckEQJuxS`

### Phase 5: Specific Kit Features to Utilize

1. **Tree-shaking**: Import only what we need
2. **Type safety**: Use kit's enhanced types
3. **Functional design**: Refactor to functional approach
4. **Zero dependencies**: Remove unnecessary packages

### Phase 6: Potential Challenges

1. **PDA Derivation**: Kit might have different PDA derivation methods
2. **Transaction Building**: Completely different API
3. **Anchor IDL**: May need custom parser without BorshCoder
4. **Associated Token Address**: Need kit equivalent or custom implementation
5. **WebSocket Support**: Verify kit's WebSocket handling in Deno

### Phase 7: Rollback Plan

Keep the current working implementation on `main` branch. If migration fails:
1. `git checkout main`
2. Continue with web3.js implementation

### Phase 8: Success Criteria

1. All 158 tests still pass
2. Cross-chain swap completes successfully
3. Bundle size reduced (measure before/after)
4. No WebSocket issues
5. Improved type safety

## Implementation Order

1. Research Kit availability on JSR/npm for Deno
2. Create type mapping document
3. Implement client.ts with kit
4. Update htlc.ts maintaining manual encoding
5. Update mock and tests
6. Test HTLC creation
7. Test full cross-chain swap
8. Update documentation

## Code Patterns to Preserve

### Working Patterns
```typescript
// This serialization works
return await this.connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: this.config.commitment,
});

// Manual instruction encoding works
const discriminator = new Uint8Array([217, 24, 248, 19, 247, 183, 68, 88]);
```

### Environment Setup
```bash
# Keep these working configs
svm_rpc=http://127.0.0.1:8899
svm_htlc_contract_address=7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY
svm_token_contract_address=91K7aRKwfXUYz7FVw9NVedE23jQurigFHCBaNuhy9HxK
```

## Notes for Next Session

1. **Current working state**: HTLC creation works with manual encoding
2. **Key fix**: Use `sendRawTransaction` not `sendTransaction`
3. **Coordinator funded**: ~7 SOL available
4. **Token balance**: 990,000 tokens
5. **Last successful HTLC**: `DmGD6FoZ2CeXHdroRoSHkJgugDhFGQmDHRA73yVtw5tK`

## Commands to Test After Migration

```bash
# Test connection
deno run --allow-all --env-file=.env test_solana_htlc.ts

# Test full swap
deno task swap --amount 1000000

# Check balances
solana balance HaKrr9KogfXWLBQGifmuf1CEgDTpYQDJGzFYckEQJuxS
spl-token accounts --owner HaKrr9KogfXWLBQGifmuf1CEgDTpYQDJGzFYckEQJuxS
```

## DO NOT FORGET

1. The BorshCoder initialization fails but that's OK - manual encoding works
2. The mock coder must throw to force manual encoding
3. Transaction must be signed before sending
4. Use empty signers array in sendRawTransaction
5. Keep test files for debugging

---

**Migration starts after context reset. This document contains everything needed.**