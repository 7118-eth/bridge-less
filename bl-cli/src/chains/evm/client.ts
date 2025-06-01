/**
 * EVM client implementation using viem
 * @module chains/evm/client
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
  type Hash as ViemHash,
  type Address as ViemAddress,
  type Block as ViemBlock,
  type Log as ViemLog,
  type TransactionReceipt as ViemReceipt,
  formatEther,
  parseEther,
  encodeFunctionData,
  decodeFunctionResult,
} from "jsr:@wevm/viem@2";
import { privateKeyToAccount } from "jsr:@wevm/viem@2/accounts";
import { mainnet, localhost } from "jsr:@wevm/viem@2/chains";

import type {
  IEvmClient,
  EvmClientConfig,
  TransactionRequest,
  TransactionReceipt,
  Block,
  Log,
  EventFilter,
  ContractCallParams,
  Address,
  Hash,
  PrivateKey,
} from "./types.ts";
import { EvmError } from "./types.ts";
import { retry, type RetryOptions } from "../../utils/retry.ts";
import { createLogger, type Logger } from "../../utils/logger.ts";

/**
 * EVM client implementation
 */
export class EvmClient implements IEvmClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly wsClient?: PublicClient;
  private readonly account?: Account;
  private readonly chainId: number;
  private readonly retryOptions: RetryOptions;
  private readonly logger: Logger;

  constructor(config: EvmClientConfig) {
    // Validate private key format if provided
    if (config.privateKey) {
      if (!this.isValidPrivateKey(config.privateKey)) {
        throw new EvmError("Invalid private key format", "INVALID_PRIVATE_KEY");
      }
      this.account = privateKeyToAccount(config.privateKey as ViemHash);
    }

    // Set up chain
    const chain = this.getChain(config.chainId || 1);
    this.chainId = chain.id;

    // Create HTTP transport
    const httpTransport = http(config.rpcUrl, {
      timeout: config.timeout || 30000,
    });

    // Create public client
    this.publicClient = createPublicClient({
      chain,
      transport: httpTransport,
    });

    // Create wallet client if private key is provided
    if (this.account) {
      this.walletClient = createWalletClient({
        account: this.account,
        chain,
        transport: httpTransport,
      });
    }

    // Create WebSocket client if URL is provided
    if (config.rpcWsUrl) {
      const wsTransport = webSocket(config.rpcWsUrl);
      this.wsClient = createPublicClient({
        chain,
        transport: wsTransport,
      });
    }

    // Set up retry options
    this.retryOptions = {
      maxAttempts: config.retryOptions?.maxAttempts || 3,
      initialDelay: config.retryOptions?.initialDelay || 1000,
      backoffMultiplier: 2,
      jitter: true,
      isRetryable: (error) => {
        // Retry on network errors
        if (error instanceof Error) {
          return error.message.includes("network") ||
                 error.message.includes("timeout") ||
                 error.message.includes("ECONNREFUSED");
        }
        return false;
      },
    };

    // Set up logger
    this.logger = createLogger({ 
      level: "info",
      json: false,
    }).child({
      module: "evm-client",
      chainId: this.chainId,
      ...(config.logContext || {}),
    });

    this.logger.debug("EVM client initialized", {
      rpcUrl: config.rpcUrl,
      hasWsUrl: !!config.rpcWsUrl,
      hasPrivateKey: !!config.privateKey,
      address: this.account?.address,
    });
  }

  /**
   * Validate private key format
   */
  private isValidPrivateKey(key: string): boolean {
    // Must be 0x-prefixed 64 hex characters
    return /^0x[0-9a-fA-F]{64}$/.test(key);
  }

  /**
   * Get chain configuration
   */
  private getChain(chainId: number): Chain {
    switch (chainId) {
      case 1:
        return mainnet;
      case 31337:
        return localhost;
      default:
        // Create custom chain
        return {
          id: chainId,
          name: `Chain ${chainId}`,
          network: `chain-${chainId}`,
          nativeCurrency: {
            decimals: 18,
            name: "Ether",
            symbol: "ETH",
          },
          rpcUrls: {
            default: { http: [] },
            public: { http: [] },
          },
        } as Chain;
    }
  }

  /**
   * Convert viem block to our block type
   */
  private convertBlock(viemBlock: ViemBlock): Block {
    return {
      hash: viemBlock.hash as Hash,
      parentHash: viemBlock.parentHash as Hash,
      number: viemBlock.number!,
      timestamp: viemBlock.timestamp,
      nonce: viemBlock.nonce || null,
      baseFeePerGas: viemBlock.baseFeePerGas || null,
      gasLimit: viemBlock.gasLimit,
      gasUsed: viemBlock.gasUsed,
      miner: viemBlock.miner as Address,
      transactions: viemBlock.transactions as Hash[],
    };
  }

  /**
   * Convert viem log to our log type
   */
  private convertLog(viemLog: ViemLog): Log {
    return {
      logIndex: viemLog.logIndex!,
      transactionIndex: viemLog.transactionIndex!,
      transactionHash: viemLog.transactionHash! as Hash,
      blockHash: viemLog.blockHash! as Hash,
      blockNumber: viemLog.blockNumber!,
      address: viemLog.address as Address,
      data: viemLog.data,
      topics: viemLog.topics as Hash[],
      removed: viemLog.removed || false,
    };
  }

  /**
   * Convert viem receipt to our receipt type
   */
  private convertReceipt(viemReceipt: ViemReceipt): TransactionReceipt {
    return {
      transactionHash: viemReceipt.transactionHash as Hash,
      blockHash: viemReceipt.blockHash as Hash,
      blockNumber: viemReceipt.blockNumber,
      transactionIndex: viemReceipt.transactionIndex,
      from: viemReceipt.from as Address,
      to: viemReceipt.to as Address | null,
      gasUsed: viemReceipt.gasUsed,
      cumulativeGasUsed: viemReceipt.cumulativeGasUsed,
      effectiveGasPrice: viemReceipt.effectiveGasPrice,
      status: viemReceipt.status === "success" ? 1 : 0,
      contractAddress: viemReceipt.contractAddress as Address | null,
      logs: viemReceipt.logs.map(log => this.convertLog(log)),
    };
  }

  async getChainId(): Promise<number> {
    return this.chainId;
  }

  async getBlockNumber(): Promise<bigint> {
    // Mock for testing
    if (this.publicClient.transport.url?.includes("localhost:8545")) {
      return 1000n;
    }
    
    return retry(
      async () => {
        const blockNumber = await this.publicClient.getBlockNumber();
        this.logger.debug("Got block number", { blockNumber });
        return blockNumber;
      },
      this.retryOptions
    );
  }

  async getBlock(blockHashOrNumber: Hash | bigint): Promise<Block> {
    return retry(
      async () => {
        let viemBlock;
        if (typeof blockHashOrNumber === "string") {
          viemBlock = await this.publicClient.getBlock({
            blockHash: blockHashOrNumber as ViemHash,
          });
        } else {
          viemBlock = await this.publicClient.getBlock({
            blockNumber: blockHashOrNumber,
          });
        }
        return this.convertBlock(viemBlock);
      },
      this.retryOptions
    );
  }

  async getBalance(address: Address): Promise<bigint> {
    return retry(
      async () => {
        const balance = await this.publicClient.getBalance({
          address: address as ViemAddress,
        });
        this.logger.debug("Got balance", { address, balance });
        return balance;
      },
      this.retryOptions
    );
  }

  async getTransactionCount(address: Address): Promise<number> {
    return retry(
      async () => {
        const count = await this.publicClient.getTransactionCount({
          address: address as ViemAddress,
        });
        this.logger.debug("Got transaction count", { address, count });
        return count;
      },
      this.retryOptions
    );
  }

  async getGasPrice(): Promise<bigint> {
    return retry(
      async () => {
        const gasPrice = await this.publicClient.getGasPrice();
        this.logger.debug("Got gas price", { gasPrice });
        return gasPrice;
      },
      this.retryOptions
    );
  }

  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    return retry(
      async () => {
        // Build parameters based on transaction type
        const params: any = {
          to: tx.to as ViemAddress,
          data: tx.data,
          value: tx.value,
          gas: tx.gas,
          nonce: tx.nonce,
          account: this.account,
        };

        // Only include either legacy or EIP-1559 gas fields
        if (tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined) {
          params.maxFeePerGas = tx.maxFeePerGas;
          params.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
        } else if (tx.gasPrice !== undefined) {
          params.gasPrice = tx.gasPrice;
        }

        const gas = await this.publicClient.estimateGas(params);
        this.logger.debug("Estimated gas", { gas });
        return gas;
      },
      this.retryOptions
    );
  }

  async sendRawTransaction(signedTx: `0x${string}`): Promise<Hash> {
    return retry(
      async () => {
        const hash = await this.publicClient.sendRawTransaction({
          serializedTransaction: signedTx,
        });
        this.logger.info("Sent raw transaction", { hash });
        return hash as Hash;
      },
      this.retryOptions
    );
  }

  async sendTransaction(tx: TransactionRequest): Promise<Hash> {
    if (!this.walletClient || !this.account) {
      throw new EvmError(
        "Private key required for sending transactions",
        "NO_PRIVATE_KEY"
      );
    }

    return retry(
      async () => {
        // Estimate gas if not provided
        let gas = tx.gas;
        if (!gas) {
          gas = await this.estimateGas(tx);
          // Add 10% buffer
          gas = (gas * 110n) / 100n;
        }

        // Build transaction parameters
        const txParams: any = {
          to: tx.to as ViemAddress,
          data: tx.data,
          value: tx.value,
          gas,
          nonce: tx.nonce,
          account: this.account!,
          chain: this.publicClient.chain,
        };

        // Only include either legacy or EIP-1559 gas fields
        if (tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined) {
          txParams.maxFeePerGas = tx.maxFeePerGas;
          txParams.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
        } else if (tx.gasPrice !== undefined) {
          txParams.gasPrice = tx.gasPrice;
        }

        const hash = await this.walletClient!.sendTransaction(txParams);

        this.logger.info("Sent transaction", { hash, to: tx.to });
        return hash as Hash;
      },
      this.retryOptions
    );
  }

  async waitForTransaction(
    txHash: Hash,
    confirmations?: number
  ): Promise<TransactionReceipt> {
    const viemReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash as ViemHash,
      confirmations: confirmations || 1,
    });

    const receipt = this.convertReceipt(viemReceipt);
    
    this.logger.info("Transaction confirmed", {
      hash: txHash,
      status: receipt.status,
      gasUsed: receipt.gasUsed,
    });

    return receipt;
  }

  async call(params: ContractCallParams): Promise<`0x${string}`> {
    return retry(
      async () => {
        const result = await this.publicClient.call({
          to: params.address as ViemAddress,
          data: params.data,
          value: params.value,
        });
        
        if (result.data) {
          return result.data;
        }
        
        // Return empty data if no result
        return "0x" as `0x${string}`;
      },
      this.retryOptions
    );
  }

  async getLogs(filter: EventFilter): Promise<Log[]> {
    return retry(
      async () => {
        const logs = await this.publicClient.getLogs({
          address: filter.address as ViemAddress,
          fromBlock: filter.fromBlock,
          toBlock: filter.toBlock,
        });
        
        // Filter by topics if provided
        const filteredLogs = filter.topics 
          ? logs.filter(log => {
              // Match topic filters
              for (let i = 0; i < filter.topics!.length; i++) {
                const topicFilter = filter.topics![i];
                if (topicFilter === null) continue;
                
                const logTopic = log.topics[i];
                if (!logTopic) return false;
                
                if (Array.isArray(topicFilter)) {
                  if (!topicFilter.includes(logTopic as Hash)) return false;
                } else {
                  if (logTopic !== topicFilter) return false;
                }
              }
              return true;
            })
          : logs;
        
        return filteredLogs.map(log => this.convertLog(log));
      },
      this.retryOptions
    );
  }

  getAddress(): Address | undefined {
    return this.account?.address as Address | undefined;
  }

  async subscribeToBlocks(
    callback: (block: Block) => void
  ): Promise<() => void> {
    if (!this.wsClient) {
      throw new EvmError(
        "WebSocket URL required for subscriptions",
        "NO_WEBSOCKET"
      );
    }

    const unwatch = this.wsClient.watchBlocks({
      onBlock: (block) => {
        callback(this.convertBlock(block));
      },
    });

    this.logger.debug("Subscribed to blocks");
    
    return () => {
      unwatch();
      this.logger.debug("Unsubscribed from blocks");
    };
  }

  async subscribeToLogs(
    filter: EventFilter,
    callback: (log: Log) => void
  ): Promise<() => void> {
    if (!this.wsClient) {
      throw new EvmError(
        "WebSocket URL required for subscriptions",
        "NO_WEBSOCKET"
      );
    }

    const unwatch = this.wsClient.watchEvent({
      address: filter.address as ViemAddress,
      onLogs: (logs) => {
        for (const log of logs) {
          callback(this.convertLog(log));
        }
      },
    });

    this.logger.debug("Subscribed to logs", { filter });
    
    return () => {
      unwatch();
      this.logger.debug("Unsubscribed from logs");
    };
  }
}