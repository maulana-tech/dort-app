// node --experimental-strip-types src/features/swap/swap.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  amountIn,
  amountOut,
  asErc20,
  DEFAULT_SLIPPAGE,
  deadline,
  depositNote,
  EXISTENTIAL_DEPOSIT,
  FEE_BPS,
  GAS_RESERVE,
  IMPACT_BLOCK_BPS,
  isWrap,
  maxSpendable,
  minOut,
  POT,
  pathFor,
  priceImpactBps,
  SLIPPAGE,
  SWAP_CHAIN,
  swapAction,
  TOKENS,
  tokenById,
  WPOT,
} from "./swap.ts";

// the chain id must be the one the rest of the app uses for Portaldot
const chainsTs = readFileSync(
  new URL("../bridge/chains.ts", import.meta.url),
  "utf8",
);
const idMatch = /export const PORTALDOT_ID = (\d+);/.exec(chainsTs);
assert.ok(idMatch, "features/bridge/chains.ts must declare PORTALDOT_ID");
assert.equal(
  Number(idMatch[1]),
  SWAP_CHAIN,
  "the swap chain is the same Portaldot the rest of the app knows",
);

// ── the maths has to BE the router's, not resemble it ──────────────────────────────────────
// Reserves and answers below were read from the live PortalSwapRouter on Portaldot V3
// (chain 420420777) at block ~287033, pair pUSDT/WPOT 0x521d8AAF…5B93. If a future edit changes
// the fee or the rounding, these stop matching the chain and this check fails.
const R_USDT = 310_339_531n; // reserve0, 6 decimals
const R_WPOT = 70_446_117_770_965_858_581n; // reserve1, 18 decimals

assert.equal(FEE_BPS, 30n, "PortalSwapRouter takes 30 bps");
assert.equal(
  amountOut(10n ** 18n, R_WPOT, R_USDT),
  4_330_837n,
  "1 WPOT -> pUSDT must match getAmountsOut to the wei",
);
assert.equal(
  amountOut(10_000_000n, R_USDT, R_WPOT),
  2_192_715_876_995_023_323n,
  "10 pUSDT -> WPOT must match getAmountsOut to the wei",
);

// nothing in, nothing out — and an empty pool never divides by zero
assert.equal(amountOut(0n, R_WPOT, R_USDT), 0n);
assert.equal(amountOut(10n ** 18n, 0n, R_USDT), 0n);
assert.equal(amountOut(10n ** 18n, R_WPOT, 0n), 0n);
assert.equal(amountIn(100n, 0n, R_USDT), 0n);
assert.equal(
  amountIn(R_USDT, R_WPOT, R_USDT),
  0n,
  "a pool can never give out all of its reserve, and asking must not divide by zero",
);
assert.equal(amountIn(R_USDT + 1n, R_WPOT, R_USDT), 0n);

// the input for a wanted output is rounded against the trader, never short
for (const want of [1n, 100n, 4_330_837n, 1_000_000n, 50_000_000n]) {
  const need = amountIn(want, R_WPOT, R_USDT);
  assert.ok(need > 0n, `an input exists for ${want}`);
  assert.ok(
    amountOut(need, R_WPOT, R_USDT) >= want,
    "paying the quoted input must actually buy the output",
  );
}

// ── price impact: the number that matters on pools this small ──────────────────────────────
const bigTrade = priceImpactBps(10n ** 18n, R_WPOT, R_USDT);
assert.equal(bigTrade, 139, "1 WPOT into a 70 WPOT pool moves it 1.39%");
const smallTrade = priceImpactBps(10n ** 14n, R_WPOT, R_USDT);
assert.ok(
  smallTrade < bigTrade,
  "a smaller trade moves the price less, by construction",
);
assert.equal(priceImpactBps(0n, R_WPOT, R_USDT), 0);
assert.equal(priceImpactBps(10n ** 18n, 0n, R_USDT), 0, "no pool, no impact");

// ── the floor that actually protects the user ──────────────────────────────────────────────
assert.equal(minOut(1_000_000n, 50), 995_000n, "50 bps off a round number");
assert.equal(minOut(1_000_000n, 0), 1_000_000n);
assert.ok(
  minOut(4_330_837n, DEFAULT_SLIPPAGE) < 4_330_837n,
  "the default slippage really is a discount, not a no-op",
);
assert.ok(
  SLIPPAGE.includes(DEFAULT_SLIPPAGE as (typeof SLIPPAGE)[number]),
  "the default is one of the offered choices",
);

// the deadline is seconds, not milliseconds: passing ms would be ~50_000 years and no protection
const now = 1_762_000_000_000;
assert.equal(deadline(now, 20), BigInt(now / 1000 + 1200));
assert.ok(deadline(now) > BigInt(now / 1000), "always in the future");
assert.ok(
  deadline(now) < BigInt(now / 1000 + 3600),
  "and not so far ahead that it stops being a deadline",
);

// ── "max" must leave enough to pay for the transaction that spends it ─────────────────────
assert.equal(
  maxSpendable(10n ** 18n, false),
  10n ** 18n,
  "an ERC-20 max is all of it",
);
assert.equal(maxSpendable(10n ** 18n, true), 10n ** 18n - GAS_RESERVE);
assert.equal(
  maxSpendable(GAS_RESERVE, true),
  0n,
  "a balance that is only the reserve can spend nothing",
);
assert.equal(
  maxSpendable(GAS_RESERVE - 1n, true),
  0n,
  "and a smaller one must not wrap around into an enormous bigint",
);
assert.equal(maxSpendable(0n, true), 0n);
assert.equal(maxSpendable(0n, false), 0n);
assert.ok(maxSpendable(10n ** 18n, true) >= 0n);

