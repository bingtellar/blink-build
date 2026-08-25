#![no_std]
use blink_types::*;
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Bytes, Env, Symbol};

mod router;
use router::BlinkRouter;

const STATE: Symbol = symbol_short!("STATE");

#[contract]
pub struct BlinkVault;

#[contractimpl]
impl BlinkVault {
    pub fn initialize(env: Env, config: EscrowConfig) -> Result<(), Error> {
        if env.storage().instance().has(&STATE) {
            return Err(Error::AlreadyInitialized);
        }

        let token_client = token::Client::new(&env, &config.asset);
        let current_balance = token_client.balance(&env.current_contract_address());

        if current_balance < config.principal {
            return Err(Error::InvalidAmount);
        }

        let buffer_amount = (config.principal * (config.reserve_ratio_bps as i128)) / 10000;
        let mut strategy_shares = 0;

        match config.agreement_type {
            AgreementType::Instant => {
                // Instant agreements CAN have an expiry_timestamp (for cancel/reclaim)
                // but MUST NOT have a claimable_at time-lock.
                if config.claimable_at.is_some() {
                    return Err(Error::InvalidAgreementConfiguration);
                }
            }
            AgreementType::Lock => {
                // 🟢 FIX 1: Enforce expiry, but allow claimable_at to be None for Instant locks.
                if config.expiry_timestamp.is_none() {
                    return Err(Error::InvalidAgreementConfiguration);
                }

                let deploy = config.principal - buffer_amount;
                if deploy > 0 {
                    strategy_shares = BlinkRouter::deposit_to_pipe(
                        &env,
                        &config.defindex_address,
                        &config.asset,
                        deploy,
                    );
                }
            }
            _ => return Err(Error::InvalidAgreementConfiguration),
        }

        let state = EscrowState {
            principal: config.principal,
            cancellation_fee: config.cancellation_fee,
            amount_claimed: 0,
            buffer_amount,
            strategy_shares,
            asset: config.asset,
            sender: config.sender,
            platform_address: config.platform_address,
            arbitrator: config.arbitrator,
            platform_fee_bps: config.platform_fee_bps,
            claim_hash: config.claim_hash,
            created_at: env.ledger().timestamp(),
            claimable_at: config.claimable_at,
            expiry_timestamp: config.expiry_timestamp,
            agreement_type: config.agreement_type,

            // 🌟 THE FIX 1: Map the Yield Policy passed down from the Factory
            yield_policy: config.yield_policy,

            status: EscrowStatus::Active,
            defindex_address: config.defindex_address,
            share_token_address: config.share_token_address,
            is_paused: false,
            milestone_approved: false,
        };

        env.storage().instance().set(&STATE, &state);
        Ok(())
    }

