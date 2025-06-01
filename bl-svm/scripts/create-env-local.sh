#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Creating .env.local for bl-cli${NC}"
echo "================================="

# Check if bl-cli directory exists
BL_CLI_DIR="../bl-cli"
if [ ! -d "$BL_CLI_DIR" ]; then
    echo -e "${RED}❌ Error: bl-cli directory not found at $BL_CLI_DIR${NC}"
    exit 1
fi

# Check if .env.example exists
ENV_EXAMPLE="$BL_CLI_DIR/.env.example"
if [ ! -f "$ENV_EXAMPLE" ]; then
    echo -e "${RED}❌ Error: .env.example not found at $ENV_EXAMPLE${NC}"
    exit 1
fi

# Copy .env.example to .env.local
ENV_LOCAL="$BL_CLI_DIR/.env.local"
echo -e "${BLUE}📄 Copying .env.example to .env.local...${NC}"
cp "$ENV_EXAMPLE" "$ENV_LOCAL"

# Check required files exist
COORDINATOR_KEYPAIR="$HOME/.config/solana/coordinator.json"
USER_KEYPAIR="$HOME/.config/solana/id.json"
DEPLOYMENT_FILE="deployments/token.json"

if [ ! -f "$COORDINATOR_KEYPAIR" ]; then
    echo -e "${RED}❌ Error: Coordinator keypair not found. Run 'solana-keygen new -o ~/.config/solana/coordinator.json'${NC}"
    exit 1
fi

if [ ! -f "$USER_KEYPAIR" ]; then
    echo -e "${RED}❌ Error: User keypair not found. Run 'solana-keygen new'${NC}"
    exit 1
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo -e "${RED}❌ Error: Token deployment not found. Run 'yarn run deploy:token' first${NC}"
    exit 1
fi

# Get addresses
echo -e "\n${BLUE}📍 Getting addresses...${NC}"
USER_ADDRESS=$(solana address)
COORDINATOR_ADDRESS=$(solana address -k "$COORDINATOR_KEYPAIR")
PROGRAM_ID=$(grep -E "^\[programs\.localnet\]" -A 1 Anchor.toml | grep "bl_svm" | cut -d'"' -f2)
TOKEN_MINT=$(jq -r '.tokenMint' "$DEPLOYMENT_FILE")

echo -e "User address: ${GREEN}$USER_ADDRESS${NC}"
echo -e "Coordinator address: ${GREEN}$COORDINATOR_ADDRESS${NC}"
echo -e "HTLC Program: ${GREEN}$PROGRAM_ID${NC}"
echo -e "Token Mint: ${GREEN}$TOKEN_MINT${NC}"

# Function to convert keypair JSON to base58 using node
json_to_base58() {
    local keypair_file=$1
    node -e "
        const fs = require('fs');
        const bs58 = require('bs58');
        const keypair = JSON.parse(fs.readFileSync('$keypair_file', 'utf8'));
        console.log(bs58.default.encode(Buffer.from(keypair)));
    "
}

# Get private keys
echo -e "\n${BLUE}🔑 Extracting private keys...${NC}"
USER_PRIVATE_KEY=$(json_to_base58 "$USER_KEYPAIR")
COORDINATOR_PRIVATE_KEY=$(json_to_base58 "$COORDINATOR_KEYPAIR")

# Function to update or add env variable
update_env() {
    local key=$1
    local value=$2
    local file=$3
    
    # Check if key exists in file
    if grep -q "^$key=" "$file"; then
        # Update existing - use different delimiter to avoid issues with slashes
        sed -i.bak "s|^$key=.*|$key=$value|" "$file"
    else
        # Add new
        echo "$key=$value" >> "$file"
    fi
}

# Update SVM-related environment variables
echo -e "\n${BLUE}📝 Updating .env.local with SVM values...${NC}"

update_env "svm_token_contract_address" "$TOKEN_MINT" "$ENV_LOCAL"
update_env "svm_htlc_contract_address" "$PROGRAM_ID" "$ENV_LOCAL"
update_env "svm_user_address" "$USER_ADDRESS" "$ENV_LOCAL"
update_env "svm_coordinator_private_key" "$COORDINATOR_PRIVATE_KEY" "$ENV_LOCAL"
update_env "svm_user_private_key" "$USER_PRIVATE_KEY" "$ENV_LOCAL"

# Also ensure RPC endpoints are set
update_env "svm_rpc" "http://127.0.0.1:8899" "$ENV_LOCAL"
update_env "svm_rpc_ws" "ws://127.0.0.1:8900" "$ENV_LOCAL"

# Clean up backup file
rm -f "$ENV_LOCAL.bak"

echo -e "${GREEN}✅ Created .env.local with SVM configuration${NC}"

# Display summary
echo -e "\n${BLUE}📊 Configuration Summary${NC}"
echo "========================"
echo -e "File created: ${GREEN}$ENV_LOCAL${NC}"
echo -e "Token Mint: ${GREEN}$TOKEN_MINT${NC}"
echo -e "HTLC Program: ${GREEN}$PROGRAM_ID${NC}"
echo -e "User Address: ${GREEN}$USER_ADDRESS${NC}"
echo -e "Coordinator Address: ${GREEN}$COORDINATOR_ADDRESS${NC}"
echo -e "\n${BLUE}💡 Usage:${NC}"
echo "1. cd ../bl-cli"
echo "2. Use .env.local instead of .env for local development"
echo "3. The .env.local file is gitignored by default"

# Check token balances
echo -e "\n${BLUE}💰 Checking token balances...${NC}"
COORDINATOR_TOKEN_ACC=$(jq -r '.coordinatorTokenAccount' "$DEPLOYMENT_FILE")
USER_TOKEN_ACC=$(jq -r '.userTokenAccount' "$DEPLOYMENT_FILE")

echo "Coordinator token account: $COORDINATOR_TOKEN_ACC"
echo "User token account: $USER_TOKEN_ACC"

echo -e "\n${GREEN}✅ Setup complete! Your .env.local is ready for use.${NC}"