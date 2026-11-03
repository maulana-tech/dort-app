// node --experimental-strip-types src/features/ai/utils/hosted.check.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  type Bucket,
  HOSTED_MODEL,
  HOSTED_REGION,
  hostedModel,
  hostedModels,
  hostedReady,
  hostedRegion,
  isAnthropicModel,
  MAX_BODY,
  MAX_TOKENS,
  overRate,
  pickModel,
  refuseHosted,
  SUGGESTED_MODELS,
  upstreamBody,
  upstreamHeaders,
  upstreamUrl,
} from "./hosted.ts";

// ── the offer only exists when the operator made it ────────────────────────────────────────
assert.equal(hostedReady({}), false, "no key, no offer");
assert.equal(hostedReady({ key: "" }), false);
assert.equal(hostedReady({ key: "   " }), false, "whitespace is not a key");
assert.equal(hostedReady({ key: "abc" }), true);

// ── the region is a region, never a URL ────────────────────────────────────────────────────
// bedrockUrl builds the host from this, so anything that is not a region name has to fall back
// rather than find its way into a hostname.
assert.equal(hostedRegion({ region: "ap-southeast-1" }), "ap-southeast-1");
assert.equal(hostedRegion({}), HOSTED_REGION, "unset falls back");
for (const bad of [
  "https://evil.test",
  "us-east-1.evil.test",
  "../../etc",
  "us east 1",
  "javascript:alert(1)",
  "",
])
  assert.equal(
    hostedRegion({ region: bad }),
    HOSTED_REGION,
    `not a region: ${bad}`,
  );

assert.equal(hostedModel({}), HOSTED_MODEL, "unset falls back");
assert.equal(hostedModel({ model: "  " }), HOSTED_MODEL);
assert.equal(
  hostedModel({ model: "anthropic.claude-opus-5" }),
  "anthropic.claude-opus-5",
);
// the fallback must be a Bedrock-flavoured id: a plain Anthropic one is not one
assert.match(HOSTED_MODEL, /^anthropic\./);
// and it must be a cheap one: the operator pays for every call made with it
assert.match(
  HOSTED_MODEL,
  /haiku/,
  "the default is the cheap tier, because the operator is the one paying",
);

// ── the reader may pick, but only from the operator's list ─────────────────────────────────
// A request that could name any model would let one page run the operator's budget up on the
// most expensive thing Bedrock sells. The choice is an index into their list, not a free string.
assert.deepEqual(
  hostedModels({}),
  [HOSTED_MODEL, ...SUGGESTED_MODELS],
  "with nothing configured the default leads and the suggestions follow",
);
assert.equal(
  hostedModels({})[0],
  HOSTED_MODEL,
  "whatever else is offered, the cheap one is what answers unasked",
);
assert.deepEqual(
  hostedModels({
    model: "anthropic.claude-haiku-5-5",
    models: "anthropic.claude-sonnet-5-5, anthropic.claude-opus-5-5",
  }),
  [
    "anthropic.claude-haiku-5-5",
    "anthropic.claude-sonnet-5-5",
    "anthropic.claude-opus-5-5",
  ],
  "the default leads, the rest follow in the order given",
);
assert.deepEqual(
  hostedModels({ model: "a", models: "a, b, a, b, " }),
  ["a", "b"],
  "duplicates and blanks are dropped",
);

const offered = { model: "cheap", models: "dear" };
assert.equal(pickModel(offered, "dear"), "dear", "a listed model is honoured");
assert.equal(pickModel(offered, "cheap"), "cheap");
for (const wanted of [
  "anthropic.claude-opus-5-5",
  "",
  null,
  undefined,
  42,
  { model: "dear" },
  ["dear"],
])
  assert.equal(
    pickModel(offered, wanted),
    "cheap",
    `not on the list falls back: ${JSON.stringify(wanted)}`,
  );

// ── one host, two APIs, chosen by the model's own id ───────────────────────────────────────
// Probed against the live host: /anthropic/v1/messages answers in Anthropic's error shape, and
// the OpenAI-shaped route is /v1/chat/completions with no vendor prefix. /openai/v1/... exists
// and answers in the right shape too, which is how it came to be written here — but it 404s
// every model that /v1/chat/completions serves, so the prefix was a silent dead end.
assert.equal(isAnthropicModel("anthropic.claude-haiku-5-5"), true);
for (const m of SUGGESTED_MODELS)
  assert.equal(isAnthropicModel(m), false, `${m} is not an Anthropic model`);

assert.match(
  upstreamUrl("us-east-1", "anthropic.claude-haiku-5-5"),
  /^https:\/\/bedrock-mantle\.us-east-1\.api\.aws\/anthropic\/v1\/messages$/,
);
assert.match(
  upstreamUrl("ap-southeast-1", "minimax.minimax-m2.5"),
  /^https:\/\/bedrock-mantle\.ap-southeast-1\.api\.aws\/v1\/chat\/completions$/,
);

