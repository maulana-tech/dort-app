/**
 * Swap on Portaldot V3, through PortalSwapRouter — the chain's own DEX, a Uniswap V2 fork.
 *
 * Everything here is measured against the live deployment, not assumed:
 *  - the router names itself in its revert strings (`PortalSwapRouter: …`)
 *  - its fee is exactly 30 bps: the constant-product maths below reproduces `getAmountsOut`
 *    to the wei on the real reserves (pinned in swap.check.ts)
 *  - its wrapped-native getter is `WPOT()`, not `WETH()`, and there is no
 *    `…SupportingFeeOnTransferTokens` variant, so no fee-on-transfer token belongs here
 *  - the factory holds 10 pairs over 5 tokens — every combination — so every swap is one hop
 *    and this file never has to route
 *
 * The quote is computed locally so the page can answer while you type, and because a pool this
 * small moves a lot on a normal-sized trade: showing the price impact matters more here than the
 * rate does. The chain stays the authority — `amountOutMin` is what actually protects the user.
 */

/**
 * Portaldot V3. Spelled out rather than imported from features/bridge: this file is pure and is
 * run by Node for swap.check.ts, which cannot resolve the `@/` alias — so the check reads the
 * bridge's own PORTALDOT_ID instead and fails if the two ever disagree.
 */
export const SWAP_CHAIN = 420420777;

export const ROUTER = "0xc17510Df29ae5E4C6C2A46CCB03197edd0963f2B" as const;
export const FACTORY = "0xC631805C297c4233B33c30aF91245058902C1D18" as const;

export type Token = {
  /** the key the UI switches on; "POT" is the native coin, which has no address */
  id: string;
  symbol: string;
  address: `0x${string}` | null;
  decimals: number;
  /** native POT needs no approval and is sent as value */
  native?: boolean;
};

/** The wrapped native token: every native swap is routed through it. */
export const WPOT: Token = {
  id: "WPOT",
  symbol: "WPOT",
  address: "0xf67cE92096E4E171060B71bF0cca0DA9f9548c03",
  decimals: 18,
};

export const POT: Token = {
  id: "POT",
  symbol: "POT",
  address: null,
  decimals: 18,
  native: true,
};

/** The five tokens the factory has pools for, plus the native coin people actually hold. */
export const TOKENS: Token[] = [
  POT,
  WPOT,
  {
    id: "pUSDT",
    symbol: "pUSDT",
    address: "0xe0114Adc0a2072B602C645f5a07EeFA1eaDBDbc2",
    decimals: 6,
  },
  {
    id: "pDAI",
    symbol: "pDAI",
    address: "0x83DF1D2fD7E110c93234911E1798A6415F536D96",
    decimals: 18,
  },
  {
    id: "pWBTC",
    symbol: "pWBTC",
    address: "0x35fdB379dd79c8D1AbaB5ed65192cfc0F0ec7bb2",
    decimals: 8,
  },
  {
    id: "pLINK",
    symbol: "pLINK",
    address: "0xDFCd9E24Bc91b4886CDF773944C2FC311ea9e766",
    decimals: 18,
  },
];

export const tokenById = (id: string): Token =>
  TOKENS.find((t) => t.id === id) ?? POT;

/** What the router sees: native POT is WPOT on the path. */
export const asErc20 = (t: Token): Token => (t.native ? WPOT : t);

/**
 * The path for a swap. Always one hop: the factory has a pool for every pair, so there is no
 * route to search and no intermediate token whose pool could be the thin one.
 */
export const pathFor = (from: Token, to: Token): `0x${string}`[] => {
  const a = asErc20(from).address;
  const b = asErc20(to).address;
  if (!a || !b || a === b) return [];
  return [a, b];
};

/**
 * POT and WPOT are the same value: moving between them is wrapping, not swapping, and the router
 * refuses the path outright (`PortalSwapRouter: INVALID_PATH`). The page says so rather than
 * letting someone send a transaction that cannot succeed.
 */
export const isWrap = (from: Token, to: Token): boolean =>
  asErc20(from).address === asErc20(to).address;

/** Uniswap V2 with a 30 bps fee — the router's exact arithmetic. */
export const FEE_BPS = 30n;

export function amountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inAfterFee = amountIn * (10_000n - FEE_BPS);
  return (inAfterFee * reserveOut) / (reserveIn * 10_000n + inAfterFee);
}

/** The input a desired output costs, rounded up — the router's `getAmountIn`. */
export function amountIn(
  out: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (out <= 0n || out >= reserveOut || reserveIn <= 0n) return 0n;
  const n = reserveIn * out * 10_000n;
  const d = (reserveOut - out) * (10_000n - FEE_BPS);
  return n / d + 1n;
}

/**
 * How far the trade moves the price, in basis points, against the pool's current rate.
 *
 * It is the honest number for a pool this size: the mid-price here comes from reserves of a few
 * hundred tokens, so a trade that looks ordinary can cost several percent. The fee is excluded —
 * this is the pool depth alone, not the cost of trading.
 */
