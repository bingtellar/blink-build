#![cfg(test)]

use crate::factory::{BlinkFactory, BlinkFactoryClient};
use crate::types::{AgreementType, EscrowConfig, YieldPolicy};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Vec};

// 1. MOCK STRATEGY: Simulates a yield-generating protocol like DeFindex
#[soroban_sdk::contract]
pub struct MockDeFindex;

#[soroban_sdk::contractimpl]
impl MockDeFindex {
    pub fn deposit(_env: Env, _amounts: Vec<i128>, _min: Vec<i128>, _to: Address) -> i128 {
        850 // Simulates shares received
    }
    pub fn withdraw(_env: Env, _shares: i128, _min: Vec<i128>, _to: Address) {}
}

// 2. WASM IMPORT: Imports the actual BlinkVault logic for the Factory to deploy
mod vault_wasm {
    soroban_sdk::contractimport!(file = "target/wasm32v1-none/release/blink_protocol.wasm");
}

// 3. HELPER: Sets up the test environment with tokens, admins, and the Factory
fn setup_env<'a>(
    env: &'a Env,
) -> (
    Address,
    Address,
    Address,
    TokenClient<'a>,
    BlinkFactoryClient<'a>,
    Address,
) {
    let sender = Address::generate(env);
    let recipient = Address::generate(env);
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let usdc = TokenClient::new(env, &token_id);

    // Mint initial USDC to the sender
    StellarAssetClient::new(env, &token_id).mint(&sender, &10_000);

    let factory_id = env.register_contract(None, BlinkFactory);
    let defindex_id = env.register_contract(None, MockDeFindex);

    (
        sender,
        recipient,
        token_id,
        usdc,
        BlinkFactoryClient::new(env, &factory_id),
        defindex_id,
    )
}

#[test]
fn test_factory_deployment_and_claim_with_dynamic_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (sender, recipient, usdc_id, usdc, factory, defindex_id) = setup_env(&env);

    // SETUP PLATFORM DATA
    let platform_treasury = Address::generate(&env);
    let share_token_mock = Address::generate(&env);
    let arbitrator_mock = Address::generate(&env);
    let platform_fee_bps = 500; // 5% Bingtellar Fee

    let vault_wasm_hash = env
        .deployer()
        .upload_contract_wasm(Bytes::from_slice(&env, vault_wasm::WASM));

    let secret = BytesN::from_array(&env, &[1; 32]);
    let claim_hash = env.crypto().sha256(&secret.clone().into());
    let salt = BytesN::from_array(&env, &[0; 32]);

    // 4. CONFIG: Updated to match the new Dual-Fee EscrowConfig in blink-types
    let config = EscrowConfig {
        principal: 1000,
        base_fee: 10,         // New upfront fee
        cancellation_fee: 50, // New penalty fee
        asset: usdc_id.clone(),
        sender: sender.clone(),
        platform_address: platform_treasury.clone(),
        arbitrator: arbitrator_mock,
        defindex_address: defindex_id.clone(),
        share_token_address: share_token_mock, // New share token tracking
        platform_fee_bps: platform_fee_bps,
        reserve_ratio_bps: 1000,
        claim_hash,
        agreement_type: AgreementType::Instant,

        // UPGRADED: Option<u64> mapping
        // Instant agreements must not have a claimable_at time-lock
        claimable_at: None,
        expiry_timestamp: Some(env.ledger().timestamp() + 100_000),

        yield_policy: YieldPolicy::Recipient,
    };

    // 5. DEPLOY
    let vault_address = factory.deploy_escrow(&vault_wasm_hash, &salt, &config);

    // --- SIMULATE ON-CHAIN ACTIVITY ---
    // Move 900 to strategy, keep 100 in vault buffer
    usdc.transfer(&vault_address, &defindex_id, &900);

    // Strategy earns 50 USDC yield (Minted directly to vault for testing)
    StellarAssetClient::new(&env, &usdc_id).mint(&vault_address, &50);

    // Return the invested 900 to the vault
    usdc.transfer(&defindex_id, &vault_address, &900);

    // CURRENT VAULT STATE: 1000 (Principal) + 50 (Gross Yield) = 1050

    // 6. EXECUTE CLAIM
    let vault_client = vault_wasm::Client::new(&env, &vault_address);
    vault_client.claim(&secret, &recipient);

    // --- FINAL MATH VERIFICATION ---

    // PLATFORM FEE CALC:
    // Upfront base_fee: 10
    // Yield fee: 50 (Yield) * 500 (BPS) / 10000 = 2.5 USDC (rounds down to 2)
    // Total treasury revenue = 12
    assert_eq!(usdc.balance(&platform_treasury), 12);

    // RECIPIENT PAYOUT: 1000 (Principal) + (50 - 2) (Net Yield) = 1048
    assert_eq!(usdc.balance(&recipient), 1048);

    // VAULT BALANCE: Should be zero (all distributed)
    assert_eq!(usdc.balance(&vault_address), 0);
}
