// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/interfaces/IHTLCFactory.sol";
import "../src/interfaces/IHTLC.sol";
import "../src/HTLCFactory.sol";
import "../src/Token.sol";

/// @title HTLCFactoryTest - Test suite for HTLCFactory contract
/// @author Bridge-less Protocol
/// @notice Comprehensive tests for HTLCFactory following TDD approach
contract HTLCFactoryTest is Test {
    // Test contracts
    IHTLCFactory public factory;
    Token public token;
    
    // Test addresses
    address public resolver = address(0x1);
    address public srcAddress = address(0x2);
    bytes32 public dstAddress = bytes32(uint256(0x3));
    address public randomUser = address(0x4);
    
    // Solana token mint (example: USDC on Solana)
    bytes32 public constant SOLANA_USDC = bytes32(keccak256("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"));
    
    // Test values
    uint256 public constant AMOUNT = 1e6; // 1 token with 6 decimals
    bytes32 public secret = keccak256("test_secret");
    bytes32 public hashlock;
    
    // Events to test
    event HTLCDeployed(
        address indexed htlcContract,
        bytes32 indexed htlcId,
        address indexed resolver,
        address srcAddress,
        bytes32 dstAddress,
        address srcToken,
        bytes32 dstToken,
        uint256 amount,
        bytes32 hashlock,
        uint256 finalityDeadline
    );
    
    function setUp() public {
        // Deploy token
        token = new Token();
        
        // Calculate hashlock
        hashlock = sha256(abi.encodePacked(secret));
        
        // Fund test accounts
        token.transfer(resolver, 10_000e6); // Resolver has 10k tokens
        token.transfer(srcAddress, 10_000e6); // Source has 10k tokens
    }
    
    /// @notice Test factory deployment
    function testFactoryDeployment() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Verify initial state
        assertEq(factory.getHTLCCount(), 0);
        assertEq(factory.getAllHTLCs().length, 0);
    }
    
    /// @notice Test HTLC creation through factory
    function testCreateHTLC() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Approve factory to spend resolver's tokens
        vm.prank(resolver);
        token.approve(address(factory), AMOUNT);
        
        // Calculate expected HTLC ID
        bytes32 expectedId = keccak256(abi.encodePacked(
            resolver,
            srcAddress,
            dstAddress,
            address(token),
            SOLANA_USDC,
            AMOUNT,
            hashlock,
            block.timestamp
        ));
        
        // Expect HTLCDeployed event
        vm.expectEmit(false, true, true, false);
        emit HTLCDeployed(
            address(0), // We don't know the address yet
            expectedId,
            resolver,
            srcAddress,
            dstAddress,
            address(token),
            SOLANA_USDC,
            AMOUNT,
            hashlock,
            block.timestamp + 30
        );
        
        // Create HTLC
        vm.prank(resolver);
        (address htlcContract, bytes32 htlcId) = factory.createHTLC(
            srcAddress,
            dstAddress,
            address(token),
            SOLANA_USDC,
            AMOUNT,
            hashlock
        );
        
        // Verify return values
        assertTrue(htlcContract != address(0));
        assertEq(htlcId, expectedId);
        
        // Verify factory state
        assertEq(factory.getHTLCCount(), 1);
        assertEq(factory.getAllHTLCs().length, 1);
        assertEq(factory.getAllHTLCs()[0], htlcContract);
        assertEq(factory.getHTLCById(htlcId), htlcContract);
        
        // Verify resolver HTLCs
        address[] memory resolverHTLCs = factory.getResolverHTLCs(resolver);
        assertEq(resolverHTLCs.length, 1);
        assertEq(resolverHTLCs[0], htlcContract);
        
        // Verify tokens were transferred to HTLC
        assertEq(token.balanceOf(htlcContract), AMOUNT);
        assertEq(token.balanceOf(resolver), 10_000e6 - AMOUNT);
    }
    
    /// @notice Test creating HTLC with zero amount
    function testCreateHTLCWithZeroAmount() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to create HTLC with zero amount
        vm.prank(resolver);
        vm.expectRevert(IHTLCFactory.ZeroAmount.selector);
        factory.createHTLC(
            srcAddress,
            dstAddress,
            address(token),
            SOLANA_USDC,
            0,
            hashlock
        );
    }
    
    /// @notice Test creating HTLC with invalid token
    function testCreateHTLCWithInvalidToken() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to create HTLC with invalid token
        vm.prank(resolver);
        vm.expectRevert(IHTLCFactory.InvalidToken.selector);
        factory.createHTLC(
            srcAddress,
            dstAddress,
            address(0),
            SOLANA_USDC,
            AMOUNT,
            hashlock
        );
    }
    
    /// @notice Test creating HTLC with invalid source address
    function testCreateHTLCWithInvalidSrcAddress() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to create HTLC with invalid source
        vm.prank(resolver);
        vm.expectRevert(IHTLCFactory.InvalidSrcAddress.selector);
        factory.createHTLC(
            address(0),
            dstAddress,
            address(token),
            SOLANA_USDC,
            AMOUNT,
            hashlock
        );
    }
    
    /// @notice Test creating HTLC with invalid destination
    function testCreateHTLCWithInvalidDstAddress() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to create HTLC with empty destination
        vm.prank(resolver);
        vm.expectRevert(IHTLCFactory.InvalidDstAddress.selector);
        factory.createHTLC(
            srcAddress,
            bytes32(0),
            address(token),
            SOLANA_USDC,
            AMOUNT,
            hashlock
        );
    }
    
    /// @notice Test creating HTLC with invalid destination token
    function testCreateHTLCWithInvalidDstToken() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to create HTLC with empty destination token
        vm.prank(resolver);
        vm.expectRevert(IHTLCFactory.InvalidDstAddress.selector); // Reuses same error
        factory.createHTLC(
            srcAddress,
            dstAddress,
            address(token),
            bytes32(0), // Invalid dst token
            AMOUNT,
            hashlock
        );
    }
    
    /// @notice Test creating HTLC with invalid hashlock
    function testCreateHTLCWithInvalidHashlock() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to create HTLC with empty hashlock
        vm.prank(resolver);
        vm.expectRevert(IHTLCFactory.InvalidHashlock.selector);
        factory.createHTLC(
            srcAddress,
            dstAddress,
            address(token),
            SOLANA_USDC,
            AMOUNT,
            bytes32(0)
        );
    }
    
    /// @notice Test multiple HTLC deployments
    function testMultipleHTLCDeployments() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Approve factory to spend resolver's tokens
        vm.prank(resolver);
        token.approve(address(factory), AMOUNT * 3);
        
        // Create 3 HTLCs
        address[] memory htlcs = new address[](3);
        bytes32[] memory ids = new bytes32[](3);
        
        for (uint i = 0; i < 3; i++) {
            bytes32 uniqueHashlock = sha256(abi.encodePacked(secret, i));
            
            vm.prank(resolver);
            (htlcs[i], ids[i]) = factory.createHTLC(
                srcAddress,
                dstAddress,
                address(token),
                SOLANA_USDC,
                AMOUNT,
                uniqueHashlock
            );
        }
        
        // Verify factory state
        assertEq(factory.getHTLCCount(), 3);
        assertEq(factory.getAllHTLCs().length, 3);
        
        // Verify resolver HTLCs
        address[] memory resolverHTLCs = factory.getResolverHTLCs(resolver);
        assertEq(resolverHTLCs.length, 3);
        
        // Verify each HTLC can be retrieved by ID
        for (uint i = 0; i < 3; i++) {
            assertEq(factory.getHTLCById(ids[i]), htlcs[i]);
        }
    }
    
    /// @notice Test registry lookup for non-existent HTLC
    function testGetNonExistentHTLC() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Try to get non-existent HTLC
        bytes32 randomId = keccak256("random");
        assertEq(factory.getHTLCById(randomId), address(0));
    }
    
    /// @notice Test getting HTLCs for resolver with no deployments
    function testGetHTLCsForEmptyResolver() public {
        // Deploy factory
        factory = new HTLCFactory();
        
        // Get HTLCs for resolver who hasn't deployed any
        address[] memory htlcs = factory.getResolverHTLCs(randomUser);
        assertEq(htlcs.length, 0);
    }
}