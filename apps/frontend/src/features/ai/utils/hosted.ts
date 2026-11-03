/**
 * The deployment's own Bedrock, for people who have no key of their own.
 *
 * This is a deliberate exception to Dort's rule that the model is always the user's. It exists so
 * a first-time visitor can ask something without first opening an AWS console — and the cost of
 * that is real and stated on the page: their question, and whatever code they paste with it, go
 * through the AWS account of whoever runs this deployment, and appear in that account's logs if
 * model invocation logging is on there. An auditor with an unpublished contract should bring
 * their own key; the settings dialog is one click away and every other provider is still BYOK.
 *
 * Nothing here holds a key. The key lives in the server's environment and never crosses into the
 * browser, which is the one thing that must stay true however this is configured.
 */

/** Everything the route needs from the environment, read in one place so the check can drive it. */
export type HostedEnv = {
  key?: string;
  region?: string;
  /** the model to answer with, and the first entry of the list below */
  model?: string;
  /** a comma-separated allow-list the reader may choose from; the default is just `model` */
  models?: string;
};

/** Where an unset region lands. Changing this moves every default answer to another region. */
export const HOSTED_REGION = "us-east-1";
/**
 * What answers by default. Haiku rather than Sonnet because the operator pays for every call:
 * it is the cheapest current-generation Claude by a wide margin — $0.10/$0.50 per million tokens
 * against Sonnet 5.5's $2.00/$10.00 — and still reads code well enough to explain a run. An
 * operator who wants something stronger says so with BEDROCK_MODEL.
 *
 * Bedrock names its Anthropic models with this prefix; a plain Anthropic id is not one.
 */
export const HOSTED_MODEL = "anthropic.claude-haiku-5-5";

/** AWS region names, which is all `region` may ever be: the host is built from it, never taken. */
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;

/** Is this deployment offering its own model at all? No key, no offer. */
export const hostedReady = (env: HostedEnv): boolean =>
  typeof env.key === "string" && env.key.trim() !== "";

/** The region to call, ignoring anything that is not a region. */
export const hostedRegion = (env: HostedEnv): string => {
  const r = (env.region ?? "").trim();
  return REGION.test(r) ? r : HOSTED_REGION;
};

/** The model to call when the reader has not picked one. */
export const hostedModel = (env: HostedEnv): string =>
  (env.model ?? "").trim() || HOSTED_MODEL;

/**
 * Every model this deployment will pay for, the default first.
 *
 * The reader may pick from this list and nothing else. That is the whole point: a request that
 * could name any model would let one page run the operator's budget up on the most expensive
 * thing Bedrock offers, so the choice is an index into the operator's own list rather than a
 * string they wrote.
 */
export function hostedModels(env: HostedEnv): string[] {
  const first = hostedModel(env);
  const rest = (env.models ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== first);
  return [first, ...new Set(rest)];
}

/** The model a request asked for, or the default when it asked for one that is not on offer. */
export const pickModel = (env: HostedEnv, wanted: unknown): string => {
  const list = hostedModels(env);
  return typeof wanted === "string" && list.includes(wanted) ? wanted : list[0];
};

/**
 * Why this request must not be served, or null to serve it.
 *
 * Unlike the Claude bridge, this route is meant to work on a public deploy — so "local only" is
 * not the rule here. The rule is that it answers this app's own pages and nothing else: it spends
 * the operator's money on every call, and an open proxy to a paid model is a bill waiting to be
 * run up by someone else's site.
 */
export function refuseHosted(h: {
  method: string;
  origin: string | null;
  host: string | null;
  fetchSite: string | null;
  ready: boolean;
  bytes: number;
}): string | null {
  if (h.method !== "POST") return "Use POST.";
  if (!h.ready)
    return "This Dort has no model of its own configured. Open Connect AI and bring your own.";
  // a browser sends one or the other; a bare curl sends neither and is refused
  if (h.fetchSite) {
    if (h.fetchSite !== "same-origin")
      return "Requests from other sites are refused.";
  } else if (h.origin) {
    const host = h.host ?? "";
    let from: string;
    try {
      from = new URL(h.origin).host;
    } catch {
      return "Requests from other sites are refused.";
    }
    if (from !== host) return "Requests from other sites are refused.";
  } else {
    return "Requests from other sites are refused.";
  }
  if (h.bytes > MAX_BODY)
    return `That is too long to send: ${Math.round(h.bytes / 1024)} KB, and the limit is ${MAX_BODY / 1024} KB.`;
  return null;
}

/** As much of a conversation as this route will forward. Bigger asks belong on your own key. */
export const MAX_BODY = 128 * 1024;
/** And as much as it will pay to have written back. */
export const MAX_TOKENS = 1536;

/** One caller's recent calls, for the window below. */
export type Bucket = { at: number[] };

/** How many calls one address may make, and over what window. */
export const RATE = { calls: 20, windowMs: 60 * 60_000 };

/**
 * Whether this caller has had their share for now, and what is left. In memory and per instance,
 * so it is a brake rather than a lock — enough that one page cannot spend the operator's budget
 * in a loop, not a claim to be a quota system.
 */
export function overRate(
  bucket: Bucket | undefined,
  now: number,
): { over: boolean; bucket: Bucket; left: number } {
  const at = (bucket?.at ?? []).filter((t) => now - t < RATE.windowMs);
  if (at.length >= RATE.calls) return { over: true, bucket: { at }, left: 0 };
  at.push(now);
  return { over: false, bucket: { at }, left: RATE.calls - at.length };
}
