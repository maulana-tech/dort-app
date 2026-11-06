# Dort — read what a contract actually did

**Track:** Node Operations & Tooling — network security analysis tooling for the Portaldot ecosystem
**Chain:** Portaldot V3 Testnet, chain id `420420777`
**Live:** https://dort-app.vercel.app · **Source:** https://github.com/maulana-tech/dort-app

---

## The problem

An auditor's day is spent reading output that was never meant to be read.

`forge test -vvvv` prints a text tree of calls. Slither prints a JSON report. Aderyn prints a
different one. `forge coverage` prints a fourth thing, lcov. None of them know about each other,
so the only place the contract exists as one object is in the reviewer's head — and that is
exactly where mistakes live.

The AI tools that promise to fix this mostly make it worse. They hand down a verdict — "this
contract is safe" — which is the one sentence a reviewer cannot act on, cannot check, and will be
blamed for when it turns out to be wrong.

Dort takes the opposite position, and builds it into the product rather than the pitch:

> **AI explains, the human judges.** Dort never says safe.

## How it works

Two halves joined by one file.

**The exporter** runs inside your own Foundry project. `node dort-export.mjs` shells out to
`forge`, and in one pass it:

1. runs `forge test --json -vvvv` and decodes every frame with **your** ABIs and solc source maps,
2. runs `forge test --debug --dump` per unit test to put each frame on the source line it ran,
3. builds a contract map (Atlas) from `forge build --ast` and `forge inspect storageLayout`,
4. merges Slither and Aderyn reports if you have them,
5. folds in lcov coverage,

and writes a single `dort-data.json`.

**The app** never analyses anything. It reads that file and draws it. Any change to a section's
shape has to be made in both halves, and sibling `.check.ts` files fail the build when they drift.

Two consequences that matter more than they sound:

- **The exporter has zero dependencies.** It may import only `node:*` and its own siblings.
  Auditors `curl` the individual `.mjs` files into their project root, and nothing from npm or
  from the app can reach them.
- **Your unpublished source never leaves your machine.** The exporter and the app read local
  files. Triage status and notes stay in your browser, per contract.

## Key features

**Traces you can read.** Every call, event and cheatcode decoded, each frame sitting on the line
of Solidity that ran, with gas and the storage it touched.

**Ask, in plain language — with your own AI.** Claude Code over localhost, a local model, or your
own key, and only the piece you selected is sent. There is exactly one hosted option, so a visitor
with no key can still ask something; the page says plainly that those answers go through the
operator's AWS account and land in its logs if model invocation logging is on there. Everything
else is bring-your-own-key, because an auditor's unpublished source should not pass through
anyone's infrastructure but their own.

**Paste a transaction hash.** Dort traces it live with `debug_traceTransaction` on the chain you
picked and draws the call tree beside the answer. Paste an address instead and it reads what is
deployed there. Hand it a `.sol` file and it reads the source — and says, in that case, that there
is no trace, because source has not run.

**Vaults on three live chains.** Deposit, withdraw, and watch the share maths as you do.

**Portfolio.** What one address holds across every vault, with the deposits and withdrawals that
got it there, read from the vaults' own events. It also tells you how far back it managed to
look — public RPCs cap log queries, and a portfolio that quietly drops a withdrawal is worse than
one that admits the limit.

**Swap on Portaldot's own DEX.** PortalSwapRouter, its real factory and its real pools. No deploy
of ours involved.

**Your coding agent can use Dort too.** `npx dort-skill` writes one skill file into any agent that
reads them — no postinstall, no network call of its own, no dependencies. The exporter also ships
an MCP server (`node dort-mcp.mjs`), and Dort is itself an MCP client, so servers already on your
machine appear in its settings as the tools they actually answered with.

**Defensive-only, enforced in code and not in a README.**

- The AI's system prompt refuses to write exploits.
- The Lab's card model can only express *intended* behaviour, so a generated `.t.sol` tests what
  a contract should do; a failing assertion is a finding for a human, not an attack.
- `exploits.check.ts` fails the build on **any 40-hex-digit string** in the exploit pages, so no
  attacker address can be added to them, by anyone, ever.
- The local-only API routes (`/api/test-run`, `/api/claude`, `/api/mcp`) spawn processes, so all
  three refuse anything but a loopback host with a matching origin, and answer 404 on a hosted
  build. The browser may never name a command, a path or a tool schema.

## Deployed, funded, and verifiable

Every figure below was read back off its chain after the fact, not copied from a deploy script.

| Chain | `DortSafeVault` | Asset | Holds | Shares | Redeem all shares |
|---|---|---|---|---|---|
| **Portaldot V3** (`420420777`) | `0x75ef70Ea33994a16751ff0b4f7DCF0F94DF1351F` | pUSDT | **19.976522 pUSDT** | 19,976,522,000 | exactly 19,976,522 |
| Base Sepolia (`84532`) | `0x162Dcf95Eb9df70F314CD4648565E6eb24f85aF8` | USDC | **20 USDC** | 20,000,000,000 | exactly 20,000,000 |
| Ethereum Sepolia (`11155111`) | `0x6E818cAF7177C144E9da7DA6Ed78eFF394bCF0e8` | USDC | **5 USDC** | 5,000,000,000 | exactly 5,000,000 |

That last column is the point of the vault, not a formality: redeeming every share returns exactly
what went in, so the first deposit into an empty vault lost nothing to rounding. That is what the
10³ virtual offset against the first-depositor attack is for, and why the share counts are a
thousand times the asset counts.

**Transactions**

