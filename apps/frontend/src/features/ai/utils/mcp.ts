/**
 * Dort as an MCP *client*: the model in the Ask panel using tools that live outside Dort.
 *
 * Dort has been an MCP server for a while (foundry/dort-mcp.mjs, so your own agent can read a
 * run). This is the other direction, and it has one hard constraint that shapes everything here:
 *
 *   **The browser may never name a command, a path, or a tool schema.**
 *
 * features/ai/utils/tools.ts explains why for the hosted model — a page that could post its own
 * schemas could describe any tool it liked to a model the operator pays for, and the model would
 * describe it back. The same reasoning applies with more force to a child process. So the servers
 * come from a config file on the user's own disk, read by the server half (app/api/mcp), and the
 * browser can only pick a name out of the list it is handed. Spawning something unwanted requires
 * having written it into your own config, which is the trust model every MCP client already has.
 *
 * The config is deliberately the same shape Claude Desktop and Cursor use, so there is nothing
 * new to write: point Dort at the file you already have.
 *
 * Everything in this file is pure so mcp.check.ts can run it under plain Node.
 */

/** One server as the config declares it. `env` is merged over the parent's, never replacing it. */
export type McpServer = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

/** A tool as an MCP server describes it in `tools/list`. */
export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

/**
 * Server names are letters, digits and hyphens — no underscore.
 *
 * Not a style rule: a qualified tool name is `mcp__<server>__<tool>`, and an underscore in a
 * server name would make that string ambiguous to split, so a call could be routed to the wrong
 * server. Tool names may contain underscores (get_trace does), which is why the restriction has
 * to sit on the server side of the separator.
 */
export const SERVER_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/i;
/** What the chat APIs accept as a function name, and therefore the longest a tool name may be. */
export const TOOL_NAME = /^[a-zA-Z0-9_-]{1,56}$/;
export const PREFIX = "mcp__";
const SEP = "__";

export const qualify = (server: string, tool: string) =>
  `${PREFIX}${server}${SEP}${tool}`;

/** The inverse, and the only way a request may say which server to talk to. */
export function unqualify(
  name: string,
): { server: string; tool: string } | null {
  if (!name.startsWith(PREFIX)) return null;
  const rest = name.slice(PREFIX.length);
  const at = rest.indexOf(SEP);
  if (at <= 0) return null;
  const server = rest.slice(0, at);
  const tool = rest.slice(at + SEP.length);
  if (!SERVER_NAME.test(server) || !TOOL_NAME.test(tool)) return null;
  return { server, tool };
}

/** Ceilings, so one answer cannot fill a context window or a server flood the tool list. */
export const MAX_SERVERS = 8;
export const MAX_TOOLS = 32;
export const MAX_RESULT = 20_000;
/** A server that has not finished `initialize` by now is not going to. */
export const HANDSHAKE_MS = 10_000;
export const CALL_MS = 60_000;

/**
 * Read an MCP config.
 *
 * Returns the servers it could use and a plain-language problem for each one it could not, rather
 * than throwing: one broken entry in a file of five should cost you that one entry, and the page
 * should be able to say which and why.
 */
