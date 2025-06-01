// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {Token} from "../src/Token.sol";
import {HTLCFactory} from "../src/HTLCFactory.sol";

/// @title DeployAllScript - Complete deployment script for HTLC Bridge
/// @author Bridge-less Protocol
/// @notice Deploys Token and HTLCFactory contracts
/// @dev Run with: forge script script/DeployAll.s.sol --rpc-url <RPC_URL> --broadcast
contract DeployAllScript is Script {
    function run() external returns (Token token, HTLCFactory factory) {
        // Get deployer private key from environment or use Anvil default
        uint256 deployerPrivateKey;
        address deployer;
        
        // Check if we're on Anvil (chainId 31337)
        if (block.chainid == 31337) {
            try vm.envUint("PRIVATE_KEY") returns (uint256 pk) {
                deployerPrivateKey = pk;
                deployer = vm.addr(deployerPrivateKey);
            } catch {
                // Use Anvil's default private key (account 0)
                deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
                deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
                console.log("Using Anvil default account");
            }
        } else {
            // For non-Anvil chains, PRIVATE_KEY is required
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            deployer = vm.addr(deployerPrivateKey);
        }
        
        console.log("========================================");
        console.log("Deploying HTLC Bridge contracts");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("========================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Token contract
        token = new Token();
        console.log("Token deployed at:", address(token));
        console.log("  Name:", token.name());
        console.log("  Symbol:", token.symbol());
        console.log("  Decimals:", token.decimals());
        console.log("  Total Supply:", token.totalSupply() / 1e6, "tokens");
        
        // Deploy HTLCFactory contract
        factory = new HTLCFactory();
        console.log("\nHTLCFactory deployed at:", address(factory));
        
        vm.stopBroadcast();
        
        console.log("========================================");
        console.log("Deployment complete!");
        console.log("========================================");
        
        // Log deployment addresses (for reference)
        _logDeploymentInfo(address(token), address(factory));
    }
    
    function _logDeploymentInfo(address token, address factory) internal view {
        string memory deploymentInfo = string(abi.encodePacked(
            "{\n",
            "  \"chainId\": ", vm.toString(block.chainid), ",\n",
            "  \"token\": \"", vm.toString(token), "\",\n",
            "  \"factory\": \"", vm.toString(factory), "\",\n",
            "  \"timestamp\": ", vm.toString(block.timestamp), ",\n",
            "  \"blockNumber\": ", vm.toString(block.number), "\n",
            "}\n"
        ));
        
        // For local deployments, just log the info
        console.log("\n========== Deployment Info ==========");
        console.log(deploymentInfo);
        console.log("====================================");
        
        // Note: To save deployment info, create a deployments/ directory
        // and use: vm.writeFile("./deployments/<chainId>-latest.json", deploymentInfo);
    }
}