| What | Chain | Hash | Block |
|---|---|---|---|
| Deploy | Portaldot V3 | `0x1cd61c77b72da2158d8c6ef9bcbe0aebeabf90311c758c1734e075b14dec87ae` | 336632 |
| Buy pUSDT on PortalSwapRouter (5 POT → 19.976522) | Portaldot V3 | `0x4dc45a4840578a54213e9e3f5d22584d5dbc721d122380ffec9a5088f2923a5f` | 336647 |
| Deposit | Portaldot V3 | `0xbbf5769e5ab17bbc61e89248d100213b54617b03291a7fb4f529875c4fa10434` | 336651 |
| Deploy | Base Sepolia | `0x2aafcfaa81d24ed15d4c5412da0458f952c2288351467a161184d27d69904e8d` | 53482026 |
| Deposit 20 USDC | Base Sepolia | `0xa89a75c364ac9a2d201bbfac93951295acfca4aac974c3267318b9b307ec5a44` | 54377074 |
| Deploy | Ethereum Sepolia | `0x132a38c3acf483a150f70e2645f551207cca1f3b32e825d2cc45dadf1a7c5a56` | 12069831 |
| Deposit 5 USDC | Ethereum Sepolia | `0x81d26b690b170d6d24fd32acbe6f5c9d63326af0a4a44f582519dfdda9d4c9e0` | 12069885 |

The pUSDT in the Portaldot vault was **bought on the chain's own DEX and deposited**, not minted
by us. Portaldot's node console has no per-transaction page, so check it directly:

```sh
R=https://test-evm-rpc-v3.portaldot.dev
V=0x75ef70Ea33994a16751ff0b4f7DCF0F94DF1351F

cast code  $V --rpc-url $R | head -c 12            # 0x6080604052
cast call  $V 'asset()(address)'       --rpc-url $R  # 0xe0114Adc…dbc2 — the chain's own pUSDT
cast call  $V 'totalAssets()(uint256)' --rpc-url $R  # 19976522
cast call  $V 'totalSupply()(uint256)' --rpc-url $R  # 19976522000
cast receipt 0x1cd61c77b72da2158d8c6ef9bcbe0aebeabf90311c758c1734e075b14dec87ae --rpc-url $R
```

## What we learned about Portaldot V3, measured

These cost real time, so they are written down where the next person will find them.

**Bytecode size is the price of deploying.** Portaldot reserves balance for
`gas_limit × gas_price` at validation, and the gas figure carries the **storage deposit for the
contract's code**. A deploy therefore fails with `1010 Invalid Transaction` for lack of *balance*,
not lack of gas, and the error says nothing about size. Unoptimised, `DortSafeVault` wanted
**821 POT**; a deploy-only profile (optimizer, `runs = 1`, via-IR) took it from 11,760 bytes to
5,176 and the price to **356.4 POT**. The default build stays unoptimised, because that is what
every test and every decoded trace in the repo is built against.

**Foundry's EIP-1559 path is rejected outright.** `--legacy` is required, or every transaction
comes back `1010`, then `1012 Transaction is temporarily banned`.

**`forge script` cannot simulate against a load-balanced public RPC.** Its fork simulation needs
one node to answer every call; Sepolia's public endpoints answer from several and it fails with
`block not found`. `forge create` has no such problem.

**The chain keeps 0.1 POT in every account and `eth_getBalance` subtracts it.** A wallet showing
10 reads 9.9. The chain also reports 14 decimals natively while its Ethereum RPC presents 18, so
the two sides differ by 10⁴ as well. Both are measured against live `System.Account` storage and
carried as constants with their own check, so nobody "fixes" them later.

**An EVM address maps to a native `5…` address** by padding the 20 bytes with `0xEE` twelve times
(SS58 format 42), and tokens sent there land on the same `0x` account.

## What is *not* deployed, and why

`/bridge` is **not live, and the page says so** rather than pretending. `PortalBridgeMinter`
measures **396.5 POT** on Portaldot after optimisation, against 132 POT left after the vault;
the escrow side alone is 203.3. `DEPLOYMENTS` in the code is still all `null`, and the whole
bridge runs on two local anvils via `script/bridge-local-demo.sh`.

`DeployPortaldot.s.sol` — the deliberately-flawed `DortVault` plus four mocks, used to teach the
trace view — is ~614 POT all told and stays on a fork of the chain
(`script/portaldot-fork-demo.sh`), which runs the **real** router, factory and pools with local
funds. That exists because Portaldot has no official faucet, and without it an unfunded reader
sees a balance of 0 and a page that looks broken for reasons that have nothing to do with its code.

## Tech stack

| | |
|---|---|
| Contracts | Solidity 0.8.37, Foundry (forge 1.8.x, pinned — 1.9 removed the debugger the step data comes from) |
| Exporter | Plain Node `.mjs`, **zero dependencies**, `node:*` only |
| App | Next.js 16, React 19 with the React Compiler, `cacheComponents`, Turbopack, Tailwind, Biome |
| Chain | viem, wallets discovered by **EIP-6963** (never `window.ethereum`) |
| Analysis | Slither, Aderyn, lcov coverage, solc AST + storage layout |
| Agents | Model Context Protocol — Dort ships a server *and* is a client; `npx dort-skill` |
| Hosted AI | Amazon Bedrock, one model, operator-paid, allow-listed |

**34 unit checks** (`pnpm check`, no framework — each file prints `<name> ok`), **39 Solidity
tests**, and the exporter's own `node --test` suite. CI runs all of them.

## Try it in two minutes

```sh
# in your own Foundry project
curl -O https://dort-app.vercel.app/exporter/dort-export.mjs   # and its siblings
node dort-export.mjs                                           # writes dort-data.json

# then drop that file into https://dort-app.vercel.app/chat
```

Or give it to your own coding agent instead:

```sh
npx dort-skill
```
