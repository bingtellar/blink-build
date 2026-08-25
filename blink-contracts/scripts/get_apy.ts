import { rpc, xdr, scValToNative } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const VAULT_ID = "CB5TVC6IUJJQUS3HV7BB247HRQBWUBCHQRKDB5MHZIGNMFIGT46UR76P";

async function deepAudit() {
    console.log(`🕵️‍♂️  Scanning Ledger Storage for: ${VAULT_ID}`);
    
    // The usual suspects for storage keys
    const keysToTry = ["State", "Vault", "Config", "Data", "Params"];

    for (const keyName of keysToTry) {
        try {
            const key = xdr.ScVal.scvSymbol(keyName);
            // We use 'getContractData' to look at the raw ledger entry
            const entry = await server.getContractData(VAULT_ID, key);

            if (entry) {
                const data: any = scValToNative(entry.val);
                console.log(`\n🎯 FOUND STORAGE KEY: '${keyName}'`);
                console.log("-------------------------------------------------------");
                console.log(`💵 Principal:  ${(Number(data.principal) / 10000000).toFixed(2)} USDC`);
                console.log(`🎨 Fee:        ${(data.platform_fee_bps / 100).toFixed(1)}%`);
                console.log("-------------------------------------------------------");
                return;
            }
        } catch (e) {
            // Keep scanning
        }
    }
    console.log("❌ Storage keys not found. The vault might be using an Address-based key.");
}

deepAudit();