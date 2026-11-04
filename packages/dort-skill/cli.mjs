#!/usr/bin/env node
// Installs the Dort agent skill into a project (or a home directory, or stdout).
//
// `npx dort-skill` exists because the alternative was a curl with a URL in it, and a URL is a
// thing people mistype and a thing that changes. This copies one file out of the package you
// just downloaded: no network call of its own, so it works offline and behind a proxy, and the
// file it writes is the one npm's integrity check already verified.
//
// Zero dependencies, like the exporter it belongs to. It reads one file and writes one file.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAME = "dort";

const argv = process.argv.slice(2);
const has = (...flags) => flags.some((f) => argv.includes(f));
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (has("-h", "--help")) {
  process.stdout.write(`dort-skill — install the Dort skill for your coding agent

  npx dort-skill                 into ./.claude/skills/${NAME}/SKILL.md
  npx dort-skill --global        into ~/.claude/skills/${NAME}/SKILL.md
  npx dort-skill --dir <path>    into <path>/SKILL.md
  npx dort-skill --print         to stdout, for an agent that reads skills from somewhere else
  npx dort-skill --force         overwrite a copy you have edited

The skill teaches an agent to read a Dort run: where dort-data.json is, how to walk a decoded
trace, what each atlas field means, and the one rule it must keep — explain the code, never
write the exploit. It pairs with dort-mcp.mjs, which is how the agent asks for one piece at a
time instead of reading the whole file.
`);
  process.exit(0);
}

const skill = readFileSync(path.join(HERE, "SKILL.md"), "utf8");

if (has("--print")) {
  process.stdout.write(skill);
  process.exit(0);
}

const dir = valueOf("--dir")
  ? path.resolve(valueOf("--dir"))
  : has("--global")
    ? path.join(homedir(), ".claude", "skills", NAME)
    : path.resolve(".claude", "skills", NAME);
const target = path.join(dir, "SKILL.md");

// An edited skill is somebody's work. Overwriting it silently because they ran an update is the
// kind of thing a tool gets uninstalled for, so a changed file needs --force; an identical one
// is not a conflict at all and says so.
let existing = null;
try {
  existing = readFileSync(target, "utf8");
} catch {}
if (existing === skill) {
  process.stdout.write(`dort-skill: already up to date at ${target}\n`);
  process.exit(0);
}
if (existing !== null && !has("--force")) {
  process.stderr.write(
    `dort-skill: ${target} exists and differs from this version.\n` +
      "  Keep yours, or run again with --force to replace it.\n" +
      "  (npx dort-skill --print > somewhere.md to compare first.)\n",
  );
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(target, skill);
process.stdout.write(
  `dort-skill: ${existing === null ? "installed" : "updated"} ${target}\n` +
    (has("--global") || valueOf("--dir")
      ? ""
      : "  Claude Code picks up .claude/skills in this project. Restart it if it was running.\n"),
);
