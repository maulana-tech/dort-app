// node --experimental-strip-types src/features/chat/utils/chat.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DortData } from "../../trace/types.ts";
import {
  canSend,
  contextBlock,
  digestOf,
  EMPTY_DIGEST,
  modeBadge,
  modeLine,
  SUGGESTIONS,
  sendLabel,
  suggestionsFor,
  type Turn,
  toMessages,
} from "./chat.ts";

// ── the sample must never be described as the user's project ───────────────────────────────
// This is the data-loading gate's rule: "is a real run loaded?" is answered by `origin`, never by
// emptiness. A chat that read the bundled sample and called it "your project" would be lying in
// the most convincing possible way.
const sample = JSON.parse(
  readFileSync(
    new URL("../../trace/fixtures/sample-trace.json", import.meta.url),
    "utf8",
  ),
) as DortData;

const none = digestOf(sample, "none");
assert.deepEqual(
  none,
  EMPTY_DIGEST,
  "origin none yields nothing to talk about",
);
assert.equal(none.loaded, false);
assert.equal(contextBlock(none), "", "and no context block at all");
assert.match(
  modeLine(none),
  /No run loaded/,
  "the page says so rather than implying a project is loaded",
);

// the same bytes, loaded for real, do describe a project
const real = digestOf(sample, "local");
assert.equal(real.loaded, true);
assert.ok(real.total > 0, "the sample has tests when it is loaded as a run");
assert.equal(
  real.passed + real.failed + real.skipped,
  real.total,
  "every test is counted exactly once",
);
assert.ok(real.suites.length > 0, "and at least one suite");
assert.equal(
  new Set(real.suites).size,
  real.suites.length,
  "suites are listed once each",
);
assert.equal(
  new Set(real.contracts).size,
  real.contracts.length,
  "so are contracts",
);

// ── the sample, when the visitor asked for it ──────────────────────────────────────────────
// Pressing "Try the sample vault" means origin "sample": there is something to answer about, and
// it is emphatically not their project. Both halves have to be true at once.
const shown = digestOf(sample, "sample");
assert.equal(shown.loaded, true, "a chosen sample is worth answering about");
assert.equal(shown.sample, true, "and is marked as the sample");
assert.equal(real.sample, false, "a real run is not");
assert.match(
  modeLine(shown),
  /not your project/,
  "the page says whose code it is reading",
);
assert.match(
  contextBlock(shown),
  /NOT the user's own project/,
  "and the model is told too, not left to infer it from a vault's name",
);
assert.equal(modeBadge(none), "General");
assert.equal(modeBadge(shown), "Sample");
assert.equal(modeBadge(real), "Your run");

assert.ok(
  !real.contracts.includes("vm"),
  "Foundry's cheatcode address is not a contract in the project",
);

// ── the context block ──────────────────────────────────────────────────────────────────────
const ctx = contextBlock(real);
assert.match(ctx, /^<context>/, "it is fenced as data");
assert.match(ctx, /<\/context>$/);
assert.ok(
  ctx.includes(`${real.total} tests`),
  "the counts the user can verify on screen are the counts sent",
);
for (const f of real.failures)
  assert.ok(
    ctx.includes(f.name),
    `every failure reaches the model (${f.name})`,
  );
// a summary, not a dump: whole frames would be tens of thousands of tokens of mostly noise
assert.ok(
  ctx.length < 20_000,
  `the digest stays a digest (${ctx.length} chars)`,
);

// ── the run's context is attached once, not on every turn ──────────────────────────────────
const turns: Turn[] = [
  { role: "user", content: "what is this?", at: 1 },
  { role: "assistant", content: "a vault", at: 2 },
  { role: "user", content: "is it safe?", at: 3 },
];
const msgs = toMessages(real, turns);
assert.equal(msgs.length, turns.length, "no turn is added or dropped");
assert.equal(
  msgs.filter((m) => m.content.includes("<context>")).length,
  1,
  "the digest is sent exactly once",
);
assert.ok(msgs[0].content.includes("<context>"), "on the first user turn");
assert.ok(
  msgs[0].content.endsWith("what is this?"),
  "with the question after it",
);
assert.equal(msgs[2].content, "is it safe?", "later turns are sent as typed");
assert.deepEqual(
  msgs.map((m) => m.role),
  turns.map((t) => t.role),
  "roles survive in order",
);

// with nothing loaded the model is told it cannot see the project, instead of being left to guess
const bare = toMessages(none, turns);
assert.ok(!bare[0].content.includes("<context>"));
assert.match(bare[0].content, /No Foundry run is loaded/);
assert.ok(bare[0].content.endsWith("what is this?"));

// a conversation that opens with the assistant should still not carry the context twice
const oddly: Turn[] = [
  { role: "assistant", content: "hello", at: 1 },
  { role: "user", content: "hi", at: 2 },
  { role: "user", content: "again", at: 3 },
];
assert.equal(
  toMessages(real, oddly).filter((m) => m.content.includes("<context>")).length,
  1,
  "still once, on the first user turn wherever it is",
);

// ── the starters ───────────────────────────────────────────────────────────────────────────
// A newcomer must never meet an empty box, and the questions have to suit the mode: asking "did
// anything fail?" with no run loaded would send them at a wall.
assert.equal(suggestionsFor(real), SUGGESTIONS.grounded);
assert.equal(suggestionsFor(none), SUGGESTIONS.general);
for (const set of Object.values(SUGGESTIONS)) {
  assert.ok(set.length >= 3, "enough to pick from");
  for (const q of set) {
    assert.ok(q.endsWith("?"), `a starter is a question: ${q}`);
    assert.ok(q.length < 90, `and short enough to read: ${q}`);
  }
}
// the general set must not promise a view of code it cannot see
for (const q of SUGGESTIONS.general)
  assert.ok(
    !/\bthis (project|code|contract|run)\b/i.test(q),
    `general starters never point at a project (${q})`,
  );

// ── the one control ────────────────────────────────────────────────────────────────────────
assert.equal(canSend("", false), false, "nothing to send");
assert.equal(canSend("   ", false), false, "whitespace is nothing");
assert.equal(canSend("why?", false), true);
assert.equal(
  canSend("why?", true),
  false,
  "a question in flight blocks another",
);
assert.equal(sendLabel(false), "Ask");
assert.equal(sendLabel(true), "Stop", "the send control stops the stream");

console.log("chat ok");
