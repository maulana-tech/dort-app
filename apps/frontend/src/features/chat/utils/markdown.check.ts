// node --experimental-strip-types src/features/chat/utils/markdown.check.ts
import assert from "node:assert/strict";
import { type Block, inlineOf, parseMarkdown } from "./markdown.ts";

const kinds = (bs: Block[]) => bs.map((b) => b.k);

// ── the shapes a model actually writes ─────────────────────────────────────────────────────
const doc = parseMarkdown(`**1. What it does**
This calls \`0x5bdd…56f4\` with selector \`0xed14b90c\`.

**2. Things worth checking**
- **Precompile behaviour**
- Repetition without validation

1. Full source
2. A Foundry test

> The trace does not reveal the event data.

---

\`\`\`solidity
function f() external {}
\`\`\``);

assert.deepEqual(kinds(doc), [
  "h",
  "p",
  "h",
  "ul",
  "ol",
  "quote",
  "hr",
  "code",
]);

// a line that is nothing but one bold run is how most models write a heading
const h = doc[0];
assert.equal(h.k === "h" && h.level, 3);
assert.equal(h.k === "h" && h.spans[0].v, "1. What it does");

// consecutive items of the same kind are one list, not one list each
const ul = doc[3];
assert.equal(ul.k === "ul" && ul.items.length, 2);
const ol = doc[4];
assert.equal(ol.k === "ol" && ol.items.length, 2);

// a fence keeps its language and its exact text — it is the part meant to be copied
const code = doc[7];
assert.equal(code.k === "code" && code.lang, "solidity");
assert.equal(code.k === "code" && code.code, "function f() external {}");

// an unclosed fence is still code: dropping it loses the one part of an answer worth copying
const open = parseMarkdown("```\nnode dort-export.mjs");
assert.deepEqual(kinds(open), ["code"]);
assert.equal(open[0].k === "code" && open[0].code, "node dort-export.mjs");

// ── inline marks ───────────────────────────────────────────────────────────────────────────
assert.deepEqual(inlineOf("plain"), [{ t: "text", v: "plain" }]);
assert.deepEqual(inlineOf("a **b** c"), [
  { t: "text", v: "a " },
  { t: "strong", v: "b" },
  { t: "text", v: " c" },
]);
assert.deepEqual(inlineOf("use `cast tx`"), [
  { t: "text", v: "use " },
  { t: "code", v: "cast tx" },
]);
assert.deepEqual(inlineOf("_quietly_"), [{ t: "em", v: "quietly" }]);

// code is literal: asterisks inside a backtick span are asterisks
assert.deepEqual(inlineOf("`a ** b`"), [{ t: "code", v: "a ** b" }]);

// ── what the renderer must never be handed ─────────────────────────────────────────────────
// This text is written by a model that has just read a stranger's contract, and some of that
// contract is in it. The parser returns data, never markup, so there is nothing here that can
// become an element — but a link is the one place an address from that text would be acted on.
const evil = inlineOf("[click](javascript:alert(1))");
assert.equal(evil[0].t, "text", "a javascript: url is never a link");
assert.match(
  evil[0].v,
  /javascript:alert\(1\)/,
  "and it is shown, not dropped: hiding where a model wanted to send someone is worse",
);
assert.equal(inlineOf("[x](http://a.test/b)")[0].t, "link");
assert.equal(inlineOf("[x](https://a.test/b)")[0].t, "link");
assert.equal(
  inlineOf("[x](//evil.test)")[0].t,
  "text",
  "protocol-relative is not a protocol we agreed to",
);
assert.equal(inlineOf("[x](/local)")[0].t, "text");

// raw HTML in the source is text, because the renderer draws text and nothing else
const html = parseMarkdown('<img src=x onerror="alert(1)">');
assert.deepEqual(kinds(html), ["p"]);
assert.equal(
  html[0].k === "p" && html[0].spans[0].v,
  '<img src=x onerror="alert(1)">',
);

// ── nothing is ever lost ───────────────────────────────────────────────────────────────────
// An unrecognised line reads exactly as the model wrote it, which is the right failure.
assert.deepEqual(kinds(parseMarkdown("just a sentence")), ["p"]);
assert.deepEqual(kinds(parseMarkdown("")), []);
assert.deepEqual(kinds(parseMarkdown("\n\n\n")), []);
const run = parseMarkdown("one\ntwo");
assert.equal(run.length, 1, "wrapped lines are one paragraph, not two");
assert.equal(run[0].k === "p" && run[0].spans[0].v, "one two");

console.log("markdown ok");
