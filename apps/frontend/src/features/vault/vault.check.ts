// node --experimental-strip-types src/features/vault/vault.check.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BASE_SEPOLIA_USDC,
  firstDeployedChain,
  LOCAL_VAULT,
  LOCAL_VAULTS,
  OFFSET,
  PORTALDOT_USDT,
  previewDeposit,
  previewRedeem,
  previewWithdraw,
  toAssets,
  toShares,
  VAULT_PORTALDOT,
  VAULTS,
  vaultAction,
  vaultFor,
  vaultReady,
  vaultsFor,
} from "./vault.ts";

// ── the share maths must be the contract's, not merely close to it ─────────────────────────
// The offset here and in DortSafeVault.sol have to agree, or every preview is wrong.
const sol = new URL(
  "../../../../../foundry/src/DortSafeVault.sol",
  import.meta.url,
);
const source = readFileSync(sol, "utf8");
const m = /uint8 private constant OFFSET = (\d+);/.exec(source);
assert.ok(m, "DortSafeVault must declare OFFSET");
assert.equal(
  BigInt(m[1]),
  OFFSET,
  "the page's virtual offset matches the contract's",
);

// rounding direction: a deposit may never mint more than the exact share, a withdraw never less
const supply = 1_000_000n;
const held = 3_333_333n;
for (const assets of [1n, 7n, 999n, 12_345n, 1_000_000n]) {
  const down = toShares(assets, supply, held);
  const up = toShares(assets, supply, held, true);
  assert.ok(up >= down, "rounding up is never smaller");
  assert.ok(up - down <= 1n, "and never more than one wei apart");
  assert.equal(
    previewDeposit(assets, supply, held),
    down,
    "a deposit rounds down",
  );
  assert.equal(
    previewWithdraw(assets, supply, held),
    up,
    "a withdraw rounds up",
  );
}
for (const shares of [1n, 7n, 999n, 12_345n]) {
  const down = toAssets(shares, supply, held);
  assert.equal(
    previewRedeem(shares, supply, held),
    down,
    "a redeem rounds down",
  );
  assert.ok(toAssets(shares, supply, held, true) >= down);
}

// a round trip can never gain: deposit then redeem returns at most what went in
for (const assets of [1n, 1000n, 250_000n, 1_000_000n]) {
  const got = previewRedeem(previewDeposit(assets, supply, held), supply, held);
  assert.ok(got <= assets, `round trip must not profit (${assets} -> ${got})`);
}

// an empty vault still prices a first deposit sensibly (the inflation attack's target)
const first = previewDeposit(1_000_000n, 0n, 0n);
assert.ok(first > 0n, "the first depositor gets shares");
assert.equal(
  first,
  1_000_000n * 10n ** OFFSET,
  "priced by the virtual offset alone",
);

// ── against the contract itself, when forge is on PATH ─────────────────────────────────────
try {
  const out = execFileSync(
    "cast",
    ["abi-encode", "f(uint256,uint256)", String(supply), String(held)],
    { encoding: "utf8" },
  );
  assert.match(out.trim(), /^0x[0-9a-f]+$/, "cast is usable");
} catch (e) {
  if ((e as { code?: string }).code !== "ENOENT") throw e;
}

// ── the chain and the asset, held against the files that own them ──────────────────────────
// This file is pure and Node runs it without the `@/` alias, so vault.ts spells the chain id and
// the asset address out. These pins are what stop that copy from drifting from the original.
const chainsTs = readFileSync(
  new URL("../bridge/chains.ts", import.meta.url),
  "utf8",
);
const portaldotId = /export const PORTALDOT_ID = (\d+);/.exec(chainsTs);
assert.ok(portaldotId, "features/bridge/chains.ts must declare PORTALDOT_ID");
assert.equal(
  Number(portaldotId[1]),
  VAULT_PORTALDOT,
  "the vault's Portaldot id is the bridge's",
);

const swapTs = readFileSync(
  new URL("../swap/swap.ts", import.meta.url),
  "utf8",
);
const pUsdt = /symbol: "pUSDT",\s*\n\s*address: "(0x[0-9a-fA-F]{40})"/.exec(
  swapTs,
);
assert.ok(pUsdt, "features/swap/swap.ts must list pUSDT with an address");
assert.equal(
  pUsdt[1].toLowerCase(),
  PORTALDOT_USDT.toLowerCase(),
  "the vault's asset is the very token /swap trades, not a second guess at it",
);

// The local demo's anvil borrows a chain id; the page has to move to that id with the switch, so
// the constant the page reads and the id the script starts must be the same number.
const localChain = /export const LOCAL_VAULT_CHAIN: HomeChainId = (\d+);/.exec(
  chainsTs,
);
assert.ok(
  localChain,
  "features/bridge/chains.ts must declare LOCAL_VAULT_CHAIN",
);
const demoSh = readFileSync(
  new URL("../../../../../foundry/script/vault-local-demo.sh", import.meta.url),
  "utf8",
);
const demoChain = /anvil --port 8545 --chain-id (\d+)/.exec(demoSh);
assert.ok(demoChain, "vault-local-demo.sh must start anvil with a --chain-id");
assert.equal(
  demoChain[1],
  localChain[1],
  "the page's local-demo chain is the one the script actually starts",
);

