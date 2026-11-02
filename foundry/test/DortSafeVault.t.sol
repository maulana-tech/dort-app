// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DortSafeVault, IERC20} from "../src/DortSafeVault.sol";
import {MockUSDC} from "../src/mocks/Mocks.sol";

/// An asset that calls back into the vault on transfer, the way an ERC-777 style token does.
/// This is the shape that breaks a vault which pays out before it burns.
contract CallbackToken {
    string public constant name = "Callback";
    string public constant symbol = "CB";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public hook;
    bool public hooking;

    function setHook(address h) external {
        hook = h;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
        totalSupply += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }

    function transfer(address t, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[t] += a;
        // the callback: the receiver gets control while the vault is mid-withdraw
        if (hook != address(0) && !hooking) {
            hooking = true;
            Reenterer(hook).onTokens();
            hooking = false;
        }
        return true;
    }
}

/// Tries to withdraw twice: once from the outside, once from inside the token callback.
contract Reenterer {
    DortSafeVault public vault;
    uint256 public shares;
    bool public tried;
    bytes public reason;

    function arm(DortSafeVault v, uint256 s) external {
        vault = v;
        shares = s;
    }

    function go() external {
        vault.redeem(shares / 2, address(this), address(this));
    }

    function onTokens() external {
        if (tried) return;
        tried = true;
        try vault.redeem(shares / 2, address(this), address(this)) {
            reason = "REENTERED";
        } catch (bytes memory err) {
            reason = err;
        }
    }
}

/// A token that keeps 1% on every transfer.
contract FeeToken {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
        totalSupply += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        uint256 fee = a / 100;
        balanceOf[t] += a - fee;
        totalSupply -= fee;
        return true;
    }

    function transfer(address t, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// A token that returns nothing at all, like USDT on Ethereum.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external {
        allowance[msg.sender][s] = a;
    }

    function transferFrom(address f, address t, uint256 a) external {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
    }

    function transfer(address t, uint256 a) external {
        balanceOf[msg.sender] -= a;
        balanceOf[t] += a;
    }
}

