# Solana Kit: Modern JavaScript SDK for Solana Development

## Key Features

- Tree-shakable architecture
- Zero dependencies
- Modern JavaScript support
- Functional design
- Enhanced type safety
- Modular package structure

## Installation

```shell
npm install --save @solana/kit
```

## Quick Start Example

```typescript
import { createSolanaRpc } from '@solana/kit';

// Create an RPC client
const rpc = createSolanaRpc('http://127.0.0.1:8899');

// Send a request
const slot = await rpc.getSlot().send();
```

## Major Improvements Over Previous Web3.js

- Reduced bundle size (up to 83% smaller)
- Native Ed25519 key support
- Improved performance
- More composable internals
- Better type checking

## Core Packages

- `@solana/accounts`
- `@solana/codecs`
- `@solana/rpc`
- `@solana/transactions`
- And more modular packages

## Unique Capabilities

- Custom RPC transports
- Advanced subscription management
- Comprehensive type safety
- GraphQL RPC querying
- Programmatic client generation

## Compatibility

The `@solana/compat` library allows interoperability between legacy and new library types.

## Development

Open source project developed publicly on GitHub: https://github.com/anza-xyz/kit

The library represents a comprehensive reimagining of Solana's JavaScript development toolkit, focusing on developer experience and modern JavaScript practices.