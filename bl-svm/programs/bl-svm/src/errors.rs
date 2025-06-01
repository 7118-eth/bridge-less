use anchor_lang::prelude::*;

/// Custom error codes for HTLC program
#[error_code]
pub enum HTLCError {
    /// Invalid timelock ordering (must be finality < resolver < public < cancellation)
    #[msg("Invalid timelock ordering")]
    InvalidTimelockOrder,

    /// HTLC amount must be greater than zero
    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    /// Invalid token mint (must not be default pubkey)
    #[msg("Invalid token mint")]
    InvalidTokenMint,

    /// Invalid destination address (must not be all zeros)
    #[msg("Invalid destination address")]
    InvalidDestination,

    /// Current time is outside allowed withdrawal window
    #[msg("Withdrawal not allowed at this time")]
    WithdrawalNotAllowed,

    /// Cancellation deadline has not been reached
    #[msg("Cancellation not allowed yet")]
    CancellationNotAllowed,

    /// HTLC has already been withdrawn
    #[msg("HTLC already withdrawn")]
    AlreadyWithdrawn,

    /// HTLC has already been cancelled
    #[msg("HTLC already cancelled")]
    AlreadyCancelled,

    /// Invalid preimage (hash does not match hashlock)
    #[msg("Invalid preimage")]
    InvalidPreimage,

    /// Safety deposit must be greater than zero
    #[msg("Safety deposit must be greater than zero")]
    InvalidSafetyDeposit,
}

