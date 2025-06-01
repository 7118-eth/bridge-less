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

#### Contract Architecture: Factory Pattern (Proof of Concept)
Using a factory pattern for better isolation and security in our proof of concept:
- Each HTLC is deployed as a separate contract
- Factory maintains registry of all deployed HTLCs
- Better debugging and state isolation
- Higher gas costs acceptable for PoC phase

#### Key Components

1. **HTLCFactory.sol** - Factory contract that deploys and tracks HTLCs
   ```solidity
   // Factory state
   mapping(address => address[]) public userHTLCs;  // Track HTLCs by creator
   mapping(bytes32 => address) public htlcRegistry; // Map ID to HTLC contract
   address[] public allHTLCs;                       // All deployed HTLCs
   
   // Main function
   function createHTLC(
       bytes32 recipient,      // Solana address
       address token,          // ERC20 token
       uint256 amount,         // Token amount
       bytes32 hashlock,       // SHA256 hash
       uint256 timelock        // Unix timestamp
   ) external returns (address htlcContract, bytes32 htlcId);
   ```

2. **HTLC.sol** - Individual HTLC contract
   ```solidity
   // Immutable state (set in constructor)
   address public immutable factory;
   address public immutable sender;
   bytes32 public immutable recipient;  // Solana address
   address public immutable token;
   uint256 public immutable amount;
   bytes32 public immutable hashlock;
   uint256 public immutable timelock;
   
   // Mutable state
   bool public withdrawn;
   bool public refunded;
   
   // Core functions
   function claim(bytes32 preimage) external;
   function refund() external;
   ```

3. **Events for Coordinator**
   ```solidity
   // Factory events
   event HTLCDeployed(
       address indexed htlcContract,
       bytes32 indexed htlcId,
       address indexed sender,
       bytes32 recipient,
       address token,
       uint256 amount,
       bytes32 hashlock,
       uint256 timelock
   );
   
   // HTLC contract events
   event HTLCClaimed(
       address indexed htlcContract,
       bytes32 preimage,
       address claimant
   );
   
   event HTLCRefunded(
       address indexed htlcContract,
       address sender
   );
   ```

4. **HTLC ID Generation**
   - `htlcId = keccak256(abi.encodePacked(sender, recipient, token, amount, hashlock, timelock, block.timestamp))`
   - Used for cross-chain coordination
   - Stored in factory registry

### Security Considerations
- Use SHA256 for cross-chain compatibility (Solana native)
- Factory-only deployment (HTLCs can only be created through factory)
- Immutable HTLC parameters prevent tampering
- Check-Effects-Interactions pattern for token transfers
- Validate hashlock matches SHA256(preimage) on claim
- Enforce timelock strictly (no early refunds)
- SafeTransferFrom for ERC20 operations
- Factory cannot interfere with individual HTLC operations
- Each HTLC holds tokens directly (no central pool)

### Testing Strategy

1. **Factory Tests** (`test/HTLCFactory.t.sol`)
   - Test factory deployment
   - Test HTLC contract deployment through factory
   - Test registry functions (getUserHTLCs, getHTLC)
   - Test event emissions on deployment
   - Test multiple HTLC deployments
   - Verify factory cannot interfere with HTLCs

2. **HTLC Contract Tests** (`test/HTLC.t.sol`)
   - Test HTLC initialization with correct parameters
   - Test claiming with correct preimage
   - Test claiming with incorrect preimage (should fail)
   - Test refund after timelock expires
   - Test refund before timelock (should fail)
   - Test double-claim prevention
   - Test double-refund prevention
   - Test with 10k token amounts (as specified)
   - Test only sender can refund
   - Test anyone can claim with correct preimage

3. **Integration Tests** (`test/HTLCBridge.t.sol`)
   - Test end-to-end flow with Token.sol
   - Deploy multiple HTLCs through factory
   - Simulate bridge scenario with concurrent HTLCs
   - Test coordinator event tracking
   - Gas usage analysis

4. **Edge Cases**
   - Zero amount HTLCs (should revert)
   - Past timelock on creation (should revert)
   - Extremely large amounts
   - Invalid token addresses
   - Factory registry overflow scenarios

### Implementation Timeline
1. Create `HTLC.sol` contract with immutable state
2. Implement claim and refund functions with security checks
3. Create `HTLCFactory.sol` with deployment logic
4. Implement factory registry and tracking functions
5. Write comprehensive test suite for both contracts
6. Test integration with existing Token.sol
7. Add natspec documentation
8. Verify gas costs are acceptable for PoC

### Production Considerations
- 10-minute recovery timer (600 seconds) for testing
- Adjust timelock for Base network (2-second block time)
- Consider adding pause mechanism for emergencies
- Add owner functions for fee collection (if needed)
- Monitor for front-running on claims

### Coordinator Integration Points
- Listen to HTLCDeployed events from factory to trigger Solana-side creation
- Store mapping of htlcId to contract address for tracking
- Monitor HTLCClaimed events from individual HTLC contracts
- Track HTLCRefunded events for liquidity management
- Use htlcId as cross-chain identifier
- Query factory for active HTLCs via getUserHTLCs and htlcRegistry

### Additional Factory Pattern Considerations
- Gas cost for deployment: ~500k-1M gas per HTLC (acceptable for PoC)
- Each HTLC is independent - failure of one doesn't affect others
- Factory upgrade path: deploy new factory, migrate coordinator
- Consider using CREATE2 for deterministic addresses (optional)
- HTLCs are minimal - only essential functions to reduce deployment cost