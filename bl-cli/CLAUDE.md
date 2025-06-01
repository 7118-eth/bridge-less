# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Test
- **Test**: `deno test` - Runs all tests
- **Test (watch)**: `deno test --watch` - Runs tests in watch mode
- **Test (coverage)**: `deno test --coverage` - Runs tests with code coverage
- **Test (specific)**: `deno test **/pattern.test.ts` - Run specific test files
- **Type Check**: `deno check main.ts` - Type check without running

### Code Quality
- **Format**: `deno fmt` - Formats TypeScript code according to Deno style guide
- **Lint**: `deno lint` - Lints code for common issues
- **Benchmark**: `deno bench` - Run performance benchmarks

### Development
- **Run**: `deno run --allow-net --allow-env --allow-read main.ts` - Run the CLI
- **Watch**: `deno run --watch --allow-net --allow-env --allow-read main.ts` - Run with auto-reload
- **Compile**: `deno compile --allow-net --allow-env --allow-read -o bl-cli main.ts` - Create standalone executable

### Tasks (defined in deno.json)
- **dev**: Development mode with auto-reload
- **test**: Run test suite
- **lint**: Lint and format code
- **build**: Compile to executable

## Architecture

This is a Deno-based TypeScript project implementing a coordinator CLI for the bridge-less HTLC bridge between EVM and Solana. The coordinator acts as maker, taker, resolver, and relayer in this proof-of-concept implementation.

### Tech Stack
- **Deno**: Modern JavaScript/TypeScript runtime with built-in tooling
- **viem**: Type-safe Ethereum client via JSR (`jsr:@wevm/viem`)
- **@solana/web3.js**: Solana client library (version 2.x from Anza)
- **Built-in APIs**: Deno's crypto, testing, and env APIs

### Structure
```
bl-cli/
├── main.ts              # CLI entry point
├── main_test.ts         # Integration tests
├── deno.json           # Deno configuration
├── .env.example        # Environment variables template
├── abi/                # Contract ABIs (already present)
│   ├── HTLC.json
│   ├── HTLCFactory.json
│   └── Token.json
├── src/
│   ├── coordinator/    # Core coordinator logic
│   │   ├── coordinator.ts
│   │   ├── coordinator_test.ts
│   │   └── types.ts
│   ├── chains/         # Chain-specific implementations
│   │   ├── evm/
│   │   │   ├── client.ts
│   │   │   ├── client_test.ts
│   │   │   ├── htlc.ts
│   │   │   ├── htlc_test.ts
│   │   │   └── types.ts
│   │   └── solana/
│   │       ├── client.ts
│   │       ├── client_test.ts
│   │       └── types.ts
│   ├── crypto/         # Cryptographic utilities
│   │   ├── secret.ts
│   │   └── secret_test.ts
│   ├── config/         # Configuration management
│   │   ├── config.ts
│   │   └── config_test.ts
│   └── utils/          # Shared utilities
│       ├── logger.ts
│       └── retry.ts
└── tests/              # End-to-end tests
    └── integration/
        └── swap_flow_test.ts
```

### Testing Approach
Tests use Deno's built-in test runner:
- `Deno.test()` for test definitions
- `assertEquals()`, `assertThrows()` from `jsr:@std/assert`
- Mock functions with `jsr:@std/testing/mock`
- Snapshot testing with `jsr:@std/testing/snapshot`

**Development Process (mandatory for this project):**

1. **Interface-First Development:**
   - Define TypeScript interfaces for all modules FIRST
   - Use comprehensive JSDoc comments
   - Interfaces should be in `types.ts` files within each module
   - Export all public types from module index

2. **Test-Driven Development (TDD):**
   - Write tests BEFORE implementation
   - Use `_test.ts` suffix for test files (Deno convention)
   - Run `deno test --watch` during development
   - Achieve 100% test coverage for critical paths
   - Mock external dependencies (blockchain RPCs)

3. **Documentation Requirements:**
   - Use JSDoc for all public functions and types
   - Include `@example` sections in JSDoc
   - Document error cases with `@throws`
   - Keep inline comments minimal and meaningful

