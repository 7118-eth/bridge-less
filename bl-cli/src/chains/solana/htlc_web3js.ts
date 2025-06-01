/**
 * Solana HTLC manager implementation
 */

import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "npm:@solana/web3.js@1.95";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "npm:@solana/spl-token@0.3";
import { BorshCoder } from "npm:@coral-xyz/anchor@0.29";
import type {
  ISolanaHTLCManager,
  ISolanaClient,
  CreateHTLCParams,
  CreateHTLCResult,
  HTLCState,
  SolanaHTLCEvent,
  HTLCEventType,
  HTLCCreatedEvent,
  HTLCWithdrawnEvent,
  HTLCCancelledEvent,
} from "./types.ts";
import { SolanaError, SolanaErrorCode } from "./types.ts";
import { Logger } from "../../utils/logger.ts";
import idl from "../../../idl/bl_svm.json" with { type: "json" };

/**
 * Discriminators from IDL for event parsing
 */
const EVENT_DISCRIMINATORS = {
  HTLCCreated: [115, 208, 175, 214, 231, 165, 231, 151],
  HTLCWithdrawn: [234, 147, 184, 74, 116, 176, 252, 98],
  HTLCCancelled: [158, 220, 88, 107, 94, 201, 107, 149],
};

/**
 * HTLC manager configuration
 */
export interface HTLCManagerConfig {
  client: ISolanaClient;
  programId: string;
  tokenMint: string;
  keypair: Keypair;
  logger?: Logger;
}

/**
 * Solana HTLC manager implementation
 */
export class SolanaHTLCManager implements ISolanaHTLCManager {
  private client: ISolanaClient & { connection: any };
  private programId: PublicKey;
  private tokenMint: PublicKey;
  private keypair: Keypair;
  private logger: Logger;
  private coder: BorshCoder;

  constructor(config: HTLCManagerConfig) {
    this.client = config.client as ISolanaClient & { connection: any };
    this.programId = new PublicKey(config.programId);
    this.tokenMint = new PublicKey(config.tokenMint);
    this.keypair = config.keypair;
    this.logger = config.logger || new Logger("solana-htlc");
    
    // Initialize Anchor coder for event parsing
    try {
      this.coder = new BorshCoder(idl as any);
    } catch (error) {
      this.logger.warn("Failed to initialize BorshCoder, some features may be limited", { error: error.message });
      // Create a mock coder that throws to force manual encoding
      this.coder = {
        instruction: {
          encode: (name: string, data: any) => {
            throw new Error("Mock coder - use manual encoding");
          }
        },
        accounts: {
          decode: (name: string, data: Buffer) => ({})
        },
        events: {
          decode: (data: Buffer) => null
        }
      } as any;
    }
  }

  async createHTLC(params: CreateHTLCParams): Promise<CreateHTLCResult> {
    try {
      // Derive HTLC PDA
      const [htlcPda, bump] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("htlc"), params.htlcId],
        this.programId
      );
      
      this.logger.info("Creating HTLC", {
        htlcId: Array.from(params.htlcId, b => b.toString(16).padStart(2, '0')).join(''),
        htlcPda: htlcPda.toBase58(),
      });
      
      // Get resolver's token account
      const resolverTokenAccount = await getAssociatedTokenAddress(
        this.tokenMint,
        this.keypair.publicKey
      );
      
