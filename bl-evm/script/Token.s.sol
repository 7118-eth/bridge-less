// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {Token} from "../src/Token.sol";

/// @title TokenScript - Deployment script for Token contract
/// @author Bridge-less Protocol
/// @notice Deploys the Token contract with initial supply to deployer
/// @dev Run with: forge script script/Token.s.sol --rpc-url <RPC_URL> --broadcast
contract TokenScript is Script {
    function run() external returns (Token) {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying Token with deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Token contract
        Token token = new Token();
        
        console.log("Token deployed at:", address(token));
        console.log("Token name:", token.name());
        console.log("Token symbol:", token.symbol());
        console.log("Token decimals:", token.decimals());
        console.log("Total supply:", token.totalSupply() / 1e6, "tokens");
        console.log("Deployer balance:", token.balanceOf(deployer) / 1e6, "tokens");
        
        vm.stopBroadcast();
        
        return token;
    }
}
