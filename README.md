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

### 2. Manual On-Chain Interaction Scripts

We have provided CLI scripts using `@stellar/stellar-sdk` to test on-chain actions directly on Testnet:

```bash
# Deploy Escrow Vault

npx ts-node scripts/deploy_escrow.ts

# Claim Principal
npx ts-node scripts/claim.ts

# Claim Principal + Yield

npx ts-node scripts/claim_with_yield.ts

# Cancel escrow payment & Execute Penalty Routing

npx ts-node scripts/cancel.ts

# Reclaim Expired Escrow

npx ts-node scripts/reclaim.ts

# Deposit USDC to Stellar Address

npx ts-node scripts/test-usdc-onchain-deposit.ts
```

---

## 🤖 Radar AI Copilot — Interactive Auditor Test Suite

The Blink staging interface includes **Radar Copilot**, an intelligent, context-aware treasury assistant, deterministic SQL indexers, and on-chain Soroban event bridges.

Reviewers can open the Radar Copilot chat window on [Staging](https://app.ourblink.cash) and test the following interaction suites:

### 1. On-Chain Ledger & Soroban Contract Audits

Tests multi-table SQL querying, dynamic filter chaining, and valid `stellar.expert` explorer link generation:

| Reviewer Prompt                                                | Core Logic / Layer Tested  | Expected Behavior                                                                                                |
| :------------------------------------------------------------- | :------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `"Show me all claimed escrows this month"`                     | Layer 3.2 (Escrow SQL)     | Returns `CLAIM_COMPLETED` escrows, sums total volume, and renders clickable Soroban Vault & Settlement Tx links. |
| `"Show me all escrows this month and their smart contract ID"` | SEP-41 Contract Validation | Renders the 56-character Contract ID (`C...`) linked to `stellar.expert`, alongside the active Yield Policy.     |
| `"Show me all cancelled escrows"`                              | Edge-Case Indexing         | Surfaces `claim_canceled` records with exact timestamp, penalty allocations, and refund status.                  |
| `"Which escrows are currently locked?"`                        | Dynamic Filtering          | Filters for active/funded vaults without `.limit(10)` truncation, showing locked principal and yield strategy.   |

---

### 2. DeFindex Yield Simulation & Compound Math

Tests mathematical simulation models, APY oracle fetches, and protocol fee deductions:

- **Prompt:** `"How much yield will $250,000 USDC earn in 60 days?"`
  - **Verified Engine:** Calculates compound yield against the live DeFindex strategy APY oracle, itemizing projected earnings net of the 5% platform protocol fee across daily pace, monthly, and 60-day horizons.
- **Prompt:** `"How much capital is currently earning yield in Soroban escrow vaults?"`
  - **Verified Engine:** Queries active on-chain float deployed across Blend and DeFindex yield strategies.

---

### 3. Treasury Cashflow, Burn Rate & Runway Projections, Proper enterprise enterprise accounting and detailed analytics on operations

Tests temporal parsing, deterministic arithmetic, and runway forecasting:

| Test Objective             | Reviewer Prompt                                                                                                                                                                              | Verified Behavior                                                                                      |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **Punctuation Resilience** | `"Our account balance."`                                                                                                                                                                     | Handles trailing punctuation gracefully and immediately returns the exact wallet balance ($177.00).    |
| **Survival Analysis**      | `"What is my monthly burn rate? How long will our capital last?"`                                                                                                                            | Computes 30-day trailing outflow velocity ($/day) and projects remaining liquid runway in days/months. |
| **Categorized Inflows**    | `"What were our total inflows this week?"`                                                                                                                                                   | Evaluates ledger deposits/receivables and isolates inflows from internal sub-ledger sweeps.            |
| **Zero-State Context**     | `"How much did I spend today?"`<br>`"How much was withdrawn this week?"`<br>`"Show me our biggest expenses this month"`<br>`"How many failed payments did we have today?"` _(if zero spend)_ | Displays conversational zero-state context without falling back into generic FAQ responses.            |

---

### 4. Multi-Currency Isolation & Regional Fiat Rails

Tests case-insensitive currency isolation and prevents cross-currency aggregate pollution:

- **Prompt:** `"Show me all payments over 10,000 NGN"`
  - **Verification:** Evaluates `fiatAmount > 10000 AND UPPER(fiatCurrency) = 'NGN'`. All aggregated sums explicitly display the `NGN` denomination rather than defaulting to USD.
- **Prompt:** `"List withdrawals over 5,000 KES this month"`
  - **Verification:** Isolates Kenyan Shilling off-ramps without polluting South African Rand (ZAR) or Ghanaian Cedi (GHS) records.

---

### 5. Agentic Action Routing & Intent Stripping

Tests intent extraction, greeting stripping, and UI modal prefilling:

- **Send Money Modal:** `"Please make a transfer of $50 to recipient@example.com"`
  - _Result:_ Strips conversational filler, opens the Send Modal, and automatically prefills the amount ($50.00) and recipient email.
- **Fiat Withdrawal Modal:** `"I want to withdraw $100 to my Nigerian bank account"`
  - _Result:_ Launches the Withdrawal Portal with $100 prefilled and payment method locked to Bank/NGN.
- **USDC Withdrawal Modal:** `"Withdraw 2 usdc to Stellar wallet at MBFJJEHHGQTQW7K4KTUB7RQELDUD6PVAVPW3DVAGL5AKIWN740HZ6AAAAGQBRC6J6SAV4 and label it as Marketing budget"`
  - _Result:_ Launches the Crypto Withdrawal Portal with $2 prefilled and payment locked to SDC Withdrawal with the USDC Stellar wallet address named and saved as Marketing budget.
- **Automated Data Export:** `"Export a CSV statement for this month"`
  - _Result:_ Generates and triggers the client-side download of `Blink_Treasury_Ledger_THIS_MONTH.csv`.

---

### 6. Institutional Strategy & Narrative Intelligence

Tests high-level corporate treasury questions:

- **Prompt:** `"What problem is Blink solving for enterprise cross-border payments?"`
- **Prompt:** `"Explain why tokenized float on Stellar is superior to traditional 3-day correspondent bank settlement."`

---

### 7. ⚡ Stellar & Soroban Deep-Dive (SCF Reviewer Special)

Tests Radar’s domain expertise on Soroban smart contract architecture, SEP-41 token semantics, cross-contract DeFi composability, and Stellar network economics. Helps with enlightening Enterprises on what's possible with Stellar

| Reviewer Prompt                                                                              | Verified Architectural Layer             | What Radar Surfaces & Proves                                                                                                                                                                |
| :------------------------------------------------------------------------------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"What is Stellar?"`                                                                         | **Ecosystem Baseline (L1)**              | Explains Stellar's core purpose as a decentralized, low-fee network optimized for cross-border asset issuance and fast payments.                                                            |
| `"What is Soroban?"`                                                                         | **Ecosystem Baseline (Smart Contracts)** | Defines Soroban as Stellar's native, Rust-based smart contract platform built for scale, predictable fees, and DeFi composability.                                                          |
| `"How does Blink use Soroban require_auth for non-custodial safety?"`                        | **Soroban Auth Framework**               | Details non-custodial authorization, multi-sig compliance, and how granular `Address::require_auth()` guarantees only the designated sender or recipient can interact with vault funds.     |
| `"Explain how Soroban TTL and state archiving are managed in Blink vaults."`                 | **State & Storage Management**           | Breaks down the differentiation between `Instance`, `Persistent`, and `Temporary` storage, detailing how Blink's auto-relayer extends TTL thresholds to prevent archival of active escrows. |
| `"How does Blink execute cross-contract calls to DeFindex and Blend on Soroban?"`            | **DeFi Composability**                   | Explains the invocation lifecycle from the Blink Escrow Factory into DeFindex strategy routers and Blend lending pools, complete with WASM gas efficiency comparisons.                      |
| `"Why is Blink's dual-tracking oracle built on Soroban contract events instead of Horizon?"` | **SEP-41 Event Streaming**               | Contrasts real-time Soroban RPC event subscriptions (`env.events().publish(...)`) with legacy REST polling, proving zero-drop ledger reconciliation.                                        |
| `"Compare Stellar's 5-second finality and fee model vs. EVM L2s for cross-border payroll."`  | **Network Economics**                    | Generates an institutional comparison highlighting fractional-cent network fees ($0.00001/tx), native deterministic settlement, and the elimination of L2 bridge re-org risks.              |
| `"How does Blink eliminate 'dead float' using Soroban vaults and Stellar Anchors?"`          | **B2B Value Proposition**                | Explains the bridge between SEP-24/SEP-31 fiat off-ramps and interest-bearing Soroban escrow pools—turning transit float into yield-bearing working capital.                                |

---

### 🧪 Live Soroban CLI & RPC Audit Prompts

Reviewers can test direct Web3 queries in Radar Copilot to inspect live testnet state:

- **WASM Hash Verification:**
  - _Prompt:_ `"What is our current Soroban vault WASM hash and factory contract address?"`
  - _Radar Output:_ Returns the compiled WASM hash (`c488f7f8...`) and Factory Contract (`CBXX6PF5...`) linked directly to `stellar.expert/explorer/testnet`.
- **SEP-41 USDC Integration:**
  - _Prompt:_ `"Which USDC contract address is configured for our Soroban testnet vaults?"`
  - _Radar Output:_ Returns `CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ` with token balance validation.
- **Smart Yield Routing Policies:**
  - _Prompt:_ `"Explain the three yield split policies available in our Soroban vault contracts."`
  - _Radar Output:_ Itemizes **Sender Retains Yield**, **Recipient Earns Yield**, and **50/50 Split (Incentive Alignment)**.
