// node --experimental-strip-types src/features/chat/utils/history.check.ts
import assert from "node:assert/strict";
import type { Turn } from "./chat.ts";
import {
  type Conversation,
  HISTORY_KEY,
  HISTORY_MAX,
  OPEN_KEY,
  OPEN_NEW,
  parseHistory,
  remove,
  titleOf,
  upsert,
  whenLabel,
  worthSaving,
} from "./history.ts";

const turn = (role: "user" | "assistant", content: string, at = 1): Turn => ({
  role,
  content,
  at,
});
const convo = (id: string, at: number, title = "q"): Conversation => ({
  id,
  title,
  mode: "Your run",
  at,
  turns: [turn("user", title, at), turn("assistant", "a", at + 1)],
});

// ── the key is part of the contract with the browser ──────────────────────────────────────
assert.equal(
  HISTORY_KEY,
  "dort.chat",
  "the stored key is stable across releases",
);
assert.ok(HISTORY_MAX > 0 && HISTORY_MAX <= 100);

// ── titles ────────────────────────────────────────────────────────────────────────────────
assert.equal(
  titleOf([turn("user", "  why did it fail?  ")]),
  "why did it fail?",
);
assert.equal(
  titleOf([turn("assistant", "hello"), turn("user", "second")]),
  "second",
  "the title is the first question, not the first turn",
);
assert.equal(titleOf([]), "Untitled", "an empty thread still has a label");
assert.equal(
  titleOf([turn("user", "one\ntwo")]),
  "one",
  "only the first line: a pasted trace must not become the title",
);
const long = titleOf([turn("user", "x".repeat(200))]);
assert.ok(long.length <= 72, `a long question is cut (${long.length})`);
assert.ok(long.endsWith("…"), "and says it was cut");

// ── parsing is defensive: this value outlives the code that wrote it ──────────────────────
assert.deepEqual(parseHistory(null), [], "nothing stored");
assert.deepEqual(parseHistory(""), []);
assert.deepEqual(
  parseHistory("{not json"),
  [],
  "a half-written value never throws",
);
assert.deepEqual(parseHistory('{"a":1}'), [], "the wrong shape is dropped");
assert.deepEqual(
  parseHistory("[1,2,3]"),
  [],
  "so are rows that are not conversations",
);
assert.deepEqual(
  parseHistory(JSON.stringify([{ id: "a", turns: [] }])),
  [],
  "a conversation with no usable turn is not one",
);
assert.deepEqual(
  parseHistory(
    JSON.stringify([
      { id: "a", turns: [{ role: "nope", content: "x", at: 1 }] },
    ]),
  ),
  [],
  "an unknown role is not trusted",
);

// a good row survives, and a missing title is recovered from the turns
const parsed = parseHistory(
  JSON.stringify([
    {
      id: "a",
      at: 5,
      turns: [turn("user", "what is this?"), turn("assistant", "a vault")],
    },
  ]),
);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].title, "what is this?");
assert.equal(parsed[0].turns.length, 2);

// newest first, and never more than the cap
const many = parseHistory(
  JSON.stringify(
    Array.from({ length: HISTORY_MAX + 10 }, (_, i) => convo(`c${i}`, i)),
  ),
);
assert.equal(many.length, HISTORY_MAX, "the cap holds on the way in");
assert.equal(many[0].id, `c${HISTORY_MAX + 9}`, "newest first");

// ── one row per conversation, not one per answer ──────────────────────────────────────────
let list: Conversation[] = [];
list = upsert(list, convo("a", 1));
list = upsert(list, convo("a", 2));
assert.equal(list.length, 1, "saving the same thread twice keeps one row");
assert.equal(list[0].at, 2, "and keeps the newer one");
list = upsert(list, convo("b", 3));
assert.deepEqual(
  list.map((c) => c.id),
  ["b", "a"],
  "the one just saved comes first",
);
let full: Conversation[] = [];
for (let i = 0; i < HISTORY_MAX + 5; i++)
  full = upsert(full, convo(`x${i}`, i));
assert.equal(full.length, HISTORY_MAX, "the cap holds on the way out too");

assert.deepEqual(
  remove(list, "a").map((c) => c.id),
  ["b"],
);
assert.deepEqual(
  remove(list, "nope"),
  list,
  "removing what is not there changes nothing",
);

// ── what is worth keeping ─────────────────────────────────────────────────────────────────
assert.equal(worthSaving([]), false);
assert.equal(
  worthSaving([turn("user", "why?")]),
  false,
  "an unanswered question is what the box looked like when the tab closed",
);
assert.equal(
  worthSaving([turn("user", "why?"), turn("assistant", "")]),
  false,
  "and an empty answer is not an answer",
);
assert.equal(
  worthSaving([turn("user", "why?"), turn("assistant", "because")]),
  true,
);

// ── the stamp ─────────────────────────────────────────────────────────────────────────────
const now = new Date("2026-11-02T14:30:00").getTime();
assert.equal(whenLabel(0, now), "", "nothing to stamp");
assert.ok(whenLabel(now, now).length > 0, "today shows a time");
const older = new Date("2026-10-28T09:00:00").getTime();
assert.notEqual(
  whenLabel(older, now),
  whenLabel(now, now),
  "another day reads differently from today",
);

// ── the cursor, and the difference between "nothing open" and "I pressed New" ───────────────
// Relying on the cursor alone lost the thread on reload: it is only written once a thread is
// worth saving, so leaving mid-question came back to an empty box with the work one tab away.
// The newest row is the fallback — but a reader who pressed New asked for an empty box, and the
// two states have to be told apart or coming back would undo the one thing they just asked for.
assert.equal(OPEN_KEY, "dort.chat.open");
assert.notEqual(
  OPEN_KEY,
  HISTORY_KEY,
  "the cursor gets its own key: it changes on every send",
);
assert.equal(OPEN_NEW, "new");
assert.ok(
  !/^c[a-z0-9]/.test(OPEN_NEW),
  "the sentinel must never collide with a real id, which newId() always prefixes with c",
);

console.log("chat history ok");
