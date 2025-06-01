use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Transfer};

use crate::{errors::HTLCError, events::HTLCCancelled, Cancel};

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

    // Save values we need before borrowing
    let htlc_amount = htlc.amount;
    let htlc_safety_deposit = htlc.safety_deposit;
    let htlc_id = htlc.htlc_id;
    let htlc_bump = htlc.bump;

    // Mark as cancelled
    htlc.cancelled = true;

    let htlc_key = ctx.accounts.htlc.key();

    // Transfer tokens from vault back to source
    let htlc_seeds = &[b"htlc".as_ref(), htlc_id.as_ref(), &[htlc_bump]];
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
        htlc_amount,
    )?;

    // Transfer safety deposit to executor as reward
    **ctx
        .accounts
        .htlc
        .to_account_info()
        .try_borrow_mut_lamports()? -= htlc_safety_deposit;
    **ctx
        .accounts
        .executor
        .to_account_info()
        .try_borrow_mut_lamports()? += htlc_safety_deposit;

    // Emit event
    emit!(HTLCCancelled {
        htlc_account: htlc_key,
        executor: ctx.accounts.executor.key(),
    });

    Ok(())
}