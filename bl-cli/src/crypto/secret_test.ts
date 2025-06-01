import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import type { ISecretManager, Secret, SecretHash } from "./types.ts";
import { CryptoError } from "./types.ts";

/**
 * Tests for cryptographic secret management
 */

Deno.test("SecretManager", async (t) => {
  let secretManager: ISecretManager;

  // This will be set when we import the actual implementation
  const setup = async () => {
    const { SecretManager } = await import("./secret.ts");
    secretManager = new SecretManager();
  };

  await t.step("generateSecret", async (t) => {
    await setup();

    await t.step("generates a 32-byte secret", async () => {
      const secret = await secretManager.generateSecret();
      assertEquals(secret.length, 32);
      assertEquals(secret instanceof Uint8Array, true);
    });

    await t.step("generates unique secrets", async () => {
      const secret1 = await secretManager.generateSecret();
      const secret2 = await secretManager.generateSecret();
      
      // Extremely unlikely to be equal for random generation
      const areEqual = secret1.every((byte, i) => byte === secret2[i]);
      assertEquals(areEqual, false);
    });

    await t.step("generates deterministic secret with seed (testing only)", async () => {
      const seed = new Uint8Array(32).fill(42);
      const secret1 = await secretManager.generateSecret({ seed });
      const secret2 = await secretManager.generateSecret({ seed });
      
      const areEqual = secret1.every((byte, i) => byte === secret2[i]);
      assertEquals(areEqual, true);
    });
  });

  await t.step("hashSecret", async (t) => {
    await setup();

    await t.step("hashes a valid secret", async () => {
      const secret = new Uint8Array(32).fill(1);
      const result = await secretManager.hashSecret(secret);
      
      assertEquals(result.hash.length, 32);
      assertEquals(result.hash instanceof Uint8Array, true);
      assertEquals(typeof result.hashHex, "string");
      assertEquals(result.hashHex.startsWith("0x"), true);
      assertEquals(result.hashHex.length, 66); // 0x + 64 hex chars
    });

    await t.step("produces consistent hash for same secret", async () => {
      const secret = new Uint8Array(32).fill(2);
      const result1 = await secretManager.hashSecret(secret);
      const result2 = await secretManager.hashSecret(secret);
      
      assertEquals(result1.hashHex, result2.hashHex);
      const areEqual = result1.hash.every((byte, i) => byte === result2.hash[i]);
      assertEquals(areEqual, true);
    });

    await t.step("produces different hashes for different secrets", async () => {
      const secret1 = new Uint8Array(32).fill(3);
      const secret2 = new Uint8Array(32).fill(4);
      const result1 = await secretManager.hashSecret(secret1);
      const result2 = await secretManager.hashSecret(secret2);
      
      assertEquals(result1.hashHex !== result2.hashHex, true);
    });

    await t.step("throws for invalid secret length", async () => {
      const invalidSecret = new Uint8Array(16); // Wrong length
      
      await assertRejects(
        async () => await secretManager.hashSecret(invalidSecret),
        CryptoError,
        "Secret must be exactly 32 bytes"
      );
    });
  });

  await t.step("verifySecret", async (t) => {
    await setup();

    await t.step("verifies matching secret and hash", async () => {
      const secret = new Uint8Array(32).fill(5);
      const { hash } = await secretManager.hashSecret(secret);
      const isValid = await secretManager.verifySecret(secret, hash);
      
      assertEquals(isValid, true);
    });

    await t.step("rejects non-matching secret and hash", async () => {
      const secret1 = new Uint8Array(32).fill(6);
      const secret2 = new Uint8Array(32).fill(7);
      const { hash } = await secretManager.hashSecret(secret1);
      const isValid = await secretManager.verifySecret(secret2, hash);
      
      assertEquals(isValid, false);
    });

    await t.step("handles invalid secret length", async () => {
      const invalidSecret = new Uint8Array(16);
      const validHash = new Uint8Array(32);
      
      await assertRejects(
        async () => await secretManager.verifySecret(invalidSecret, validHash),
        CryptoError,
        "Secret must be exactly 32 bytes"
      );
    });
  });

  await t.step("hexToBytes", async (t) => {
    await setup();

    await t.step("converts hex string to bytes", () => {
      const hex = "0x0102030405060708090a0b0c0d0e0f10";
      const bytes = secretManager.hexToBytes(hex);
      
      assertEquals(bytes.length, 16);
      assertEquals(bytes[0], 0x01);
      assertEquals(bytes[15], 0x10);
    });

    await t.step("handles hex without 0x prefix", () => {
      const hex = "0102030405060708090a0b0c0d0e0f10";
      const bytes = secretManager.hexToBytes(hex);
      
      assertEquals(bytes.length, 16);
      assertEquals(bytes[0], 0x01);
      assertEquals(bytes[15], 0x10);
    });

    await t.step("throws for invalid hex string", () => {
      assertThrows(
        () => secretManager.hexToBytes("0xgg"),
        CryptoError,
        "Invalid hex string"
      );
    });

    await t.step("throws for odd-length hex string", () => {
      assertThrows(
        () => secretManager.hexToBytes("0x123"),
        CryptoError,
        "Hex string must have even length"
      );
    });
  });

  await t.step("bytesToHex", async (t) => {
    await setup();

    await t.step("converts bytes to hex string with 0x prefix", () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const hex = secretManager.bytesToHex(bytes);
      
      assertEquals(hex, "0x01020304");
    });

    await t.step("handles empty array", () => {
      const bytes = new Uint8Array(0);
      const hex = secretManager.bytesToHex(bytes);
      
      assertEquals(hex, "0x");
    });

    await t.step("handles single byte", () => {
      const bytes = new Uint8Array([0x0f]);
      const hex = secretManager.bytesToHex(bytes);
      
      assertEquals(hex, "0x0f");
    });
  });

  await t.step("constantTimeEqual", async (t) => {
    await setup();

    await t.step("returns true for equal arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      
      assertEquals(secretManager.constantTimeEqual(a, b), true);
    });

    await t.step("returns false for different arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      
      assertEquals(secretManager.constantTimeEqual(a, b), false);
    });

    await t.step("returns false for different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      
      assertEquals(secretManager.constantTimeEqual(a, b), false);
    });

    await t.step("handles empty arrays", () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);
      
      assertEquals(secretManager.constantTimeEqual(a, b), true);
    });
  });

  await t.step("integration test: full secret lifecycle", async () => {
    await setup();

    // Generate secret
    const secret = await secretManager.generateSecret();
    
    // Hash it
    const { hash, hashHex } = await secretManager.hashSecret(secret);
    
    // Verify it
    const isValid = await secretManager.verifySecret(secret, hash);
    assertEquals(isValid, true);
    
    // Convert hex representation back and verify
    const hashFromHex = secretManager.hexToBytes(hashHex);
    const areEqual = secretManager.constantTimeEqual(hash, hashFromHex);
    assertEquals(areEqual, true);
    
    // Verify with wrong secret fails
    const wrongSecret = await secretManager.generateSecret();
    const isInvalid = await secretManager.verifySecret(wrongSecret, hash);
    assertEquals(isInvalid, false);
  });
});