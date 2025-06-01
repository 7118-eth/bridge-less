# SVM Implementation Plan

## Overview

Based on the IDL analysis and Anza Kit documentation, here's a comprehensive plan for implementing Solana integration in the bl-cli project.

## Contract Analysis

The Solana HTLC program (`7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY`) supports:

### Instructions:
1. **create_htlc** - Creates HTLC with tokens
2. **withdraw_to_destination** - Withdraws using preimage
3. **cancel** - Refunds after timeout

### Key Features:
- Uses PDAs (Program Derived Addresses) for HTLC accounts
- Supports SPL tokens with 6 decimals
- Cross-chain identifiers (htlc_id as 32-byte array)
- EVM address storage (20-byte arrays)
- Multiple timelocks (finality, resolver, public, cancellation)
- Safety deposits in native SOL

### Events:
- HTLCCreated
- HTLCWithdrawn
- HTLCCancelled

## Implementation Architecture

### Phase 1: Core Types and Interfaces

```typescript
// src/chains/solana/types.ts

export interface ISolanaClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getBalance(address: string): Promise<bigint>;
  getTokenBalance(tokenMint: string, owner: string): Promise<bigint>;
  sendTransaction(transaction: Transaction): Promise<string>;
  waitForTransaction(signature: string): Promise<TransactionConfirmation>;
  getTransaction(signature: string): Promise<TransactionDetails | null>;
  subscribeToLogs(callback: (log: LogEvent) => void): Promise<() => void>;
}

export interface ISolanaHTLCManager {
  createHTLC(params: CreateHTLCParams): Promise<CreateHTLCResult>;
  withdrawToDestination(htlcId: Uint8Array, preimage: Uint8Array): Promise<string>;
  cancel(htlcId: Uint8Array): Promise<string>;
  getHTLCState(htlcId: Uint8Array): Promise<HTLCState | null>;
  watchHTLCEvents(callback: (event: HTLCEvent) => void): Promise<() => void>;
}
```

### Phase 2: Anza Kit Integration

```typescript
// src/chains/solana/client.ts

// Deno imports using npm: prefix
import { createSolanaRpc, createSolanaRpcSubscriptions } from "npm:@solana/kit";
import { getBase58Encoder } from "npm:@solana/codecs";

export class SolanaClient implements ISolanaClient {
  private rpc;
  private rpcSubscriptions;
  
  constructor(config: SolanaClientConfig) {
    this.rpc = createSolanaRpc(config.rpcUrl);
    if (config.rpcWsUrl) {
      this.rpcSubscriptions = createSolanaRpcSubscriptions(config.rpcWsUrl);
    }
  }
  
  // Implementation using Anza Kit's modern API
}
```

### Phase 3: HTLC Manager with Anchor Integration

```typescript
// src/chains/solana/htlc.ts

export class SolanaHTLCManager implements ISolanaHTLCManager {
  async createHTLC(params: CreateHTLCParams): Promise<CreateHTLCResult> {
    // 1. Generate HTLC PDA
    const htlcPda = await this.deriveHTLCAddress(params.htlcId);
    
    // 2. Build create_htlc instruction
    const instruction = await this.buildCreateHTLCInstruction({
      htlcId: params.htlcId,
      dstAddress: params.destinationAddress, // EVM address as bytes
      dstToken: params.destinationToken,     // ERC20 address as bytes
      amount: params.amount,
      safetyDeposit: params.safetyDeposit,
      hashlock: params.hashlock,
      finalityDeadline: params.timelocks.finality,
      resolverDeadline: params.timelocks.resolver,
      publicDeadline: params.timelocks.public,
      cancellationDeadline: params.timelocks.cancellation,
    });
    
    // 3. Send transaction
    const signature = await this.client.sendTransaction(transaction);
    
    return {
      htlcAddress: htlcPda.toString(),
      transactionHash: signature,
    };
  }
}
```

### Phase 4: Event Monitoring

