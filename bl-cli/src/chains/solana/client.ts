/**
 * Solana client implementation using Anza Kit
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "npm:@solana/web3.js@1.95";
import type {
  ISolanaClient,
  SolanaClientConfig,
  TransactionConfirmation,
  TransactionDetails,
  LogEvent,
} from "./types.ts";
import { SolanaError, SolanaErrorCode } from "./types.ts";
import { Logger } from "../../utils/logger.ts";
import { retry } from "../../utils/retry.ts";

/**
 * Solana client implementation
 */
export class SolanaClient implements ISolanaClient {
  private connection: Connection;
  private config: SolanaClientConfig;
  private logger: Logger;
  private isConnected: boolean = false;

  constructor(config: SolanaClientConfig, logger?: Logger) {
    this.config = {
      commitment: "confirmed",
      ...config,
    };
    this.logger = logger || new Logger("solana-client");
    
    // Create web3.js Connection
    this.connection = new Connection(config.rpcUrl, this.config.commitment);
  }

  async connect(): Promise<void> {
    try {
      // Test connection by getting latest blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      this.logger.info("Connected to Solana", { 
        rpcUrl: this.config.rpcUrl,
        blockhash,
      });
      this.isConnected = true;
    } catch (error) {
      throw new SolanaError(
        "Failed to connect to Solana",
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.logger.info("Disconnected from Solana");
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      const pubkey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubkey);
      return BigInt(balance);
    } catch (error) {
      throw new SolanaError(
        `Failed to get balance for ${address}`,
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  async getTokenBalance(tokenMint: string, owner: string): Promise<bigint> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const ownerPubkey = new PublicKey(owner);
      
      // Get associated token account
      const { getAssociatedTokenAddress } = await import("npm:@solana/spl-token@0.3");
      
      const ataAddress = await getAssociatedTokenAddress(
        mintPubkey,
        ownerPubkey
      );
      
      // Get token account info
      const accountInfo = await this.connection.getAccountInfo(ataAddress);
      if (!accountInfo) {
        return 0n; // No token account means 0 balance
      }
      
      // Parse token account data
      const { AccountLayout } = await import("npm:@solana/spl-token@0.3");
      const data = AccountLayout.decode(accountInfo.data);
      
      return BigInt(data.amount.toString());
    } catch (error) {
      // If account doesn't exist, return 0
      if (error.message?.includes("could not find account")) {
        return 0n;
      }
      throw new SolanaError(
        `Failed to get token balance for ${owner}`,
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  async sendTransaction(transaction: any): Promise<string> {
    try {
      // Transaction should be a web3.js Transaction
      const tx = transaction as Transaction;
      
      // Send with retry logic
      const signature = await retry(
        async () => {
          return await this.connection.sendTransaction(tx, {
            skipPreflight: false,
            preflightCommitment: this.config.commitment,
          });
        },
        3,
        { initialDelay: 1000, maxDelay: 5000 }
      );
      
      this.logger.info("Transaction sent", { signature });
      return signature;
    } catch (error) {
      throw new SolanaError(
        "Failed to send transaction",
        SolanaErrorCode.TRANSACTION_FAILED,
        error
      );
    }
  }

  async waitForTransaction(signature: string): Promise<TransactionConfirmation> {
    try {
      const result = await this.connection.confirmTransaction(
        signature,
        this.config.commitment
      );
      
      if (result.value.err) {
        throw new SolanaError(
          "Transaction failed",
          SolanaErrorCode.TRANSACTION_FAILED,
          result.value.err
        );
      }
      
      // Get transaction details for slot info
      const tx = await this.connection.getTransaction(signature, {
        commitment: this.config.commitment,
        maxSupportedTransactionVersion: 0,
      });
      
      return {
        signature,
        slot: tx?.slot || 0,
        err: result.value.err,
        confirmations: null,
      };
    } catch (error) {
      throw new SolanaError(
        `Failed to confirm transaction ${signature}`,
        SolanaErrorCode.TIMEOUT,
        error
      );
    }
  }

  async getTransaction(signature: string): Promise<TransactionDetails | null> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: this.config.commitment,
        maxSupportedTransactionVersion: 0,
      });
      
      if (!tx) {
        return null;
      }
      
      return {
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        meta: {
          err: tx.meta?.err || null,
          fee: tx.meta?.fee || 0,
          logMessages: tx.meta?.logMessages,
        },
      };
    } catch (error) {
      throw new SolanaError(
        `Failed to get transaction ${signature}`,
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  async subscribeToLogs(
    programId: string,
    callback: (log: LogEvent) => void
  ): Promise<() => void> {
    if (!this.rpcSubscriptions) {
      throw new SolanaError(
        "WebSocket URL not configured",
        SolanaErrorCode.CONNECTION_FAILED
      );
    }
    
    try {
      const pubkey = new PublicKey(programId);
      
      // Use web3.js subscription for now
      const subscriptionId = this.connection.onLogs(
        pubkey,
        (logs) => {
          callback({
            signature: logs.signature,
            err: logs.err,
            logs: logs.logs,
          });
        },
        this.config.commitment
      );
      
      // Return unsubscribe function
      return () => {
        this.connection.removeOnLogsListener(subscriptionId);
      };
    } catch (error) {
      throw new SolanaError(
        "Failed to subscribe to logs",
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  async getSlot(): Promise<number> {
    try {
      return await this.connection.getSlot();
    } catch (error) {
      throw new SolanaError(
        "Failed to get slot",
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  async getBlockTime(): Promise<number> {
    try {
      const slot = await this.getSlot();
      const blockTime = await this.connection.getBlockTime(slot);
      return blockTime || Math.floor(Date.now() / 1000);
    } catch (error) {
      throw new SolanaError(
        "Failed to get block time",
        SolanaErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }
}