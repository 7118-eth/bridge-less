# HTLC Bridge - EVM Implementation

A FusionPlus-inspired Hash Time Locked Contract (HTLC) implementation for cross-chain atomic swaps between EVM and Solana.

## Overview

This project implements the EVM side of a cross-chain bridge using HTLCs. It follows a factory pattern where each HTLC is deployed as a separate contract, providing better isolation and security for the proof of concept.

### Key Features

- **Factory Pattern**: Each HTLC is a separate contract deployed through HTLCFactory
- **FusionPlus-inspired Design**: Coordinator/resolver manages the swap process
- **Multi-phase Timelocks**: Finality, resolver exclusive, public, and cancellation periods
- **Cross-chain Token Support**: Stores both source (EVM) and destination (Solana) token addresses
- **Gas Optimized**: Solidity optimizer enabled for reduced deployment costs

### Contracts

- `Token.sol` - ERC20 token with 6 decimals for testing
- `HTLCFactory.sol` - Factory contract that deploys and tracks HTLCs
- `HTLC.sol` - Individual HTLC contract for atomic swaps

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js >= 16 (for additional tooling)
- Git

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bl-evm
```

2. Install dependencies:
```bash
forge install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your private key and RPC URLs
```

## Deployment

### Local Deployment (Anvil)

1. Start a local Anvil instance:
```bash
anvil
```

2. In a new terminal, deploy the contracts:
```bash
# Deploy all contracts
forge script script/DeployAll.s.sol --rpc-url http://localhost:8545 --broadcast

# Or deploy individually
forge script script/Token.s.sol --rpc-url http://localhost:8545 --broadcast
forge script script/HTLCFactory.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Base Sepolia Deployment (Testnet)

1. Ensure you have Base Sepolia ETH for gas. Get some from:
   - [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)

2. Deploy to Base Sepolia:
```bash
forge script script/DeployAll.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
```

### Base Mainnet Deployment

⚠️ **Warning**: Only deploy to mainnet after thorough testing!

```bash
forge script script/DeployAll.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
```

### Deployment Verification

After deployment, contract addresses are saved to `deployments/<chainId>-latest.json`.

To verify contracts on Basescan:
```bash
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> --chain-id <CHAIN_ID> --etherscan-api-key $BASESCAN_API_KEY
```

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Creating an HTLC

```solidity
// Example: Creating an HTLC through the factory
HTLCFactory factory = HTLCFactory(FACTORY_ADDRESS);
IERC20 token = IERC20(TOKEN_ADDRESS);

// Approve factory to spend tokens
token.approve(address(factory), amount);

// Create HTLC
(address htlcAddress, bytes32 htlcId) = factory.createHTLC(
    srcAddress,      // Maker's address
    dstAddress,      // Maker's Solana address (bytes32)
    address(token),  // ERC20 token on EVM
    solanaTokenMint, // SPL token mint on Solana (bytes32)
    amount,          // Amount in token units
    hashlock         // SHA256 hash
);
```

### Interacting with Deployed Contracts

```bash
# Check token balance
cast call $TOKEN_ADDRESS "balanceOf(address)" $WALLET_ADDRESS --rpc-url $RPC_URL

# Approve factory to spend tokens
cast send $TOKEN_ADDRESS "approve(address,uint256)" $FACTORY_ADDRESS $AMOUNT --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Get HTLC details
cast call $HTLC_ADDRESS "amount()" --rpc-url $RPC_URL
cast call $HTLC_ADDRESS "hashlock()" --rpc-url $RPC_URL
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

## Development

### Running Tests

```bash
# Run all tests
forge test

# Run with gas reporting
forge test --gas-report

# Run specific test
forge test --match-test testHTLCInitialization -vvv
```

### Code Quality

```bash
# Format code
forge fmt

# Generate gas snapshots
forge snapshot
```

## Architecture

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation and development guidelines.

## Security Considerations

- This is a proof of concept implementation
- No safety deposits implemented (simplified economics)
- Single coordinator model (not decentralized)
- Timelock values are set for testing on Base (2-second blocks)
- Always audit before mainnet deployment

## License

MIT
