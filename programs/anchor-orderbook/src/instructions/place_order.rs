use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::ANCHOR_DISCRIMINATOR,
    state::{OrderStatus, OrderType},
    Order,
};

/// The `PlaceOrder` instruction is used to create a new order in the order book.
/// It has two main functions:
/// 1.  Initializes a new `Order` account, which is a Program Derived Address (PDA)
///     that stores all the details of the an order.
/// 2.  Transfers the necessary tokens from the user's associated token account (ATA)
///     to a new vault account, which is also a PDA, to be held in escrow.
#[derive(Accounts)]
#[instruction(seed: u8)]
pub struct PlaceOrder<'info> {
    /// The user creating the order.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The order's PDA account, which stores the order details.
    /// - `init`: Creates the account on-chain.
    /// - `payer = creator`: The `creator` pays for the account's rent.
    /// - `space`: The size of the `Order` struct plus Anchor's discriminator.
    /// - `seeds = [b"order", creator.key().as_ref(), listed_token_mint.key().as_ref(), &[seed]]`: Derives a unique
    ///   address for the order. The `seed` parameter allows a single user to create
    ///   multiple orders without address conflicts.
    /// - `bump`: The bump seed for the PDA.
    #[account(
        init,
        payer = creator,
        space = ANCHOR_DISCRIMINATOR as usize + Order::INIT_SPACE,
        seeds = [b"order", creator.key().as_ref(), listed_token_mint.key().as_ref(), &[seed]],
        bump
    )]
    pub order: Account<'info, Order>,

    /// The token mint of the asset being listed for trade (e.g., Token X).
    pub listed_token_mint: InterfaceAccount<'info, Mint>,

    /// The token mint of the asset being accepted as payment (e.g., Token Y).
    pub accepting_token_mint: InterfaceAccount<'info, Mint>,

    /// The creator's associated token account for the token they are listing.
    #[account(
        mut,
        associated_token::mint = listed_token_mint,
        associated_token::authority = creator,
    )]
    pub creator_listed_token_ata: InterfaceAccount<'info, TokenAccount>,

    /// The vault account that will hold the listed tokens in escrow.
    /// This is an ATA owned by the `order` PDA.
    /// - `init_if_needed`: Creates the account if it doesn't already exist.
    /// - `payer = creator`: The `creator` pays for the account's rent.
    /// - `associated_token::mint = listed_token_mint`: Ensures the vault holds the correct token.
    /// - `associated_token::authority = order`: The `order` PDA is the owner of this account.
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = listed_token_mint,
        associated_token::authority = order,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> PlaceOrder<'info> {
    /// Creates a new order by setting the fields of the `Order` account.
    ///
    /// # Arguments
    /// * `listed_token_amount` - The total amount of tokens the creator wants to trade.
    /// * `listed_token_price` - The price of one listed token in terms of the accepting token.
    /// * `order_type` - The type of order (Buy or Sell).
    /// * `seed` - The additional seed used for PDA derivation.
    /// * `bumps` - The bump seeds for the PDA accounts.
    pub fn create_order(
        &mut self,
        listed_token_amount: u64,
        listed_token_price: u64,
        order_type: OrderType,
        seed: u8,
        bumps: &PlaceOrderBumps,
    ) -> Result<()> {
        let _ = &self.order.set_inner(Order {
            creator: self.creator.key(),
            listed_token_mint: self.listed_token_mint.key(),
            listed_token_amount,
            listed_token_price,
            accepting_token_mint: self.accepting_token_mint.key(),
            filled_amount: 0,
            order_type,
            order_status: OrderStatus::Open,
            seed,
            bump: bumps.order,
        });

        Ok(())
    }

    /// Transfers the tokens for the order from the creator's ATA to the vault.
    /// This puts the tokens into escrow, where they are owned by the order PDA.
    ///
    /// # Arguments
    /// * `token_amount` - The amount of tokens to transfer to the vault.
    pub fn transfer_to_vault(&mut self, token_amount: u64) -> Result<()> {
        let cpi_context = CpiContext::new(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.creator_listed_token_ata.to_account_info(),
                to: self.vault.to_account_info(),
                authority: self.creator.to_account_info(),
                mint: self.listed_token_mint.to_account_info(),
            },
        );

        transfer_checked(cpi_context, token_amount, self.listed_token_mint.decimals)?;

        Ok(())
    }
}