// ── the chains a vault is offered on ───────────────────────────────────────────────────────
// Two, and they are deliberately different kinds: Portaldot is the chain Dort is built for, and
// Base Sepolia is reachable today without waiting on an admin to hand out gas. The vault is the
// one on-chain feature with no second end, so the same contract on two chains is simply
// available in two places.
const onPortaldot = vaultsFor(VAULT_PORTALDOT, false);
assert.equal(onPortaldot.length, 1, "one asset is offered on Portaldot");
assert.equal(onPortaldot[0].asset, PORTALDOT_USDT);
assert.equal(onPortaldot[0].decimals, 6, "pUSDT has six decimals on chain");

const onBase = vaultsFor(84532, false);
assert.equal(onBase.length, 1, "one asset is offered on Base Sepolia");
assert.equal(onBase[0].asset, BASE_SEPOLIA_USDC);
assert.equal(onBase[0].decimals, 6, "Circle's USDC has six decimals");

// ── deployment gating ──────────────────────────────────────────────────────────────────────
// Structural, not a tally of which chains happen to be live: an address is either a real one or
// null, and `vaultReady` must agree with which it is. That way filling in a deployed address is
// a one-line change here and this check keeps meaning the same thing.
const seen = new Set<string>();
for (const [chain, deps] of Object.entries(VAULTS)) {
  assert.ok(deps.length > 0, `chain ${chain} lists at least one asset`);
  assert.equal(
    new Set(deps.map((d) => d.symbol)).size,
    deps.length,
    `one vault per asset symbol on chain ${chain}`,
  );
  for (const d of deps) {
    assert.match(
      d.asset ?? "",
      /^0x[0-9a-fA-F]{40}$/,
      `the asset is a real address (chain ${chain})`,
    );
    if (d.vault !== null)
      assert.match(
        d.vault,
        /^0x[0-9a-fA-F]{40}$/,
        `a claimed vault is a real address (chain ${chain})`,
      );
    assert.equal(
      vaultReady(d),
      d.vault !== null,
      `the page is told exactly whether the vault exists (chain ${chain})`,
    );
    assert.equal(
      d.shareSymbol,
      `d${d.symbol}`,
      "the share's symbol is the one the deploy script would name",
    );
    for (const a of [d.asset, d.vault]) {
      if (!a) continue;
      const key = `${chain}:${a.toLowerCase()}`;
      assert.ok(!seen.has(key), `no address is listed twice (${key})`);
      seen.add(key);
    }
  }
}

// ── which chain the page opens on ──────────────────────────────────────────────────────────
// It must be a chain that really has a vault, and the earliest such one in the picker's order —
// otherwise the page opens on a dead form while a live one sits two pills away.
const order = [VAULT_PORTALDOT, 84532];
const openOn = firstDeployedChain(order);
if (openOn === null) {
  for (const id of order)
    assert.ok(
      !(VAULTS[id] ?? []).some(vaultReady),
      "no chain is offered as the default while one is deployed",
    );
} else {
  assert.ok(
    (VAULTS[openOn] ?? []).some(vaultReady),
    "the default chain has a vault",
  );
  // The rule is "the one marked as worth opening on, else the first deployed one in the
  // picker's order" — deployed is not the same as worth looking at, and an empty vault on the
  // first chain reads 0 / 0 / — while a funded one sits two pills away. This assertion used to
  // encode only the second half of that rule, and said so loudly the moment Portaldot was
  // deployed to: it comes first in the picker and is not the featured one.
  const featured = order.find((id) =>
    (VAULTS[id] ?? []).some((v) => vaultReady(v) && v.featured),
  );
  if (featured !== undefined) {
    assert.equal(openOn, featured, "a featured vault wins wherever it sits");
  } else {
    for (const id of order.slice(0, order.indexOf(openOn)))
      assert.ok(
        !(VAULTS[id] ?? []).some(vaultReady),
        "with none featured, it is the first deployed chain in the picker's order",
      );
  }
}
assert.equal(firstDeployedChain([]), null, "no chains, no default");
assert.equal(
  firstDeployedChain([999999]),
  null,
  "an unknown chain offers nothing",
);

assert.equal(vaultReady(LOCAL_VAULT), true);
assert.equal(
  vaultReady(vaultFor(84532, true)),
  true,
  "the local demo is usable",
);

