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

/**
 * Which language a handed-in file is in.
 *
 * Only Solidity was recognised, so a Move module or a Solana program came back as "that does not
 * look like Solidity" — true, and useless. The reading itself is language-agnostic: what changes
 * is the fence the source goes in and the hazards worth naming, and naming the wrong ones is how
 * a review of a Move module ends up talking about reentrancy.
 */
export type SourceLang = "solidity" | "move" | "rust" | "vyper";

/** Extension first — it is what the author said — then the markers only that language has. */
const BY_EXT: Record<string, SourceLang> = {
  sol: "solidity",
  move: "move",
  rs: "rust",
  vy: "vyper",
};

const MARKS: [SourceLang, RegExp][] = [
  [
    "solidity",
    /\b(pragma\s+solidity|contract\s+\w+|library\s+\w+|interface\s+\w+)\b/,
  ],
  [
    "move",
    /\b(module\s+[\w:]+\s*\{|public\s+entry\s+fun|use\s+std::|acquires)\b/,
  ],
  ["rust", /(#\[program\]|declare_id!|#\[derive\(|\bpub\s+fn\b|\bimpl\s+\w+)/],
  ["vyper", /(@external|@internal|@payable)\s*\n\s*def\s+\w+/],
];

export function langOf(text: string, name?: string): SourceLang | null {
  const ext = name?.toLowerCase().split(".").pop() ?? "";
  if (BY_EXT[ext]) return BY_EXT[ext];
  for (const [lang, re] of MARKS) if (re.test(text)) return lang;
  return null;
}

/** What each language's reviewer is told to keep in mind. Wrong hazards are worse than none. */
const HAZARDS: Record<SourceLang, string> = {
  solidity:
    "reentrancy and call ordering, integer and rounding direction, access control, external call return values, and upgrade or proxy storage layout",
  move: "resource ownership and the abilities (copy, drop, store, key), signer checks on entry functions, aborts and their codes, and what can be taken from a struct held under an address",
  rust: "ownership and lifetimes across instruction boundaries, account validation and signer checks, arithmetic overflow in release builds, and anything trusting a passed-in account without constraining it",
  vyper:
    "the absence of reentrancy locks where they are needed, integer bounds, @external surface, and the differences from Solidity that make a habit from one unsafe in the other",
};

export type ScanInput = {
  kind: ScanKind;
  /** the address or hash, lower-cased; or the source text as given */
  value: string;
  /** set when the source came from a file the user chose */
  name?: string;
  /** which language the source is in; absent for an address or a transaction */
  lang?: SourceLang;
  /**
   * What the reader actually typed around the hash, when they typed anything. "what does 0x…
   * do?" is a question about a transaction, not a bare subject, and throwing the words away
   * would answer something they did not ask.
   */
  ask?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;
/** the same two, found as a word inside a sentence rather than as the whole of it */
const EMBEDDED = /\b0x(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{40})\b/;

/**
 * What the user pasted. An address and a transaction hash differ only in length, which is exactly
 * the kind of thing a person gets wrong at 2am — so the page never asks them to say which it is.
 */
export function detect(text: string, name?: string): ScanInput | null {
  const t = text.trim();
  if (!t) return null;
  if (ADDRESS.test(t)) return { kind: "address", value: t.toLowerCase() };
  if (TX.test(t)) return { kind: "tx", value: t.toLowerCase() };

  // source before any embedded hash: a contract is full of address literals, and one pasted in
  // would otherwise be read as whichever address it happens to mention first
  const lang = langOf(t, name);
  if (lang) return { kind: "source", value: text, name, lang };

  // a hash sitting inside a sentence. The box invites plain language, so "/scan 0x139c…" and
  // "what does 0x162d… do?" have to work; requiring the whole box to be one bare token made
  // the feature reachable only by people who already knew the trick.
  const found = t.match(EMBEDDED);
  if (found) {
    const hit = found[0];
    // a leading "/scan" is the command, not part of the question
    const said = t
      .replace(/^\/?(scan|read|check|audit|trace)\b[:\s]*/i, "")
      .trim();
    // the question goes to the model whole, hash and all: it is already in the context block
    // above, and "what does do?" — the sentence with its subject cut out — is not a question
    const words = said.replace(hit, " ").replace(/\s+/g, " ").trim();
    return {
      kind: hit.length === 42 ? "address" : "tx",
      value: hit.toLowerCase(),
      ...(words ? { ask: said } : {}),
    };
  }
  return null;
}

/** How each language is written out for a reader and for the model. */
const LANG_NAME: Record<SourceLang, string> = {
  solidity: "Solidity",
  move: "Move",
  rust: "Rust",
  vyper: "Vyper",
};

/** Why nothing happened, in the user's words rather than a validation code. */
export function whyNot(text: string): string {
  const t = text.trim();
  if (!t) return "Paste an address, a transaction hash, or Solidity source.";
  if (/^0x[0-9a-fA-F]*$/.test(t))
    return `That is ${t.length - 2} hex characters. An address has 40, a transaction hash has 64.`;
  return "That is not source Dort recognises. It reads Solidity, Move, Rust and Vyper — by the file's extension, or by a declaration it can see in the text.";
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
 * A 42-character address, or a 66-character hash, is unreadable in a trace row or a sentence. It
 * is kept whole wherever it is data — only what a person reads is ever shortened.
 */
export const shortHex = (a: string): string =>
  /^0x[0-9a-fA-F]{20,}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

const bytesOf = (data: string | undefined, from: number) =>
  Math.max(0, Math.ceil(((data ?? "").length - from) / 2));

/**
 * The tracer's tree as the flat, depth-tagged rows the app already draws (TraceRow).
 *
 * `known` maps a 4-byte selector to a signature, so a call into a contract the app has an ABI for
 * reads as `transfer(address,uint256)` rather than `0xa9059cbb`. `knownEvents` does the same for
 * a log's first topic. Everything else keeps its raw hash: an honest four bytes beats a guessed
 * name, and a reviewer handed a guess builds on it.
 *
 * Events become rows of their own, nested under the call that emitted them, because that is what
 * the exporter does (`kind: "EVENT"`) and the drawing code already knows how to render it. The
 * alternative — a count beside each call — was what this did first, and it answered "how many"
 * while hiding the only interesting part: *which*. A token movement with no Transfer event is a
 * finding, and it is invisible unless the events are in the trace.
 *
 * `args` is never raw calldata. The rows are drawn by splitting `name=value` pairs, so a 64-digit
 * hex blob came out as both the name and the value of one unreadable pair; undecodable calldata
 * is honestly reported as its length instead.
 */
export function flattenTrace(
  root: CallNode | null | undefined,
  known: Record<string, string> = {},
  knownEvents: Record<string, string> = {},
): Frame[] {
  const out: Frame[] = [];
  const walk = (n: CallNode, d: number) => {
    const sel = selectorOf(n.input);
    const sig = known[sel];
    const failed = Boolean(n.error || n.revertReason);
    const data = bytesOf(n.input, 10);
    out.push({
      d,
      kind: KINDS[(n.type ?? "CALL").toUpperCase()] ?? "CALL",
      to: n.to ?? "",
      contract: null,
      file: null,
      fn: sig ?? (sel || (n.type === "CREATE" ? "constructor" : "fallback")),
      args: data ? `calldata=${data} bytes` : "",
      ret: n.revertReason ?? n.error ?? (n.output ?? "").slice(0, 66),
      ok: !failed,
      ...(failed ? { status: n.revertReason ?? n.error ?? "reverted" } : {}),
      gas: hex(n.gasUsed),
    });
    // the call's own events, before the calls it went on to make
    for (const log of n.logs ?? []) {
      const topic = (log.topics?.[0] ?? "").toLowerCase();
      out.push({
        d: d + 1,
        kind: "EVENT",
        to: log.address ?? n.to ?? "",
        contract: null,
        file: null,
        fn: knownEvents[topic] ?? (topic ? `${topic.slice(0, 10)}…` : "log"),
        args: [
          (log.topics?.length ?? 0) > 1
            ? `indexed=${(log.topics?.length ?? 1) - 1}`
            : null,
          `data=${bytesOf(log.data, 2)} bytes`,
        ]
          .filter(Boolean)
          .join(", "),
        ret: "",
        ok: true,
        gas: null,
      });
    }
    for (const c of n.calls ?? []) walk(c, d + 1);
  };
  if (root) walk(root, 0);
  return out;
}

/**
 * The same rows with their addresses abbreviated, for drawing only.
 *
 * Two shapes on purpose: the model is sent the whole address (it guessed which precompile
 * `0x0000…0001` was, and named the wrong one), while a row 42 characters wide truncates the call
 * itself out of the line. `addressesIn` then gives the panel a legend, so nothing is only ever
 * shown abbreviated.
 */
export const displayFrames = (frames: Frame[]): Frame[] =>
  frames.map((f) => ({ ...f, to: shortHex(f.to) }));

/** Every address the transaction touched, first seen first — the legend under the trace. */
export function addressesIn(
  frames: Frame[],
): { short: string; full: string }[] {
  const seen = new Map<string, string>();
  for (const f of frames)
    if (f.to && !seen.has(f.to)) seen.set(f.to, shortHex(f.to));
  return [...seen].map(([full, short]) => ({ full, short }));
}

/** A one-line summary of what the trace did, for the heading above it. */
export function traceSummary(frames: Frame[]): string {
  if (!frames.length) return "No calls recorded.";
  const calls = frames.filter((f) => f.kind !== "EVENT");
  const events = frames.length - calls.length;
  const failed = frames.filter((f) => !f.ok).length;
  const depth = Math.max(...calls.map((f) => f.d)) + 1;
  const gas = frames[0]?.gas;
  return [
    `${calls.length} ${calls.length === 1 ? "call" : "calls"}`,
    `${depth} ${depth === 1 ? "level" : "levels"} deep`,
    events ? `${events} ${events === 1 ? "event" : "events"}` : "no events",
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
  /** a page a reader can open to see this for themselves, where the chain has one */
  explorer?: string | null;
  /** and the request that would ask the chain the same question, where it has not */
  probe?: string | null;
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

const frameLines = (frames: Frame[], max = 120) => {
  const lines = frames
    .slice(0, max)
    .map(
      (f) =>
        // the address goes in whole. Abbreviating it saved about thirty characters and cost a
        // reviewer a guess: shown `0x0000…0001`, a model inferred which precompile it was and
        // named the wrong one. Four honest bytes beat a guessed function name for the same reason.
        `${"  ".repeat(f.d)}${f.kind} ${f.to || "(none)"}.${f.fn}${
          f.args ? `(${f.args})` : ""
        }${f.ok ? "" : ` [${f.status}]`}${f.gas ? ` (${f.gas} gas)` : ""}`,
    )
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
    const lang = input.lang ?? "solidity";
    head.push(
      `${LANG_NAME[lang]} source${input.name ? ` from ${input.name}` : ""}, as given:`,
      `\`\`\`${lang}`,
      input.value.slice(0, 60_000),
      "```",
      "",
      `Worth keeping in mind for this language: ${HAZARDS[lang]}.`,
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
      ...(facts.explorer ? [`A reader can open it at ${facts.explorer}.`] : []),
    );
  }
  if (input.kind === "tx") {
    head.push(
      `Transaction: ${input.value}`,
      `From ${facts.from} to ${facts.to}${facts.value && facts.value !== "0" ? `, carrying ${facts.value} wei` : ""}`,
      `Status: ${facts.status ?? "unknown"}${facts.block ? `, block ${facts.block}` : ""}`,
      "",
      "The calls it actually made and the events they emitted, indented by depth (from the node's own tracer):",
      frameLines(facts.frames ?? []),
      "",
      // measured, not theorised: a reviewer handed this trace reported Portaldot's weight-based
      // figures as "implausibly high gas" and ranked it as a finding. The units are the chain's.
      ...(facts.explorer
        ? ["", `A reader can open this transaction at ${facts.explorer}.`]
        : []),
      "Gas is in this chain's own units, which are not Ethereum's and are not comparable to mainnet costs. Treat a figure as evidence only against another figure in this same trace.",
    );
  }
  if (input.ask)
    head.push("", `The reader asked, in their own words: ${input.ask}`);
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

/**
 * What the reader sees in the thread when they hand something in.
 *
 * The model gets `scanPrompt` — a call tree, a bytecode size, a whole contract. Showing that in a
 * chat thread would bury the conversation; showing a sentence the model never received would
 * misrepresent it. So the turn carries both (chat `Turn.sent`), and this is the half a person
 * reads: short, specific, and naming the chain, because the same address on another chain is a
 * different contract and that mistake is silent.
 */
export function subjectLabel(input: ScanInput, chain?: string): string {
  const on = chain ? ` on ${chain}` : "";
  if (input.kind === "source")
    return `Review the Solidity I handed in${input.name ? `: ${input.name}` : ""}.`;
  return `Review the ${input.kind === "tx" ? "transaction" : "contract"} ${shortHex(input.value)}${on}.`;
}
