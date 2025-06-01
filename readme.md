# Bridge-Less: Cross-Chain HTLC Bridge (PoC)

A proof-of-concept implementation of a FusionPlus-inspired bridge between EVM and Solana chains using Hash Time-Locked Contracts (HTLCs).

## Overview

This project demonstrates a minimal cross-chain atomic swap mechanism where a coordinator manages the entire swap lifecycle. Unlike traditional atomic swaps, this implementation follows 1inch's FusionPlus approach where:

- A single coordinator acts as maker, taker, resolver, and relayer
- The coordinator holds the secret and reveals it after both escrows are created
- Multi-phase timelocks ensure security and allow for recovery
- No Dutch auction mechanism (fixed price swaps for simplicity)

## Project Structure

The monorepo contains three main components and a git submodule:

### 1. `bl-cli/` - Coordinator CLI (TypeScript/Deno)

The command-line interface that orchestrates cross-chain swaps:

- **Tech Stack**: Deno runtime, viem (Ethereum), @solana/web3.js
- **Key Features**:
  - Secret generation and management
  - Pre-funds liquidity pools (10,000 tokens per chain)
  - Cross-chain HTLC coordination
  - Event monitoring and state tracking
  - Timeout handling and recovery

**Commands**:
```bash
# Initialize coordinator
deno run --allow-net --allow-env --allow-read main.ts init

# Fund liquidity pools
deno run --allow-net --allow-env --allow-read main.ts fund --amount 10000

# Execute swap
deno run --allow-net --allow-env --allow-read main.ts swap --from evm --to solana --amount 1

# Monitor active swaps
deno run --allow-net --allow-env --allow-read main.ts monitor
```

### 2. `bl-evm/` - EVM Smart Contracts (Solidity/Foundry)

Solidity contracts for the Ethereum side of the bridge:

- **Tech Stack**: Foundry, Solidity 0.8.x
- **Contracts**:
  - `HTLCFactory.sol` - Deploys and tracks individual HTLC contracts
  - `HTLC.sol` - Time-locked escrow with SHA256 hash verification
  - `Token.sol` - ERC20 token with 6 decimals for testing

**Key Design**:
- Factory pattern for HTLC deployment (better isolation)
- Multi-phase timelocks (finality, resolver-only, public, cancellation)
- Immutable contract parameters prevent tampering
- Events for coordinator tracking

**Gas Costs** (with optimizer):
- HTLC Deployment: ~747k gas
- Withdraw/Cancel: ~57k gas

### 3. `bl-svm/` - Solana Program (Rust/Anchor)

Anchor-based program for the Solana side:

- **Tech Stack**: Anchor Framework, Rust
- **Architecture**:
  - PDA-based HTLCs (no factory needed)
  - Native SHA256 support for cross-chain compatibility
  - Token vault pattern for secure SPL token handling

**Account Model**:
- Each HTLC is a unique PDA derived from `htlc_id`
- Associated token account holds escrowed funds
- Events mirror EVM side for coordinator tracking

### 4. `cross-chain-swap/` - Production-Ready 1inch Contracts (Git Submodule)

A modified version of 1inch's Fusion Atomic Swaps protocol adapted for Ethereum-Solana swaps:

- **Branch**: `feature/eth-solana-atomic-swap`
- **Key Adaptations**:
  - **SHA256 Hashing**: Changed from Keccak-256 to SHA-256 for Solana compatibility
  - **Non-EVM Address Support**: Added `bytes32 dstRecipient` field for 32-byte Solana addresses
  - **Backward Compatible**: Maintains compatibility with EVM-to-EVM swaps
  - **Chain Detection**: MSB of `dstChainId` indicates non-EVM chains (1 = non-EVM)

**Technical Details**:
- Modified `BaseEscrow.sol` and `BaseEscrowFactory.sol` contracts
- Emits `NonEVMRecipient` event for cross-chain monitoring
- Immutables size increased from 160 to 192 bytes
- All tests updated and passing with SHA-256
- Solana Chain ID: 1399811149 (with non-EVM flag: `0x8000...537A8C2D`)

This submodule represents the future production path beyond the PoC, providing battle-tested contracts with proper security audits and comprehensive features like partial fills via Merkle trees and rescue functions.

## How It Works

### Token Setup
- Tokens use 6 decimals (1 token = 1,000,000 units)
- Coordinator pre-funds 10,000 tokens on each chain
- Test swaps use 1 token amounts

