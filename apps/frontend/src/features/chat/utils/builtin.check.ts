// node --experimental-strip-types src/features/chat/utils/builtin.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DortData } from "../../trace/types.ts";
import { builtinAnswer, intentOf } from "./builtin.ts";
import { digestOf, EMPTY_DIGEST, SUGGESTIONS } from "./chat.ts";

const sample = JSON.parse(
  readFileSync(
    new URL("../../trace/fixtures/sample-trace.json", import.meta.url),
    "utf8",
  ),
) as DortData;
const real = digestOf(sample, "local");
const demo = digestOf(sample, "sample");

// ── every starter the page offers must get a real answer, not a shrug ──────────────────────
// A built-in mode whose own suggested questions fall through to "ask a model" is worse than no
// built-in mode: it teaches the reader the feature is broken before they type anything.
for (const q of SUGGESTIONS.grounded) {
  assert.notEqual(
    intentOf(q),
    "unknown",
    `a grounded starter is understood: ${q}`,
  );
  const a = builtinAnswer(real, q);
  assert.ok(a.length > 40, `and answered at length: ${q}`);
}

// ── the figures in the answer are the run's, not invented ──────────────────────────────────
const what = builtinAnswer(
  real,
  "What does this project do, in plain language?",
);
assert.ok(what.includes(`${real.total} tests`), "the count is the run's count");
assert.ok(
  what.includes(real.command),
  "and the command is quoted, not described",
);
for (const c of real.contracts.slice(0, 3))
  assert.ok(what.includes(c), `the contracts are named (${c})`);

// no answer may carry a doubled space: an empty interpolation reads as a typo and makes figures
// look careless, which is the opposite of what they are for
for (const d of [real, demo])
  for (const q of SUGGESTIONS.grounded)
    assert.ok(
      !/ {2}/.test(builtinAnswer(d, q)),
      `no doubled space in: ${builtinAnswer(d, q).slice(0, 60)}`,
    );

// ── a passing run is not oversold ──────────────────────────────────────────────────────────
const green = builtinAnswer(real, "Did anything fail?");
if (real.failed === 0) {
  assert.match(green, /Nothing failed/);
  assert.match(
    green,
    /prove the cases somebody thought to write/,
    "all green is reported with what it does not prove",
  );
}

// a failing run quotes the reverts it really recorded
const failing = {
  ...real,
  failed: 2,
  passed: real.total - 2,
  failures: [
    { suite: "VaultTest", name: "test_a", reason: "InsufficientBalance()" },
    { suite: "VaultTest", name: "test_b", reason: "revert: not owner" },
  ],
};
const red = builtinAnswer(failing, "what failed and why?");
assert.ok(red.includes("InsufficientBalance()"));
assert.ok(red.includes("revert: not owner"));
assert.ok(red.includes("test_a") && red.includes("test_b"));

// ── it never claims to have read the code ──────────────────────────────────────────────────
// This is the whole point: figures are figures. Anything that needs a reading of the source has
// to say so and hand over to the reader's own model.
for (const q of [
  "What should I check before trusting this code with money?",
  "Which contract here would you look at first, and why?",
  "Is there a reentrancy bug in this vault?",
]) {
  assert.match(
    builtinAnswer(real, q),
    /Connect AI/,
    `a judgement about code points at the reader's own model: ${q}`,
  );
}

// ── whose code it is, every time ───────────────────────────────────────────────────────────
assert.match(
  builtinAnswer(demo, "What does this project do, in plain language?"),
  /not your project/,
  "the bundled sample is never described as the reader's own",
);
assert.ok(
  !builtinAnswer(
    real,
    "What does this project do, in plain language?",
  ).includes("not your project"),
  "and a real run is not disclaimed away",
);

// ── nothing loaded ─────────────────────────────────────────────────────────────────────────
const nothing = builtinAnswer(EMPTY_DIGEST, "what does this do?");
assert.match(nothing, /No run is loaded/);
assert.match(nothing, /Try the sample vault/, "it says what to do about it");

// ── who is answering ───────────────────────────────────────────────────────────────────────
const who = builtinAnswer(real, "which model answers this?");
assert.equal(intentOf("which model answers this?"), "who");
assert.match(
  who,
  /built-in text/,
  "it does not let itself be mistaken for an AI",
);
assert.match(who, /never calls a model of its own/);

// ── forks ──────────────────────────────────────────────────────────────────────────────────
assert.equal(intentOf("was this run on a testnet fork?"), "forks");
assert.match(
  builtinAnswer({ ...real, forks: [] }, "any forks?"),
  /--forks all/,
  "with no forked runs it says how to make some",
);
assert.match(
  builtinAnswer({ ...real, forks: ["Base Sepolia"] }, "any forks?"),
  /Base Sepolia/,
);

console.log("chat builtin ok");
