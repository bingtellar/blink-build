use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contractclient, Address, Env, IntoVal, Symbol, Val,
};

#[contractclient(name = "DeFindexClient")]
#[allow(dead_code)]
pub trait DeFindexTrait {
    fn deposit(
        amounts_desired: soroban_sdk::Vec<i128>,
        amounts_min: soroban_sdk::Vec<i128>,
        to: Address,
        invest: bool,
    ) -> (soroban_sdk::Vec<i128>, i128, Val);

    fn withdraw(
        withdraw_shares: i128,
        min_amounts_out: soroban_sdk::Vec<i128>,
        from: Address,
    ) -> soroban_sdk::Vec<i128>;
}

pub struct BlinkRouter;

impl BlinkRouter {
    pub fn deposit_to_pipe(env: &Env, defindex: &Address, asset: &Address, amount: i128) -> i128 {
        // 🛡️ THE RUST AUTH FIX: Native Soroban Authorization for 3rd-Party Calls
        // Notice the removed `&` before soroban_sdk::vec!. SDK v20 requires an owned Vec.
        env.authorize_as_current_contract(soroban_sdk::vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: asset.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: soroban_sdk::vec![
                        env,
                        env.current_contract_address().into_val(env), // From: Vault
                        defindex.clone().into_val(env),               // To: DeFindex
                        amount.into_val(env),                         // Amount
                    ],
                },
                sub_invocations: soroban_sdk::vec![env],
            }),
        ]);

        let df_client = DeFindexClient::new(env, defindex);

        let res = df_client.deposit(
            &soroban_sdk::vec![env, amount],
            &soroban_sdk::vec![env, 0],
            &env.current_contract_address(),
            &true,
        );
        res.1
    }

    pub fn unwind_and_settle(env: &Env, defindex: &Address, _share_token: &Address, shares: i128) {
        if shares <= 0 {
            return;
        }

        // The DeFindex Vault IS the dfToken contract. When BlinkVault calls withdraw(),
        // BlinkVault is the immediate caller. DeFindex's internal `require_auth` on the caller
        // succeeds automatically. No authorize_as_current_contract needed here.
        let df_client = DeFindexClient::new(env, defindex);

        df_client.withdraw(
            &shares,
            &soroban_sdk::vec![env, 0],
            &env.current_contract_address(),
        );
    }
}
