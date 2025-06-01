// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "solmate-6.8.0/src/tokens/ERC20.sol";

contract Token is ERC20 {
    constructor() ERC20("Token", "TKN", 6) {
        _mint(msg.sender, 1_000_000 * 10**6);
    }
}