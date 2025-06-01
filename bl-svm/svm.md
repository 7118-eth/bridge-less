# SVM.md

This file provides guidance for implementing the Solana side of the bridge-less HTLC bridge.

## Overview

The Solana program implements the destination chain logic for the HTLC bridge, enabling atomic swaps between EVM and Solana. It uses Program Derived Addresses (PDAs) for deterministic HTLC accounts and native SHA256 support for cross-chain hash compatibility.

## Architecture

### Core Design Principles

1. **PDA-Based HTLCs**
   - Each HTLC is a unique PDA derived from parameters
   - No factory pattern needed (Solana's account model)
   - Deterministic addresses for cross-chain coordination

2. **Token Program Integration**
   - Uses SPL Token program for token transfers
   - Associated Token Accounts (ATAs) for recipients
   - Token decimals: 6 (matching EVM side)

3. **Native SHA256**
   - Solana has native SHA256 support
   - Direct hash verification in program
   - No external dependencies for hashing

4. **FusionPlus-Style Flow**
   - Coordinator creates escrow with own tokens
   - Multi-phase timelocks (finality, resolver, public, cancel)
   - Safety deposits incentivize completion

## Program Structure

### Directory Layout
```
bl-svm/
├── Anchor.toml           # Anchor framework configuration
├── Cargo.toml            # Rust dependencies
├── programs/
│   └── bl-svm/
│       ├── Cargo.toml    # Program dependencies
│       └── src/
│           ├── lib.rs    # Main program entry
│           ├── state.rs  # Account structures
│           ├── errors.rs # Custom error types
│           └── utils.rs  # Helper functions
├── tests/                # TypeScript tests
│   └── bl-svm.ts
└── migrations/           # Deployment scripts
    └── deploy.ts
```

### Account Model

```rust
// HTLC account structure (PDA)
#[account]
pub struct HTLC {
    // Participants
    pub resolver: Pubkey,      // Who creates the escrow (coordinator)
    pub src_address: Pubkey,   // Source of funds (resolver's account)
    pub dst_address: [u8; 20], // EVM recipient address (20 bytes)
    
    // Token details
    pub token_mint: Pubkey,    // SPL token mint
    pub amount: u64,           // Token amount (with 6 decimals)
    pub safety_deposit: u64,   // Native SOL for incentives
    
    // HTLC parameters
    pub hashlock: [u8; 32],    // SHA256 hash
    pub htlc_id: [u8; 32],     // Cross-chain identifier
    
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
    pub bump: u8,              // PDA bump seed
}

// PDA derivation
// Seeds: [b"htlc", htlc_id]
```

## Instructions

### 1. Create HTLC (FusionPlus Style)

```rust
pub fn create_htlc(
    ctx: Context<CreateHTLC>,
    htlc_id: [u8; 32],
    dst_address: [u8; 20],    // EVM recipient
    amount: u64,
    hashlock: [u8; 32],
    finality_deadline: i64,
    resolver_deadline: i64,
    public_deadline: i64,
    cancellation_deadline: i64,
) -> Result<()> {
    // Validate timelocks are in future and ordered correctly
    let clock = Clock::get()?;
    require!(finality_deadline > clock.unix_timestamp);
    require!(resolver_deadline > finality_deadline);
    require!(public_deadline > resolver_deadline);
    require!(cancellation_deadline > public_deadline);
    
    // Transfer tokens from resolver to HTLC token account
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.resolver_token_account.to_account_info(),
                to: ctx.accounts.htlc_token_account.to_account_info(),
                authority: ctx.accounts.resolver.to_account_info(),
            },
        ),
        amount,
    )?;
    
    // Initialize HTLC state
    let htlc = &mut ctx.accounts.htlc;
    htlc.resolver = ctx.accounts.resolver.key();
    htlc.src_address = ctx.accounts.resolver.key();
    htlc.dst_address = dst_address;
    htlc.token_mint = ctx.accounts.token_mint.key();
    htlc.amount = amount;
    htlc.hashlock = hashlock;
    htlc.htlc_id = htlc_id;
    htlc.finality_deadline = finality_deadline;
    // ... set other fields
    
    emit!(HTLCCreated {
        htlc_account: htlc.key(),
        htlc_id,
        resolver: ctx.accounts.resolver.key(),
        dst_address,
        amount,
        hashlock,
        finality_deadline,
    });
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(htlc_id: [u8; 32])]
pub struct CreateHTLC<'info> {
    #[account(
        init,
        payer = resolver,
        space = 8 + HTLC::SIZE,
        seeds = [b"htlc", htlc_id.as_ref()],
        bump
    )]
    pub htlc: Account<'info, HTLC>,
    
    #[account(
        init,
        payer = resolver,
        seeds = [b"htlc-vault", htlc.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = htlc,
    )]
    pub htlc_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub resolver: Signer<'info>,
    
    #[account(
        mut,
        constraint = resolver_token_account.owner == resolver.key(),
        constraint = resolver_token_account.mint == token_mint.key()
    )]
    pub resolver_token_account: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

### 2. Withdraw to Destination (Claim)

```rust
pub fn withdraw_to_destination(
    ctx: Context<WithdrawToDestination>,
    preimage: [u8; 32],
) -> Result<()> {
    let htlc = &ctx.accounts.htlc;
    let clock = Clock::get()?;
    
    // Verify not already withdrawn or cancelled
    require!(!htlc.withdrawn, ErrorCode::AlreadyWithdrawn);
    require!(!htlc.cancelled, ErrorCode::AlreadyCancelled);
    
    // Verify finality period has passed
    require!(
        clock.unix_timestamp >= htlc.finality_deadline,
        ErrorCode::FinalityNotReached
    );
    
    // Verify within allowed withdrawal period
    require!(
        clock.unix_timestamp < htlc.cancellation_deadline,
        ErrorCode::WithdrawalDeadlinePassed
    );
    
    // Verify SHA256(preimage) == hashlock
    let computed_hash = sha256(&preimage);
    require!(
        computed_hash == htlc.hashlock,
        ErrorCode::InvalidPreimage
    );
    
    // Check if in resolver exclusive period
    let is_resolver = ctx.accounts.executor.key() == htlc.resolver;
    if clock.unix_timestamp < htlc.resolver_deadline {
        require!(is_resolver, ErrorCode::ResolverExclusivePeriod);
    }
    
    // Transfer tokens to destination (convert EVM address to string for logging)
    let seeds = &[
        b"htlc",
        htlc.htlc_id.as_ref(),
        &[htlc.bump],
    ];
    let signer = &[&seeds[..]];
    
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.htlc_token_account.to_account_info(),
                to: ctx.accounts.destination_token_account.to_account_info(),
                authority: htlc.to_account_info(),
            },
            signer,
        ),
        htlc.amount,
    )?;
    
    // Transfer safety deposit to executor
    **htlc.to_account_info().try_borrow_mut_lamports()? -= htlc.safety_deposit;
    **ctx.accounts.executor.try_borrow_mut_lamports()? += htlc.safety_deposit;
    
    // Mark as withdrawn
    let htlc = &mut ctx.accounts.htlc;
    htlc.withdrawn = true;
    
    emit!(HTLCWithdrawn {
        htlc_account: htlc.key(),
        preimage,
        executor: ctx.accounts.executor.key(),
        destination: htlc.dst_address,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawToDestination<'info> {
    #[account(
        mut,
        seeds = [b"htlc", htlc.htlc_id.as_ref()],
        bump = htlc.bump,
    )]
    pub htlc: Account<'info, HTLC>,
    
    #[account(
        mut,
        seeds = [b"htlc-vault", htlc.key().as_ref()],
        bump,
    )]
    pub htlc_token_account: Account<'info, TokenAccount>,
    
    // Note: In production, this would be derived from dst_address
    // For PoC, coordinator provides the correct Solana account
    #[account(
        mut,
        constraint = destination_token_account.mint == htlc.token_mint
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub executor: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}
```

### 3. Cancel (Refund)

```rust
pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
    let htlc = &ctx.accounts.htlc;
    let clock = Clock::get()?;
    
    // Verify not already withdrawn or cancelled
    require!(!htlc.withdrawn, ErrorCode::AlreadyWithdrawn);
    require!(!htlc.cancelled, ErrorCode::AlreadyCancelled);
    
    // Check cancellation conditions
    let can_cancel = if ctx.accounts.executor.key() == htlc.resolver {
        // Resolver can cancel after resolver deadline
        clock.unix_timestamp >= htlc.resolver_deadline
    } else {
        // Others can cancel after public deadline
        clock.unix_timestamp >= htlc.public_deadline
    };
    
    require!(can_cancel, ErrorCode::CannotCancelYet);
    
    // Return tokens to source
    let seeds = &[
        b"htlc",
        htlc.htlc_id.as_ref(),
        &[htlc.bump],
    ];
    let signer = &[&seeds[..]];
    
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.htlc_token_account.to_account_info(),
                to: ctx.accounts.src_token_account.to_account_info(),
                authority: htlc.to_account_info(),
            },
            signer,
        ),
        htlc.amount,
    )?;
    
    // Transfer safety deposit to executor
    **htlc.to_account_info().try_borrow_mut_lamports()? -= htlc.safety_deposit;
    **ctx.accounts.executor.try_borrow_mut_lamports()? += htlc.safety_deposit;
    
    // Mark as cancelled
    let htlc = &mut ctx.accounts.htlc;
    htlc.cancelled = true;
    
    emit!(HTLCCancelled {
        htlc_account: htlc.key(),
        executor: ctx.accounts.executor.key(),
    });
    
    Ok(())
}
```

## Events

```rust
#[event]
pub struct HTLCCreated {
    pub htlc_account: Pubkey,
    pub htlc_id: [u8; 32],
    pub resolver: Pubkey,
    pub dst_address: [u8; 20],  // EVM address
    pub amount: u64,
    pub hashlock: [u8; 32],
    pub finality_deadline: i64,
}

