// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// A share vault written the way the sample one is not.
///
/// `src/DortVault.sol` is the teaching contract: it pays out before it burns shares, trusts the
/// oracle, and ignores ERC-20 return values. This is the same job done correctly, so the two can
/// be read side by side in the Atlas. Every rule below exists because its absence is a known way
/// vaults lose money:
///
/// 1. **Effects before interactions.** Shares are burned, and the accounting updated, before a
///    single token moves out. The sample's `withdraw` transfers first — with a callback token
///    that is a reentrancy.
/// 2. **A reentrancy guard anyway**, because depth-1 safety is not a design.
/// 3. **Rounding always favours the vault.** Deposits round shares down, withdrawals round shares
///    up. A rounding error can never be harvested by the caller.
/// 4. **A virtual offset against the first-depositor (inflation) attack**, so donating assets to
///    an empty vault cannot make the next depositor's shares round to zero.
/// 5. **Measured transfers.** The vault credits what actually arrived, so a fee-on-transfer asset
///    cannot mint shares backed by tokens it never received.
/// 6. **ERC-20 return values are checked**, including tokens that return nothing at all.
/// 7. **Two-step ownership**, so a typo cannot hand the vault to an address nobody holds.
contract DortSafeVault {
    /* ───────────────────────────── shares (ERC-20) ───────────────────────────── */

    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /* ───────────────────────────── vault state ───────────────────────────────── */

    IERC20 public immutable asset;
    address public owner;
    address public pendingOwner;
    bool public paused;

    /// Virtual shares/assets. With an offset of 3 an attacker must donate 1000× the victim's
    /// deposit to steal one wei of rounding, which is not a trade anyone makes.
    uint8 private constant OFFSET = 3;

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private locked = NOT_ENTERED;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed shareOwner,
        uint256 assets,
        uint256 shares
    );
    event PausedSet(bool paused);
    event OwnershipOffered(address indexed to);
    event OwnershipAccepted(address indexed from, address indexed to);

    error OnlyOwner();
    error OnlyPendingOwner();
    error Paused();
    error Reentrancy();
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier nonReentrant() {
        if (locked == ENTERED) revert Reentrancy();
        locked = ENTERED;
        _;
        locked = NOT_ENTERED;
    }

    constructor(IERC20 _asset, string memory _name, string memory _symbol, uint8 _decimals) {
        if (address(_asset) == address(0)) revert ZeroAddress();
        asset = _asset;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;
    }

    /* ───────────────────────────── accounting ────────────────────────────────── */

    /// What the vault holds. Reading the balance keeps donations accounted for; the virtual
    /// offset is what makes that safe.
    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return _toShares(assets, false);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return _toAssets(shares, false);
    }

    /// Shares minted for a deposit: rounded **down**, so the vault never gives away a wei.
    function previewDeposit(uint256 assets) public view returns (uint256) {
        return _toShares(assets, false);
    }

    /// Assets needed to mint exactly `shares`: rounded **up**, against the caller.
    function previewMint(uint256 shares) public view returns (uint256) {
        return _toAssets(shares, true);
    }

    /// Shares burned to take out exactly `assets`: rounded **up**, against the caller.
    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return _toShares(assets, true);
    }

    /// Assets returned for burning `shares`: rounded **down**.
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return _toAssets(shares, false);
    }

    function maxWithdraw(address holder) external view returns (uint256) {
        return _toAssets(balanceOf[holder], false);
    }

    function _toShares(uint256 assets, bool roundUp) private view returns (uint256) {
        uint256 supply = totalSupply + 10 ** OFFSET;
        uint256 held = totalAssets() + 1;
        uint256 q = assets * supply / held;
        if (roundUp && q * held < assets * supply) q += 1;
        return q;
    }

    function _toAssets(uint256 shares, bool roundUp) private view returns (uint256) {
        uint256 supply = totalSupply + 10 ** OFFSET;
        uint256 held = totalAssets() + 1;
        uint256 q = shares * held / supply;
        if (roundUp && q * supply < shares * held) q += 1;
        return q;
    }

    /* ───────────────────────────── deposit / withdraw ────────────────────────── */

    /// Put `assets` in, receive shares. The shares are priced on what actually arrived, so a
    /// fee-on-transfer asset shortchanges nobody but the depositor.
    function deposit(uint256 assets, address receiver)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        uint256 before = totalAssets();
        _pullAsset(msg.sender, assets);
        uint256 received = totalAssets() - before;
        if (received == 0) revert ZeroAmount();

        // priced against the balance from BEFORE this transfer, or the deposit would price itself
        uint256 supply = totalSupply + 10 ** OFFSET;
        shares = received * supply / (before + 1);
        if (shares == 0) revert ZeroAmount();

        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, received, shares);
    }

    /// Burn `shares` and take the assets out. Effects first: the shares are gone before the
    /// token moves, so a callback cannot find stale state.
    function redeem(uint256 shares, address receiver, address shareOwner)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        assets = _toAssets(shares, false);
        if (assets == 0) revert ZeroAmount();

        _spendShares(shareOwner, shares);
        _burn(shareOwner, shares);

        // the log before the transfer too: a reentrant callback must not be able to reorder the
        // events an indexer reads, or interleave one of its own between the burn and this line
        emit Withdraw(msg.sender, receiver, shareOwner, assets, shares);
        _pushAsset(receiver, assets);
    }

    /// Take out exactly `assets`, burning as many shares as that costs (rounded up).
    function withdraw(uint256 assets, address receiver, address shareOwner)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        shares = _toShares(assets, true);
        if (shares == 0) revert ZeroAmount();

        _spendShares(shareOwner, shares);
        _burn(shareOwner, shares);

        emit Withdraw(msg.sender, receiver, shareOwner, assets, shares);
        _pushAsset(receiver, assets);
    }

    /* ───────────────────────────── shares plumbing ───────────────────────────── */

    function _spendShares(address from, uint256 shares) private {
        if (from != msg.sender) {
            uint256 allowed = allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                if (allowed < shares) revert InsufficientAllowance();
                unchecked {
                    allowance[from][msg.sender] = allowed - shares;
                }
            }
        }
    }

    function _mint(address to, uint256 shares) private {
        totalSupply += shares;
        balanceOf[to] += shares;
        emit Transfer(address(0), to, shares);
    }

    function _burn(address from, uint256 shares) private {
        uint256 bal = balanceOf[from];
        if (bal < shares) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - shares;
            totalSupply -= shares;
        }
        emit Transfer(from, address(0), shares);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        _spendShares(from, value);
        return _move(from, to, value);
    }

    function _move(address from, address to, uint256 value) private returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    /* ───────────────────────────── ERC-20 calls ──────────────────────────────── */

    /// Accepts tokens that return nothing (USDT on Ethereum) and refuses those that return false.
    function _check(bool ok, bytes memory data) private pure {
        if (!ok) revert TransferFailed();
        if (data.length != 0 && !abi.decode(data, (bool))) revert TransferFailed();
    }

    function _pullAsset(address from, uint256 amount) private {
        (bool ok, bytes memory data) = address(asset).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        _check(ok, data);
    }

    function _pushAsset(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(asset).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        _check(ok, data);
    }

    /* ───────────────────────────── admin ─────────────────────────────────────── */

    function setPaused(bool v) external onlyOwner {
        paused = v;
        emit PausedSet(v);
    }

    /// Step one of two: the new owner has to accept, so a mistyped address changes nothing.
    /// The zero address is allowed on purpose — it is how an offer is withdrawn, and it cannot
    /// make anyone the owner because acceptOwnership compares against msg.sender.
    function offerOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipOffered(to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        emit OwnershipAccepted(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}
