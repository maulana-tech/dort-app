# Dort exporter

Plain Node scripts (no dependencies) that run your Foundry tests and write `dort-data.json` for the
Dort app. This folder is also the DortVault sample project they are developed against.

## Install

Copy these five files into the root of your Foundry project (next to `foundry.toml`).
`dort-export.mjs` imports the other four, so keep them side by side:

| File | Adds |
| --- | --- |
| `dort-export.mjs` | Entry point: `forge build`, `forge test --json -vvvv`, one `forge test --debug --dump` per unit test; writes `tests` and `sources` |
| `dort-lib.mjs` | ABI decoding, keccak, source maps |
| `dort-atlas.mjs` | The `atlas` section (contract map) from `forge build --ast` and `forge inspect … storageLayout` |
| `dort-findings.mjs` | Merges Slither / Aderyn JSON reports into the atlas findings |
| `dort-coverage.mjs` | `atlas.coverage` from `forge coverage --report lcov` |

```sh
cp dort/foundry/dort-{export,lib,atlas,findings,coverage}.mjs path/to/your-project/
```

Needs Node 20+ and `forge` on PATH.

## Run

```sh
node dort-export.mjs                       # all tests
node dort-export.mjs --mt test_deposit     # one test (other forge test flags pass through too)
node dort-export.mjs --slither=out/slither.json --aderyn=report.json
DORT_ATLAS=MyVault node dort-export.mjs   # pick the contract the atlas maps
```

- Static-analysis reports are optional. Without flags it picks up `reports/slither.json`,
  `reports/aderyn.json`, `slither.json` and `report.json` if present. Generate them with
  `slither . --json reports/slither.json` and `aderyn . -o reports/aderyn.json`.
- If the atlas or coverage step fails, the export still writes the traces and prints
  `dort: atlas skipped — …` / `dort: coverage skipped — …`.
- Fuzz and invariant tests are listed, but only unit tests get source-line step data.

Output: `dort-data.json` in the project root (`generatedAt`, `forgeVersion`, `command`, `tests`,
`sources`, `atlas`). Add it to `.gitignore`.

## Load it in the app

Drop the file into the app (*Sample data → Use my project*), or start the app with
`DORT_DATA_PATH=/abs/path/dort-data.json`. See the root [README](../README.md).

## Develop

```sh
forge build && node --test *.test.mjs   # exporter unit tests (run in foundry/)
forge test                 # the DortVault sample suite
```
