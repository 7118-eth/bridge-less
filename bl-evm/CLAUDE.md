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
       address token,          // ERC20 token
       uint256 amount,         // Token amount
       bytes32 hashlock,       // SHA256 hash
       uint256 safetyDeposit   // Native token deposit
   ) external payable returns (address htlcContract, bytes32 htlcId);
   ```

2. **HTLC.sol** - Individual HTLC contract (FusionPlus style)
   ```solidity
   // Immutable state (set in constructor)
   address public immutable factory;
   address public immutable resolver;     // Who creates the escrow (coordinator)
   address public immutable srcAddress;   // Source of funds (maker on source chain)
   bytes32 public immutable dstAddress;   // Recipient (maker's Solana address)
   address public immutable token;
   uint256 public immutable amount;
   bytes32 public immutable hashlock;
   uint256 public immutable safetyDeposit;  // Native token incentive
   
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
       uint256 safetyDeposit,
       uint256 finalityDeadline
   );
   
   // HTLC contract events
   event HTLCWithdrawn(
       address indexed htlcContract,
       bytes32 preimage,
       address executor,      // Who executed the withdrawal
       uint256 safetyDeposit  // Amount claimed by executor
   );
   
   event HTLCCancelled(
       address indexed htlcContract,
       address executor,
       uint256 safetyDeposit
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
- Validate hashlock matches SHA256(preimage) on withdraw
- Multi-phase timelock system (FusionPlus style):
  - Finality period: No operations allowed (prevent reorg attacks)
  - Resolver exclusive period: Only resolver can withdraw
  - Public period: Anyone can help complete the swap
  - Cancellation period: Return funds if swap failed
- SafeTransferFrom for ERC20 operations
- Safety deposits incentivize proper execution
- Resolver must provide tokens upfront (not pull from maker)

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
- Timelock durations for testing (adjust for Base 2-second blocks):
  - Finality period: 30 seconds (prevent reorgs)
  - Resolver exclusive: 60 seconds
  - Public withdrawal: 300 seconds (5 minutes)
  - Cancellation deadline: 600 seconds (10 minutes)
- Safety deposit: 0.001 ETH (enough to incentivize execution)
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
   - Withdraws on source chain (gets maker's tokens + safety deposit)
   - Withdraws on destination chain (sends tokens to maker's Solana address)
   
4. **Monitoring**:
   - Track HTLCDeployed events for htlcId mapping
   - Monitor finality deadlines before revealing secret
   - Execute withdrawals during exclusive period

### Additional Factory Pattern Considerations
- Gas cost for deployment: ~500k-1M gas per HTLC (acceptable for PoC)
- Each HTLC is independent - failure of one doesn't affect others
- Factory upgrade path: deploy new factory, migrate coordinator
- HTLCs are minimal - only essential functions to reduce deployment cost
- Coordinator needs ETH balance for safety deposits