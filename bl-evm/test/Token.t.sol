// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {Token} from "../src/Token.sol";

contract TokenTest is Test {
    Token public token;
    address public owner = address(this);
    address public user1 = address(0x1);
    address public user2 = address(0x2);

    function setUp() public {
        token = new Token();
    }

    function testTransfer() public {
        uint256 amount = 100 * 10**6;
        assertTrue(token.transfer(user1, amount));
        assertEq(token.balanceOf(user1), amount);
        assertEq(token.balanceOf(owner), 1_000_000 * 10**6 - amount);
    }

    function testTransferInsufficientBalance() public {
        uint256 amount = 2_000_000 * 10**6;
        vm.expectRevert();
        token.transfer(user1, amount);
    }

    function testApprove() public {
        uint256 amount = 500 * 10**6;
        assertTrue(token.approve(user1, amount));
        assertEq(token.allowance(owner, user1), amount);
    }

    function testTransferFrom() public {
        uint256 amount = 250 * 10**6;
        token.transfer(user1, 1000 * 10**6);
        
        vm.prank(user1);
        token.approve(user2, amount);
        
        vm.prank(user2);
        assertTrue(token.transferFrom(user1, owner, amount));
        assertEq(token.balanceOf(owner), 1_000_000 * 10**6 - 1000 * 10**6 + amount);
        assertEq(token.balanceOf(user1), 1000 * 10**6 - amount);
        assertEq(token.allowance(user1, user2), 0);
    }

    function testTransferFromInsufficientAllowance() public {
        uint256 amount = 100 * 10**6;
        token.transfer(user1, amount);
        
        vm.prank(user1);
        token.approve(user2, 50 * 10**6);
        
        vm.prank(user2);
        vm.expectRevert();
        token.transferFrom(user1, owner, amount);
    }

    function testAllowance() public {
        uint256 amount = 1000 * 10**6;
        token.approve(user1, amount);
        assertEq(token.allowance(owner, user1), amount);
        
        token.approve(user1, 500 * 10**6);
        assertEq(token.allowance(owner, user1), 500 * 10**6);
    }
}