      // Derive HTLC vault PDA
      const [htlcVault] = PublicKey.findProgramAddressSync(
        [
          htlcPda.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          this.tokenMint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Build instruction data
      let instructionData: Uint8Array;
      try {
        instructionData = this.coder.instruction.encode("create_htlc", {
          params: {
            htlc_id: Array.from(params.htlcId),
            dst_address: Array.from(params.destinationAddress),
            dst_token: Array.from(params.destinationToken),
            amount: params.amount.toString(),
            safety_deposit: params.safetyDeposit.toString(),
            hashlock: Array.from(params.hashlock),
            finality_deadline: params.timelocks.finality,
            resolver_deadline: params.timelocks.resolver,
            public_deadline: params.timelocks.public,
            cancellation_deadline: params.timelocks.cancellation,
          },
        });
      } catch (error) {
        // Fallback: manually construct the instruction data
        this.logger.warn("Using fallback instruction encoding");
        
        // Discriminator for create_htlc: [217, 24, 248, 19, 247, 183, 68, 88]
        const discriminator = new Uint8Array([217, 24, 248, 19, 247, 183, 68, 88]);
        
        // Manually encode the parameters (simplified version)
        const data = new Uint8Array(8 + 32 + 20 + 20 + 8 + 8 + 32 + 8 + 8 + 8 + 8);
        let offset = 0;
        
        // Discriminator
        data.set(discriminator, offset);
        offset += 8;
        
        // htlc_id
        data.set(params.htlcId, offset);
        offset += 32;
        
        // dst_address
        data.set(params.destinationAddress, offset);
        offset += 20;
        
        // dst_token
        data.set(params.destinationToken, offset);
        offset += 20;
        
        // amount (u64 - little endian)
        const amountBytes = new Uint8Array(8);
        const amountView = new DataView(amountBytes.buffer);
        amountView.setBigUint64(0, params.amount, true);
        data.set(amountBytes, offset);
        offset += 8;
        
        // safety_deposit (u64 - little endian)
        const safetyBytes = new Uint8Array(8);
        const safetyView = new DataView(safetyBytes.buffer);
        safetyView.setBigUint64(0, params.safetyDeposit, true);
        data.set(safetyBytes, offset);
        offset += 8;
        
        // hashlock
        data.set(params.hashlock, offset);
        offset += 32;
        
        // timestamps (i64 - little endian)
        const finalityBytes = new Uint8Array(8);
        const finalityView = new DataView(finalityBytes.buffer);
        finalityView.setBigInt64(0, BigInt(params.timelocks.finality), true);
        data.set(finalityBytes, offset);
        offset += 8;
        
        const resolverBytes = new Uint8Array(8);
        const resolverView = new DataView(resolverBytes.buffer);
        resolverView.setBigInt64(0, BigInt(params.timelocks.resolver), true);
        data.set(resolverBytes, offset);
        offset += 8;
        
        const publicBytes = new Uint8Array(8);
        const publicView = new DataView(publicBytes.buffer);
        publicView.setBigInt64(0, BigInt(params.timelocks.public), true);
        data.set(publicBytes, offset);
        offset += 8;
        
        const cancelBytes = new Uint8Array(8);
        const cancelView = new DataView(cancelBytes.buffer);
        cancelView.setBigInt64(0, BigInt(params.timelocks.cancellation), true);
        data.set(cancelBytes, offset);
        
        instructionData = data;
      }
      
      // Create instruction
      const instruction = new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: htlcPda, isSigner: false, isWritable: true },
          { pubkey: this.tokenMint, isSigner: false, isWritable: false },
          { pubkey: resolverTokenAccount, isSigner: false, isWritable: true },
          { pubkey: htlcVault, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });
      
      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      
      // Get recent blockhash
      const { blockhash } = await this.client.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.keypair.publicKey;
      
      // Sign transaction
      transaction.sign(this.keypair);
      
      // Send transaction
      const signature = await this.client.sendTransaction(transaction);
      
      // Wait for confirmation
      const confirmation = await this.client.waitForTransaction(signature);
      
      this.logger.info("HTLC created", {
        htlcAddress: htlcPda.toBase58(),
        transactionHash: signature,
        slot: confirmation.slot,
      });
      
