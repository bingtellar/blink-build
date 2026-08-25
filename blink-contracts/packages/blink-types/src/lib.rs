#![no_std]
use soroban_sdk::{contracterror, contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AgreementType {
    Instant,
    Lock,
    Adjustment, // to be built soon
    FreeFlow,   // 🟢 Enabled for streaming and to be built soon
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Active,
    Ready,
    Claimed,
    Refunded,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum YieldPolicy {
    Recipient,
    Sender,
    Split,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowConfig {
    pub principal: i128,
    // 🟢 NEW: The Dual-Fee Architecture Variables
    pub base_fee: i128,
    pub cancellation_fee: i128,
    pub asset: Address,
    pub sender: Address,
    pub platform_address: Address,
    pub arbitrator: Address, // 🟢 NEW: The Bingtellar Admin Wallet
    pub defindex_address: Address,
    pub share_token_address: Address,
    pub platform_fee_bps: u32,
    pub reserve_ratio_bps: u32,
    pub claim_hash: BytesN<32>,
    // 🟢 UPGRADES: Explicit routing type and optional timestamps
    pub agreement_type: AgreementType,
    pub claimable_at: Option<u64>,
    pub expiry_timestamp: Option<u64>,
    pub yield_policy: YieldPolicy,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowState {
    pub principal: i128,
    pub cancellation_fee: i128,
    pub amount_claimed: i128,
    pub buffer_amount: i128,
    pub strategy_shares: i128,
    pub asset: Address,
    pub sender: Address,
    pub platform_address: Address,
    pub arbitrator: Address,
    pub platform_fee_bps: u32,
    pub claim_hash: BytesN<32>,
    pub created_at: u64, // We keep this as u64 because creation always happens
    // 🟢 UPGRADES: Matching the Option types from Config
    pub claimable_at: Option<u64>,
    pub expiry_timestamp: Option<u64>,
    pub agreement_type: AgreementType,
    pub yield_policy: YieldPolicy,
    pub status: EscrowStatus,
    pub defindex_address: Address,
    pub share_token_address: Address,
    pub is_paused: bool,
    pub milestone_approved: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    VaultNotActive = 3,
    InvalidSecret = 4,
    TimeLockNotExpired = 5,
    Unauthorized = 6,
    InvalidAmount = 7,
    VaultNotReady = 8,
    ProtocolPaused = 9,
    EscrowExpired = 10,
    InvalidAgreementConfiguration = 11,
    EscrowNotExpired = 12,
}
