import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DORT_DATA_PATH } from "@/config/env.server";
import { refuse } from "@/features/ai/utils/claude-bridge";
import { exportArgs, type RunEvent } from "@/features/run/utils/test-run";

/*
 * Start test (Trace sidebar): runs `node dort-export.mjs` in the Foundry project next to
 * dort-data.json, exactly what the auditor would type, and streams its output back as NDJSON,
 * then the fresh dort-data.json. Local only, behind the same guard as the Claude bridge (this
 * app's own page on this machine; a hosted build answers 404). The page can only choose the
 * local run or one testnet fork, and which tests by name (exportArgs), never a command, flag or
 * path. One run at a time;
 * Stop, a closed tab or the timeout ends the exporter and the forge processes it started.
 */

const hosted = () => !!(process.env.VERCEL || process.env.DORT_HOSTED);
const TIMEOUT_MS = 15 * 60_000;
// a crashing exporter can print megabytes (forge's whole output inside the error): keep the log
// readable and the stream small
const MAX_LINE = 400;
const MAX_LINES = 1500;
let running: ChildProcess | null = null;

/** The exporter and every forge it started: they share its process group (detached). */
const stop = (child: ChildProcess) => {
  if (child.exitCode != null || child.signalCode != null) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
};

export async function POST(req: Request) {
  const why = refuse({
    host: req.headers.get("host"),
    origin: req.headers.get("origin"),
    fetchSite: req.headers.get("sec-fetch-site"),
    hosted: hosted(),
    method: req.method,
  });
  if (why)
    return Response.json({ error: why }, { status: hosted() ? 404 : 403 });
  const args = exportArgs(await req.json().catch(() => null));
  if (typeof args === "string")
    return Response.json({ error: args }, { status: 400 });
  if (running)
    return Response.json(
      { error: "A test run is already going. Wait for it, or stop it." },
      { status: 429 },
    );
  const cwd = path.dirname(DORT_DATA_PATH);
  if (!existsSync(path.join(cwd, "dort-export.mjs")))
    return Response.json(
      {
        error: `No dort-export.mjs in ${cwd}. Download the exporter into your Foundry project (Get started), or point DORT_DATA_PATH at that project's dort-data.json.`,
      },
      { status: 404 },
    );

  // the app's own Node options (dev inspector, loaders) stay out of the exporter
  const { NODE_OPTIONS: _, ...env } = process.env;
  const child = spawn(process.execPath, ["dort-export.mjs", ...args], {
    cwd,
    // written where the app reads it, whatever DORT_DATA_PATH names the file
    // progress lines for the live log; a run of chosen tests merges into the previous export
    env: {
      ...env,
      DORT_OUT: DORT_DATA_PATH,
      DORT_PROGRESS: "1",
      DORT_MERGE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  running = child;
  const started = Date.now();
  const timer = setTimeout(() => stop(child), TIMEOUT_MS);
  req.signal.addEventListener("abort", () => stop(child));

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      const send = (e: RunEvent) => {
        try {
          ctl.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {}
      };
      let lines = 0;
      // the headline of a failure: the exporter's "dort: forge build failed", or Node's Error line
      let firstError = "";
      const pipe = (stream: NodeJS.ReadableStream, warn: boolean) => {
        let buf = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk: string) => {
          buf += chunk;
          const parts = buf.split("\n");
          // a partial line waits for its end (a progress line can be long: the whole test plan)
          buf = (parts.pop() ?? "").slice(-262_144);
          for (const raw of parts) {
            const log = raw.trimEnd();
            if (!log) continue;
            // the exporter's machine lines (DORT_PROGRESS): the plan and each result, not log
            if (!warn && log.startsWith("dort:: ")) {
              try {
                send({ progress: JSON.parse(log.slice("dort:: ".length)) });
              } catch {}
              continue;
            }
            if (warn && !firstError && /failed|Error\b/.test(log))
              firstError = log.slice(0, MAX_LINE);
            if (++lines > MAX_LINES) continue;
            send({
              log: log.length > MAX_LINE ? `${log.slice(0, MAX_LINE)} …` : log,
              ...(warn ? { warn } : {}),
              at: Math.round((Date.now() - started) / 1000),
            });
          }
        });
      };
      pipe(child.stdout as NodeJS.ReadableStream, false);
      pipe(child.stderr as NodeJS.ReadableStream, true);
      let ended = false;
      const end = async (code: number | null, failed?: string) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        if (running === child) running = null;
        const file =
          code === 0 && !failed
            ? await readFile(DORT_DATA_PATH, "utf8").catch(() => undefined)
            : undefined;
        const error = file
          ? undefined
          : (failed ??
            (code == null
              ? "Stopped."
              : code === 0
                ? `The run finished but ${DORT_DATA_PATH} could not be read.`
                : firstError || `The exporter stopped (exit ${code}).`));
        send({ done: true, code, ...(file ? { file } : { error }) });
        try {
          ctl.close();
        } catch {}
      };
      child.on("error", (e) => end(null, e.message));
      child.on("close", (code) => end(code));
    },
    cancel: () => stop(child),
  });
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
