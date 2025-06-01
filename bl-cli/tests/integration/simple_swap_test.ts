/**
 * Simplified end-to-end test focusing on core swap functionality
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { ConfigManager } from "../../src/config/index.ts";
import { Logger } from "../../src/utils/index.ts";

Deno.test("integration: simple swap test using CLI commands", async () => {
  const logger = new Logger("simple-e2e-test");
  
  // Load configuration to verify environment
  const configManager = new ConfigManager();
  const config = await configManager.loadFromEnv();
  
  logger.info("Starting simple swap test");
  
  // Step 1: Initialize coordinator
  logger.info("Initializing coordinator...");
  const initResult = await new Deno.Command("deno", {
    args: ["task", "init"],
    env: { ...Deno.env.toObject() },
    stdout: "piped",
    stderr: "piped",
  }).output();
  
  const initOutput = new TextDecoder().decode(initResult.stdout);
  const initError = new TextDecoder().decode(initResult.stderr);
  
  if (initResult.code !== 0) {
    logger.error("Init failed", { error: initError });
    throw new Error(`Init failed: ${initError}`);
  }
  
  logger.info("Init output", { output: initOutput });
  
  // Step 2: Execute a small swap
  logger.info("Executing swap...");
  const swapResult = await new Deno.Command("deno", {
    args: ["task", "swap", "--amount", "100000"], // 0.1 token
    env: { ...Deno.env.toObject() },
    stdout: "piped",
    stderr: "piped",
  }).output();
  
  const swapOutput = new TextDecoder().decode(swapResult.stdout);
  const swapError = new TextDecoder().decode(swapResult.stderr);
  
  if (swapResult.code !== 0) {
    logger.error("Swap failed", { error: swapError });
    throw new Error(`Swap failed: ${swapError}`);
  }
  
  logger.info("Swap output", { output: swapOutput });
  
  // Verify swap was initiated
  assertEquals(swapOutput.includes("Swap initiated"), true, "Swap should be initiated");
  
  // Extract swap ID from output
  const swapIdMatch = swapOutput.match(/Swap ID: ([\w-]+)/);
  assertExists(swapIdMatch, "Should find swap ID in output");
  const swapId = swapIdMatch[1];
  logger.info("Got swap ID", { swapId });
  
  // Step 3: Monitor the swap
  logger.info("Monitoring swap status...");
  let attempts = 0;
  let swapCompleted = false;
  
  while (attempts < 30 && !swapCompleted) {
    const statusResult = await new Deno.Command("deno", {
      args: ["task", "status", "--id", swapId],
      env: { ...Deno.env.toObject() },
      stdout: "piped",
      stderr: "piped",
    }).output();
    
    const statusOutput = new TextDecoder().decode(statusResult.stdout);
    logger.info(`Status check ${attempts + 1}`, { output: statusOutput });
    
    if (statusOutput.includes("State: completed")) {
      swapCompleted = true;
      logger.info("Swap completed successfully!");
    } else if (statusOutput.includes("State: failed")) {
      throw new Error("Swap failed");
    }
    
    if (!swapCompleted) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    attempts++;
  }
  
  assertEquals(swapCompleted, true, "Swap should complete within 30 seconds");
});