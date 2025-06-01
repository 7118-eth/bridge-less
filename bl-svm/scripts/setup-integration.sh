#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up bl-svm integration with bl-cli${NC}"
echo "================================================"

# Check if bl-cli directory exists
BL_CLI_DIR="../bl-cli"
if [ ! -d "$BL_CLI_DIR" ]; then
    echo -e "${RED}❌ Error: bl-cli directory not found at $BL_CLI_DIR${NC}"
    exit 1
fi

# Check if coordinator keypair exists
COORDINATOR_KEYPAIR="$HOME/.config/solana/coordinator.json"
if [ ! -f "$COORDINATOR_KEYPAIR" ]; then
    echo -e "${YELLOW}⚠️  Coordinator keypair not found. Creating new one...${NC}"
    solana-keygen new -o "$COORDINATOR_KEYPAIR" --no-bip39-passphrase
fi

# Get addresses
echo -e "\n${BLUE}📍 Getting addresses...${NC}"
USER_ADDRESS=$(solana address)
COORDINATOR_ADDRESS=$(solana address -k "$COORDINATOR_KEYPAIR")
echo -e "User address: ${GREEN}$USER_ADDRESS${NC}"
echo -e "Coordinator address: ${GREEN}$COORDINATOR_ADDRESS${NC}"

# Get program ID from Anchor.toml
PROGRAM_ID=$(grep -E "^\[programs\.localnet\]" -A 1 Anchor.toml | grep "bl_svm" | cut -d'"' -f2)
echo -e "HTLC Program ID: ${GREEN}$PROGRAM_ID${NC}"

# Check if token deployment exists
DEPLOYMENT_FILE="deployments/token.json"
if [ -f "$DEPLOYMENT_FILE" ]; then
    TOKEN_MINT=$(jq -r '.tokenMint' "$DEPLOYMENT_FILE")
    echo -e "Token Mint: ${GREEN}$TOKEN_MINT${NC}"
else
    echo -e "${YELLOW}⚠️  Token not deployed yet. Run 'pnpm run deploy:token' first.${NC}"
    TOKEN_MINT="<TOKEN_NOT_DEPLOYED>"
fi

# Create IDL directory in bl-cli if it doesn't exist
mkdir -p "$BL_CLI_DIR/idl"

# Copy IDL file
echo -e "\n${BLUE}📄 Copying IDL file...${NC}"
if [ -f "target/idl/bl_svm.json" ]; then
    cp target/idl/bl_svm.json "$BL_CLI_DIR/idl/"
    echo -e "${GREEN}✅ IDL copied to bl-cli${NC}"
else
    echo -e "${RED}❌ IDL file not found. Run 'pnpm run build' first.${NC}"
    exit 1
fi

# Get private keys in base58 format
echo -e "\n${BLUE}🔑 Extracting private keys...${NC}"

# Function to convert keypair JSON to base58 using node
json_to_base58() {
    local keypair_file=$1
    node -e "
        const fs = require('fs');
        const bs58 = require('bs58');
        const keypair = JSON.parse(fs.readFileSync('$keypair_file', 'utf8'));
        // bs58 v6 uses default export
        console.log(bs58.default.encode(Buffer.from(keypair)));
    "
}

# Install bs58 if not available
if ! npm list bs58 &>/dev/null; then
    echo -e "${YELLOW}⚠️  Installing bs58 for key conversion...${NC}"
    npm install bs58 --no-save --silent
fi

USER_PRIVATE_KEY=$(json_to_base58 "$HOME/.config/solana/id.json")
COORDINATOR_PRIVATE_KEY=$(json_to_base58 "$COORDINATOR_KEYPAIR")

# Update .env file in bl-cli
ENV_FILE="$BL_CLI_DIR/.env"
echo -e "\n${BLUE}📝 Updating bl-cli/.env file...${NC}"

# Function to update or add env variable
update_env() {
    local key=$1
    local value=$2
    if grep -q "^$key=" "$ENV_FILE"; then
        # Update existing
        sed -i.bak "s|^$key=.*|$key=$value|" "$ENV_FILE"
    else
        # Add new
        echo "$key=$value" >> "$ENV_FILE"
    fi
}

# Update environment variables
update_env "svm_token_contract_address" "$TOKEN_MINT"
update_env "svm_htlc_contract_address" "$PROGRAM_ID"
update_env "svm_user_address" "$USER_ADDRESS"
update_env "svm_coordinator_private_key" "$COORDINATOR_PRIVATE_KEY"
update_env "svm_user_private_key" "$USER_PRIVATE_KEY"

echo -e "${GREEN}✅ Environment variables updated${NC}"

# Display summary
echo -e "\n${BLUE}📊 Integration Setup Summary${NC}"
echo "==============================="
echo -e "Token Mint: ${GREEN}$TOKEN_MINT${NC}"
echo -e "HTLC Program: ${GREEN}$PROGRAM_ID${NC}"
echo -e "User Address: ${GREEN}$USER_ADDRESS${NC}"
echo -e "Coordinator Address: ${GREEN}$COORDINATOR_ADDRESS${NC}"
echo -e "\n${GREEN}✅ Integration setup complete!${NC}"

# Check balances
echo -e "\n${BLUE}💰 Checking balances...${NC}"
USER_BALANCE=$(solana balance "$USER_ADDRESS" | awk '{print $1}')
COORDINATOR_BALANCE=$(solana balance "$COORDINATOR_ADDRESS" | awk '{print $1}')
echo -e "User SOL balance: ${GREEN}$USER_BALANCE SOL${NC}"
echo -e "Coordinator SOL balance: ${GREEN}$COORDINATOR_BALANCE SOL${NC}"

# Next steps
echo -e "\n${BLUE}📋 Next Steps:${NC}"
echo "1. Deploy token if not done: pnpm run deploy:token"
echo "2. Deploy HTLC program: pnpm run deploy"
echo "3. Run tests: pnpm test"
echo "4. Use bl-cli to interact with the contracts"