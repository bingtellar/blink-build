import { rpc, Address, xdr, scValToNative } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const vaultId = "CC3GFRVJW4KWJPYATFCN5NNNQUJHDMSXRHGVBQOXFMHVNSGWRTWTKTN3";

async function auditStorage() {
    console.log(`🕵️‍♂️  Deep Auditing Ledger for Vault: ${vaultId}`);

    try {
        const contractAddress = Address.fromString(vaultId);
        
        const ledgerKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
            contract: contractAddress.toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(), 
            durability: xdr.ContractDataDurability.persistent()
        }));

        const response = await server.getLedgerEntries(ledgerKey);
        
        if (response.entries && response.entries.length > 0) {
            const entry: any = response.entries[0];
            
            // 🟢 UNIVERSAL DECODER: Handles both old XDR strings and new parsed objects
            let instance;
            if (entry.val) {
                // SDK 2026 Style: Data is already a parsed object
                instance = entry.val.contractData().val().instance();
            } else if (entry.xdr) {
                // Traditional Style: Data is a Base64 string
                const ledgerEntryData = xdr.LedgerEntryData.fromXDR(entry.xdr, "base64");
                instance = ledgerEntryData.contractData().val().instance();
            } else {
                throw new Error("Ledger entry format not recognized. Check SDK version.");
            }

            const storageMap = scValToNative(xdr.ScVal.scvMap(instance.storage() || []));
            
            console.log("-------------------------------------------------------");
            console.log("✅ VAULT LIVE DATA FOUND:");
            console.dir(storageMap, { depth: null }); 
            console.log("-------------------------------------------------------");
        } else {
            console.log("❌ No storage found. The vault might not be fully indexed yet.");
        }
    } catch (e: any) {
        console.error("❌ Audit Error:", e.message);
    }
}

auditStorage();