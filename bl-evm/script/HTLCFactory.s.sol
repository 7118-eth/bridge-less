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
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying HTLCFactory with deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy HTLCFactory contract
        HTLCFactory factory = new HTLCFactory();
        
        console.log("HTLCFactory deployed at:", address(factory));
        
        vm.stopBroadcast();
        
        return factory;
    }
}