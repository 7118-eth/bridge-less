# Development Guide

## Development Workflow

### 1. Setup
```bash
# Clone and install
git clone <repo>
cd bl-cli

# .env file is already configured with deployed contracts
# No need to copy .env.example - it's just a template

# Run tests
deno task test

# Start development
deno task dev
```

### 2. Testing Strategy
- Write interface and types first
- Create test file with expected behavior
- Run tests to see failures
- Implement minimal code to pass tests
- Refactor while keeping tests green
- Add edge case tests

### 3. Code Style
- Follow Deno style guide (enforced by `deno fmt`)
- Use meaningful variable names
- Keep functions small and focused
- Prefer composition over inheritance
- Use async/await over callbacks

## Development Process (mandatory for this project)

### 1. Interface-First Development:
- Define TypeScript interfaces for all modules FIRST
- Use comprehensive JSDoc comments
- Interfaces should be in `types.ts` files within each module
- Export all public types from module index

### 2. Test-Driven Development (TDD):
- Write tests BEFORE implementation
- Use `_test.ts` suffix for test files (Deno convention)
- Run `deno test --watch` during development
- Achieve 100% test coverage for critical paths
- Mock external dependencies (blockchain RPCs)

### 3. Documentation Requirements:
- Use JSDoc for all public functions and types
- Include `@example` sections in JSDoc
- Document error cases with `@throws`
- Keep inline comments minimal and meaningful

### 4. Version Control:
- Commit after EVERY completed step
- Use clear, descriptive commit messages
- Only stage files in the bl-cli directory
- Keep commits atomic and focused

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

## Testing Approach
Tests use Deno's built-in test runner:
- `Deno.test()` for test definitions
- `assertEquals()`, `assertThrows()` from `jsr:@std/assert`
- Mock functions with `jsr:@std/testing/mock`
- Snapshot testing with `jsr:@std/testing/snapshot`

## Security Considerations

### 1. Secret Management
- Generate secrets using `crypto.getRandomValues()`
- Clear secrets from memory after use
- Never log or persist secrets
- Use constant-time comparison for secrets

### 2. Private Key Handling
- Load from environment variables only
- Validate key format on startup
- Consider HSM integration for production
- Implement key rotation mechanism

### 3. Input Validation
- Validate all user inputs
- Sanitize configuration files
- Check address checksums
- Verify amount bounds

### 4. Network Security
- Use HTTPS/WSS for all RPC connections
- Implement request timeouts
- Add retry logic with exponential backoff
- Monitor for rate limits

## Production Considerations

### 1. Deployment
- Compile to single executable with `deno compile`
- Use Docker for consistent environment
- Implement health checks endpoint
- Add Prometheus metrics

### 2. Monitoring
- Structured JSON logging
- Correlation IDs for swap tracking
- Alert on failed swaps
- Dashboard for swap statistics

### 3. High Availability
- State persistence to PostgreSQL/Redis
- Leader election for multiple instances
- Graceful shutdown handling
- Automatic recovery on restart

### 4. Performance
- Connection pooling for RPC clients
- Batch RPC requests where possible
- Implement caching for static data
- Profile and optimize hot paths

## 🧪 Test Commands
```bash
# Run all tests (should show 158 passing steps)
deno task test

# Run tests in watch mode
deno task test:watch

# Run specific module tests
deno test --no-check --allow-env --allow-read --allow-write src/coordinator/coordinator_test.ts
deno test --no-check --allow-env --allow-read --allow-write src/crypto/secret_test.ts

# Run with coverage
deno task test:coverage
```

## Development Commands
```bash
# Run all tests
deno task test

# Run tests in watch mode
deno task test:watch

# Run specific test
deno test --no-check --allow-env --allow-read --allow-write src/crypto/secret_test.ts

# Generate coverage report
deno task test:coverage

# Lint and format code
deno task lint

# Format code
deno task fmt

# Create executable
deno task build
```

## Important Implementation Details

### Environment Setup
- **IMPORTANT**: Local EVM contracts are already deployed and configured in the actual `.env` file (not .env.example)
- All deno tasks automatically load `.env` using `--env-file=.env` flag
- Token contract and HTLC factory addresses are pre-configured in `.env`
- Test accounts with private keys are available in `.env`
- **Never use .env.example for actual commands** - it's just a template

### Key Design Decisions
1. **Interface-First Development**: All modules have comprehensive TypeScript interfaces
2. **Test-Driven Development**: Tests written before implementation
3. **Modular Architecture**: Clear separation of concerns (crypto, config, chains, etc.)
4. **Error Handling**: Custom error classes for each module (CryptoError, ConfigError, etc.)
5. **Security**: Private keys validated, secrets never logged, constant-time comparisons

### Testing Approach
- Using Deno's built-in test runner
- Tests require permissions: `deno test --allow-env --allow-read --allow-write`
- Mock external dependencies for unit tests
- Integration tests can use real local contracts

## 🔑 Environment Configuration
**CRITICAL**: The `.env` file is already configured with deployed contracts and test accounts!

```bash
# .env file contains (already configured):
evm_coordinator_private_key=0x...     # Pre-configured test account
evm_user_private_key=0x...           # Pre-configured test account  
evm_user_address=0x...               # Pre-configured test address
evm_token_contract_address=0x...      # Already deployed on local network
evm_htlc_factory_contract_address=0x... # Already deployed on local network

# Network configuration (pre-configured):
evm_rpc=http://127.0.0.1:8545
evm_rpc_ws=ws://127.0.0.1:8545
```

**All deno tasks automatically load .env using `--env-file=.env` flag**

## File Locations
- **Types**: Always in `types.ts` files
- **Tests**: Use `_test.ts` suffix
- **Exports**: Through `index.ts` files
- **Config**: Environment variables in `.env`