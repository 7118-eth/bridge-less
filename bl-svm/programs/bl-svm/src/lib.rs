use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use errors::*;
use events::*;
use instructions::*;
use state::*;

declare_id!("5dkHPRP7JU8k8rPScNLX6eG8vLhtMvciFjKxAsDqzBcL");

#[program]
pub mod bl_svm {
    use super::*;

    /// Creates a new HTLC escrow with tokens
    pub fn create_htlc(ctx: Context<CreateHTLC>, params: CreateHTLCParams) -> Result<()> {
        instructions::create_htlc::handler(ctx, params)
    }

    /// Withdraws tokens from HTLC using the correct preimage
    pub fn withdraw_to_destination(
        ctx: Context<WithdrawToDestination>,
        preimage: [u8; 32],
    ) -> Result<()> {
        instructions::withdraw::handler(ctx, preimage)
    }

    /// Cancels HTLC and refunds tokens after timeout
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        instructions::cancel::handler(ctx)
    }
}
