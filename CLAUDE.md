# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dort is a local-first visual workbench for smart contract auditors: Foundry test output decoded into readable traces, a contract map (Atlas), wired scenarios, protocol/exploit reference pages, and "bring your own AI" explanations. **AI explains, the human judges** — this shapes real product rules (see *Defensive-only rules*).

## Repository shape

Two halves joined by one file, `dort-data.json`:

| Path | What it is |
|---|---|
| `foundry/` | The exporter (plain Node `.mjs`, zero deps) **and** the DortVault sample Foundry project it is developed against |
| `apps/frontend/` | The Next.js 16 app (pnpm workspace root for the app; this is where all `pnpm`/`node` commands run) |

There is no root `package.json`. `apps/frontend` and `foundry` are built, tested and linted separately (as in `.github/workflows/ci.yml`).

## Commands

```sh
# apps/frontend (pnpm 10, Node 20+)
pnpm install
pnpm dev                 # http://localhost:3000
pnpm build
pnpm lint                # biome check          (CI runs: pnpm exec biome ci src)
pnpm check               # every sibling *.check.ts, one process each (CI runs this too)
pnpm format              # biome format --write
pnpm exec next typegen   # writes .next/types; the PageProps / LayoutProps globals routes use
pnpm exec tsc --noEmit   # typecheck — there is no `pnpm typecheck` script; needs typegen first
                         # on a fresh checkout, or every route file fails with TS2304

# apps/frontend — the app's unit tests: sibling *.check.ts files, no runner, no framework.
# Each file's first line is the exact command to run it; they assert and print "<name> ok".
node --experimental-strip-types src/features/trace/utils/why.check.ts          # one check
pnpm check                                                                     # all 22

# foundry
forge build && node --test *.test.mjs            # exporter unit tests (9 files)
node --test dort-lib.test.mjs                   # one exporter test file
forge test                                       # DortVault sample suite
forge test --mt test_deposit -vvvv               # one Solidity test
node dort-export.mjs                            # write dort-data.json (all tests, local EVM)
node dort-export.mjs --mt test_deposit           # one test  (merge with DORT_MERGE=1)
node dort-export.mjs --chain base-sepolia        # on a testnet fork
node dort-mcp.mjs --data=/abs/dort-data.json    # MCP server over stdio
node dort-bridge.mjs                             # lets the hosted app run forge locally
bash script/bridge-local-demo.sh                 # the whole bridge on two local anvils
bash script/vault-local-demo.sh                  # DortSafeVault on one local anvil, for /vault
```

