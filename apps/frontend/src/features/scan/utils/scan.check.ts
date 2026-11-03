// node --experimental-strip-types src/features/scan/utils/scan.check.ts
import assert from "node:assert/strict";
import {
  type CallNode,
  detect,
  EXAMPLES,
  flattenTrace,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  readTrace,
  type ScanInput,
  scanPrompt,
  traceSummary,
  whyNot,
} from "./scan.ts";

/** detect() returns null for anything it does not recognise; these inputs it must. */
const must = (x: ScanInput | null): ScanInput => {
  assert.ok(x, "detect should have recognised this");
  return x;
};

const ADDR = "0x162Dcf95Eb9df70F314CD4648565E6eb24f85aF8";
const HASH =
  "0xe658fe5c1f0a1c5b2b0d3a4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607535";

// ── what did the reader paste? ─────────────────────────────────────────────────────────────
// 40 hex is an address, 64 is a transaction. Nobody should have to count them, and nobody
// should have to tell the page which one they meant.
assert.deepEqual(detect(ADDR), { kind: "address", value: ADDR.toLowerCase() });
assert.deepEqual(detect(`  ${HASH}  `), { kind: "tx", value: HASH });
assert.equal(detect(ADDR)?.value, ADDR.toLowerCase(), "addresses normalise");
assert.equal(detect(HASH.toUpperCase().replace("0X", "0x"))?.kind, "tx");

// Solidity is recognised by a declaration, not by a file extension: a reader pastes a snippet
// out of an editor as often as they upload a file.
const SRC = "pragma solidity ^0.8.24;\ncontract V { function f() external {} }";
assert.deepEqual(detect(SRC, "V.sol"), {
  kind: "source",
  value: SRC,
  name: "V.sol",
});
assert.equal(detect("library L {}")?.kind, "source");
assert.equal(detect("interface I { function f() external; }")?.kind, "source");
// source keeps its own whitespace — line numbers in a review have to match the file
assert.equal(detect(`\n${SRC}\n`)?.value, `\n${SRC}\n`);

// and what is not any of those gets a reason a person can act on, never a validation code
assert.equal(detect(""), null);
assert.equal(detect("   "), null);
assert.equal(detect("hello"), null);
assert.equal(detect("0xdeadbeef"), null, "too short to be either");
assert.match(whyNot(""), /Paste an address/);
assert.match(whyNot("0xdeadbeef"), /8 hex characters.*40.*64/s);
assert.match(whyNot("hello"), /does not look like Solidity/);

// ── the call tree the node gives us ────────────────────────────────────────────────────────
// Geth's callTracer nests; the app's rows are flat with a depth. The transform is the whole
// reason a transaction hash can be read at all, so it is pinned closely.
const tree: CallNode = {
  type: "CALL",
  from: "0xaaa",
  to: "0xrouter",
  input:
    "0x38ed1739000000000000000000000000000000000000000000000000000000000000002a",
  gasUsed: "0x1e848",
  calls: [
    {
      type: "STATICCALL",
      to: "0xpair",
      input: "0x0902f1ac",
      gasUsed: "0x9c4",
      calls: [],
    },
    {
      type: "CALL",
      to: "0xtoken",
      input: "0xa9059cbb",
      gasUsed: "0x1388",
      error: "execution reverted",
      revertReason: "ERC20: transfer amount exceeds balance",
    },
  ],
};

const known = {
  "0x38ed1739":
    "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0xa9059cbb": "transfer(address,uint256)",
};
const frames = flattenTrace(tree, known);

assert.equal(frames.length, 3, "every node becomes a row");
assert.deepEqual(
  frames.map((f) => f.d),
  [0, 1, 1],
  "depth is the nesting, flattened in call order",
);
assert.deepEqual(
  frames.map((f) => f.kind),
  ["CALL", "STATICCALL", "CALL"],
);
assert.equal(
  frames[0].fn,
  known["0x38ed1739"],
  "a known selector reads as its signature",
);
assert.equal(
  frames[1].fn,
  "0x0902f1ac",
  "and an unknown one keeps its four bytes: an honest selector beats a guessed name",
);
assert.equal(
  frames[0].gas,
  125_000,
  "gas is hex on the wire, a number in the row",
);
assert.equal(frames[1].gas, 2500);

// a revert has to survive the transform, with the reason the chain gave
assert.equal(frames[2].ok, false);
assert.equal(frames[2].status, "ERC20: transfer amount exceeds balance");
assert.equal(frames[0].ok, true);
assert.equal(frames[1].ok, true);

