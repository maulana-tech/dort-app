// node --experimental-strip-types src/features/ai/utils/hosted.check.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  type Bucket,
  HOSTED_MODEL,
  HOSTED_REGION,
  hostedModel,
  hostedReady,
  hostedRegion,
  MAX_BODY,
  MAX_TOKENS,
  overRate,
  RATE,
  refuseHosted,
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

// ── the brake ──────────────────────────────────────────────────────────────────────────────
let bucket: Bucket | undefined;
const now = 1_000_000;
for (let i = 0; i < RATE.calls; i++) {
  const r = overRate(bucket, now);
  assert.equal(r.over, false, `call ${i + 1} of ${RATE.calls} goes through`);
  bucket = r.bucket;
}
assert.equal(overRate(bucket, now).over, true, "one more is held back");
// and the window really is a window
assert.equal(
  overRate(bucket, now + RATE.windowMs + 1).over,
  false,
  "later, the calls have aged out",
);
assert.equal(
  overRate(undefined, now).left,
  RATE.calls - 1,
  "a first-time caller is told what is left",
);

// ── the key is read in exactly one place, and that place is the server ─────────────────────
// The one thing that must hold however this is configured. Naming the variable in prose is fine
// and the docs do it; *reading* it anywhere a client component can reach would ship it to every
// visitor. So the rule is about `process.env.BEDROCK…`, not about the name.
const SRC = new URL("../../../", import.meta.url); // src/
const READS: string[] = [];
const walk = (dir: URL) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const at = new URL(`${e.name}${e.isDirectory() ? "/" : ""}`, dir);
    if (e.isDirectory()) {
      walk(at);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".check.ts")) {
      if (/process\.env\.BEDROCK/.test(readFileSync(at, "utf8")))
        READS.push(at.pathname.slice(SRC.pathname.length));
    }
  }
};
walk(SRC);
assert.deepEqual(
  READS,
  ["app/api/bedrock/route.ts"],
  `only the server route may read the key, but these do: ${READS.join(", ")}`,
);

console.log("hosted ai ok");
