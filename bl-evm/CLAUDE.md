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
- `src/`: Smart contracts
  - `Token.sol` - ERC20 implementation with 6 decimals
  - `HTLC.sol` - Individual HTLC contract implementation
  - `HTLCFactory.sol` - Factory for deploying and tracking HTLCs
  - `interfaces/` - Contract interfaces
    - `IHTLC.sol` - HTLC interface
    - `IHTLCFactory.sol` - Factory interface
- `test/`: Test files following `.t.sol` naming convention
  - `Token.t.sol` - Token contract tests
  - `HTLC.t.sol` - HTLC unit tests
  - `HTLCFactory.t.sol` - Factory unit tests
  - `HTLCBridge.t.sol` - Integration tests for bridge scenarios
- `script/`: Deployment scripts (`.s.sol` files)
- `lib/` & `dependencies/`: External libraries managed by Soldeer
- `.gas-snapshot` - Gas usage benchmarks for all functions

### Testing Approach
Tests inherit from `forge-std/Test.sol` and use:
- `vm.prank()` for address impersonation
- `vm.expectRevert()` for failure testing
- Standard assertions (`assertTrue`, `assertEq`)

**Development Process (mandatory for this project):**

1. **Interface-First Development:**
   - ALWAYS create interfaces FIRST before any implementation
   - Define all public functions, events, and errors in the interface
   - Use comprehensive NatSpec documentation on interfaces
   - Interfaces should be in `src/interfaces/` directory

2. **Test-Driven Development (TDD):**
   - Write tests based on interfaces BEFORE implementation
   - Run tests to see them fail (red phase)
   - Write minimal code to make tests pass (green phase)
   - Refactor while keeping tests green
   - Run `forge test` after every change to ensure nothing breaks

3. **Documentation Requirements:**
   - Use Ethereum Natural Specification Format (NatSpec) for ALL contracts and interfaces
   - Document every function with:
     - `@notice` - Explain what the function does
     - `@dev` - Technical details for developers
     - `@param` - Document each parameter
     - `@return` - Document return values
   - Document every event and error with `@notice`
   - Document contract/interface level with `@title`, `@author`, and `@notice`

The project appears to be part of a "bridge-less" solution for 1inch protocol, currently in early development with basic ERC20 token infrastructure.

## HTLC Bridge Implementation Plan

### Overview
Building a minimal FusionPlus-inspired bridge between EVM and Solana. Based on 1inch's atomic swap approach where a resolver (our coordinator) manages the entire swap process.

**Key Differences from Classic Atomic Swaps:**
- Coordinator acts as maker, taker, resolver, and relayer (for PoC simplicity)
- Coordinator holds the secret and reveals it after both escrows are created
- Coordinator creates BOTH escrows (source and destination)
- No Dutch auction for PoC - fixed price swaps

