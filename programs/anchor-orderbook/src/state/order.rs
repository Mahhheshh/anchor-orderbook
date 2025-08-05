use anchor_lang::prelude::*;

#[repr(C)]
#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum OrderType {
    Buy,
    Sell,
}

#[repr(C)]
#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum OrderStatus {
    Open,
    Filled,
    PartiallyFilled,
}

#[account]
/// Represents a single order in the order book.
/// This account stores all the necessary information for a user's buy or sell order.
pub struct Order {
    /// The public key of the wallet that created the order.
    /// This is the user who wants to perform the trade.
    pub creator: Pubkey,

    /// The public key of the token mint for the asset being listed.
    /// For a SELL order, this is the token the user wants to get rid of (e.g., token_x).
    /// For a BUY order, this is the token the user wants to acquire (e.g., token_x).
    pub listed_token_mint: Pubkey,

    /// The total quantity of the `listed_token_mint` that the user wants to trade.
    pub listed_token_amount: u64,

    /// The price of one unit of the `listed_token_mint`, denominated in the `accepting_token_mint`.
    /// For example, if Alice sells `token_x` for `token_y` at a price of 2, this value is 2.
    /// Note: This is an integer price. For real-world use, this would likely be a fixed-point decimal
    /// or a floating-point number to handle smaller units.
    pub listed_token_price: u64,

    /// The public key of the token mint that the user is willing to accept as payment.
    /// For a SELL order, this is the token the user wants to receive (e.g., token_y).
    /// For a BUY order, this is the token the user is paying with (e.g., token_y).
    pub accepting_token_mint: Pubkey,

    /// The amount of the `listed_token_amount` that has already been filled or traded.
    /// This value increases as the order is partially or fully matched.
    pub filled_amount: u64,

    // TODO: A slippage tolerance could be added here to prevent transactions from being
    // executed if the price moves unfavorably.

    /// The type of order: `Buy` or `Sell`.
    pub order_type: OrderType,

    /// The current status of the order: `Open`, `PartiallyFilled`, or `Filled`.
    pub order_status: OrderStatus,

    /// A unique identifier for the order, allowing a single user to create multiple
    /// orders without conflicting with each other on the same program-derived account.
    pub seed: u8,

    /// The bump seed used to derive the program address for this account.
    pub bump: u8,
}

impl Space for Order {
    const INIT_SPACE: usize = 32 + 32 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + 1;
}
