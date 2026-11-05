/**
 * What you hold across every vault Dort knows about, and how you came to hold it.
 *
 * Two halves with very different costs, and the page is built around that difference.
 *
 * A **position** is three direct calls — balanceOf, previewRedeem, decimals are already known —
 * so it is exact, cheap, and always available. That is the part the page leads with.
 *
 * A **history** is `eth_getLogs`, and every public endpoint caps the block range it will answer
 * for. Measured on 2026-11-05: Base Sepolia's own RPC refuses anything over **200** blocks,
 * publicnode allows **50,000**, drpc **10,000** on its free plan. The Base Sepolia vault was
 * deployed 1.34 million blocks ago, so a single query for its whole life is not a thing any of
 * them will answer. The scan is therefore a sequence of windows from the deployment block, and
 * it is allowed to run out: `WINDOW_CAP` bounds it, and a run that stops early says so rather
 * than presenting a partial list as the whole truth. A portfolio that quietly omits a withdrawal
 * is worse than one that admits it only looked so far back.
 */

export type Position = {
  chain: number;
  chainName: string;
  vault: `0x${string}`;
  symbol: string;
  shareSymbol: string;
  decimals: number;
  /** share token balance */
  shares: bigint;
  /** what redeeming all of them returns right now */
  worth: bigint;
};

export type Move = {
  kind: "deposit" | "withdraw";
  chain: number;
  chainName: string;
  vault: `0x${string}`;
  symbol: string;
  shareSymbol: string;
  decimals: number;
  assets: bigint;
  shares: bigint;
  block: number;
  tx: `0x${string}`;
};

/** How far back a single `eth_getLogs` may reach, per chain. Measured, not guessed. */
export const LOG_WINDOW: Record<number, number> = {
  // Base Sepolia: sepolia.base.org answers 200, so the page reads logs from publicnode, which
  // answers 50,000. Both numbers came from the endpoints themselves.
  84532: 50_000,
  11155111: 50_000,
};
export const DEFAULT_WINDOW = 10_000;

/**
 * Where the logs are read from, when that is not where everything else is read from. Only Base
 * Sepolia needs an entry: its public RPC is the one that caps at 200 blocks, which is too small
 * for any history at all.
 */
export const LOG_RPC: Record<number, string> = {
  84532: "https://base-sepolia-rpc.publicnode.com",
};

/**
 * The most windows one chain may spend. 40 × 50,000 is two million blocks, which covers both
 * live vaults with room to spare; past that the page says how far it got. The cap exists so a
 * chain with a small window and an old vault cannot turn one page load into a thousand requests.
 */
export const WINDOW_CAP = 40;

export type Span = { from: number; to: number };

/**
 * The windows to ask for, newest first — so the first answers are the ones most worth showing if
 * the rest never arrive. Inclusive at both ends, which is how `eth_getLogs` reads them: a span
 * of {from: 0, to: 0} is one block, not none.
 */
export function windows(
  from: number,
  to: number,
  size: number,
  cap = WINDOW_CAP,
): { spans: Span[]; complete: boolean } {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || size < 1)
    return { spans: [], complete: true };
  const spans: Span[] = [];
  let end = to;
  while (end >= from && spans.length < cap) {
    const start = Math.max(from, end - size + 1);
    spans.push({ from: start, to: end });
    if (start === from) return { spans, complete: true };
    end = start - 1;
  }
  return { spans, complete: end < from };
}

/** Newest first. Same block: a withdraw after a deposit is the order they happened in. */
export const byRecent = (a: Move, b: Move) => b.block - a.block;

/** What everything is worth, per asset symbol — positions on two chains are not one number. */
export function totals(ps: Position[]): {
  symbol: string;
  worth: bigint;
  decimals: number;
}[] {
  const by = new Map<string, { worth: bigint; decimals: number }>();
  for (const p of ps) {
    const at = by.get(p.symbol);
    if (at) at.worth += p.worth;
    else by.set(p.symbol, { worth: p.worth, decimals: p.decimals });
  }
  return [...by]
    .map(([symbol, v]) => ({ symbol, ...v }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** A position worth nothing is not a position; it is a vault you once used, or never did. */
export const held = (p: Position): boolean => p.shares > 0n;

/**
 * What the history line has to admit. `scanned` is the oldest block actually reached, so the
 * sentence can name it instead of saying "some".
 */
export function coverage(
  complete: boolean,
  oldest: number | null,
): string | null {
  if (complete) return null;
  return oldest === null
    ? "The log scan did not finish, so older moves may be missing."
    : `Read back to block ${oldest.toLocaleString("en-US")} only — public RPCs cap how far one log query may reach, so anything older is not shown.`;
}
