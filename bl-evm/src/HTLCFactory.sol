// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IHTLCFactory} from "./interfaces/IHTLCFactory.sol";
import {HTLC} from "./HTLC.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title HTLCFactory - Factory for deploying HTLC contracts
/// @author Bridge-less Protocol
/// @notice Factory contract for creating and tracking HTLC contracts
/// @dev Implements FusionPlus-inspired pattern where resolver creates escrows
contract HTLCFactory is IHTLCFactory {
    // State variables
    mapping(address => address[]) public resolverHTLCs;  // Track HTLCs by resolver
    mapping(bytes32 => address) public htlcRegistry;    // Map ID to HTLC contract
    address[] public allHTLCs;                          // All deployed HTLCs
    
    /// @inheritdoc IHTLCFactory
    function createHTLC(
        address srcAddress,
        bytes32 dstAddress,
        address srcToken,
        bytes32 dstToken,
        uint256 amount,
        bytes32 hashlock
    ) external returns (address htlcContract, bytes32 htlcId) {
        // Validate inputs
        if (amount == 0) revert ZeroAmount();
        if (srcToken == address(0)) revert InvalidToken();
        if (srcAddress == address(0)) revert InvalidSrcAddress();
        if (dstAddress == bytes32(0)) revert InvalidDstAddress();
        if (dstToken == bytes32(0)) revert InvalidDstAddress(); // Reuse error for dst token
        if (hashlock == bytes32(0)) revert InvalidHashlock();
        
        // Generate unique HTLC ID
        htlcId = keccak256(abi.encodePacked(
            msg.sender,     // resolver
            srcAddress,
            dstAddress,
            srcToken,
            dstToken,
            amount,
            hashlock,
            block.timestamp
        ));
        
        // Deploy new HTLC contract
        htlcContract = address(new HTLC(
            msg.sender,     // resolver
            srcAddress,
            dstAddress,
            srcToken,
            dstToken,
            amount,
            hashlock
        ));
        
        // Transfer tokens from resolver to HTLC
        bool success = IERC20(srcToken).transferFrom(msg.sender, htlcContract, amount);
        require(success, "Token transfer failed");
        
        // Update registries
        resolverHTLCs[msg.sender].push(htlcContract);
        htlcRegistry[htlcId] = htlcContract;
        allHTLCs.push(htlcContract);
        
        // Emit event
        emit HTLCDeployed(
            htlcContract,
            htlcId,
            msg.sender,     // resolver
            srcAddress,
            dstAddress,
            srcToken,
            dstToken,
            amount,
            hashlock,
            block.timestamp + 30    // finalityDeadline
        );
    }
    
    /// @inheritdoc IHTLCFactory
    function getResolverHTLCs(address resolver) external view returns (address[] memory) {
        return resolverHTLCs[resolver];
    }
    
    /// @inheritdoc IHTLCFactory
    function getHTLCById(bytes32 htlcId) external view returns (address) {
        return htlcRegistry[htlcId];
    }
    
    /// @inheritdoc IHTLCFactory
    function getAllHTLCs() external view returns (address[] memory) {
        return allHTLCs;
    }
    
    /// @inheritdoc IHTLCFactory
    function getHTLCCount() external view returns (uint256) {
        return allHTLCs.length;
    }
}