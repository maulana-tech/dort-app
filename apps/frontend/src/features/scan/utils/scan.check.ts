// node --experimental-strip-types src/features/scan/utils/scan.check.ts
import assert from "node:assert/strict";
import {
  addressesIn,
  type CallNode,
  detect,
  displayFrames,
  EXAMPLES,
  flattenTrace,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  type ScanInput,
  scanPrompt,
  shortHex,
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
  lang: "solidity",
});

// ── four languages, not one ────────────────────────────────────────────────────────────────
// Only Solidity was recognised, so a Move module came back as "that does not look like
// Solidity" — true, and useless. The extension is what the author said, so it wins; the markers
// are the fallback for pasted text with no filename.
assert.equal(detect("module a::b { public entry fun go() {} }")?.lang, "move");
assert.equal(detect("#[program]\npub mod x { }")?.lang, "rust");
assert.equal(
  detect("contract A {}", "A.move")?.lang,
  "move",
  "the extension wins",
);
assert.equal(detect("fn main() {}", "lib.rs")?.lang, "rust");
assert.match(
  scanPrompt(must(detect("module a::b { public entry fun go() {} }")), {
    chain: "x",
  }),
  /Move source/,
);
assert.match(
  scanPrompt(must(detect("#[program]\npub mod x { }")), { chain: "x" }),
  /ownership and lifetimes/,
  "each language is given its own hazards; the wrong ones are worse than none",
);
assert.doesNotMatch(
  scanPrompt(must(detect("module a::b { public entry fun go() {} }")), {
    chain: "x",
  }),
  /reentrancy/,
  "a Move review must not be sent off looking for reentrancy",
);
assert.equal(detect("library L {}")?.kind, "source");
assert.equal(detect("interface I { function f() external; }")?.kind, "source");
// source keeps its own whitespace — line numbers in a review have to match the file
assert.equal(detect(`\n${SRC}\n`)?.value, `\n${SRC}\n`);

// and what is not any of those gets a reason a person can act on, never a validation code
assert.equal(detect(""), null);
assert.equal(detect("   "), null);
assert.equal(detect("hello"), null);
assert.equal(detect("0xdeadbeef"), null, "too short to be either");

// ── a hash inside a sentence ───────────────────────────────────────────────────────────────
// The box invites plain language, so requiring the whole of it to be one bare token made the
// feature reachable only by someone who already knew the trick: "/scan 0x…" and "what does 0x…
// do?" both came back as "that does not look like Solidity".
assert.equal(detect(`/scan ${HASH}`)?.kind, "tx");
assert.equal(detect(`scan ${HASH}`)?.value, HASH, "with or without the slash");
assert.equal(detect(`please check ${ADDR} for me`)?.kind, "address");
assert.equal(
  detect(`/scan ${HASH}`)?.ask,
  undefined,
  "a bare command is not a question, so nothing is put in the model's mouth",
);
assert.equal(
  detect(`what does ${ADDR} do?`)?.ask,
  `what does ${ADDR} do?`,
  "the question goes whole — the sentence with its subject cut out is not a question",
);
assert.match(
  scanPrompt(must(detect(`what does ${ADDR} do?`)), { chain: "x" }),
  /The reader asked, in their own words: what does 0x/,
);
assert.doesNotMatch(
  scanPrompt(must(detect(`/scan ${HASH}`)), { chain: "x" }),
  /The reader asked/,
);

// Solidity wins over any address it happens to contain — source is full of address literals,
// and a pasted contract read as "the first address it mentions" would be the worst kind of wrong
assert.equal(
  detect(`pragma solidity ^0.8.24;\ncontract A { address x = ${ADDR}; }`)?.kind,
  "source",
);
assert.match(whyNot(""), /Paste an address/);
assert.match(whyNot("0xdeadbeef"), /8 hex characters.*40.*64/s);
// the refusal names every language it does read, not only the one it does not
assert.match(whyNot("hello"), /Solidity, Move, Rust and Vyper/);

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

// ── events are rows, not a count ───────────────────────────────────────────────────────────
// The tracer returns the logs each call emitted. A count beside the call answered "how many"
// while hiding the only interesting part: which. A token movement with no Transfer event is a
// finding, and it is invisible unless the events are in the trace. So they become EVENT rows
// nested under the call that emitted them — exactly what the exporter does.
const TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const withLogs = flattenTrace(
  {
    type: "CALL",
    to: "0xvault",
    input: "0xb6b55f25",
    logs: [
      {
        address: "0xvault",
        topics: [
          "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
        ],
      },
    ],
    calls: [
      { type: "CALL", to: "0xtoken", input: "0x23b872dd" },
      {
        type: "CALL",
        to: "0xtoken",
        input: "0xa9059cbb",
        logs: [
          {
            address: "0xtoken",
            topics: [TRANSFER, "0x01", "0x02"],
            data: `0x${"ab".repeat(32)}`,
          },
          {
            address: "0xtoken",
            topics: [
              "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
            ],
          },
        ],
      },
    ],
  },
  known,
  { [TRANSFER]: "Transfer(address,address,uint256)" },
);

