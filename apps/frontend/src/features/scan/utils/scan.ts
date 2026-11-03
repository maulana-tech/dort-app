/**
 * Read someone else's contract: a source file they upload, an address, or a transaction that has
 * already happened.
 *
 * What this is NOT is an audit. The difference matters more than anything else in this file, so
 * it is enforced rather than hoped for: every answer carries what was *not* checked, and nothing
 * here can emit a verdict, a score, or the word "safe". A tool that says "no issues found" and is
 * believed is worse than no tool — the person ships, the money goes, and the tool caused it.
 * Slither and Aderyn report candidates for a human to triage; so does this.
 *
 * What it can do that a chat window cannot: a transaction hash on Portaldot V3 becomes a real
 * call tree. `debug_traceTransaction` with `callTracer` is supported there (probed against the
 * live RPC), so the model reads what the transaction actually did — every call, its gas, whether
 * it reverted — instead of guessing from a name.
 *
 * Pure: Node runs scan.check.ts against it, and nothing here touches a network or a key.
 */
import type { Frame, FrameKind } from "../../trace/types";

export type ScanKind = "address" | "tx" | "source";

export type ScanInput = {
  kind: ScanKind;
  /** the address or hash, lower-cased; or the source text as given */
  value: string;
  /** set when the source came from a file the user chose */
  name?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;

/**
 * What the user pasted. An address and a transaction hash differ only in length, which is exactly
 * the kind of thing a person gets wrong at 2am — so the page never asks them to say which it is.
 */
export function detect(text: string, name?: string): ScanInput | null {
  const t = text.trim();
  if (!t) return null;
  if (ADDRESS.test(t)) return { kind: "address", value: t.toLowerCase() };
  if (TX.test(t)) return { kind: "tx", value: t.toLowerCase() };
  // anything else is source only if it looks like Solidity at all; a stray word is not a contract
  if (/\b(contract|library|interface|pragma\s+solidity)\b/.test(t))
    return { kind: "source", value: text, name };
  return null;
}

/** Why nothing happened, in the user's words rather than a validation code. */
export function whyNot(text: string): string {
  const t = text.trim();
  if (!t) return "Paste an address, a transaction hash, or Solidity source.";
  if (/^0x[0-9a-fA-F]*$/.test(t))
    return `That is ${t.length - 2} hex characters. An address has 40, a transaction hash has 64.`;
  return "That does not look like Solidity. A contract, library or interface declaration is what Dort reads.";
}

/* ── the call tree ─────────────────────────────────────────────────────────────────────────── */

/** One node of Geth's `callTracer`, which is what Portaldot's RPC returns. */
export type CallNode = {
  type?: string;
  from?: string;
  to?: string;
  input?: string;
  output?: string;
  gasUsed?: string;
  error?: string;
  revertReason?: string;
  calls?: CallNode[];
  /**
   * Portaldot's node returns the events each call emitted. Worth carrying: a call that moved
   * tokens and emitted nothing, or emitted something nobody indexes, is a finding in its own
   * right, and it is invisible in a trace that only shows the calls.
   */
  logs?: { address?: string; topics?: string[]; data?: string }[];
};

const KINDS: Record<string, FrameKind> = {
  CALL: "CALL",
  STATICCALL: "STATICCALL",
  DELEGATECALL: "DELEGATECALL",
  CALLCODE: "CALLCODE",
  CREATE: "CREATE",
  CREATE2: "CREATE2",
};

const hex = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number.parseInt(v, 16);
  return Number.isFinite(n) ? n : null;
};

const selectorOf = (input: string | undefined): string =>
  input && input.length >= 10 ? input.slice(0, 10).toLowerCase() : "";

/**
 * The tracer's tree as the flat, depth-tagged rows the app already draws (TraceRow).
 *
 * `known` maps a 4-byte selector to a signature, so a call into a contract the app has an ABI for
 * reads as `transfer(address,uint256)` rather than `0xa9059cbb`. Everything else keeps its
 * selector: an honest four bytes beats a guessed name.
 *
 * `events` counts what each call emitted, in the same order as `frames`. It is kept beside the
 * rows rather than inside them because `Frame` mirrors the exporter's own shape (CLAUDE.md: a
 * section's shape changes in both halves or neither), and the exporter does not produce this.
 * One walk fills both, so the two can never fall out of step.
 */
