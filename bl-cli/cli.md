# CLI.md

This file provides guidance for implementing the coordinator CLI for the bridge-less HTLC bridge between EVM and Solana.

## Overview

The coordinator CLI is the central orchestrator for the bridge-less atomic swap protocol. It acts as maker, taker, resolver, and relayer in this proof-of-concept implementation, managing the entire swap lifecycle across EVM and Solana chains.

## Architecture

### Core Responsibilities

1. **Secret Management**
   - Generate cryptographic secrets for HTLC operations
   - Compute SHA256 hashes for cross-chain compatibility
   - Store secrets securely until reveal time
   - Reveal secrets after finality periods

2. **Liquidity Management**
   - Pre-fund 10,000 tokens (10_000e6 units) on each chain
   - Track available liquidity across chains
   - Execute 1 token (1e6 units) test swaps

3. **Cross-Chain Coordination**
   - Monitor EVM events via viem
   - Monitor Solana events via @solana/web3.js
   - Ensure atomic execution across chains
   - Handle timelock expiration and refunds

4. **State Management**
   - Track active HTLCs across both chains
   - Map HTLC IDs between chains
   - Monitor finality and timelock states
   - Persist state for recovery

## Implementation Stack

### Dependencies notes:
https://github.com/tj/commander.js
https://www.npmjs.com/package/commander
instead of solana web3 v1, use https://github.com/anza-xyz/kit (its rename 2.x...)
https://www.npmjs.com/package/bs58? not sure if any why we need that! double check.


### Dependencies
```json
{
  "imports": {
    "viem": "https://esm.sh/viem@2.x",
    "@solana/web3.js": "https://esm.sh/@solana/web3.js@1.x",
    "@coral-xyz/anchor": "https://esm.sh/@coral-xyz/anchor@0.x",
    "bs58": "https://esm.sh/bs58@5.x"
  }
}
```

### Directory Structure
```
bl-cli/
├── deno.json          # Deno configuration with import maps
├── main.ts            # Main CLI entry point
├── main_test.ts       # Test suite
├── src/
│   ├── coordinator.ts # Main coordinator logic
│   ├── evm/          # EVM-specific modules
│   │   ├── client.ts  # EVM chain client
│   │   ├── htlc.ts    # HTLC contract interactions
│   │   └── events.ts  # Event monitoring
│   ├── solana/       # Solana-specific modules
│   │   ├── client.ts  # Solana client
│   │   ├── htlc.ts    # HTLC program interactions
│   │   └── events.ts  # Event monitoring
│   ├── crypto/       # Cryptographic utilities
│   │   └── hash.ts    # SHA256 and secret generation
│   └── types/        # Shared types
│       └── index.ts   # Common interfaces
└── config/
    └── config.ts      # Configuration management
```

## Core Components

### 1. Coordinator Service (`src/coordinator.ts`)

```typescript
interface CoordinatorConfig {
  // EVM Configuration
  evmRpcUrl: string;
  evmChainId: number;
  evmPrivateKey: string;
  evmFactoryAddress: string;
  evmTokenAddress: string;

  // Solana Configuration
  solanaRpcUrl: string;
  solanaKeypair: Uint8Array;
  solanaProgramId: string;
  solanaTokenMint: string;

  // Bridge Configuration
  swapAmount: bigint;  // 1e6 for 1 token
  finalityPeriod: number;  // 30 seconds
  resolverPeriod: number;  // 60 seconds
  publicPeriod: number;    // 300 seconds
  cancelPeriod: number;    // 600 seconds
}

class Coordinator {
  // Initialize clients for both chains
  async initialize(): Promise<void>;

  // Pre-fund liquidity on both chains
  async fundLiquidity(): Promise<void>;

  // Execute a complete swap
  async executeSwap(params: SwapParams): Promise<SwapResult>;

  // Monitor and handle events
  async startEventMonitoring(): Promise<void>;
}
```

### 2. EVM Client (`src/evm/client.ts`)

