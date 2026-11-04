import "server-only";
import path from "node:path";

/**
 * Where `dort-export.mjs` writes its output. Defaults to the repo's `foundry/`
 * project; point DORT_DATA_PATH at any Foundry project's dort-data.json.
 */
/**
 * True when the user pointed the app at a run. The app (Trace, Atlas) only reads the export then;
 * without it the app starts empty, on its Start page. The landing still reads the default path.
 */
export const DORT_DATA_EXPLICIT = Boolean(process.env.DORT_DATA_PATH);

export const DORT_DATA_PATH =
  process.env.DORT_DATA_PATH ??
  path.resolve(process.cwd(), "../../foundry/dort-data.json");

/**
 * Where to find the MCP servers Dort's own Ask panel may use (app/api/mcp).
 *
 * A path, never a server: the browser cannot name a command, so the only way something gets
 * spawned is by being written into a config file on this machine. Unset, Dort looks for the
 * project's own `.mcp.json` — the same file Claude Code reads — and offers nothing if there is
 * none. Point this at `~/.cursor/mcp.json` or your Claude Desktop config to reuse what you have.
 */
export const DORT_MCP_CONFIG =
  process.env.DORT_MCP_CONFIG ?? path.resolve(process.cwd(), "../../.mcp.json");

/** True when the operator named a config explicitly, which the page says out loud. */
export const DORT_MCP_EXPLICIT = Boolean(process.env.DORT_MCP_CONFIG);
