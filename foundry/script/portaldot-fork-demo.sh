#!/usr/bin/env bash
# Portaldot V3, forked locally — the real DEX and the real pools, without a faucet.
#
#   bash script/portaldot-fork-demo.sh [0xyour-address]
#
# Why this exists. Portaldot has no official faucet; the one community faucet is down for hours
# at a time, and Discord is not an SLA. Without POT the Swap page reads a balance of 0, disables
# itself, and a receipt wait never returns — the feature looks broken for a reason that has
# nothing to do with its code.
#
# anvil can fork the chain because Portaldot's eth-rpc serves ordinary EVM bytecode (checked: the
# router's code begins 6080604052, not a PolkaVM blob), so revm executes the real contracts. What
# you get is the genuine PortalSwapRouter, the genuine factory, and the pools at the reserves they
# held the moment the fork started. Only the funds are local, and the chain id stays 420420777 —
# the same one LOCAL_RPC in features/bridge/chains.ts maps to this port, so the app's own
# "Use a local fork" switch finds it with no configuration.
#
# It cannot stand in for a submission that requires a public deploy: nothing here is on the
# public chain, and the script says so rather than letting a receipt imply otherwise.
#
# Every key below is anvil's own well-known test key: never use it anywhere real. The bridge demo
# uses this port for a bare 420420777 — run one demo at a time.

set -e
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/.."

UP=https://test-evm-rpc-v3.portaldot.dev
R=http://127.0.0.1:8546
K=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ROUTER=0xc17510Df29ae5E4C6C2A46CCB03197edd0963f2B
FACTORY=0xC631805C297c4233B33c30aF91245058902C1D18
WPOT=0xf67cE92096E4E171060B71bF0cca0DA9f9548c03
USDT=0xe0114Adc0a2072B602C645f5a07EeFA1eaDBDbc2
MINE="${1:-}"

# DORT_FORK_BLOCK pins the fork to one block, so every rehearsal of a demo sees the same
# reserves and therefore the same quote. Without it the fork follows the chain's head and the
# numbers move between takes.
PIN=""
if [ -n "${DORT_FORK_BLOCK:-}" ]; then PIN="--fork-block-number $DORT_FORK_BLOCK"; fi

pkill -f "anvil --port 8546" 2>/dev/null || true; sleep 1
echo "--- memfork Portaldot V3 dari $UP ${PIN:+(dipaku di blok $DORT_FORK_BLOCK)} ---"
(anvil --port 8546 --fork-url "$UP" $PIN --silent >/dev/null 2>&1 &)

for i in $(seq 1 40); do
  ID=$(cast chain-id --rpc-url $R 2>/dev/null || true)
  # `[ -n "$ID" ] && break` would be the obvious line here and is a trap: with the fork still
  # coming up the test fails, the && list returns non-zero, and `set -e` kills the script on the
  # first iteration instead of waiting.
  if [ -n "$ID" ]; then break; fi
  sleep 1
done
[ "$ID" = "420420777" ] || { echo "fork gagal: chain id '$ID', bukan 420420777"; exit 1; }
echo "chain $ID, block $(cast block-number --rpc-url $R) — kontraknya yang asli, dananya lokal"

# The router answering its own getters is the proof the fork executes real code, not that the
# addresses merely exist: both of these are returned by the live bytecode, not read from storage.
echo
echo "--- router menjawab tentang dirinya sendiri ---"
echo "WPOT()    : $(cast call $ROUTER 'WPOT()(address)' --rpc-url $R)"
echo "factory() : $(cast call $ROUTER 'factory()(address)' --rpc-url $R)"

PAIR=$(cast call $FACTORY "getPair(address,address)(address)" $WPOT $USDT --rpc-url $R)
echo "pool POT/pUSDT: $PAIR"
echo "reserve       : $(cast call $PAIR 'getReserves()(uint112,uint112,uint32)' --rpc-url $R | tr '\n' ' ')"