// the host refuses a request carrying both auth headers, so exactly one must be present
for (const m of ["anthropic.claude-haiku-5-5", "zai.glm-4.7-flash"]) {
  const h = upstreamHeaders("KEY", m);
  const auth = ["x-api-key", "authorization"].filter((k) => k in h);
  assert.equal(
    auth.length,
    1,
    `${m} carries exactly one auth header, got ${auth.join("+")}`,
  );
  assert.ok(
    Object.values(h).some((v) => v.includes("KEY")),
    "and it carries the key",
  );
}
assert.ok("x-api-key" in upstreamHeaders("K", "anthropic.claude-haiku-5-5"));
assert.ok("authorization" in upstreamHeaders("K", "minimax.minimax-m2.5"));

// the system prompt is a field on one API and the first message on the other
const turns = [{ role: "user", content: "hi" }];
const a = upstreamBody(
  "anthropic.claude-haiku-5-5",
  turns,
  "RULES",
  99,
) as Record<string, unknown>;
assert.equal(a.system, "RULES");
assert.deepEqual(a.messages, turns, "and the turns are untouched");
const o = upstreamBody("zai.glm-4.7-flash", turns, "RULES", 99) as Record<
  string,
  unknown
>;
const msgs = o.messages as { role: string; content: string }[];
assert.equal(msgs[0].role, "system");
assert.equal(msgs[0].content, "RULES");
assert.deepEqual(msgs.slice(1), turns);
for (const b of [a, o]) {
  assert.equal(b.max_tokens, 99, "both are capped");
  assert.equal(b.stream, true, "and both stream");
}

// the suggested list spans vendors: one company's models is the thing this avoids
assert.ok(
  new Set(SUGGESTED_MODELS.map((m) => m.split(".")[0])).size >= 4,
  "at least four vendors are suggested",
);
assert.deepEqual(
  hostedModels({ models: "only.this" }),
  [HOSTED_MODEL, "only.this"],
  "an operator's own list replaces the suggestions entirely",
);
assert.ok(
  hostedModels({}).length > 1,
  "and with nothing set there is still more than one to pick from",
);

// ── who may spend the operator's money ─────────────────────────────────────────────────────
const ok = {
  method: "POST",
  origin: "https://dort.example",
  host: "dort.example",
  fetchSite: "same-origin" as string | null,
  ready: true,
  bytes: 10,
};
assert.equal(refuseHosted(ok), null, "the app's own page is served");
assert.match(refuseHosted({ ...ok, method: "GET" }) ?? "", /POST/);
assert.match(
  refuseHosted({ ...ok, ready: false }) ?? "",
  /bring your own/,
  "with no key configured it says so, instead of failing obscurely",
);

// an open proxy to a paid model is a bill waiting to be run up by someone else's site
assert.match(
  refuseHosted({ ...ok, fetchSite: "cross-site" }) ?? "",
  /other sites/,
);
assert.match(
  refuseHosted({ ...ok, fetchSite: null, origin: "https://evil.test" }) ?? "",
  /other sites/,
  "an Origin from elsewhere is refused even without Sec-Fetch-Site",
);
assert.match(
  refuseHosted({ ...ok, fetchSite: null, origin: "not a url" }) ?? "",
  /other sites/,
);
assert.match(
  refuseHosted({ ...ok, fetchSite: null, origin: null }) ?? "",
  /other sites/,
  "a bare curl sends neither header and is refused",
);
// a browser on the same host, without Sec-Fetch-Site, is still the app's own page
assert.equal(
  refuseHosted({ ...ok, fetchSite: null }),
  null,
  "same Origin and Host is served",
);
// :443 is https's own port, so URL.host drops it and that origin really is the same one
assert.equal(
  refuseHosted({ ...ok, fetchSite: null, origin: "https://dort.example:443" }),
  null,
  "the default port is the same origin, not a different one",
);
assert.equal(
  refuseHosted({ ...ok, fetchSite: null, origin: "https://dort.example:8443" }),
  "Requests from other sites are refused.",
  "another port is another origin",
);

assert.match(
  refuseHosted({ ...ok, bytes: MAX_BODY + 1 }) ?? "",
  /too long/,
  "an unbounded conversation is not forwarded",
);
assert.equal(
  refuseHosted({ ...ok, bytes: MAX_BODY }),
  null,
  "the limit itself is allowed",
);
assert.ok(MAX_TOKENS > 0 && MAX_TOKENS <= 4096, "and the answer is capped too");

// The brake itself, and its tiers, moved to utils/allowance and are checked there: it now takes
// an allowance rather than owning one, because a single count shared by everyone behind one exit
// address was a brake on a lecture hall rather than on a loop.

console.log("hosted ai ok");
