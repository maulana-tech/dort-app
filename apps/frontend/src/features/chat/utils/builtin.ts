/**
 * Answers Dort can give with no model at all.
 *
 * Dort hosts no AI — the rule that matters more than convenience is that an auditor's unpublished
 * source never passes through our infrastructure. But a chat that is dead until you paste an API
 * key is a chat most people never see working, so the app's "none" provider has always meant
 * *built-in text, nothing leaves your machine* (features/ai: `NO_AI`, and the Ask panel's own
 * `aiAnswer`). This is that, for the conversation.
 *
 * Every sentence below is composed from the run's own figures. Nothing is inferred, nothing is
 * invented, and where the question is beyond arithmetic it says so and points at the AI settings page
 * instead of guessing — a confident wrong answer is the one failure this product exists to argue
 * against.
 */
import type { RunDigest } from "./chat";

/** What the built-in answers cover; anything else needs the reader's own model. */
export type Intent =
  | "what"
  | "failures"
  | "where"
  | "checks"
  | "forks"
  | "who"
  | "unknown";

const HAS = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** Which of the handful of questions this is, from the words actually in it. */
export function intentOf(question: string): Intent {
  const q = question.toLowerCase();
  if (HAS(q, "who answers", "which model", "what ai", "is this chatgpt"))
    return "who";
  if (HAS(q, "fail", "revert", "broke", "error")) return "failures";
  if (HAS(q, "fork", "testnet", "chain")) return "forks";
  if (HAS(q, "look at first", "where do i start", "which contract"))
    return "where";
  if (HAS(q, "check", "trust", "safe", "audit", "review")) return "checks";
  if (HAS(q, "what does", "what is this", "what it does", "plain language"))
    return "what";
  return "unknown";
}

const list = (xs: string[], max = 6) =>
  xs.length <= max
    ? xs.join(", ")
    : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`;

const NEEDS_MODEL =
  "That one needs a model that can read the code, which Dort does not host. Open AI settings and bring your own Claude Code, a local model, or your own key — then ask it again.";

const WHO =
  "Nobody yet: this answer is Dort's own built-in text, composed from the run's figures, with no model involved and nothing sent anywhere. Open AI settings to have your own model answer instead — your Claude Code, a local model, or your own key. Dort never calls a model of its own, so a contract you have not published never passes through anyone else's logs.";

/**
 * The built-in answer, or null when the question is beyond what figures alone can settle. The
 * caller shows `null` as the "connect your own AI" note rather than as an answer.
 */
export function builtinAnswer(d: RunDigest, question: string): string {
  const intent = intentOf(question);
  if (intent === "who") return WHO;

  if (!d.loaded)
    return `No run is loaded, so there is nothing of yours for Dort to read. Drop a dort-data.json on the left, or press "Try the sample vault" to look at the bundled demo. ${NEEDS_MODEL}`;

  const whose = d.sample
    ? "the demo vault bundled with Dort (not your project)"
    : "this run";

  switch (intent) {
    case "what":
      return [
        `${d.sample ? `This is ${whose}. It` : "This run"} has ${d.total} tests across ${d.suites.length} ${d.suites.length === 1 ? "suite" : "suites"}: ${d.passed} passing, ${d.failed} failing${d.skipped ? `, ${d.skipped} skipped` : ""}.`,
        `The calls went through ${list(d.contracts)}.`,
        `The project has ${d.files.length} Solidity ${d.files.length === 1 ? "file" : "files"}, and the run was exported with: ${d.command}`,
        "",
        "What the code means, rather than what it measured, is a question for a model.",
        NEEDS_MODEL,
      ].join("\n");

    case "failures":
      if (!d.failed)
        return [
          `Nothing failed: all ${d.passed} of the tests that ran came back green${d.skipped ? `, and ${d.skipped} were skipped` : ""}.`,
          "",
          "That is worth less than it sounds, and it is the honest thing to say: passing tests prove the cases somebody thought to write, not the ones they did not. The useful follow-up is what this suite leaves untested — and that needs a model that can read the code.",
          NEEDS_MODEL,
        ].join("\n");
      return [
        `${d.failed} of ${d.total} tests failed. The reverts the exporter recorded:`,
        "",
        ...d.failures.map((f) => `• ${f.suite}.${f.name}\n  ${f.reason}`),
        "",
        "Those are the messages the chain gave back. Why the contract got there is a question for a model.",
        NEEDS_MODEL,
      ].join("\n");

    case "where":
      return [
        `By how often the calls touched them, the busiest contracts in ${whose} are ${list(d.contracts, 5)}.`,
        "",
        "Busiest is not the same as riskiest, and Dort will not pretend otherwise. Which one deserves your attention is a judgement about the code.",
        NEEDS_MODEL,
      ].join("\n");

    case "forks":
      return d.forks.length
        ? `The same tests were also run against ${list(d.forks)}${d.chain ? `, and this run itself was taken on a fork of ${d.chain}` : ""}. A test that passes locally and fails on a fork is reading live state the local run did not have.`
        : `This run is local only — no forked runs are in the file. Add them with \`node dort-export.mjs --forks all\` and the same tests get taken against each testnet, read-only, with no key and no gas.`;

    case "checks":
      return [
        `Dort can tell you what this run measured: ${d.total} tests, ${d.failed} failing, over ${d.contracts.length} contracts and ${d.files.length} files${d.forks.length ? `, also run against ${list(d.forks, 3)}` : ""}.`,
        "",
        "What to check before trusting code with money is not arithmetic, and a built-in answer here would be a checklist pretending to be a review.",
        NEEDS_MODEL,
      ].join("\n");

    default:
      return [
        `Dort can answer a few things about ${whose} without a model: what the run contains, what failed and why, which contracts the calls went through, and which chains it was run against.`,
        "",
        NEEDS_MODEL,
      ].join("\n");
  }
}
