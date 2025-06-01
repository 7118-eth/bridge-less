// Test Solana Kit imports
import { 
  createSolanaRpc,
  generateKeyPairSigner,
  address,
  createDefaultSolanaClient,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getBase58Decoder,
  getBase58Encoder,
} from "npm:@solana/kit@2.1.1";

console.log("Solana Kit imports successful\!");
