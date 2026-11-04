import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { DORT_MCP_CONFIG, DORT_MCP_EXPLICIT } from "@/config/env.server";
import { refuse } from "@/features/ai/utils/claude-bridge";
import {
  CALL_MS,
  HANDSHAKE_MS,
  MAX_TOOLS,
  type McpServer,
  parseConfig,
  readFrames,
  rpc,
  textOfResult,
  unqualify,
  usableTools,
} from "@/features/ai/utils/mcp";

/*
 * Dort as an MCP client: the Ask panel using tools that are not Dort's.
 *
 * Local only, behind the same guard as the Claude bridge and Start test — this app's own page on
 * this machine, and a hosted build answers 404. That is not caution for its own sake. This route
 * starts a child process, so if it answered the internet it would be a remote shell.
 *
 * The browser never names a command, a path or a schema. It sends `{}` to GET, or one qualified
 * tool name to POST, and the name is only honoured if it resolves to a server that was already
 * read out of a config file on disk (features/ai/utils/mcp explains the naming). Everything that
 * decides what runs comes from DORT_MCP_CONFIG, which is the operator's, not the request's.
 *
 * One process per request, started and killed around each call rather than pooled. It costs a
 * spawn — tens of milliseconds for a node server — and buys no long-lived state to leak, no
 * session to go stale behind a config edit, and nothing left running when a tab closes. Pool it
 * only when something measured says to.
 */

const hosted = () => !!(process.env.VERCEL || process.env.DORT_HOSTED);

const deny = (why: string) =>
  Response.json({ error: why }, { status: hosted() ? 404 : 403 });

const gate = (req: Request) =>
  refuse({
    host: req.headers.get("host"),
    origin: req.headers.get("origin"),
    fetchSite: req.headers.get("sec-fetch-site"),
    hosted: hosted(),
    method: req.method,
  });

/** How a server is shown to the page: enough to recognise, never enough to re-run from there. */
const shown = (s: McpServer) => `${s.command} ${s.args.join(" ")}`.trim();

/**
 * Start one server, finish the handshake, do the work, and make sure it dies.
 *
 * `finally` is the point of the shape: a server that answered and a server that timed out both
 * have to be killed, and an early return inside the body must not be able to skip that.
 */
async function session<T>(
  s: McpServer,
  body: (
    ask: (method: string, params?: unknown) => Promise<unknown>,
  ) => Promise<T>,
): Promise<T> {
  const child = spawn(s.command, s.args, {
    stdio: ["pipe", "pipe", "pipe"],
    // merged over the parent's, never replacing it: a server usually needs PATH to find node
    env: { ...process.env, ...(s.env ?? {}) },
  });
  const waiting = new Map<
    number,
    { ok: (v: unknown) => void; bad: (e: Error) => void }
  >();
  let buf = "";
  let seq = 0;
  let dead: Error | null = null;
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    const { messages, rest } = readFrames(buf);
    buf = rest;
    for (const m of messages) {
      const msg = m as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      // no id means a notification, which this client does not subscribe to
      if (typeof msg.id !== "number") continue;
      const w = waiting.get(msg.id);
      if (!w) continue;
      waiting.delete(msg.id);
      if (msg.error)
        w.bad(new Error(msg.error.message ?? "the server returned an error"));
      else w.ok(msg.result);
    }
  });
  child.stderr.setEncoding("utf8");
  // servers are chatty on stderr and one line of it is the difference between "it failed" and
  // "it could not find its data file"; keep the tail, not the flood
  child.stderr.on("data", (c: string) => {
    stderr = (stderr + c).slice(-2000);
  });

  const fail = (e: Error) => {
    dead ??= e;
    for (const w of waiting.values()) w.bad(e);
    waiting.clear();
  };
  child.on("error", (e) =>
    fail(new Error(`could not start ${s.command}: ${e.message}`)),
  );
  child.on("exit", (code) => {
    const last = stderr.trim().split("\n").pop();
    fail(
      new Error(
        `${s.name} exited (${code ?? "signal"})${last ? `: ${last}` : ""}`,
      ),
    );
  });

  const ask = (method: string, params?: unknown, ms = CALL_MS) =>
    new Promise<unknown>((ok, bad) => {
      if (dead) return bad(dead);
      const id = ++seq;
      const timer = setTimeout(() => {
        waiting.delete(id);
        bad(new Error(`${s.name} did not answer ${method} within ${ms}ms`));
      }, ms);
      waiting.set(id, {
        ok: (v) => {
          clearTimeout(timer);
          ok(v);
        },
        bad: (e) => {
          clearTimeout(timer);
          bad(e);
        },
      });
      child.stdin.write(rpc(id, method, params));
    });

  try {
    await ask(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "dort", version: "0.1.0" },
      },
      HANDSHAKE_MS,
    );
    child.stdin.write(rpc(null, "notifications/initialized"));
    return await body((method, params) => ask(method, params));
  } finally {
    child.stdin.end();
    child.kill();
  }
}