CI runs `pnpm check` (and the exporter's `node --test *.test.mjs`), so a broken check fails the build. Still run it yourself after touching anything in `features/*/utils/` — it is a second or two.

To develop the app against a live run: `DORT_DATA_PATH=/abs/path/dort-data.json pnpm dev`.

**The exporter wants forge 1.8.x for step data.** forge 1.9 removed the built-in debugger, and
its `--dump` writes a SolDB bundle directory where 1.8.x wrote the single JSON file
`dort-export.mjs` decodes into per-line steps. On 1.9 the export still writes its traces and
prints `dort: step-by-step source lines skipped — …`, so nothing breaks; the trace view just
loses the source lines it teaches on. CI is pinned to `v1.8.7` for that reason. Reading the
bundle format is the real fix and has not been done.

## Architecture

### `dort-data.json` is the contract

The exporter shells out to `forge` and writes one JSON file (`tests`, `sources`, `atlas`, plus `generatedAt`/`forgeVersion`/`command`). The app never runs analysis itself: it reads that file and draws it. Any change to a section's shape must be made in both halves (`foundry/dort-*.mjs` and `apps/frontend/src/features/{trace,atlas}/types.ts`).

Export pipeline (`dort-export.mjs` orchestrates, each other script owns one section): `forge build` → `forge test --json -vvvv` → one `forge test --debug --dump` per unit test (source-line steps; unit tests only) → decode frames with project ABIs and solc source maps (`dort-lib.mjs`) → `atlas` from `forge build --ast` + `forge inspect storageLayout` (`dort-atlas.mjs`) → Slither/Aderyn merge (`dort-findings.mjs`) → lcov coverage (`dort-coverage.mjs`). Atlas/findings/coverage failures are non-fatal: the export still writes traces and prints `dort: … skipped — …`.

**The exporter must stay copy-pasteable and dependency-free.** Auditors `curl` the individual `.mjs` files into their own project root, so these scripts may only import each other and `node:*` — never anything from `apps/frontend` or npm. New exporter scripts must be added to `EXPORTER_FILES` in `features/run/utils/exporter-files.ts`, which `src/app/exporter/[file]/route.ts` serves from the running app. `exporter-files.check.ts` holds that list against the real `foundry/` directory: every non-test `dort-*.mjs` must be served, the list must be closed under the scripts' own imports, and nothing may import npm or the app. Forgetting it is not a style slip — it leaves a script nobody can download.

### Frontend layering

- `src/features/<name>/` — all logic. `utils/` is pure and framework-free (importable by Node for the `.check.ts` files), `services/` is server-only I/O (`import "server-only"`), `hooks/` is client state, `types.ts` mirrors the export's shape, `data/` and `fixtures/` hold hand-written content and sample runs. Each feature has an `index.ts` barrel.
- `src/components/(main)/<feature>/` — the React/client layer, re-exported from `src/components/(main)/index.ts`. Route files in `src/app/(main)/` stay thin: metadata, a `Suspense` skeleton, `load*()` in a server component, then one `*Workspace` component.
- Features: `trace`, `atlas` (includes the Lab/scenario editor and Paths), `run` (Start test + bridge), `ai`, `explore`, `exploits`, `docs`, plus the three on-chain ones, `bridge`, `vault` and `swap`.
- `bridge`, `vault` and `swap` are the only features that talk to a wallet. `bridge` owns the wallet layer — `wallet.ts` (pure: EIP-6963 discovery rules, ordering, the remembered choice) and `useWallet.ts` (the listening, connect/disconnect, `switchTo`, `send`, `codeAt`) — plus the chain list and the ERC-20 ABI slice; `vault` and `swap` import them rather than keeping a second copy. Wallets are found by EIP-6963, never by reading `window.ethereum` directly (that slot holds one provider and every extension overwrites it); the single slot is kept only as a last-resort entry, listed last. Their cards are assembled from the shared pieces in `src/components/(main)/action/` (`ActionCard.tsx`, `TokenSelect.tsx`, `WalletButton.tsx`).
- `swap` drives **PortalSwapRouter**, Portaldot V3's own DEX (a Uniswap V2 fork, 30 bps). Its addresses, fee, function names (`WPOT()` not `WETH()`; no fee-on-transfer variant) and its 10 pools over 5 tokens were all read off the live chain, and `swap.check.ts` pins the local quote maths against `getAmountsOut` answers recorded from it — change the fee or the rounding and the check stops matching the chain. Every pair has a pool, so a path is always one hop.
- **Portaldot keeps 0.1 tPOT in every account and `eth_getBalance` subtracts it.** The chain's
  existential deposit: a wallet showing 10 reads 9.9 here, and one holding exactly the deposit
  reads 0. The chain reports 14 decimals natively while its Ethereum RPC presents 18, so the two
  sides differ by 10⁴ as well — `nativeCurrency.decimals: 18` is correct and must not be
  "fixed" to 14. Both were measured against live `System.Account` storage, and
  `EXISTENTIAL_DEPOSIT` in `features/swap/swap.ts` carries the finding with its own check. An
  EVM address maps to a native `5…` address by padding the 20 bytes with `0xEE` twelve times
  (SS58 format 42), and tokens sent there land on that same `0x` account.
- `foundry/src/DortSafeVault.sol` is the vault written correctly — CEI, a reentrancy guard, rounding always toward the vault, a virtual offset against the first-depositor attack. `src/DortVault.sol` is its deliberately flawed twin, which the trace view teaches on. Don't "fix" DortVault.
- Docs pages are data, not MDX: `src/features/docs/pages.ts`.

### Data loading gate

`src/config/env.server.ts` exposes `DORT_DATA_EXPLICIT`/`DORT_DATA_PATH`. `loadTrace()`/`loadAtlas()` read the file on every request **only** when `DORT_DATA_PATH` is set; otherwise they return the bundled sample with `origin: "none"`, which makes the app open on its Start page with a *Sample data* badge. Code that branches on "is a real run loaded?" checks `origin`, not emptiness.

### Local-only routes

`/api/test-run` and `/api/claude` spawn processes on the user's machine. Both go through `refuse()` in `src/features/ai/utils/claude-bridge.ts`: loopback host, matching origin, and a hosted build (`VERCEL`/`DORT_HOSTED`) answers 404. `exportArgs()` in `features/run/utils/test-run.ts` is the only thing that turns a request body into exporter flags — identifiers and known fork keys only, never a command, path or raw flag. Keep that boundary: never widen these routes to accept arbitrary arguments.

The bridge (`foundry/dort-bridge.mjs`) is the mirror image for the hosted app: it binds `127.0.0.1`, accepts only the Dort origins plus a token it prints in a URL fragment, and runs nothing but `node dort-export.mjs`.

### Cross-half invariants enforced by checks

Several `.check.ts` files read real files from `foundry/` and will fail if the two halves drift:

- `features/run/utils/test-run.check.ts` ↔ `foundry/dort-chains.mjs` (the fork picker must list exactly the exporter's chains)
- `features/atlas/utils/lab.check.ts` ↔ `foundry/src/DortVault.sol` (scenario/Lab fixtures are derived from the real sample source)
- the scenario model is shared with `foundry/dort-mcp.mjs`, whose `propose_scenario` validates against it

So editing the chain list, the sample vault, or the scenario card model means running the app checks too.

## Conventions

- **Biome** (2.4.2), 2-space indent, `organizeImports` on. Import app code with `@/*`; inside a feature use relative paths, and `.ts` extensions in `.check.ts` imports (required by `--experimental-strip-types`).
- **Next 16 + React 19 with the React Compiler, `cacheComponents` and Turbopack.** `apps/frontend/AGENTS.md` (auto-written by `next dev`) is binding: this is not the Next.js in your training data — read the relevant guide in `apps/frontend/node_modules/next/dist/docs/` before writing Next-specific code, and commit the `AGENTS.md` block with your work rather than deleting it.
- **UI must follow `apps/frontend/DESIGN.md`.** Monochrome graphite node-editor look; colour only as small semantic dots; white only for *active* and the one *primary* action. Tokens live in `src/app/globals.css`, primitives in `src/components/ui` — extend those rather than adding one-off styles in a feature. The one documented exception is trace call-kind badges, which match `forge -vvvv`'s palette.
- Comments in this codebase explain *why* a boundary exists (see the headers of the API routes and exporter scripts). Preserve them when editing those files.

## Defensive-only rules

These are product constraints, not style preferences:

- Scenarios and generated `.t.sol` files test **intended** behaviour; the AI system prompt refuses to write exploits, and `propose_scenario` only accepts scenarios expressible in the Lab's card model.
- Exploit pages are post-mortems of closed, public incidents with no exploit code; `features/exploits/utils/exploits.check.ts` fails the build-time data check on any 40-hex-digit string, so no attacker address can be added.
- AI is the user's own by default (Claude Code, a local model, or their key) and only the selected piece is sent. Every provider in the settings dialog is BYOK except one.
- **That one exception is deliberate and was asked for.** `app/api/bedrock` calls Amazon Bedrock with a key from the *server's* environment (`BEDROCK_API_KEY`, optionally `BEDROCK_REGION` and `BEDROCK_MODEL`), so a visitor with no key can still ask something. It is offered only when that variable is set, it is the default only when the user has chosen nothing, and the page says plainly that answers go through the operator's AWS account and land in its logs if model invocation logging is on there. Do not quietly remove it, and do not widen it: the key must never reach the browser (`hosted.check.ts` holds the client-bundled files to that), the route answers this app's own origin only — an open proxy to a paid model is a bill waiting to be run up by someone else's site — and the region and token budget are the operator's and are never named by the request body, while the model may be named only from the operator's own allow-list (`BEDROCK_MODELS`), which `pickModel` enforces by falling back to the default for anything else. The default is the cheap tier (`anthropic.claude-haiku-5-5`) because the operator pays for every call, and the list spans vendors on purpose. Bedrock serves two APIs on one host: `anthropic.*` ids go to `/anthropic/v1/messages`, every other vendor to `/openai/v1/chat/completions`, with the key in `x-api-key` or `Authorization: Bearer` respectively — never both, which that host rejects outright. `hosted.check.ts` pins the split, the headers and the two body shapes. Everything else stays BYOK, because an auditor's unpublished source should not pass through anyone's infrastructure but their own.
- A provider's key may only ever be posted to that provider's own host. `baseUrl` is ignored for every API provider except `local`; Bedrock is the one that needs a region, so `bedrockBase()` takes only the region from it and builds the host itself (`provider.check.ts` pins this with a list of hostile values). An AWS credential is wider than an `sk-…`, so this is not a formality.
