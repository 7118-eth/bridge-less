// Test Kit codecs
import * as kit from "npm:@solana/kit@2.1.1";

// Look for codec functions
const codecFunctions = Object.keys(kit).filter(k => 
  k.includes('Base58') || 
  k.includes('Base64') || 
  k.includes('encode') ||
  k.includes('decode') ||
  k.includes('Codec') ||
  k.includes('getProgramDerivedAddress')
);

console.log("Codec functions:", codecFunctions.slice(0, 30));

// Check if we have PDA functions
const pdaFunctions = Object.keys(kit).filter(k => 
  k.toLowerCase().includes('pda') || 
  k.includes('ProgramDerivedAddress') ||
  k.includes('programDerived')
);

console.log("\nPDA functions:", pdaFunctions);
