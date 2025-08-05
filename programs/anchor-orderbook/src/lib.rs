use anchor_lang::prelude::*;

mod constants;
mod instructions;
mod state;

use constants::*;
use instructions::*;
use state::*;

declare_id!("AtB8TJoE6YShYh7RdiroVTakjGBbKiMNC5Hn948Y5Pv7");

#[program]
pub mod anchor_orderbook {
    use super::*;

    pub fn place_order(
        ctx: Context<PlaceOrder>,
        seed: u8,
        listed_token_amount: u64,
        listed_token_price: u64,
        order_type: OrderType,
    ) -> Result<()> {
        ctx.accounts.create_order(
            listed_token_amount,
            listed_token_price,
            order_type,
            seed,
            &ctx.bumps,
        )?;

        ctx.accounts.transfer_to_vault(listed_token_amount)?;
        Ok(())
    }

    pub fn resolve_order(
        ctx: Context<ResolveOrder>,
        buyer: Pubkey,
        seller: Pubkey,
        amount: u64,
    ) -> Result<()> {
        ctx.accounts.transfer_from_buyer_to_seller(amount)?;
        ctx.accounts.transfer_from_seller_to_buyer(amount)?;
        ctx.accounts.update_orders(amount)?;
        Ok(())
    }

    pub fn close_order(ctx: Context<CancelOrder>) -> Result<()> {
        ctx.accounts.transfer_back_and_close()?;
        Ok(())
    }
}