export function parseConfig(raw: string): {
  servers: McpServer[];
  problems: string[];
} {
  const problems: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return {
      servers: [],
      problems: [`not valid JSON: ${(e as Error).message}`],
    };
  }
  const root = json as { mcpServers?: unknown; servers?: unknown } | null;
  const table = (root?.mcpServers ?? root?.servers) as
    | Record<string, unknown>
    | undefined;
  if (!table || typeof table !== "object" || Array.isArray(table))
    return {
      servers: [],
      problems: ['no "mcpServers" object in the config'],
    };

  const servers: McpServer[] = [];
  for (const [name, value] of Object.entries(table)) {
    if (servers.length >= MAX_SERVERS) {
      problems.push(`more than ${MAX_SERVERS} servers: ignoring "${name}"`);
      continue;
    }
    if (!SERVER_NAME.test(name)) {
      problems.push(
        `"${name}": a server name may only hold letters, digits and hyphens (an underscore would make its tool names ambiguous)`,
      );
      continue;
    }
    const s = value as {
      command?: unknown;
      args?: unknown;
      env?: unknown;
      url?: unknown;
      disabled?: unknown;
    } | null;
    if (s?.disabled === true) continue;
    // Only stdio servers. A url server would have Dort open a connection on the user's behalf
    // to a host named in a file, which is a different thing to agree to and is not offered here.
    if (typeof s?.command !== "string" || !s.command.trim()) {
      problems.push(
        s?.url
          ? `"${name}": remote (url) servers are not supported — Dort only runs stdio servers from your own machine`
          : `"${name}": no "command"`,
      );
      continue;
    }
    if (s.args !== undefined && !Array.isArray(s.args)) {
      problems.push(`"${name}": "args" must be an array`);
      continue;
    }
    const args = (s.args ?? []).map(String);
    let env: Record<string, string> | undefined;
    if (s.env !== undefined) {
      if (typeof s.env !== "object" || s.env === null || Array.isArray(s.env)) {
        problems.push(`"${name}": "env" must be an object`);
        continue;
      }
      env = Object.fromEntries(
        Object.entries(s.env as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v),
        ]),
      );
    }
    servers.push({ name, command: s.command.trim(), args, env });
  }
  return { servers, problems };
}

/** One JSON-RPC message, framed the way MCP's stdio transport wants it: one JSON per line. */
export const rpc = (
  id: number | null,
  method: string,
  params?: unknown,
): string =>
  `${JSON.stringify({
    jsonrpc: "2.0",
    ...(id === null ? {} : { id }),
    method,
    ...(params === undefined ? {} : { params }),
  })}\n`;

/**
 * Pull whole lines out of a stdout buffer, keeping the partial tail.
 *
 * A server is free to write a 2 MB tool result in one go, and it will arrive in pieces; half a
 * JSON message is not a message, and parsing one as it arrives is how a client ends up with
 * silent truncation instead of an error.
 */
export function readFrames(buf: string): { messages: unknown[]; rest: string } {
  const lines = buf.split("\n");
  const rest = lines.pop() ?? "";
  const messages: unknown[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    try {
      messages.push(JSON.parse(t));
    } catch {
      // a server that logs to stdout instead of stderr: not fatal, not a message
    }
  }
  return { messages, rest };
}

/** An MCP tool, in the OpenAI function shape every provider here already speaks. */
export function toFunctionTool(server: string, t: McpTool) {
  return {
    type: "function" as const,
    function: {
      name: qualify(server, t.name),
      description: `[${server}] ${t.description ?? t.name}`.slice(0, 1024),
      parameters:
        t.inputSchema && typeof t.inputSchema === "object"
          ? t.inputSchema
          : { type: "object", properties: {} },
    },
  };
}

/** Which of a server's tools may be offered: a valid name, and nothing past the ceiling. */
export function usableTools(tools: unknown): {
  tools: McpTool[];
  skipped: string[];
} {
  const out: McpTool[] = [];
  const skipped: string[] = [];
  if (!Array.isArray(tools)) return { tools: out, skipped };
  for (const t of tools) {
    const tool = t as McpTool;
    if (typeof tool?.name !== "string" || !TOOL_NAME.test(tool.name)) {
      skipped.push(String(tool?.name ?? "(unnamed)"));
      continue;
    }
    out.push({
      name: tool.name,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : undefined,
    });
  }
  return { tools: out, skipped };
}

/**
 * The text of a `tools/call` result, clipped.
 *
 * MCP returns content blocks; a model wants a string. `isError: true` is the server saying the
 * call failed, which is information the model should get rather than an empty success.
 */
export function textOfResult(result: unknown): string {
  const r = result as {
    content?: { type?: string; text?: string }[];
    isError?: boolean;
  } | null;
  const parts = (r?.content ?? [])
    .map((c) => (typeof c?.text === "string" ? c.text : ""))
    .filter(Boolean);
  const body = parts.join("\n").trim() || "(the tool returned nothing)";
  const text = r?.isError ? `the tool reported an error: ${body}` : body;
  return text.length > MAX_RESULT
    ? `${text.slice(0, MAX_RESULT)}\n…clipped at ${MAX_RESULT} characters`
    : text;
}
