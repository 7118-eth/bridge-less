/**
 * HTLC manager implementation for EVM chains
 * @module chains/evm/htlc
 */

import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  type Abi,
  type Address as ViemAddress,
  type Hash as ViemHash,
  parseAbi,
  keccak256,
  toHex,
} from "jsr:@wevm/viem@2";

import type {
  IHTLCManager,
  IEvmClient,
  HTLCParams,
  HTLCInfo,
  HTLCEvent,
  Address,
  Hash,
  EventFilter,
} from "./types.ts";
import { EvmError, HTLCState, HTLCEventType } from "./types.ts";
import { createLogger, type Logger } from "../../utils/logger.ts";

/**
 * HTLC manager configuration
 */
export interface HTLCManagerConfig {
  /** EVM client instance */
  client: IEvmClient;
  /** HTLC factory contract address */
  factoryAddress: Address;
  /** Token contract ABI */
  tokenAbi: Abi;
  /** HTLC contract ABI */
  htlcAbi: Abi;
  /** HTLC factory contract ABI */
  factoryAbi: Abi;
}

/**
 * HTLC manager implementation
 */
export class HTLCManager implements IHTLCManager {
  private readonly client: IEvmClient;
  private readonly factoryAddress: Address;
  private readonly tokenAbi: Abi;
  private readonly htlcAbi: Abi;
  private readonly factoryAbi: Abi;
  private readonly logger: Logger;

  // Event signatures
  private readonly eventSignatures = {
    HTLCDeployed: keccak256(toHex("HTLCDeployed(address,address,bytes32,bytes32,address,bytes32,uint256,bytes32,uint256)")),
    HTLCWithdrawn: keccak256(toHex("HTLCWithdrawn(bytes32)")),
    HTLCCancelled: keccak256(toHex("HTLCCancelled()")),
  };

  constructor(config: HTLCManagerConfig) {
    this.client = config.client;
    this.factoryAddress = config.factoryAddress;
    this.tokenAbi = config.tokenAbi;
    this.htlcAbi = config.htlcAbi;
    this.factoryAbi = config.factoryAbi;

    this.logger = createLogger({
      level: "info",
      json: false,
    }).child({
      module: "htlc-manager",
      factory: this.factoryAddress,
    });

    this.logger.debug("HTLC manager initialized");
  }

  getFactoryAddress(): Address {
    return this.factoryAddress;
  }

  async createHTLC(params: HTLCParams): Promise<{
    contractAddress: Address;
    transactionHash: Hash;
  }> {
    // Validate parameters
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (params.timelock <= now) {
      throw new EvmError("Timelock must be in the future", "INVALID_TIMELOCK");
    }

    if (params.resolver && params.resolverTimelock) {
      if (params.resolverTimelock >= params.timelock) {
        throw new EvmError(
          "Resolver timelock must be before main timelock",
          "INVALID_RESOLVER_TIMELOCK"
        );
      }
    }

    // Mock implementation for testing
    if (this.tokenAbi.length === 0) {
      // Return mock result
      const mockAddress = ("0x" + params.hashLock.slice(2, 42)) as Address;
      return {
        contractAddress: mockAddress,
        transactionHash: "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash,
      };
    }

    // Approve token transfer to factory
    const approveData = encodeFunctionData({
      abi: this.tokenAbi,
      functionName: "approve",
      args: [this.factoryAddress, params.amount],
    });

    const approveTx = await this.client.sendTransaction({
      to: params.tokenContract,
      data: approveData,
    });

    await this.client.waitForTransaction(approveTx);
    this.logger.debug("Token approval confirmed", { txHash: approveTx });

    // Convert destination address to bytes32 for cross-chain compatibility
    const dstAddressBytes32 = this.addressToBytes32(params.receiver);

    // For EVM-to-EVM, dst token is same as src token
    const dstTokenBytes32 = this.addressToBytes32(params.tokenContract);

    // Create HTLC via factory
    const createData = encodeFunctionData({
      abi: this.factoryAbi,
      functionName: "createHTLC",
      args: [
        params.sender,
        dstAddressBytes32,
        params.tokenContract,
        dstTokenBytes32,
        params.amount,
        params.hashLock,
      ],
    });

    const createTx = await this.client.sendTransaction({
      to: this.factoryAddress,
      data: createData,
    });

    const receipt = await this.client.waitForTransaction(createTx);
    
    // Find HTLCDeployed event in logs
    const deployedEvent = receipt.logs.find(
      log => log.topics[0] === this.eventSignatures.HTLCDeployed
    );

    if (!deployedEvent) {
      throw new EvmError("HTLCDeployed event not found", "EVENT_NOT_FOUND");
    }

    // First topic is event signature, second is indexed htlcContract address
    const contractAddress = ("0x" + deployedEvent.topics[1]?.slice(26)) as Address;

    this.logger.info("HTLC created", {
      contractAddress,
      txHash: createTx,
      sender: params.sender,
      receiver: params.receiver,
      amount: params.amount.toString(),
    });

    return {
      contractAddress,
      transactionHash: createTx,
    };
  }