// ── tokens and paths ───────────────────────────────────────────────────────────────────────
assert.equal(
  new Set(TOKENS.map((t) => t.id)).size,
  TOKENS.length,
  "no duplicate token ids, or the picker would select two things at once",
);
for (const t of TOKENS) {
  if (t.native) assert.equal(t.address, null, "the native coin has no address");
  else assert.match(t.address ?? "", /^0x[0-9a-fA-F]{40}$/);
  assert.ok(t.decimals >= 0 && t.decimals <= 18);
}
assert.equal(
  TOKENS.filter((t) => t.native).length,
  1,
  "exactly one native coin",
);
assert.equal(tokenById("pUSDT").decimals, 6);
assert.equal(tokenById("pWBTC").decimals, 8);
assert.equal(
  tokenById("nope").id,
  "POT",
  "an unknown id falls back to the native coin rather than undefined",
);

// native POT travels the path as WPOT
assert.equal(asErc20(POT).address, WPOT.address);
assert.equal(asErc20(WPOT).address, WPOT.address);
assert.deepEqual(pathFor(POT, tokenById("pUSDT")), [
  WPOT.address,
  tokenById("pUSDT").address,
]);
assert.deepEqual(pathFor(tokenById("pDAI"), POT), [
  tokenById("pDAI").address,
  WPOT.address,
]);
assert.deepEqual(
  pathFor(POT, WPOT),
  [],
  "POT to WPOT is not a path the router would accept",
);
assert.deepEqual(pathFor(tokenById("pDAI"), tokenById("pDAI")), []);

// every pair is one hop: the factory has a pool for all of them, so a path is never longer
for (const a of TOKENS)
  for (const b of TOKENS) {
    const p = pathFor(a, b);
    assert.ok(
      p.length === 0 || p.length === 2,
      `${a.id} -> ${b.id} is one hop or nothing`,
    );
  }

assert.equal(isWrap(POT, WPOT), true);
assert.equal(isWrap(WPOT, POT), true);
assert.equal(isWrap(POT, tokenById("pUSDT")), false);

// ── the one button ─────────────────────────────────────────────────────────────────────────
const base = {
  connected: true,
  onRightChain: true,
  from: WPOT,
  to: tokenById("pUSDT"),
  amount: 10n ** 18n,
  balance: 10n ** 19n,
  quote: 4_330_837n,
  impactBps: 139,
  needsApproval: false,
  step: "idle" as const,
};
assert.equal(swapAction(base).label, "Swap");
assert.equal(
  swapAction({ ...base, needsApproval: true }).label,
  "Approve, then swap",
);
assert.equal(swapAction({ ...base, amount: null }).label, "Enter an amount");
assert.equal(swapAction({ ...base, amount: 0n }).label, "Enter an amount");
assert.equal(
  swapAction({ ...base, amount: 10n ** 20n }).label,
  "Not enough balance",
);
assert.equal(swapAction({ ...base, quote: 0n }).disabled, true);
assert.match(
  swapAction({ ...base, onRightChain: false }).label,
  /Switch to Portaldot/,
);

// a trade that would wreck itself is refused, not merely flagged
assert.equal(
  swapAction({ ...base, impactBps: IMPACT_BLOCK_BPS }).disabled,
  true,
);
assert.match(
  swapAction({ ...base, impactBps: 2500 }).label,
  /25\.0% — too high/,
);
assert.equal(
  swapAction({ ...base, impactBps: IMPACT_BLOCK_BPS - 1 }).disabled,
  false,
  "just under the line is still the user's call",
);

// wrapping is not swapping, and the router says so with INVALID_PATH
assert.equal(swapAction({ ...base, from: POT, to: WPOT }).disabled, true);

// the regression the bridge taught us, pinned here too
assert.equal(swapAction({ ...base, connected: false }).label, "Connect wallet");
assert.equal(
  swapAction({ ...base, connected: false, from: POT, to: WPOT, amount: null })
    .label,
  "Connect wallet",
  "nothing outranks connecting a wallet",
);
assert.equal(
  swapAction({ ...base, connected: false, impactBps: 9000 }).disabled,
  false,
);

// ── the chain's own reserve, which is not ours and is gone before we see a balance ────────
// Portaldot keeps 0.1 tPOT in every account and eth_getBalance subtracts it, so a wallet
// showing 10 reads 9.9 here. Read off the live chain: of 25 EVM-mapped accounts, 19 matched
// (free - deposit) x 10^4 exactly and the rest differed only below one Planck.
assert.equal(
  EXISTENTIAL_DEPOSIT,
  10n ** 17n,
  "0.1 POT, in the 18-decimal units the Ethereum RPC reports",
);
assert.ok(
  EXISTENTIAL_DEPOSIT > GAS_RESERVE,
  "the chain holds back more than we do, which is why the gap is worth a sentence",
);
assert.equal(
  depositNote(false),
  null,
  "an ERC-20 has no account deposit; saying so beside one would be noise",
);
assert.match(depositNote(true) ?? "", /0\.1 POT/);
assert.doesNotMatch(
  depositNote(true) ?? "",
  /fee|gas|Dort/i,
  "it is the chain's deposit, not our gas reserve and not something Dort took",
);

console.log("swap ok");
