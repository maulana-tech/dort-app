// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// The home-chain side of the Portaldot bridge: it holds the real asset while a wrapped copy
/// circulates on Portaldot V3.
///
/// TRUST MODEL — read this before using it for anything that matters. Messages cross by a
/// **trusted relayer**: an address the owner appoints, which watches one chain and calls the
/// other. There is no light client and no proof of the remote state, so a compromised relayer key
/// can release everything this contract holds. That is a deliberate testnet-scope choice. What the
/// contract *can* enforce on its own is enforced here:
///
/// - every message is released at most once (`processed`)
/// - a release can never pay out more of a token than is locked for it (`locked`)
/// - transfers are capped per message (`maxPerTransfer`) and the owner can `pause()` instantly
/// - the relayer may only move value, never change roles, caps or the pause
///
/// The invariant that ties the two chains together is `locked(token) == wrapped.totalSupply()`
/// once no message is in flight; test/bridge/PortalBridgeCrossFork.t.sol checks it across real
/// forks of both chains.
contract PortalBridgeEscrow {
    address public owner;
    address public relayer;
    bool public paused;
    uint256 public nonce;
    /// Largest amount a single lock may carry; 0 means unlimited.
    uint256 public maxPerTransfer;

    /// token => amount this contract holds on behalf of the other chain
    mapping(address => uint256) public locked;
    /// message id => already handled
    mapping(bytes32 => bool) public processed;

    event Locked(
        bytes32 indexed id,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint256 dstChainId,
        uint256 nonce
    );
    event Released(bytes32 indexed id, address indexed token, address indexed recipient, uint256 amount);
    event RelayerChanged(address indexed from, address indexed to);
    event OwnerChanged(address indexed from, address indexed to);
    event PausedSet(bool paused);
    event MaxPerTransferSet(uint256 amount);

    error OnlyOwner();
    error OnlyRelayer();
    error Paused();
    error ZeroAmount();
    error ZeroAddress();
    error OverCap();
    error AlreadyProcessed();
    error NotLocked();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(address _relayer, uint256 _maxPerTransfer) {
        if (_relayer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        relayer = _relayer;
        maxPerTransfer = _maxPerTransfer;
    }

    /// The id both chains agree on for one transfer. Pure, so the relayer and either side can
    /// recompute it and never has to trust the number it was handed.
    function messageId(
        uint256 srcChainId,
        uint256 dstChainId,
        uint256 n,
        address token,
        address recipient,
        uint256 amount
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(srcChainId, dstChainId, n, token, recipient, amount));
    }

    /// Lock `amount` of `token` here; the relayer mints the wrapped copy to `recipient` on
    /// `dstChainId`. The asset stays in this contract until a release for the same id comes back.
    function lock(address token, uint256 amount, uint256 dstChainId, address recipient)
        external
        whenNotPaused
        returns (bytes32 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0) || token == address(0)) revert ZeroAddress();
        if (maxPerTransfer != 0 && amount > maxPerTransfer) revert OverCap();

        // balance delta, so a fee-on-transfer token can never credit more than actually arrived
        uint256 before = IERC20(token).balanceOf(address(this));
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        id = messageId(block.chainid, dstChainId, nonce, token, recipient, received);
        locked[token] += received;
        emit Locked(id, token, msg.sender, recipient, received, dstChainId, nonce);
        unchecked {
            ++nonce;
        }
    }

    /// Pay out a transfer coming back from Portaldot, after the wrapped copy was burned there.
    /// `id` is recomputed by the caller of the other side and checked against `processed` here.
    function release(bytes32 id, address token, address recipient, uint256 amount)
        external
        onlyRelayer
        whenNotPaused
    {
        if (processed[id]) revert AlreadyProcessed();
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (locked[token] < amount) revert NotLocked();

        processed[id] = true;
        unchecked {
            locked[token] -= amount;
        }
        if (!IERC20(token).transfer(recipient, amount)) revert TransferFailed();
        emit Released(id, token, recipient, amount);
    }

    function setRelayer(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit RelayerChanged(relayer, to);
        relayer = to;
    }

    function setOwner(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, to);
        owner = to;
    }

    function setPaused(bool v) external onlyOwner {
        paused = v;
        emit PausedSet(v);
    }

    function setMaxPerTransfer(uint256 v) external onlyOwner {
        maxPerTransfer = v;
        emit MaxPerTransferSet(v);
    }
}
