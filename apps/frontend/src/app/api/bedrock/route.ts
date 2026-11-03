import { sse } from "@/features/ai/utils/claude-bridge";
import {
  type Bucket,
  hostedModel,
  hostedReady,
  hostedRegion,
  MAX_TOKENS,
  overRate,
  refuseHosted,
} from "@/features/ai/utils/hosted";
import { bedrockUrl, SYSTEM_PROMPT } from "@/features/ai/utils/provider";

/*
 * This deployment's own Amazon Bedrock, so a visitor with no key can still ask something.
 *
 * It is the one place Dort calls a model the user did not bring, and it exists on purpose: a
 * chat that is dead until you paste an API key is a chat most people never see working. The
 * price is stated on the page rather than buried here — questions sent this way, and any code
 * sent with them, go through the AWS account whose key is in this server's environment, and land
 * in that account's logs if model invocation logging is on there. Anyone reviewing a contract
 * they have not published should bring their own key instead; every other provider still does.
 *
 * The key is read here and nowhere else. It is never serialised into a response, never put in a
 * NEXT_PUBLIC_ variable, and never reaches the browser — hosted.check.ts holds the client-bundled
 * files to that. Without the key the route does not pretend: it says so and points at Connect AI.
 */

const env = () => ({
  key: process.env.BEDROCK_API_KEY,
  region: process.env.BEDROCK_REGION,
  model: process.env.BEDROCK_MODEL,
});

/** One brake per server instance: enough that a loop cannot spend the budget, not a quota. */
const seen = new Map<string, Bucket>();

const who = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "local";

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

/** Whether this Dort has a model of its own, so the page can offer it or not. */
export async function GET(): Promise<Response> {
  return Response.json({ ready: hostedReady(env()) });
}

export async function POST(req: Request): Promise<Response> {
  const e = env();
  const body = await req.text();

  const why = refuseHosted({
    method: "POST",
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    fetchSite: req.headers.get("sec-fetch-site"),
    ready: hostedReady(e),
    bytes: body.length,
  });
  if (why)
    return fail(why, why.startsWith("This Dort has no model") ? 503 : 403);

  const now = Date.now();
  const rate = overRate(seen.get(who(req)), now);
  seen.set(who(req), rate.bucket);
  if (rate.over)
    return fail(
      "This Dort's own model is busy with other people for now. Connect AI in the header to use your own — it has no limit but your provider's.",
      429,
    );

  let messages: unknown;
  try {
    const parsed = JSON.parse(body) as { messages?: unknown };
    messages = parsed.messages;
  } catch {
    return fail("That request was not readable.", 400);
  }
  if (!Array.isArray(messages) || messages.length === 0)
    return fail("Nothing to ask.", 400);

  // the model, the region and the token budget are this deployment's, not the caller's: a body
  // that could name them would let any page spend the operator's money on anything it liked
  let upstream: Response;
  try {
    upstream = await fetch(`${bedrockUrl(hostedRegion(e))}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": e.key as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: hostedModel(e),
        max_tokens: MAX_TOKENS,
        stream: true,
        system: SYSTEM_PROMPT,
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return fail("Could not reach Bedrock from this server.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    // the upstream text can carry account detail, so the caller gets the status and nothing else
    return new Response(
      sse({
        error: `This Dort's own model answered ${upstream.status}. Connect AI in the header to use your own instead.`,
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-dort-calls-left": String(rate.left),
        },
      },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-dort-calls-left": String(rate.left),
    },
  });
}