// deeper nesting keeps its shape
const deep = flattenTrace({
  type: "CALL",
  to: "0x1",
  calls: [{ type: "CALL", to: "0x2", calls: [{ type: "CALL", to: "0x3" }] }],
});
assert.deepEqual(
  deep.map((f) => f.d),
  [0, 1, 2],
);

// a tracer that returns nothing, or a node missing every optional field, must not throw: this
// runs against chains whose RPCs answer in their own dialects
assert.deepEqual(flattenTrace(null), []);
assert.deepEqual(flattenTrace(undefined), []);
const bare = flattenTrace({});
assert.equal(bare.length, 1);
assert.equal(bare[0].kind, "CALL", "an unnamed type is a plain call");
assert.equal(bare[0].gas, null, "and missing gas is null, not NaN");
assert.equal(
  bare[0].fn,
  "fallback",
  "a call with no selector hit the fallback",
);
assert.equal(
  flattenTrace({ type: "CREATE", to: "0x9" })[0].fn,
  "constructor",
  "a deployment is not a fallback",
);
assert.equal(
  flattenTrace({ type: "delegatecall", to: "0x9" })[0].kind,
  "DELEGATECALL",
  "a lower-case type from a non-Geth node still maps",
);
assert.equal(
  flattenTrace({ type: "SELFDESTRUCT", to: "0x9" })[0].kind,
  "CALL",
  "an unknown type degrades to CALL rather than breaking the row",
);

// ── the events each call emitted ───────────────────────────────────────────────────────────
// Portaldot's node returns them per call. A transfer that emitted nothing is a finding on its
// own, and it is invisible in a trace that lists only the calls — so the count rides along.
// It is kept beside the rows, not inside them: Frame mirrors the exporter's shape.
const withLogs = readTrace(
  {
    type: "CALL",
    to: "0xvault",
    input: "0xb6b55f25",
    logs: [{ address: "0xvault", topics: ["0xdcbc"] }],
    calls: [
      { type: "CALL", to: "0xtoken", input: "0x23b872dd" },
      {
        type: "CALL",
        to: "0xtoken",
        input: "0xa9059cbb",
        logs: [
          { address: "0xtoken", topics: ["0xddf2"] },
          { address: "0xtoken", topics: ["0x8c5b"] },
        ],
      },
    ],
  },
  known,
);
assert.deepEqual(withLogs.events, [1, 0, 2], "one walk, in frame order");
assert.equal(
  withLogs.events.length,
  withLogs.frames.length,
  "the two can never fall out of step",
);
assert.deepEqual(readTrace(null).events, []);
assert.deepEqual(
  readTrace({ to: "0x1" }).events,
  [0],
  "no logs field is zero, not undefined",
);
// and flattenTrace stays the rows alone, for callers that only draw them
assert.deepEqual(flattenTrace({ to: "0x1" }), readTrace({ to: "0x1" }).frames);

const evented = scanPrompt(must(detect(HASH)), {
  chain: "x",
  frames: withLogs.frames,
  events: withLogs.events,
});
assert.match(evented, /emitted 1/);
assert.match(evented, /emitted 2/);
assert.match(
  evented,
  /0x23b872dd$/m,
  "a call that emitted nothing says nothing, not 'emitted 0'",
);
assert.match(evented, /number of events each emitted/);

// the heading above the trace
assert.match(traceSummary(frames), /3 calls/);
assert.match(traceSummary(frames), /2 levels deep/);
assert.match(traceSummary(frames), /125,000 gas/);
assert.match(traceSummary(frames), /1 reverted/);
assert.match(traceSummary(deep), /none reverted/);
assert.equal(traceSummary([]), "No calls recorded.");
assert.match(
  traceSummary(flattenTrace({ to: "0x1" })),
  /1 call\b/,
  "one call, not calls",
);

// ── the promise this feature makes ─────────────────────────────────────────────────────────
// Every kind of reading names what it could not cover. A tool that stays silent about its
// blind spots is read as a clean bill of health, and that is the one outcome that does harm.
for (const kind of ["source", "address", "tx"] as const) {
  assert.ok(NOT_CHECKED[kind].length >= 3, `${kind} must name its blind spots`);
  for (const line of NOT_CHECKED[kind])
    assert.ok(line.length > 10 && !/^no\b/i.test(line), `vague: ${line}`);
}

