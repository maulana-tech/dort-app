// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PortalBridgeEscrow} from "../src/bridge/PortalBridgeEscrow.sol";
import {PortalBridgeMinter} from "../src/bridge/PortalBridgeMinter.sol";

/// Deploys one side of the Portaldot bridge. Run it once per chain, with the relayer address you
/// will give dort-relayer.mjs.
///
///   export BRIDGE_RELAYER=0x…           # the address that will carry messages
///   export BRIDGE_MAX=0                 # per-message cap, 0 = unlimited
///
///   # home chain (anything but Portaldot), e.g. Base Sepolia
///   forge script script/DeployBridge.s.sol --sig "home()" \
///     --rpc-url https://sepolia.base.org --private-key $KEY --broadcast
///
///   # Portaldot V3
///   forge script script/DeployBridge.s.sol --sig "portaldot()" \
///     --rpc-url https://test-evm-rpc-v3.portaldot.dev --private-key $KEY --broadcast
///
/// Each side refuses to be deployed on the wrong chain, so the escrow can never land on Portaldot
/// or the minter on the home chain. Addresses and transaction hashes end up in
/// broadcast/DeployBridge.s.sol/<chainid>/run-latest.json — that is what the submission needs.
contract DeployBridge is Script {
    uint256 constant PORTALDOT_V3 = 420420777;

    function _config() internal view returns (address relayer, uint256 cap) {
        relayer = vm.envAddress("BRIDGE_RELAYER");
        cap = vm.envOr("BRIDGE_MAX", uint256(0));
        require(relayer != address(0), "DeployBridge: set BRIDGE_RELAYER");
    }

    /// The escrow, on the chain that holds the real asset.
    function home() external {
        require(block.chainid != PORTALDOT_V3, "DeployBridge: the escrow does not belong on Portaldot");
        (address relayer, uint256 cap) = _config();

        vm.startBroadcast();
        PortalBridgeEscrow escrow = new PortalBridgeEscrow(relayer, cap);
        vm.stopBroadcast();

        console.log("chain id        ", block.chainid);
        console.log("PortalBridgeEscrow", address(escrow));
        console.log("relayer         ", relayer);
        console.log("maxPerTransfer  ", cap);
    }

    /// The minter, on Portaldot V3.
    function portaldot() external {
        require(block.chainid == PORTALDOT_V3, "DeployBridge: not Portaldot V3 (expected 420420777)");
        (address relayer, uint256 cap) = _config();

        vm.startBroadcast();
        PortalBridgeMinter minter = new PortalBridgeMinter(relayer, cap);
        vm.stopBroadcast();

        console.log("chain id        ", block.chainid);
        console.log("PortalBridgeMinter", address(minter));
        console.log("relayer         ", relayer);
        console.log("maxPerTransfer  ", cap);
    }
}