contract DortSafeVaultTest is Test {
    DortSafeVault vault;
    MockUSDC usdc;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new DortSafeVault(IERC20(address(usdc)), "Dort USDC Vault", "dUSDC", 6);
        address[3] memory who = [alice, bob, mallory];
        for (uint256 i = 0; i < who.length; i++) {
            usdc.mint(who[i], 1_000e6);
            vm.prank(who[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    function _deposit(address who, uint256 amount) internal returns (uint256) {
        vm.prank(who);
        return vault.deposit(amount, who);
    }

    // ── the basics ───────────────────────────────────────────────────────────────────────

    function test_depositMintsShares_andRedeemReturnsThem() public {
        uint256 shares = _deposit(alice, 100e6);
        assertGt(shares, 0);
        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.totalAssets(), 100e6);

        vm.prank(alice);
        uint256 back = vault.redeem(shares, alice, alice);
        assertLe(back, 100e6, "never pays out more than was put in");
        assertApproxEqAbs(back, 100e6, 1, "and gives back all of it but dust");
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_twoDepositorsShareProRata() public {
        _deposit(alice, 100e6);
        _deposit(bob, 300e6);
        uint256 a = vault.previewRedeem(vault.balanceOf(alice));
        uint256 b = vault.previewRedeem(vault.balanceOf(bob));
        assertApproxEqRel(b, a * 3, 1e12, "bob put in three times as much");
    }

    function test_withdrawTakesExactlyWhatWasAsked() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vault.withdraw(40e6, alice, alice);
        assertEq(usdc.balanceOf(alice), 900e6 + 40e6);
    }

    // ── the rules the sample vault breaks ────────────────────────────────────────────────

    /// The flaw in src/DortVault.sol: it transfers before burning. Here the shares are gone
    /// first, and the guard refuses the reentrant call outright.
    function test_reentrantWithdrawIsRefused() public {
        CallbackToken cb = new CallbackToken();
        DortSafeVault v = new DortSafeVault(IERC20(address(cb)), "cb", "cb", 18);
        Reenterer r = new Reenterer();

        cb.mint(address(r), 100e18);
        vm.prank(address(r));
        cb.approve(address(v), type(uint256).max);
        vm.prank(address(r));
        uint256 shares = v.deposit(100e18, address(r));

        cb.setHook(address(r));
        r.arm(v, shares);
        r.go();

        assertTrue(r.tried(), "the callback did fire");
        assertEq(
            bytes4(r.reason()),
            DortSafeVault.Reentrancy.selector,
            "and the second withdraw was refused"
        );
        // half the shares left, and no more assets left the vault than those shares were worth
        assertEq(v.balanceOf(address(r)), shares - shares / 2);
        assertGe(v.totalAssets(), v.previewRedeem(v.balanceOf(address(r))));
    }

    /// The first-depositor attack: donate to an empty vault so the next deposit rounds to zero
    /// shares and the attacker owns everything. The virtual offset makes it a losing trade.
    function test_firstDepositorCannotRoundTheNextOneToNothing() public {
        vm.prank(mallory);
        vault.deposit(1, mallory); // 1 wei, the classic opener

        vm.prank(mallory);
        usdc.transfer(address(vault), 500e6); // donate, inflating the share price

        uint256 victimShares = _deposit(alice, 100e6);
        assertGt(victimShares, 0, "the victim still gets shares");

        uint256 victimValue = vault.previewRedeem(victimShares);
        assertGt(victimValue, 99e6, "and can still take out what they put in");

        // the balance is read first: vm.prank only covers the next call, and an argument that
        // is itself a call would consume it
        uint256 malloryShares = vault.balanceOf(mallory);
        vm.prank(mallory);
        uint256 stolen = vault.redeem(malloryShares, mallory, mallory);
        assertLt(stolen, 501e6, "the attacker cannot walk away with the victim's deposit");
    }

    /// Rounding may only ever go the vault's way.
    function testFuzz_roundingNeverFavoursTheCaller(uint96 first, uint96 second) public {
        uint256 a = bound(uint256(first), 1e6, 500e6);
        uint256 b = bound(uint256(second), 1e6, 500e6);
        _deposit(alice, a);
        _deposit(bob, b);

        uint256 aliceOut = vault.previewRedeem(vault.balanceOf(alice));
        uint256 bobOut = vault.previewRedeem(vault.balanceOf(bob));
        assertLe(aliceOut, a, "alice cannot redeem more than she put in");
        assertLe(bobOut, b, "nor bob");
        assertLe(aliceOut + bobOut, vault.totalAssets(), "the vault stays solvent");
    }

    /// A fee-on-transfer asset must mint shares for what arrived, not for what was asked.
    function test_feeOnTransferAssetCreditsOnlyWhatArrived() public {
        FeeToken fee = new FeeToken();
        DortSafeVault v = new DortSafeVault(IERC20(address(fee)), "fee", "fee", 18);
        fee.mint(alice, 100e18);
        vm.prank(alice);
        fee.approve(address(v), type(uint256).max);

        vm.prank(alice);
        v.deposit(100e18, alice);
        assertEq(v.totalAssets(), 99e18, "1% stayed with the token");
        assertLe(v.previewRedeem(v.balanceOf(alice)), 99e18, "shares are worth only what arrived");
    }

    /// Tokens that return nothing are accepted; the sample vault's `require(transfer(...))`
    /// reverts on them.
    function test_tokenThatReturnsNothingStillWorks() public {
        NoReturnToken nr = new NoReturnToken();
        DortSafeVault v = new DortSafeVault(IERC20(address(nr)), "nr", "nr", 18);
        nr.mint(alice, 10e18);
        vm.prank(alice);
        nr.approve(address(v), type(uint256).max);

        vm.prank(alice);
        uint256 s = v.deposit(10e18, alice);
        vm.prank(alice);
        v.redeem(s, alice, alice);
        assertApproxEqAbs(nr.balanceOf(alice), 10e18, 1);
    }

    // ── access control ───────────────────────────────────────────────────────────────────

    function test_pauseStopsDepositsAndWithdrawals() public {
        _deposit(alice, 10e6);
        vault.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(DortSafeVault.Paused.selector);
        vault.deposit(1e6, alice);
        vm.prank(alice);
        vm.expectRevert(DortSafeVault.Paused.selector);
        vault.redeem(1, alice, alice);
    }

    function test_onlyOwnerPauses() public {
        vm.prank(mallory);
        vm.expectRevert(DortSafeVault.OnlyOwner.selector);
        vault.setPaused(true);
    }

    /// A mistyped owner address changes nothing until it accepts.
    function test_ownershipNeedsTwoSteps() public {
        vault.offerOwnership(bob);
        assertEq(vault.owner(), address(this), "still ours until accepted");
        vm.prank(mallory);
        vm.expectRevert(DortSafeVault.OnlyPendingOwner.selector);
        vault.acceptOwnership();
        vm.prank(bob);
        vault.acceptOwnership();
        assertEq(vault.owner(), bob);
    }

    function test_cannotRedeemSomeoneElsesSharesWithoutAllowance() public {
        uint256 s = _deposit(alice, 50e6);
        vm.prank(mallory);
        vm.expectRevert(DortSafeVault.InsufficientAllowance.selector);
        vault.redeem(s, mallory, alice);
    }
}
