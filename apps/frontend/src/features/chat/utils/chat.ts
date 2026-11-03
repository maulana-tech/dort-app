/**
 * Chat: the plain-language way in, for someone who is not an auditor.
 *
 * Every other page in Dort asks you to know what you are looking at — a trace, a contract map, a
 * vault form. This one asks for a sentence. It is the same AI the rest of the app uses, under the
 * same rule: the model is always the user's own (features/ai), never a Dort-hosted call, and the
 * system prompt still refuses to write exploits.
 *
 * It works in two modes, in one page, because a newcomer should never meet an empty screen:
 *
 *  - **grounded** — a real run is loaded, so the question is answered against *this* project: how
 *    many tests ran, which failed and why, which contracts the calls went through. The digest
 *    below is what gets sent, and it is deliberately a summary: 41 tests with every frame would
 *    be tens of thousands of tokens of mostly noise, and the useful part of a run is small.
 *  - **general** — no run loaded, so it answers about Solidity and review practice in general and
 *    says plainly that it cannot see any project yet.
 *
 * This file is pure so Node can run chat.check.ts against it; it imports types only.
 */
import type { DortData, TestResult } from "../../trace/types";

/** One line of the conversation. `at` is only for ordering and keys, never sent to the model. */
export type Turn = {
  role: "user" | "assistant";
  content: string;
  at: number;
  /**
   * What the model receives in place of `content`, when the two differ.
   *
   * A contract handed in for review reads as "Review the transaction 0x139c…827e on Portaldot V3"
   * in the thread and arrives at the model as its whole call tree. Without this the thread would
   * have to show either a sentence the model never saw or two thousand characters of trace, and
   * both are lies of a kind: one about what was asked, the other about what a conversation is.
   *
   * A turn carrying `sent` is self-contained — it brings its own context block — so the run
   * digest is never prefixed onto it, and never onto the turns after it either.
   */
  sent?: string;
};

/**
 * What the model is told about the loaded run. A summary, not the run: counts, the failures with
 * their reasons, and the names of the contracts and files involved. That is what a question like
 * "why did this fail?" actually needs.
 */
export type RunDigest = {
  /** there is something to talk about — `origin` decides this, never emptiness */
  loaded: boolean;
  /**
   * what is loaded is the demo vault bundled with the app, because the visitor asked to see it.
   * Worth answering about, but it must never be called their project: that is the one mistake
   * here that would be both convincing and completely wrong.
   */
  sample: boolean;
  generatedAt: string;
  forgeVersion: string;
  command: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  suites: string[];
  /** every failure, with the revert reason the exporter captured */
  failures: { suite: string; name: string; reason: string }[];
  /** contracts the calls went through, most frequent first */
  contracts: string[];
  /** the project's Solidity files */
  files: string[];
  /** set when the whole run was taken on a fork */
  chain: string | null;
  /** the same tests re-run on these chains */
  forks: string[];
};

export const EMPTY_DIGEST: RunDigest = {
  loaded: false,
  sample: false,
  generatedAt: "",
  forgeVersion: "",
  command: "",
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  suites: [],
  failures: [],
  contracts: [],
  files: [],
  chain: null,
  forks: [],
};

const isPass = (t: TestResult) => t.status === "Success";
const isFail = (t: TestResult) => t.status === "Failure";
const isSkip = (t: TestResult) => t.status === "Skipped";

