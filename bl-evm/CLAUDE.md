# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Test
- **Build**: `forge build` - Compiles all Solidity contracts
- **Test**: `forge test` - Runs all tests
- **Test (verbose)**: `forge test -vvv` - Runs tests with detailed output
- **Test (specific)**: `forge test --match-test <testName>` - Run specific test function
- **Test (specific contract)**: `forge test --match-contract <ContractName>` - Run tests for specific contract

### Code Quality
- **Format**: `forge fmt` - Formats Solidity code according to style guide
- **Gas Snapshots**: `forge snapshot` - Creates gas usage snapshots for optimization

### Local Development
- **Local Node**: `anvil` - Starts local Ethereum node for testing
- **Deploy**: `forge script script/<ScriptName>.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY>` - Deploy contracts
- **Interact**: `cast <subcommand>` - CLI for contract interaction

## Architecture

This is a Foundry-based Solidity project for EVM smart contract development. The codebase uses:

- **Soldeer**: Native package manager for dependencies (configured in `foundry.toml`)
- **forge-std**: Foundry's testing framework providing utilities like `vm` cheatcodes
- **solmate**: Gas-optimized contract implementations (currently using ERC20)

### Structure
- `src/`: Smart contracts (currently `Token.sol` - ERC20 implementation)
- `test/`: Test files following `.t.sol` naming convention
- `script/`: Deployment scripts (`.s.sol` files)
- `lib/` & `dependencies/`: External libraries managed by Soldeer

### Testing Approach
Tests inherit from `forge-std/Test.sol` and use:
- `vm.prank()` for address impersonation
- `vm.expectRevert()` for failure testing
- Standard assertions (`assertTrue`, `assertEq`)

The project appears to be part of a "bridge-less" solution for 1inch protocol, currently in early development with basic ERC20 token infrastructure.

## HTLC Bridge Implementation Plan

### Overview
Building a trustless bridge between EVM and Solana using Hashed Timelock Contracts (HTLCs). The bridge operates with liquidity providers on both chains, coordinated by an external CLI tool.

### Core Design Decisions

#### Contract Architecture: Mapping-Based Approach
Using a single `HTLCEscrow` contract with mappings for gas efficiency and simplicity:
- Each HTLC stored in a mapping with unique ID
- ID generation: `keccak256(abi.encodePacked(sender, recipient, amount, token, hashlock, nonce))`
- Supports multiple concurrent HTLCs
- More gas-efficient than factory pattern for high-volume bridge

#### Key Components

1. **HTLCEscrow.sol** - Main contract
   ```solidity
   struct HTLC {
       address sender;          // Liquidity provider on EVM side
       bytes32 recipient;       // Solana address (e.g., DbDa7MHwnNkxZrbQY8qtfhfAGUzBSapLGbafDFwD9Z5X)
       address token;           // ERC20 token address
       uint256 amount;          // Token amount
       bytes32 hashlock;        // SHA256 hash of the secret
       uint256 timelock;        // Unix timestamp for refund eligibility
       bool withdrawn;          // Claimed/refunded flag
       bool refunded;           // Track if refunded
   }
   ```

2. **Core Functions**
   - `createHTLC(bytes32 recipient, address token, uint256 amount, bytes32 hashlock, uint256 timelock)`
   - `claimHTLC(bytes32 htlcId, bytes32 preimage)`
   - `refundHTLC(bytes32 htlcId)`
   - `getHTLC(bytes32 htlcId)` - View function

3. **Events for Coordinator**
   ```solidity
   event HTLCCreated(
       bytes32 indexed htlcId,
       address indexed sender,
       bytes32 indexed recipient,
       address token,
       uint256 amount,
       bytes32 hashlock,
       uint256 timelock
   );
   
   event HTLCClaimed(
       bytes32 indexed htlcId,
       bytes32 preimage,
       address claimant
   );
   
   event HTLCRefunded(
       bytes32 indexed htlcId,
       address sender
   );
   ```

### Security Considerations
- Use SHA256 for cross-chain compatibility (Solana native)
- Reentrancy guards on all state-changing functions
- Check-Effects-Interactions pattern for token transfers
- Validate hashlock matches SHA256(preimage) on claim
- Enforce timelock strictly (no early refunds)
- SafeTransferFrom for ERC20 operations

### Testing Strategy

1. **Unit Tests** (`test/HTLCEscrow.t.sol`)
   - Test HTLC creation with valid parameters
   - Test claiming with correct preimage
   - Test claiming with incorrect preimage (should fail)
   - Test refund after timelock expires
   - Test refund before timelock (should fail)
   - Test double-claim prevention
   - Test double-refund prevention
   - Test with multiple HTLCs concurrently
   - Test with 10k token amounts (as specified)

2. **Integration Tests**
   - Test with actual Token.sol contract
   - Simulate bridge scenario with multiple HTLCs
   - Gas optimization tests

3. **Edge Cases**
   - Zero amount HTLCs
   - Past timelock on creation
   - Extremely large amounts
   - Hash collision scenarios (theoretical)

### Implementation Timeline
1. Create `HTLCEscrow.sol` with core structure
2. Implement state variables and mappings
3. Add createHTLC function with proper validations
4. Add claim and refund logic with security checks
5. Write comprehensive test suite
6. Add natspec documentation
7. Gas optimization pass

### Production Considerations
- 10-minute recovery timer (600 seconds) for testing
- Adjust timelock for Base network (2-second block time)
- Consider adding pause mechanism for emergencies
- Add owner functions for fee collection (if needed)
- Monitor for front-running on claims

### Coordinator Integration Points
- Listen to HTLCCreated events to trigger Solana-side creation
- Monitor HTLCClaimed events to release funds on opposite chain
- Track HTLCRefunded events for liquidity management
- Use htlcId as cross-chain identifier