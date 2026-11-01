// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

interface IERC20Metadata {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/// Portaldot V3 testnet (chain 420420777) is the chain Dort is built for, and it has no Multicall3
/// at the canonical address, so Fork.t.sol skips there. This is the live-chain proof in its place:
/// it calls tokens that are really deployed on Portaldot, which is also what makes the trace worth
/// reading — every frame below is a call into deployed code, decoded against its ABI.
///
/// Runs only on a Portaldot fork (`node dort-export.mjs --chain portaldot-testnet`), and skips
/// everywhere else, local runs included.
contract PortaldotTest is Test {
    uint256 constant PORTALDOT_V3 = 420420777;

    /// Deployed on Portaldot V3 testnet; `cast call <addr> "symbol()(string)"` confirms each.
    IERC20Metadata constant WPOT =
        IERC20Metadata(0xf67cE92096E4E171060B71bF0cca0DA9f9548c03);
    IERC20Metadata constant PUSDT =
        IERC20Metadata(0xe0114Adc0a2072B602C645f5a07EeFA1eaDBDbc2);

    function setUp() public {
        if (block.chainid != PORTALDOT_V3) vm.skip(true);
    }

    /// The fork really is Portaldot, and its tokens answer the ERC-20 ABI.
    function test_portaldot_readsWrappedPot() public view {
        assertEq(block.chainid, PORTALDOT_V3, "forked Portaldot V3");
        assertGt(address(WPOT).code.length, 0, "WPOT is deployed here");

        assertEq(WPOT.symbol(), "WPOT", "symbol from the live contract");
        assertEq(WPOT.decimals(), 18, "WPOT uses 18 decimals");
        assertGt(WPOT.totalSupply(), 0, "someone has wrapped POT");
    }

    /// A second token, so the trace shows more than one deployed contract.
    function test_portaldot_readsPortalUsdt() public view {
        assertGt(address(PUSDT).code.length, 0, "pUSDT is deployed here");
        assertEq(PUSDT.symbol(), "pUSDT", "symbol from the live contract");
        assertEq(PUSDT.decimals(), 6, "pUSDT uses 6 decimals");
    }

    /// Storage reads of a live contract: the balance of an address that holds none is zero, and
    /// the call still runs against deployed code rather than an empty account.
    function test_portaldot_readsTokenStorage() public view {
        address nobody = address(uint160(uint256(keccak256("dort:nobody"))));
        assertEq(WPOT.balanceOf(nobody), 0, "an untouched address holds none");
    }
}
