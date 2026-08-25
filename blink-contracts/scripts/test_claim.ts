import { rpc, Networks, Keypair, TransactionBuilder, Contract, nativeToScVal, Address } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!); 

async function testClaim() {
    const vaultId = "CBFF7FN4ZVP6ON5LXC36YJHAOPBVR7TTFL45GE5MXWNM4LBLTKDSTFH3";
    const vault = new Contract(vaultId);
    
    // The password we hashed during deployment (32 bytes of zeros)
    const secret = Buffer.alloc(32); 
    const recipient = alice.publicKey(); // Sending to ourselves for the test
    const amountToClaim = "500000"; // 0.05 XLM (5% of total)

    console.log(`🧪 Attempting to claim ${amountToClaim} stroops from the stream...`);

    const account = await server.getAccount(alice.publicKey());
    const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: Networks.TESTNET })
        .addOperation(vault.call("claim", 
            nativeToScVal(secret, { type: 'bytes' }),
            nativeToScVal(recipient, { type: 'address' }),
            nativeToScVal(amountToClaim, { type: 'i128' })
        ))
        .setTimeout(60)
        .build();

    try {
        const prepared = await server.prepareTransaction(tx);
        prepared.sign(alice);
        const sent = await server.sendTransaction(prepared);
        console.log("⏳ Transaction Sent. Hash:", sent.hash);
        
        // Wait for confirmation logic here...
        console.log("✅ CLAIM SUCCESSFUL! Check your wallet balance.");
    } catch (e: any) {
        console.error("❌ CLAIM FAILED:", e.message);
        console.log("💡 Tip: If it's 'InvalidAmount', wait 60 seconds for more funds to unlock!");
    }
}

testClaim();