#[event]
pub struct HTLCWithdrawn {
    pub htlc_account: Pubkey,
    pub preimage: [u8; 32],
    pub executor: Pubkey,
    pub destination: [u8; 20],   // EVM address for logging
}

#[event]
pub struct HTLCCancelled {
    pub htlc_account: Pubkey,
    pub executor: Pubkey,
}
```

## Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("HTLC has already been withdrawn")]
    AlreadyWithdrawn,
    
    #[msg("HTLC has already been cancelled")]
    AlreadyCancelled,
    
    #[msg("Invalid preimage provided")]
    InvalidPreimage,
    
    #[msg("Finality period not reached")]
    FinalityNotReached,
    
    #[msg("Withdrawal deadline has passed")]
    WithdrawalDeadlinePassed,
    
    #[msg("Only resolver can withdraw during exclusive period")]
    ResolverExclusivePeriod,
    
    #[msg("Cannot cancel yet")]
    CannotCancelYet,
    
    #[msg("Invalid timelock configuration")]
    InvalidTimelocks,
    
    #[msg("Insufficient amount")]
    InsufficientAmount,
}
```

## Testing

### Unit Tests (`tests/bl-svm.ts`)

```typescript
describe("HTLC Bridge Solana", () => {
  // Setup
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.BlSvm;
  
  // Test accounts
  let resolver: Keypair;
  let tokenMint: PublicKey;
  let htlcId: Buffer;
  let secret: Buffer;
  let hashlock: Buffer;
  
  before(async () => {
    // Initialize test environment
    resolver = anchor.web3.Keypair.generate();
    
    // Create token mint with 6 decimals
    tokenMint = await createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      6  // 6 decimals to match EVM
    );
    
    // Generate secret and hash
    secret = crypto.randomBytes(32);
    hashlock = crypto.createHash('sha256').update(secret).digest();
  });
  
  describe("Create HTLC", () => {
    it("should create HTLC with correct parameters", async () => {
      const htlcId = crypto.randomBytes(32);
      const dstAddress = Buffer.from("0x742d35Cc6634C0532925a3b844Bc9e7595f6D916".slice(2), 'hex');
      const amount = new anchor.BN(1_000_000); // 1 token
      
      // Calculate timelocks
      const now = Math.floor(Date.now() / 1000);
      const finalityDeadline = now + 30;
      const resolverDeadline = finalityDeadline + 60;
      const publicDeadline = resolverDeadline + 300;
      const cancellationDeadline = publicDeadline + 300;
      
      // Create HTLC
      await program.methods
        .createHtlc(
          [...htlcId],
          [...dstAddress],
          amount,
          [...hashlock],
          new anchor.BN(finalityDeadline),
          new anchor.BN(resolverDeadline),
          new anchor.BN(publicDeadline),
          new anchor.BN(cancellationDeadline)
        )
        .accounts({
          htlc: htlcPDA,
          htlcTokenAccount,
          resolver: resolver.publicKey,
          resolverTokenAccount,
          tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([resolver])
        .rpc();
      
      // Verify HTLC state
      const htlcAccount = await program.account.htlc.fetch(htlcPDA);
      assert.equal(htlcAccount.amount.toString(), amount.toString());
      assert.deepEqual(htlcAccount.hashlock, [...hashlock]);
    });
  });
  
  describe("Withdraw", () => {
    it("should withdraw with correct preimage", async () => {
      // Wait for finality period
      await sleep(31000);
      
      // Withdraw with preimage
      await program.methods
        .withdrawToDestination([...secret])
        .accounts({
          htlc: htlcPDA,
          htlcTokenAccount,
          destinationTokenAccount,
          executor: resolver.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([resolver])
        .rpc();
      
      // Verify withdrawn
      const htlcAccount = await program.account.htlc.fetch(htlcPDA);
      assert.isTrue(htlcAccount.withdrawn);
    });
    
    it("should fail with incorrect preimage", async () => {
      const wrongSecret = crypto.randomBytes(32);
      
      await assert.rejects(
        program.methods
          .withdrawToDestination([...wrongSecret])
          .accounts({...})
          .rpc(),
        /Invalid preimage/
      );
    });
  });
  
  describe("Cancel", () => {
    it("should cancel after timeout", async () => {
      // Create HTLC with short timeouts for testing
      // Wait for cancellation period
      // Execute cancellation
      // Verify tokens returned
    });
  });
});
```

