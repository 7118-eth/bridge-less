use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::HTLCError, events::HTLCCancelled, state::HTLC};

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

/// Handler for cancelling an HTLC
pub fn handler(ctx: Context<Cancel>) -> Result<()> {
    let htlc = &mut ctx.accounts.htlc;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Validate source address matches
    require!(
        ctx.accounts.src_address.key() == htlc.src_address,
        HTLCError::InvalidDestination
    );

    // Check HTLC state
    require!(!htlc.withdrawn, HTLCError::AlreadyWithdrawn);
    require!(!htlc.cancelled, HTLCError::AlreadyCancelled);

    // Check cancellation timing
    require!(
        current_time >= htlc.cancellation_deadline,
        HTLCError::CancellationNotAllowed
    );

    // Mark as cancelled
    htlc.cancelled = true;

    // Transfer tokens from vault back to source
    let htlc_seeds = &[b"htlc".as_ref(), htlc.htlc_id.as_ref(), &[htlc.bump]];
    let signer_seeds = &[&htlc_seeds[..]];

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.htlc_vault.to_account_info(),
                to: ctx.accounts.src_token_account.to_account_info(),
                authority: ctx.accounts.htlc.to_account_info(),
            },
            signer_seeds,
        ),
        htlc.amount,
    )?;

    // Transfer safety deposit to executor as reward
    **ctx
        .accounts
        .htlc
        .to_account_info()
        .try_borrow_mut_lamports()? -= htlc.safety_deposit;
    **ctx
        .accounts
        .executor
        .to_account_info()
        .try_borrow_mut_lamports()? += htlc.safety_deposit;

    // Emit event
    emit!(HTLCCancelled {
        htlc_account: ctx.accounts.htlc.key(),
        executor: ctx.accounts.executor.key(),
    });

    Ok(())
}

