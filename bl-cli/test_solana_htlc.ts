import { Keypair, Connection, PublicKey } from 'npm:@solana/web3.js@1.95';
import { SolanaClient } from './src/chains/solana/client.ts';
import { SolanaHTLCManager } from './src/chains/solana/htlc.ts';
import { createLogger } from './src/utils/logger.ts';

const bs58 = await import('npm:bs58@5');

// Load config from env
const rpcUrl = Deno.env.get('svm_rpc') || 'http://127.0.0.1:8899';
const programId = Deno.env.get('svm_htlc_contract_address') || '';
const tokenMint = Deno.env.get('svm_token_contract_address') || '';
const privKey = Deno.env.get('svm_coordinator_private_key') || '';

console.log('Config:', { rpcUrl, programId, tokenMint });

// Create keypair
const decoded = bs58.default.decode(privKey);
const keypair = Keypair.fromSecretKey(decoded);
console.log('Coordinator address:', keypair.publicKey.toBase58());

// Create logger
const logger = createLogger({ level: 'debug' });

// Create client and manager
const client = new SolanaClient({
  rpcUrl,
  commitment: 'confirmed',
  logger: logger.child({ module: 'solana-client' }),
});

const htlcManager = new SolanaHTLCManager({
  client,
  programId,
  tokenMint,
  keypair,
  logger: logger.child({ module: 'solana-htlc' }),
});

// Test HTLC creation
try {
  await client.connect();
  console.log('Connected to Solana');
  
  const htlcId = new Uint8Array(32);
  crypto.getRandomValues(htlcId);
  
  const destinationAddress = new Uint8Array(20);
  destinationAddress.fill(1);
  
  const destinationToken = new Uint8Array(20);
  destinationToken.fill(2);
  
  const hashlock = new Uint8Array(32);
  crypto.getRandomValues(hashlock);
  
  const now = Math.floor(Date.now() / 1000);
  
  console.log('Creating HTLC...');
  const result = await htlcManager.createHTLC({
    htlcId,
    destinationAddress,
    destinationToken,
    amount: 1000000n,
    safetyDeposit: 10000n,
    hashlock,
    timelocks: {
      finality: now + 30,
      resolver: now + 60,
      public: now + 300,
      cancellation: now + 600,
    },
  });
  
  console.log('HTLC created successfully!', result);
} catch (error) {
  console.error('Failed to create HTLC:', error);
  if (error.details) {
    console.error('Error details:', error.details);
  }
}