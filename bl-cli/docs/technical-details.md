# Technical Details

## 🔧 Technical Insights Discovered

### 1. **Async Crypto Operations Bug** (Most Critical Finding)
```typescript
// THE MAIN BUG that was breaking everything:
// BEFORE (broken):
const secretBytes = this.secretManager.generateSecret(); // Returns Promise<Uint8Array>, not Uint8Array!

// AFTER (fixed):
const secretBytes = await this.secretManager.generateSecret(); // Properly awaited

// Same issue with hashing:
// BEFORE (broken):
const hashLock = this.secretManager.hashSecret(secretBytes); // Returns Promise<HashResult>

// AFTER (fixed):
const hashResult = await this.secretManager.hashSecret(secretBytes);
const hashLock = hashResult.hashHex; // Extract hex string from result
```

### 2. **Test Mode Pattern for Async Operations**
```typescript
// Added to CoordinatorConfig interface:
testMode?: boolean; // Disables async processing during tests

// Used in coordinator.ts:
if (!this.config.testMode) {
  this.processSwap(swapId).catch(error => {
    // Only run async processing in production, not tests
  });
}
```

### 3. **Critical Import Patterns**
```typescript
// privateKeyToAccount requires specific import path:
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts"; // NOT from main viem package

// HTLCState and HTLCEventType must be VALUE imports, not type imports:
import { HTLCState, HTLCEventType } from "./types.ts"; // NOT: import type { ... }
```

## 🏗️ Architecture Decisions Made

### 1. **Mock Testing Strategy**
- Created `MockEvmClient` to avoid network calls during tests
- All external blockchain operations return predictable mock data
- Enables reliable CI/CD without requiring running blockchain nodes

### 2. **State Management Design**
- In-memory `Map<string, SwapData>` for swap state (sufficient for PoC)
- SwapState enum: pending → source_locked → destination_locked → withdrawing → completed/failed/refunded
- Correlation IDs (swap IDs) using `crypto.randomUUID()`

### 3. **Error Handling Pattern**
- Custom error classes per module: `CoordinatorError`, `EvmError`, `CryptoError`, `ConfigError`
- Error codes for programmatic handling: `ErrorCodes.INSUFFICIENT_LIQUIDITY`, etc.
- Structured logging with correlation IDs

### 4. **Liquidity Management**
- `LiquidityManager` tracks available vs locked balances per chain
- Prevents over-commitment of funds across concurrent swaps
- Mock implementation returns 10,000 tokens balance for testing

## 📋 Key Insights from Implementation

1. **Mock Testing Strategy**: Created MockEvmClient to avoid network calls in tests, essential for TDD
2. **Cross-chain Addresses**: Implemented bytes32 conversion for future Solana compatibility
3. **Error Handling**: Custom error classes per module (EvmError, ConfigError, etc.)
4. **Event Monitoring**: Subscription support for both HTTP and WebSocket
5. **Type Safety**: Heavy use of branded types (Address, Hash) for compile-time safety

## 🔧 Technical Decisions for Next Phase

1. **State Machine**: Use simple enum-based states (Pending, Locked, Completed, Failed)
2. **Persistence**: Start with in-memory Map for swap state (upgrade to DB later)
3. **Monitoring**: Use child loggers with swap ID for correlation
4. **Concurrency**: Handle multiple swaps with unique IDs (use crypto.randomUUID())
5. **Recovery**: Implement timeout-based recovery (check timelocks, refund if needed)

## 💡 Important Implementation Notes

1. **Mock ABIs in Tests**: HTLC manager checks for empty ABI arrays and returns mock data
2. **Gas Estimation**: Always add 10% buffer to estimated gas
3. **Event Filtering**: Manual topic filtering for getLogs (viem limitation)
4. **Private Key Validation**: 64 hex chars with 0x prefix
5. **Timelock Periods**: 30s finality, 60s resolver, 300s public, 600s cancel

## 🔧 Critical Bug Fixes Applied

1. **Async Secret Generation Bug** - Main Issue:
   ```typescript
   // BEFORE (broken):
   const secretBytes = this.secretManager.generateSecret(); // Returns Promise, not Uint8Array
   
   // AFTER (fixed):
   const secretBytes = await this.secretManager.generateSecret(); // Properly awaited
   ```

2. **Async Hash Generation Bug**:
   ```typescript
   // BEFORE (broken):
   const hashLock = this.secretManager.hashSecret(secretBytes); // Returns Promise
   
   // AFTER (fixed):
   const hashResult = await this.secretManager.hashSecret(secretBytes);
   const hashLock = hashResult.hashHex; // Extract hex from result
   ```

3. **Test State Management**:
   ```typescript
   // Added testMode to coordinator config to disable async processing during tests
   testMode?: boolean; // Prevents race conditions in test assertions
   ```

## 💡 Key Insights for Future Development

### 1. **Async Operation Patterns**
- ALL crypto operations in Deno are async (generateSecret, hashSecret)
- Always use `await` when calling SecretManager methods
- Extract specific values from result objects (e.g., `hashResult.hashHex`)

### 2. **Testing Isolation Patterns**  
- Use `testMode` flag to disable async processing during tests
- Mock external dependencies completely (no network calls in tests)
- Each test suite creates fresh instances to avoid state pollution

### 3. **Import Path Gotchas**
- viem account functions: `jsr:@wevm/viem@2/accounts` (not main package)
- Deno standard library: `jsr:@std/assert@1` (specify version)
- Value vs type imports matter for enums in TypeScript

### 4. **State Management Patterns**
- Swap IDs as correlation keys for tracking across async operations
- State transitions validated before allowing operations
- Liquidity locked per swap to prevent double-spending

### 5. **Error Handling Patterns**
- Custom error classes with error codes for programmatic handling
- Structured logging with swap ID correlation
- Graceful degradation with retry logic for transient failures

## Critical Code Patterns
```typescript
// Coordinator initialization
const coordinator = new Coordinator({
  config,
  evmClient,
  htlcManager,
});

// Swap lifecycle
1. initiateSwap() -> generates secret, creates swap record
2. createSourceHTLC() -> locks tokens on source chain
3. createDestinationHTLC() -> locks tokens on destination
4. monitorWithdrawals() -> watches for secret reveal
5. executeWithdrawals() -> completes swap on both sides
```

## Known Issues & Solutions
1. **Viem Import Path**: Must use `jsr:@wevm/viem@2/accounts` for privateKeyToAccount
2. **Event Monitoring**: Currently uses mock events, needs WebSocket implementation
3. **Solana Side**: All Solana operations return mock data
4. **HTLC Creation**: Mock implementation when ABI array is empty (for testing)
5. **Gas Estimation**: Always adds 10% buffer

## Architecture Decisions
1. **State Management**: In-memory Map for swap states (sufficient for PoC)
2. **Concurrency**: Supports multiple swaps with configurable limit
3. **Recovery**: Automatic timeout-based recovery after 10 minutes
4. **Logging**: Structured logging with child loggers for correlation
5. **Error Handling**: Custom error classes with error codes

## ⚠️ Critical Warnings for Next Session

1. **Don't Modify Secret Generation**: The async crypto operations are now working correctly - don't change them
2. **Preserve Test Mode**: The `testMode` flag is essential for test stability
3. **Private Key Format**: Must be exactly 64 hex chars with 0x prefix
4. **Contract Addresses**: EVM contracts are already deployed and configured in the actual `.env` file
5. **Mock Strategy**: Keep mock implementations for unit tests, only use real contracts for integration tests