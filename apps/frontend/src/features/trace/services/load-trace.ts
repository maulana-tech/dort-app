import "server-only";
import { readFile } from "node:fs/promises";
import { connection } from "next/server";
import { DORT_DATA_EXPLICIT, DORT_DATA_PATH } from "@/config/env.server";
import sample from "../fixtures/sample-trace.json";
import type { DortData, TraceSource } from "../types";

/**
 * Reads the latest `dort-data.json` on every request so a fresh `node dort-export.mjs` shows up
 * after a refresh, but only when DORT_DATA_PATH points at one. Otherwise (or when that file is
 * missing) nothing is loaded: origin "none", the app opens on its Start page, and the bundled
 * sample rides along for its "Try the sample" button.
 */
export async function loadTrace(): Promise<TraceSource> {
  await connection();
  if (DORT_DATA_EXPLICIT)
    try {
      const raw = await readFile(DORT_DATA_PATH, "utf8");
      return { data: JSON.parse(raw) as DortData, origin: "local" };
    } catch {}
  return { data: sample as DortData, origin: "none" };
}
