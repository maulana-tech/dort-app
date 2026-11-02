// node --experimental-strip-types src/features/run/utils/exporter-files.check.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  EXPORTER_FILES,
  EXPORTER_NAME,
  isExporterFile,
} from "./exporter-files.ts";

const foundry = new URL("../../../../../../foundry/", import.meta.url);
const onDisk = readdirSync(foundry).filter(
  (f) =>
    f.startsWith("dort-") && f.endsWith(".mjs") && !f.endsWith(".test.mjs"),
);
assert.ok(onDisk.length > 5, "the foundry directory was found and has scripts");

// ── 1. every script that exists is served ──────────────────────────────────────────────────
// Auditors curl these instead of cloning, so a script nobody can download is a script nobody
// has. This is the rule dort-relayer.mjs broke.
const served = [...EXPORTER_FILES];
assert.deepEqual(
  [...onDisk].sort(),
  [...served].sort(),
  "the allow-list and foundry/ must hold exactly the same scripts",
);

// ── 2. nothing is listed that is not there ─────────────────────────────────────────────────
// (implied by the equality above, but stated on its own so a failure says which way it broke)
for (const f of served)
  assert.ok(onDisk.includes(f), `${f} is served but missing from foundry/`);

// ── 3. the list is closed under imports ────────────────────────────────────────────────────
// Downloading a script whose sibling is not served hands someone a file that cannot run.
const importsOf = (file: string): string[] => {
  const src = readFileSync(new URL(file, foundry), "utf8");
  const found = new Set<string>();
  for (const m of src.matchAll(
    /^\s*import[^;]*?from\s+['"]\.\/(dort-[a-z]+\.mjs)['"]/gm,
  ))
    found.add(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]\.\/(dort-[a-z]+\.mjs)['"]/g))
    found.add(m[1]);
  return [...found];
};
let edges = 0;
for (const f of served)
  for (const dep of importsOf(f)) {
    edges++;
    assert.ok(
      isExporterFile(dep),
      `${f} imports ${dep}, which the app does not serve`,
    );
  }
assert.ok(
  edges > 0,
  "the parser really did find imports; a silent zero would prove nothing",
);

// ── 4. the exporter stays dependency-free ──────────────────────────────────────────────────
// The scripts may import each other and node: builtins, never npm and never the app. A served
// script that needs an install is not copy-pasteable, which is the whole point of serving them.
for (const f of served) {
  const src = readFileSync(new URL(f, foundry), "utf8");
  for (const m of src.matchAll(/^\s*import[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1];
    assert.ok(
      spec.startsWith("node:") || EXPORTER_NAME.test(spec.replace("./", "")),
      `${f} imports ${spec}: the exporter may only use node: builtins and its siblings`,
    );
  }
}

// ── 5. a served name can never become a path ───────────────────────────────────────────────
// The route resolves the name under foundry/, so the shape of the name is the security boundary.
for (const f of served)
  assert.match(f, EXPORTER_NAME, `${f} must be a plain script name`);
for (const bad of [
  "../package.json",
  "dort-export.mjs/../../.env",
  "..%2Fpackage.json",
  "dort-Export.mjs",
  "dort-export.mjs ",
  "",
  ".env",
  "dort-lib.mjs.bak",
])
  assert.equal(
    isExporterFile(bad),
    false,
    `${bad || "(empty)"} must not be served`,
  );

// the names people actually ask for still work
for (const f of ["dort-export.mjs", "dort-relayer.mjs", "dort-scenario.mjs"])
  assert.equal(isExporterFile(f), true);

console.log(`exporter files ok (${served.length} scripts, ${edges} imports)`);
