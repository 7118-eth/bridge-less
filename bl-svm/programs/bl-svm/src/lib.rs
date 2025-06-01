use anchor_lang::prelude::*;

declare_id!("5dkHPRP7JU8k8rPScNLX6eG8vLhtMvciFjKxAsDqzBcL");

#[program]
pub mod bl_svm {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
