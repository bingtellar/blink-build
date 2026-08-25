import { rpc, Keypair, Networks, TransactionBuilder, Contract, Address, nativeToScVal } from '@stellar/stellar-sdk';

const IS_MAINNET = import.meta.env.VITE_STELLAR_NETWORK === 'mainnet';
const NETWORK_PASSPHRASE = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;
const SERVER_URL = import.meta.env.VITE_SOROBAN_RPC_URL || (IS_MAINNET ? "https://soroban-rpc.mainnet.stellar.org" : "https://soroban-testnet.stellar.org");
const USDC_CONTRACT_ID = import.meta.env.VITE_USDC_CONTRACT_ID || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";

export class SorobanService {
    
    /**
     * Builds, simulates, and signs a USDC transfer, then returns it as an XDR string 
     * for the backend to pay the gas fee (Fee Bump).
     */
    static async buildAndSignTransferXDR(secretKey: string, toAddress: string, amount: string): Promise<string> {
        try {
            if (!secretKey || !secretKey.startsWith('S') || secretKey.length !== 56) {
                throw new Error("Invalid Stellar Secret Key format.");
            }

            const server = new rpc.Server(SERVER_URL);
            const sourceKeypair = Keypair.fromSecret(secretKey);
            const sourceAddress = sourceKeypair.publicKey();

            // 1. Fetch sequence number
            const account = await server.getAccount(sourceAddress);
            const contract = new Contract(USDC_CONTRACT_ID);
            const amountInStroops = Math.floor(parseFloat(amount) * 10000000);

            // 2. Build the inner transaction
            const tx = new TransactionBuilder(account, {
                fee: "10000", // This is nominal; the backend will override it with the real gas payment
                networkPassphrase: NETWORK_PASSPHRASE,
            })
            .addOperation(contract.call(
                "transfer",
                Address.fromString(sourceAddress).toScVal(),
                Address.fromString(toAddress).toScVal(),
                nativeToScVal(amountInStroops, { type: "i128" })
            ))
            .setTimeout(900) // we give the backend time to process ( exactly 15 minutes (900 second) )
            .build();

            // 3. Simulate to generate the Soroban footprint
            const simulatedTx = await server.simulateTransaction(tx);
            if (!rpc.Api.isSimulationSuccess(simulatedTx)) {
                // 🌟 EXPOSE THE REAL ERROR TO THE BROWSER CONSOLE
                console.error("🚨 DETAILED SIMULATION ERROR:", JSON.stringify(simulatedTx, null, 2));
                throw new Error(`Blockchain Simulation Failed: ${simulatedTx.error || "Check browser console for the exact Soroban error."}`);
            }

            // 4. Assemble and sign the inner transaction
            const assembledTx = rpc.assembleTransaction(tx, simulatedTx).build();
            assembledTx.sign(sourceKeypair);

            // 5. EXPORT AS XDR (Do NOT submit to network here!)
            return assembledTx.toXDR();

        } catch (error: any) {
            console.error("❌ XDR Build Error:", error);
            throw new Error(error.message || "Failed to build transaction payload.");
        }
    }
}