## Deployment

### Local Development
```bash
# Start local validator
solana-test-validator

# Build program
anchor build

# Deploy
anchor deploy

# Run tests
anchor test
```

### Devnet Deployment
```bash
# Configure for devnet
solana config set --url https://api.devnet.solana.com

# Airdrop SOL for deployment
solana airdrop 2

# Deploy program
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <PROGRAM_ID>
```

## Integration with Coordinator

### 1. Program Initialization
```typescript
// Initialize Anchor provider
const connection = new Connection(RPC_URL);
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, {});

// Load program
const program = new anchor.Program(IDL, PROGRAM_ID, provider);
```

### 2. HTLC Creation
```typescript
async function createSolanaHTLC(params: {
  htlcId: Buffer,
  dstAddress: string,  // EVM address
  amount: BN,
  hashlock: Buffer,
  timelocks: Timelocks
}) {
  // Derive PDA
  const [htlcPDA] = await PublicKey.findProgramAddress(
    [Buffer.from("htlc"), params.htlcId],
    program.programId
  );
  
  // Create instruction
  const tx = await program.methods
    .createHtlc(
      [...params.htlcId],
      [...Buffer.from(params.dstAddress.slice(2), 'hex')],
      params.amount,
      [...params.hashlock],
      new BN(params.timelocks.finality),
      new BN(params.timelocks.resolver),
      new BN(params.timelocks.public),
      new BN(params.timelocks.cancellation)
    )
    .accounts({...})
    .rpc();
  
  return { htlcPDA, txSignature: tx };
}
```