4. **Version Control:**
   - Commit after EVERY completed step
   - Use clear, descriptive commit messages
   - Only stage files in the bl-cli directory
   - Keep commits atomic and focused

## Core Components

### 1. Coordinator Service
The main orchestrator managing the entire swap lifecycle:
- Secret generation and management
- Liquidity pre-funding (10,000 tokens per chain)
- Cross-chain HTLC coordination
- Event monitoring and state tracking
- Timeout handling and recovery

### 2. EVM Chain Integration
Using viem for type-safe Ethereum interactions:
- Factory contract deployment of HTLCs
- Event monitoring via filters
- Transaction management with retries
- Gas estimation and optimization

### 3. Solana Integration
Simplified approach for PoC (no Anchor program yet):
- Direct program interactions
- PDA (Program Derived Address) calculations
- Transaction building and signing
- Event parsing from logs

### 4. Cryptographic Operations
Using Deno's Web Crypto API:
- SHA256 hashing for cross-chain compatibility
- Secure random secret generation
- Hex/bytes conversion utilities

## Implementation Guidelines

### Package Management
```typescript
// Use JSR packages when available
import { assertEquals } from "jsr:@std/assert@1";
import * as viem from "jsr:@wevm/viem@2";

// Use npm: specifier for packages not on JSR
import { Connection } from "npm:@solana/web3.js@2";

// Prefer Deno built-ins
const encoder = new TextEncoder();
const secret = crypto.getRandomValues(new Uint8Array(32));
```

### Environment Variables
```typescript
// Read from .env automatically
const config = {
  evmRpc: Deno.env.get("evm_rpc") || "http://localhost:8545",
  evmRpcWs: Deno.env.get("evm_rpc_ws") || "ws://localhost:8545",
  evmCoordinatorPrivateKey: Deno.env.get("evm_coordinator_private_key")!,
  evmUserPrivateKey: Deno.env.get("evm_user_private_key")!,
  evmTokenContractAddress: Deno.env.get("evm_token_contract_address")!,
  evmHtlcContractAddress: Deno.env.get("evm_htlc_contract_address")!,
  svmRpc: Deno.env.get("svm_rpc") || "http://localhost:8899",
  svmRpcWs: Deno.env.get("svm_rpc_ws") || "ws://localhost:8900",
  svmCoordinatorPrivateKey: Deno.env.get("svm_coordinator_private_key"),
  svmUserPrivateKey: Deno.env.get("svm_user_private_key"),
  svmTokenContractAddress: Deno.env.get("svm_token_contract_address"),
  svmHtlcContractAddress: Deno.env.get("svm_htlc_contract_address"),
};
```

### Error Handling
```typescript
// Use custom error classes
export class HTLCError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "HTLCError";
  }
}

// Wrap external calls
try {
  const result = await evmClient.createHTLC(params);
} catch (error) {
  throw new HTLCError(`Failed to create HTLC: ${error.message}`, "HTLC_CREATE_FAILED");
}
```

### Testing Patterns
```typescript
// Unit test example
Deno.test("generateSecret creates 32-byte secret", () => {
  const secret = generateSecret();
  assertEquals(secret.length, 32);
});

// Integration test with mocks
Deno.test("coordinator executes swap successfully", async () => {
  const mockEvmClient = createMockEvmClient();
  const coordinator = new Coordinator({ evmClient: mockEvmClient });
  
  const result = await coordinator.executeSwap(testParams);
  assertEquals(result.status, "completed");
});

// Snapshot testing for complex outputs
Deno.test("config loads correctly", async (t) => {
  const config = await loadConfig("./test-config.json");
  await assertSnapshot(t, config);
});
```

## Security Considerations

1. **Secret Management**
   - Generate secrets using `crypto.getRandomValues()`
   - Clear secrets from memory after use
   - Never log or persist secrets
   - Use constant-time comparison for secrets

2. **Private Key Handling**
   - Load from environment variables only
   - Validate key format on startup
   - Consider HSM integration for production
   - Implement key rotation mechanism

3. **Input Validation**
   - Validate all user inputs
   - Sanitize configuration files
   - Check address checksums
   - Verify amount bounds