export function readTrace(
  root: CallNode | null | undefined,
  known: Record<string, string> = {},
): { frames: Frame[]; events: number[] } {
  const out: Frame[] = [];
  const events: number[] = [];
  const walk = (n: CallNode, d: number) => {
    events.push(n.logs?.length ?? 0);
    const sel = selectorOf(n.input);
    const sig = known[sel];
    const failed = Boolean(n.error || n.revertReason);
    out.push({
      d,
      kind: KINDS[(n.type ?? "CALL").toUpperCase()] ?? "CALL",
      to: n.to ?? "",
      contract: null,
      file: null,
      fn: sig ?? (sel || (n.type === "CREATE" ? "constructor" : "fallback")),
      args: sig ? "" : (n.input ?? "").slice(10, 74),
      ret: n.revertReason ?? n.error ?? (n.output ?? "").slice(0, 66),
      ok: !failed,
      ...(failed ? { status: n.revertReason ?? n.error ?? "reverted" } : {}),
      gas: hex(n.gasUsed),
    });
    for (const c of n.calls ?? []) walk(c, d + 1);
  };
  if (root) walk(root, 0);
  return { frames: out, events };
}

/** The rows alone, for callers that only draw them. */
export const flattenTrace = (
  root: CallNode | null | undefined,
  known: Record<string, string> = {},
): Frame[] => readTrace(root, known).frames;

