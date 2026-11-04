---
name: dort
description: Read a Solidity contract through a Dort run — decoded Foundry traces, the contract map, merged Slither/Aderyn findings and line coverage, all in one JSON file. Use when a repo contains dort-data.json or a foundry.toml, when asked what a test actually did, which function changed which storage slot, who can call what, or to write a Foundry test for intended behaviour. Defensive only — never writes exploit code.
---

# Dort

Dort runs a project's Foundry tests and writes one file, `dort-data.json`: every test's call
tree decoded with the project's own ABIs and source maps, a map of the contract built from the
compiler's AST and storage layout, Slither and Aderyn findings pinned to the piece they belong
to, and lcov coverage — which lines were hit, and how often.

Read that file instead of re-running `forge test -vvvv` and parsing it yourself. The decoding is
the part that is easy to get wrong: raw trace output gives you selectors and hex words, and this
gives you function names, named arguments, return values, the storage slots each frame touched
and the source lines it executed.

**The rule this tool exists for: you explain, the human judges.** Say what the code does and what
you are unsure about. Do not deliver a verdict on whether a contract is safe, and do not write
exploit code — see *Refuse* below.

## 1. Find a run

```sh
ls dort-data.json || find . -maxdepth 3 -name dort-data.json
```

Check it is not stale before you trust it: `generatedAt` is an ISO timestamp and `command` is the
exact `forge` invocation that produced it. If the contracts changed after that, make a new one.

## 2. Make one if there is none

The exporter is plain Node with no dependencies. Fetch it into the Foundry project root and run it:

```sh
curl -fsSLO "https://dort-app.vercel.app/exporter/dort-{export,lib,atlas,findings,coverage,chains,protocol,scenario}.mjs"
node dort-export.mjs                    # every test, local EVM
node dort-export.mjs --mt test_deposit  # one test (add DORT_MERGE=1 to keep the others)
node dort-export.mjs --chain base-sepolia
```

It wants forge 1.8.x for per-line source steps; on 1.9 it still writes everything else and says
which part it skipped. Atlas, findings and coverage are each non-fatal: a failure there prints
`dort: … skipped — …` and the traces are still written.

## 3. Prefer the MCP server

Reading a 20 MB JSON into context to answer one question is the wrong move. `dort-mcp.mjs` serves
the same file over MCP (stdio, JSON-RPC) so you ask for exactly the part you need:

```sh
curl -fsSLO "https://dort-app.vercel.app/exporter/dort-mcp.mjs"
claude mcp add dort -- node /abs/path/dort-mcp.mjs --data=/abs/path/dort-data.json
```

| Tool | Gives you |
|---|---|
| `overview` | contract, file, compiler, every test and its status, finding counts, coverage totals, and the scenario model `propose_scenario` accepts |
| `get_trace(test)` | one test's decoded frames, args and returns clipped, executed lines as ranges, storage ops counted |
| `get_atlas` | every mapped piece with its line, plus what each entry point reads, writes, calls and emits, in order |
| `get_piece(id)` | one piece: its source lines, links, findings, reverts, coverage |
| `list_findings(severity?, tool?)` | Slither, Aderyn and Dort findings, filterable |
| `propose_scenario` | write a Lab scenario that tests intended behaviour (validated; see *Refuse*) |

Call `overview` first. It is small and it tells you what the other calls can ask for.

## 4. Or read the JSON directly

Use `jq` and project out what you need — never cat the whole file.

```sh
jq '{at: .generatedAt, cmd: .command, tests: [.tests[] | {name, status}]}' dort-data.json
jq '.tests[] | select(.name | startswith("test_deposit")) | .frames[] | {d, kind, contract, fn, args, ret, ok}' dort-data.json
jq '.atlas.pieces[] | select(.sys == "entry") | {id, name, line, caller, links}' dort-data.json
jq '.atlas.pieces[] | select(.sys == "vulns") | {id, name, risk, tool, line}' dort-data.json
jq '.atlas.coverage | {tool, lines, branches, functions}' dort-data.json
```

