// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/interfaces/IHTLC.sol";
import "../src/HTLC.sol";
import "../src/HTLCFactory.sol";
import "../src/Token.sol";

/// @title HTLCTest - Test suite for HTLC contract
/// @author Bridge-less Protocol
/// @notice Comprehensive tests for HTLC following TDD approach
contract HTLCTest is Test {
    // Test contracts
    IHTLC public htlc;
    HTLCFactory public factory;
    Token public token;
    
    // Test addresses
    address public resolver = address(0x2);
    address public srcAddress = address(0x3);
    bytes32 public dstAddress = bytes32(uint256(0x4));
    address public randomUser = address(0x5);
    
    // Solana token mint (example: USDC on Solana)
    bytes32 public constant SOLANA_USDC = bytes32(keccak256("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"));
    
    // Test values
    uint256 public constant AMOUNT = 1e6; // 1 token with 6 decimals
    bytes32 public secret = keccak256("test_secret");
    bytes32 public hashlock;
    
    // Events to test
    event HTLCWithdrawn(address indexed htlcContract, bytes32 preimage, address executor);
    event HTLCCancelled(address indexed htlcContract, address executor);
    
    function setUp() public {
        // Deploy token
        token = new Token();
        
        // Calculate hashlock
        hashlock = sha256(abi.encodePacked(secret));
        
        // Fund test accounts
        token.transfer(resolver, 10_000e6); // Resolver has 10k tokens
        token.transfer(srcAddress, 10_000e6); // Source has 10k tokens
    }
    
    /// @notice Test HTLC initialization with correct parameters
    function testHTLCInitialization() public {
        // Deploy HTLC through factory
        deployHTLC();
        
        // Verify all parameters are set correctly
        assertEq(htlc.factory(), address(factory));
        assertEq(htlc.resolver(), resolver);
        assertEq(htlc.srcAddress(), srcAddress);
        assertEq(htlc.dstAddress(), dstAddress);
        assertEq(htlc.srcToken(), address(token));
        assertEq(htlc.dstToken(), SOLANA_USDC);
        assertEq(htlc.amount(), AMOUNT);
        assertEq(htlc.hashlock(), hashlock);
        
        // Verify timelock values
        assertEq(htlc.finalityDeadline(), block.timestamp + 30);
        assertEq(htlc.resolverDeadline(), block.timestamp + 90);
        assertEq(htlc.publicDeadline(), block.timestamp + 390);
        assertEq(htlc.cancellationDeadline(), block.timestamp + 600);
        
        // Verify initial state
        assertFalse(htlc.withdrawn());
        assertFalse(htlc.cancelled());
        
        // Verify tokens were transferred to HTLC
        assertEq(token.balanceOf(address(htlc)), AMOUNT);
    }
    
    /// @notice Test withdrawing with correct preimage during resolver period
    function testWithdrawByResolverWithCorrectPreimage() public {
        // Setup HTLC
        deployHTLC();
        
        // Move past finality period but within resolver period
        vm.warp(block.timestamp + 60);
        
        // Expect withdrawal event
        vm.expectEmit(true, false, false, true);
        emit HTLCWithdrawn(address(htlc), secret, resolver);
        
        // Withdraw as resolver
        vm.prank(resolver);
        htlc.withdrawToDestination(secret);
        
        // Verify state
        assertTrue(htlc.withdrawn());
        assertEq(token.balanceOf(resolver), 10_000e6 - AMOUNT + AMOUNT); // Resolver gets tokens back
    }
    
    /// @notice Test withdrawing with incorrect preimage should fail
    function testWithdrawWithIncorrectPreimage() public {
        // Setup HTLC
        deployHTLC();
        
        // Move past finality period
        vm.warp(block.timestamp + 60);
        
        // Try to withdraw with wrong preimage
        bytes32 wrongSecret = keccak256("wrong_secret");
        vm.prank(resolver);
        vm.expectRevert(IHTLC.InvalidPreimage.selector);
        htlc.withdrawToDestination(wrongSecret);
    }
    
    /// @notice Test non-resolver cannot withdraw during resolver period
    function testNonResolverCannotWithdrawDuringResolverPeriod() public {
        // Setup HTLC
        deployHTLC();
        
        // Move past finality but within resolver period
        vm.warp(block.timestamp + 60);
        
        // Try to withdraw as non-resolver
        vm.prank(randomUser);
        vm.expectRevert(IHTLC.OnlyResolver.selector);
        htlc.withdrawToDestination(secret);
    }
    
    /// @notice Test public withdrawal after resolver period
    function testPublicWithdrawAfterResolverPeriod() public {
        // Setup HTLC
        deployHTLC();
        
        // Move past resolver period but within public period
        vm.warp(block.timestamp + 120);
        
        // Anyone can withdraw now
        vm.expectEmit(true, false, false, true);
        emit HTLCWithdrawn(address(htlc), secret, randomUser);
        
        vm.prank(randomUser);
        htlc.publicWithdraw(secret);
        
        // Verify state
        assertTrue(htlc.withdrawn());
        assertEq(token.balanceOf(resolver), 10_000e6); // Resolver gets tokens
    }
    
    /// @notice Test cannot withdraw during finality period
    function testCannotWithdrawDuringFinalityPeriod() public {
        // Setup HTLC
        deployHTLC();
        
        // Try to withdraw immediately (during finality)
        vm.prank(resolver);
        vm.expectRevert(IHTLC.NotInFinalityPeriod.selector);
        htlc.withdrawToDestination(secret);
    }
    
    /// @notice Test cancellation after deadline
    function testCancellationAfterDeadline() public {
        // Setup HTLC
        deployHTLC();
        
        // Move past cancellation deadline
        vm.warp(block.timestamp + 601);
        
        // Expect cancellation event
        vm.expectEmit(true, false, false, true);
        emit HTLCCancelled(address(htlc), randomUser);
        
        // Anyone can cancel
        vm.prank(randomUser);
        htlc.cancel();
        
        // Verify state
        assertTrue(htlc.cancelled());
        assertEq(token.balanceOf(srcAddress), 10_000e6 + AMOUNT); // Refunded
    }
    
    /// @notice Test cannot cancel before deadline
    function testCannotCancelBeforeDeadline() public {
        // Setup HTLC
        deployHTLC();
        
        // Try to cancel too early
        vm.prank(randomUser);
        vm.expectRevert(IHTLC.NotInCancellationPeriod.selector);
        htlc.cancel();
    }
    
    /// @notice Test double withdrawal prevention
    function testCannotWithdrawTwice() public {
        // Setup HTLC and withdraw once
        deployHTLC();
        vm.warp(block.timestamp + 60);
        vm.prank(resolver);
        htlc.withdrawToDestination(secret);
        
        // Try to withdraw again
        vm.prank(resolver);
        vm.expectRevert(IHTLC.AlreadyWithdrawn.selector);
        htlc.withdrawToDestination(secret);
    }
    
    /// @notice Test cannot cancel after withdrawal
    function testCannotCancelAfterWithdrawal() public {
        // Setup HTLC and withdraw
        deployHTLC();
        vm.warp(block.timestamp + 60);
        vm.prank(resolver);
        htlc.withdrawToDestination(secret);
        
        // Try to cancel after withdrawal
        vm.warp(block.timestamp + 601);
        vm.prank(randomUser);
        vm.expectRevert(IHTLC.AlreadyWithdrawn.selector);
        htlc.cancel();
    }
    
    /// @notice Test cannot withdraw after cancellation
    function testCannotWithdrawAfterCancellation() public {
        // Setup HTLC and cancel
        deployHTLC();
        vm.warp(block.timestamp + 601);
        vm.prank(randomUser);
        htlc.cancel();
        
        // Try to withdraw after cancellation
        vm.prank(resolver);
        vm.expectRevert(IHTLC.AlreadyCancelled.selector);
        htlc.withdrawToDestination(secret);
    }
    
    // Helper function to deploy HTLC through factory
    function deployHTLC() internal {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Approve factory to spend resolver's tokens
        vm.prank(resolver);
        token.approve(address(factory), AMOUNT);
        
        // Create HTLC through factory
        vm.prank(resolver);
        (address htlcAddress, ) = factory.createHTLC(
            srcAddress,
            dstAddress,
            address(token),
            SOLANA_USDC,
            AMOUNT,
            hashlock
        );
        
        htlc = IHTLC(htlcAddress);
    }
}