4. **Network Security**
   - Use HTTPS/WSS for all RPC connections
   - Implement request timeouts
   - Add retry logic with exponential backoff
   - Monitor for rate limits

## Development Workflow

1. **Setup**
   ```bash
   # Clone and install
   git clone <repo>
   cd bl-cli
   
   # Copy environment template
   cp .env.example .env
   # Edit .env with your values
   
   # Run tests
   deno test
   
   # Start development
   deno task dev
   ```

2. **Testing Strategy**
   - Write interface and types first
   - Create test file with expected behavior
   - Run tests to see failures
   - Implement minimal code to pass tests
   - Refactor while keeping tests green
   - Add edge case tests

3. **Code Style**
   - Follow Deno style guide (enforced by `deno fmt`)
   - Use meaningful variable names
   - Keep functions small and focused
   - Prefer composition over inheritance
   - Use async/await over callbacks

## CLI Commands

### Main Commands
```bash
# Initialize coordinator
deno run --allow-net --allow-env --allow-read main.ts init

# Fund liquidity pools
deno run --allow-net --allow-env --allow-read main.ts fund --amount 10000

# Execute swap
deno run --allow-net --allow-env --allow-read main.ts swap --from evm --to solana --amount 1

# Monitor swaps
deno run --allow-net --allow-env --allow-read main.ts monitor

# Recover stuck swaps
deno run --allow-net --allow-env --allow-read main.ts recover
```

### Development Commands
```bash
# Run specific test
deno test src/crypto/secret_test.ts

# Run with permissions (for integration tests)
deno test --allow-net --allow-env tests/integration/

# Generate coverage report
deno test --coverage=coverage
deno coverage coverage --html

# Create executable
deno compile --allow-net --allow-env --allow-read -o bl-cli main.ts
```

## Production Considerations

1. **Deployment**
   - Compile to single executable with `deno compile`
   - Use Docker for consistent environment
   - Implement health checks endpoint
   - Add Prometheus metrics

2. **Monitoring**
   - Structured JSON logging
   - Correlation IDs for swap tracking
   - Alert on failed swaps
   - Dashboard for swap statistics

3. **High Availability**
   - State persistence to PostgreSQL/Redis
   - Leader election for multiple instances
   - Graceful shutdown handling
   - Automatic recovery on restart

4. **Performance**
   - Connection pooling for RPC clients
   - Batch RPC requests where possible
   - Implement caching for static data
   - Profile and optimize hot paths

## Current Implementation Status

### Phase 1: Foundation (Current Focus)
- [x] Project setup with Deno configuration
- [ ] Basic types and interfaces definition
- [ ] Cryptographic utilities with tests
- [ ] Configuration management
- [ ] Logger and retry utilities

### Phase 2: EVM Integration
- [ ] Viem client wrapper
- [ ] HTLC factory interaction
- [ ] Event monitoring
- [ ] Transaction management

### Phase 3: Coordinator Logic
- [ ] Swap state machine
- [ ] Liquidity management
- [ ] Recovery mechanisms
- [ ] CLI command implementation

### Phase 4: Integration Testing
- [ ] End-to-end swap tests
- [ ] Failure scenario tests
- [ ] Performance benchmarks
- [ ] Documentation updates

Note: Solana integration is deferred as the SVM contracts are not yet implemented.

## Key Implementation Notes

1. **Simplified for PoC**: Single coordinator handles all roles (maker, taker, resolver, relayer)
2. **Fixed Price Swaps**: No Dutch auction mechanism in this version
3. **Pre-funded Liquidity**: Coordinator holds 10,000 tokens on each chain
4. **Test Amounts**: Use 1 token (1e6 units) per swap for testing
5. **Timelock Structure**: 
   - Finality: 30 seconds
   - Resolver exclusive: 60 seconds
   - Public withdrawal: 300 seconds
   - Cancellation: 600 seconds
6. **Local EVM Contracts**: Token and HTLC contracts are already deployed on local testnet (see .env)

This implementation demonstrates the core HTLC bridge concept while keeping complexity manageable for a proof of concept.