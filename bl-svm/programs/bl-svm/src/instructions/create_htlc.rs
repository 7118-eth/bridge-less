use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::HTLCError, events::HTLCCreated, state::HTLC};

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

/// Handler for creating an HTLC
pub fn handler(ctx: Context<CreateHTLC>, params: CreateHTLCParams) -> Result<()> {
    let htlc = &mut ctx.accounts.htlc;
    let clock = Clock::get()?;

    // Validate parameters
    require!(params.amount > 0, HTLCError::InvalidAmount);
    require!(params.safety_deposit > 0, HTLCError::InvalidSafetyDeposit);
    require!(
        ctx.accounts.token_mint.key() != Pubkey::default(),
        HTLCError::InvalidTokenMint
    );
    require!(
        params.dst_address != [0u8; 20],
        HTLCError::InvalidDestination
    );
    require!(params.dst_token != [0u8; 20], HTLCError::InvalidDestination);

    // Validate timelock ordering
    require!(
        params.finality_deadline < params.resolver_deadline
            && params.resolver_deadline < params.public_deadline
            && params.public_deadline < params.cancellation_deadline,
        HTLCError::InvalidTimelockOrder
    );

    // Initialize HTLC state
    htlc.resolver = ctx.accounts.resolver.key();
    htlc.src_address = ctx.accounts.resolver.key();
    htlc.dst_address = params.dst_address;
    htlc.src_token = ctx.accounts.token_mint.key();
    htlc.dst_token = params.dst_token;
    htlc.amount = params.amount;
    htlc.safety_deposit = params.safety_deposit;
    htlc.hashlock = params.hashlock;
    htlc.htlc_id = params.htlc_id;
    htlc.finality_deadline = params.finality_deadline;
    htlc.resolver_deadline = params.resolver_deadline;
    htlc.public_deadline = params.public_deadline;
    htlc.cancellation_deadline = params.cancellation_deadline;
    htlc.withdrawn = false;
    htlc.cancelled = false;
    htlc.created_at = clock.unix_timestamp;
    htlc.bump = ctx.bumps.htlc;

    // Transfer tokens from resolver to HTLC vault
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.resolver_token_account.to_account_info(),
                to: ctx.accounts.htlc_vault.to_account_info(),
                authority: ctx.accounts.resolver.to_account_info(),
            },
        ),
        params.amount,
    )?;

    // Transfer safety deposit (SOL) from resolver to HTLC account
    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.resolver.key(),
        &ctx.accounts.htlc.key(),
        params.safety_deposit,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.resolver.to_account_info(),
            ctx.accounts.htlc.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Emit event
    emit!(HTLCCreated {
        htlc_account: ctx.accounts.htlc.key(),
        htlc_id: params.htlc_id,
        resolver: ctx.accounts.resolver.key(),
        dst_address: params.dst_address,
        amount: params.amount,
        hashlock: params.hashlock,
        finality_deadline: params.finality_deadline,
    });

    Ok(())
}

