// node --experimental-strip-types src/features/ai/utils/mcp.check.ts
import assert from "node:assert/strict";
import {
  MAX_RESULT,
  MAX_SERVERS,
  PREFIX,
  parseConfig,
  qualify,
  readFrames,
  SERVER_NAME,
  textOfResult,
  toFunctionTool,
  unqualify,
  usableTools,
} from "./mcp.ts";

// ── routing a call cannot be ambiguous ─────────────────────────────────────────────────────
// This is the whole reason server names exclude the underscore: the qualified name is split to
// decide which child process a call goes to, and a wrong split is a call sent to the wrong
// server with the wrong arguments.
assert.deepEqual(unqualify(qualify("dort", "get_trace")), {
  server: "dort",
  tool: "get_trace",
});
assert.deepEqual(unqualify(qualify("my-server", "a_b__c")), {
  server: "my-server",
  tool: "a_b__c",
});
for (const bad of [
  "get_trace", // unprefixed
  PREFIX, // prefix alone
  `${PREFIX}dort`, // no separator
  `${PREFIX}__get_trace`, // empty server
  `${PREFIX}dort__`, // empty tool
  `${PREFIX}../../etc__passwd`, // a path where a name goes
  `${PREFIX}a b__t`, // a space
  `${PREFIX}dort__$(id)`,
  `${PREFIX}dort__a;rm -rf /`,
])
  assert.equal(unqualify(bad), null, `${bad} must not resolve to a server`);

// a name only resolves if it came from qualify: no server name may contain the separator
assert.ok(
  !SERVER_NAME.test("a_b"),
  "an underscore in a server name is refused",
);
assert.ok(!SERVER_NAME.test("a b"), "a space is refused");
assert.ok(!SERVER_NAME.test("../x"), "a path is refused");
assert.ok(SERVER_NAME.test("dort") && SERVER_NAME.test("my-server-2"));

// ── the config says what may run, and nothing else does ───────────────────────────────────
{
  const { servers, problems } = parseConfig(
    JSON.stringify({
      mcpServers: {
        dort: {
          command: "node",
          args: ["/abs/dort-mcp.mjs", "--data=/abs/dort-data.json"],
        },
        with_underscore: { command: "node", args: [] },
        remote: { url: "https://example.com/mcp" },
        nocommand: { args: ["x"] },
        off: { command: "node", disabled: true },
        badargs: { command: "node", args: "x" },
      },
    }),
  );
  assert.deepEqual(
    servers.map((s) => s.name),
    ["dort"],
    "only the one well-formed stdio server is usable",
  );
  assert.equal(servers[0].args.length, 2);
  // every rejection explains itself: a silent drop is a server the user cannot debug
  const why = problems.join(" | ");
  assert.match(why, /with_underscore/);
  assert.match(why, /remote \(url\) servers are not supported/);
  assert.match(why, /"nocommand": no "command"/);
  assert.match(why, /"badargs": "args" must be an array/);
  assert.ok(
    !why.includes('"off"'),
    "a disabled server is skipped quietly, not reported as broken",
  );
}
// the Claude Desktop / Cursor file, unchanged, is a valid Dort config — the point of the shape
assert.equal(
  parseConfig(
    '{"mcpServers":{"dort":{"command":"node","args":["/a/dort-mcp.mjs"],"env":{"X":"1"}}}}',
  ).servers[0].env?.X,
  "1",
);
// nothing in, nothing out — and a reason either way
assert.deepEqual(parseConfig("{").servers, []);
assert.match(parseConfig("{").problems[0], /not valid JSON/);
assert.match(parseConfig("{}").problems[0], /no "mcpServers" object/);
assert.deepEqual(parseConfig('{"mcpServers":[]}').servers, []);
// a config cannot grow past the ceiling by being long
{
  const many = Object.fromEntries(
    Array.from({ length: MAX_SERVERS + 3 }, (_, i) => [
      `s${i}`,
      { command: "node" },
    ]),
  );
  const { servers, problems } = parseConfig(
    JSON.stringify({ mcpServers: many }),
  );
  assert.equal(servers.length, MAX_SERVERS);
  assert.equal(problems.length, 3);
}

// ── framing ────────────────────────────────────────────────────────────────────────────────
// half a message is not a message: it has to be kept for the next chunk, not parsed.
{
  const a = readFrames('{"id":1}\n{"id":2}\n{"id":3');
  assert.equal(a.messages.length, 2);
  assert.equal(a.rest, '{"id":3');
  const b = readFrames(`${a.rest}}\n`);
  assert.equal(b.messages.length, 1);
  assert.equal(b.rest, "");
  // a server that logs to stdout instead of stderr must not break the session
  assert.deepEqual(readFrames("listening on stdio\n").messages, []);
}

// ── a tool result cannot swamp the context, and an error cannot read as success ────────────
assert.match(
  textOfResult({ content: [{ text: "x" }], isError: true }),
  /^the tool reported an error: x$/,
);
assert.equal(textOfResult({ content: [] }), "(the tool returned nothing)");
assert.equal(textOfResult(null), "(the tool returned nothing)");
{
  const big = textOfResult({ content: [{ text: "a".repeat(MAX_RESULT * 2) }] });
  assert.ok(big.length < MAX_RESULT + 80, "a huge result is clipped");
  assert.match(big, /clipped at/);
}

// ── what reaches the model ──────────────────────────────────────────────────────────────────
// the server's name is carried into the description, so a reader of the transcript can tell
// whose tool answered — two servers may both offer "search".
{
  const t = toFunctionTool("dort", {
    name: "get_trace",
    description: "One test's frames",
  });
  assert.equal(t.function.name, "mcp__dort__get_trace");
  assert.match(t.function.description, /^\[dort] One test's frames/);
  // a tool with no schema still has to present a valid one
  assert.deepEqual(
    toFunctionTool("dort", { name: "overview" }).function.parameters,
    { type: "object", properties: {} },
  );
}
{
  const { tools, skipped } = usableTools([
    { name: "ok_tool" },
    { name: "has space" },
    { name: "" },
    { nope: 1 },
  ]);
  assert.deepEqual(
    tools.map((t) => t.name),
    ["ok_tool"],
  );
  assert.equal(skipped.length, 3, "and every refusal is reportable");
  assert.deepEqual(usableTools("not a list").tools, []);
}

console.log("mcp ok");
