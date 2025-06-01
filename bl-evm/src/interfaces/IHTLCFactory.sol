// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IHTLCFactory - Factory for deploying HTLC contracts
/// @author Bridge-less Protocol
/// @notice Factory interface for creating and tracking HTLC contracts
/// @dev Implements FusionPlus-inspired pattern where resolver creates escrows
interface IHTLCFactory {
    /// @notice Emitted when a new HTLC is deployed
    /// @param htlcContract Address of the deployed HTLC contract
    /// @param htlcId Unique identifier for cross-chain coordination
    /// @param resolver Address of the resolver (coordinator)
    /// @param srcAddress Source address providing the tokens
    /// @param dstAddress Destination address (Solana address as bytes32)
    /// @param token ERC20 token address
    /// @param amount Amount of tokens locked
    /// @param hashlock SHA256 hash lock
    /// @param finalityDeadline When operations can begin
    event HTLCDeployed(
        address indexed htlcContract,
        bytes32 indexed htlcId,
        address indexed resolver,
        address srcAddress,
        bytes32 dstAddress,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 finalityDeadline
    );
    
    /// @notice Thrown when trying to create HTLC with zero amount
    error ZeroAmount();
    
    /// @notice Thrown when invalid token address is provided
    error InvalidToken();
    
    /// @notice Thrown when invalid source address is provided
    error InvalidSrcAddress();
    
    /// @notice Thrown when invalid destination address is provided
    error InvalidDstAddress();
    
    /// @notice Thrown when invalid hashlock is provided
    error InvalidHashlock();
    
    /// @notice Create a new HTLC contract
    /// @dev Deploys a new HTLC and transfers tokens from resolver
    /// @param srcAddress Maker's address (source of funds on source chain)
    /// @param dstAddress Maker's Solana address (destination)
    /// @param token ERC20 token to lock
    /// @param amount Amount of tokens to lock
    /// @param hashlock SHA256 hash for atomic swap
    /// @return htlcContract Address of deployed HTLC contract
    /// @return htlcId Unique identifier for cross-chain coordination
    function createHTLC(
        address srcAddress,
        bytes32 dstAddress,
        address token,
        uint256 amount,
        bytes32 hashlock
    ) external returns (address htlcContract, bytes32 htlcId);
    
    /// @notice Get all HTLCs created by a specific resolver
    /// @param resolver Address of the resolver
    /// @return Array of HTLC contract addresses
    function getResolverHTLCs(address resolver) external view returns (address[] memory);
    
    /// @notice Get HTLC contract address by its ID
    /// @param htlcId The unique HTLC identifier
    /// @return The HTLC contract address (zero if not found)
    function getHTLCById(bytes32 htlcId) external view returns (address);
    
    /// @notice Get all deployed HTLC contracts
    /// @return Array of all HTLC contract addresses
    function getAllHTLCs() external view returns (address[] memory);
    
    /// @notice Get the total number of HTLCs deployed
    /// @return The total count of HTLCs
    function getHTLCCount() external view returns (uint256);
}