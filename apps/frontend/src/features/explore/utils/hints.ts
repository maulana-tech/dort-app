/**
 * What Dort already knows to look for when a contract talks to a protocol it has a page about.
 *
 * Explore holds four protocols in full — their contracts, their flows, and a short list of the
 * things worth checking in anything that integrates them. That last list is the useful part for
 * a reading, and it was sitting in a tab: a review of a contract calling Uniswap got a model's
 * general knowledge rather than "every uniswapV3*Callback verifies msg.sender is a canonical
 * pool", which is the sentence that catches the bug.
 *
 * The checks are copied here rather than imported, because the pages they come from are 1.2 MB
 * between them and this module runs in the browser. Copies drift, so hints.check.ts reads the
 * real data files and fails if a word of this differs from them — the same arrangement that
 * holds the exporter's file list against the exporter's own directory.
 *
 * Matching is on the names a contract writes when it integrates: an interface, a call, a type.
 * Deliberately not on addresses — a mainnet address means nothing in source handed in from a
 * fork, and a false positive here sends a reviewer looking for the wrong thing.
 */
export type ProtocolHint = {
  id: string;
  name: string;
  match: RegExp;
  checks: string[];
};

export const HINTS: ProtocolHint[] = [
  {
    id: "uniswap-v3",
    name: "Uniswap",
    // the names a contract uses when it talks to this protocol, not the protocol's own prose
    match:
      /uniswapv3|iuniswap|swaprouter|nonfungiblepositionmanager|slot0|sqrtprice|uniswap/i,
    checks: [
      "Callbacks: every uniswapV3*Callback implementation verifies msg.sender is a canonical pool.",
      "Slippage and deadlines on every periphery call made by a contract.",
      "Price: slot0 vs the time-weighted oracle; observation cardinality is small on new pools.",
      "Tokens: fee-on-transfer and rebasing tokens break the pool's balance checks.",
      "Rounding directions in SqrtPriceMath always favour the pool.",
    ],
  },
  {
    id: "aave-v3",
    name: "Aave",
    // the names a contract uses when it talks to this protocol, not the protocol's own prose
    match:
      /\bipool\b|ipooladdressesprovider|aavev3|\baave\b|atoken|ilendingpool|\bsupply\(|getreservedata/i,
    checks: [
      "Access: list who holds each ACLManager role and the PoolAddressesProvider owner; they can change any parameter or implementation.",
      "Oracles: every asset's price source, its heartbeat and decimals, and the fallback oracle path.",
      "Index math: scaled balances and the order of updateState before any scaling, on every action.",
      "Library code runs on the Pool's storage: review storage layout compatibility on every Pool upgrade.",
      "Integrations: aToken balances rebase; debt tokens can't be transferred; repay may take less than requested.",
    ],
  },
  {
    id: "compound-v3",
    name: "Compound",
    // the names a contract uses when it talks to this protocol, not the protocol's own prose
    match:
      /\bicomet\b|\bcomet\b|compoundiii|compound iii|\bcompound\b|supplyfrom|withdrawfrom/i,
    checks: [
      "Signed principal and two indexes: rounding of present and principal value both ways.",
      "Price feeds per asset and getPrice's handling of bad answers.",
      "Reserves: absorb draws on them, buyCollateral refills them; target reserves gate sales.",
      "Upgrades: parameters are immutables, so every change is a new implementation behind the proxy.",
    ],
  },
  {
    id: "morpho",
    name: "Morpho",
    // the names a contract uses when it talks to this protocol, not the protocol's own prose
    match: /\bimorpho\b|\bmorpho\b|metamorpho|marketparams|\bllv?tv\b/i,
    checks: [
      "Per market: oracle (scale 1e36, staleness), rate model, LLTV; they are fixed at creation.",
      "Shares maths: virtual shares and the rounding direction at each call site.",
      "Callbacks run before tokens are pulled; integrations implementing them must check msg.sender is Morpho.",
      "Vaults: curator, allocator, guardian and owner; which changes are timelocked and which are not.",
    ],
  },
];

/** Which of them a piece of source appears to touch, in the order they are listed. */
export const hintsIn = (source: string): ProtocolHint[] =>
  HINTS.filter((h) => h.match.test(source));

/**
 * The hints as a block for the prompt, or "" when a contract touches none of them.
 *
 * Named as what it is — things worth checking in an integration — never as findings. A model
 * handed a checklist labelled "issues" will report them as issues it found.
 */
export function hintBlock(source: string): string {
  const hits = hintsIn(source);
  if (!hits.length) return "";
  return [
    "",
    "This source appears to integrate protocols Dort keeps notes on. These are the things worth checking in any contract that talks to them — not findings, and not a claim that anything here is wrong:",
    ...hits.flatMap((h) => [
      "",
      `${h.name}:`,
      ...h.checks.map((c) => `- ${c}`),
    ]),
  ].join("\n");
}