export function priceImpactBps(
  amount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): number {
  const out = amountOut(amount, reserveIn, reserveOut);
  if (out === 0n) return 0;
  // what the same input would get at the current rate, if the pool were infinitely deep
  const ideal =
    (amount * (10_000n - FEE_BPS) * reserveOut) / (reserveIn * 10_000n);
  if (ideal === 0n) return 0;
  const lost = ideal > out ? ideal - out : 0n;
  return Number((lost * 10_000n) / ideal);
}

/** The slippage choices, in basis points. */
export const SLIPPAGE = [10, 50, 100, 300] as const;
export const DEFAULT_SLIPPAGE = 50;

/** The floor that actually protects the user; everything above it is only a preview. */
export const minOut = (out: bigint, slippageBps: number): bigint =>
  (out * BigInt(10_000 - slippageBps)) / 10_000n;

/** Unix seconds, `minutes` from now. The router rejects a stale deadline. */
export const deadline = (now: number, minutes = 20): bigint =>
  BigInt(Math.floor(now / 1000) + minutes * 60);

/**
 * What "max" may actually spend.
 *
 * Spending the whole native balance leaves nothing to pay for the transaction that spends it, so
 * the trade fails and the user is left wondering why. A small reserve is held back — and if the
 * balance is already under the reserve, max is zero rather than a negative number, which as a
 * bigint would wrap into something enormous.
 */
export const GAS_RESERVE = 10n ** 16n; // 0.01 POT

/**
 * What Portaldot keeps back from every account, and never lets anyone spend.
 *
 * The chain's existential deposit is 0.1 tPOT, and `eth_getBalance` already subtracts it: an
 * account holding exactly the deposit reads as zero over the Ethereum RPC, and one holding ten
 * reads 9.9. So the figure this page shows is the spendable one, which is the right figure to
 * show — what was missing is the sentence explaining why it sits a tenth below what a wallet
 * reports, which otherwise reads as a bug in Dort.
 *
 * Measured, not assumed. Of 25 EVM-mapped accounts read straight out of the chain's
 * System.Account storage, 19 matched (free − deposit) × 10⁴ to the Planck; the other six were
 * accounts in motion and differed only below a single Planck. The chain itself reports 14
 * decimals natively while the Ethereum RPC presents 18, which is where the 10⁴ comes from.
 *
 * This is separate from GAS_RESERVE above: that one is ours, held back so a trade does not eat
 * the gas it needs. This one is the chain's, and is gone before we ever see the balance.
 */
export const EXISTENTIAL_DEPOSIT = 10n ** 17n; // 0.1 POT, in the 18-decimal units the RPC uses

/** The line shown beside a native balance, or null when the token is an ordinary ERC-20. */
export const depositNote = (native: boolean): string | null =>
  native ? "0.1 POT is the chain's account deposit and cannot be spent" : null;

export function maxSpendable(balance: bigint, native: boolean): bigint {
  if (balance <= 0n) return 0n;
  if (!native) return balance;
  return balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n;
}

/** Above this the page stops calling it a quote and starts calling it a warning. */
export const IMPACT_WARN_BPS = 100;
export const IMPACT_BLOCK_BPS = 1500;

export type SwapStep = "idle" | "approve" | "submit" | "done" | "error";

/**
 * What the one button says, and whether it can be pressed. Connecting outranks everything — the
 * rule the bridge and the vault both pin in their own checks — and a trade that would move the
 * price more than `IMPACT_BLOCK_BPS` is refused outright rather than merely warned about: these
 * pools are small enough that a fat-fingered amount is a donation.
 */
export function swapAction(s: {
  connected: boolean;
  onRightChain: boolean;
  from: Token;
  to: Token;
  amount: bigint | null;
  balance: bigint | null;
  quote: bigint | null;
  impactBps: number;
  needsApproval: boolean;
  step: SwapStep;
}): { label: string; disabled: boolean; why?: string } {
  if (!s.connected) return { label: "Connect wallet", disabled: false };
  if (!s.onRightChain) return { label: "Switch to Portaldot", disabled: false };
  if (isWrap(s.from, s.to))
    return {
      label: `${s.from.symbol} and ${s.to.symbol} are the same value`,
      disabled: true,
      why: "Moving between the native coin and its wrapper is wrapping, not swapping, and this router has no pool for it.",
    };
  if (s.step === "approve") return { label: "Approving…", disabled: true };
  if (s.step === "submit")
    return { label: "Confirm in wallet…", disabled: true };
  if (s.amount === null || s.amount === 0n)
    return { label: "Enter an amount", disabled: true };
  if (s.balance !== null && s.amount > s.balance)
    return { label: "Not enough balance", disabled: true };
  if (s.quote === null) return { label: "No quote yet", disabled: true };
  if (s.quote === 0n)
    return {
      label: "No liquidity for this amount",
      disabled: true,
      why: "The pool cannot fill a trade this size.",
    };
  if (s.impactBps >= IMPACT_BLOCK_BPS)
    return {
      label: `Price impact ${(s.impactBps / 100).toFixed(1)}% — too high`,
      disabled: true,
      why: "These testnet pools hold very little. Trade a smaller amount.",
    };
  if (s.needsApproval) return { label: `Approve, then swap`, disabled: false };
  return { label: "Swap", disabled: false };
}
