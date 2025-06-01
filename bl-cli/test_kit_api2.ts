// Test Kit API functions
import * as kit from "npm:@solana/kit@2.1.1";

// Look for key functions
const keyFunctions = Object.keys(kit).filter(k => 
  k.includes('create') || 
  k.includes('address') || 
  k.includes('rpc') ||
  k.includes('transaction') ||
  k.includes('sign') ||
  k.includes('send')
);

console.log("Key functions:", keyFunctions);
