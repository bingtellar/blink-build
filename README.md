# ⚡️ Blink Protocol (by Bingtellar)

> **SCF Grant Status:** Tranche 1 (MVP) & Tranche 2 (Testnet & Yield Routing) — **100% Completed**

Blink is a high-performance programmable cross-border escrow, treasury, disbursement and settlement protocol built on Stellar and Soroban for modern enterprises, PSPs, Fintechs and Contractors. Blink transforms the payment infrastructure itself into a yield-generating engine. By integrating audited DeFi yield-vaults (e.g Blend Capital) directly into the payment lifecycle, turning "idle and” dead float settlement float into a 4–8% yield-generating asset. We allow enterprises to earn on funds in transit or pre-settlement, effectively subsidizing their own transaction costs through programmatic yield. It enables non-custodial USDC transfers, automated yield harvesting via DeFindex strategy routing, and seamless off-ramping into fiat rails (NGN, Bank, Mobile Money, Pix, etc.).

---

## 🔗 Live Staging & Deployed Testnet Infrastructure

| Component                 | Network / Location | Reference / URL                                                    |
| :------------------------ | :----------------- | :----------------------------------------------------------------- |
| **BlinkFactory Contract** | Stellar Testnet    | `CBXX6PF5CYXFNYNTGWOEERN5BLOTREMRCS66ZHHRPTAFYEFXQXC6TYCM`         |
| **BlinkVault WASM Hash**  | Stellar Testnet    | `c488f7f81a3c38c025de920d15a7f84a48fb6953c8f024a42edb73b87c3614bd` |
| **Testnet USDC Asset**    | Stellar Testnet    | `CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ`         |
| **Bingtellar Treasury**   | Stellar Testnet    | `G...`                                                             |
| **Live User Portal**      | Staging App        | `https://app.ourblink.cash`                                        |

---

## 🚀 Advanced Protocol Architecture (v3.0.0)

Our engineering velocity outpaced our initial roadmap. The protocol currently features production-grade protections and logic routing:

- **Open-Ended Yield Vaults ("Claimable Now"):** The contract natively handles `void` timestamps, allowing capital to instantly deploy to DeFindex yield strategies while remaining 100% liquid for immediate recipient claims.
- **Just-In-Time (JIT) Settlement:** The Soroban contract bypasses artificial time-locks via mathematical JIT evaluation and explicit enterprise milestone overrides. Protected entirely by `saturating_sub` arithmetic to prevent `u64` underflows.
- **Dual-Tracking Event Oracle:** Our backend Node.js Oracle listens to the Soroban SEP-41 event stream and tracks simultaneous yield splits for both the Sender and Recipient, ensuring off-chain Postgres ledgers are perfectly synchronized with on-chain truth.
- **Global & Local Circuit Breakers:** The Factory and individual Vaults feature Administrator non-custodial "God Mode" overrides and freeze functions for dispute resolution.
- **Agentic Treasury assistant (Radar Copilot):** This is a chat/ voice-activated AI and Smart contract automation agent and an autonomous, 24/7 treasury analyst, embedded directly into the Blink infrastructure. It transforms how enterprises interact with the Stellar network and Soroban smart contracts by allowing CFOs, treasury managers, and operators to execute cross-border payouts, deploy yield-bearing escrows, and audit on-chain cash flow using simple natural conversational language, commands and voice.

---

## ⚡️ Quick Auditor Verification (3-Minute Test)

### 1. Security Analysis (`clippy`)

Verify zero compiler warnings or security flaws across all Rust crates:

```bash
cd blink-contracts
cargo clippy --all-targets --all-features -- -D warnings
```

### 3. Manual On-Chain Interaction Scripts

We have provided CLI scripts using `@stellar/stellar-sdk` to test on-chain actions directly on Testnet:

```bash
# Deploy Escrow Vault

npx ts-node scripts/deploy_escrow.ts

# Claim Principal + Yield

npx ts-node scripts/claim_with_yield.ts

# Cancel escrow payment & Execute Penalty Routing

npx ts-node scripts/cancel.ts

# Reclaim Expired Escrow

npx ts-node scripts/reclaim.ts

# Deposit USDC to Stellar Address

npx ts-node scripts/test-usdc-onchain-deposit.ts
```