echo
echo "--- swap 1 POT -> pUSDT lewat PortalSwapRouter yang sungguhan ---"
OUT=$(cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" \
  1000000000000000000 "[$WPOT,$USDT]" --rpc-url $R | tr -d '[]' | awk -F', ' '{print $2}' | awk '{print $1}')
echo "quote router  : $OUT (pUSDT, 6 desimal)"
BEFORE=$(cast call $USDT "balanceOf(address)(uint256)" $A --rpc-url $R | awk '{print $1}')
cast send $ROUTER "swapExactPOTForTokens(uint256,address[],address,uint256)" \
  $((OUT * 99 / 100)) "[$WPOT,$USDT]" $A $(( $(date +%s) + 3600 )) \
  --value 1ether --private-key $K --rpc-url $R >/dev/null
AFTER=$(cast call $USDT "balanceOf(address)(uint256)" $A --rpc-url $R | awk '{print $1}')
echo "pUSDT diterima: $((AFTER - BEFORE))  (sebelum $BEFORE, sesudah $AFTER)"

# A genuine Portaldot deploy writes to the same broadcast/ path this run is about to use. Park it
# first: this fork's receipts are not a record of anything public and must not replace one.
KEEP=""
if [ -d broadcast/DeployPortaldot.s.sol/420420777 ]; then
  KEEP="$(mktemp -d)/420420777"
  mkdir -p "$(dirname "$KEEP")"
  mv broadcast/DeployPortaldot.s.sol/420420777 "$KEEP"
  echo
  echo "catatan deploy sungguhan dititipkan sementara"
fi

echo
echo "--- DeployPortaldot.s.sol di atas fork (butuh chain 420420777, dan fork ini memenuhinya) ---"
forge script script/DeployPortaldot.s.sol --rpc-url $R --private-key $K --broadcast 2>&1 \
  | grep -E "vault|asset|shares minted|ONCHAIN EXECUTION" || true

rm -rf broadcast/DeployPortaldot.s.sol/420420777
if [ -d "$KEEP" ]; then
  mkdir -p broadcast/DeployPortaldot.s.sol
  mv "$KEEP" broadcast/DeployPortaldot.s.sol/420420777
  echo "catatan deploy sungguhan dikembalikan"
fi

if [ -n "$MINE" ]; then
  cast rpc anvil_setBalance "$MINE" 0x56BC75E2D63100000 --rpc-url $R >/dev/null
  # pUSDT too, so the page can be demonstrated in both directions — and the other direction is
  # the one that shows the approve step, which native POT never needs. It is bought through the
  # pool rather than conjured, so it moves the price a little: that is why the reserves are
  # printed again below, and why DORT_FORK_BLOCK exists for a take you want repeatable.
  cast send $ROUTER "swapExactPOTForTokens(uint256,address[],address,uint256)" \
    0 "[$WPOT,$USDT]" $A $(( $(date +%s) + 3600 )) \
    --value 2ether --private-key $K --rpc-url $R >/dev/null
  GOT=$(cast call $USDT "balanceOf(address)(uint256)" $A --rpc-url $R | awk '{print $1}')
  cast send $USDT "transfer(address,uint256)" "$MINE" "$GOT" \
    --private-key $K --rpc-url $R >/dev/null
  echo
  echo "$MINE di fork ini:"
  echo "  POT   : $(cast balance "$MINE" --rpc-url $R | cast from-wei)"
  echo "  pUSDT : $(cast call $USDT 'balanceOf(address)(uint256)' "$MINE" --rpc-url $R | awk '{print $1}') (6 desimal)"
  echo "reserve pool setelah pembelian itu: $(cast call $PAIR 'getReserves()(uint112,uint112,uint32)' --rpc-url $R | tr '\n' ' ')"
fi

cat <<EOF

anvil masih jalan di $R.

Untuk demo, DUA sisi harus menunjuk ke fork ini — halaman DAN wallet:

  1. di wallet: Portaldot V3 kemungkinan sudah ada di sana dengan RPC publik. JANGAN
     menambahkan jaringan baru — chain id 420420777 akan bentrok dan wallet menolak atau
     diam-diam memakai yang lama. Edit jaringan Portaldot yang sudah ada dan ganti RPC-nya
     ke $R (MetaMask baru bisa menyimpan beberapa RPC per chain; pilih yang localhost).
  2. buka http://localhost:3000/swap dan tekan "Use a local fork".

Kalau hanya satu sisi yang dipindah, halaman itu akan memberitahu: saldo dari dua node berbeda
tidak sama, dan peringatannya muncul sebelum ada yang ditandatangani.

Untuk take yang bisa diulang dengan angka identik, paku bloknya:

  DORT_FORK_BLOCK=$(cast block-number --rpc-url $R) bash script/portaldot-fork-demo.sh 0x...

Tidak ada apa pun di sini yang berada di chain publik. Kalau submission mewajibkan deploy
publik, fork ini bukan penggantinya.

matikan dengan: pkill -f 'anvil --port 8546'
EOF