```typescript
class EVMClient {
  // Deploy HTLC through factory
  async createHTLC(params: HTLCParams): Promise<HTLCDeployment>;

  // Withdraw with preimage
  async withdrawHTLC(htlcAddress: string, preimage: string): Promise<TransactionReceipt>;

  // Cancel HTLC after timeout
  async cancelHTLC(htlcAddress: string): Promise<TransactionReceipt>;

  // Monitor factory events
  async watchHTLCDeployments(callback: (event: HTLCDeployedEvent) => void): void;
}
```

### 3. Solana Client (`src/solana/client.ts`)

```typescript
class SolanaClient {
  // Initialize HTLC PDA
  async createHTLC(params: HTLCParams): Promise<HTLCAccount>;

  // Claim with secret
  async claimHTLC(htlcPDA: PublicKey, secret: Buffer): Promise<TransactionSignature>;

  // Refund after timeout
  async refundHTLC(htlcPDA: PublicKey): Promise<TransactionSignature>;

  // Monitor program events
  async watchHTLCEvents(callback: (event: HTLCEvent) => void): void;
}
```

### 4. Secret Management (`src/crypto/hash.ts`)

```typescript
// Generate cryptographic secret
export function generateSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

// Compute SHA256 hash (cross-chain compatible)
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

// Convert between hex and bytes
export function hexToBytes(hex: string): Uint8Array;
export function bytesToHex(bytes: Uint8Array): string;
```

## Swap Flow Implementation

### Phase 1: Initialization
```typescript
async function initializeSwap() {
  // 1. Generate secret and compute hash
  const secret = generateSecret();
  const hashlock = await sha256(secret);

  // 2. Calculate timelocks
  const now = Math.floor(Date.now() / 1000);
  const finalityDeadline = now + config.finalityPeriod;
  const resolverDeadline = finalityDeadline + config.resolverPeriod;
  const publicDeadline = resolverDeadline + config.publicPeriod;
  const cancelDeadline = publicDeadline + config.cancelPeriod;

  // 3. Store swap state
  const swapId = generateSwapId();
  await storeSwapState(swapId, { secret, hashlock, timelocks });
}
```

### Phase 2: HTLC Creation
```typescript
async function createHTLCs(swapState: SwapState) {
  // 1. Create EVM HTLC (source chain)
  const evmHTLC = await evmClient.createHTLC({
    srcAddress: coordinatorEvmAddress,
    dstAddress: userSolanaAddress,
    token: config.evmTokenAddress,
    amount: config.swapAmount,
    hashlock: swapState.hashlock,
    timelocks: swapState.timelocks
  });

  // 2. Wait for EVM finality
  await waitForFinality(evmHTLC.blockNumber);

  // 3. Create Solana HTLC (destination chain)
  const solanaHTLC = await solanaClient.createHTLC({
    sender: coordinatorSolanaKeypair,
    recipient: userEvmAddress,
    mint: config.solanaTokenMint,
    amount: config.swapAmount,
    hashlock: swapState.hashlock,
    timelocks: swapState.timelocks
  });

  // 4. Update swap state with HTLC addresses
  await updateSwapState(swapState.id, {
    evmHTLC: evmHTLC.address,
    solanaHTLC: solanaHTLC.publicKey
  });
}
```

### Phase 3: Secret Reveal & Withdrawal
```typescript
async function completeSwap(swapState: SwapState) {
  // 1. Wait for both finality periods
  await waitForFinality(swapState.evmHTLC.blockNumber);
  await waitForSolanaFinality(swapState.solanaHTLC.slot);

  // 2. Reveal secret by withdrawing on source chain
  const evmWithdrawTx = await evmClient.withdrawHTLC(
    swapState.evmHTLC.address,
    bytesToHex(swapState.secret)
  );

  // 3. Extract revealed secret from event (verification)
  const revealedSecret = await extractSecretFromTx(evmWithdrawTx);

  // 4. Withdraw on destination chain
  const solanaTx = await solanaClient.claimHTLC(
    swapState.solanaHTLC.publicKey,
    Buffer.from(swapState.secret)
  );

  // 5. Update final swap state
  await finalizeSwapState(swapState.id, {
    status: 'completed',
    evmTxHash: evmWithdrawTx.transactionHash,
    solanaTxSignature: solanaTx
  });
}
```