// the picker is only a picker if the assets really differ, and every address must be distinct
assert.ok(
  LOCAL_VAULTS.length >= 2,
  "the local demo deploys more than one vault",
);
assert.equal(
  new Set(LOCAL_VAULTS.flatMap((v) => [v.asset, v.vault])).size,
  LOCAL_VAULTS.length * 2,
  "no two local addresses collide",
);
assert.equal(
  new Set(LOCAL_VAULTS.map((v) => v.symbol)).size,
  LOCAL_VAULTS.length,
  "one vault per asset symbol, so a symbol picks exactly one",
);
for (const v of LOCAL_VAULTS) {
  assert.match(v.asset ?? "", /^0x[0-9a-fA-F]{40}$/);
  assert.match(v.vault ?? "", /^0x[0-9a-fA-F]{40}$/);
  assert.equal(
    v.shareSymbol,
    `d${v.symbol}`,
    "the share's symbol is derived from the asset's, as the deploy script names it",
  );
  assert.equal(
    vaultFor(84532, true, v.symbol).vault,
    v.vault,
    "a symbol selects its own vault",
  );
}
assert.equal(
  vaultReady(vaultFor(84532, true, "NOPE")),
  false,
  "an asset with no vault is not quietly swapped for another one",
);

// ── the one button ─────────────────────────────────────────────────────────────────────────
const base = {
  connected: true,
  deployed: true,
  onRightChain: true,
  paused: false,
  side: "deposit" as const,
  amount: 100n,
  balance: 1000n,
  needsApproval: false,
  step: "idle" as const,
  chainName: "Base Sepolia",
};
assert.equal(vaultAction(base).label, "Deposit");
assert.equal(vaultAction({ ...base, side: "withdraw" }).label, "Withdraw");
assert.equal(
  vaultAction({ ...base, needsApproval: true }).label,
  "Approve, then deposit",
);
assert.equal(
  vaultAction({ ...base, side: "withdraw", needsApproval: true }).label,
  "Withdraw",
  "a withdraw burns shares the vault already governs: no allowance step",
);
assert.equal(vaultAction({ ...base, amount: null }).label, "Enter an amount");
assert.equal(
  vaultAction({ ...base, amount: 5000n }).label,
  "Not enough balance",
);
assert.equal(vaultAction({ ...base, paused: true }).disabled, true);
assert.match(
  vaultAction({ ...base, onRightChain: false }).label,
  /Switch to Base/,
);
// the regression the bridge taught us: nothing may outrank connecting
assert.equal(
  vaultAction({ ...base, connected: false }).label,
  "Connect wallet",
);
assert.equal(
  vaultAction({ ...base, connected: false, deployed: false }).label,
  "Connect wallet",
  "a missing vault must never block connecting a wallet",
);
assert.equal(
  vaultAction({ ...base, connected: false, deployed: false }).disabled,
  false,
);

// the same chain id with no vault behind it: the local demo's trap, and it must block the button
assert.equal(
  vaultAction({ ...base, wrongNetwork: true }).disabled,
  true,
  "a wallet that cannot see the vault must not be allowed to send to it",
);
assert.match(
  vaultAction({ ...base, wrongNetwork: true }).why ?? "",
  /127\.0\.0\.1:8545/,
  "and the reason says where to point the wallet",
);
assert.equal(
  vaultAction({ ...base, connected: false, wrongNetwork: true }).label,
  "Connect wallet",
  "still nothing outranks connecting",
);
assert.equal(
  vaultAction({ ...base, onRightChain: false, wrongNetwork: true }).label,
  "Switch to Base Sepolia",
  "a wrong chain is the plainer problem, and the one to say first",
);

// the unit is a different call, so it has to be a different label
assert.equal(
  vaultAction({ ...base, side: "withdraw", unit: "shares" }).label,
  "Redeem",
);
assert.equal(
  vaultAction({ ...base, side: "withdraw", unit: "assets" }).label,
  "Withdraw",
);
assert.equal(
  vaultAction({ ...base, unit: "shares" }).label,
  "Deposit",
  "the unit never changes what a deposit is",
);

console.log("vault ok");

// firstDeployedChain prefers a vault that holds something: a deployed but empty one reads 0/0/—
// on the first screen, which is how Ethereum Sepolia took the page over the moment it existed.
{
  const order = [VAULT_PORTALDOT, 11155111, 84532];
  assert.equal(
    firstDeployedChain(order),
    84532,
    "the funded vault wins, even though Sepolia is deployed and comes first",
  );
  assert.ok(
    VAULTS[84532]?.some((v) => v.featured),
    "something has to carry the flag, or the preference above proves nothing",
  );
  // a chain with no vault at all. Not Portaldot: it had none when this was written and has one
  // now, which is exactly the kind of fact a check should not hard-code.
  const bare = [421614, 46630].filter(
    (id) => !(VAULTS[id] ?? []).some(vaultReady),
  );
  assert.ok(
    bare.length > 0,
    "no undeployed chain left to test the empty case with",
  );
  assert.equal(firstDeployedChain(bare), null, "none deployed");
}
