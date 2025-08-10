use anchor_lang::prelude::*;

#[error_code]
pub enum AnchorOrderBookError {
  #[msg("invalid order account")]
  InvalidOrderAccount,
  #[msg("invalid listed token mint")]
  InvalidListedTokenMint,
  #[msg("invalid accepting token mint")]
  InvalidAcceptingTokenMint,
  #[msg("invalid order type")]
  InvalidOrderType,
  #[msg("invalid creator")]
  InvalidCreator,
}