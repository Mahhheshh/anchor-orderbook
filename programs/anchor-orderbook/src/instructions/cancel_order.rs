use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{state::OrderStatus, Order};

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    /// The user creating the order.
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        has_one = creator,
        has_one = listed_token_mint,
        has_one = accepting_token_mint,
        seeds = [b"order", creator.key().as_ref(), listed_token_mint.key().as_ref(), &[order.seed]],
        bump = order.bump
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

    #[account(
        mut,
        associated_token::mint = listed_token_mint,
        associated_token::authority = order,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> CancelOrder<'info> {
    pub fn transfer_back_and_close(&self) -> Result<()> {
        assert!(self.order.order_status == OrderStatus::Open);

        let creator_binding = self.creator.key();
        let mint_binding = self.listed_token_mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"order".as_ref(),
            creator_binding.as_ref(),
            mint_binding.as_ref(),
            &[self.order.seed],
            &[self.order.bump],
        ]];

        let ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.vault.to_account_info(),
                mint: self.listed_token_mint.to_account_info(),
                to: self.creator_listed_token_ata.to_account_info(),
                authority: self.order.to_account_info(),
            },
            signer_seeds,
        );

        transfer_checked(ctx, self.vault.amount, self.listed_token_mint.decimals)?;

        Ok(())
    }
}
