use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::HTLCError, events::HTLCWithdrawn, state::HTLC};

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

/// Handler for withdrawing from an HTLC
pub fn handler(ctx: Context<WithdrawToDestination>, preimage: [u8; 32]) -> Result<()> {
    let htlc = &mut ctx.accounts.htlc;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Check HTLC state
    require!(!htlc.withdrawn, HTLCError::AlreadyWithdrawn);
    require!(!htlc.cancelled, HTLCError::AlreadyCancelled);

    // Verify preimage
    let computed_hash = hashv(&[&preimage]);
    require!(
        computed_hash.to_bytes() == htlc.hashlock,
        HTLCError::InvalidPreimage
    );

    // Check withdrawal timing constraints
    let is_resolver = ctx.accounts.executor.key() == htlc.resolver;

    if current_time < htlc.finality_deadline {
        // Before finality - no withdrawals allowed
        return Err(HTLCError::WithdrawalNotAllowed.into());
    } else if current_time < htlc.resolver_deadline {
        // Resolver exclusive period
        require!(is_resolver, HTLCError::WithdrawalNotAllowed);
    } else if current_time < htlc.public_deadline {
        // Public withdrawal period - anyone can withdraw
        // No additional checks needed
    } else {
        // Past public deadline - no withdrawals allowed
        return Err(HTLCError::WithdrawalNotAllowed.into());
    }

    // Mark as withdrawn
    htlc.withdrawn = true;

    // Transfer tokens from vault to destination
    let htlc_seeds = &[b"htlc".as_ref(), htlc.htlc_id.as_ref(), &[htlc.bump]];
    let signer_seeds = &[&htlc_seeds[..]];

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.htlc_vault.to_account_info(),
                to: ctx.accounts.destination_token_account.to_account_info(),
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
    emit!(HTLCWithdrawn {
        htlc_account: ctx.accounts.htlc.key(),
        preimage,
        executor: ctx.accounts.executor.key(),
        destination: htlc.dst_address,
    });

    Ok(())
}

