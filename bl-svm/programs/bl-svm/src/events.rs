use anchor_lang::prelude::*;

/// Event emitted when a new HTLC is created
#[event]
pub struct HTLCCreated {
    /// PDA address of the HTLC account
    pub htlc_account: Pubkey,
    /// Cross-chain identifier
    pub htlc_id: [u8; 32],
    /// Resolver/coordinator address
    pub resolver: Pubkey,
    /// EVM recipient address
    pub dst_address: [u8; 20],
    /// Token amount
    pub amount: u64,
    /// SHA256 hashlock
    pub hashlock: [u8; 32],
    /// Unix timestamp when finality period ends
    pub finality_deadline: i64,
}

/// Event emitted when HTLC is withdrawn
#[event]
pub struct HTLCWithdrawn {
    /// PDA address of the HTLC account
    pub htlc_account: Pubkey,
    /// Preimage that unlocks the HTLC
    pub preimage: [u8; 32],
    /// Address that executed the withdrawal
    pub executor: Pubkey,
    /// EVM recipient address (for logging)
    pub destination: [u8; 20],
}

/// Event emitted when HTLC is cancelled
#[event]
pub struct HTLCCancelled {
    /// PDA address of the HTLC account
    pub htlc_account: Pubkey,
    /// Address that executed the cancellation
    pub executor: Pubkey,
}

