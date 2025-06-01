// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

contract HTLC {
    // Immutable state (set in constructor)
    address public immutable factory;
    address public immutable resolver;     // Who creates the escrow (coordinator)
    address public immutable srcAddress;   // Source of funds (maker on source chain)
    bytes32 public immutable dstAddress;   // Recipient (maker's Solana address)
    address public immutable token;
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
    
    // Events
    event HTLCWithdrawn(
        address indexed htlcContract,
        bytes32 preimage,
        address executor      // Who executed the withdrawal
    );
    
    event HTLCCancelled(
        address indexed htlcContract,
        address executor
    );
    
    // Errors
    error InvalidPreimage();
    error AlreadyWithdrawn();
    error AlreadyCancelled();
    error NotInFinalityPeriod();
    error NotInResolverPeriod();
    error NotInPublicPeriod();
    error NotInCancellationPeriod();
    error OnlyResolver();
    error TransferFailed();
    
    constructor(
        address _resolver,
        address _srcAddress,
        bytes32 _dstAddress,
        address _token,
        uint256 _amount,
        bytes32 _hashlock
    ) {
        factory = msg.sender;
        resolver = _resolver;
        srcAddress = _srcAddress;
        dstAddress = _dstAddress;
        token = _token;
        amount = _amount;
        hashlock = _hashlock;
        
        // Set timelock periods (Base has 2-second blocks)
        finalityDeadline = block.timestamp + 30;     // 30 seconds for finality
        resolverDeadline = block.timestamp + 90;     // 60 seconds exclusive resolver period
        publicDeadline = block.timestamp + 390;      // 5 minutes total for public withdrawal
        cancellationDeadline = block.timestamp + 600; // 10 minutes total before cancellation
    }
    
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
        bool success = IERC20(token).transfer(resolver, amount);
        if (!success) revert TransferFailed();
        
        emit HTLCWithdrawn(address(this), preimage, msg.sender);
    }
    
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
        bool success = IERC20(token).transfer(resolver, amount);
        if (!success) revert TransferFailed();
        
        emit HTLCWithdrawn(address(this), preimage, msg.sender);
    }
    
    function cancel() external {
        // Check state
        if (withdrawn) revert AlreadyWithdrawn();
        if (cancelled) revert AlreadyCancelled();
        
        // Check timing - must be past cancellation deadline
        if (block.timestamp < cancellationDeadline) revert NotInCancellationPeriod();
        
        // Update state
        cancelled = true;
        
        // Return funds to source address
        bool success = IERC20(token).transfer(srcAddress, amount);
        if (!success) revert TransferFailed();
        
        emit HTLCCancelled(address(this), msg.sender);
    }
}