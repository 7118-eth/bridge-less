// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/HTLCFactory.sol";
import "../src/HTLC.sol";
import "../src/Token.sol";

/// @title HTLCBridgeTest - Integration tests for HTLC bridge
/// @author Bridge-less Protocol
/// @notice End-to-end tests simulating bridge scenarios
contract HTLCBridgeTest is Test {
    HTLCFactory public factory;
    Token public token;
    
    // Bridge participants
    address public coordinator = address(0x1); // Acts as resolver
    address public userEVM = address(0x2);     // User on EVM side
    bytes32 public userSolana = bytes32(uint256(0x3)); // User on Solana side
    
    // Token mappings
    bytes32 public constant SOLANA_USDC = bytes32(keccak256("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"));
    
    // Pre-funded liquidity
    uint256 public constant LIQUIDITY = 10_000e6; // 10k tokens
    uint256 public constant SWAP_AMOUNT = 1e6;    // 1 token per swap
    
    function setUp() public {
        // Deploy contracts
        token = new Token();
        factory = new HTLCFactory();
        
        // Pre-fund coordinator with liquidity on both chains
        token.transfer(coordinator, LIQUIDITY);
        token.transfer(userEVM, LIQUIDITY);
    }
    
    /// @notice Test single cross-chain swap
    function testSingleCrossChainSwap() public {
        // Generate secret
        bytes32 secret = keccak256("bridge_secret_1");
        bytes32 hashlock = sha256(abi.encodePacked(secret));
        
        // Step 1: Coordinator creates HTLC on EVM (source chain)
        vm.prank(coordinator);
        token.approve(address(factory), SWAP_AMOUNT);
        
        vm.prank(coordinator);
        (address htlcEVM, ) = factory.createHTLC(
            userEVM,        // Source: user on EVM
            userSolana,     // Destination: user on Solana
            address(token),
            SOLANA_USDC,    // Solana token
            SWAP_AMOUNT,
            hashlock
        );
        
        // Verify HTLC created
        HTLC htlc = HTLC(htlcEVM);
        assertEq(htlc.srcAddress(), userEVM);
        assertEq(htlc.dstAddress(), userSolana);
        assertEq(token.balanceOf(htlcEVM), SWAP_AMOUNT);
        
        // Step 2: Simulate Solana HTLC creation (off-chain)
        // In real scenario, coordinator would create matching HTLC on Solana
        
        // Step 3: Wait for finality period
        vm.warp(block.timestamp + 31);
        
        // Step 4: Coordinator reveals secret and withdraws on EVM
        uint256 coordBalanceBefore = token.balanceOf(coordinator);
        
        vm.prank(coordinator);
        htlc.withdrawToDestination(secret);
        
        // Verify withdrawal
        assertTrue(htlc.withdrawn());
        assertEq(token.balanceOf(coordinator), coordBalanceBefore + SWAP_AMOUNT);
        
        // Step 5: In real scenario, user would withdraw on Solana using same secret
    }
    
    /// @notice Test multiple concurrent swaps
    function testMultipleConcurrentSwaps() public {
        uint256 numSwaps = 5;
        address[] memory htlcs = new address[](numSwaps);
        bytes32[] memory secrets = new bytes32[](numSwaps);
        bytes32[] memory hashlocks = new bytes32[](numSwaps);
        
        // Approve all swaps
        vm.prank(coordinator);
        token.approve(address(factory), SWAP_AMOUNT * numSwaps);
        
        // Create multiple HTLCs
        for (uint i = 0; i < numSwaps; i++) {
            secrets[i] = keccak256(abi.encodePacked("secret", i));
            hashlocks[i] = sha256(abi.encodePacked(secrets[i]));
            
            vm.prank(coordinator);
            (htlcs[i], ) = factory.createHTLC(
                userEVM,
                userSolana,
                address(token),
                SOLANA_USDC,
                SWAP_AMOUNT,
                hashlocks[i]
            );
        }
        
        // Verify all HTLCs created
        assertEq(factory.getHTLCCount(), numSwaps);
        assertEq(factory.getResolverHTLCs(coordinator).length, numSwaps);
        
        // Wait for finality
        vm.warp(block.timestamp + 31);
        
        // Withdraw from all HTLCs
        for (uint i = 0; i < numSwaps; i++) {
            vm.prank(coordinator);
            HTLC(htlcs[i]).withdrawToDestination(secrets[i]);
        }
        
        // Verify all withdrawn
        assertEq(token.balanceOf(coordinator), LIQUIDITY);
    }
    
    /// @notice Test failed swap with cancellation
    function testSwapCancellationAfterFailure() public {
        bytes32 secret = keccak256("failed_secret");
        bytes32 hashlock = sha256(abi.encodePacked(secret));
        
        // Create HTLC
        vm.prank(coordinator);
        token.approve(address(factory), SWAP_AMOUNT);
        
        vm.prank(coordinator);
        (address htlcAddress, ) = factory.createHTLC(
            userEVM,
            userSolana,
            address(token),
            SOLANA_USDC,
            SWAP_AMOUNT,
            hashlock
        );
        
        HTLC htlc = HTLC(htlcAddress);
        
        // Simulate failed Solana side - wait for cancellation period
        vm.warp(block.timestamp + 601);
        
        // Anyone can cancel now
        uint256 userBalanceBefore = token.balanceOf(userEVM);
        vm.prank(address(0x999)); // Random address
        htlc.cancel();
        
        // Verify refund to source
        assertTrue(htlc.cancelled());
        assertEq(token.balanceOf(userEVM), userBalanceBefore + SWAP_AMOUNT);
    }
    
    /// @notice Test public withdrawal assistance
    function testPublicWithdrawalAssistance() public {
        bytes32 secret = keccak256("public_secret");
        bytes32 hashlock = sha256(abi.encodePacked(secret));
        
        // Create HTLC
        vm.prank(coordinator);
        token.approve(address(factory), SWAP_AMOUNT);
        
        vm.prank(coordinator);
        (address htlcAddress, ) = factory.createHTLC(
            userEVM,
            userSolana,
            address(token),
            SOLANA_USDC,
            SWAP_AMOUNT,
            hashlock
        );
        
        HTLC htlc = HTLC(htlcAddress);
        
        // Wait past resolver exclusive period
        vm.warp(block.timestamp + 91);
        
        // Random helper assists with withdrawal
        address helper = address(0x888);
        vm.prank(helper);
        htlc.publicWithdraw(secret);
        
        // Verify coordinator still gets funds
        assertTrue(htlc.withdrawn());
        assertEq(token.balanceOf(coordinator), LIQUIDITY);
    }
    
    /// @notice Test gas costs for deployment
    function testGasCosts() public {
        bytes32 hashlock = sha256(abi.encodePacked("gas_test"));
        
        vm.prank(coordinator);
        token.approve(address(factory), SWAP_AMOUNT);
        
        uint256 gasBefore = gasleft();
        vm.prank(coordinator);
        factory.createHTLC(
            userEVM,
            userSolana,
            address(token),
            SOLANA_USDC,
            SWAP_AMOUNT,
            hashlock
        );
        uint256 gasUsed = gasBefore - gasleft();
        
        // Log gas usage (should be ~500k-1.2M as per spec)
        console.log("HTLC deployment gas used:", gasUsed);
        assertTrue(gasUsed < 1_200_000, "Gas cost too high for PoC");
    }
}