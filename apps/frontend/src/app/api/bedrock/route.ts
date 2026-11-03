import { sse } from "@/features/ai/utils/claude-bridge";
import {
  type Bucket,
  hostedModels,
  hostedReady,
  hostedRegion,
  MAX_TOKENS,
  overRate,
  pickModel,
  refuseHosted,
  upstreamBody,
  upstreamHeaders,
  upstreamUrl,
} from "@/features/ai/utils/hosted";
import { SYSTEM_PROMPT } from "@/features/ai/utils/provider";

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
  models: process.env.BEDROCK_MODELS,
});

/** One brake per server instance: enough that a loop cannot spend the budget, not a quota. */
const seen = new Map<string, Bucket>();

const who = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "local";

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

/** Whether this Dort has a model of its own, and which ones it will pay for. */
export async function GET(): Promise<Response> {
  const e = env();
  const ready = hostedReady(e);
  // the list is the operator's, not a suggestion: the POST below honours nothing outside it
  return Response.json({ ready, models: ready ? hostedModels(e) : [] });
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
  let wanted: unknown;
  try {
    const parsed = JSON.parse(body) as { messages?: unknown; model?: unknown };
    messages = parsed.messages;
    wanted = parsed.model;
  } catch {
    return fail("That request was not readable.", 400);
  }
  if (!Array.isArray(messages) || messages.length === 0)
    return fail("Nothing to ask.", 400);

  // the region and the token budget are this deployment's, and the model may only be one the
  // operator put on offer — `pickModel` falls back to the default for anything else, so a body
  // can never spend their money on a model they did not choose to pay for. The model also
  // decides which of Bedrock's two APIs answers: Anthropic's own, or the OpenAI-compatible one
  // every other vendor there speaks.
  const model = pickModel(e, wanted);
  const region = hostedRegion(e);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl(region, model), {
      method: "POST",
      headers: upstreamHeaders(e.key as string, model),
      body: JSON.stringify(
        upstreamBody(model, messages, SYSTEM_PROMPT, MAX_TOKENS),
      ),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return fail("Could not reach Bedrock from this server.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    // the upstream text can carry account detail, so the caller gets the status and nothing else
    return new Response(
      sse({
        error: `${model} answered ${upstream.status}. Pick another model, or Connect AI in the header to use your own.`,
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
