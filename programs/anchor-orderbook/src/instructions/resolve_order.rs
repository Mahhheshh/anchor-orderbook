use crate::{
    state::{OrderStatus, OrderType},
    Order,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

/// This instruction, `resolve_order`, is called by an off-chain order matcher to facilitate token swaps between two parties.
/// It matches and executes orders between a buyer and a seller.
/// The buyer is a wallet that wants to buy a specific token, and the seller is a wallet that wants to sell a specific token.
///
/// For example, if a buyer wants to buy SOL with USDC, their order will specify SOL as the accepting token and USDC as the listed token.
/// Conversely, if a seller wants to sell SOL for USDC, their order will specify SOL as the listed token and USDC as the accepting token.
///
/// The `resolve_order` instruction will then transfer the seller's listed token to the buyer and the buyer's listed token to the seller.
/// This effectively matches their desires by swapping the assets held in their respective order vaults.
///
/// The `resolve_order` instruction requires a specific set of accounts, which are provided by the off-chain order matcher.
///
/// # Arguments
///
/// * `buyer`: The public key of the wallet that placed the buy order.
/// * `seller`: The public key of the wallet that placed the sell order.
///
/// The following accounts are required to execute the swap:
///
/// * `cranker`: The wallet that signs the transaction to initiate the swap.
/// * `token_x_mint`: The mint address of the token being sold by the seller (e.g., SOL).
/// * `token_y_mint`: The mint address of the token being sold by the buyer (e.g., USDC).
/// * `buy_order`: The program-derived address (PDA) storing the details of the buyer's order.
/// * `sell_order`: The program-derived address (PDA) storing the details of the seller's order.
/// * `buy_order_vault`: The vault holding the buyer's listed tokens (e.g., USDC).
/// * `sell_order_vault`: The vault holding the seller's listed tokens (e.g., SOL).
/// * `buyer_ata`: The associated token account (ATA) where the buyer will receive the tokens from the seller (e.g., SOL).
/// * `seller_ata`: The associated token account (ATA) where the seller will receive the tokens from the buyer (e.g., USDC).
///
/// This instruction moves the correct amount of `token_x` from the `sell_order_vault` to the `buyer_ata` and the correct amount of `token_y` from the `buy_order_vault` to the `seller_ata`.
#[derive(Accounts)]
#[instruction(buyer: Pubkey, seller: Pubkey)]
pub struct ResolveOrder<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,

    /// The mint address of Token X, which the seller is offering (e.g., SOL).
    pub token_x_mint: InterfaceAccount<'info, Mint>,
    /// The mint address of Token Y, which the buyer is offering (e.g., USDC).
    pub token_y_mint: InterfaceAccount<'info, Mint>,

    /// The PDA for the buy order. This account holds the details of the buyer's request.
    #[account(
        mut,
        seeds = [b"order", buyer.key().as_ref(), buy_order.listed_token_mint.as_ref(), &[buy_order.seed]],
        bump = buy_order.bump
    )]
    pub buy_order: Account<'info, Order>,

    /// The PDA for the sell order. This account holds the details of the seller's offer.
    #[account(
        mut,
        seeds = [b"order", seller.key().as_ref(), sell_order.listed_token_mint.as_ref(), &[sell_order.seed]],
        bump = buy_order.bump
    )]
    pub sell_order: Account<'info, Order>,

    /// The vault where the buyer's listed tokens (Token Y) are stored.
    #[account(
        mut, 
        associated_token::mint = token_y_mint,
        associated_token::authority = buy_order 
    )]
    pub buy_order_vault: InterfaceAccount<'info, TokenAccount>,

    /// The vault where the seller's listed tokens (Token X) are stored.
    #[account(
        mut, 
        associated_token::mint = token_x_mint,
        associated_token::authority = sell_order 
    )]
    pub sell_order_vault: InterfaceAccount<'info, TokenAccount>,

    /// The buyer's Associated Token Account (ATA) where they will receive Token X from the seller.
    #[account(
        mut, 
        associated_token::mint = token_x_mint,
        associated_token::authority = buyer 
    )]
    pub buyer_ata: InterfaceAccount<'info, TokenAccount>,

    /// The seller's Associated Token Account (ATA) where they will receive Token Y from the buyer.
    #[account(
        mut, 
        associated_token::mint = token_y_mint,
        associated_token::authority = seller 
    )]
    pub seller_ata: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> ResolveOrder<'info> {
    pub fn transfer_from_buyer_to_seller(&mut self, matched_listed_token_amount: u64) -> Result<()> {
        let amount_to_transfer = matched_listed_token_amount * self.buy_order.listed_token_price;

        let cpi_accounts = TransferChecked {
            from: self.buy_order_vault.to_account_info(),
            to: self.seller_ata.to_account_info(),
            authority: self.buy_order.to_account_info(),
            mint: self.token_x_mint.to_account_info(),
        };

        let seeds = &[
            b"order",
            self.buy_order.creator.as_ref(),
            self.buy_order.listed_token_mint.as_ref(),
            &[self.buy_order.seed],
            &[self.buy_order.bump],
        ];

        let signer_seeds = &[&seeds[..]];

        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            amount_to_transfer,
            self.token_x_mint.decimals
        )?;

        Ok(())
    }

    pub fn transfer_from_seller_to_buyer(&mut self, matched_listed_token_amount: u64) -> Result<()> {
        let amount_to_transfer = matched_listed_token_amount;

        let cpi_accounts = TransferChecked {
            from: self.sell_order_vault.to_account_info(),
            to: self.buyer_ata.to_account_info(),
            authority: self.sell_order.to_account_info(),
            mint: self.token_y_mint.to_account_info()
        };

        let seeds = &[
            b"order",
            self.sell_order.creator.as_ref(),
            self.sell_order.listed_token_mint.as_ref(),
            &[self.sell_order.seed],
            &[self.sell_order.bump],
        ];

        let signer_seeds = &[&seeds[..]];

        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            amount_to_transfer,
            self.token_y_mint.decimals
        )?;

        Ok(())
    }

     pub fn update_orders(&mut self, matched_listed_token_amount: u64) -> Result<()> {
        self.sell_order.filled_amount += matched_listed_token_amount;
        if self.sell_order.filled_amount >= self.sell_order.listed_token_amount {
            self.sell_order.order_status = OrderStatus::Filled;
        } else {
            self.sell_order.order_status = OrderStatus::PartiallyFilled;
        }

        self.buy_order.filled_amount += matched_listed_token_amount;
        if self.buy_order.filled_amount >= self.buy_order.listed_token_amount {
            self.buy_order.order_status = OrderStatus::Filled;
        } else {
            self.buy_order.order_status = OrderStatus::PartiallyFilled;
        }
        Ok(())
    }
}