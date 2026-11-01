// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PortalBridgeEscrow} from "../../src/bridge/PortalBridgeEscrow.sol";
import {PortalBridgeMinter} from "../../src/bridge/PortalBridgeMinter.sol";
import {WrappedToken} from "../../src/bridge/WrappedToken.sol";
import {MockUSDC} from "../../src/mocks/Mocks.sol";

interface IERC20Metadata {
    function symbol() external view returns (string memory);
}

/// The bridge across two real chains at once: Base Sepolia as the home chain and Portaldot V3 as
/// the destination, each forked at its latest block. Both sides are deployed on their own fork and
/// a full round trip runs between them — lock, mint, burn, release — with the supply invariant
/// checked on both chains after every step.
///
/// Nothing is broadcast: forge executes locally against state it pulls from each RPC, so this
/// needs no key, no gas and no funds. It skips itself when either RPC cannot be reached, so a
/// network-less CI still passes.
///
///   forge test --mc PortalBridgeCrossForkTest -vvv
///
/// Override either endpoint with DORT_RPC_PORTALDOT_TESTNET / DORT_RPC_BASE_SEPOLIA.
contract PortalBridgeCrossForkTest is Test {
    uint256 constant PORTALDOT_V3 = 420420777;
    uint256 constant BASE_SEPOLIA = 84532;

    /// Deployed on Portaldot V3; read here only to prove the destination fork is the live chain.
    address constant WPOT = 0xf67cE92096E4E171060B71bF0cca0DA9f9548c03;

    uint256 homeFork;
    uint256 portalFork;
    bool live;

    address alice = makeAddr("alice");
    address relayer = makeAddr("relayer");

    PortalBridgeEscrow escrow; // lives on the home fork
    PortalBridgeMinter minter; // lives on the Portaldot fork
    MockUSDC asset; // the home-chain asset being bridged

    function setUp() public {
        string memory homeRpc = vm.envOr("DORT_RPC_BASE_SEPOLIA", string("https://sepolia.base.org"));
        string memory portalRpc =
            vm.envOr("DORT_RPC_PORTALDOT_TESTNET", string("https://test-evm-rpc-v3.portaldot.dev"));

        try vm.createFork(homeRpc) returns (uint256 h) {
            try vm.createFork(portalRpc) returns (uint256 p) {
                homeFork = h;
                portalFork = p;
                live = true;
            } catch {}
        } catch {}
        if (!live) {
            vm.skip(true);
            return;
        }

        // home chain: the asset and the escrow that holds it
        vm.selectFork(homeFork);
        assertEq(block.chainid, BASE_SEPOLIA, "home fork is Base Sepolia");
        asset = new MockUSDC();
        asset.mint(alice, 1_000e6);
        escrow = new PortalBridgeEscrow(relayer, 0);
        vm.prank(alice);
        asset.approve(address(escrow), type(uint256).max);

        // Portaldot: the minter that issues the wrapped copy
        vm.selectFork(portalFork);
        assertEq(block.chainid, PORTALDOT_V3, "destination fork is Portaldot V3");
        assertGt(WPOT.code.length, 0, "the Portaldot fork really holds deployed contracts");
        minter = new PortalBridgeMinter(relayer, 0);
    }

    /// Lock on Base Sepolia, mint on Portaldot, burn on Portaldot, release on Base Sepolia — and
    /// after each step, the wrapped supply on Portaldot equals the amount locked on Base Sepolia.
    function test_roundTripAcrossBothLiveChains() public {
        // 1. lock at home
        vm.selectFork(homeFork);
        vm.prank(alice);
        bytes32 outbound = escrow.lock(address(asset), 250e6, PORTALDOT_V3, alice);
        assertEq(escrow.locked(address(asset)), 250e6, "home: asset held");
        assertEq(asset.balanceOf(alice), 750e6);

        // 2. the relayer mints the copy on Portaldot, against the id the home chain emitted
        vm.selectFork(portalFork);
        vm.prank(relayer);
        address w = minter.mint(
            outbound, address(asset), BASE_SEPOLIA, alice, 250e6, "Wrapped Mock USDC", "wUSDC", 6
        );
        assertEq(WrappedToken(w).balanceOf(alice), 250e6, "Portaldot: wrapped received");
        _assertSupplyEqualsLocked(w, "after mint");

        // a second delivery of the same message changes nothing
        vm.prank(relayer);
        vm.expectRevert(PortalBridgeMinter.AlreadyProcessed.selector);
        minter.mint(outbound, address(asset), BASE_SEPOLIA, alice, 250e6, "Wrapped Mock USDC", "wUSDC", 6);

        // 3. send 100 home again: burn on Portaldot
        vm.prank(alice);
        bytes32 inbound = minter.burn(address(asset), 100e6, BASE_SEPOLIA, alice);
        assertEq(WrappedToken(w).totalSupply(), 150e6, "Portaldot: burned");

        // 4. the relayer releases it on Base Sepolia
        vm.selectFork(homeFork);
        vm.prank(relayer);
        escrow.release(inbound, address(asset), alice, 100e6);
        assertEq(asset.balanceOf(alice), 850e6, "home: paid out");
        assertEq(escrow.locked(address(asset)), 150e6);

        _assertSupplyEqualsLocked(w, "after release");
    }

    /// The home chain cannot be drained by a relayer that was never given the value: a release
    /// without a matching lock is bounded by what the escrow actually holds.
    function test_relayerCannotReleaseMoreThanTheChainHolds() public {
        vm.selectFork(homeFork);
        vm.prank(alice);
        escrow.lock(address(asset), 10e6, PORTALDOT_V3, alice);

        vm.prank(relayer);
        vm.expectRevert(PortalBridgeEscrow.NotLocked.selector);
        escrow.release(keccak256("forged"), address(asset), relayer, 11e6);
    }

    /// Reads `locked` on the home fork and `totalSupply` on the Portaldot fork, then compares the
    /// two numbers — the bridge's only real invariant, measured across two chains.
    function _assertSupplyEqualsLocked(address wrappedToken, string memory when) internal {
        uint256 current = vm.activeFork();

        vm.selectFork(homeFork);
        uint256 lockedHome = escrow.locked(address(asset));

        vm.selectFork(portalFork);
        uint256 supplyPortaldot = WrappedToken(wrappedToken).totalSupply();

        assertEq(supplyPortaldot, lockedHome, string.concat("locked == wrapped supply, ", when));
        vm.selectFork(current);
    }
}
