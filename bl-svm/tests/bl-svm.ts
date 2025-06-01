import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { BlSvm } from "../target/types/bl_svm";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { 
  createMint, 
  mintTo, 
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { assert } from "chai";
import * as crypto from "crypto";

describe("bl-svm", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BlSvm as Program<BlSvm>;
  
  // Test accounts
  const resolver = provider.wallet;
  const executor = Keypair.generate();
  const otherUser = Keypair.generate();
  
  // Token setup
  let tokenMint: PublicKey;
  let resolverTokenAccount: PublicKey;
  let executorTokenAccount: PublicKey;
  
  // HTLC parameters
  const htlcId = crypto.randomBytes(32);
  const preimage = crypto.randomBytes(32);
  const hashlock = crypto.createHash('sha256').update(preimage).digest();
  const invalidPreimage = crypto.randomBytes(32);
  
  // EVM addresses (20 bytes)
  const dstAddress = crypto.randomBytes(20);
  const dstToken = crypto.randomBytes(20);
  
  // Token amounts (6 decimals)
  const DECIMALS = 6;
  const ONE_TOKEN = new BN(1_000_000); // 1e6
  const INITIAL_BALANCE = new BN(10_000_000_000); // 10,000 tokens
  const SAFETY_DEPOSIT = new BN(100_000); // 0.0001 SOL
  
  // Timelock parameters (in seconds)
  const now = Math.floor(Date.now() / 1000);
  const FINALITY_DEADLINE = now + 30;
  const RESOLVER_DEADLINE = now + 60;
  const PUBLIC_DEADLINE = now + 300;
  const CANCELLATION_DEADLINE = now + 600;

  before(async () => {
    // Fund test accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(executor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(otherUser.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      resolver.payer,
      resolver.publicKey,
      null,
      DECIMALS
    );

    // Create resolver token account and mint initial balance
    const resolverATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      resolver.payer,
      tokenMint,
      resolver.publicKey
    );
    resolverTokenAccount = resolverATA.address;
    
    await mintTo(
      provider.connection,
      resolver.payer,
      tokenMint,
      resolverTokenAccount,
      resolver.publicKey,
      INITIAL_BALANCE.toNumber()
    );

    // Create executor token account
    const executorATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      executor,
      tokenMint,
      executor.publicKey
    );
    executorTokenAccount = executorATA.address;
  });

  describe("create_htlc", () => {
    it("should create HTLC with correct parameters", async () => {
      const [htlcPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), htlcId],
        program.programId
      );

      const params = {
        htlcId: Array.from(htlcId),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: ONE_TOKEN,
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(FINALITY_DEADLINE),
        resolverDeadline: new BN(RESOLVER_DEADLINE),
        publicDeadline: new BN(PUBLIC_DEADLINE),
        cancellationDeadline: new BN(CANCELLATION_DEADLINE),
      };

      await program.methods
        .createHtlc(params)
        .accounts({
          resolver: resolver.publicKey,
          htlc: htlcPDA,
          tokenMint,
          resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify HTLC account was created with correct data
      const htlcAccount = await program.account.htlc.fetch(htlcPDA);
      
      assert.ok(htlcAccount.resolver.equals(resolver.publicKey));
      assert.ok(htlcAccount.srcAddress.equals(resolver.publicKey));
      assert.deepEqual(htlcAccount.dstAddress, Array.from(dstAddress));
      assert.ok(htlcAccount.srcToken.equals(tokenMint));
      assert.deepEqual(htlcAccount.dstToken, Array.from(dstToken));
      assert.ok(htlcAccount.amount.eq(ONE_TOKEN));
      assert.ok(htlcAccount.safetyDeposit.eq(SAFETY_DEPOSIT));
      assert.deepEqual(htlcAccount.hashlock, Array.from(hashlock));
      assert.deepEqual(htlcAccount.htlcId, Array.from(htlcId));
      assert.ok(htlcAccount.finalityDeadline.eq(new BN(FINALITY_DEADLINE)));
      assert.ok(htlcAccount.resolverDeadline.eq(new BN(RESOLVER_DEADLINE)));
      assert.ok(htlcAccount.publicDeadline.eq(new BN(PUBLIC_DEADLINE)));
      assert.ok(htlcAccount.cancellationDeadline.eq(new BN(CANCELLATION_DEADLINE)));
      assert.equal(htlcAccount.withdrawn, false);
      assert.equal(htlcAccount.cancelled, false);
    });

    it("should fail with zero amount", async () => {
      const badHtlcId = crypto.randomBytes(32);
      const [htlcPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), badHtlcId],
        program.programId
      );

      const params = {
        htlcId: Array.from(badHtlcId),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: new BN(0), // Zero amount
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(FINALITY_DEADLINE),
        resolverDeadline: new BN(RESOLVER_DEADLINE),
        publicDeadline: new BN(PUBLIC_DEADLINE),
        cancellationDeadline: new BN(CANCELLATION_DEADLINE),
      };

      try {
        await program.methods
          .createHtlc(params)
          .accounts({
            resolver: resolver.publicKey,
            htlc: htlcPDA,
            tokenMint,
            resolverTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert.include(error.toString(), "Amount must be greater than zero");
      }
    });

    it("should fail with invalid timelock ordering", async () => {
      const badHtlcId = crypto.randomBytes(32);
      const [htlcPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), badHtlcId],
        program.programId
      );

      const params = {
        htlcId: Array.from(badHtlcId),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: ONE_TOKEN,
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(CANCELLATION_DEADLINE), // Wrong order
        resolverDeadline: new BN(PUBLIC_DEADLINE),
        publicDeadline: new BN(RESOLVER_DEADLINE),
        cancellationDeadline: new BN(FINALITY_DEADLINE),
      };

      try {
        await program.methods
          .createHtlc(params)
          .accounts({
            resolver: resolver.publicKey,
            htlc: htlcPDA,
            tokenMint,
            resolverTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert.include(error.toString(), "Invalid timelock ordering");
      }
    });
  });

  describe("withdraw_to_destination", () => {
    let withdrawHtlcId: Buffer;
    let withdrawHtlcPDA: PublicKey;

    beforeEach(async () => {
      // Create a new HTLC for each withdrawal test
      withdrawHtlcId = crypto.randomBytes(32);
      [withdrawHtlcPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), withdrawHtlcId],
        program.programId
      );

      const params = {
        htlcId: Array.from(withdrawHtlcId),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: ONE_TOKEN,
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(Math.floor(Date.now() / 1000) - 10), // Already past finality
        resolverDeadline: new BN(Math.floor(Date.now() / 1000) + 60),
        publicDeadline: new BN(Math.floor(Date.now() / 1000) + 300),
        cancellationDeadline: new BN(Math.floor(Date.now() / 1000) + 600),
      };

      await program.methods
        .createHtlc(params)
        .accounts({
          resolver: resolver.publicKey,
          htlc: withdrawHtlcPDA,
          tokenMint,
          resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

    it("should allow resolver to withdraw with correct preimage during resolver period", async () => {
      await program.methods
        .withdrawToDestination(Array.from(preimage))
        .accounts({
          executor: resolver.publicKey,
          htlc: withdrawHtlcPDA,
          tokenMint,
          destinationTokenAccount: resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify HTLC is marked as withdrawn
      const htlcAccount = await program.account.htlc.fetch(withdrawHtlcPDA);
      assert.equal(htlcAccount.withdrawn, true);
    });

    it("should fail withdrawal with incorrect preimage", async () => {
      try {
        await program.methods
          .withdrawToDestination(Array.from(invalidPreimage))
          .accounts({
            executor: resolver.publicKey,
            htlc: withdrawHtlcPDA,
            tokenMint,
            destinationTokenAccount: resolverTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert.include(error.toString(), "Invalid preimage");
      }
    });

    it("should prevent double withdrawal", async () => {
      // First withdrawal
      await program.methods
        .withdrawToDestination(Array.from(preimage))
        .accounts({
          executor: resolver.publicKey,
          htlc: withdrawHtlcPDA,
          tokenMint,
          destinationTokenAccount: resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Second withdrawal attempt
      try {
        await program.methods
          .withdrawToDestination(Array.from(preimage))
          .accounts({
            executor: resolver.publicKey,
            htlc: withdrawHtlcPDA,
            tokenMint,
            destinationTokenAccount: resolverTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert.include(error.toString(), "HTLC already withdrawn");
      }
    });
  });

  describe("cancel", () => {
    let cancelHtlcId: Buffer;
    let cancelHtlcPDA: PublicKey;

    beforeEach(async () => {
      // Create a new HTLC for each cancel test
      cancelHtlcId = crypto.randomBytes(32);
      [cancelHtlcPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), cancelHtlcId],
        program.programId
      );

      const params = {
        htlcId: Array.from(cancelHtlcId),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: ONE_TOKEN,
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(Math.floor(Date.now() / 1000) - 700),
        resolverDeadline: new BN(Math.floor(Date.now() / 1000) - 600),
        publicDeadline: new BN(Math.floor(Date.now() / 1000) - 300),
        cancellationDeadline: new BN(Math.floor(Date.now() / 1000) - 10), // Already past cancellation
      };

      await program.methods
        .createHtlc(params)
        .accounts({
          resolver: resolver.publicKey,
          htlc: cancelHtlcPDA,
          tokenMint,
          resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

    it("should allow cancellation after timeout", async () => {
      await program.methods
        .cancel()
        .accounts({
          executor: executor.publicKey,
          htlc: cancelHtlcPDA,
          srcAddress: resolver.publicKey,
          tokenMint,
          srcTokenAccount: resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([executor])
        .rpc();

      // Verify HTLC is marked as cancelled
      const htlcAccount = await program.account.htlc.fetch(cancelHtlcPDA);
      assert.equal(htlcAccount.cancelled, true);
    });

    it("should fail cancellation before timeout", async () => {
      // Create HTLC with future cancellation deadline
      const futureHtlcId = crypto.randomBytes(32);
      const [futureHtlcPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), futureHtlcId],
        program.programId
      );

      const params = {
        htlcId: Array.from(futureHtlcId),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: ONE_TOKEN,
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(Math.floor(Date.now() / 1000) + 30),
        resolverDeadline: new BN(Math.floor(Date.now() / 1000) + 60),
        publicDeadline: new BN(Math.floor(Date.now() / 1000) + 300),
        cancellationDeadline: new BN(Math.floor(Date.now() / 1000) + 600), // Future
      };

      await program.methods
        .createHtlc(params)
        .accounts({
          resolver: resolver.publicKey,
          htlc: futureHtlcPDA,
          tokenMint,
          resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      try {
        await program.methods
          .cancel()
          .accounts({
            executor: executor.publicKey,
            htlc: futureHtlcPDA,
            srcAddress: resolver.publicKey,
            tokenMint,
            srcTokenAccount: resolverTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([executor])
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert.include(error.toString(), "Cancellation not allowed yet");
      }
    });

    it("should prevent double cancellation", async () => {
      // First cancellation
      await program.methods
        .cancel()
        .accounts({
          executor: executor.publicKey,
          htlc: cancelHtlcPDA,
          srcAddress: resolver.publicKey,
          tokenMint,
          srcTokenAccount: resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([executor])
        .rpc();

      // Second cancellation attempt
      try {
        await program.methods
          .cancel()
          .accounts({
            executor: executor.publicKey,
            htlc: cancelHtlcPDA,
            srcAddress: resolver.publicKey,
            tokenMint,
            srcTokenAccount: resolverTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([executor])
          .rpc();
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert.include(error.toString(), "HTLC already cancelled");
      }
    });
  });

  describe("Integration scenarios", () => {
    it("should handle multiple concurrent HTLCs", async () => {
      const htlc1Id = crypto.randomBytes(32);
      const htlc2Id = crypto.randomBytes(32);
      
      const [htlc1PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), htlc1Id],
        program.programId
      );
      const [htlc2PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("htlc"), htlc2Id],
        program.programId
      );

      // Create two HTLCs
      const params1 = {
        htlcId: Array.from(htlc1Id),
        dstAddress: Array.from(dstAddress),
        dstToken: Array.from(dstToken),
        amount: ONE_TOKEN,
        safetyDeposit: SAFETY_DEPOSIT,
        hashlock: Array.from(hashlock),
        finalityDeadline: new BN(Math.floor(Date.now() / 1000) - 10),
        resolverDeadline: new BN(Math.floor(Date.now() / 1000) + 60),
        publicDeadline: new BN(Math.floor(Date.now() / 1000) + 300),
        cancellationDeadline: new BN(Math.floor(Date.now() / 1000) + 600),
      };

      const params2 = {
        ...params1,
        htlcId: Array.from(htlc2Id),
      };

      await program.methods
        .createHtlc(params1)
        .accounts({
          resolver: resolver.publicKey,
          htlc: htlc1PDA,
          tokenMint,
          resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      await program.methods
        .createHtlc(params2)
        .accounts({
          resolver: resolver.publicKey,
          htlc: htlc2PDA,
          tokenMint,
          resolverTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify both HTLCs exist
      const htlc1Account = await program.account.htlc.fetch(htlc1PDA);
      const htlc2Account = await program.account.htlc.fetch(htlc2PDA);
      
      assert.deepEqual(htlc1Account.htlcId, Array.from(htlc1Id));
      assert.deepEqual(htlc2Account.htlcId, Array.from(htlc2Id));
    });
  });
});