### Swap Flow

1. **Initiation**:
   - User requests swap (e.g., EVM → Solana)
   - Coordinator generates secret and computes SHA256 hash
   
2. **Escrow Creation**:
   - Coordinator creates HTLC on source chain with user's tokens
   - Coordinator creates HTLC on destination chain with own tokens
   - Both HTLCs use the same hash but different timelocks

3. **Finality Period**:
   - No operations allowed (prevents reorg attacks)
   - Coordinator waits for both escrows to be confirmed

4. **Secret Revelation**:
   - Coordinator withdraws from source chain (reveals secret)
   - Coordinator withdraws from destination chain
   - User receives tokens on destination chain

5. **Recovery**:
   - If swap fails, funds can be recovered after timeout
   - Multiple phases ensure proper incentives

### Timelock Structure

1. **Finality Deadline** (30s): No operations allowed
2. **Resolver Deadline** (60s): Only coordinator can withdraw
3. **Public Deadline** (5min): Anyone can help complete swap
4. **Cancellation Deadline** (10min): Refund becomes available

## Development Status

### ✅ Completed
- **Foundation** (bl-cli):
  - Cryptographic utilities with SHA256 hashing
  - Configuration management with validation
  - Structured logging and retry mechanisms
  
- **EVM Contracts** (bl-evm):
  - HTLC and Factory contracts with full test coverage
  - 32 tests covering all scenarios
  - Gas-optimized implementation
  - Deployed to local testnet

### ⏳ In Progress
- **Solana Program** (bl-svm):
  - Account structures defined
  - Instruction handlers in development
  
- **Coordinator CLI** (bl-cli):
  - EVM integration using viem
  - Event monitoring system
  - CLI commands implementation

## Security Considerations

1. **Hash Function**: SHA256 used for cross-chain compatibility
2. **Timelock Validation**: Strict ordering enforced
3. **Immutable Parameters**: Prevent post-deployment tampering
4. **Event Monitoring**: Comprehensive logging for tracking
5. **Error Handling**: Custom errors with clear messages

## Known Limitations (PoC)

This is a simplified proof of concept. Production would require:

1. **Decentralization**: Multiple competing resolvers
2. **Economic Incentives**: Dutch auction for best rates
3. **Governance**: DAO control over parameters
4. **KYC/Legal**: Compliance framework for resolvers
5. **Partial Fills**: Support for large orders
6. **Safety Deposits**: Incentive mechanisms

## Quick Start

### Prerequisites
- Deno 2.0+
- Foundry
- Rust & Anchor CLI
- Node.js 18+

### Setup

1. **Clone the repository**:
   ```bash
   git clone <repo>
   cd bridge-less
   ```

2. **EVM Setup**:
   ```bash
   cd bl-evm
   forge install
   forge build
   forge test
   ```

3. **Solana Setup**:
   ```bash
   cd bl-svm
   yarn install
   anchor build
   anchor test
   ```

4. **CLI Setup**:
   ```bash
   cd bl-cli
   cp .env.example .env
   # Edit .env with your RPC endpoints and private keys
   deno test
   ```

## Architecture Decisions

1. **Monorepo Structure**: Keeps all components together for easier development
2. **Interface-First Development**: All modules start with TypeScript/Rust interfaces
3. **Test-Driven Development**: Tests written before implementation
4. **Modular Design**: Clear separation of concerns across modules
5. **Event-Driven**: Coordinator reacts to on-chain events

## Testing

Each component has comprehensive test coverage:

- **EVM**: 32 Foundry tests covering all HTLC scenarios
- **Solana**: Anchor tests with bankrun for fast iteration  
- **CLI**: Deno tests with mocked blockchain interactions

Run all tests:
```bash
# EVM
cd bl-evm && forge test

# Solana  
cd bl-svm && anchor test

# CLI
cd bl-cli && deno test --allow-env --allow-read --allow-write
```

## Contributing

This is a proof of concept for educational purposes. Key areas for improvement:

1. Implement Solana program completion
2. Add coordinator swap execution logic
3. Create integration tests across all components
4. Add monitoring dashboard
5. Implement safety deposit mechanisms

## License

MIT

## Acknowledgments

Inspired by 1inch's FusionPlus architecture and the broader DeFi community's work on cross-chain interoperability. 
