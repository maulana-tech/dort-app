import type { AiConfig, WalletClaim } from "../types";
import { isTier, tierLine } from "../utils/allowance";
import {
  type ChatMessage,
  chatRequest,
  partOf,
  textOf,
  type Usage,
} from "../utils/provider";
import { MAX_ROUNDS, type ToolCall } from "../utils/tools";

/** Readable error from a failed call; never echoes the request (it carries the key). */
async function failure(res: Response): Promise<Error> {
  let msg = res.statusText;
  try {
    textOf(await res.text());
  } catch (e) {
    if (!(e instanceof SyntaxError)) msg = (e as Error).message;
  }
  return new Error(`${res.status} ${msg}`.trim());
}

function reach(cfg: AiConfig, e: unknown): Error {
  if ((e as Error).name === "AbortError") return e as Error;
  if (cfg.kind === "claude")
    return new Error(
      "Can't reach Dort's Claude bridge. It runs only while this app runs locally (pnpm dev) and is opened at localhost.",
    );
  return new Error(
    cfg.kind === "local"
      ? `Can't reach ${cfg.baseUrl}. Is the model server running, and does it allow this page's origin (CORS)?`
      : "Can't reach the provider (network or CORS).",
  );
}

/**
 * What a stream tells us besides the answer: the model's own working, and what the reply cost.
 *
 * A callback rather than a second thing to yield, so every existing caller is untouched and a
 * page that wants to show the working opts in by passing one.
 */
export type StreamMeta = {
  onThinking?: (piece: string) => void;
  onUsage?: (usage: Usage) => void;
  /** what the reader proved about their wallet, which decides this hour's allowance */
  wallet?: WalletClaim;
  /** what the server said is left, and in whose terms */
  onAllowance?: (left: number, note: string) => void;
  /**
   * Cap the answer. The connection test asks one small question and wants a sentence back, not
   * the 2048 tokens chatRequest allows by default — and on this Dort's own model that ceiling is
   * the operator's money, spent to prove a key works.
   */
  maxTokens?: number;
};

/** Streams the answer text, browser → provider directly (your Claude: through this app's own local bridge). */
export async function* askStream(
  cfg: AiConfig,
  user: string | ChatMessage[],
  signal?: AbortSignal,
  meta?: StreamMeta,
): AsyncGenerator<string> {
  const { url, init } = chatRequest(cfg, user, {
    wallet: meta?.wallet,
    maxTokens: meta?.maxTokens,
  });
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (e) {
    throw reach(cfg, e);
  }
  if (!res.ok || !res.body) throw await failure(res);
  // what is left of this hour, as the server counted it — the page says so rather than letting
  // a reader meet the limit without warning
  const left = res.headers.get("x-dort-calls-left");
  const tier = res.headers.get("x-dort-tier");
  if (left !== null && isTier(tier))
    meta?.onAllowance?.(Number(left), tierLine(tier, Number(left)));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const part = partOf(l.slice(5).trim());
      if (part.thinking) meta?.onThinking?.(part.thinking);
      if (part.usage) meta?.onUsage?.(part.usage);
      if (part.text) yield part.text;
    }
  }
}

/** One tiny non-streamed call: proves the endpoint, key and model all work. */
export async function testConnection(cfg: AiConfig): Promise<string> {
  const { url, init } = chatRequest(cfg, "Reply with the single word: ok", {
    stream: false,
    maxTokens: 16,
  });
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw reach(cfg, e);
  }
  if (!res.ok) throw await failure(res);
  return textOf(await res.text()).trim();
}

/**
 * One question, with the model allowed to ask the chain for things first.
 *
 * Dort still reads the evidence before the first question — that is what makes an answer
 * checkable — and this is for the turns after it, where the subject is not known until the
 * reader names it. "And what about the token it called?" has no trace attached to it.
 *
 * The rounds are not streamed: a tool call has to be read whole before it can be run, and half
 * of one is not one. Only the final answer streams, which is the only part anybody watches.
 *
 * Bounded by MAX_ROUNDS, and by stopping the moment the model stops asking. A loop that could
 * not end would spend the operator's money on the operator's behalf, in a page they are not
 * looking at.
 *
 * Hosted only, for now. The schemas live on the server (features/ai/utils/tools), and a BYOK
 * provider would need them posted from the browser, which is the one arrangement this design
 * exists to avoid.
 */
export async function* askWithTools(
  cfg: AiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
  meta?: StreamMeta,
  onTool?: (name: string, arg: string) => void,
  runTool?: (call: ToolCall) => Promise<string>,
): AsyncGenerator<string> {
  if (cfg.kind !== "dort" || !runTool) {
    yield* askStream(cfg, messages, signal, meta);
    return;
  }

  const sent: unknown[] = [...messages];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch("/api/bedrock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: sent,
        tools: true,
        stream: false,
        ...(cfg.model ? { model: cfg.model } : {}),
        ...(meta?.wallet ? { wallet: meta.wallet } : {}),
      }),
      signal,
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      error?: string;
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: {
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
    };
    if (json.error) throw new Error(json.error);
    const msg = json.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!calls.length) {
      // nothing to fetch: let the streaming pass produce the answer the reader reads
      break;
    }
    sent.push(msg);
    for (const c of calls) {
      const call: ToolCall = {
        id: c.id ?? "",
        name: c.function?.name ?? "",
        args: c.function?.arguments ?? "{}",
      };
      onTool?.(call.name, call.args);
      const content = await runTool(call);
      sent.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  yield* askStream(cfg, sent as ChatMessage[], signal, meta);
}
