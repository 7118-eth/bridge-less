/**
 * Mock Solana client for testing
 */

import type {
  ISolanaClient,
  TransactionConfirmation,
  TransactionDetails,
  LogEvent,
  Transaction,
} from "./types.ts";
import { SolanaError, SolanaErrorCode } from "./types.ts";

/**
 * Mock Solana client implementation for testing
 */
export class MockSolanaClient implements ISolanaClient {
  private balances: Map<string, bigint> = new Map();
  private tokenBalances: Map<string, Map<string, bigint>> = new Map();
  private transactions: Map<string, TransactionDetails> = new Map();
  private logSubscriptions: Map<string, ((log: LogEvent) => void)[]> = new Map();
  private currentSlot: number = 1000;
  private isConnected: boolean = false;
  
  // Expose connection for compatibility
  public connection: any = {
    getLatestBlockhash: async () => ({
      blockhash: "mock-blockhash-" + Date.now(),
      lastValidBlockHeight: this.currentSlot + 150,
    }),
    getAccountInfo: async (pubkey: any) => {
      // Return mock account info
      return {
        data: Buffer.alloc(165), // Mock HTLC account data
        executable: false,
        lamports: 1000000,
        owner: "mock-program-id",
      };
    },
  };

  constructor() {
    // Initialize with some default balances
    this.balances.set("coordinator", 10000000000n); // 10 SOL
    this.balances.set("user", 5000000000n); // 5 SOL
  }

  async connect(): Promise<void> {
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async getBalance(address: string): Promise<bigint> {
    return this.balances.get(address) || 0n;
  }

  async getTokenBalance(tokenMint: string, owner: string): Promise<bigint> {
    const mintBalances = this.tokenBalances.get(tokenMint);
    if (!mintBalances) return 0n;
    return mintBalances.get(owner) || 0n;
  }

  async sendTransaction(transaction: Transaction): Promise<string> {
    const signature = `mock-sig-${Date.now()}`;
    
    // Create mock transaction details
    const details: TransactionDetails = {
      signature,
      slot: this.currentSlot++,
      blockTime: Math.floor(Date.now() / 1000),
      meta: {
        err: null,
        fee: 5000,
        logMessages: [
          "Program mock-program-id invoke [1]",
          "Program log: Instruction: CreateHtlc",
          "Program data: c9BovtbnpeV3AA==", // Mock event data
          "Program mock-program-id consumed 50000 compute units",
          "Program mock-program-id success",
        ],
      },
    };
    
    this.transactions.set(signature, details);
    
    // Emit logs to subscribers
    await this.emitLogs("mock-program-id", {
      signature,
      err: null,
      logs: details.meta.logMessages || [],
    });
    
    return signature;
  }

  async waitForTransaction(signature: string): Promise<TransactionConfirmation> {
    const tx = this.transactions.get(signature);
    if (!tx) {
      throw new SolanaError(
        "Transaction not found",
        SolanaErrorCode.TRANSACTION_FAILED
      );
    }
    
    return {
      signature,
      slot: tx.slot,
      err: tx.meta.err,
      confirmations: 32,
    };
  }

  async getTransaction(signature: string): Promise<TransactionDetails | null> {
    return this.transactions.get(signature) || null;
  }

  async subscribeToLogs(
    programId: string,
    callback: (log: LogEvent) => void
  ): Promise<() => void> {
    const callbacks = this.logSubscriptions.get(programId) || [];
    callbacks.push(callback);
    this.logSubscriptions.set(programId, callbacks);
    
    // Return unsubscribe function
    return () => {
      const updatedCallbacks = this.logSubscriptions.get(programId) || [];
      const index = updatedCallbacks.indexOf(callback);
      if (index > -1) {
        updatedCallbacks.splice(index, 1);
      }
    };
  }

  async getSlot(): Promise<number> {
    return this.currentSlot;
  }

  async getBlockTime(): Promise<number> {
    return Math.floor(Date.now() / 1000);
  }

  // Test helpers
  
  /**
   * Set balance for testing
   */
  setBalance(address: string, balance: bigint): void {
    this.balances.set(address, balance);
  }

  /**
   * Set token balance for testing
   */
  setTokenBalance(tokenMint: string, owner: string, balance: bigint): void {
    if (!this.tokenBalances.has(tokenMint)) {
      this.tokenBalances.set(tokenMint, new Map());
    }
    this.tokenBalances.get(tokenMint)!.set(owner, balance);
  }

  /**
   * Emit logs to subscribers
   */
  private async emitLogs(programId: string, log: LogEvent): Promise<void> {
    const callbacks = this.logSubscriptions.get(programId) || [];
    for (const callback of callbacks) {
      callback(log);
    }
  }

  /**
   * Simulate HTLC creation event
   */
  async simulateHTLCCreated(htlcId: Uint8Array): Promise<void> {
    const signature = `htlc-created-${Date.now()}`;
    const event: LogEvent = {
      signature,
      err: null,
      logs: [
        "Program mock-program-id invoke [1]",
        "Program log: Instruction: CreateHtlc",
        // Mock HTLCCreated event with discriminator [115, 208, 175, 214, 231, 165, 231, 151]
        "Program data: c9CvVuelVpd3AA==",
        "Program mock-program-id success",
      ],
    };
    
    await this.emitLogs("mock-program-id", event);
  }

  /**
   * Simulate HTLC withdrawal event
   */
  async simulateHTLCWithdrawn(htlcId: Uint8Array, preimage: Uint8Array): Promise<void> {
    const signature = `htlc-withdrawn-${Date.now()}`;
    const event: LogEvent = {
      signature,
      err: null,
      logs: [
        "Program mock-program-id invoke [1]",
        "Program log: Instruction: WithdrawToDestination",
        // Mock HTLCWithdrawn event with discriminator [234, 147, 184, 74, 116, 176, 252, 98]
        "Program data: 6pO4SnSw/GLiAA==",
        "Program mock-program-id success",
      ],
    };
    
    await this.emitLogs("mock-program-id", event);
  }
}