use anchor_lang::prelude::*;

/// HTLC account structure (PDA)
#[account]
pub struct HTLC {
    /// Who creates the escrow (coordinator)
    pub resolver: Pubkey,
    /// Source of funds (resolver's account)
    pub src_address: Pubkey,
    /// EVM recipient address (20 bytes)
    pub dst_address: [u8; 20],

    /// SPL token mint on Solana
    pub src_token: Pubkey,
    /// ERC20 token on EVM (20 bytes)
    pub dst_token: [u8; 20],
    /// Token amount (with 6 decimals)
    pub amount: u64,
    /// Native SOL for incentives
    pub safety_deposit: u64,

    /// SHA256 hash
    pub hashlock: [u8; 32],
    /// Cross-chain identifier
    pub htlc_id: [u8; 32],

    /// Unix timestamp when finality period ends
    pub finality_deadline: i64,
    /// Unix timestamp when resolver exclusive period ends
    pub resolver_deadline: i64,
    /// Unix timestamp when public withdrawal period ends
    pub public_deadline: i64,
    /// Unix timestamp when cancellation is allowed
    pub cancellation_deadline: i64,

    /// Whether tokens have been withdrawn
    pub withdrawn: bool,
    /// Whether HTLC has been cancelled
    pub cancelled: bool,

    /// Unix timestamp when HTLC was created
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl HTLC {
    /// Size of HTLC account for rent calculation
    pub const SIZE: usize = 8 + // discriminator
        32 + // resolver
        32 + // src_address
        20 + // dst_address
        32 + // src_token
        20 + // dst_token
        8 + // amount
        8 + // safety_deposit
        32 + // hashlock
        32 + // htlc_id
        8 + // finality_deadline
        8 + // resolver_deadline
        8 + // public_deadline
        8 + // cancellation_deadline
        1 + // withdrawn
        1 + // cancelled
        8 + // created_at
        1; // bump
}

