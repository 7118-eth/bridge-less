use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::token::{transfer, Transfer};

use crate::{errors::HTLCError, events::HTLCWithdrawn, WithdrawToDestination};

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

    // Save values we need before borrowing
    let htlc_amount = htlc.amount;
    let htlc_safety_deposit = htlc.safety_deposit;
    let htlc_id = htlc.htlc_id;
    let htlc_bump = htlc.bump;
    let dst_address = htlc.dst_address;

    // Mark as withdrawn
    htlc.withdrawn = true;

    let htlc_key = ctx.accounts.htlc.key();

    // Transfer tokens from vault to destination
    let htlc_seeds = &[b"htlc".as_ref(), htlc_id.as_ref(), &[htlc_bump]];
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
    emit!(HTLCWithdrawn {
        htlc_account: htlc_key,
        preimage,
        executor: ctx.accounts.executor.key(),
        destination: dst_address,
    });

    Ok(())
}