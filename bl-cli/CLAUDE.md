# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bridge-less HTLC coordinator CLI for EVM ↔ Solana swaps. A Deno-based TypeScript project implementing a coordinator that acts as maker, taker, resolver, and relayer in this proof-of-concept implementation.

**Current Status**: Phase 1-3 COMPLETE ✅ | Phase 4 Ready for Implementation | ALL 158 TESTS PASSING ✅

## Quick Start

```bash
# .env file is already configured with deployed contracts
# Run tests
deno task test

# Start development
deno task dev

# Execute commands (auto-loads .env)
deno task init
deno task swap --amount 1000000
deno task monitor
```

## Core Commands

### Development
- `deno task test` - Run all tests with proper permissions
- `deno task test:watch` - Run tests in watch mode
- `deno task lint` - Lint and format code
- `deno task fmt` - Format code
- `deno task build` - Create standalone executable

### CLI Operations (via deno tasks)
- `deno task init` - Initialize coordinator
- `deno task fund` - Fund coordinator wallets
- `deno task swap` - Execute cross-chain swap
- `deno task monitor` - Monitor active swaps
- `deno task recover` - Recover stuck swaps
- `deno task status` - Check swap status
- `deno task help` - Show usage

## Architecture

### Tech Stack
- **Deno**: Modern TypeScript runtime with built-in tooling
- **viem**: Type-safe Ethereum client (`jsr:@wevm/viem@2`)
- **@solana/web3.js**: Solana client (`npm:@solana/web3.js@2`)
- **Web Crypto API**: For SHA256 hashing and secret generation

### Project Structure
```
bl-cli/
├── main.ts              # CLI entry point
├── src/
│   ├── coordinator/     # Core swap orchestration
│   ├── chains/evm/      # EVM integration (complete)
│   ├── chains/solana/   # Solana integration (mocked)
│   ├── crypto/          # Secret management
│   ├── config/          # Configuration loading
│   └── utils/           # Logger, retry logic
├── abi/                 # Contract ABIs
├── docs/                # Detailed documentation
└── .env                 # Pre-configured with deployed contracts
```

## Development Guidelines

### Mandatory Process
1. **Interface-First**: Define TypeScript interfaces in `types.ts` files FIRST
2. **Test-Driven**: Write tests (`_test.ts`) BEFORE implementation
3. **Documentation**: Use JSDoc with `@example` sections
4. **Version Control**: Commit after EVERY completed step

### Key Patterns

```typescript
// Package imports
import { assertEquals } from "jsr:@std/assert@1";
import * as viem from "jsr:@wevm/viem@2";
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts"; // Critical!

// Async crypto operations (MUST await)
const secretBytes = await this.secretManager.generateSecret();
const hashResult = await this.secretManager.hashSecret(secretBytes);
const hashLock = hashResult.hashHex;

// Custom error classes
export class HTLCError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "HTLCError";
  }
}
```

## Critical Technical Details

### Known Issues & Solutions
1. **Async Crypto**: ALL crypto operations are async - always use `await`
2. **Import Paths**: Use `jsr:@wevm/viem@2/accounts` for privateKeyToAccount
3. **Test Mode**: Use `testMode` flag to disable async processing in tests
4. **Mock Strategy**: Keep mocks for unit tests, use real contracts for integration

### Environment Setup
- `.env` file is **already configured** with deployed contracts
- All deno tasks automatically load `.env` using `--env-file=.env`
- Private keys must be 64 hex chars with 0x prefix
- **Never use .env.example** - it's just a template

### Architecture Decisions
- In-memory Map for swap states (sufficient for PoC)
- State machine: pending → source_locked → destination_locked → completed/failed
- Custom error classes per module with error codes
- Structured logging with correlation IDs

## Detailed Documentation

For comprehensive information, see:
- [`docs/implementation-status.md`](docs/implementation-status.md) - Phase completion details and test status
- [`docs/technical-details.md`](docs/technical-details.md) - Architecture patterns and bug fixes
- [`docs/development-guide.md`](docs/development-guide.md) - Development workflow and guidelines

## Key Implementation Notes

1. **Simplified PoC**: Single coordinator handles all roles
2. **Fixed Price**: No Dutch auction in this version
3. **Pre-funded**: 10,000 tokens per chain
4. **Test Amounts**: Use 1 token (1e6 units) per swap
5. **Timelocks**: 30s finality, 60s resolver, 300s public, 600s cancel

## Swap Flow

1. **Initiate**: Coordinator generates secret, creates swap record
2. **Lock Source**: Create HTLC on source chain
3. **Lock Destination**: Create counter-HTLC on destination
4. **Monitor**: Watch for secret reveal via withdrawals
5. **Complete**: Use revealed secret to complete both sides

## Next Steps

1. **Real Contract Testing**: Connect to local EVM node with deployed contracts
2. **WebSocket Events**: Implement real-time monitoring
3. **Solana Integration**: When SVM contracts are ready
4. **Production**: Database persistence, monitoring, scaling

---

