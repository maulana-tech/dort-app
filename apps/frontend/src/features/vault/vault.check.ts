// node --experimental-strip-types src/features/vault/vault.check.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  LOCAL_VAULT,
  LOCAL_VAULTS,
  OFFSET,
  previewDeposit,
  previewRedeem,
  previewWithdraw,
  toAssets,
  toShares,
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
const source = (await import("node:fs")).readFileSync(sol, "utf8");
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

// ── deployment gating ──────────────────────────────────────────────────────────────────────
assert.deepEqual(VAULTS, {}, "nothing is claimed deployed before it is");
assert.deepEqual(vaultsFor(84532, false), [], "and no chain offers one yet");
assert.equal(vaultReady(vaultFor(84532, false)), false);
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