    // 🟢 THE MILESTONE APPROVAL (Sender authorizes the release of funds)
    pub fn approve_milestone(env: Env) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }

        // Only the sender can approve the milestone release
        state.sender.require_auth();

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        state.milestone_approved = true;
        env.storage().instance().set(&STATE, &state);

        Ok(())
    }
    // ---------------------------------------------------------

    // ---------------------------------------------------------
    // 🟢 THE ARBITRATOR OVERRIDE (Bingtellar Dispute Resolution)
    // ---------------------------------------------------------
    pub fn resolve_dispute(env: Env, favor_recipient: bool) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }

        // 🛡️ SECURITY: Only the Bingtellar Arbitrator can execute this
        state.arbitrator.require_auth();

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        if favor_recipient {
            // RULING FOR FINTECH: Force the milestone open so they can call claim()
            state.milestone_approved = true;
            env.storage().instance().set(&STATE, &state);
        } else {
            // RULING FOR ENTERPRISE: Force the expiry to right now so they can call reclaim()
            // This is safer than executing the token transfer inside this function
            state.expiry_timestamp = Some(env.ledger().timestamp());
            env.storage().instance().set(&STATE, &state);
        }

        Ok(())
    }

    // ---------------------------------------------------------
    // 🚨 THE NON-CUSTODIAL GOD MODE (Automated Admin Override)
    // Allows the Arbitrator to forcefully tear down a stuck vault,
    // ensuring 100% of capital is routed directly back to the Sender.
    // ---------------------------------------------------------
    pub fn admin_cancel(env: Env) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;
        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }
        state.arbitrator.require_auth();

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        if state.strategy_shares > 0 {
            BlinkRouter::unwind_and_settle(
                &env,
                &state.defindex_address,
                &state.share_token_address,
                state.strategy_shares,
            );
            state.strategy_shares = 0;
        }

        let token_client = token::Client::new(&env, &state.asset);
        let total_balance = token_client.balance(&env.current_contract_address());

        state.status = EscrowStatus::Cancelled;
        state.amount_claimed = state.principal;
        env.storage().instance().set(&STATE, &state);

        if total_balance > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.sender,
                &total_balance,
            );
        }
        Ok(())
    }

    // ---------------------------------------------------------
    // 🚨 THE TREASURY CLAWBACK (Orphaned Funds Recovery)
    // Used ONLY when the platform used "God Mode" to manually
    // refund a user off-chain during a severe network outage.
    // ---------------------------------------------------------
    pub fn admin_clawback(env: Env) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;
        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }
        state.arbitrator.require_auth();

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        if state.strategy_shares > 0 {
            BlinkRouter::unwind_and_settle(
                &env,
                &state.defindex_address,
                &state.share_token_address,
                state.strategy_shares,
            );
            state.strategy_shares = 0;
        }

        let token_client = token::Client::new(&env, &state.asset);
        let total_balance = token_client.balance(&env.current_contract_address());

        state.status = EscrowStatus::Cancelled;
        state.amount_claimed = state.principal;
        env.storage().instance().set(&STATE, &state);

        if total_balance > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.platform_address,
                &total_balance,
            );
        }
        Ok(())
    }

    // ---------------------------------------------------------
    // 🚨 LOCAL CIRCUIT BREAKER (Vault Freeze)
    // Allows the Bingtellar Arbitrator to freeze an active vault.
    // This locks all funds in place and blocks claims, cancels,
    // and reclaims until the threat is neutralized.
    // ---------------------------------------------------------
    pub fn admin_toggle_pause(env: Env, pause: bool) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        // 🛡️ SECURITY: Only the Bingtellar Arbitrator can freeze the vault
        state.arbitrator.require_auth();

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady); // Cannot pause a dead vault
        }

        // Toggle the state
        state.is_paused = pause;

        // Save the updated state to the blockchain
        env.storage().instance().set(&STATE, &state);

        Ok(())
    }

    // ---------------------------------------------------------
    // 🚨 SMART CONTRACT UPGRADABILITY (WASM Patching)
    // Allows the Bingtellar Arbitrator to upgrade the Vault's
    // underlying WebAssembly bytecode without moving the capital.
    // ---------------------------------------------------------
    pub fn admin_upgrade_vault(
        env: Env,
        new_wasm_hash: soroban_sdk::BytesN<32>,
    ) -> Result<(), Error> {
        let state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        // 🛡️ SECURITY: Only the Bingtellar Arbitrator can patch the contract
        state.arbitrator.require_auth();

        // 🛡️ Optional Safety: Do not waste gas upgrading a dead vault
        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        // Execute the native Soroban host function to swap the WASM binary
        env.deployer().update_current_contract_wasm(new_wasm_hash);

        Ok(())
    }

    pub fn claim(env: Env, secret: Bytes, recipient: Address, amount: i128) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }

        // Strict State Enforcement
        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        // ---------------------------------------------------------
        // 🟢 NEW: Enforce Milestone Approval for Lock Agreements
        // ---------------------------------------------------------
        if let Some(expiry) = state.expiry_timestamp {
            if env.ledger().timestamp() > expiry {
                return Err(Error::EscrowExpired);
            }
        }

        if env.crypto().sha256(&secret) != state.claim_hash {
            return Err(Error::InvalidSecret);
        }

        // Just-In-Time (JIT) Settlement
        if state.agreement_type == AgreementType::Lock && state.status == EscrowStatus::Active {
            let claimable = state.claimable_at.unwrap_or(0);

            // 🟢 FIX 2: Time-lock strictly applies, UNLESS explicitly overridden by a milestone approval.
            if env.ledger().timestamp() < claimable && !state.milestone_approved {
                return Err(Error::VaultNotReady);
            }

            if state.strategy_shares > 0 {
                BlinkRouter::unwind_and_settle(
                    &env,
                    &state.defindex_address,
                    &state.share_token_address,
                    state.strategy_shares,
                );
                state.strategy_shares = 0;
            }
            state.status = EscrowStatus::Ready;
        } else if state.status != EscrowStatus::Ready
            && state.agreement_type != AgreementType::Instant
        {
            return Err(Error::VaultNotReady);
        }

        if (state.amount_claimed + amount) > state.principal {
            return Err(Error::InvalidAmount);
        }

        let token_client = token::Client::new(&env, &state.asset);
        let remaining_principal = state.principal - state.amount_claimed;
        let total_balance = token_client.balance(&env.current_contract_address());

        let mut platform_share = 0;
        let mut sender_yield = 0;
        let mut recipient_yield = 0;

        // 🟢 THE FIX: Dynamic balance adjustment for the payout
        let mut actual_payout = amount;

        if total_balance > remaining_principal {
            // 📈 SCENARIO A: Profitable Yield
            let total_yield = total_balance - remaining_principal;
            let prop_yield = if remaining_principal > 0 {
                (amount * total_yield) / remaining_principal
            } else {
                total_yield
            };

            // 1. Platform always takes its revenue cut first
            platform_share = (prop_yield * (state.platform_fee_bps as i128)) / 10000;
            let net_yield = prop_yield - platform_share;

            // Route the net yield based on the Sender's configuration
            match state.yield_policy {
                YieldPolicy::Split => {
                    sender_yield = net_yield / 2;
                    recipient_yield = net_yield - sender_yield;
                }
                YieldPolicy::Recipient => {
                    recipient_yield = net_yield;
                }
                YieldPolicy::Sender => {
                    sender_yield = net_yield;
                }
            }
        } else if total_balance < remaining_principal {
            // 📉 SCENARIO B: Negative Yield (Strategy Loss)
            // Calculate the percentage of the principal that was lost
            let available_ratio = (total_balance * 10_000) / remaining_principal;

            // Slashing the requested amount pro-rata based on actual available capital
            actual_payout = (amount * available_ratio) / 10_000;

            // Zero out all yields and fees
            platform_share = 0;
            sender_yield = 0;
            recipient_yield = 0;
        }

        state.amount_claimed += amount; // Track the logical claim, not the slashed payout
        if state.amount_claimed >= state.principal {
            state.status = EscrowStatus::Claimed;
        }
        env.storage().instance().set(&STATE, &state);

        // 3. Dispatch the 3-Way Transfers
        if platform_share > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.platform_address,
                &platform_share,
            );
        }

        // Transfer the dynamically adjusted payout (actual_payout) + Yield
        token_client.transfer(
            &env.current_contract_address(),
            &recipient,
            &(actual_payout + recipient_yield),
        );

        // Transfer Their Yield Share back to Sender
        if sender_yield > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.sender,
                &sender_yield,
            );
        }

        Ok(())
    }

    // 🟢 THE CANCEL BUTTON (Sender undoes a mistake before recipient claims)
    pub fn cancel(env: Env) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }

        state.sender.require_auth();

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        // Unwind any deployed capital from DeFindex
        if state.strategy_shares > 0 {
            BlinkRouter::unwind_and_settle(
                &env,
                &state.defindex_address,
                &state.share_token_address,
                state.strategy_shares,
            );
            state.strategy_shares = 0;
        }

        let token_client = token::Client::new(&env, &state.asset);
        let total_balance = token_client.balance(&env.current_contract_address());
        let principal = state.principal;
        let penalty_fee = state.cancellation_fee;

        // ---------------------------------------------------------
        // THE ECONOMIC CALCULATION (Yield + Penalty Math)
        // ---------------------------------------------------------

        let mut gross_yield = 0;
        let mut available_principal = principal;

        if total_balance > principal {
            gross_yield = total_balance - principal;
        } else {
            // 📉 STRATEGY LOSS: The principal has been slashed
            available_principal = total_balance;
        }

        // 1. Calculate Platform's cut of the yield
        let platform_yield_fee = (gross_yield * (state.platform_fee_bps as i128)) / 10000;
        let net_yield = gross_yield - platform_yield_fee;

        // 2. Calculate Penalty (Protected against slashed principal)
        let actual_penalty = if available_principal >= penalty_fee {
            penalty_fee
        } else {
            available_principal
        };

        // 3. Final amounts to route
        let net_principal_refund = available_principal - actual_penalty;
        let final_user_refund = net_principal_refund + net_yield;
        let total_platform_revenue = platform_yield_fee + actual_penalty;

        // Update state to Cancelled
        state.status = EscrowStatus::Cancelled;
        state.amount_claimed = state.principal;
        env.storage().instance().set(&STATE, &state);

        // Execute routing: Send Revenue to Treasury
        if total_platform_revenue > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.platform_address,
                &total_platform_revenue,
            );
        }

        // Execute routing: Send Net Refund to Sender
        if final_user_refund > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.sender,
                &final_user_refund,
            );
        }

        Ok(())
    }

    // 🟢 THE RECLAIM HATCH (Automated recovery of abandoned funds after expiry)
    pub fn reclaim(env: Env) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        if state.is_paused {
            return Err(Error::ProtocolPaused);
        }

        if state.status == EscrowStatus::Claimed
            || state.status == EscrowStatus::Refunded
            || state.status == EscrowStatus::Cancelled
        {
            return Err(Error::VaultNotReady);
        }

        let expiry = state
            .expiry_timestamp
            .ok_or(Error::InvalidAgreementConfiguration)?;
        if env.ledger().timestamp() <= expiry {
            return Err(Error::EscrowNotExpired);
        }

        if state.strategy_shares > 0 {
            BlinkRouter::unwind_and_settle(
                &env,
                &state.defindex_address,
                &state.share_token_address,
                state.strategy_shares,
            );
            state.strategy_shares = 0;
        }

        let token_client = token::Client::new(&env, &state.asset);
        let remaining_principal = state.principal - state.amount_claimed;
        let total_balance = token_client.balance(&env.current_contract_address());

        let mut platform_share = 0;
        let mut extra_yield = 0;

        // Calculate and extract yield fee if applicable
        if total_balance > remaining_principal {
            let total_yield = total_balance - remaining_principal;
            platform_share = (total_yield * (state.platform_fee_bps as i128)) / 10000;
            extra_yield = total_yield - platform_share;
        }

        state.status = EscrowStatus::Refunded;
        state.amount_claimed = state.principal;
        env.storage().instance().set(&STATE, &state);

        if platform_share > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &state.platform_address,
                &platform_share,
            );
        }

        // ---------------------------------------------------------
        // ⚖️ THE "FORFEITURE TO ORIGINATOR" POLICY
        // In enterprise escrow, if a beneficiary abandons the claim,
        // they forfeit all rights to the accrued interest.
        // The Platform takes its fee, and 100% of the net yield
        // reverts to the Sender's treasury alongside the principal.
        // This intentionally overrides the initial `yield_policy`.
        // ---------------------------------------------------------
        token_client.transfer(
            &env.current_contract_address(),
            &state.sender,
            &(remaining_principal + extra_yield),
        );

        Ok(())
    }

    pub fn prepare_for_settlement(env: Env) -> Result<(), Error> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&STATE)
            .ok_or(Error::NotInitialized)?;

        if state.status != EscrowStatus::Active {
            return Err(Error::VaultNotReady);
        }

        let claimable = state.claimable_at.unwrap_or(0);

        // Prevent arithmetic underflow if claimable is 0.
        if env.ledger().timestamp() < claimable.saturating_sub(14_400) {
            return Err(Error::TimeLockNotExpired);
        }
        if state.strategy_shares > 0 {
            BlinkRouter::unwind_and_settle(
                &env,
                &state.defindex_address,
                &state.share_token_address,
                state.strategy_shares,
            );
            state.strategy_shares = 0;
        }
        state.status = EscrowStatus::Ready;
        env.storage().instance().set(&STATE, &state);
        Ok(())
    }
}
