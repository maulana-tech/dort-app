// node --experimental-strip-types src/features/explore/utils/hints.check.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HINTS, hintBlock, hintsIn } from "./hints.ts";

// ── the copies are held against the pages they were copied from ────────────────────────────
// The four protocol files are 1.2 MB between them, so the browser gets a copy of the one list
// it needs rather than the lot. A copy drifts; this is what stops it drifting silently.
const DIR = join(import.meta.dirname, "../data");
const real = new Map<string, { name: string; checks: string[] }>();
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(DIR, f), "utf8")) as {
    id: string;
    name: string;
    checks: string[];
  };
  real.set(d.id, { name: d.name, checks: d.checks });
}

assert.equal(
  HINTS.length,
  real.size,
  "every Explore page has a hint, and no hint has no page",
);
for (const h of HINTS) {
  const r = real.get(h.id);
  assert.ok(r, `${h.id} is not a protocol Explore has a page for`);
  assert.equal(h.name, r.name, `${h.id}: the name differs from its page`);
  assert.deepEqual(
    h.checks,
    r.checks,
    `${h.id}: the checks here differ from the ones on its page, word for word`,
  );
  assert.ok(h.checks.length > 0, `${h.id} carries nothing worth saying`);
}

// ── matching on what a contract writes, never on an address ────────────────────────────────
// A mainnet address means nothing in source handed in from a fork, and a wrong hit sends a
// reviewer looking for the wrong thing — which is worse than no hint at all.
for (const h of HINTS)
  assert.doesNotMatch(
    h.match.source,
    /0x[0-9a-f]{8}/i,
    `${h.id} matches on an address; it must match on names a contract writes`,
  );

const uni =
  'import {ISwapRouter} from "@uniswap/v3-periphery/ISwapRouter.sol";';
const aave =
  "contract B { IPool pool; function go() external { pool.supply(a,b,c,d); } }";
assert.deepEqual(
  hintsIn(uni).map((h) => h.id),
  ["uniswap-v3"],
);
assert.deepEqual(
  hintsIn(aave).map((h) => h.id),
  ["aave-v3"],
);
assert.deepEqual(
  hintsIn("contract C { function deposit(uint256 a) external {} }"),
  [],
);
assert.equal(
  hintsIn(`${uni}\n${aave}`).length,
  2,
  "a contract may touch more than one",
);
assert.deepEqual(hintsIn(""), []);

// case does not change what a contract integrates
assert.equal(hintsIn("ISWAPROUTER").length, 1);

// ── the block the model is given ───────────────────────────────────────────────────────────
assert.equal(
  hintBlock("contract C {}"),
  "",
  "silence when it touches none of them",
);
const block = hintBlock(uni);
assert.match(block, /Uniswap:/);
assert.match(
  block,
  /uniswapV3\*Callback/,
  "the sentence that catches the bug travels intact",
);
// the framing is the whole point: a checklist labelled "issues" comes back reported as issues
assert.match(block, /not findings/);
assert.doesNotMatch(block, /\bissues?\b|\bvulnerabilit/i);
assert.match(block, /not a claim that anything here is wrong/);

console.log("explore hints ok");
