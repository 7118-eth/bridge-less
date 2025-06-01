#!/bin/bash

# Define target directory
TARGET_DIR="../bl-cli/abi"

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Export ABIs for all contracts
echo "Exporting Token ABI..."
forge inspect Token abi --json > "$TARGET_DIR/Token.json"

echo "Exporting HTLC ABI..."
forge inspect HTLC abi --json > "$TARGET_DIR/HTLC.json"

echo "Exporting HTLCFactory ABI..."
forge inspect HTLCFactory abi --json > "$TARGET_DIR/HTLCFactory.json"

echo "Exporting IHTLC ABI..."
forge inspect IHTLC abi --json > "$TARGET_DIR/IHTLC.json"

echo "Exporting IHTLCFactory ABI..."
forge inspect IHTLCFactory abi --json > "$TARGET_DIR/IHTLCFactory.json"

echo "All ABIs exported to $TARGET_DIR"
