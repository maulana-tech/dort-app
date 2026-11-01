// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PortalBridgeEscrow} from "../../src/bridge/PortalBridgeEscrow.sol";
import {PortalBridgeMinter} from "../../src/bridge/PortalBridgeMinter.sol";
import {WrappedToken} from "../../src/bridge/WrappedToken.sol";
import {MockUSDC} from "../../src/mocks/Mocks.sol";

/// The bridge's own rules, both sides in one EVM. The cross-chain round trip against live
/// Portaldot and Base Sepolia is in PortalBridgeCrossFork.t.sol.
contract PortalBridgeTest is Test {
    PortalBridgeEscrow escrow;
    PortalBridgeMinter minter;
    MockUSDC token;

    address owner = address(this);
    address relayer = makeAddr("relayer");
    address alice = makeAddr("alice");
    address mallory = makeAddr("mallory");

    uint256 constant PORTALDOT = 420420777;
    uint256 constant CAP = 1_000_000e6;

    function setUp() public {
        escrow = new PortalBridgeEscrow(relayer, CAP);
        minter = new PortalBridgeMinter(relayer, CAP);
        token = new MockUSDC();
        token.mint(alice, 500e6);
        vm.prank(alice);
        token.approve(address(escrow), type(uint256).max);
    }

    function _lock(uint256 amount) internal returns (bytes32 id) {
        vm.prank(alice);
        return escrow.lock(address(token), amount, PORTALDOT, alice);
    }

    function _mint(bytes32 id, uint256 amount) internal returns (address w) {
        vm.prank(relayer);
        return minter.mint(id, address(token), block.chainid, alice, amount, "Wrapped USDC", "wUSDC", 6);
    }

    // ── the happy path ────────────────────────────────────────────────────────────────────

    function test_lockThenMint_keepsSupplyEqualToLocked() public {
        bytes32 id = _lock(100e6);
        assertEq(escrow.locked(address(token)), 100e6, "escrow holds the asset");
        assertEq(token.balanceOf(alice), 400e6);

        WrappedToken w = WrappedToken(_mint(id, 100e6));
        assertEq(w.balanceOf(alice), 100e6, "wrapped copy minted");
        assertEq(w.totalSupply(), escrow.locked(address(token)), "supply == locked");
        assertEq(w.decimals(), 6);
        assertEq(w.srcChainId(), block.chainid);
    }

    function test_burnThenRelease_returnsTheAsset() public {
        bytes32 id = _lock(100e6);
        WrappedToken w = WrappedToken(_mint(id, 100e6));

        vm.prank(alice);
        bytes32 back = minter.burn(address(token), 40e6, block.chainid, alice);
        assertEq(w.totalSupply(), 60e6, "burned on Portaldot");

        vm.prank(relayer);
        escrow.release(back, address(token), alice, 40e6);
        assertEq(token.balanceOf(alice), 440e6, "paid out at home");
        assertEq(escrow.locked(address(token)), 60e6);
        assertEq(w.totalSupply(), escrow.locked(address(token)), "supply == locked again");
    }

    // ── the rules that hold without trusting the relayer ──────────────────────────────────

    function test_mintTwiceWithTheSameId_reverts() public {
        bytes32 id = _lock(100e6);
        _mint(id, 100e6);
        vm.prank(relayer);
        vm.expectRevert(PortalBridgeMinter.AlreadyProcessed.selector);
        minter.mint(id, address(token), block.chainid, alice, 100e6, "Wrapped USDC", "wUSDC", 6);
    }

    function test_releaseTwiceWithTheSameId_reverts() public {
        _lock(100e6);
        bytes32 id = keccak256("some-burn");
        vm.prank(relayer);
        escrow.release(id, address(token), alice, 10e6);
        vm.prank(relayer);
        vm.expectRevert(PortalBridgeEscrow.AlreadyProcessed.selector);
        escrow.release(id, address(token), alice, 10e6);
    }

    /// The relayer cannot invent value: a release is bounded by what is actually locked.
    function test_releaseMoreThanLocked_reverts() public {
        _lock(100e6);
        vm.prank(relayer);
        vm.expectRevert(PortalBridgeEscrow.NotLocked.selector);
        escrow.release(keccak256("x"), address(token), mallory, 101e6);
    }

    function test_onlyRelayerMovesValue() public {
        bytes32 id = _lock(100e6);
        vm.prank(mallory);
        vm.expectRevert(PortalBridgeEscrow.OnlyRelayer.selector);
        escrow.release(id, address(token), mallory, 100e6);

        vm.prank(mallory);
        vm.expectRevert(PortalBridgeMinter.OnlyRelayer.selector);
        minter.mint(id, address(token), block.chainid, mallory, 100e6, "w", "w", 6);
    }

    /// The relayer moves value but never gains control.
    function test_relayerCannotChangeRolesOrPause() public {
        vm.startPrank(relayer);
        vm.expectRevert(PortalBridgeEscrow.OnlyOwner.selector);
        escrow.setRelayer(mallory);
        vm.expectRevert(PortalBridgeEscrow.OnlyOwner.selector);
        escrow.setPaused(true);
        vm.expectRevert(PortalBridgeMinter.OnlyOwner.selector);
        minter.setOwner(mallory);
        vm.stopPrank();
    }

    function test_wrappedTokenMintableOnlyByTheMinter() public {
        bytes32 id = _lock(100e6);
        WrappedToken w = WrappedToken(_mint(id, 100e6));
        vm.prank(mallory);
        vm.expectRevert(WrappedToken.OnlyMinter.selector);
        w.mint(mallory, 1e18);
    }

    function test_pauseStopsBothSides() public {
        escrow.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(PortalBridgeEscrow.Paused.selector);
        escrow.lock(address(token), 1e6, PORTALDOT, alice);

        minter.setPaused(true);
        vm.prank(relayer);
        vm.expectRevert(PortalBridgeMinter.Paused.selector);
        minter.mint(keccak256("y"), address(token), block.chainid, alice, 1e6, "w", "w", 6);
    }

    function test_capRejectsAnOversizedTransfer() public {
        escrow.setMaxPerTransfer(50e6);
        vm.prank(alice);
        vm.expectRevert(PortalBridgeEscrow.OverCap.selector);
        escrow.lock(address(token), 51e6, PORTALDOT, alice);
    }

    function test_burnWithoutAWrappedToken_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PortalBridgeMinter.UnknownToken.selector);
        minter.burn(address(token), 1e6, block.chainid, alice);
    }

    /// Both sides derive the same id from the same transfer, so neither has to trust the other.
    function test_messageIdAgreesOnBothSides() public view {
        bytes32 a = escrow.messageId(1, PORTALDOT, 7, address(token), alice, 42e6);
        bytes32 b = minter.messageId(1, PORTALDOT, 7, address(token), alice, 42e6);
        assertEq(a, b, "one id, computed independently");
    }

    // ── the invariant the whole bridge rests on ───────────────────────────────────────────

    /// Wrapped supply never exceeds what is locked at home, whatever order things happen in.
    function testFuzz_supplyNeverExceedsLocked(uint96 lockAmount, uint96 burnAmount) public {
        lockAmount = uint96(bound(lockAmount, 1, 500e6));
        vm.prank(alice);
        bytes32 id = escrow.lock(address(token), lockAmount, PORTALDOT, alice);
        WrappedToken w = WrappedToken(_mint(id, lockAmount));

        burnAmount = uint96(bound(burnAmount, 0, lockAmount));
        if (burnAmount > 0) {
            vm.prank(alice);
            bytes32 back = minter.burn(address(token), burnAmount, block.chainid, alice);
            vm.prank(relayer);
            escrow.release(back, address(token), alice, burnAmount);
        }
        assertEq(w.totalSupply(), escrow.locked(address(token)), "supply == locked");
        assertLe(w.totalSupply(), token.balanceOf(address(escrow)), "never more wrapped than held");
    }
}