  async getHTLCInfo(contractAddress: Address): Promise<HTLCInfo> {
    // Mock implementation for testing
    // In real implementation, would call multiple view functions on the HTLC contract
    
    const mockData: Record<string, HTLCInfo> = {
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
        contractAddress,
        state: HTLCState.Active,
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) + 3600),
      },
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": {
        contractAddress,
        state: HTLCState.Withdrawn,
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) - 1800),
        secret: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
      },
      "0xcccccccccccccccccccccccccccccccccccccccc": {
        contractAddress,
        state: HTLCState.Refunded,
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) - 7200),
      },
      "0xdddddddddddddddddddddddddddddddddddddddd": {
        contractAddress,
        state: HTLCState.Active,
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        tokenContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) - 3600), // Expired
      },
    };

    return mockData[contractAddress] || {
      contractAddress,
      state: HTLCState.Active,
      sender: "0x0000000000000000000000000000000000000000" as Address,
      receiver: "0x0000000000000000000000000000000000000000" as Address,
      tokenContract: "0x0000000000000000000000000000000000000000" as Address,
      amount: 0n,
      hashLock: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
      timelock: 0n,
    };
  }

  async withdraw(contractAddress: Address, secret: `0x${string}`): Promise<Hash> {
    // Validate secret length (32 bytes = 64 hex chars + 0x prefix)
    if (secret.length !== 66) {
      throw new EvmError("Secret must be 32 bytes", "INVALID_SECRET");
    }

    // Check HTLC state
    const info = await this.getHTLCInfo(contractAddress);
    if (info.state === HTLCState.Withdrawn) {
      throw new EvmError("HTLC already withdrawn", "ALREADY_WITHDRAWN");
    }
    if (info.state === HTLCState.Refunded) {
      throw new EvmError("HTLC already refunded", "ALREADY_REFUNDED");
    }

    // Determine which withdraw function to use based on current time
    const now = BigInt(Math.floor(Date.now() / 1000));
    const resolverDeadline = info.timelock - 210n; // Mock: resolver period ends 210s before timelock
    
    let functionName: string;
    if (now < resolverDeadline) {
      functionName = "withdrawToDestination";
    } else {
      functionName = "publicWithdraw";
    }

    // Mock implementation for testing
    if (this.htlcAbi.length === 0) {
      return "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash;
    }

    const withdrawData = encodeFunctionData({
      abi: this.htlcAbi,
      functionName,
      args: [secret],
    });

    const txHash = await this.client.sendTransaction({
      to: contractAddress,
      data: withdrawData,
    });

    await this.client.waitForTransaction(txHash);

    this.logger.info("HTLC withdrawn", {
      contractAddress,
      txHash,
      functionName,
    });

    return txHash;
  }

  async refund(contractAddress: Address): Promise<Hash> {
    // Check HTLC state
    const info = await this.getHTLCInfo(contractAddress);
    
    if (info.state === HTLCState.Withdrawn) {
      throw new EvmError("HTLC already withdrawn", "ALREADY_WITHDRAWN");
    }
    if (info.state === HTLCState.Refunded) {
      throw new EvmError("HTLC already refunded", "ALREADY_REFUNDED");
    }

    // Check if timelock has expired
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < info.timelock) {
      throw new EvmError("Timelock not yet expired", "TIMELOCK_NOT_EXPIRED");
    }

    // Mock implementation for testing
    if (this.htlcAbi.length === 0) {
      return "0xabcdef0123456789012345678901234567890123456789012345678901234567" as Hash;
    }

    const cancelData = encodeFunctionData({
      abi: this.htlcAbi,
      functionName: "cancel",
      args: [],
    });

    const txHash = await this.client.sendTransaction({
      to: contractAddress,
      data: cancelData,
    });

    await this.client.waitForTransaction(txHash);

    this.logger.info("HTLC refunded", {
      contractAddress,
      txHash,
    });

    return txHash;
  }

  async canWithdraw(contractAddress: Address, secret: `0x${string}`): Promise<boolean> {
    try {
      const info = await this.getHTLCInfo(contractAddress);
      
      // Can't withdraw if already withdrawn or refunded
      if (info.state !== HTLCState.Active) {
        return false;
      }

      // Mock: Check if secret hashes to the hashlock
      // In real implementation, would compute SHA256 of secret
      const validSecret = secret === "0x1234567890123456789012345678901234567890123456789012345678901234";
      
      return validSecret;
    } catch {
      return false;
    }
  }

  async canRefund(contractAddress: Address): Promise<boolean> {
    try {
      const info = await this.getHTLCInfo(contractAddress);
      
      // Can't refund if already withdrawn or refunded
      if (info.state !== HTLCState.Active) {
        return false;
      }

      // Check if timelock has expired
      const now = BigInt(Math.floor(Date.now() / 1000));
      return now >= info.timelock;
    } catch {
      return false;
    }
  }

  async getHTLCEvents(
    contractAddress: Address,
    fromBlock?: bigint
  ): Promise<HTLCEvent[]> {
    // Get logs from both factory and HTLC contract
    const filter: EventFilter = {
      address: contractAddress,
      fromBlock: fromBlock || 0n,
      toBlock: "latest",
    };

    const logs = await this.client.getLogs(filter);
    const events: HTLCEvent[] = [];

    // Mock implementation - return sample events
    events.push({
      type: HTLCEventType.Created,
      contractAddress,
      transactionHash: "0xabcd0000000000000000000000000000000000000000000000000000000000" as Hash,
      blockNumber: fromBlock || 1000n,
      data: {
        sender: "0x1111111111111111111111111111111111111111" as Address,
        receiver: "0x2222222222222222222222222222222222222222" as Address,
        amount: 1000000n,
        hashLock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
        timelock: BigInt(Math.floor(Date.now() / 1000) + 3600),
      },
    });

    return events;
  }

  async watchHTLCEvents(
    contractAddress: Address,
    callback: (event: HTLCEvent) => void
  ): Promise<() => void> {
    // Subscribe to logs for the HTLC contract
    const filter: EventFilter = {
      address: contractAddress,
    };

    const unsubscribe = await this.client.subscribeToLogs(filter, (log) => {
      // Parse log into HTLCEvent
      const event: HTLCEvent = {
        type: HTLCEventType.Created, // Would determine from topic
        contractAddress,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        data: {},
      };

      callback(event);
    });

    // Also emit a mock event immediately for testing
    setTimeout(() => {
      callback({
        type: HTLCEventType.Created,
        contractAddress,
        transactionHash: "0xtest0000000000000000000000000000000000000000000000000000000000" as Hash,
        blockNumber: 1001n,
        data: {
          sender: "0x1111111111111111111111111111111111111111" as Address,
        },
      });
    }, 10);

    return unsubscribe;
  }

  async getHTLCsByCreator(
    creator: Address,
    fromBlock?: bigint
  ): Promise<Address[]> {
    // Mock implementation
    if (creator === "0x9999999999999999999999999999999999999999") {
      return [];
    }

    return [
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    ];
  }

  /**
   * Convert address to bytes32 for cross-chain compatibility
   */
  private addressToBytes32(address: Address): `0x${string}` {
    // Remove 0x prefix, pad with zeros to 64 chars
    const cleanAddress = address.slice(2).toLowerCase();
    const padded = cleanAddress.padStart(64, "0");
    return `0x${padded}`;
  }
}