### Phase 4: Recovery & Cancellation
```typescript
async function handleTimeout(swapState: SwapState) {
  const now = Math.floor(Date.now() / 1000);

  // Check if we're in cancellation period
  if (now > swapState.timelocks.cancelDeadline) {
    // Cancel both HTLCs
    await Promise.all([
      evmClient.cancelHTLC(swapState.evmHTLC.address),
      solanaClient.refundHTLC(swapState.solanaHTLC.publicKey)
    ]);

    await updateSwapState(swapState.id, { status: 'cancelled' });
  }
}
```

## Event Monitoring

### EVM Events
```typescript
// Monitor HTLCDeployed events
evmClient.watchHTLCDeployments(async (event) => {
  console.log(`HTLC deployed: ${event.htlcContract}`);
  console.log(`HTLC ID: ${event.htlcId}`);
  console.log(`Amount: ${event.amount}`);

  // Track in coordinator state
  await trackHTLCDeployment(event);
});

// Monitor withdrawal/cancellation events
evmClient.watchHTLCWithdrawals(async (event) => {
  console.log(`HTLC withdrawn: ${event.htlcContract}`);
  console.log(`Preimage: ${event.preimage}`);
});
```

### Solana Events
```typescript
// Monitor program events via transaction logs
solanaClient.watchHTLCEvents(async (event) => {
  if (event.type === 'HTLCCreated') {
    console.log(`Solana HTLC created: ${event.htlcAccount}`);
  } else if (event.type === 'HTLCClaimed') {
    console.log(`Solana HTLC claimed with secret`);
  }
});
```

## CLI Commands

### Main Commands
```bash
# Initialize coordinator with configuration
deno task init --config ./config.json

# Fund liquidity pools on both chains
deno task fund --amount 10000

# Execute a test swap
deno task swap --from evm --to solana --amount 1

# Monitor active swaps
deno task monitor

# Run recovery for stuck swaps
deno task recover
```

### Development Commands
```bash
# Run tests
deno test

# Run with watch mode
deno task dev

# Check types
deno check main.ts

# Format code
deno fmt

# Lint code
deno lint
```

## Configuration Example

```json
{
  "evm": {
    "rpcUrl": "https://sepolia-rollup.arbitrum.io/rpc",
    "chainId": 421614,
    "privateKey": "0x...",
    "contracts": {
      "factory": "0x...",
      "token": "0x..."
    }
  },
  "solana": {
    "rpcUrl": "https://api.devnet.solana.com",
    "keypair": "path/to/keypair.json",
    "programId": "..."
  },
  "bridge": {
    "swapAmount": "1000000",
    "timelocks": {
      "finality": 30,
      "resolver": 60,
      "public": 300,
      "cancel": 600
    }
  }
}
```

## Testing Strategy

### Unit Tests
- Secret generation and hashing
- Timelock calculations
- Event parsing
- State management

### Integration Tests
- EVM client interactions
- Solana client interactions
- Cross-chain coordination
- Recovery mechanisms

### End-to-End Tests
- Complete swap flow
- Timeout scenarios
- Multiple concurrent swaps
- State persistence and recovery

## Security Considerations

1. **Secret Storage**
   - Store secrets in memory only
   - Clear secrets after use
   - Never log secrets

2. **Private Key Management**
   - Use environment variables
   - Consider hardware wallets for production
   - Rotate keys regularly

3. **Error Handling**
   - Graceful degradation
   - Automatic retry with backoff
   - State recovery on restart

4. **Monitoring**
   - Log all operations
   - Alert on failures
   - Track success rates

## Production Considerations

1. **High Availability**
   - Multiple coordinator instances
   - Shared state via database
   - Leader election for operations

2. **Performance**
   - Batch RPC calls
   - Efficient event filtering
   - Connection pooling

3. **Observability**
   - Structured logging
   - Metrics collection
   - Distributed tracing

4. **Disaster Recovery**
   - Regular state backups
   - Automated recovery procedures
   - Manual intervention tools