      return {
        htlcAddress: htlcPda.toBase58(),
        transactionHash: signature,
        slot: confirmation.slot,
      };
    } catch (error) {
      this.logger.error("Failed to create HTLC", error);
      throw new SolanaError(
        "Failed to create HTLC",
        SolanaErrorCode.TRANSACTION_FAILED,
        error
      );
    }
  }

  async withdrawToDestination(
    htlcId: Uint8Array,
    preimage: Uint8Array
  ): Promise<string> {
    try {
      // Derive HTLC PDA
      const [htlcPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("htlc"), htlcId],
        this.programId
      );
      
      this.logger.info("Withdrawing from HTLC", {
        htlcId: Array.from(htlcId, b => b.toString(16).padStart(2, '0')).join(''),
        htlcPda: htlcPda.toBase58(),
      });
      
      // Get executor's token account
      const executorTokenAccount = await getAssociatedTokenAddress(
        this.tokenMint,
        this.keypair.publicKey
      );
      
      // Derive HTLC vault PDA
      const [htlcVault] = PublicKey.findProgramAddressSync(
        [
          htlcPda.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          this.tokenMint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Build instruction data
      const instructionData = this.coder.instruction.encode(
        "withdraw_to_destination",
        {
          preimage: Array.from(preimage),
        }
      );
      
      // Create instruction
      const instruction = new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: htlcPda, isSigner: false, isWritable: true },
          { pubkey: this.tokenMint, isSigner: false, isWritable: false },
          { pubkey: htlcVault, isSigner: false, isWritable: true },
          { pubkey: executorTokenAccount, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: new Uint8Array(instructionData),
      });
      
      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      
      // Get recent blockhash
      const { blockhash } = await this.client.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.keypair.publicKey;
      
      // Sign transaction
      transaction.sign(this.keypair);
      
      // Send transaction
      const signature = await this.client.sendTransaction(transaction);
      
      // Wait for confirmation
      await this.client.waitForTransaction(signature);
      
      this.logger.info("HTLC withdrawn", {
        htlcAddress: htlcPda.toBase58(),
        transactionHash: signature,
      });
      
      return signature;
    } catch (error) {
      this.logger.error("Failed to withdraw from HTLC", error);
      throw new SolanaError(
        "Failed to withdraw from HTLC",
        SolanaErrorCode.TRANSACTION_FAILED,
        error
      );
    }
  }

  async cancel(htlcId: Uint8Array): Promise<string> {
    try {
      // Derive HTLC PDA
      const [htlcPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("htlc"), htlcId],
        this.programId
      );
      
      this.logger.info("Cancelling HTLC", {
        htlcId: Array.from(htlcId, b => b.toString(16).padStart(2, '0')).join(''),
        htlcPda: htlcPda.toBase58(),
      });
      
      // Get HTLC state to find src_address
      const htlcState = await this.getHTLCState(htlcId);
      if (!htlcState) {
        throw new Error("HTLC not found");
      }
      
      const srcAddress = new PublicKey(htlcState.srcAddress);
      
      // Get source token account
      const srcTokenAccount = await getAssociatedTokenAddress(
        this.tokenMint,
        srcAddress
      );
      
      // Derive HTLC vault PDA
      const [htlcVault] = PublicKey.findProgramAddressSync(
        [
          htlcPda.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          this.tokenMint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Build instruction data
      const instructionData = this.coder.instruction.encode("cancel", {});
      
      // Create instruction
      const instruction = new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: htlcPda, isSigner: false, isWritable: true },
          { pubkey: srcAddress, isSigner: false, isWritable: true },
          { pubkey: this.tokenMint, isSigner: false, isWritable: false },
          { pubkey: htlcVault, isSigner: false, isWritable: true },
          { pubkey: srcTokenAccount, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: new Uint8Array(instructionData),
      });
      
      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      
      // Get recent blockhash
      const { blockhash } = await this.client.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.keypair.publicKey;
      
      // Sign transaction
      transaction.sign(this.keypair);
      
      // Send transaction
      const signature = await this.client.sendTransaction(transaction);
      
      // Wait for confirmation
      await this.client.waitForTransaction(signature);
      
      this.logger.info("HTLC cancelled", {
        htlcAddress: htlcPda.toBase58(),
        transactionHash: signature,
      });
      
      return signature;
    } catch (error) {
      this.logger.error("Failed to cancel HTLC", error);
      throw new SolanaError(
        "Failed to cancel HTLC",
        SolanaErrorCode.TRANSACTION_FAILED,
        error
      );
    }
  }

  async getHTLCState(htlcId: Uint8Array): Promise<HTLCState | null> {
    try {
      // Derive HTLC PDA
      const [htlcPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("htlc"), htlcId],
        this.programId
      );
      
      // Get account info
      const accountInfo = await this.client.connection.getAccountInfo(htlcPda);
      if (!accountInfo) {
        return null;
      }
      
      // Decode account data
      const decoded = this.coder.accounts.decode("HTLC", accountInfo.data);
      
      return {
        resolver: decoded.resolver.toBase58(),
        srcAddress: decoded.srcAddress.toBase58(),
        dstAddress: new Uint8Array(decoded.dstAddress),
        srcToken: decoded.srcToken.toBase58(),
        dstToken: new Uint8Array(decoded.dstToken),
        amount: BigInt(decoded.amount.toString()),
        safetyDeposit: BigInt(decoded.safetyDeposit.toString()),
        hashlock: new Uint8Array(decoded.hashlock),
        htlcId: new Uint8Array(decoded.htlcId),
        finalityDeadline: decoded.finalityDeadline.toNumber(),
        resolverDeadline: decoded.resolverDeadline.toNumber(),
        publicDeadline: decoded.publicDeadline.toNumber(),
        cancellationDeadline: decoded.cancellationDeadline.toNumber(),
        withdrawn: decoded.withdrawn,
        cancelled: decoded.cancelled,
        createdAt: decoded.createdAt.toNumber(),
      };
    } catch (error) {
      this.logger.error("Failed to get HTLC state", error);
      return null;
    }
  }

  async watchHTLCEvents(
    callback: (event: SolanaHTLCEvent) => void
  ): Promise<() => void> {
    this.logger.info("Starting HTLC event monitoring");
    
    // Subscribe to program logs
    const unsubscribe = await this.client.subscribeToLogs(
      this.programId.toBase58(),
      async (log) => {
        try {
          // Parse logs for events
          for (const logMessage of log.logs) {
            // Check if this is an event log
            if (logMessage.includes("Program data:")) {
              const dataStr = logMessage.split("Program data: ")[1];
              if (!dataStr) continue;
              
              // Decode base64 data
              const data = Uint8Array.from(atob(dataStr), c => c.charCodeAt(0));
              
              // Check discriminator
              const discriminator = data.slice(0, 8);
              
              if (this.arraysEqual(discriminator, EVENT_DISCRIMINATORS.HTLCCreated)) {
                const event = this.parseHTLCCreatedEvent(data, log);
                if (event) callback(event);
              } else if (this.arraysEqual(discriminator, EVENT_DISCRIMINATORS.HTLCWithdrawn)) {
                const event = this.parseHTLCWithdrawnEvent(data, log);
                if (event) callback(event);
              } else if (this.arraysEqual(discriminator, EVENT_DISCRIMINATORS.HTLCCancelled)) {
                const event = this.parseHTLCCancelledEvent(data, log);
                if (event) callback(event);
              }
            }
          }
        } catch (error) {
          this.logger.error("Error parsing event", error);
        }
      }
    );
    
    return unsubscribe;
  }

  async getHTLCAddress(htlcId: Uint8Array): Promise<string> {
    const [htlcPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("htlc"), htlcId],
      this.programId
    );
    return htlcPda.toBase58();
  }

  /**
   * Parse HTLCCreated event
   */
  private parseHTLCCreatedEvent(
    data: Buffer,
    log: LogEvent
  ): HTLCCreatedEvent | null {
    try {
      const decoded = this.coder.events.decode(data);
      if (!decoded || decoded.name !== "HTLCCreated") return null;
      
      const blockTime = Math.floor(Date.now() / 1000); // Approximate
      
      return {
        type: HTLCEventType.CREATED,
        signature: log.signature,
        slot: 0, // Would need to get from transaction
        blockTime,
        data: {
          htlcAccount: decoded.data.htlcAccount.toBase58(),
          htlcId: new Uint8Array(decoded.data.htlcId),
          resolver: decoded.data.resolver.toBase58(),
          dstAddress: new Uint8Array(decoded.data.dstAddress),
          amount: BigInt(decoded.data.amount.toString()),
          hashlock: new Uint8Array(decoded.data.hashlock),
          finalityDeadline: decoded.data.finalityDeadline.toNumber(),
        },
      };
    } catch (error) {
      this.logger.error("Failed to parse HTLCCreated event", error);
      return null;
    }
  }

  /**
   * Parse HTLCWithdrawn event
   */
  private parseHTLCWithdrawnEvent(
    data: Buffer,
    log: LogEvent
  ): HTLCWithdrawnEvent | null {
    try {
      const decoded = this.coder.events.decode(data);
      if (!decoded || decoded.name !== "HTLCWithdrawn") return null;
      
      const blockTime = Math.floor(Date.now() / 1000); // Approximate
      
      return {
        type: HTLCEventType.WITHDRAWN,
        signature: log.signature,
        slot: 0, // Would need to get from transaction
        blockTime,
        data: {
          htlcAccount: decoded.data.htlcAccount.toBase58(),
          preimage: new Uint8Array(decoded.data.preimage),
          executor: decoded.data.executor.toBase58(),
          destination: new Uint8Array(decoded.data.destination),
        },
      };
    } catch (error) {
      this.logger.error("Failed to parse HTLCWithdrawn event", error);
      return null;
    }
  }

  /**
   * Parse HTLCCancelled event
   */
  private parseHTLCCancelledEvent(
    data: Buffer,
    log: LogEvent
  ): HTLCCancelledEvent | null {
    try {
      const decoded = this.coder.events.decode(data);
      if (!decoded || decoded.name !== "HTLCCancelled") return null;
      
      const blockTime = Math.floor(Date.now() / 1000); // Approximate
      
      return {
        type: HTLCEventType.CANCELLED,
        signature: log.signature,
        slot: 0, // Would need to get from transaction
        blockTime,
        data: {
          htlcAccount: decoded.data.htlcAccount.toBase58(),
          executor: decoded.data.executor.toBase58(),
        },
      };
    } catch (error) {
      this.logger.error("Failed to parse HTLCCancelled event", error);
      return null;
    }
  }

  /**
   * Helper to compare arrays
   */
  private arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}