```typescript
// Event parsing using Anchor discriminators
async watchHTLCEvents(callback: (event: HTLCEvent) => void): Promise<() => void> {
  const subscription = await this.client.subscribeToLogs((log) => {
    // Parse events using discriminators from IDL
    if (log.data.startsWith(HTLC_CREATED_DISCRIMINATOR)) {
      const event = this.parseHTLCCreatedEvent(log.data);
      callback({ type: 'HTLCCreated', data: event });
    }
    // Similar for other events
  });
  
  return subscription;
}
```

## Implementation Steps

### Step 1: Install Dependencies (Deno)
```bash
# For Deno, we use npm: imports directly
# No installation needed, just import:

# Example imports:
import { createSolanaRpc, createSolanaRpcSubscriptions } from "npm:@solana/kit";
import { getBase58Encoder } from "npm:@solana/codecs";

# Note: Some packages might need version pinning:
import { createSolanaRpc } from "npm:@solana/kit@latest";

# For existing @solana/web3.js (if needed for compatibility):
import { Connection, PublicKey, Keypair } from "npm:@solana/web3.js@2";
```

### Step 2: Create Type Definitions
1. Define interfaces in `src/chains/solana/types.ts`
2. Add Solana-specific types (PublicKey, Transaction, etc.)
3. Create event and error types based on IDL

### Step 3: Implement SolanaClient
1. Connection management with Anza Kit
2. Transaction building and sending
3. Balance queries (native SOL and SPL tokens)
4. Event subscription support

### Step 4: Implement SolanaHTLCManager
1. PDA derivation logic
2. Instruction building for all 3 operations
3. Event parsing with discriminators
4. State queries

### Step 5: Update Coordinator
1. Replace mock Solana operations with real implementations
2. Add proper error handling for Solana-specific errors
3. Implement cross-chain address conversions

### Step 6: Testing Strategy
1. Create MockSolanaClient for unit tests
2. Integration tests with local validator
3. End-to-end swap tests

## Key Technical Considerations

### 1. Address Handling
- Solana uses base58-encoded 32-byte public keys
- EVM addresses in HTLC are stored as 20-byte arrays
- Need conversion utilities between formats

### 2. PDA Calculation
```typescript
const [htlcPda, bump] = await PublicKey.findProgramAddress(
  [Buffer.from("htlc"), htlcId],
  programId
);
```

### 3. Time Handling
- Solana uses Unix timestamps (seconds since epoch)
- Ensure consistent time handling across chains

### 4. Token Decimals
- Contract expects 6 decimals (USDC standard)
- May need conversion if using different token standards

### 5. Transaction Fees
- Account for SOL rent exemption
- Safety deposits add to transaction cost

## Migration Path

1. **Phase 1**: Basic connectivity and balance queries
2. **Phase 2**: HTLC creation (one-way swaps)
3. **Phase 3**: Event monitoring and withdrawals
4. **Phase 4**: Full bidirectional swaps
5. **Phase 5**: Production optimizations

## Environment Variables

Already configured in .env:
- `svm_rpc`: Local Solana RPC endpoint
- `svm_htlc_contract_address`: Program ID
- `svm_token_contract_address`: SPL token mint
- Private keys for coordinator and user

## Next Immediate Actions

1. Create `src/chains/solana/types.ts` with interfaces
2. No installation needed - Deno will fetch dependencies on first import
3. Implement basic SolanaClient with connection management using `npm:@solana/kit`
4. Add simple balance query test
5. Gradually build out HTLC functionality

## Deno-Specific Considerations

1. **Import Maps**: Consider using deno.json import map for cleaner imports:
   ```json
   {
     "imports": {
       "@solana/kit": "npm:@solana/kit@latest",
       "@solana/codecs": "npm:@solana/codecs@latest",
       "@solana/web3.js": "npm:@solana/web3.js@2"
     }
   }
   ```

2. **Type Support**: Deno should automatically fetch types from npm packages
3. **Caching**: First run will download dependencies, subsequent runs use cache
4. **Permissions**: May need `--allow-net` for npm registry access

This plan provides a clear path from the current mock implementation to a fully functional Solana integration using modern tooling with Deno.