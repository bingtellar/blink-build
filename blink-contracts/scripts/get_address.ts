import { Keypair } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config();

const alice = Keypair.fromSecret(process.env.ADMIN_SECRET!);
console.log("-----------------------------------------");
console.log("📍 YOUR PUBLIC KEY (Address):");
console.log(alice.publicKey());
console.log("-----------------------------------------");