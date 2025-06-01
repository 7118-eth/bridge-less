# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Test
- **Build**: `anchor build` - Compiles the Solana program and generates IDL/types
- **Test**: `anchor test` - Runs all tests with local validator
- **Test (skip build)**: `anchor test --skip-build` - Runs tests without rebuilding
- **Test (skip deploy)**: `anchor test --skip-deploy` - Runs tests without deploying
- **Test (skip local validator)**: `anchor test --skip-local-validator` - Uses existing validator
- **Test (specific)**: `pnpm test tests/<filename>` - Run specific test file
- **Test (bankrun)**: `pnpm test tests/bankrun.test.ts` - Run bankrun tests (faster)

### Code Quality
- **Format**: `cargo fmt` - Formats Rust code according to style guide
- **Lint**: `cargo clippy` - Runs Rust linter for code quality
- **Check**: `cargo check` - Fast compilation check without building

### Local Development
- **Local Validator**: `solana-test-validator` - Starts local Solana validator
- **Logs**: `solana logs` - Stream program logs from local validator
- **Deploy**: `anchor deploy` - Deploy program to configured cluster
- **Deploy (specific)**: `anchor deploy --provider.cluster <cluster>` - Deploy to specific cluster
- **Upgrade**: `anchor upgrade <program_id> --program-id <path>` - Upgrade deployed program
- **IDL**: `anchor idl init/upgrade/fetch` - Manage program IDL

### Account Management
- **Airdrop**: `solana airdrop <amount> <address>` - Request SOL from faucet (devnet/testnet)
- **Balance**: `solana balance <address>` - Check SOL balance
- **Account Info**: `solana account <address>` - View account details
- **Generate Keypair**: `solana-keygen new` - Create new keypair

## Architecture

This is an Anchor-based Solana program for smart contract development on Solana Virtual Machine (SVM). The codebase uses:

- **Anchor Framework**: High-level framework for Solana program development
- **anchor-lang**: Core Anchor functionality and macros
- **anchor-spl**: Integration with Solana Program Library (SPL) for tokens
- **solana-program**: Low-level Solana runtime interfaces
- **bankrun**: Fast in-process testing framework (alternative to solana-test-validator)

### Structure
- `programs/bl-svm/src/`: Solana program source code
  - `lib.rs` - Program entry point and instruction handlers
  - `state.rs` - Account state structures (HTLC)
  - `errors.rs` - Custom error definitions
  - `instructions/` - Modular instruction implementations
    - `create_htlc.rs` - HTLC creation logic
    - `withdraw.rs` - Withdrawal with preimage
    - `cancel.rs` - Cancellation/refund logic
    - `mod.rs` - Module exports
- `tests/`: TypeScript test files
  - `bl-svm.ts` - Standard integration tests
  - `bankrun.test.ts` - Fast bankrun tests
- `migrations/`: Deployment and migration scripts
- `target/`: Build artifacts (generated)
  - `idl/` - Interface Definition Language files
  - `types/` - TypeScript type definitions
  - `deploy/` - Compiled programs

### Testing Approach
Tests use Anchor's testing framework with:
- Local validator or bankrun for fast execution
- `@coral-xyz/anchor` for program interaction
- `chai` for assertions
- Deterministic account derivation via PDAs

**Development Process (mandatory for this project):**

1. **State-First Development:**
   - ALWAYS define account structures FIRST in `state.rs`
   - Model all on-chain state with proper types and constraints
   - Use comprehensive documentation on state structs
   - Consider account size and rent requirements

2. **Test-Driven Development (TDD):**
   - Write TypeScript tests based on expected behavior BEFORE implementation
   - Use bankrun tests for rapid iteration during development
   - Run tests to see them fail (red phase)
   - Write minimal code to make tests pass (green phase)
   - Refactor while keeping tests green
   - Run `anchor test` after every change to ensure nothing breaks

