import { readFile } from "node:fs/promises";
import path from "node:path";
import { isExporterFile } from "@/features/run/utils/exporter-files";

/**
 * Serves the exporter straight from the running app, so an auditor needs no clone:
 * `curl -fsSLO -w "saved %{filename_effective}\n" "<app>/exporter/dort-{export,lib,atlas,findings,coverage,chains}.mjs"` in their Foundry
 * project gets exactly the version this app reads. Allow-listed names only.
 *
 * It reads the repo's foundry/ next to the app, so it serves a local / repo checkout only;
 * a hosted build without foundry/ answers 404. Copy the scripts into public/ at build time if
 * the app is ever hosted for others.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  // allow-listed names only: the name below becomes a path, so nothing else may reach the disk.
  // The list lives in features/run/utils/exporter-files.ts, where a check holds it against the
  // real foundry/ directory — it drifted once and the bridge's relayer went unserved.
  if (!isExporterFile(file)) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(
      path.resolve(process.cwd(), "../../foundry", file),
      "utf8",
    );
    return new Response(body, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Exporter not found next to this app", {
      status: 404,
    });
  }
}