/** A one-line summary of what the trace did, for the heading above it. */
export function traceSummary(frames: Frame[]): string {
  if (!frames.length) return "No calls recorded.";
  const failed = frames.filter((f) => !f.ok).length;
  const depth = Math.max(...frames.map((f) => f.d)) + 1;
  const gas = frames[0]?.gas;
  return [
    `${frames.length} ${frames.length === 1 ? "call" : "calls"}`,
    `${depth} ${depth === 1 ? "level" : "levels"} deep`,
    gas ? `${gas.toLocaleString("en-US")} gas` : null,
    failed ? `${failed} reverted` : "none reverted",
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ── what the model is told ────────────────────────────────────────────────────────────────── */

/** On-chain facts gathered before the model is asked anything. */
export type ScanFacts = {
  chain: string;
  /** address scans: whether anything is deployed there, and how big it is */
  bytecodeBytes?: number;
  /** ERC-20 metadata, when the address answers to it */
  token?: { symbol: string; decimals: number } | null;
  /** tx scans */
  from?: string;
  to?: string;
  value?: string;
  status?: "success" | "reverted";
  block?: number;
  frames?: Frame[];
  /** how many events each frame emitted, in frame order (readTrace) */
  events?: number[];
};

/**
 * What a reading of this kind cannot cover. Shown to the user *and* sent to the model, because
 * the failure that matters is a clean bill of health nobody qualified: a reader who is told what
 * was not looked at cannot mistake silence for safety.
 */
export const NOT_CHECKED: Record<ScanKind, string[]> = {
  source: [
    "whether this source is what is actually deployed anywhere",
    "anything the contracts it imports or calls into do",
    "economic design: incentives, oracle choice, liquidity assumptions",
    "whether the tests that exist cover any of it",
  ],
  address: [
    "the source behind this bytecode, unless you paste it too",
    "what the contract does under inputs nobody has sent yet",
    "who holds its privileged roles, beyond what it is willing to tell",
    "anything about the contracts it calls into",
  ],
  tx: [
    "whether the same call would behave this way under different state",
    "the source of any contract in this trace, unless you paste it",
    "what the transaction was meant to do, which only its author knows",
    "anything that did not happen in this transaction",
  ],
};

const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

const frameLines = (frames: Frame[], events: number[] = [], max = 120) => {
  const lines = frames
    .slice(0, max)
    .map((f, i) => {
      const n = events[i] ?? 0;
      // the address goes in whole. Abbreviating it saved about thirty characters and cost a
      // reviewer a guess: shown `0x0000…0001`, a model inferred which precompile it was and
      // named the wrong one. Four honest bytes beat a guessed function name for the same reason.
      return `${"  ".repeat(f.d)}${f.kind} ${f.to || "(none)"}.${f.fn}${
        f.ok ? "" : ` [${f.status}]`
      }${f.gas ? ` (${f.gas} gas)` : ""}${n ? ` emitted ${n}` : ""}`;
    })
    .join("\n");
  // a truncated trace says so: a model reasoning over "every call" when it has 120 of 400 would
  // be confidently wrong about what the transaction did not do
  return frames.length > max
    ? `${lines}\n… ${frames.length - max} further calls not shown`
    : lines;
};

/**
 * The question put to the model. The framing is the product: candidates to check, each with why
 * it matters and how to confirm it, and a refusal to pronounce the thing safe.
 */
export function scanPrompt(input: ScanInput, facts: ScanFacts): string {
  const head = [`<context>`, `Chain: ${facts.chain}`];
  if (input.kind === "source") {
    head.push(
      `Solidity source${input.name ? ` from ${input.name}` : ""}, as given:`,
      "```solidity",
      input.value.slice(0, 60_000),
      "```",
    );
  }
  if (input.kind === "address") {
    head.push(
      `Address: ${input.value}`,
      facts.bytecodeBytes
        ? `Deployed bytecode: ${facts.bytecodeBytes} bytes`
        : "Nothing is deployed at this address.",
      facts.token
        ? `It answers the ERC-20 metadata calls: symbol ${facts.token.symbol}, ${facts.token.decimals} decimals.`
        : "It does not answer the ERC-20 metadata calls.",
    );
  }
  if (input.kind === "tx") {
    head.push(
      `Transaction: ${input.value}`,
      `From ${facts.from} to ${facts.to}${facts.value && facts.value !== "0" ? `, carrying ${facts.value} wei` : ""}`,
      `Status: ${facts.status ?? "unknown"}${facts.block ? `, block ${facts.block}` : ""}`,
      "",
      "The calls it actually made, indented by depth, with the number of events each emitted (from the node's own tracer):",
      frameLines(facts.frames ?? [], facts.events),
      "",
      // measured, not theorised: a reviewer handed this trace reported Portaldot's weight-based
      // figures as "implausibly high gas" and ranked it as a finding. The units are the chain's.
      "Gas is in this chain's own units, which are not Ethereum's and are not comparable to mainnet costs. Treat a figure as evidence only against another figure in this same trace.",
    );
  }
  head.push(
    "",
    "Not available to you here:",
    bullets(NOT_CHECKED[input.kind]),
    "</context>",
    "",
    "Review this as an experienced auditor would on a first pass. Give:",
    "1. What it does, in plain language, in two or three sentences.",
    "2. The things worth checking, most important first. For each: what could go wrong, and the concrete way to confirm or rule it out.",
    "3. What you would want to see before trusting it with money.",
    "",
    "These are candidates for a human to triage, not findings. Do not call it safe, secure or audited, do not score it, and say plainly where the material above was not enough to judge. Never write an exploit or an attack sequence; if something looks exploitable, describe the property that is violated and the test that would catch it.",
  );
  return head.join("\n");
}

/** The three things a reader can hand in, for the empty state to offer. */
export const EXAMPLES: { kind: ScanKind; label: string; hint: string }[] = [
  {
    kind: "tx",
    label: "A transaction hash",
    hint: "0x… 64 characters — Dort traces it on-chain and reads what it did",
  },
  {
    kind: "address",
    label: "A contract address",
    hint: "0x… 40 characters — what is deployed there, and what it answers to",
  },
  {
    kind: "source",
    label: "A .sol file",
    hint: "Upload or paste it; nothing is uploaded anywhere but your own model",
  },
];

/**
 * Several files as one body of source.
 *
 * A real contract is never one file — it imports, and the thing worth reviewing is the set. Each
 * file keeps a header carrying its name so the review can say *where*, which is the difference
 * between a finding a developer can act on and a paragraph they have to go hunting through.
 *
 * Order is the order chosen. A `.sol` that is plainly an interface or a mock is still included:
 * deciding what matters is the reader's call, not the tool's.
 */
export function joinSources(
  files: { name: string; text: string }[],
): { text: string; name: string } | null {
  const real = files.filter((f) => f.text.trim());
  if (!real.length) return null;
  if (real.length === 1) return { text: real[0].text, name: real[0].name };
  return {
    text: real
      .map((f) => `// ─── ${f.name} ───────────────────────────────\n${f.text}`)
      .join("\n\n"),
    name: `${real[0].name} + ${real.length - 1} more`,
  };
}

/** Bigger than any plausible contract; a paste this size is a mistake, not a project. */
export const MAX_SOURCE = 512 * 1024;