The shape, as the exporter writes it:

- `generatedAt`, `forgeVersion`, `command` — provenance. Read these first.
- `tests[]` — `suite`, `file`, `name`, `status`, `kind`, `reason` (why it reverted), `transfers`,
  and `frames[]`.
- `frames[]` — `d` is the call depth, so the tree is flat and indented by `d`. Then `kind`
  (`call`, `staticcall`, `delegatecall`, `create`, …), `to`, `contract`, `file`, `fn`, `args`,
  `ret`, `ok`, `status`, `gas`, `events`, `lines` (source lines executed) and `storage` (the slots
  read and written).
- `atlas.pieces[]` — the map. `sys` says which kind each piece is: `entry` (a public entry
  point, with `caller` — often the literal string `anyone`), `access` (modifiers and guards),
  `logic`, `storage` (with `slot`, and `mapping` when it is one), `calls`, `deps`, `events`, and
  `vulns` (a finding: `risk` is `high`/`med`/`low`/`info`, `tool` is `slither`/`aderyn`/`manual`,
  `detector` names the rule, `reports[]` holds every tool that reported it). Every piece has
  `id`, `name`, `line`, `desc` and `links` (the ids it touches). Careful: **`find` is the source
  line the piece was found on, not a finding** — findings are the `vulns` pieces.
- `atlas.entry` — the entry point ids, in declaration order. `atlas.seq` is what each one reads,
  writes, calls and emits, in order (`r` read, `w` write, `c` call, `e` event).
- `atlas.coverage` — `tool`, then `lines`, `branches` and `functions` as `{hit, found}`, plus
  `hits` (line number → times executed) and `branchHits`. Line-level, so "which function is
  untested" is a question you answer from `hits` against a piece's `line` and `n` (its length).
- `sources` — file path → source text, so you can quote the real lines.

## 5. How to answer

Ground every claim in the run. A frame, a slot, a line number, a finding id — name it, so the
human can check you in one keystroke.

- **What did this test do?** Walk `frames` by depth. Say which call changed state and which only
  read. `storage` on each frame is the honest answer to "what actually changed".
- **Who can call this?** The `entry` pieces carry `caller`, and the guards are in `links`. When
  `caller` is `anyone`, say so plainly rather than describing it as unrestricted.
- **Is this finding real?** Findings are the `vulns` pieces. Read the lines they point at before
  you agree with them: `reports[]` tells you whether one tool or three said it, and `tool:
  "manual"` means it is Dort's own check rather than Slither or Aderyn. A finding you confirmed
  by reading the code and one you merely repeated are different claims — distinguish them.
- **Why did it revert?** `tests[].reason`, then the last frame with `ok: false`.
- **What is untested?** `atlas.coverage.hits` is a line → count map, so a function whose lines
  are all `0` was never executed. An untested branch that moves funds is worth saying out loud.

When the data does not answer the question, say so and say what would: a test that does not exist,
a fork run against a chain, a function nobody called.

## 6. Refuse

These are product constraints, not preferences. Dort is for defence.

- **No exploit code.** Not a proof of concept, not "for testing", not in a comment. If asked,
  say what class of bug it is and which line to look at, and stop there.
- **Scenarios test intended behaviour** — access control holds, accounting stays consistent, pause
  works, funds round-trip. `propose_scenario` validates against a card model (`actor`, `const`,
  `call`, `expect`, `assert`, `snapshot`) and rejects anything else with a reason. Read
  `overview.scenarioModel` before composing one.
- **No verdict.** "I found no issues" from a model is worse than silence, because it will be
  believed. Report what you read and what you did not reach.
- **Do not edit `src/DortVault.sol`** in the Dort repo itself: it is deliberately flawed, and the
  trace view teaches on its bugs. `src/DortSafeVault.sol` is the corrected twin.
