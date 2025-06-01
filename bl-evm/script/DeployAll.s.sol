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
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
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
        
        // Save deployment addresses to file (useful for verification)
        _saveDeploymentInfo(address(token), address(factory));
    }
    
    function _saveDeploymentInfo(address token, address factory) internal {
        string memory deploymentInfo = string(abi.encodePacked(
            "{\n",
            "  \"chainId\": ", vm.toString(block.chainid), ",\n",
            "  \"token\": \"", vm.toString(token), "\",\n",
            "  \"factory\": \"", vm.toString(factory), "\",\n",
            "  \"timestamp\": ", vm.toString(block.timestamp), ",\n",
            "  \"blockNumber\": ", vm.toString(block.number), "\n",
            "}\n"
        ));
        
        string memory filename = string(abi.encodePacked(
            "deployments/",
            vm.toString(block.chainid),
            "-latest.json"
        ));
        
        vm.writeFile(filename, deploymentInfo);
        console.log("\nDeployment info saved to:", filename);
    }
}