### 3. Event Monitoring
```typescript
// Subscribe to program events
const listener = program.addEventListener('HTLCCreated', (event) => {
  console.log('HTLC Created:', {
    account: event.htlcAccount.toBase58(),
    htlcId: Buffer.from(event.htlcId).toString('hex'),
    amount: event.amount.toString()
  });
});

// Parse transaction logs for events
async function parseTransactionEvents(txSignature: string) {
  const tx = await connection.getParsedTransaction(txSignature);
  const logs = tx?.meta?.logMessages || [];
  
  for (const log of logs) {
    if (log.includes('Program log: HTLCWithdrawn')) {
      // Extract event data from logs
    }
  }
}
```

## Security Considerations

1. **Hash Verification**
   - Use native SHA256 for efficiency
   - Verify hash matches exactly
   - Prevent timing attacks

2. **Timelock Ordering**
   - Enforce strict timelock ordering
   - Prevent premature withdrawals
   - Handle clock drift gracefully

3. **PDA Security**
   - Use deterministic derivation
   - Verify PDA ownership
   - Prevent seed collisions

4. **Token Safety**
   - Validate token mint matches
   - Check token accounts exist
   - Handle decimal conversions

## Performance Optimization

1. **Account Size**
   - Minimize HTLC account size
   - Use fixed-size arrays
   - Pack data efficiently

2. **Transaction Size**
   - Batch operations where possible
   - Minimize CPI calls
   - Optimize instruction data

3. **Compute Units**
   - Request appropriate compute budget
   - Optimize hash computations
   - Minimize account validations

## Production Considerations

1. **Program Upgrades**
   - Use upgradeable programs initially
   - Plan migration strategy
   - Consider making immutable later

2. **Monitoring**
   - Track program events
   - Monitor account creation
   - Alert on failures

3. **Cross-Chain Coordination**
   - Ensure HTLC ID uniqueness
   - Handle chain-specific delays
   - Coordinate with EVM timelocks

4. **Token Support**
   - Validate token decimals
   - Support multiple tokens
   - Handle token migrations