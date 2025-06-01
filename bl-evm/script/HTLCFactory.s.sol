// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {HTLCFactory} from "../src/HTLCFactory.sol";

/// @title HTLCFactoryScript - Deployment script for HTLCFactory contract
/// @author Bridge-less Protocol
/// @notice Deploys the HTLCFactory contract
/// @dev Run with: forge script script/HTLCFactory.s.sol --rpc-url <RPC_URL> --broadcast
contract HTLCFactoryScript is Script {
    function run() external returns (HTLCFactory) {
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
        
        console.log("Deploying HTLCFactory with deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy HTLCFactory contract
        HTLCFactory factory = new HTLCFactory();
        
        console.log("HTLCFactory deployed at:", address(factory));
        
        vm.stopBroadcast();
        
        return factory;
    }
}