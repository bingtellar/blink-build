#![no_std]
#![allow(unexpected_cfgs)]
use soroban_sdk::{contract, contractimpl, vec, Address, Env, IntoVal, Val, Vec};

#[contract]
pub struct MockDeFindex;

#[contractimpl]
impl MockDeFindex {
    pub fn deposit(
        env: Env,
        amounts_desired: Vec<i128>,
        _amounts_min: Vec<i128>,
        _to: Address,
        _invest: bool,
    ) -> (Vec<i128>, i128, Val) {
        // Return 1:1 shares
        let shares = amounts_desired.get(0).unwrap();
        (amounts_desired, shares, 0u32.into_val(&env))
    }

    pub fn withdraw(
        env: Env,
        withdraw_shares: i128,
        _min_amounts_out: Vec<i128>,
        _from: Address,
    ) -> Vec<i128> {
        // Return 1:1 principal
        vec![&env, withdraw_shares]
    }
}
