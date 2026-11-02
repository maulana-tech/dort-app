/**
 * The exporter scripts the app serves from `foundry/` (app/exporter/[file]/route.ts).
 *
 * It lives here, apart from the route, for one reason: a list inside a route handler is a list
 * nothing can test. `exporter-files.check.ts` reads the real `foundry/` directory and fails when
 * the two drift — which is how `dort-relayer.mjs` came to be missing, leaving the bridge's own
 * relayer un-curlable from a running Dort while every other script was served.
 *
 * Two rules the check enforces, both of them boundaries rather than preferences:
 *
 *  1. Every non-test `dort-*.mjs` in `foundry/` is served. Auditors `curl` these into their own
 *     project instead of cloning, so a script that exists but is not served is a script nobody
 *     can get.
 *  2. The list is closed under imports. The exporter scripts import each other and nothing else,
 *     so serving a file whose sibling is missing hands someone a download that cannot run.
 *
 * The allow-list itself is still the security boundary: the route resolves a path under
 * `foundry/` from user input, so only these exact names may ever reach the filesystem.
 */
export const EXPORTER_FILES = [
  "dort-atlas.mjs",
  "dort-bridge.mjs",
  "dort-chains.mjs",
  "dort-coverage.mjs",
  "dort-export.mjs",
  "dort-findings.mjs",
  "dort-lib.mjs",
  "dort-mcp.mjs",
  "dort-protocol.mjs",
  "dort-relayer.mjs",
  "dort-scenario.mjs",
] as const;

/** The only shape a served name may have: no dots, no slashes, nothing to traverse with. */
export const EXPORTER_NAME = /^dort-[a-z]+\.mjs$/;

const SERVED: ReadonlySet<string> = new Set(EXPORTER_FILES);

/**
 * Is this a file the app will serve? Checked by name against the list, never by looking at the
 * filesystem — a name that is not on the list must not become a path at all.
 */
export const isExporterFile = (file: string): boolean => SERVED.has(file);