const prompt = scanPrompt(must(detect(SRC, "V.sol")), {
  chain: "Portaldot V3",
});
assert.match(
  prompt,
  /```solidity\npragma solidity/,
  "the source goes verbatim",
);
assert.match(prompt, /from V\.sol/, "named, so the answer can cite it");
assert.match(prompt, /Chain: Portaldot V3/);
assert.match(prompt, /Not available to you here:/);
for (const line of NOT_CHECKED.source)
  assert.ok(prompt.includes(line), `the model is told: ${line}`);

// the instruction that keeps this a first pass rather than a verdict
assert.match(prompt, /candidates for a human to triage, not findings/);
assert.match(prompt, /Do not call it safe, secure or audited/);
assert.match(prompt, /do not score it/);
assert.match(prompt, /Never write an exploit/);
assert.match(
  prompt,
  /describe the property that is violated and the test that would catch it/,
  "the defensive escape hatch: a property and a test, never a sequence of moves",
);
// and it asks for something actionable, not a grade
assert.match(prompt, /the concrete way to confirm or rule it out/);

// an address reading says whether anything is even deployed there
const empty = scanPrompt(must(detect(ADDR)), {
  chain: "Portaldot V3",
  bytecodeBytes: 0,
});
assert.match(empty, /Nothing is deployed at this address\./);
const live = scanPrompt(must(detect(ADDR)), {
  chain: "Portaldot V3",
  bytecodeBytes: 4096,
  token: { symbol: "pUSDT", decimals: 6 },
});
assert.match(live, /4096 bytes/);
assert.match(live, /symbol pUSDT, 6 decimals/);
assert.match(
  scanPrompt(must(detect(ADDR)), {
    chain: "x",
    bytecodeBytes: 4096,
    token: null,
  }),
  /does not answer the ERC-20 metadata calls/,
);

// a transaction reading carries the calls it actually made, indented
const tx = scanPrompt(must(detect(HASH)), {
  chain: "Portaldot V3",
  from: "0xaaa",
  to: "0xrouter",
  value: "0",
  status: "reverted",
  block: 303_826,
  frames,
});
assert.match(tx, /Status: reverted, block 303826/);
assert.match(tx, /From 0xaaa to 0xrouter/);
assert.doesNotMatch(
  tx,
  /carrying 0 wei/,
  "a zero-value call does not mention value",
);
assert.match(
  scanPrompt(must(detect(HASH)), { chain: "x", value: "1000" }),
  /carrying 1000 wei/,
);
assert.match(tx, /CALL .*\.swapExactTokensForTokens/);
assert.match(tx, /\n {2}STATICCALL/, "depth is indentation the model can read");
assert.match(tx, /\[ERC20: transfer amount exceeds balance\]/);

// a pathological trace cannot blow the request up
const huge = flattenTrace({
  type: "CALL",
  to: "0x1",
  calls: Array.from({ length: 400 }, () => ({
    type: "CALL" as const,
    to: "0x2",
  })),
});
assert.equal(huge.length, 401);
const bounded = scanPrompt(must(detect(HASH)), { chain: "x", frames: huge });
assert.ok(
  bounded.length < 40_000,
  `a 400-call trace must stay bounded, was ${bounded.length}`,
);

// the empty state offers all three doors
assert.deepEqual(
  EXAMPLES.map((e) => e.kind),
  ["tx", "address", "source"],
);
assert.ok(
  EXAMPLES.every((e) => e.label && e.hint),
  "each door says what it takes",
);

// ── several files are one submission ──────────────────────────────────────────────────────
// A contract that imports is the normal case, so the upload takes a set. Each file is named in
// the body, because "reentrancy in withdraw" is only actionable if the reader knows which file.
assert.equal(joinSources([]), null);
assert.equal(
  joinSources([{ name: "a.sol", text: "   " }]),
  null,
  "blank files are not source",
);
assert.deepEqual(joinSources([{ name: "V.sol", text: SRC }]), {
  text: SRC,
  name: "V.sol",
});

const many = joinSources([
  { name: "Vault.sol", text: "contract Vault {}" },
  { name: "lib/Math.sol", text: "library Math {}" },
  { name: "skip.sol", text: "\n" },
  { name: "IERC20.sol", text: "interface IERC20 {}" },
]);
assert.ok(many);
assert.equal(many.name, "Vault.sol + 2 more", "the blank one is not counted");
assert.match(many.text, /─ Vault\.sol ─/);
assert.match(
  many.text,
  /─ lib\/Math\.sol ─/,
  "the path is kept, not just the basename",
);
assert.match(many.text, /─ IERC20\.sol ─/);
assert.doesNotMatch(many.text, /skip\.sol/);
assert.ok(
  many.text.indexOf("Vault.sol") < many.text.indexOf("Math.sol"),
  "the order chosen is the order sent",
);
// and the joined body is still recognised as source, with its name reaching the prompt
const joined = detect(many.text, many.name);
assert.equal(joined?.kind, "source");
assert.match(
  scanPrompt(must(joined), { chain: "x" }),
  /from Vault\.sol \+ 2 more/,
);

assert.ok(MAX_SOURCE > 100_000, "a real project's flattened source must fit");

console.log("scan ok");
