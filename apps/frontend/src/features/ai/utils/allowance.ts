/**
 * Who gets how many questions out of this deployment's own model.
 *
 * The operator pays for every call, so the brake has to exist. Bucketing by IP is what was here:
 * it stops a loop, and it also stops a lecture hall on one NAT after the first twenty questions
 * between them. Bucketing by wallet instead gives each reader their own count.
 *
 * A wallet address proves nothing on its own — they are free and unlimited, and a script can
 * make a thousand before breakfast. What is not free is *having been on a chain*: a nonce above
 * zero, or a balance, means someone went to a faucet and waited. That is a small cost, and it is
 * the honest size of this: it raises the price of abuse from nothing to one faucet claim. It is
 * not Sybil resistance and must not be described as any.
 *
 * So three tiers, and the page says which one is in force rather than letting a reader discover
 * it at the twentieth question.
 */
export type Tier = "anon" | "wallet" | "onchain";

export type Allowance = { calls: number; windowMs: number };

const HOUR = 60 * 60_000;

/**
 * Anonymous is what an IP gets and is deliberately small. A connected wallet is a *person* on
 * this page rather than a shared exit address, which is worth something even unproven. One with
 * history on a chain we support has paid the faucet's price and gets the real allowance.
 */
export const TIERS: Record<Tier, Allowance> = {
  // Generous on purpose. A brake exists to stop a loop, and a loop is hundreds a minute — it
  // does not need to be felt by someone reading the page to know whether it works. Eight was
  // low enough that a visitor trying the thing properly could meet it, and meeting a limit
  // while deciding whether to trust a tool is the most expensive moment to meet one.
  anon: { calls: 40, windowMs: HOUR },
  // what connecting is worth: a hundred an hour, which is what "a hundred credits" means here
  wallet: { calls: 100, windowMs: HOUR },
  onchain: { calls: 100, windowMs: HOUR },
};

export const allowanceOf = (tier: Tier): Allowance => TIERS[tier];

/** A tier named by a header, which is a string from the network until it is checked. */
export const isTier = (t: unknown): t is Tier =>
  t === "anon" || t === "wallet" || t === "onchain";

/* ── a faucet claim, read as credit ─────────────────────────────────────────────────────── */

/** Questions earned per whole unit of the chain's own token held. */
export const PER_UNIT = 10;
/** However little is held, and however much: any balance earns the floor, none earns the cap. */
export const CREDIT_CAP = 400;

/**
 * What a balance is worth in questions.
 *
 * The faucet is the price. A reader claims once, and what they were given becomes the size of
 * their allowance here — so the thing standing between a script and the operator's budget is a
 * faucet's rate limit rather than nothing at all.
 *
 * The tokens are not spent and this is not a payment: they are evidence that someone waited at a
 * faucet, and they keep every bit of their use on the chain. Which is also the honest limit of
 * it — the same tokens can be sent to a second address and counted again, so this raises the
 * cost of abuse rather than ending it. It is a brake with a faucet's worth of friction in it,
 * and it is worth no more than that.
 */
export function creditsFrom(balance: bigint, decimals = 18): number {
  if (balance <= 0n) return TIERS.wallet.calls;
  const unit = 10n ** BigInt(decimals);
  const whole = Number(balance / unit);
  return Math.min(CREDIT_CAP, TIERS.onchain.calls + PER_UNIT * whole);
}

/** The same, as the allowance the brake takes. */
export const creditAllowance = (balance: bigint, decimals = 18): Allowance => ({
  calls: creditsFrom(balance, decimals),
  windowMs: TIERS.onchain.windowMs,
});

/** What the page tells a reader about the count they are spending, in their own terms. */
export function tierLine(tier: Tier, left: number): string {
  const n = `${left} question${left === 1 ? "" : "s"} left this hour`;
  if (tier === "onchain")
    return `${n}. What your wallet holds on a chain Dort reads is counted as credit — the faucet is the price, and the tokens stay yours.`;
  if (tier === "wallet")
    return `${n}. Holding anything on a chain Dort reads raises it further — the faucet is the price.`;
  return `${n}. Connect a wallet and prove it for ${TIERS.wallet.calls} an hour, which is also how Dort tells one reader from another behind a shared address.`;
}

export type Bucket = { at: number[] };

/**
 * Whether this caller has had their share for now, and what is left.
 *
 * In memory and per server instance, so it is a brake rather than a lock: enough that one page
 * cannot spend the operator's budget in a loop, never a claim to be a quota system. Restarting
 * the server forgives everyone, which is the right failure for a brake.
 */
export function overRate(
  bucket: Bucket | undefined,
  now: number,
  allow: Allowance,
): { over: boolean; bucket: Bucket; left: number } {
  const at = (bucket?.at ?? []).filter((t) => now - t < allow.windowMs);
  if (at.length >= allow.calls) return { over: true, bucket: { at }, left: 0 };
  at.push(now);
  return { over: false, bucket: { at }, left: allow.calls - at.length };
}

/* ── proving the wallet is the reader's ─────────────────────────────────────────────────── */

/**
 * What the wallet is asked to sign. It names this app, the address, and the hour it was made in.
 *
 * The hour, not the minute: a signature good for sixty minutes means a reader signs once per
 * sitting rather than once per question, and the thing it guards — a handful of questions from
 * a model — is not worth making someone approve a popup every time they type. It is bound to the
 * address so a signature cannot be replayed for a different one.
 */
export const proofMessage = (address: string, hour: number): string =>
  `Dort: let this wallet ask questions.\nAddress: ${address.toLowerCase()}\nHour: ${hour}`;

/** The hour a timestamp falls in, which is what both sides agree on without talking. */
export const hourOf = (now: number): number => Math.floor(now / HOUR);

/**
 * Whether a proof is for a window we still accept. The current hour and the one before it, so a
 * signature made at 10:59 is not dead at 11:00 — the alternative is a reader whose wallet popup
 * appears mid-sentence for no reason they can see.
 */
export const hourOk = (hour: unknown, now: number): boolean =>
  typeof hour === "number" &&
  Number.isInteger(hour) &&
  (hour === hourOf(now) || hour === hourOf(now) - 1);
