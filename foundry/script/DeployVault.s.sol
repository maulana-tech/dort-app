// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DortSafeVault, IERC20} from "../src/DortSafeVault.sol";
import {MockToken} from "../src/mocks/Mocks.sol";

/// Deploys DortSafeVault over an existing asset, or — on a local chain only — a mock asset and a
/// vault over it.
///
///   # over a real token (its decimals must match what you pass).
///   # pUSDT on Portaldot V3 is the asset the app offers: it is already live on the chain, the
///   # same token /swap trades, so one faucet of POT covers buying it and paying for the deposit.
///   export VAULT_ASSET=0xe0114Adc0a2072B602C645f5a07EeFA1eaDBDbc2
///   export VAULT_NAME="Dort pUSDT Vault"
///   export VAULT_SYMBOL=dpUSDT
///   export VAULT_DECIMALS=6
///   forge script script/DeployVault.s.sol --sig "run()" \
///     --rpc-url https://test-evm-rpc-v3.portaldot.dev --account dort --sender $ME --broadcast
///
///   # asset and vault together, for a local anvil
///   forge script script/DeployVault.s.sol --sig "withMock(string,uint8)" "USDC" 6 \
///     --rpc-url http://127.0.0.1:8545 --private-key $KEY --broadcast
///
/// `withMock` refuses to run on a chain that is not local: a mintable token nobody controls is
/// fine on anvil and nonsense anywhere else. script/vault-local-demo.sh runs anvil under the home
/// chain's own id so the app and the wallet agree on it, so it sets VAULT_ALLOW_MOCK=1 to say the
/// chain is a throwaway. Never set that against a chain whose state anyone else shares.
///
/// VAULTS in apps/frontend/src/features/vault/vault.ts already names the asset with
/// `vault: null`, meaning "not deployed yet". Paste the DortSafeVault address printed here into
/// that field and the page is live; nothing else there has to change.
contract DeployVault is Script {
    /// A vault over an asset that already exists.
    function run() external {
        address asset = vm.envAddress("VAULT_ASSET");
        string memory name = vm.envOr("VAULT_NAME", string("Dort Vault"));
        string memory symbol = vm.envOr("VAULT_SYMBOL", string("dVLT"));
        uint8 decimals = uint8(vm.envOr("VAULT_DECIMALS", uint256(18)));
        require(asset != address(0), "DeployVault: set VAULT_ASSET");

        vm.startBroadcast();
        DortSafeVault vault = new DortSafeVault(IERC20(asset), name, symbol, decimals);
        vm.stopBroadcast();

        console.log("chain id      ", block.chainid);
        console.log("asset         ", asset);
        console.log("DortSafeVault ", address(vault));
        console.log("share symbol  ", symbol);
    }

    /// A mock asset and a vault over it, for a local chain.
    function withMock(string memory symbol, uint8 decimals) external {
        require(_local(), "DeployVault: withMock is for a local chain only");

        vm.startBroadcast();
        MockToken asset = new MockToken(string.concat("Mock ", symbol), symbol, decimals);
        DortSafeVault vault = new DortSafeVault(
            IERC20(address(asset)), string.concat("Dort ", symbol, " Vault"), string.concat("d", symbol), decimals
        );
        vm.stopBroadcast();

        console.log("chain id      ", block.chainid);
        console.log("asset         ", address(asset));
        console.log("DortSafeVault ", address(vault));
        console.log("share symbol  ", string.concat("d", symbol));
    }

    /// Only a chain whose state nobody else shares may hold a token anyone can mint. anvil's own
    /// ids qualify outright; an anvil impersonating another chain's id has to say so.
    function _local() internal view returns (bool) {
        if (block.chainid == 31337 || block.chainid == 1337) return true;
        return vm.envOr("VAULT_ALLOW_MOCK", uint256(0)) == 1;
    }
}