3. **Version Control Requirements:**
   - ALWAYS commit after completing each development step
   - Make atomic commits with clear, descriptive messages
   - Commit after writing tests (before implementation)
   - Commit after making tests pass
   - Commit after refactoring
   - Use `git add .` only within the bl-svm directory to avoid conflicts

4. **Documentation Requirements:**
   - Use Rust doc comments (`///`) for ALL public items
   - Document every instruction with:
     - Purpose and behavior
     - Required accounts and their roles
     - Validation logic
     - Error conditions
   - Document every account struct field
   - Document all custom errors with clear messages
   - Include examples in doc comments where helpful

4. **Modular Instruction Pattern:**
   - Each instruction gets its own file in `src/instructions/`
   - Keep `lib.rs` minimal - only entry points
   - Use `Context<T>` structs for account validation
   - Implement business logic in instruction modules

The project is part of a "bridge-less" cross-chain swap solution between EVM and Solana, currently in early development.

## HTLC Bridge Implementation

### Overview
Building a minimal FusionPlus-inspired bridge between EVM and Solana. Based on 1inch's atomic swap approach where a resolver (our coordinator) manages the entire swap process.

**Key Differences from Classic Atomic Swaps:**
- Coordinator acts as maker, taker, resolver, and relayer (for PoC simplicity)
- Coordinator holds the secret and reveals it after both escrows are created
- Coordinator creates BOTH escrows (source and destination)
- No Dutch auction for PoC - fixed price swaps

**Token Setup:**
- Token uses 6 decimals (1 token = 1e6 units) matching EVM side
- Coordinator pre-funds 10,000 tokens (10_000e6 units) on each chain
- Individual swaps use 1 token (1e6 units) for testing

### Core Design Principles

