// node --experimental-strip-types src/features/ai/utils/allowance.check.ts
import assert from "node:assert/strict";
import {
  allowanceOf,
  type Bucket,
  CREDIT_CAP,
  creditAllowance,
  creditsFrom,
  hourOf,
  hourOk,
  isTier,
  overRate,
  PER_UNIT,
  proofMessage,
  TIERS,
  tierLine,
} from "./allowance.ts";

const HOUR = 60 * 60_000;

// ── the tiers are ordered, and the bottom one is not zero ──────────────────────────────────
// An anonymous reader must still be able to ask something: a page that is dead until you
// connect a wallet is a page most people close. The ladder is a nudge, not a gate.
assert.ok(
  TIERS.anon.calls >= 40,
  "a brake stops a loop, which is hundreds a minute; it must not be felt by someone reading the page to decide whether to trust the tool",
);
assert.ok(TIERS.wallet.calls > TIERS.anon.calls);
assert.ok(
  TIERS.onchain.calls >= TIERS.wallet.calls,
  "proving a wallet is the big step; holding something only raises it further",
);
assert.equal(
  TIERS.wallet.calls,
  100,
  "connecting is worth a hundred an hour, which is what 'a hundred credits' means here",
);
for (const t of ["anon", "wallet", "onchain"] as const)
  assert.equal(
    allowanceOf(t).windowMs,
    HOUR,
    "one window, so one sentence explains it",
  );

// ── the brake ──────────────────────────────────────────────────────────────────────────────
const allow = { calls: 3, windowMs: 1000 };
let b: Bucket | undefined;
const take = (now: number) => {
  const r = overRate(b, now, allow);
  b = r.bucket;
  return r;
};
assert.deepEqual(
  [take(0).over, take(1).over, take(2).over],
  [false, false, false],
);
assert.equal(take(3).over, true, "the fourth in the window waits");
assert.equal(take(3).left, 0);
// the window slides: the first three fall out of it and the count comes back
assert.equal(take(1001).over, false);
assert.equal(
  overRate({ at: [] }, 0, allow).left,
  2,
  "left counts what remains after this call, not before it",
);
// a bigger tier is a bigger count over the same window, nothing more exotic
assert.equal(
  overRate({ at: [0, 1, 2] }, 3, { calls: 60, windowMs: 1000 }).over,
  false,
);

// ── what the reader is told ────────────────────────────────────────────────────────────────
// The count is spent either way, so saying how to raise it belongs beside it — a limit a reader
// meets without warning reads as the app breaking.
assert.match(tierLine("anon", 5), /5 questions left/);
assert.match(
  tierLine("anon", 1),
  /1 question left/,
  "one question, not questions",
);
assert.match(
  tierLine("anon", 5),
  /Connect a wallet and prove it for 100 an hour/,
);
assert.match(tierLine("wallet", 5), /faucet is the price/);
assert.doesNotMatch(
  tierLine("wallet", 5),
  /balance|spent|deducted/i,
  "an hourly rate is not a ledger, and must never be described as one",
);
assert.match(tierLine("onchain", 5), /counted as credit/);
assert.match(
  tierLine("onchain", 5),
  /tokens stay yours/,
  "the balance is evidence of a faucet claim, not a payment, and the line must not imply one",
);
for (const t of ["anon", "wallet", "onchain"] as const)
  assert.doesNotMatch(
    tierLine(t, 3),
    /sybil|proof of|verified human/i,
    "this is a faucet's worth of friction and must never be sold as identity",
  );

// ── the signature ──────────────────────────────────────────────────────────────────────────
// Bound to the address, so one wallet's signature cannot stand in for another's, and to the
// hour, so an old one cannot be replayed forever.
const A = "0x162Dcf95Eb9df70F314CD4648565E6eb24f85aF8";
const B = "0x5bdd9713ddc4f11e14bd3094882401cd122656f4";
assert.notEqual(proofMessage(A, 1), proofMessage(B, 1));
assert.notEqual(proofMessage(A, 1), proofMessage(A, 2));
assert.equal(
  proofMessage(A, 1),
  proofMessage(A.toLowerCase(), 1),
  "the same wallet in either case is the same wallet, and signs the same words",
);
assert.match(
  proofMessage(A, 1),
  /^Dort:/,
  "a signer sees whose request this is first",
);

// an hour either side, so a signature made at 10:59 is not dead at 11:00
const now = 7 * HOUR + 123;
assert.equal(hourOf(now), 7);
assert.equal(hourOk(7, now), true);
assert.equal(hourOk(6, now), true, "the hour before still counts");
assert.equal(hourOk(5, now), false);
assert.equal(hourOk(8, now), false, "and the future is not a window");
assert.equal(hourOk("7", now), false);
assert.equal(hourOk(7.5, now), false);
assert.equal(hourOk(undefined, now), false);

// ── the faucet, read as credit ─────────────────────────────────────────────────────────────
// A claim is the price. What a wallet was given becomes the size of its allowance, so what
// stands between a script and the operator's budget is a faucet's rate limit rather than
// nothing. It is not a payment and the tokens are not spent.
const ONE = 10n ** 18n;
assert.equal(
  creditsFrom(0n),
  TIERS.wallet.calls,
  "nothing held is the wallet tier, not zero",
);
assert.equal(
  creditsFrom(-1n),
  TIERS.wallet.calls,
  "and neither is a nonsense balance",
);
assert.equal(
  creditsFrom(ONE / 2n),
  TIERS.onchain.calls,
  "any balance at all earns the floor: a faucet that gives change still charged the same wait",
);
assert.equal(creditsFrom(ONE), TIERS.onchain.calls + PER_UNIT);
assert.equal(creditsFrom(ONE * 3n), TIERS.onchain.calls + PER_UNIT * 3);
assert.equal(
  creditsFrom(ONE * 1_000_000n),
  CREDIT_CAP,
  "and a whale is still only a reader: the cap is what the operator can afford, not what the wallet can prove",
);
assert.ok(CREDIT_CAP > TIERS.onchain.calls);
// six decimals, because the balance that matters on some chains is a stablecoin's
assert.equal(creditsFrom(1_000_000n, 6), TIERS.onchain.calls + PER_UNIT);
assert.equal(
  creditAllowance(ONE).windowMs,
  TIERS.onchain.windowMs,
  "one window throughout",
);
assert.equal(creditAllowance(ONE).calls, creditsFrom(ONE));
// the ladder still holds at every rung
assert.ok(creditsFrom(0n) > TIERS.anon.calls);
assert.ok(creditsFrom(ONE) > creditsFrom(0n));

// ── the line is prose, and prose is not a header ───────────────────────────────────────────
// It was sent as one, and a header is a ByteString: the em dash in the wallet tier's sentence
// threw a 500 from the route, while the anon tier passed only because it happened to have none.
// The page composes the line now; the wire carries the tier and the count.
assert.ok(
  [...["anon", "wallet", "onchain"]].some((t) =>
    [...tierLine(t as never, 3)].some((c) => c.charCodeAt(0) > 255),
  ),
  "these lines are written for people, so they will keep having characters a header cannot hold",
);
assert.equal(isTier("anon"), true);
assert.equal(isTier("onchain"), true);
assert.equal(
  isTier("admin"),
  false,
  "a tier from the network is a string until it is checked",
);
assert.equal(isTier(undefined), false);
assert.equal(isTier(null), false);

console.log("allowance ok");
