// node --experimental-strip-types src/features/run/utils/skill.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXPORTER_FILES } from "./exporter-files.ts";

/**
 * Holds the agent skill against the things it promises.
 *
 * `public/skill/dort/SKILL.md` is instructions for somebody else's coding agent, which makes a
 * wrong sentence in it worse than a wrong sentence in the docs: nobody reads it before acting on
 * it. It shipped with three claims that were simply false — a `sys` value the exporter never
 * writes, `find` described as a finding id when it is the source line a piece sits on, and
 * coverage called per-function when it is per-line — and every one of them would have sent an
 * agent looking for a field that is not there.
 *
 * So each name the skill uses is checked against the half of the repo that produces it: the
 * exporter scripts it tells you to curl, the MCP tools it tabulates, and the atlas vocabulary it
 * explains. None of this can be kept true by remembering to.
 */
const skillPath = new URL(
  "../../../../public/skill/dort/SKILL.md",
  import.meta.url,
);
const skill = readFileSync(skillPath, "utf8");
const foundry = new URL("../../../../../../foundry/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, foundry), "utf8");

// ── 1. it is a skill at all ────────────────────────────────────────────────────────────────
// An agent picks a skill by its frontmatter; without `name` and `description` it is just a file.
const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill);
assert.ok(fm, "SKILL.md opens with YAML frontmatter");
assert.match(fm[1], /^name: dort$/m, "the skill is named dort");
const desc = /^description: (.+)$/m.exec(fm[1]);
assert.ok(desc, "the frontmatter carries a description");
assert.ok(
  desc[1].length > 120,
  "the description says when to use the skill, which takes more than a line",
);
// the one product rule that must survive every edit: Dort is defensive-only.
assert.match(
  skill,
  /never writes exploit code/i,
  "the description states the defensive-only rule, where an agent reads it before loading",
);
assert.match(skill, /No exploit code\./, "and the body spells it out");

// ── 2. every script it tells you to curl is actually served ────────────────────────────────
// The skill uses brace expansion — dort-{export,lib,…}.mjs — so a name that drifted out of
// EXPORTER_FILES becomes a 404 in the middle of somebody's setup.
const brace = /dort-\{([a-z,]+)\}\.mjs/.exec(skill);
assert.ok(brace, "the skill curls the exporter by brace expansion");
for (const stem of brace[1].split(","))
  assert.ok(
    (EXPORTER_FILES as readonly string[]).includes(`dort-${stem}.mjs`),
    `the skill curls dort-${stem}.mjs, which the app does not serve`,
  );
// and the MCP server, which it names on its own line
assert.ok(
  (EXPORTER_FILES as readonly string[]).includes("dort-mcp.mjs"),
  "dort-mcp.mjs is served, since the skill tells an agent to curl it",
);

// ── 3. every MCP tool in its table exists ──────────────────────────────────────────────────
const mcp = read("dort-mcp.mjs");
const real = new Set(
  [...mcp.matchAll(/name: '([a-z_]+)'/g)]
    .map((m) => m[1])
    .filter((n) => n !== "dort"),
);
assert.ok(real.size >= 6, "the MCP server's tool names were found");
const tabulated = [...skill.matchAll(/^\| `([a-z_]+)[(`]/gm)].map((m) => m[1]);
assert.ok(tabulated.length >= 6, "the skill tabulates the MCP tools");
for (const t of tabulated)
  assert.ok(
    real.has(t),
    `the skill documents MCP tool ${t}, which does not exist`,
  );
for (const t of real)
  assert.ok(
    tabulated.includes(t),
    `the MCP server offers ${t}, which the skill never mentions`,
  );

// ── 4. the atlas vocabulary it explains is the vocabulary the exporter writes ───────────────
// This is the mistake that happened: `sys == "fn"` reads perfectly and matches nothing.
const atlas = read("dort-atlas.mjs");
const named = [
  ...skill.matchAll(/`(entry|access|logic|storage|calls|deps|events|vulns)`/g),
].map((m) => m[1]);
assert.ok(named.length > 0, "the skill names atlas piece kinds");
for (const sys of new Set(named))
  assert.match(
    atlas,
    new RegExp(`['"\`]${sys}['"\`]`),
    `the skill explains sys "${sys}", which dort-atlas.mjs never produces`,
  );
// and no example may select on a kind that does not exist
for (const m of skill.matchAll(/\.sys == "([a-z]+)"/g))
  assert.ok(
    new Set(named).has(m[1]),
    `an example selects sys "${m[1]}", which is not one of the kinds the exporter writes`,
  );

// ── 5. the npm package ships the same skill, and can still install it ──────────────────────
// `npx dort-skill` copies packages/dort-skill/SKILL.md; the app serves
// public/skill/dort/SKILL.md. Two files is the price of npm being unable to pack anything
// outside the package root, so this assertion is the only thing keeping them honest.
const packaged = readFileSync(
  new URL("../../../../../../packages/dort-skill/SKILL.md", import.meta.url),
  "utf8",
);
assert.equal(
  packaged,
  skill,
  "packages/dort-skill/SKILL.md and public/skill/dort/SKILL.md must be the same file",
);
const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../packages/dort-skill/package.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { bin?: Record<string, string>; files?: string[]; name?: string };
assert.equal(pkg.name, "dort-skill");
assert.equal(
  pkg.bin?.["dort-skill"],
  "cli.mjs",
  "the bin npx runs is the cli in the package",
);
// a `files` list that forgets SKILL.md publishes an installer with nothing to install
for (const f of ["cli.mjs", "SKILL.md"])
  assert.ok(pkg.files?.includes(f), `the package ships ${f}`);

console.log(
  `skill ok (${tabulated.length} mcp tools, ${new Set(named).size} piece kinds, packaged)`,
);
