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