1. **PDA-Based HTLCs**
   - Each HTLC is a unique PDA derived from `htlc_id`
   - No factory pattern needed (Solana's account model)
   - Seeds: `[b"htlc", htlc_id]`
   - Deterministic addresses for cross-chain coordination

2. **Token Vault Pattern**
   - Each HTLC has an associated token account PDA
   - Seeds: `[b"htlc-vault", htlc.key()]`
   - HTLC PDA owns the vault for secure transfers

3. **Native SHA256**
   - Solana has native SHA256 support via `hashv`
   - Direct hash verification in program
   - Cross-chain compatible with EVM's SHA256

4. **FusionPlus-Style Flow**
   - Coordinator creates escrow with own tokens
   - Multi-phase timelocks (finality, resolver, public, cancel)
   - Safety deposits incentivize completion (future enhancement)

### Account Model

```rust
// HTLC account structure (PDA)
#[account]
pub struct HTLC {
    // Participants
    pub resolver: Pubkey,          // Who creates the escrow (coordinator)
    pub src_address: Pubkey,       // Source of funds (resolver's account)
    pub dst_address: [u8; 20],     // EVM recipient address (20 bytes)
    
    // Token details  
    pub src_token: Pubkey,         // SPL token mint on Solana
    pub dst_token: [u8; 20],       // ERC20 token on EVM (20 bytes)
    pub amount: u64,               // Token amount (with 6 decimals)
    pub safety_deposit: u64,       // Native SOL for incentives
    
    // HTLC parameters
    pub hashlock: [u8; 32],        // SHA256 hash
    pub htlc_id: [u8; 32],         // Cross-chain identifier
    
    // Timelocks (Unix timestamps)
    pub finality_deadline: i64,
    pub resolver_deadline: i64,
    pub public_deadline: i64,
    pub cancellation_deadline: i64,
    
    // State
    pub withdrawn: bool,
    pub cancelled: bool,
    
    // Metadata
    pub created_at: i64,
    pub bump: u8,                  // PDA bump seed
}
```

### Instructions

1. **create_htlc** - Deploy new HTLC with tokens
   - Creates HTLC PDA and token vault
   - Transfers tokens from resolver to vault
   - Validates timelocks and parameters
   - Emits HTLCCreated event

2. **withdraw_to_destination** - Claim with preimage
   - Verifies SHA256(preimage) == hashlock
   - Checks timelock constraints
   - Transfers tokens to destination
   - Awards safety deposit to executor
   - Emits HTLCWithdrawn event

3. **cancel** - Refund after timeout
   - Validates cancellation timelock
   - Returns tokens to source
   - Awards safety deposit to executor
   - Emits HTLCCancelled event

### Events for Coordinator

```rust
#[event]
pub struct HTLCCreated {
    pub htlc_account: Pubkey,
    pub htlc_id: [u8; 32],
    pub resolver: Pubkey,
    pub dst_address: [u8; 20],     // EVM address
    pub amount: u64,
    pub hashlock: [u8; 32],
    pub finality_deadline: i64,
}

#[event]
pub struct HTLCWithdrawn {
    pub htlc_account: Pubkey,
    pub preimage: [u8; 32],
    pub executor: Pubkey,
    pub destination: [u8; 20],     // EVM address for logging
}

#[event]
pub struct HTLCCancelled {
    pub htlc_account: Pubkey,
    pub executor: Pubkey,
}
```

### Security Considerations
- Use native SHA256 via `hashv` for cross-chain compatibility
- Enforce strict timelock ordering and validation
- PDA derivation prevents account spoofing
- Check-Effects-Interactions pattern for token transfers
- Validate both src_token and dst_token (non-zero)
- Account size calculations include all fields
- Rent-exempt account creation required

### Testing Strategy

1. **Unit Tests** (`tests/bl-svm.ts`)
   - Test HTLC creation with correct parameters
   - Test claiming with correct preimage
   - Test claiming with incorrect preimage (should fail)
   - Test refund after timelock expires
   - Test refund before timelock (should fail)
   - Test double-claim prevention
   - Test double-refund prevention
   - Test with 1 token swaps (1e6 units with 6 decimals)
   - Test timelock validation and ordering

2. **Bankrun Tests** (`tests/bankrun.test.ts`)
   - Faster test execution without full validator
   - Same test coverage as standard tests
   - Better for rapid development iteration
   - Time manipulation for testing timelocks

3. **Integration Tests**
   - Pre-fund coordinator with 10k tokens (10_000e6 units)
   - Test end-to-end flow with SPL tokens
   - Simulate bridge scenario with concurrent HTLCs
   - Test event emission and parsing
   - Verify account balances after swaps
   - Compute unit consumption analysis

4. **Edge Cases**
   - Zero amount HTLCs (should revert)
   - Invalid timelock ordering (should revert)
   - Extremely large amounts
   - Invalid token mint addresses
   - PDA collision scenarios (htlc_id uniqueness)

### Implementation Status
1. ✅ Create modular instruction structure
2. ✅ Implement HTLC state in `state.rs`
3. ✅ Implement create_htlc instruction
4. ✅ Implement withdraw instruction
5. ✅ Implement cancel instruction
6. ✅ Write comprehensive test suite
7. ⏳ Add bankrun tests for faster development
8. ⏳ Test with SPL Token integration
9. ⏳ Verify cross-chain ID compatibility

### Current Status (as of last commit)
- **Program ID**: `7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY`
- **Build Status**: ✅ Successfully compiling with Anchor 0.31.1
- **Test Status**: 6/10 tests passing
  - ✅ HTLC creation tests
  - ✅ Invalid parameter validation tests  
  - ✅ Concurrent HTLC handling
  - ❌ 4 tests failing due to blockchain time synchronization issues
- **Dependencies**: 
  - `anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }`
  - `anchor-spl = { version = "0.31.1", features = ["token"] }`
  - Test dependencies include `@solana/spl-token` for token operations

### Known Issues & Solutions
1. **Timing Issues in Tests**: Tests use `Math.floor(Date.now() / 1000)` but blockchain time may differ
   - Solution: Use bankrun tests or add buffer time for blockchain latency
   - Alternative: Query blockchain clock before creating HTLCs

2. **Import Warnings**: Tests show ES module warnings
   - Solution: Either add `"type": "module"` to package.json or use .mjs extension
   - Current approach: Keep CommonJS for compatibility

3. **Borrow Checker**: Had to carefully manage mutable borrows in instruction handlers
   - Solution: Extract values before borrowing mutably for account transfers

### Critical Implementation Details
1. **Account Contexts in lib.rs**: Due to Anchor macro requirements, account contexts must be defined in lib.rs, not in separate instruction files
2. **Token Vault Pattern**: Each HTLC owns its associated token account as a PDA
3. **Safety Deposit Transfers**: Use direct lamport manipulation for SOL transfers
4. **PDA Seeds**: `[b"htlc", htlc_id]` for HTLC account (vault uses associated token account)
5. **Feature Flags**: Must enable `init-if-needed` for creating token accounts and `idl-build` for both anchor-lang and anchor-spl

### Next Steps
1. **Fix Timing Issues**: 
   - Implement bankrun tests for precise time control
   - Or query blockchain time before setting deadlines
   
2. **Integration Testing**:
   - Test with actual SPL token mints
   - Verify cross-chain ID generation matches EVM side
   - Test event parsing for coordinator integration

3. **Coordinator Integration**:
   - Implement event listeners in coordinator
   - Add HTLC ID mapping between chains
   - Test full cross-chain swap flow

4. **Production Readiness**:
   - Add rate limiting mechanisms
   - Implement account cleanup for expired HTLCs
   - Add monitoring for MEV-style attacks
   - Consider upgrade authority management

### Deployment Notes
- Program deployed to localnet at `7225bNQ76UjXRSsKdvUPshmuDDNFyACoPawGGJaZvSuY`
- Update both `lib.rs` and `Anchor.toml` when program ID changes
- Use `anchor deploy --provider.cluster devnet` for devnet deployment
- Remember to fund program upgrade authority for future updates

### Critical Lessons Learned
1. **Anchor Macro Limitations**: The `#[program]` macro requires all instruction contexts to be accessible at compile time. Initially tried modular pattern with contexts in separate files, but had to move them to lib.rs
2. **Cargo Features**: Missing `init-if-needed` feature causes cryptic errors. Always check Cargo.toml features match your usage
3. **IDL Build**: Must add `anchor-spl/idl-build` to features list to avoid "DISCRIMINATOR not found" errors
4. **Import Order**: Had to use `import * as crypto from "crypto"` in tests instead of default import
5. **Associated Token Accounts**: The HTLC vault is created as an associated token account with the HTLC PDA as authority - this simplifies the seed derivation

### Architecture Decisions
1. **Why PDA for Each HTLC**: Unlike EVM's factory pattern, Solana's account model makes individual PDAs more efficient
2. **Token Vault Ownership**: HTLC PDA owns the vault, not the resolver, ensuring only the program can transfer funds
3. **Safety Deposits in SOL**: Using native SOL instead of tokens simplifies the incentive mechanism
4. **Event Design**: Including EVM addresses as byte arrays in events helps coordinator track cross-chain state

### Testing Insights
- Use `anchor test --skip-local-validator` when validator is already running
- Program ID mismatches are common - always check deployed ID matches code
- Timing tests are tricky on local validator - consider mocking time or using bankrun
- SPL token setup in tests requires creating mint, then token accounts, then minting

### File Structure Best Practices
- Keep instruction handlers minimal - just parameter validation and state updates
- Put complex logic in separate functions for testability
- Use descriptive error messages - they help during testing
- Document PDA derivation clearly - it's critical for client integration

### Estimated Transaction Costs
Based on Solana's account model:
- **HTLC Account Creation**: ~0.002 SOL (rent-exempt)
- **Token Vault Creation**: ~0.002 SOL (rent-exempt)
- **Withdraw Transaction**: ~0.000005 SOL (signature fee)
- **Cancel Transaction**: ~0.000005 SOL (signature fee)

### Production Considerations
- Timelock durations for testing (adjust for Solana's ~400ms slots):
  - Finality period: 75 slots (~30 seconds)
  - Resolver exclusive: 150 slots (~60 seconds)
  - Public withdrawal: 750 slots (~5 minutes)
  - Cancellation deadline: 1500 slots (~10 minutes)
- Add safety deposits for incentive mechanism
- Consider account cleanup for cancelled HTLCs
- Monitor for MEV-style attacks during public period
- Use versioned transactions for efficiency

### Coordinator Integration Points (FusionPlus Flow)

1. **Swap Initiation**:
   ```typescript
   // Generate consistent HTLC ID across chains
   const htlcId = crypto.createHash('sha256')
     .update(Buffer.concat([
       resolver.toBuffer(),
       srcAddress.toBuffer(),
       Buffer.from(dstAddress.slice(2), 'hex'),
       srcToken.toBuffer(),
       Buffer.from(dstToken.slice(2), 'hex'),
       amount.toArrayLike(Buffer, 'le', 8),
       hashlock,
       Buffer.from(timestamp.toString())
     ]))
     .digest();
   ```

2. **PDA Derivation**:
   ```typescript
   const [htlcPDA] = PublicKey.findProgramAddressSync(
     [Buffer.from("htlc"), htlcId],
     programId
   );
   ```

3. **Event Monitoring**:
   ```typescript
   // Subscribe to program events
   program.addEventListener('HTLCCreated', (event) => {
     // Store htlc_id -> PDA mapping
     // Verify escrow creation
   });
   ```

### Testing Tools Comparison

**For this project, we'll use:**
1. **Standard Anchor Tests** (`anchor test`) for comprehensive integration testing
2. **Bankrun Tests** for rapid development and unit testing
3. **Mollusk** (optional) for performance-critical instruction testing

**Rationale:**
- Bankrun provides the best balance of speed and functionality
- Standard tests ensure compatibility with real validator behavior
- Both support time manipulation for testing timelocks

### Key Implementation Insights

1. **Account Model Advantages**: Solana's account model eliminates need for factory pattern
2. **PDA Security**: Deterministic derivation ensures account authenticity
3. **Event Design**: Include EVM addresses as byte arrays for cross-chain tracking
4. **Token Vaults**: Separate PDA for token storage provides better security
5. **Compute Optimization**: Minimize CPI calls and account validations

### Cross-Chain Compatibility ✅

**HTLC ID Generation**: While the EVM side uses `keccak256`, this is not a blocker because:
- Each chain can use its native hashing for internal operations
- The coordinator maintains the mapping between chain-specific IDs
- The shared `hashlock` (SHA256) is what ensures atomicity

**Address Format Handling**:
- EVM addresses stored as `[u8; 20]` byte arrays
- Solana addresses use standard `Pubkey` type
- Coordinator handles conversion and mapping

### Known Limitations & Mitigations

1. **No Merkle Tree of Secrets**: Single secret per swap (sufficient for PoC)
2. **No Partial Fills**: Complete swaps only (simplified implementation)
3. **Basic Safety Deposits**: Fixed amounts, no dynamic calculation
4. **Limited Governance**: No DAO controls or fee mechanisms

These limitations are acceptable for the PoC and can be enhanced for production.

## Development Workflow

1. **Initial Setup**:
   ```bash
   # Install dependencies
   yarn install
   
   # Build program
   anchor build
   
   # Start local validator (in separate terminal)
   solana-test-validator
   
   # Run tests
   anchor test
   ```

2. **Development Cycle**:
   - Write/modify tests first
   - Run `anchor test --skip-build` for quick feedback
   - Implement minimal code to pass tests
   - Run `cargo fmt` and `cargo clippy`
   - Run full `anchor test` to verify

3. **Debugging**:
   - Use `msg!()` for program logs
   - Run `solana logs` to stream output
   - Add `#[cfg(feature = "testing")]` for test-only code
   - Use bankrun tests for faster iteration

4. **Deployment**:
   - Test thoroughly on local validator
   - Deploy to devnet: `anchor deploy --provider.cluster devnet`
   - Verify with explorer: https://explorer.solana.com/
   - Update program ID in `Anchor.toml` and `lib.rs`