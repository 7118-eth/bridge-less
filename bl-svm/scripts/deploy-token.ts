import { Keypair, PublicKey, Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
  createMint, 
  mintTo, 
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function main() {
  // Configure connection
  const connection = new Connection("http://localhost:8899", "confirmed");
  
  // Load coordinator keypair (will be the mint authority)
  const coordinatorPath = path.join(os.homedir(), ".config", "solana", "coordinator.json");
  let coordinator: Keypair;
  
  if (fs.existsSync(coordinatorPath)) {
    const coordinatorData = JSON.parse(fs.readFileSync(coordinatorPath, 'utf-8'));
    coordinator = Keypair.fromSecretKey(new Uint8Array(coordinatorData));
    console.log("✅ Loaded coordinator keypair:", coordinator.publicKey.toString());
  } else {
    // Create coordinator keypair if it doesn't exist
    coordinator = Keypair.generate();
    fs.writeFileSync(coordinatorPath, JSON.stringify(Array.from(coordinator.secretKey)));
    console.log("✅ Created new coordinator keypair:", coordinator.publicKey.toString());
  }
  
  // Load user keypair
  const userPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const userData = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
  const user = Keypair.fromSecretKey(new Uint8Array(userData));
  console.log("✅ Loaded user keypair:", user.publicKey.toString());
  
  // Airdrop SOL to coordinator if needed
  const coordinatorBalance = await connection.getBalance(coordinator.publicKey);
  if (coordinatorBalance < 2_000_000_000) { // 2 SOL
    console.log("⏳ Airdropping SOL to coordinator...");
    const airdropSig = await connection.requestAirdrop(coordinator.publicKey, 2_000_000_000);
    await connection.confirmTransaction(airdropSig);
    console.log("✅ Airdropped 2 SOL to coordinator");
  }
  
  // Create SPL Token mint with 6 decimals
  console.log("\n⏳ Creating SPL Token mint with 6 decimals...");
  const mint = await createMint(
    connection,
    coordinator,
    coordinator.publicKey, // mint authority
    null, // freeze authority (disabled)
    6, // decimals
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  
  console.log("✅ Created SPL Token mint:", mint.toString());
  
  // Create token account for coordinator
  console.log("\n⏳ Creating token account for coordinator...");
  const coordinatorTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    coordinator,
    mint,
    coordinator.publicKey
  );
  console.log("✅ Coordinator token account:", coordinatorTokenAccount.address.toString());
  
  // Mint 1,000,000 tokens (1_000_000e6 units) to coordinator
  console.log("\n⏳ Minting 1,000,000 tokens to coordinator...");
  const mintAmount = 1_000_000 * Math.pow(10, 6); // 1M tokens with 6 decimals
  await mintTo(
    connection,
    coordinator,
    mint,
    coordinatorTokenAccount.address,
    coordinator,
    mintAmount
  );
  console.log("✅ Minted 1,000,000 tokens to coordinator");
  
  // Create token account for user and mint some test tokens
  console.log("\n⏳ Creating token account for user...");
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    coordinator, // payer
    mint,
    user.publicKey
  );
  console.log("✅ User token account:", userTokenAccount.address.toString());
  
  // Transfer 10,000 tokens to user for testing
  console.log("\n⏳ Transferring 10,000 tokens to user for testing...");
  const transferAmount = 10_000 * Math.pow(10, 6); // 10k tokens with 6 decimals
  const { blockhash } = await connection.getLatestBlockhash();
  const transferIx = createTransferInstruction(
    coordinatorTokenAccount.address,
    userTokenAccount.address,
    coordinator.publicKey,
    transferAmount
  );
  
  const transferTx = new Transaction().add(transferIx);
  transferTx.recentBlockhash = blockhash;
  transferTx.feePayer = coordinator.publicKey;
  
  const transferSig = await sendAndConfirmTransaction(connection, transferTx, [coordinator]);
  console.log("✅ Transferred 10,000 tokens to user");
  
  // Save deployment info
  const deploymentInfo = {
    tokenMint: mint.toString(),
    coordinatorAddress: coordinator.publicKey.toString(),
    coordinatorTokenAccount: coordinatorTokenAccount.address.toString(),
    userAddress: user.publicKey.toString(),
    userTokenAccount: userTokenAccount.address.toString(),
    deployedAt: new Date().toISOString(),
    network: "localnet"
  };
  
  const deploymentPath = path.join(__dirname, "..", "deployments", "token.json");
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\n📄 Deployment Summary:");
  console.log("====================");
  console.log(`Token Mint: ${mint.toString()}`);
  console.log(`Coordinator: ${coordinator.publicKey.toString()}`);
  console.log(`User: ${user.publicKey.toString()}`);
  console.log(`Total Supply: 1,000,000 tokens`);
  console.log(`Coordinator Balance: 990,000 tokens`);
  console.log(`User Balance: 10,000 tokens`);
  console.log("\n✅ Token deployment complete!");
  
  // Display environment variables for bl-cli
  console.log("\n📝 Environment variables for bl-cli/.env:");
  console.log("========================================");
  console.log(`svm_token_contract_address=${mint.toString()}`);
  console.log(`svm_user_address=${user.publicKey.toString()}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});