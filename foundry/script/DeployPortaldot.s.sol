// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DortVault, IERC20, IOracle, IStrategy, IUniswapV2Router02} from "../src/DortVault.sol";
import {MockUSDC, MockOracle, MockStrategy, MockUniswapRouter} from "../src/mocks/Mocks.sol";

/// Deploys the sample DortVault on Portaldot V3 testnet (chain 420420777), so a run exported from
/// that fork points at a contract that really exists there.
///
///   export PORTALDOT_PK=0x…            # a testnet key, funded with POT
///   forge script script/DeployPortaldot.s.sol \
///     --rpc-url https://test-evm-rpc-v3.portaldot.dev \
///     --private-key $PORTALDOT_PK --broadcast
///
/// It refuses to run on any other chain, so a mainnet RPC cannot be deployed to by mistake. The
/// addresses and transaction hashes land in broadcast/DeployPortaldot.s.sol/420420777/run-latest.json.
///
/// The vault's asset is the mock USDC rather than a live Portaldot token, because the vault mints
/// and burns its own asset in harvestRewards; the live tokens (WPOT, pUSDT) are what
/// test/Portaldot.t.sol reads, and they stay untouched.
contract DeployPortaldot is Script {
    uint256 constant PORTALDOT_V3 = 420420777;

    function run() external {
        require(
            block.chainid == PORTALDOT_V3,
            "DeployPortaldot: not Portaldot V3 (expected chain 420420777)"
        );

        vm.startBroadcast();

        MockUSDC asset = new MockUSDC();
        MockOracle oracle = new MockOracle();
        MockStrategy strategy = new MockStrategy();
        MockUniswapRouter router = new MockUniswapRouter();
        MockUSDC reward = new MockUSDC();

        DortVault vault = new DortVault(
            IERC20(address(asset)),
            IOracle(address(oracle)),
            IStrategy(address(strategy)),
            msg.sender, // keeper
            IUniswapV2Router02(address(router)),
            IERC20(address(reward))
        );

        // one real deposit, so the chain holds an interaction and not only deployed bytecode
        asset.mint(msg.sender, 1_000_000);
        asset.approve(address(vault), 1_000_000);
        vault.deposit(1_000_000);

        vm.stopBroadcast();

        console.log("chain id      ", block.chainid);
        console.log("DortVault     ", address(vault));
        console.log("asset  (USDC) ", address(asset));
        console.log("oracle        ", address(oracle));
        console.log("strategy      ", address(strategy));
        console.log("router        ", address(router));
        console.log("rewardToken   ", address(reward));
        console.log("depositor     ", msg.sender);
        console.log("shares minted ", vault.shares(msg.sender));
    }
}
