#!/usr/bin/env bash
# The whole bridge, end to end, on two local chains — no testnet, no funds, no key of yours.
#
#   bash script/bridge-local-demo.sh
#
# It starts two anvil chains (84532 as the home chain, 420420777 standing in for Portaldot V3),
# deploys both sides, locks 250 USDC at home, lets dort-relayer.mjs mint the wrapped copy, burns
# 100 back and releases it, then runs the relayer once more to show a repeat is a no-op.
# Every account and key below is anvil's own well-known test key: never use it anywhere real.
#
# For the same round trip against the LIVE Portaldot and Base Sepolia chains (still no funds),
# run: forge test --mc PortalBridgeCrossForkTest -vvv

set -e
export PATH="$PATH:/Users/lana/.foundry/bin"
cd /Users/lana/Desktop/dort-app/foundry
K=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
H=http://127.0.0.1:8545; P=http://127.0.0.1:8546
pkill -f "anvil --port 854" 2>/dev/null || true; sleep 1
(anvil --port 8545 --chain-id 84532 --silent >/dev/null 2>&1 &)
(anvil --port 8546 --chain-id 420420777 --silent >/dev/null 2>&1 &)
sleep 3
forge build >/dev/null 2>&1
grab(){ python3 -c "import re,sys;m=re.findall(r'\"deployedTo\":\s*\"(0x[0-9a-fA-F]{40})\"',sys.stdin.read());print(m[-1] if m else '')"; }
USDC=$(forge create src/mocks/Mocks.sol:MockUSDC --rpc-url $H --private-key $K --broadcast --json | grab)
ESCROW=$(forge create src/bridge/PortalBridgeEscrow.sol:PortalBridgeEscrow --rpc-url $H --private-key $K --broadcast --json --constructor-args $A 0 | grab)
MINTER=$(forge create src/bridge/PortalBridgeMinter.sol:PortalBridgeMinter --rpc-url $P --private-key $K --broadcast --json --constructor-args $A 0 | grab)
echo "USDC=$USDC"; echo "ESCROW=$ESCROW"; echo "MINTER=$MINTER"
[ -n "$USDC" ] && [ -n "$ESCROW" ] && [ -n "$MINTER" ] || { echo "deploy gagal"; exit 1; }
cast send $USDC "mint(address,uint256)" $A 1000000000 --rpc-url $H --private-key $K >/dev/null
cast send $USDC "approve(address,uint256)" $ESCROW 1000000000 --rpc-url $H --private-key $K >/dev/null
cast send $ESCROW "lock(address,uint256,uint256,address)" $USDC 250000000 420420777 $A --rpc-url $H --private-key $K >/dev/null
echo "terkunci di home   : $(cast call $ESCROW 'locked(address)(uint256)' $USDC --rpc-url $H)"
cat > /tmp/bridge.json <<JSON
{ "home": { "rpc": "$H", "chainId": 84532, "contract": "$ESCROW", "fromBlock": 0 },
  "portaldot": { "rpc": "$P", "chainId": 420420777, "contract": "$MINTER", "fromBlock": 0 },
  "token": { "address": "$USDC", "name": "Wrapped Mock USDC", "symbol": "wUSDC", "decimals": 6 } }
JSON
echo "--- relayer: dry run ---"
node dort-relayer.mjs --config /tmp/bridge.json --once
echo "--- relayer: kirim ---"
DORT_RELAYER_KEY=$K node dort-relayer.mjs --config /tmp/bridge.json --once --send
W=$(cast call $MINTER "wrapped(address)(address)" $USDC --rpc-url $P)
echo "token wrapped      : $W"
echo "saldo wrapped alice: $(cast call $W 'balanceOf(address)(uint256)' $A --rpc-url $P)"
echo "--- arah balik: burn 100 di Portaldot ---"
cast send $MINTER "burn(address,uint256,uint256,address)" $USDC 100000000 84532 $A --rpc-url $P --private-key $K >/dev/null
DORT_RELAYER_KEY=$K node dort-relayer.mjs --config /tmp/bridge.json --once --send
echo "USDC alice di home : $(cast call $USDC 'balanceOf(address)(uint256)' $A --rpc-url $H)"
echo "sisa terkunci      : $(cast call $ESCROW 'locked(address)(uint256)' $USDC --rpc-url $H)"
echo "supply wrapped     : $(cast call $W 'totalSupply()(uint256)' --rpc-url $P)"
echo "--- jalan ulang: harus no-op ---"
DORT_RELAYER_KEY=$K node dort-relayer.mjs --config /tmp/bridge.json --once --send
pkill -f "anvil --port 854" 2>/dev/null || true
