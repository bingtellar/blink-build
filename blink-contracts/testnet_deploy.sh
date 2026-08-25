#!/bin/bash

# -----------------------------------------------------------------------------
# 🚀 BINGTELLAR BLINK: TESTNET DEPLOYMENT SCRIPT (v2.0)
# -----------------------------------------------------------------------------

set -e # Exit immediately if a command fails

# --- 1. CONFIGURATION ---
NETWORK="testnet"
SOURCE="alice" # Your Stellar identity (create with: stellar keys generate alice)
OUT_FILE=".env.deploy"

echo "-------------------------------------------------------"
echo "🛠️  STARTING DEPLOYMENT: $NETWORK"
echo "-------------------------------------------------------"

# Check for stellar-cli
if ! command -v stellar &> /dev/null; then
    echo "❌ Error: stellar-cli not found. Install it: curl -fsSL https://stellar.org/cli | sh"
    exit 1
fi

# --- 2. BUILD & OPTIMIZE ---
echo "📦 Building and optimizing contracts..."
# This builds all cdylib packages in the workspace with optimizations (< 64KB)
stellar contract build --optimize

# Update these lines to match your actual build output
VAULT_WASM="target/wasm32v1-none/release/blink_protocol.wasm"
FACTORY_WASM="target/wasm32v1-none/release/blink_factory.wasm" # Check if factory name is also different
# --- 3. UPLOAD VAULT WASM ---
# We upload the vault first because the Factory needs its hash to deploy instances.
echo "📤 Uploading Blink Vault WASM..."
VAULT_WASM_HASH=$(stellar contract upload \
    --wasm "$VAULT_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK")

echo "✅ Vault WASM Hash: $VAULT_WASM_HASH"

# --- 4. DEPLOY FACTORY ---
echo "🏗️  Deploying Blink Factory..."
FACTORY_ADDRESS=$(stellar contract deploy \
    --wasm "$FACTORY_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --alias blink_factory)

echo "✅ Factory Address: $FACTORY_ADDRESS"

# --- 5. SAVE DEPLOYMENT DATA ---
echo "📝 Saving deployment IDs to $OUT_FILE..."
echo "VAULT_WASM_HASH=$VAULT_WASM_HASH" > "$OUT_FILE"
echo "FACTORY_ADDRESS=$FACTORY_ADDRESS" >> "$OUT_FILE"
echo "NETWORK=$NETWORK" >> "$OUT_FILE"

echo "-------------------------------------------------------"
echo "🏁 DEPLOYMENT COMPLETE"
echo "Your Factory is live and ready to deploy vaults!"
echo "-------------------------------------------------------"

# --- 6. SAVE DEPLOYMENT DATA ---
echo "📝 Saving deployment IDs to $OUT_FILE..."
echo "VAULT_WASM_HASH=$VAULT_WASM_HASH" > "$OUT_FILE"
echo "FACTORY_ADDRESS=$FACTORY_ADDRESS" >> "$OUT_FILE"
echo "NETWORK=$NETWORK" >> "$OUT_FILE"

echo "-------------------------------------------------------"
echo "🏁 DEPLOYMENT COMPLETE"
echo "You can now use these IDs in your frontend and backend."
echo "-------------------------------------------------------"