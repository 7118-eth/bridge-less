// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IHTLC} from "./interfaces/IHTLC.sol";

/// @title HTLC - Hash Time Locked Contract Implementation
/// @author Bridge-less Protocol
/// @notice Individual HTLC contract for FusionPlus-inspired atomic swaps
/// @dev Deployed by HTLCFactory with immutable parameters
contract HTLC is IHTLC {
    // Immutable state (set in constructor)
    address public immutable factory;
    address public immutable resolver;     // Who creates the escrow (coordinator)
    address public immutable srcAddress;   // Source of funds (maker on source chain)
    bytes32 public immutable dstAddress;   // Recipient (maker's Solana address)
    address public immutable srcToken;     // ERC20 token on source chain
    bytes32 public immutable dstToken;     // SPL token mint on destination chain
    uint256 public immutable amount;
    bytes32 public immutable hashlock;
    
    // Timelock structure (FusionPlus style)
    uint256 public immutable finalityDeadline;    // When secret can be revealed
    uint256 public immutable resolverDeadline;    // Exclusive resolver withdraw period
    uint256 public immutable publicDeadline;      // Anyone can withdraw for maker
    uint256 public immutable cancellationDeadline; // Refund to resolver
    
    // Mutable state
    bool public withdrawn;
    bool public cancelled;
    
    
    /// @notice Initializes a new HTLC contract
    /// @dev Only callable by the factory contract
    /// @param _resolver Address of the resolver (coordinator)
    /// @param _srcAddress Source address providing the tokens
    /// @param _dstAddress Destination address on Solana
    /// @param _srcToken ERC20 token to be locked on source chain
    /// @param _dstToken SPL token mint to be released on destination chain
    /// @param _amount Amount of tokens to lock
    /// @param _hashlock SHA256 hash that must be unlocked
    constructor(
        address _resolver,
        address _srcAddress,
        bytes32 _dstAddress,
        address _srcToken,
        bytes32 _dstToken,
        uint256 _amount,
        bytes32 _hashlock
    ) {
        factory = msg.sender;
        resolver = _resolver;
        srcAddress = _srcAddress;
        dstAddress = _dstAddress;
        srcToken = _srcToken;
        dstToken = _dstToken;
        amount = _amount;
        hashlock = _hashlock;
        
        // Set timelock periods (Base has 2-second blocks)
        finalityDeadline = block.timestamp + 30;     // 30 seconds for finality
        resolverDeadline = block.timestamp + 90;     // 60 seconds exclusive resolver period
        publicDeadline = block.timestamp + 390;      // 5 minutes total for public withdrawal
        cancellationDeadline = block.timestamp + 600; // 10 minutes total before cancellation
    }
    
    /// @inheritdoc IHTLC
    function withdrawToDestination(bytes32 preimage) external {
        // Check state
        if (withdrawn) revert AlreadyWithdrawn();
        if (cancelled) revert AlreadyCancelled();
        
        // Verify preimage
        if (sha256(abi.encodePacked(preimage)) != hashlock) revert InvalidPreimage();
        
        // Check timing
        if (block.timestamp < finalityDeadline) revert NotInFinalityPeriod();
        if (block.timestamp >= publicDeadline) revert NotInPublicPeriod();
        
        // During resolver exclusive period, only resolver can withdraw
        if (block.timestamp < resolverDeadline && msg.sender != resolver) {
            revert OnlyResolver();
        }
        
        // Update state
        withdrawn = true;
        
        // Transfer tokens to destination address (in real bridge, this would be cross-chain)
        // For now, we transfer to the resolver who will handle the cross-chain transfer
        bool success = IERC20(srcToken).transfer(resolver, amount);
        if (!success) revert TransferFailed();
        
        emit HTLCWithdrawn(address(this), preimage, msg.sender);
    }
    
    /// @inheritdoc IHTLC
    function publicWithdraw(bytes32 preimage) external {
        // Check state
        if (withdrawn) revert AlreadyWithdrawn();
        if (cancelled) revert AlreadyCancelled();
        
        // Verify preimage
        if (sha256(abi.encodePacked(preimage)) != hashlock) revert InvalidPreimage();
        
        // Check timing - must be in public period
        if (block.timestamp < resolverDeadline) revert NotInPublicPeriod();
        if (block.timestamp >= publicDeadline) revert NotInPublicPeriod();
        
        // Update state
        withdrawn = true;
        
        // Transfer tokens to resolver (who will handle cross-chain transfer)
        bool success = IERC20(srcToken).transfer(resolver, amount);
        if (!success) revert TransferFailed();
        
        emit HTLCWithdrawn(address(this), preimage, msg.sender);
    }
    
    /// @inheritdoc IHTLC
    function cancel() external {
        // Check state
        if (withdrawn) revert AlreadyWithdrawn();
        if (cancelled) revert AlreadyCancelled();
        
        // Check timing - must be past cancellation deadline
        if (block.timestamp < cancellationDeadline) revert NotInCancellationPeriod();
        
        // Update state
        cancelled = true;
        
        // Return funds to source address
        bool success = IERC20(srcToken).transfer(srcAddress, amount);
        if (!success) revert TransferFailed();
        
        emit HTLCCancelled(address(this), msg.sender);
    }
}