**Token Setup:**
- Token uses 6 decimals (1 token = 1e6 units)
- Coordinator pre-funds 10,000 tokens (10_000e6 units) on each chain
- Individual swaps use 1 token (1e6 units) for testing

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
   mapping(address => address[]) public resolverHTLCs;  // Track HTLCs by resolver
   mapping(bytes32 => address) public htlcRegistry;    // Map ID to HTLC contract
   address[] public allHTLCs;                          // All deployed HTLCs
   
   // Main function (FusionPlus style - resolver creates escrow)
   function createHTLC(
       address srcAddress,     // Maker's address (source of funds)
       bytes32 dstAddress,     // Maker's Solana address (destination)
       address srcToken,       // ERC20 token on source chain (EVM)
       bytes32 dstToken,       // SPL token mint on destination chain (Solana)
       uint256 amount,         // Token amount
       bytes32 hashlock       // SHA256 hash
   ) external returns (address htlcContract, bytes32 htlcId);
   ```

2. **HTLC.sol** - Individual HTLC contract (FusionPlus style)
   ```solidity
   // Immutable state (set in constructor)
   address public immutable factory;
   address public immutable resolver;     // Who creates the escrow (coordinator)
   address public immutable srcAddress;   // Source of funds (maker on source chain)
   bytes32 public immutable dstAddress;   // Recipient (maker's Solana address)
   address public immutable srcToken;     // ERC20 token on source chain (EVM)
   bytes32 public immutable dstToken;     // SPL token mint on destination chain (Solana)
   uint256 public immutable amount;
   bytes32 public immutable hashlock;
   
   // Timelock structure (FusionPlus style)
   uint256 public immutable finalityDeadline;    // When secret can be revealed
   uint256 public immutable resolverDeadline;    // Exclusive resolver withdraw period
   uint256 public immutable publicDeadline;      // Anyone can withdraw for maker
   uint256 public immutable cancellationDeadline; // Refund to resolver
   
   // Mutable state
   bool public withdrawn;
   bool public cancelled;
   
   // Core functions
   function withdrawToDestination(bytes32 preimage) external;  // For resolver
   function publicWithdraw(bytes32 preimage) external;         // For anyone after resolver deadline
   function cancel() external;                                  // Return funds to srcAddress
   ```

3. **Events for Coordinator**
   ```solidity
   // Factory events
   event HTLCDeployed(
       address indexed htlcContract,
       bytes32 indexed htlcId,
       address indexed resolver,
       address srcAddress,
       bytes32 dstAddress,
       address token,
       uint256 amount,
       bytes32 hashlock,
       uint256 finalityDeadline
   );
   
   // HTLC contract events
   event HTLCWithdrawn(
       address indexed htlcContract,
       bytes32 preimage,
       address executor      // Who executed the withdrawal
   );
   
   event HTLCCancelled(
       address indexed htlcContract,
       address executor
   );
   ```

4. **HTLC ID Generation**
   - `htlcId = keccak256(abi.encodePacked(resolver, srcAddress, dstAddress, srcToken, dstToken, amount, hashlock, block.timestamp))`
   - Includes both source and destination tokens for uniqueness
   - Used for cross-chain coordination
   - Stored in factory registry

### Security Considerations
- Use SHA256 for cross-chain compatibility (Solana native)
- Factory-only deployment (HTLCs can only be created through factory)
- Immutable HTLC parameters prevent tampering
- Check-Effects-Interactions pattern for token transfers
- Validate hashlock matches SHA256(preimage) on withdraw
- Multi-phase timelock system (FusionPlus style):
  - Finality period: No operations allowed (prevent reorg attacks)
  - Resolver exclusive period: Only resolver can withdraw
  - Public period: Anyone can help complete the swap
  - Cancellation period: Return funds if swap failed
- SafeTransferFrom for ERC20 operations
- Resolver must provide tokens upfront (not pull from maker)
- Validation of both srcToken and dstToken (non-zero addresses)
- dstToken included in HTLC ID to prevent token mismatch attacks

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
   - Test with 1 token swaps (1e6 units with 6 decimals)
   - Test only sender can refund
   - Test anyone can claim with correct preimage

3. **Integration Tests** (`test/HTLCBridge.t.sol`)
   - Pre-fund liquidity providers with 10k tokens (10_000e6 units)
   - Test end-to-end flow with Token.sol
   - Deploy multiple HTLCs with 1 token amounts (1e6 units)
   - Simulate bridge scenario with concurrent HTLCs
   - Test coordinator event tracking
   - Verify liquidity provider balances after swaps
   - Gas usage analysis

4. **Edge Cases**
   - Zero amount HTLCs (should revert)
   - Past timelock on creation (should revert)
   - Extremely large amounts
   - Invalid token addresses
   - Factory registry overflow scenarios

### Implementation Status ✅
1. ✅ Created `HTLC.sol` contract with immutable state
2. ✅ Implemented claim and refund functions with security checks
3. ✅ Created `HTLCFactory.sol` with deployment logic
4. ✅ Implemented factory registry and tracking functions
5. ✅ Written comprehensive test suite (32 tests, all passing)
6. ✅ Tested integration with existing Token.sol
7. ✅ Added NatSpec documentation to all contracts and interfaces
8. ✅ Verified gas costs are acceptable for PoC

### Gas Costs (Optimized with dstToken)
With Solidity optimizer enabled (800 runs) and cross-chain token support:
- **HTLC Deployment**: ~747k gas (includes dstToken storage)
- **HTLCFactory Deployment**: ~1.10M gas
- **Token Deployment**: ~732k gas
- **HTLC Operations**:
  - Withdraw: ~57k gas
  - Cancel: ~56k gas
  - Public withdraw: ~57k gas

### Production Considerations
- Timelock durations for testing (adjust for Base 2-second blocks):
  - Finality period: 30 seconds (prevent reorgs)
  - Resolver exclusive: 60 seconds
  - Public withdrawal: 300 seconds (5 minutes)
  - Cancellation deadline: 600 seconds (10 minutes)
- No safety deposits for PoC (coordinator handles everything)
- Consider adding pause mechanism for emergencies
- Monitor for front-running during public withdrawal period

### Coordinator Integration Points (FusionPlus Flow)
1. **Swap Initiation**:
   - Coordinator generates secret and computes SHA256 hash
   - Creates HTLC on source chain (EVM) with maker's tokens
   - Creates HTLC on destination chain (Solana) with resolver's tokens
   
2. **Secret Management**:
   - Coordinator holds secret until both HTLCs pass finality period
   - Reveals secret only after verifying both escrows exist
   
3. **Completion**:
   - Withdraws on source chain (gets maker's tokens)
   - Withdraws on destination chain (sends tokens to maker's Solana address)
   
4. **Monitoring**:
   - Track HTLCDeployed events for htlcId mapping
   - Monitor finality deadlines before revealing secret
   - Execute withdrawals during exclusive period

### Additional Factory Pattern Considerations
- Gas cost for deployment: ~747k gas per HTLC with optimizer and dstToken (acceptable for PoC)
- Each HTLC is independent - failure of one doesn't affect others
- Factory upgrade path: deploy new factory, migrate coordinator
- HTLCs are minimal - only essential functions to reduce deployment cost
- No safety deposits in PoC - simplified economics
- Cross-chain token mapping handled on-chain (not external)

### Key Implementation Insights
1. **Interface-First Development**: All contracts implement well-defined interfaces
2. **Test Coverage**: 100% test coverage with 32 tests covering:
   - Unit tests for HTLC operations
   - Factory deployment and registry tests
   - Integration tests simulating bridge scenarios
   - Edge cases and security tests
3. **Gas Optimization**: Enabling Solidity optimizer reduced deployment costs by 35%
4. **Security Features**:
   - Immutable contract parameters prevent tampering
   - Multi-phase timelock system prevents race conditions
   - Check-Effects-Interactions pattern for reentrancy protection
   - Comprehensive input validation in factory
5. **Coordinator Flow Verified**:
   - Can handle multiple concurrent HTLCs
   - Public withdrawal assistance works as designed
   - Cancellation mechanism protects against failed swaps

### Cross-Chain Token Specification ✅
**Issue Resolved**: The implementation now properly stores both source and destination token addresses.

**Implementation Details**:
- HTLC stores both `srcToken` (EVM address) and `dstToken` (Solana SPL token mint as bytes32)
- HTLCFactory validates both tokens and includes `dstToken` in HTLC ID generation
- All tests use example Solana token addresses (e.g., `SOLANA_USDC`)
- No backward compatibility needed since this is a PoC

**Token Mapping Example**:
```solidity
// EVM USDC → Solana USDC
srcToken: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48  // USDC on Ethereum
dstToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  // USDC on Solana (stored as bytes32)
```

This ensures the coordinator knows exactly which token to release on each chain.

### Known Limitations & Production Considerations ⚠️

**1. HTLC ID Generation Issues**:
- Uses `keccak256` which is not available on Solana (Solana uses SHA256)
- Includes `block.timestamp` which will differ between chains
- Cannot generate matching IDs on both chains
- **Production Fix**: Use SHA256 with chain-agnostic data (hashlock + amount + nonce)

**2. Centralized Coordinator Risks**:
- Single point of failure - if coordinator goes offline, swaps fail
- Coordinator holds all liquidity and secrets
- No slashing or penalties for misbehavior
- Trust assumptions: users must trust coordinator won't steal funds
- **Production Fix**: Implement decentralized coordinator network with staking/slashing

**3. Cross-Chain Synchronization**:
- No direct chain communication - relies entirely on coordinator
- No on-chain verification that matching HTLC exists on other chain
- Coordinator could create mismatched HTLCs (different amounts/tokens)
- **Production Fix**: Add merkle proofs or oracle-based verification

**4. Token Decimal Handling**:
- No decimal conversion logic between chains
- EVM tokens: 0-18 decimals, Solana typically: 6-9 decimals
- Could lead to amount mismatches
- **Production Fix**: Add decimal normalization in coordinator logic

**5. Limited Token Support**:
- No whitelist or validation of token pairs
- No mechanism to add new token mappings
- Manual token address management
- **Production Fix**: On-chain token registry with governance

**6. Timelock Limitations**:
- Fixed timelock periods don't account for chain congestion
- No adjustment for different block times between chains
- **Production Fix**: Dynamic timelocks based on chain conditions

**7. No Fee Mechanism**:
- Coordinator has no incentive to operate
- No protocol fees for sustainability
- **Production Fix**: Add coordinator fees and protocol treasury

**8. Missing Safety Features**:
- No pause mechanism for emergencies
- No upgrade path for bug fixes
- No maximum swap limits
- **Production Fix**: Add pausability, upgradability, and risk limits

These limitations are acceptable for a PoC but MUST be addressed before production deployment.