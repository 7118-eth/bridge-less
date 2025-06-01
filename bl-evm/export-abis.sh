#!/bin/bash

# Create abi directory if it doesn't exist
mkdir -p abi

# Export ABIs for all contracts
echo "Exporting Token ABI..."
forge inspect Token abi --json > abi/Token.json

echo "Exporting HTLC ABI..."
forge inspect HTLC abi --json > abi/HTLC.json

echo "Exporting HTLCFactory ABI..."
forge inspect HTLCFactory abi --json > abi/HTLCFactory.json

echo "Exporting IHTLC ABI..."
forge inspect IHTLC abi --json > abi/IHTLC.json

echo "Exporting IHTLCFactory ABI..."
forge inspect IHTLCFactory abi --json > abi/IHTLCFactory.json

echo "All ABIs exported to ./abi/"