// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WrappedToken} from "./WrappedToken.sol";

/// The Portaldot V3 side of the bridge: it mints a wrapped copy of an asset that
/// PortalBridgeEscrow holds on its home chain, and burns that copy to send value home.
///
/// Same trust model as the escrow — a **trusted relayer** carries messages, with no proof of the
/// remote chain. Everything this contract can enforce alone, it does: one mint per message id, a
/// wrapped token that only this contract can mint, a per-message cap, an owner pause, and a
/// relayer that may move value but never change roles.
///
/// Supply is the thing to watch: `wrapped[srcToken].totalSupply()` must equal the escrow's
/// `locked(srcToken)` whenever no message is in flight. That is the bridge's one real invariant,
/// and test/bridge/PortalBridgeCrossFork.t.sol asserts it across live forks of both chains.
contract PortalBridgeMinter {
    address public owner;
    address public relayer;
    bool public paused;
    uint256 public nonce;
    uint256 public maxPerTransfer;

    /// home-chain token => its wrapped copy here
    mapping(address => WrappedToken) public wrapped;
    /// message id => already handled (mints and burns share the space; ids differ by direction)
    mapping(bytes32 => bool) public processed;

    event Minted(
        bytes32 indexed id, address indexed srcToken, address indexed recipient, address wrappedToken, uint256 amount
    );
    event Burned(
        bytes32 indexed id,
        address indexed srcToken,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint256 dstChainId,
        uint256 nonce
    );
    event WrappedCreated(address indexed srcToken, address indexed wrappedToken, string symbol);
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
    error UnknownToken();

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

    /// Same formula as the escrow's, so both sides and the relayer derive the id independently.
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

    /// Mint the wrapped copy of a lock that happened on the home chain. The wrapped token is
    /// created on first use and is bound to this contract for ever.
    function mint(
        bytes32 id,
        address srcToken,
        uint256 srcChainId,
        address recipient,
        uint256 amount,
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external onlyRelayer whenNotPaused returns (address token) {
        if (processed[id]) revert AlreadyProcessed();
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0) || srcToken == address(0)) revert ZeroAddress();
        if (maxPerTransfer != 0 && amount > maxPerTransfer) revert OverCap();

        processed[id] = true;

        WrappedToken w = wrapped[srcToken];
        if (address(w) == address(0)) {
            w = new WrappedToken(name, symbol, decimals, srcToken, srcChainId);
            wrapped[srcToken] = w;
            emit WrappedCreated(srcToken, address(w), symbol);
        }
        w.mint(recipient, amount);
        emit Minted(id, srcToken, recipient, address(w), amount);
        return address(w);
    }

    /// Burn the wrapped copy to send the asset home. The relayer picks the event up and calls
    /// `release` on the escrow with the id emitted here.
    function burn(address srcToken, uint256 amount, uint256 dstChainId, address recipient)
        external
        whenNotPaused
        returns (bytes32 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (maxPerTransfer != 0 && amount > maxPerTransfer) revert OverCap();
        WrappedToken w = wrapped[srcToken];
        if (address(w) == address(0)) revert UnknownToken();

        // burn first: the event the relayer trusts is only emitted once the supply is gone
        w.burn(msg.sender, amount);

        id = messageId(block.chainid, dstChainId, nonce, srcToken, recipient, amount);
        emit Burned(id, srcToken, msg.sender, recipient, amount, dstChainId, nonce);
        unchecked {
            ++nonce;
        }
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
