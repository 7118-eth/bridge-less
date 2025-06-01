/**
 * Mock EVM client for testing
 * @module chains/evm/mock_client
 */

import type {
  IEvmClient,
  TransactionRequest,
  TransactionReceipt,
  Block,
  Log,
  EventFilter,
  ContractCallParams,
  Address,
  Hash,
  EvmClientConfig,
} from "./types.ts";
import { EvmError } from "./types.ts";

/**
 * Mock EVM client implementation for tests
 */
export class MockEvmClient implements IEvmClient {
  private readonly address?: Address;
  private blockNumber = 1000n;
  private readonly subscriptions = new Set<() => void>();

  constructor(config: EvmClientConfig) {
    if (config.privateKey) {
      // Mock address generation
      this.address = "0x1234567890123456789012345678901234567890" as Address;
    }
  }

  async getChainId(): Promise<number> {
    return 1;
  }

  async getBlockNumber(): Promise<bigint> {
    return this.blockNumber++;
  }

  async getBlock(blockHashOrNumber: Hash | bigint): Promise<Block> {
    const blockNumber = typeof blockHashOrNumber === "bigint" 
      ? blockHashOrNumber 
      : 1n;
      
    return {
      hash: (typeof blockHashOrNumber === "string" 
        ? blockHashOrNumber 
        : "0x1234567890123456789012345678901234567890123456789012345678901234") as Hash,
      parentHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
      number: blockNumber,
      timestamp: BigInt(Date.now()) / 1000n,
      nonce: "0x0000000000000000",
      baseFeePerGas: 1000000000n,
      gasLimit: 30000000n,
      gasUsed: 21000n,
      miner: "0x0000000000000000000000000000000000000000" as Address,
      transactions: [],
    };
  }

  async getBalance(address: Address): Promise<bigint> {
    return 1000000000000000000n; // 1 ETH
  }

  async getTransactionCount(address: Address): Promise<number> {
    return 5;
  }

  async getGasPrice(): Promise<bigint> {
    return 20000000000n; // 20 gwei
  }

  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    // Simple estimation based on transaction type
    if (tx.data) {
      return 100000n; // Contract interaction
    }
    return 21000n; // Simple transfer
  }

  async sendRawTransaction(signedTx: `0x${string}`): Promise<Hash> {
    return "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash;
  }

  async sendTransaction(tx: TransactionRequest): Promise<Hash> {
    if (!this.address) {
      throw new EvmError(
        "Private key required for sending transactions",
        "NO_PRIVATE_KEY"
      );
    }
    return "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash;
  }

  async waitForTransaction(
    txHash: Hash,
    confirmations?: number
  ): Promise<TransactionReceipt> {
    // Simulate failed transaction for specific hash
    const status = txHash.includes("failed") ? 0 : 1;
    
    return {
      transactionHash: txHash,
      blockHash: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
      blockNumber: this.blockNumber,
      transactionIndex: 0,
      from: this.address || ("0x9999999999999999999999999999999999999999" as Address),
      to: "0x1111111111111111111111111111111111111111" as Address,
      gasUsed: 21000n,
      cumulativeGasUsed: 21000n,
      effectiveGasPrice: 20000000000n,
      status: status as 0 | 1,
      contractAddress: null,
      logs: [],
    };
  }

  async call(params: ContractCallParams): Promise<`0x${string}`> {
    // Return mock data based on function selector
    if (params.data === "0x18160ddd") { // totalSupply()
      return "0x0000000000000000000000000000000000000000000000000000000005f5e100"; // 100000000
    }
    return "0x0000000000000000000000000000000000000000000000000000000000000001"; // Generic success
  }

  async getLogs(filter: EventFilter): Promise<Log[]> {
    // Return mock logs
    return [
      {
        logIndex: 0,
        transactionIndex: 0,
        transactionHash: "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash,
        blockHash: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        blockNumber: this.blockNumber,
        address: filter.address || ("0x1234567890123456789012345678901234567890" as Address),
        data: "0x",
        topics: filter.topics?.filter(t => t !== null).flat() as Hash[] || [],
        removed: false,
      },
    ];
  }

  getAddress(): Address | undefined {
    return this.address;
  }

  async subscribeToBlocks(
    callback: (block: Block) => void
  ): Promise<() => void> {
    // Simulate block subscription
    const interval = setInterval(async () => {
      const block = await this.getBlock(this.blockNumber);
      callback(block);
    }, 1000);

    const unsubscribe = () => {
      clearInterval(interval);
      this.subscriptions.delete(unsubscribe);
    };
    
    this.subscriptions.add(unsubscribe);
    
    // Immediately send one block
    setTimeout(async () => {
      const block = await this.getBlock(this.blockNumber);
      callback(block);
    }, 10);
    
    return unsubscribe;
  }

  async subscribeToLogs(
    filter: EventFilter,
    callback: (log: Log) => void
  ): Promise<() => void> {
    // Simulate log subscription
    const interval = setInterval(async () => {
      const logs = await this.getLogs(filter);
      for (const log of logs) {
        callback(log);
      }
    }, 1000);

    const unsubscribe = () => {
      clearInterval(interval);
      this.subscriptions.delete(unsubscribe);
    };
    
    this.subscriptions.add(unsubscribe);
    
    return unsubscribe;
  }
  
  // Clean up all subscriptions
  cleanup(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions.clear();
  }
}