/** What the config offers, with each server asked for its own tools. */
export async function GET(req: Request) {
  const why = gate(req);
  if (why) return deny(why);

  let raw: string;
  try {
    raw = await readFile(DORT_MCP_CONFIG, "utf8");
  } catch {
    return Response.json({
      config: DORT_MCP_CONFIG,
      explicit: DORT_MCP_EXPLICIT,
      missing: true,
      servers: [],
      problems: [],
    });
  }
  const { servers, problems } = parseConfig(raw);

  // asked in parallel: one slow server should not decide how long the list takes
  const listed = await Promise.all(
    servers.map(async (s) => {
      try {
        const res = (await session(s, (ask) => ask("tools/list"))) as {
          tools?: unknown;
        } | null;
        const { tools, skipped } = usableTools(res?.tools);
        return {
          name: s.name,
          command: shown(s),
          tools: tools.slice(0, MAX_TOOLS).map((t) => ({
            name: t.name,
            description: t.description ?? "",
          })),
          skipped,
          truncated: tools.length > MAX_TOOLS,
        };
      } catch (e) {
        return {
          name: s.name,
          command: shown(s),
          tools: [],
          skipped: [],
          truncated: false,
          error: (e as Error).message,
        };
      }
    }),
  );
  return Response.json({
    config: DORT_MCP_CONFIG,
    explicit: DORT_MCP_EXPLICIT,
    missing: false,
    servers: listed,
    problems,
  });
}

/** Run one tool. The only thing the body may decide is which, by a name the GET already gave out. */
export async function POST(req: Request) {
  const why = gate(req);
  if (why) return deny(why);

  const body = (await req.json().catch(() => null)) as {
    tool?: unknown;
    args?: unknown;
  } | null;
  if (typeof body?.tool !== "string")
    return Response.json({ error: 'no "tool" named' }, { status: 400 });
  const target = unqualify(body.tool);
  if (!target)
    return Response.json(
      { error: `"${body.tool}" is not a tool name this route issues` },
      { status: 400 },
    );
  // arguments are passed through untouched: validating them is the server's job, it owns the
  // schema, and a second opinion here would only be a second thing to keep in step
  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? body.args
      : {};

  let raw: string;
  try {
    raw = await readFile(DORT_MCP_CONFIG, "utf8");
  } catch {
    return Response.json(
      { error: "no MCP config on this machine" },
      { status: 404 },
    );
  }
  // re-read rather than cache: the config is the authority on what may run, and a cached copy
  // would keep a server alive for a page after it was taken out of the file
  const server = parseConfig(raw).servers.find((s) => s.name === target.server);
  if (!server)
    return Response.json(
      { error: `no server "${target.server}" in the config` },
      { status: 404 },
    );

  try {
    const result = await session(server, (ask) =>
      ask("tools/call", { name: target.tool, arguments: args }),
    );
    return Response.json({
      server: target.server,
      tool: target.tool,
      text: textOfResult(result),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
