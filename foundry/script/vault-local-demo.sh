#!/usr/bin/env bash
# DortSafeVault end to end on one local chain — no testnet, no funds, no key of yours.
#
#   bash script/vault-local-demo.sh
#
# It starts one anvil under Base Sepolia's chain id (84532, so the app's "local demo" switch and
# your wallet agree on which chain this is), deploys two mock assets and a vault over each, then
# deposits, checks the share price, withdraws an exact amount, and redeems the rest to nothing.
# It also shows the two attacks the vault refuses: a donation to an empty vault, and a withdraw
# of more than a holding is worth.
#
# Every account and key below is anvil's own well-known test key: never use it anywhere real.
# The addresses it deploys are anvil's deterministic ones for nonces 0-3, which is what
# LOCAL_VAULTS in apps/frontend/src/features/vault/vault.ts expects. Run it on a fresh anvil —
# bridge-local-demo.sh uses the same port, so run one demo at a time.

set -e
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/.."
K=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
R=http://127.0.0.1:8545

# a genuine Base Sepolia deploy writes to the same broadcast/ path this demo is about to use;
# park it somewhere safe for the duration rather than letting the demo overwrite it
KEEP=""
if [ -d broadcast/DeployVault.s.sol/84532 ] && \
   find broadcast/DeployVault.s.sol/84532 -maxdepth 1 -name 'run-latest.json' | grep -q .; then
  KEEP="$(mktemp -d)/84532"
  mkdir -p "$(dirname "$KEEP")"
  mv broadcast/DeployVault.s.sol/84532 "$KEEP"
  echo "catatan deploy sungguhan diamankan sementara ke $KEEP"
fi

pkill -f "anvil --port 8545" 2>/dev/null || true; sleep 1
(anvil --port 8545 --chain-id 84532 --silent >/dev/null 2>&1 &)
sleep 3
forge build >/dev/null 2>&1

# the deploys, in the order vault.ts documents: asset, vault, asset, vault
export VAULT_ALLOW_MOCK=1
grab(){ python3 -c "import re,sys;print('\n'.join(re.findall(r'(?:asset|DortSafeVault)\s+(0x[0-9a-fA-F]{40})',sys.stdin.read())))"; }
OUT1=$(forge script script/DeployVault.s.sol --sig 'withMock(string,uint8)' "USDC" 6 \
  --rpc-url $R --private-key $K --broadcast 2>&1 | grab)
OUT2=$(forge script script/DeployVault.s.sol --sig 'withMock(string,uint8)' "USDT" 6 \
  --rpc-url $R --private-key $K --broadcast 2>&1 | grab)
USDC=$(echo "$OUT1" | sed -n 1p); VUSDC=$(echo "$OUT1" | sed -n 2p)
USDT=$(echo "$OUT2" | sed -n 1p); VUSDT=$(echo "$OUT2" | sed -n 2p)
echo "USDC=$USDC  vault=$VUSDC"
echo "USDT=$USDT  vault=$VUSDT"
[ -n "$VUSDC" ] && [ -n "$VUSDT" ] || { echo "deploy gagal"; exit 1; }
cat <<EXPECT
--- what vault.ts expects (LOCAL_VAULTS) ---
  USDC asset 0x5FbDB2315678afecb367f032d93F642f64180aa3  vault 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  USDT asset 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0  vault 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
EXPECT

# cast pretties large numbers as "4e11 [4.0e11]"; the first field is the one arithmetic can use
num(){ awk '{print $1}'; }
bal(){ cast call "$1" 'balanceOf(address)(uint256)' "$2" --rpc-url $R | num; }
val(){ cast call "$1" 'maxWithdraw(address)(uint256)' "$2" --rpc-url $R | num; }
tot(){ cast call "$1" 'totalAssets()(uint256)' --rpc-url $R | num; }
send(){ cast send "$@" --rpc-url $R --private-key $K >/dev/null; }

# alice gets 1000 of each, and lets both vaults pull
for T in $USDC $USDT; do
  send "$T" "mint(address,uint256)" $A 1000000000
done
send $USDC "approve(address,uint256)" $VUSDC 1000000000
send $USDT "approve(address,uint256)" $VUSDT 1000000000

echo "--- setoran 400 USDC ---"
send $VUSDC "deposit(uint256,address)" 400000000 $A
echo "shares             : $(bal $VUSDC $A)"
echo "total assets       : $(tot $VUSDC)"
echo "nilai shares alice : $(val $VUSDC $A)"

echo "--- hadiah 40 USDC ke vault: harga share naik untuk semua pemegang ---"
send $USDC "transfer(address,uint256)" $VUSDC 40000000
echo "nilai shares alice : $(val $VUSDC $A)"

echo "--- tarik tepat 100 USDC (withdraw) ---"
send $VUSDC "withdraw(uint256,address,address)" 100000000 $A $A
echo "USDC alice         : $(bal $USDC $A)"
echo "sisa nilai         : $(val $VUSDC $A)"

echo "--- tarik lebih dari haknya: harus ditolak ---"
cast send $VUSDC "withdraw(uint256,address,address)" 999000000 $A $A \
  --rpc-url $R --private-key $K >/dev/null 2>&1 \
  && echo "GAGAL: vault membiarkannya" && exit 1
echo "ditolak (InsufficientBalance), seperti seharusnya"

echo "--- keluar sepenuhnya: redeem semua share ---"
S=$(bal $VUSDC $A)
send $VUSDC "redeem(uint256,address,address)" "$S" $A $A
echo "shares sisa        : $(bal $VUSDC $A)"
echo "total assets sisa  : $(tot $VUSDC)  (debu pembulatan, milik vault)"
echo "USDC alice         : $(bal $USDC $A)"

echo "--- serangan penyetor pertama di vault USDT yang masih kosong ---"
send $VUSDT "deposit(uint256,address)" 1 $A              # 1 wei
send $USDT "transfer(address,uint256)" $VUSDT 500000000  # donasi 500
send $USDT "mint(address,uint256)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 1000000000
cast send $USDT "approve(address,uint256)" $VUSDT 1000000000 --rpc-url $R \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d >/dev/null
cast send $VUSDT "deposit(uint256,address)" 100000000 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --rpc-url $R --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d >/dev/null
echo "share korban       : $(bal $VUSDT 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)  (bukan nol: offset virtual)"
echo "nilai korban       : $(val $VUSDT 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)  (dari 100000000)"

# This anvil only pretends to be 84532, so its receipts are not a record of a real deploy and must
# not be left behind. The first version of this deleted the whole 84532 directory, which did the
# opposite of what its comment claimed: run after a genuine Base Sepolia deploy, it destroyed that
# deploy's record. So move a pre-existing record aside first and put it back afterwards; only what
# this run itself wrote is removed.
if [ -d broadcast/DeployVault.s.sol/84532 ]; then
  rm -rf broadcast/DeployVault.s.sol/84532
fi
if [ -d "$KEEP" ]; then
  mkdir -p broadcast/DeployVault.s.sol
  mv "$KEEP" broadcast/DeployVault.s.sol/84532
  echo "catatan deploy sungguhan dikembalikan ke broadcast/DeployVault.s.sol/84532"
fi

echo
echo "anvil masih jalan di $R — buka http://localhost:3000/vault, tekan \"Use the local demo\"."
echo "matikan dengan: pkill -f 'anvil --port 8545'"
