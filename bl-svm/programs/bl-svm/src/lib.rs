use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

declare_id!("5dkHPRP7JU8k8rPScNLX6eG8vLhtMvciFjKxAsDqzBcL");

pub mod errors;
pub mod events; 
pub mod state;

use crate::state::*;

/// Parameters for creating an HTLC
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateHTLCParams {
    /// Cross-chain identifier
    pub htlc_id: [u8; 32],
    /// EVM recipient address
    pub dst_address: [u8; 20],
    /// ERC20 token on EVM
    pub dst_token: [u8; 20],
    /// Token amount (with 6 decimals)
    pub amount: u64,
    /// Native SOL for incentives
    pub safety_deposit: u64,
    /// SHA256 hash
    pub hashlock: [u8; 32],
    /// Unix timestamp when finality period ends
    pub finality_deadline: i64,
    /// Unix timestamp when resolver exclusive period ends
    pub resolver_deadline: i64,
    /// Unix timestamp when public withdrawal period ends
    pub public_deadline: i64,
    /// Unix timestamp when cancellation is allowed
    pub cancellation_deadline: i64,
}

/// Accounts required for creating an HTLC
#[derive(Accounts)]
#[instruction(params: CreateHTLCParams)]
pub struct CreateHTLC<'info> {
    /// Resolver/coordinator creating the HTLC
    #[account(mut)]
    pub resolver: Signer<'info>,
    
    /// HTLC PDA account
    #[account(
        init,
        payer = resolver,
        space = HTLC::SIZE,
        seeds = [b"htlc", params.htlc_id.as_ref()],
        bump
    )]
    pub htlc: Account<'info, HTLC>,
    
    /// Token mint
    pub token_mint: Account<'info, Mint>,
    
    /// Resolver's token account (source of funds)
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = resolver,
    )]
    pub resolver_token_account: Account<'info, TokenAccount>,
    
    /// HTLC's token vault PDA
    #[account(
        init,
        payer = resolver,
        associated_token::mint = token_mint,
        associated_token::authority = htlc,
        associated_token::token_program = token_program,
    )]
    pub htlc_vault: Account<'info, TokenAccount>,
    
    /// System program
    pub system_program: Program<'info, System>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
    
    /// Associated token program
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Accounts required for withdrawing from an HTLC
#[derive(Accounts)]
pub struct WithdrawToDestination<'info> {
    /// Executor withdrawing the funds (can be anyone with the preimage)
    #[account(mut)]
    pub executor: Signer<'info>,
    
    /// HTLC PDA account
    #[account(
        mut,
        seeds = [b"htlc", htlc.htlc_id.as_ref()],
        bump = htlc.bump,
    )]
    pub htlc: Account<'info, HTLC>,
    
    /// Token mint
    pub token_mint: Account<'info, Mint>,
    
    /// HTLC's token vault PDA
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = htlc,
        associated_token::token_program = token_program,
    )]
    pub htlc_vault: Account<'info, TokenAccount>,
    
    /// Destination token account (on Solana side - the dst_address in HTLC is for EVM)
    /// For the PoC, this is the executor's account who will bridge to EVM
    #[account(
        init_if_needed,
        payer = executor,
        associated_token::mint = token_mint,
        associated_token::authority = executor,
        associated_token::token_program = token_program,
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    
    /// System program
    pub system_program: Program<'info, System>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
    
    /// Associated token program
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Accounts required for cancelling an HTLC
#[derive(Accounts)]
pub struct Cancel<'info> {
    /// Executor cancelling the HTLC (can be anyone after timeout)
    #[account(mut)]
    pub executor: Signer<'info>,
    
    /// HTLC PDA account
    #[account(
        mut,
        seeds = [b"htlc", htlc.htlc_id.as_ref()],
        bump = htlc.bump,
    )]
    pub htlc: Account<'info, HTLC>,
    
    /// Original resolver/source address to refund to
    /// CHECK: Validated against htlc.src_address
    #[account(mut)]
    pub src_address: AccountInfo<'info>,
    
    /// Token mint
    pub token_mint: Account<'info, Mint>,
    
    /// HTLC's token vault PDA
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = htlc,
        associated_token::token_program = token_program,
    )]
    pub htlc_vault: Account<'info, TokenAccount>,
    
    /// Source token account to refund to
    #[account(
        init_if_needed,
        payer = executor,
        associated_token::mint = token_mint,
        associated_token::authority = src_address,
        associated_token::token_program = token_program,
    )]
    pub src_token_account: Account<'info, TokenAccount>,
    
    /// System program
    pub system_program: Program<'info, System>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
    
    /// Associated token program
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub mod instructions;

#[program]
pub mod bl_svm {
    use super::*;
    use crate::instructions::{create_htlc, withdraw, cancel};

    /// Creates a new HTLC escrow with tokens
    pub fn create_htlc(
        ctx: Context<CreateHTLC>,
        params: CreateHTLCParams,
    ) -> Result<()> {
        create_htlc::handler(ctx, params)
    }

    /// Withdraws tokens from HTLC using the correct preimage
    pub fn withdraw_to_destination(
        ctx: Context<WithdrawToDestination>,
        preimage: [u8; 32],
    ) -> Result<()> {
        withdraw::handler(ctx, preimage)
    }

    /// Cancels HTLC and refunds tokens after timeout
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        cancel::handler(ctx)
    }
}