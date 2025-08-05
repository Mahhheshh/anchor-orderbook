use anchor_lang::prelude::*;

declare_id!("AtB8TJoE6YShYh7RdiroVTakjGBbKiMNC5Hn948Y5Pv7");

#[program]
pub mod anchor_orderbook {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
