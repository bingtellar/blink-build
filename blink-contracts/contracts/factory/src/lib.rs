#![no_std]
use blink_types::EscrowConfig;
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, BytesN, Env};

mod vault_contract {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/blink_protocol.wasm"
    );
}

#[contract]
pub struct BlinkFactory;

#[contractimpl]
impl BlinkFactory {
    // ---------------------------------------------------------
    // 🛡️ SECURITY ADDITION 1: INITIALIZE TRUE TREASURY
    // Locks the corporate treasury address into the factory state
    // so it can never be spoofed by a malicious frontend payload.
    // ---------------------------------------------------------
    pub fn init(env: Env, true_treasury: Address) {
        if env.storage().instance().has(&symbol_short!("TREASURY")) {
            panic!("Bingtellar Factory: Already initialized");
        }
        env.storage()
            .instance()
            .set(&symbol_short!("TREASURY"), &true_treasury);
    }

    // ---------------------------------------------------------
    // 🚨 GLOBAL CIRCUIT BREAKER (Emergency Pause)
    // Allows the Bingtellar Treasury to instantly freeze the factory,
    // preventing any new capital from entering the protocol.
    // ---------------------------------------------------------
    pub fn admin_pause_factory(env: Env, pause: bool) {
        let true_treasury: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TREASURY"))
            .expect("Blink Factory: Treasury not initialized");

        // 🛡️ SECURITY: Only the platform treasury can toggle the circuit breaker
        true_treasury.require_auth();

        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &pause);
    }

    // ---------------------------------------------------------
    // 🚨 TREASURY ROTATION (Admin Cold Storage Update)
    // Allows the current Bingtellar Treasury to seamlessly hand
    // over fee collection rights to a new secure wallet address.
    // ---------------------------------------------------------
    pub fn admin_update_treasury(env: Env, new_treasury: Address) {
        let current_treasury: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TREASURY"))
            .expect("Blink Factory: Treasury not initialized");

        // 🛡️ SECURITY: Only the EXISTING treasury can authorize a handover
        current_treasury.require_auth();

        env.storage()
            .instance()
            .set(&symbol_short!("TREASURY"), &new_treasury);
    }

    pub fn deploy_escrow(
        env: Env,
        wasm_hash: BytesN<32>,
        salt: BytesN<32>,
        config: EscrowConfig,
    ) -> Address {
        // 🚨 ENFORCE GLOBAL CIRCUIT BREAKER
        let is_paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);

        if is_paused {
            panic!("Blink Factory: Protocol is currently paused due to an emergency.");
        }

        // ---------------------------------------------------------
        // 🛡️ SECURITY: NATIVE SOROBAN AUTH
        // This ensures the person calling this contract explicitly signed it.
        // It eliminates the need for the 2-step `approve` allowance process.
        // ---------------------------------------------------------
        config.sender.require_auth();

        if config.principal <= 0 {
            panic!("Blink Factory: Principal must be greater than zero");
        }

        // ---------------------------------------------------------
        // 🛡️ SECURITY ADDITION 2: FORCE SECURE TREASURY ROUTING
        // Fetch the locked treasury address and forcefully overwrite
        // whatever platform_address the user submitted in the config.
        // ---------------------------------------------------------
        let true_treasury: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TREASURY"))
            .expect("Bingtellar Factory: Treasury not initialized");

        let mut secure_config = config.clone();
        secure_config.platform_address = true_treasury.clone();

        let token_client = token::Client::new(&env, &secure_config.asset);
        let factory_address = env.current_contract_address();

        // ---------------------------------------------------------
        // 💰 THE UPFRONT BASE FEE ROUTING
        // Since the sender authenticated this transaction, we can instruct
        // the sender's wallet to directly transfer the fee to the true treasury.
        // ---------------------------------------------------------
        if secure_config.base_fee > 0 {
            token_client.transfer(
                &secure_config.sender,
                &true_treasury,
                &secure_config.base_fee,
            );
        }

        // ---------------------------------------------------------
        // 🔒 THE ESCROW PRINCIPAL ROUTING
        // The sender directly transfers the principal into the Factory
        // ---------------------------------------------------------
        token_client.transfer(
            &secure_config.sender,
            &factory_address,
            &secure_config.principal,
        );

        let vault_address = env.deployer().with_current_contract(salt).deploy(wasm_hash);
        let vault_client = vault_contract::Client::new(&env, &vault_address);

        // Send the Principal out of the Factory and into the newly created Vault
        token_client.transfer(&factory_address, &vault_address, &secure_config.principal);

        let mapped_agreement = match secure_config.agreement_type {
            blink_types::AgreementType::Instant => vault_contract::AgreementType::Instant,
            blink_types::AgreementType::Lock => vault_contract::AgreementType::Lock,
            blink_types::AgreementType::Adjustment => vault_contract::AgreementType::Adjustment,
            blink_types::AgreementType::FreeFlow => vault_contract::AgreementType::FreeFlow,
        };

        // 🌟 THE FIX 1: Map the Yield Policy across the contract boundary
        let mapped_yield_policy = match secure_config.yield_policy {
            blink_types::YieldPolicy::Recipient => vault_contract::YieldPolicy::Recipient,
            blink_types::YieldPolicy::Sender => vault_contract::YieldPolicy::Sender,
            blink_types::YieldPolicy::Split => vault_contract::YieldPolicy::Split,
        };

        // ---------------------------------------------------------
        // ⚙️ PASSING THE FEES TO THE VAULT
        // ---------------------------------------------------------
        let vault_init_config = vault_contract::EscrowConfig {
            asset: secure_config.asset,
            claim_hash: secure_config.claim_hash,
            agreement_type: mapped_agreement,
            claimable_at: secure_config.claimable_at,
            expiry_timestamp: secure_config.expiry_timestamp,
            defindex_address: secure_config.defindex_address,
            share_token_address: secure_config.share_token_address, // 🛡️ Safely kept
            platform_address: secure_config.platform_address,       // 🛡️ NOW 100% SECURE
            arbitrator: secure_config.arbitrator.clone(),
            platform_fee_bps: secure_config.platform_fee_bps,
            principal: secure_config.principal,
            reserve_ratio_bps: secure_config.reserve_ratio_bps,
            sender: secure_config.sender.clone(),
            base_fee: secure_config.base_fee,
            cancellation_fee: secure_config.cancellation_fee,
            yield_policy: mapped_yield_policy, // 🌟 THE FIX 2: Injected here
        };

        vault_client.initialize(&vault_init_config);

        env.events().publish(
            (symbol_short!("DEPLOY"), secure_config.sender),
            vault_address.clone(),
        );

        vault_address
    }
}

// This tells Cargo to look for `src/test.rs` when executing `cargo test`
// ---------------------------------------------------------
#[cfg(test)]
mod test;