assert.deepEqual(
  withLogs.map((f) => [f.kind, f.d]),
  [
    ["CALL", 0],
    ["EVENT", 1],
    ["CALL", 1],
    ["CALL", 1],
    ["EVENT", 2],
    ["EVENT", 2],
  ],
  "each event sits one level under the call that emitted it, before its nested calls",
);
const ev = withLogs.filter((f) => f.kind === "EVENT");
assert.equal(
  ev[1].fn,
  "Transfer(address,address,uint256)",
  "a known topic reads as its event",
);
assert.match(
  ev[0].fn,
  /^0xdcbc1c05…$/,
  "and an unknown one keeps its hash, shortened",
);
assert.equal(ev[1].args, "indexed=2, data=32 bytes");
assert.equal(
  ev[0].args,
  "data=0 bytes",
  "no indexed parameters is not 'indexed=0'",
);
assert.equal(
  ev[0].to,
  "0xvault",
  "the event is attributed to the contract that logged it",
);
assert.equal(ev[0].gas, null, "an event costs no gas of its own");
assert.ok(
  ev.every((f) => f.ok),
  "an event cannot have reverted; the call that emitted it either did or did not",
);
assert.deepEqual(
  flattenTrace({ to: "0x1" }),
  flattenTrace({ to: "0x1", logs: [] }),
);

// the summary counts them apart: six rows is three calls and three events
assert.match(traceSummary(withLogs), /3 calls/);
assert.match(traceSummary(withLogs), /3 events/);
assert.match(
  traceSummary(withLogs),
  /2 levels deep/,
  "depth is the calls' depth; the events sit a level below and must not inflate it",
);
assert.match(traceSummary(frames), /no events/);

// and the prompt shows them with their arguments
const evPrompt = scanPrompt(must(detect(HASH)), {
  chain: "x",
  frames: withLogs,
});
assert.match(
  evPrompt,
  /EVENT 0xtoken\.Transfer\(address,address,uint256\)\(indexed=2, data=32 bytes\)/,
);
assert.match(evPrompt, /and the events they emitted/);

// ── whole for the model, abbreviated for the row ───────────────────────────────────────────
// 42 characters truncates the call itself out of a trace row; the model must still see all of
// it, since the one time it was handed 0x0000…0001 it named the wrong precompile.
const ADDR_LOWER = ADDR.toLowerCase();
assert.equal(shortHex(ADDR_LOWER), "0x162d…5aF8".toLowerCase());
assert.equal(
  shortHex("DortVault"),
  "DortVault",
  "a contract name is left alone",
);
assert.equal(
  shortHex("0x1"),
  "0x1",
  "and so is anything that is not an address",
);

const oneCall = flattenTrace({
  type: "CALL",
  to: ADDR_LOWER,
  input: "0xa9059cbb",
});
assert.equal(oneCall[0].to, ADDR_LOWER, "the row data keeps the whole address");
assert.equal(
  displayFrames(oneCall)[0].to,
  shortHex(ADDR_LOWER),
  "only the drawing abbreviates",
);
assert.match(
  scanPrompt(must(detect(HASH)), { chain: "x", frames: oneCall }),
  new RegExp(ADDR_LOWER),
  "the model is sent the address it will reason about",
);
assert.deepEqual(
  displayFrames(oneCall).map((f) => [f.kind, f.fn, f.gas]),
  oneCall.map((f) => [f.kind, f.fn, f.gas]),
  "nothing but the address changes",
);

// the legend, so no address is only ever seen cut short
assert.deepEqual(addressesIn(withLogs), [
  { full: "0xvault", short: "0xvault" },
  { full: "0xtoken", short: "0xtoken" },
]);
assert.deepEqual(addressesIn(oneCall), [
  { full: ADDR_LOWER, short: shortHex(ADDR_LOWER) },
]);
assert.deepEqual(addressesIn([]), []);
assert.deepEqual(
  addressesIn(flattenTrace({ type: "CREATE" })),
  [],
  "a deployment has no target",
);

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
// the address goes in whole. It was abbreviated once; a reviewer shown "0x0000…0001" guessed
// which precompile it was and named the wrong one, and built a finding on top of that.
assert.match(
  tx,
  /CALL 0xrouter\./,
  "no ellipsis in the address the model reasons about",
);
assert.doesNotMatch(tx, /0x\w{0,6}…/, "nothing in the call lines is elided");
// and the gas figures are labelled as the chain's own. Portaldot's are weight-based and huge;
// a reviewer read them as Ethereum gas and reported "implausibly high" as a candidate finding.
assert.match(tx, /Gas is in this chain's own units/);
assert.match(tx, /not comparable to mainnet costs/);
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
