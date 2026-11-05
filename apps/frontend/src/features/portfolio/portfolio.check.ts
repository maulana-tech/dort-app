// node --experimental-strip-types src/features/portfolio/portfolio.check.ts
import assert from "node:assert/strict";
import { VAULTS, vaultReady } from "../vault/vault.ts";
import {
  byRecent,
  coverage,
  DEFAULT_WINDOW,
  held,
  LOG_RPC,
  LOG_WINDOW,
  type Move,
  type Position,
  totals,
  WINDOW_CAP,
  windows,
} from "./portfolio.ts";

// ── the windows ────────────────────────────────────────────────────────────
// Newest first, inclusive both ends, and they must tile the range exactly: a gap is a move the
// page never sees and never admits to missing.
{
  const { spans, complete } = windows(100, 349, 100);
  assert.equal(complete, true);
  assert.deepEqual(spans, [
    { from: 250, to: 349 },
    { from: 150, to: 249 },
    { from: 100, to: 149 },
  ]);
  // no gaps, no overlaps, and the whole range is covered
  const seen = new Set<number>();
  for (const s of spans) for (let b = s.from; b <= s.to; b++) seen.add(b);
  assert.equal(seen.size, 250, "every block in [100,349] exactly once");
}

// one block is one window, not none
assert.deepEqual(windows(7, 7, 100).spans, [{ from: 7, to: 7 }]);

// an exact multiple must not produce an empty tail window
{
  const { spans, complete } = windows(0, 199, 100);
  assert.equal(spans.length, 2);
  assert.equal(complete, true);
  assert.deepEqual(spans[1], { from: 0, to: 99 });
}

// the cap stops the scan and the scan admits it
{
  const { spans, complete } = windows(0, 10_000, 100, 5);
  assert.equal(spans.length, 5);
  assert.equal(
    complete,
    false,
    "capped means incomplete, or the page would lie",
  );
  assert.equal(
    spans[0].to,
    10_000,
    "it starts at the head: recent moves first",
  );
}

// nonsense in, nothing out — never a loop
for (const bad of [
  windows(10, 5, 100),
  windows(0, 100, 0),
  windows(Number.NaN, 10, 100),
  windows(0, Number.NaN, 100),
]) {
  assert.deepEqual(bad.spans, []);
  assert.equal(bad.complete, true);
}

// ── what the page says about its own reach ─────────────────────────────────
assert.equal(coverage(true, 123), null, "a complete scan explains nothing");
assert.match(String(coverage(false, 53_482_026)), /53,482,026/);
assert.match(String(coverage(false, null)), /did not finish/);

// ── totals ─────────────────────────────────────────────────────────────────
const pos = (chain: number, symbol: string, shares: bigint, worth: bigint) =>
  ({
    chain,
    chainName: `chain ${chain}`,
    vault: "0x0000000000000000000000000000000000000001",
    symbol,
    shareSymbol: `d${symbol}`,
    decimals: 6,
    shares,
    worth,
  }) satisfies Position;

{
  const t = totals([
    pos(84532, "USDC", 20n, 20_000_000n),
    pos(11155111, "USDC", 5n, 5_000_000n),
    pos(1, "USDT", 1n, 1_000_000n),
  ]);
  assert.deepEqual(
    t.map((x) => [x.symbol, x.worth]),
    [
      ["USDC", 25_000_000n],
      ["USDT", 1_000_000n],
    ],
    "same asset on two chains adds up; different assets never do",
  );
}
assert.deepEqual(totals([]), []);

assert.equal(held(pos(1, "USDC", 0n, 0n)), false);
assert.equal(
  held(pos(1, "USDC", 1n, 0n)),
  true,
  "shares, not worth: an empty vault is still a position",
);

// ── order ──────────────────────────────────────────────────────────────────
{
  const m = (block: number): Move => ({
    kind: "deposit",
    chain: 1,
    chainName: "x",
    vault: "0x0000000000000000000000000000000000000001",
    symbol: "USDC",
    shareSymbol: "dUSDC",
    decimals: 6,
    assets: 0n,
    shares: 0n,
    block,
    tx: "0x00",
  });
  assert.deepEqual(
    [m(1), m(9), m(5)].sort(byRecent).map((x) => x.block),
    [9, 5, 1],
  );
}

// ── held against the vault table ───────────────────────────────────────────
// Every deployed vault needs a deployment block, or its history has no floor and the scan is
// unbounded. This is the cross-check that stops a new deployment shipping without one.
for (const [id, ds] of Object.entries(VAULTS)) {
  for (const d of ds) {
    if (!vaultReady(d)) continue;
    assert.equal(
      typeof d.block,
      "number",
      `vault ${d.vault} on chain ${id} has no deployment block`,
    );
    assert.ok((d.block ?? 0) > 0, `chain ${id}: block must be a real height`);
    const w = LOG_WINDOW[Number(id)] ?? DEFAULT_WINDOW;
    assert.ok(w >= 1, `chain ${id}: a window of ${w} blocks reads nothing`);
  }
}

// a chain that needs its own log endpoint must still be a chain we deploy on
for (const id of Object.keys(LOG_RPC)) {
  assert.ok(
    VAULTS[Number(id)],
    `LOG_RPC names chain ${id}, which has no vaults`,
  );
  assert.match(LOG_RPC[Number(id)], /^https:\/\//, "log endpoints are https");
}

assert.ok(WINDOW_CAP >= 1);

console.log(
  `portfolio ok (${Object.values(VAULTS).flat().filter(vaultReady).length} live vaults)`,
);