/** Contract names from a test's frames, in the order they were first called. */
function contractsOf(tests: TestResult[]): string[] {
  const seen = new Map<string, number>();
  for (const t of tests)
    for (const f of t.frames) {
      const c = f.contract;
      // `vm` is Foundry's cheatcode address: it shows up in frames but is not a contract in the
      // project, and listing it invites the model to explain a dependency that does not exist
      if (!c || c === "vm" || c === "VM") continue;
      seen.set(c, (seen.get(c) ?? 0) + 1);
    }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/**
 * Summarise a loaded run. `origin` comes from the data-loading gate: "none" means the bundled
 * sample is being shown, which must not be described to the user as their project.
 */
export function digestOf(data: DortData, origin: string): RunDigest {
  if (origin === "none") return EMPTY_DIGEST;
  const tests = data.tests ?? [];
  return {
    loaded: true,
    sample: origin === "sample",
    generatedAt: data.generatedAt ?? "",
    forgeVersion: data.forgeVersion ?? "",
    command: data.command ?? "",
    total: tests.length,
    passed: tests.filter(isPass).length,
    failed: tests.filter(isFail).length,
    skipped: tests.filter(isSkip).length,
    suites: [...new Set(tests.map((t) => t.suite))],
    failures: tests.filter(isFail).map((t) => ({
      suite: t.suite,
      name: t.name,
      reason: t.reason ?? "no reason recorded",
    })),
    contracts: contractsOf(tests),
    files: Object.keys(data.sources ?? {}),
    chain: data.chain?.name ?? null,
    forks: Object.values(data.forks ?? {}).map((f) => f.chain.name),
  };
}

const list = (xs: string[]) => (xs.length ? xs.join("\n") : "none");

/**
 * The `<context>` block. The system prompt already tells the model that everything inside it is
 * data from the user's project and not instructions to follow, which is what keeps a contract
 * named `IGNORE PREVIOUS INSTRUCTIONS` from being one.
 */
export function contextBlock(d: RunDigest): string {
  if (!d.loaded) return "";
  const what = d.sample
    ? "DortVault, the demo vault bundled with Dort. This is NOT the user's own project: say so if they assume it is."
    : "the user's own Foundry project";
  return `<context>
What this run is: ${what}
Foundry run: ${d.total} tests — ${d.passed} passed, ${d.failed} failed${d.skipped ? `, ${d.skipped} skipped` : ""}
Command: ${d.command}
Forge: ${d.forgeVersion}
Exported: ${d.generatedAt}${d.chain ? `\nForked from: ${d.chain}` : ""}${d.forks.length ? `\nAlso run on: ${d.forks.join(", ")}` : ""}

Test suites:
${list(d.suites.map((s) => `- ${s}`))}

Failures:
${list(d.failures.map((f) => `- ${f.suite}.${f.name}: ${f.reason}`))}

Contracts the calls went through:
${list(d.contracts.map((c) => `- ${c}`))}

Solidity files in the project:
${list(d.files.map((f) => `- ${f}`))}
</context>`;
}

/** What a first-time visitor can click instead of staring at an empty box. */
export const SUGGESTIONS: Record<"grounded" | "general", string[]> = {
  grounded: [
    "What does this project do, in plain language?",
    "Did anything fail, and what does the failure mean?",
    "Which contract here would you look at first, and why?",
    "What should I check before trusting this code with money?",
  ],
  general: [
    "What is a smart contract audit, and what does it actually find?",
    "What is reentrancy, and how do contracts defend against it?",
    "Why does rounding matter in a vault?",
    "What should I look for before using a DeFi protocol?",
  ],
};

export const suggestionsFor = (d: RunDigest): string[] =>
  d.loaded ? SUGGESTIONS.grounded : SUGGESTIONS.general;

/** The one-line status the page shows above the thread, so the mode is never a guess. */
export function modeLine(d: RunDigest): string {
  if (!d.loaded)
    return "No run loaded — answers are general, not about your project.";
  const bad = d.failed === 1 ? "1 failed" : `${d.failed} failed`;
  if (d.sample)
    return `Reading the bundled sample vault, not your project: ${d.total} tests, ${bad}.`;
  return `Reading your run: ${d.total} tests, ${bad}.`;
}

/** The badge in the panel header: three states, because two would hide the sample. */
export const modeBadge = (d: RunDigest): "General" | "Sample" | "Your run" =>
  !d.loaded ? "General" : d.sample ? "Sample" : "Your run";

/**
 * The conversation as the provider wants it, with the run's context attached to the first user
 * message only. Sending the digest again on every turn would re-pay for it each time and teach
 * the model that the newest copy is the authoritative one, which it is not — nothing about the
 * run changes mid-conversation.
 */
export function toMessages(
  d: RunDigest,
  turns: Turn[],
): { role: "user" | "assistant"; content: string }[] {
  const ctx = contextBlock(d);
  let first = true;
  return turns.map((t) => {
    // a turn that brought its own context needs none of ours, and settles the conversation's
    // grounding for good: a run digest arriving later would describe a different subject
    if (t.role === "user" && t.sent) {
      first = false;
      return { role: "user" as const, content: t.sent };
    }
    if (t.role !== "user" || !first)
      return { role: t.role, content: t.content };
    first = false;
    const preface = ctx
      ? `${ctx}\n\n`
      : "No Foundry run is loaded, so you cannot see the user's project. Answer generally, and say so in one short sentence if the question is about their code.\n\n";
    return { role: t.role as "user", content: preface + t.content };
  });
}

/** What blocks a send: an empty box, or a stream already open. */
export function canSend(draft: string, busy: boolean): boolean {
  return !busy && draft.trim().length > 0;
}

/** The label for the one send control, which doubles as the stop control while streaming. */
export const sendLabel = (busy: boolean) => (busy ? "Stop" : "Ask");
