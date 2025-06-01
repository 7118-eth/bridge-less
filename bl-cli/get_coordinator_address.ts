import { Keypair } from 'npm:@solana/web3.js@1.95';
const bs58 = await import('npm:bs58@5');
const privKey = Deno.env.get('svm_coordinator_private_key');
const decoded = bs58.default.decode(privKey!);
const keypair = Keypair.fromSecretKey(decoded);
console.log(keypair.publicKey.toBase58());