// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IHTLC - Hash Time Locked Contract Interface
/// @author Bridge-less Protocol
/// @notice Interface for individual HTLC contracts following FusionPlus-inspired design
/// @dev Each HTLC is deployed as a separate contract through the factory
interface IHTLC {
    /// @notice Emitted when tokens are withdrawn using the correct preimage
    /// @param htlcContract Address of this HTLC contract
    /// @param preimage The preimage that unlocked the hashlock
    /// @param executor Address that executed the withdrawal
    event HTLCWithdrawn(
        address indexed htlcContract,
        bytes32 preimage,
        address executor
    );
    
    /// @notice Emitted when the HTLC is cancelled and funds returned
    /// @param htlcContract Address of this HTLC contract
    /// @param executor Address that executed the cancellation
    event HTLCCancelled(
        address indexed htlcContract,
        address executor
    );
    
    /// @notice Thrown when an invalid preimage is provided
    error InvalidPreimage();
    
    /// @notice Thrown when trying to withdraw already withdrawn funds
    error AlreadyWithdrawn();
    
    /// @notice Thrown when trying to cancel an already cancelled HTLC
    error AlreadyCancelled();
    
    /// @notice Thrown when operation is attempted during finality period
    error NotInFinalityPeriod();
    
    /// @notice Thrown when non-resolver tries to withdraw during resolver period
    error NotInResolverPeriod();
    
    /// @notice Thrown when attempting public withdrawal outside allowed period
    error NotInPublicPeriod();
    
    /// @notice Thrown when attempting cancellation before deadline
    error NotInCancellationPeriod();
    
    /// @notice Thrown when non-resolver attempts resolver-only action
    error OnlyResolver();
    
    /// @notice Thrown when token transfer fails
    error TransferFailed();
    
    /// @notice Get the factory that deployed this HTLC
    /// @return The factory contract address
    function factory() external view returns (address);
    
    /// @notice Get the resolver (coordinator) address
    /// @return The resolver address who created this escrow
    function resolver() external view returns (address);
    
    /// @notice Get the source address (maker on source chain)
    /// @return The address providing the tokens
    function srcAddress() external view returns (address);
    
    /// @notice Get the destination address (maker's Solana address)
    /// @return The destination address as bytes32
    function dstAddress() external view returns (bytes32);
    
    /// @notice Get the source token being locked
    /// @return The ERC20 token address on source chain
    function srcToken() external view returns (address);
    
    /// @notice Get the destination token to be released
    /// @return The SPL token mint address on destination chain
    function dstToken() external view returns (bytes32);
    
    /// @notice Get the locked amount
    /// @return The amount of tokens locked
    function amount() external view returns (uint256);
    
    /// @notice Get the hashlock
    /// @return The SHA256 hash that must be unlocked
    function hashlock() external view returns (bytes32);
    
    /// @notice Get the finality deadline
    /// @return Timestamp when operations can begin
    function finalityDeadline() external view returns (uint256);
    
    /// @notice Get the resolver exclusive deadline
    /// @return Timestamp when resolver exclusive period ends
    function resolverDeadline() external view returns (uint256);
    
    /// @notice Get the public withdrawal deadline
    /// @return Timestamp when public withdrawal period ends
    function publicDeadline() external view returns (uint256);
    
    /// @notice Get the cancellation deadline
    /// @return Timestamp when cancellation becomes possible
    function cancellationDeadline() external view returns (uint256);
    
    /// @notice Check if funds have been withdrawn
    /// @return True if withdrawn, false otherwise
    function withdrawn() external view returns (bool);
    
    /// @notice Check if HTLC has been cancelled
    /// @return True if cancelled, false otherwise
    function cancelled() external view returns (bool);
    
    /// @notice Withdraw tokens to destination (resolver or during resolver period)
    /// @dev Only callable by resolver during exclusive period, by anyone during public period
    /// @param preimage The preimage that hashes to the hashlock
    function withdrawToDestination(bytes32 preimage) external;
    
    /// @notice Public withdrawal function for after resolver exclusive period
    /// @dev Anyone can call this during the public withdrawal period
    /// @param preimage The preimage that hashes to the hashlock
    function publicWithdraw(bytes32 preimage) external;
    
    /// @notice Cancel the HTLC and return funds to source address
    /// @dev Only callable after cancellation deadline
    function cancel() external;
}