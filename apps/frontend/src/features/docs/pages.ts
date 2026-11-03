/**
 * Dort's docs (/docs), as data: groups of pages, each page a title, a one-line lead and blocks.
 * Inline text takes `code`, **bold** and [label](href) (DocsArticle renders them). The shape follows
 * onorca.dev/docs (D1, docs layout): Start here first, then the app, running tests, AI, more.
 */

export type Block =
  | { p: string }
  | { h2: string }
  | { h3: string }
  | { list: string[] }
  | { steps: string[] }
  | { code: string }
  | { note: string; tone?: "info" | "warn" }
  | { table: { head: string[]; rows: string[][] } }
  /** a screen recording of the app (public/docs/<name>.mp4, its poster <name>.jpg) */
  | { video: string; caption: string };

export type DocPage = {
  /** "" is /docs itself */
  slug: string;
  title: string;
  lead: string;
  blocks: Block[];
};

export type DocGroup = { title: string; pages: DocPage[] };

/**
 * Where the exporter scripts are downloaded from. There is no public deploy any more, so the
 * commands name the Dort the reader is running — a URL pointing at a site this project does not
 * control would hand them someone else's scripts to curl into their project root.
 */
const SITE = "http://localhost:3000";
const DOWNLOAD = `curl -fsSLO -w "saved %{filename_effective}\\n" "${SITE}/exporter/dort-{export,lib,atlas,findings,coverage,chains,bridge}.mjs"`;

export const GROUPS: DocGroup[] = [
  {
    title: "Start here",
    pages: [
      {
        slug: "",
        title: "What is Dort?",
        lead: "A one-minute pitch: what Dort shows, who it is for and when to reach for it.",
        blocks: [
          {
            p: "Dort is a defensive tool for reading smart contracts — for auditors and bug bounty hunters, and for anyone who wants to understand a contract before trusting it with money. It reads what your Foundry project already produces (forge test traces, the compiler's AST and storage layout, Slither and Aderyn reports, coverage) and lets you ask about it in plain language, with the answer grounded in that run rather than in the model's memory.",
          },
          { h2: "When to use Dort" },
          {
            list: [
              "A test passes or fails and you want it explained against the run that actually happened, not guessed at.",
              "You are new to a codebase, or to Solidity, and want to ask about it in your own words.",
              "You want to know what to check before trusting a contract with money.",
              "You want to see how a well-known protocol is meant to work, or read a past incident as a report.",
              "You are moving value on Portaldot V3 and want the vault, bridge or swap to tell you what will happen before you sign.",
            ],
          },
          { h2: "Who it is for" },
          {
            p: "Auditors, bug bounty hunters and Solidity developers who use Foundry — and newcomers, who can start in [Chat](/docs/chat) without knowing the vocabulary. Dort never judges for you: AI explains, you decide.",
          },
          { h2: "What Dort is not" },
          {
            list: [
              "**Not an exploit tool.** It never writes attack contracts, calldata or attack steps. Tests it helps you write check intended behaviour.",
              "**Not a hosted scanner.** Your code is never uploaded. The exporter runs on your machine and the app reads the file in your browser tab.",
              "**Not a replacement for forge, Slither or Aderyn.** It reads their output and answers from it.",
              "**Not an AI company.** Dort has no model of its own. A deployment may offer one it pays for, which the page says so about; everything else is a model you bring, or built-in text.",
            ],
          },
          { h2: "Next steps" },
          {
            p: "Open [Chat](/chat) and press **Try the sample vault** to ask something right away, or go to [Quick start](/docs/quick-start) to load your own project. Then read [Your first session](/docs/first-session).",
          },
        ],
      },
      {
        slug: "quick-start",
        title: "Quick start",
        lead: "From a Foundry project to its decoded run in Dort, in a few minutes.",
        blocks: [
          { h2: "Requirements" },
          {
            list: [
              "[Foundry](https://getfoundry.sh) (`forge` on your PATH) and Node 20 or newer.",
              "A Foundry project with tests (the folder with `foundry.toml`).",
              "Optional: [Slither](https://github.com/crytic/slither) and [Aderyn](https://github.com/Cyfrin/aderyn) for findings.",
            ],
          },
          { h2: "1. Install the tools" },
          {
            p: "Skip this if `forge --version` and `node --version` already work.",
          },
          { code: "curl -L https://foundry.paradigm.xyz | bash && foundryup" },
          { h2: "2. Get the exporter into your project" },
          {
            p: "Seven plain Node scripts, no install. They are downloaded from the app, so they always match the version you use.",
          },
          { code: `cd path/to/your-project\n${DOWNLOAD}` },
          { h2: "3. Export a run" },
          { code: "node dort-export.mjs" },
          {
            p: "It runs `forge test` with traces, maps the contract, merges Slither and Aderyn reports from `reports/` if you have them, and writes `dort-data.json` next to `foundry.toml`. Add that file to `.gitignore`.",
          },
          { h2: "4. Load it" },
          {
            p: "Open [Chat](/chat) and drop `dort-data.json` onto the panel there. The file is read in that tab only and never uploaded, and the badge in the header then reads **Your run**.",
          },
          { h2: "5. Optional: run tests from the page" },
          {
            p: "Start the bridge in the same folder and open the link it prints, and the hosted app can run `node dort-export.mjs` on your own machine. See [Run tests from the browser](/docs/run-from-browser).",
          },
          { code: "node dort-bridge.mjs" },
          {
            note: "No Foundry project at hand? Press **Try the sample vault** in Chat: DortVault, a small demo vault bundled with the app. Dort says plainly that it is the sample and not your code.",
          },
        ],
      },
      {
        slug: "first-session",
        title: "Your first session",
        lead: "A short tour: ask, read, compare, then move something on-chain.",
        blocks: [
          { h2: "1. Ask about a run" },
          {
            steps: [
              "Open **Chat**. With nothing loaded it answers generally — press **Try the sample vault** or drop your own `dort-data.json` to change that.",
              "Connect your own AI with **Connect AI** in the header: your Claude Code, a local model, or your own key.",
              "Start with one of the suggested questions, then follow up in your own words. The header badge always says whether you are reading your run, the sample, or nothing.",
            ],
          },
          {
            p: "What Chat sends is a summary of the run — the test counts, every failure with its revert reason, and the contracts and files involved. See [Chat](/docs/chat) for exactly what leaves the browser.",
          },
          { h2: "2. Read how a protocol is meant to work" },
          {
            steps: [
              "Open **Explore** for Uniswap v3, Aave v3, Morpho or Compound v3.",
              "Each one is a report: its contracts and how they connect, its main flows as sequence diagrams, and links to the code.",
            ],
          },
          { h2: "3. Read what went wrong elsewhere" },
          {
            p: "**Exploits** holds post-mortems of closed, public incidents — what the protocol intended, what actually happened, and how a reviewer catches that class of mistake. No exploit code, and no attacker addresses: the build-time data check fails on any 40-hex string, so one cannot be added by accident.",
          },
          { h2: "4. Move something on-chain" },
          {
            steps: [
              "**Vault** deposits into `DortSafeVault` and shows the shares it will mint before you sign.",
              "**Swap** trades on PortalSwapRouter, Portaldot V3's own DEX, with the price impact those pools really charge.",
              "**Bridge** locks an asset on its home chain and mints the wrapped copy on Portaldot.",
            ],
          },
          {
            note: "Every on-chain page tells you what will happen before it asks for a signature, and refuses to send when your wallet cannot see the contract it is pointed at. Start with [Connecting a wallet](/docs/wallet).",
          },
        ],
      },
    ],
  },
  {
    title: "Using Dort",
    pages: [
      {
        slug: "chat",
        title: "Chat",
        lead: "Ask about a contract in plain language, answered by your own AI.",
        blocks: [
          {
            p: "Chat is the way in when you are not an auditor. Ask in a sentence — *what does this project do?*, *did anything fail, and what does that mean?* — and get an answer back in plain language. No jargon required to start, and nothing to configure beyond your own model.",
          },
          { h2: "Two modes, one box" },
          {
            table: {
              head: ["When", "What it answers from"],
              rows: [
                [
                  "a Foundry run is loaded",
                  "**your project** — how many tests ran, which failed and why, which contracts the calls went through, which Solidity files exist",
                ],
                [
                  "nothing is loaded",
                  "**general knowledge** — Solidity, review practice, what to look for. It says so, rather than inventing a project it cannot see",
                ],
              ],
            },
          },
          {
            p: "Which mode is in force is written above the thread and on the badge in the panel's header, so it is never something you have to infer. See [Quick start](/docs/quick-start) for how to load a run.",
          },
          { h2: "What is sent, and what is not" },
          {
            p: "Chat sends a **summary** of the run, not the run: the test counts, every failure with the revert reason the exporter captured, and the names of the contracts and files involved. Whole traces would be tens of thousands of tokens of mostly noise, and the useful part of a run is small. The summary is attached once, to your first message — nothing about the run changes mid-conversation, so re-sending it every turn would only cost you more.",
          },
          {
            note: "The bundled sample is never described as your project. Whether a run is loaded is decided by where the data came from, not by whether it looks empty — so an answer about *your* contracts only ever appears when there really are some.",
            tone: "info",
          },
          { h2: "Whose model answers" },
          {
            p: "Yours. Press **Connect AI** in the header and pick your Claude Code, a local model, or your own API key — the same setting the rest of the app uses, described in [Ask AI providers](/docs/ai). Your question and your code go straight from the browser to the provider you chose. Dort never calls a model of its own, because a chat box is exactly where an auditor's unpublished source would otherwise end up in someone else's logs.",
          },
          {
            p: "Like everywhere else in Dort, the assistant does defensive review only: it explains code and writes Foundry tests for intended behaviour, and refuses to write exploits or proof-of-concept attacks.",
          },
        ],
      },
      {
        slug: "explore",
        title: "Explore",
        lead: "Known DeFi protocols mapped for auditors.",
        blocks: [
          {
            p: "Explore shows how well-known protocols are meant to work: Uniswap v3, Aave v3, Morpho and Compound v3. Each is one report: its contracts and how they connect, its main flows as sequence diagrams, links to the code and what to check.",
          },
          {
            p: "Liquidations, flash loans, oracles and callbacks are shown as the protocol's intended features. Ask AI on a protocol explains how they work and what to check, never how to abuse them.",
          },
          {
            video: "/docs/explore.mp4",
            caption:
              "A protocol in Explore: its contracts, then its flows as sequence diagrams",
          },
          {
            p: "Open it from **Explore** in the top bar. The Contract Lab can go full screen.",
          },
        ],
      },
      {
        slug: "exploits",
        title: "Exploits",
        lead: "Large smart contract incidents as defensive post-mortems.",
        blocks: [
          {
            p: "Exploits covers four of the largest smart contract incidents on the rekt.news leaderboard, one per vulnerability class: Poly Network, Euler Finance, Nomad Bridge and Beanstalk. Each is one report: overview, attack flow as a sequence diagram, funds, root cause as a diff, and how an auditor catches it.",
          },
          {
            video: "/docs/exploits.mp4",
            caption:
              "An incident as one report: overview, attack flow and how an auditor catches it",
          },
          { h2: "Policy" },
          {
            list: [
              "Historical, closed incidents only, at the level their public post-mortems describe.",
              "No exploit code, calldata, transaction payloads or attacker addresses.",
              "Every attack step that matters is paired with the missing check, and every case ends with the invariant that would have failed.",
              "Code is illustrative, written to the pattern, and says so. Facts link to their sources.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "On-chain",
    pages: [
      {
        slug: "wallet",
        title: "Connecting a wallet",
        lead: "Vault, Bridge and Swap are the only pages that touch a wallet, and they never connect on their own.",
        blocks: [
          {
            p: "Every other page in Dort reads files. These three send transactions, so they need a wallet — and Dort treats that as something you start, never something that happens to you. Nothing connects until you press the button, and no page holds a key of any kind.",
          },
          { h2: "Choosing between wallets" },
          {
            p: "With more than one extension installed, `window.ethereum` is a single slot that whichever loaded last wins — which is why a dapp so often opens the wrong wallet with no way to change it. Dort finds wallets through **EIP-6963** instead: each one announces itself, and the button opens a list of all of them by name.",
          },
          {
            list: [
              "One wallet installed: the button names it and connects in a single press.",
              "Several: the button opens a picker. Your choice is remembered for next time.",
              "None: the button offers somewhere to get one, instead of doing nothing.",
              "A wallet too old to announce itself is still listed, last, as **Browser wallet**.",
            ],
          },
          { h2: "Disconnecting" },
          {
            p: "Click your address in a panel's header and pick **Disconnect**. Dort forgets the account and the remembered wallet. It cannot revoke the extension's own permission — only the wallet can do that, in its own settings — and the page says so rather than implying otherwise.",
          },
          { h2: "When the chain id is right and the contracts are not" },
          {
            p: "The local demos run anvil under a real chain's id, so a wallet pointed at the real testnet reports the expected chain and is still looking at a different network: the contracts exist only on the node the page reads. Dort asks your wallet's own node what code is at the address, and if the answer is empty it locks the button rather than letting a transaction go nowhere.",
          },
          {
            note: "There is no WalletConnect: Dort speaks only to an extension in front of you, with no relay in between.",
            tone: "info",
          },
        ],
      },
      {
        slug: "vault",
        title: "Vault",
        lead: "Deposit and withdraw against DortSafeVault — the vault written correctly, next to a deliberately flawed twin.",
        blocks: [
          {
            p: "`foundry/src/DortVault.sol` is deliberately flawed — it is the sample the exporter is developed against, and what Chat is answering about when you press *Try the sample vault*. `DortSafeVault.sol` is its twin, written the way the same vault should be. The Vault page drives the correct one, and shows the things that make it correct.",
          },
          { h2: "What the page shows before you sign" },
          {
            list: [
              "The shares a deposit will mint, priced with the contract's own arithmetic.",
              "What your holding is worth now, and the price of one share.",
              "Which of the two exits you are taking, as an explicit choice rather than a hidden one.",
            ],
          },
          { h2: "Two ways out, and why it matters" },
          {
            p: "The token picker on the **Withdraw** side chooses the unit, and each unit is a different call on the contract.",
          },
          {
            table: {
              head: ["Pick", "Call", "What it does"],
              rows: [
                [
                  "the asset (pUSDT)",
                  "`withdraw`",
                  "takes an exact amount of the asset, burning however many shares that costs, rounded up",
                ],
                [
                  "the share (dpUSDT)",
                  "`redeem`",
                  "burns an exact number of shares",
                ],
              ],
            },
          },
          {
            p: "Only the second can empty a position completely. An exact withdraw of everything a holding is worth can cost one share more than you hold, because the value rounds down while the share cost rounds up. To leave entirely, pick the share and press **max**.",
          },
          { h2: "What makes it safe" },
          {
            list: [
              "**Effects before the transfer.** Shares are burnt before any asset moves, and a reentrancy guard refuses a second entry, so a token that calls back mid-withdraw finds no stale state.",
              "**Rounding goes the vault's way.** A deposit mints down, a withdraw burns up. A fuzz test proves no round trip can profit.",
              "**No first-depositor trick.** A virtual offset prices the empty vault, so donating into it cannot round the next depositor down to nothing.",
              "**What arrived, not what was asked.** Shares are priced on the balance delta, so a fee-on-transfer asset shortchanges nobody else.",
            ],
          },
          { h2: "Which chain, and which asset" },
          {
            p: "The vault is the one on-chain feature with no second end — unlike the bridge, it is a single contract on a single chain. So the same contract runs on two, and the page opens on whichever of them really has one.",
          },
          {
            table: {
              head: ["Chain", "Asset", "Vault"],
              rows: [
                [
                  "Base Sepolia `84532`",
                  "USDC `0x036CbD53…cF7e`, Circle's own",
                  "`0x162Dcf95…5aF8` — live",
                ],
                [
                  "Portaldot V3 `420420777`",
                  "pUSDT `0xe0114Adc…Dbc2`, the token [Swap](/docs/swap) trades",
                  "pending testnet gas",
                ],
              ],
            },
          },
          {
            p: "Portaldot is the better home and stays first in the picker: one chain would cover the whole loop — POT from the faucet, swapped for pUSDT on PortalSwapRouter, deposited into the vault. Its testnet gas is handed out by an admin rather than a self-service faucet, so Base Sepolia went first.",
          },
          {
            p: "Both assets are named in the app before a vault exists over them, so a chain with nothing deployed tells you what it would hold and says so plainly, rather than guessing at an address. Deploying one is three lines:",
          },
          {
            code: 'export VAULT_ASSET=0xe0114Adc0a2072B602C645f5a07EeFA1eaDBDbc2\nexport VAULT_NAME="Dort pUSDT Vault" VAULT_SYMBOL=dpUSDT VAULT_DECIMALS=6\nforge script script/DeployVault.s.sol --sig "run()" \\\n  --rpc-url https://test-evm-rpc-v3.portaldot.dev --account dort --sender $ME --broadcast',
          },
          {
            p: "Paste the `DortSafeVault` address it prints into the `vault` field of `VAULTS` in `features/vault/vault.ts`. Nothing else has to change: `firstDeployedChain()` picks the chain the page opens on, so a newly filled address moves the default there on its own. About 3.0M gas either way — roughly 0.00000015 POT on Portaldot, or 0.000012 ETH on Base Sepolia.",
          },
          {
            note: "The faucet sends to a native Portaldot address beginning with `5`, not to your `0x…` one. They are the same account written two ways; sending to the `0x…` form loses the tokens.",
            tone: "warn",
          },
          { h2: "Try it without a testnet" },
          {
            p: "The demo deploys two mock assets and a vault over each on a local anvil, then runs a deposit, a withdraw, a full exit and the first-depositor attack:",
          },
          {
            code: "bash script/vault-local-demo.sh",
          },
          {
            p: "Then open **Vault** and press **Use the local demo**.",
          },
          {
            note: "That anvil runs under Base Sepolia's chain id so your wallet and the page agree on it, and the switch moves the page's chain there with it. Point the wallet at `http://127.0.0.1:8545` or the page will lock the button — see [Connecting a wallet](/docs/wallet).",
            tone: "warn",
          },
        ],
      },
      {
        slug: "bridge",
        title: "Cross-chain bridge",
        lead: "Lock an asset on its home chain, use the wrapped copy on Portaldot V3, send it back.",
        blocks: [
          {
            p: "Not to be confused with [Run tests from the browser](/docs/run-from-browser), which is also called a bridge and does something else entirely. This one moves tokens between chains.",
          },
          { h2: "How it works" },
          {
            steps: [
              "**Lock.** `PortalBridgeEscrow` on the home chain holds the real asset and emits a message.",
              "**Relay.** `dort-relayer.mjs` reads that message and calls the other chain. It is a separate process you run; this page cannot carry the message itself.",
              "**Mint.** `PortalBridgeMinter` on Portaldot issues the wrapped copy, once per message.",
              "**Back.** Burning the wrapped copy releases the original, by the same route.",
            ],
          },
          { h2: "The invariant, shown" },
          {
            p: "Beside the form the page shows both chains' numbers side by side: what the escrow holds and what Portaldot has issued. A bridge is only honest while those match, so Dort puts them where you can see them rather than asking you to trust a badge.",
          },
          { h2: "What you are trusting" },
          {
            p: "This is a **trusted-relayer** design, and the relayer is the trust: an address the owner appoints, which reads one chain and calls the other. There is no light client. A stolen relayer key could move everything bridgeable. Testnet scope only.",
          },
          {
            p: "What holds without trusting it: a message pays out at most once, a release can never exceed what is locked, transfers obey a per-message cap, and the owner can pause instantly.",
          },
          { h2: "Try it without a testnet" },
          {
            code: "bash script/bridge-local-demo.sh",
          },
          {
            p: "It starts two anvil chains, deploys both sides, locks, relays, mints, burns, releases, and runs the relayer once more to show a repeat is a no-op. For the same round trip against the live chains (still no funds): `forge test --mc PortalBridgeCrossForkTest -vvv`.",
          },
        ],
      },
      {
        slug: "swap",
        title: "Swap",
        lead: "Trade on PortalSwapRouter, Portaldot V3's own DEX — with the price impact these pools really charge.",
        blocks: [
          {
            p: "PortalSwapRouter is a Uniswap V2 fork taking 0.30% per trade. Its factory holds a pool for every pair of its five tokens, so nothing here ever needs more than one hop. Unlike the Vault and the Bridge, this one needs nothing deployed: the DEX is already live on Portaldot, so the page works against the real chain today.",
          },
          { h2: "Price impact gets its own line" },
          {
            p: "These pools hold a few hundred tokens. A trade that looks ordinary can cost several percent, so the number is shown plainly rather than hidden behind a tooltip: past 1% the page warns, and past 15% the button refuses — on a pool this thin that is not a trade, it is a donation.",
          },
          { h2: "Where the quote comes from" },
          {
            p: "The quote is computed in the page from the pair's reserves, using the router's own arithmetic, so it answers while you type. A check pins that arithmetic against answers read from the live contract — change the fee or the rounding and it stops matching the chain. Before you sign, the router prices the trade again, and the floor you are protected by (`amountOutMin`) comes from that second number, not the first.",
          },
          { h2: "Native POT" },
          {
            p: "POT is routed through WPOT and needs no approval; every other token needs one, once. **Max** on POT leaves a little behind to pay for the transaction that spends it. POT to WPOT is wrapping rather than swapping, and the router has no pool for it, so the page says so instead of letting the transaction fail.",
          },
          { h2: "Slippage" },
          {
            p: "0.1%, 0.5% (the default), 1% or 3%. The page shows what you would receive at worst before you commit.",
          },
          {
            note: "Testnet tokens on a testnet DEX. The pools are small enough that they are a good place to see what price impact actually means.",
            tone: "info",
          },
        ],
      },
    ],
  },
  {
    title: "Running tests",
    pages: [
      {
        slug: "exporter",
        title: "The exporter",
        lead: "Plain Node scripts that run your tests and write dort-data.json.",
        blocks: [
          {
            p: "`dort-export.mjs` runs `forge build`, `forge test --json -vvvv` and one `forge test --debug --dump` per unit test, decodes the frames with your ABIs and writes `dort-data.json`. It needs `forge` on PATH and Node 20+, and nothing to install.",
          },
          { h2: "Commands" },
          {
            code: "node dort-export.mjs                          # all tests\nnode dort-export.mjs --mt test_deposit        # one test\nnode dort-export.mjs --mc VaultTest           # one test contract\nnode dort-export.mjs --chain base-sepolia     # on a fork of Base Sepolia\nnode dort-export.mjs --forks all              # the local run plus one per testnet\nDORT_ATLAS=MyVault node dort-export.mjs      # the contract the atlas maps",
          },
          { h2: "The scripts" },
          {
            table: {
              head: ["File", "Does"],
              rows: [
                [
                  "dort-export.mjs",
                  "Entry point: build, test, trace, write the file",
                ],
                ["dort-lib.mjs", "ABI decoding, keccak, source maps"],
                [
                  "dort-atlas.mjs",
                  "The contract map from the AST and storage layout",
                ],
                ["dort-findings.mjs", "Slither and Aderyn reports, merged"],
                ["dort-coverage.mjs", "forge coverage mapped onto the atlas"],
                [
                  "dort-chains.mjs",
                  "The seven testnets for --chain and --forks",
                ],
                [
                  "dort-bridge.mjs",
                  "Optional: lets the hosted app run the exporter ([run from the browser](/docs/run-from-browser))",
                ],
              ],
            },
          },
          {
            note: "If the atlas or coverage step fails, the export still writes the traces and prints `dort: atlas skipped` or `dort: coverage skipped` with the reason.",
          },
        ],
      },
      {
        slug: "forks",
        title: "Testnet forks",
        lead: "Run the same tests on copies of seven EVM testnets, Portaldot V3 first, read-only.",
        blocks: [
          {
            p: "`--chain <key>` runs your tests on a fork of that chain at its latest block; `--forks all` adds one such run per chain next to the local one. Nothing is sent on-chain: no key, no gas. Chat names the forked runs in the summary it reads, so you can ask whether a test behaves differently against live state.",
          },
          {
            video: "/docs/fork.mp4",
            caption:
              "The fork picker: the local run, or the same tests on a testnet fork",
          },
          {
            table: {
              head: ["Key", "Chain"],
              rows: [
                ["portaldot-testnet", "Portaldot V3 Testnet (420420777)"],
                ["sepolia", "Ethereum Sepolia"],
                ["arbitrum-sepolia", "Arbitrum Sepolia"],
                ["base-sepolia", "Base Sepolia"],
                ["robinhood-testnet", "Robinhood Chain Testnet"],
                ["hyperevm-testnet", "HyperEVM Testnet"],
                ["tempo-testnet", "Tempo Testnet (Moderato)"],
              ],
            },
          },
          {
            p: "Public RPCs are used by default. For a provider endpoint set `DORT_RPC_<KEY>`, e.g. `DORT_RPC_BASE_SEPOLIA=https://…`.",
          },
        ],
      },
      {
        slug: "run-from-browser",
        title: "Run tests from the browser",
        lead: "dort-bridge.mjs lets a Dort in your browser run forge on your computer.",
        blocks: [
          {
            p: "A website cannot start programs on your computer, and Dort's server never runs anyone's code. The bridge is a small script you start yourself in your Foundry project. It links the page to that project: the page asks, the bridge runs `node dort-export.mjs` on your machine and streams the result back. Nothing is uploaded.",
          },
          { h2: "Use it" },
          {
            steps: [
              "Download it with the exporter (see [Quick start](/docs/quick-start)).",
              "In the project root, run `node dort-bridge.mjs` and keep that terminal open.",
              "Open the link it prints. The header says **Live** with your project's name.",
              "**Start test**, **Choose**, **Test all** and **Reload run** now run on your computer.",
            ],
          },
          {
            code: "node dort-bridge.mjs --app http://localhost:3000\n\nDort bridge · my-vault\nOpen this link in Chrome, Brave, Edge or Firefox (keep this window open):\n  http://localhost:3000/chat#bridge=7457.…",
          },
          { h2: "Browsers" },
          {
            table: {
              head: ["Browser", "Works"],
              rows: [
                [
                  "Chrome, Brave, Edge",
                  "Yes, after you allow the site to reach this computer (asked once)",
                ],
                ["Firefox", "Yes"],
                [
                  "Safari",
                  "No: it blocks a secure page from reaching your computer. Use another browser",
                ],
              ],
            },
          },
          { h2: "Why it is safe" },
          {
            list: [
              "It listens on `127.0.0.1` only: nothing else on your network can reach it.",
              "It answers only the Dort site, and every request needs the token from the link. The token rides in the link's `#` part, which browsers never send to a server.",
              "It runs nothing but `node dort-export.mjs` in its folder, with test and chain names checked first. No command, flag or path comes from the page.",
              "One run at a time, a 15 minute limit, and Stop ends forge.",
            ],
          },
          { h2: "Troubleshooting" },
          {
            list: [
              "**Bridge unreachable**: check the terminal is still running, allow the permission prompt (or turn it back on in the site settings, the icon left of the address), then press Retry.",
              "**No dort-export.mjs here**: start the bridge in the project root, where you downloaded the exporter.",
              "Port 7457 busy: it tries the next ports, or pass `--port 8000`.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "AI",
    pages: [
      {
        slug: "ai",
        title: "Ask AI providers",
        lead: "Bring your own model — or use this deployment's, if whoever runs it provided one.",
        blocks: [
          { p: "Open **Connect AI** in the app's top bar." },
          {
            table: {
              head: ["Option", "What answers", "What leaves your machine"],
              rows: [
                [
                  "None",
                  "Dort's built-in text, composed from the run's own figures",
                  "Nothing",
                ],
                [
                  "**Dort's model** (default where offered)",
                  "This deployment's own Amazon Bedrock — Claude Haiku by default, since whoever runs it pays",
                  "Your question and any code with it, to **that operator's AWS account** — and into its logs if model invocation logging is on there. Only offered when the server has `BEDROCK_API_KEY` set. Other vendors — MiniMax, GLM, Qwen, Kimi, DeepSeek — can be picked beside it, and the operator sets which with `BEDROCK_MODELS`; nothing outside that list can be asked for. Bring your own key for anything unpublished",
                ],
                [
                  "Local model",
                  "Ollama, LM Studio or any OpenAI-compatible server you run",
                  "The prompt goes from your browser to that endpoint (normally localhost)",
                ],
                [
                  "Own API key",
                  "Anthropic, Amazon Bedrock, OpenAI or OpenRouter",
                  "The prompt and key go from your browser straight to that provider",
                ],
                [
                  "Your Claude",
                  "Your own Claude Code with your Claude plan",
                  "Local Dort only ([Run Dort locally](/docs/local))",
                ],
              ],
            },
          },
          { h2: "What is sent" },
          {
            p: "Only when you ask, and only for the selected piece or calls: their source lines, the connected pieces, open findings and your question, plus a fixed system prompt that keeps the model defensive (explain, list what to check, write a test of intended behaviour, never exploits).",
          },
          { h2: "Local model in the browser" },
          {
            p: "The browser calls your local server directly, so it must allow the site. With Ollama:",
          },
          {
            code: 'launchctl setenv OLLAMA_ORIGINS "http://localhost:3000"   # macOS, then restart Ollama\nollama pull llama3.1',
          },
          {
            p: "Then pick **Local model**, endpoint `http://localhost:11434/v1`, model `llama3.1`, and press Test connection. In LM Studio, turn on **Enable CORS** in the server settings.",
          },
          { h2: "Amazon Bedrock" },
          {
            p: "Bedrock is your own AWS account, with your own key: Dort holds no AWS credential and makes no call on anyone's behalf. Pick **Own API key**, then **Amazon Bedrock**, and give it a region, a model id and a Bedrock API key. It speaks Anthropic's Messages API, so the request is the same one the Anthropic option sends, to a different host.",
          },
          {
            p: "An AWS credential is wider than an `sk-\u2026`, so scope it: an IAM role that can do nothing but `bedrock:CallWithBearerToken`, `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the models you need, and a short-term key over a long-term one.",
          },
          {
            list: [
              "Bedrock does not store prompts or train on them by default.",
              "**Model invocation logging**, if you have it on, writes them in full to your own CloudWatch or S3 \u2014 which for an audit means a client's unpublished source.",
              "A **cross-region inference profile** can carry the prompt out of the region you picked.",
            ],
          },
          {
            note: "Your API key is kept only in this browser's localStorage and sent only to the provider you picked. Use a key you can revoke, with a spend limit.",
            tone: "warn",
          },
        ],
      },
      {
        slug: "mcp",
        title: "MCP server",
        lead: "Let your own AI client read a run and propose scenarios.",
        blocks: [
          {
            p: "MCP (Model Context Protocol) is a standard plug that gives an AI client tools. `dort-mcp.mjs` gives Claude Code, Claude Desktop or Cursor Dort's view of your run: decoded traces, the contract map, findings. Without it, the AI reads raw forge output or a large JSON; with it, it asks Dort for exactly what it needs.",
          },
          { h2: "Set it up" },
          {
            code: `curl -fsSLO "${SITE}/exporter/dort-mcp.mjs"\nclaude mcp add dort -- node /abs/path/dort-mcp.mjs --data=/abs/path/dort-data.json`,
          },
          { h2: "Tools" },
          {
            table: {
              head: ["Tool", "Access", "Returns"],
              rows: [
                [
                  "overview",
                  "read",
                  "Contract, tests, finding counts, coverage and what scenarios may use",
                ],
                ["get_trace(test)", "read", "One test's decoded frames"],
                [
                  "get_atlas",
                  "read",
                  "Every mapped piece and what each entry point reads, writes, calls and emits",
                ],
                [
                  "get_piece(id)",
                  "read",
                  "One piece: source lines, links, findings, reverts, coverage",
                ],
                [
                  "list_findings",
                  "read",
                  "Slither, Aderyn and Dort findings, by severity or tool",
                ],
                [
                  "propose_scenario",
                  "append",
                  "Checks a scenario and saves it to dort-scenarios.json",
                ],
              ],
            },
          },
          { h2: "Proposals in the Lab" },
          {
            p: "A proposal is written to `dort-scenarios.json` in your project, next to `dort-data.json`. This build has no scenario editor to review it in — that lives in the full version of the app — so treat the file as the record: read it, run the generated test yourself, and keep it in your suite only once you agree with it.",
          },
          {
            note: "The server runs on your machine over stdio, makes no network calls, reads dort-data.json and only writes dort-scenarios.json. Scenarios test intended behaviour only.",
          },
        ],
      },
    ],
  },
  {
    title: "More",
    pages: [
      {
        slug: "local",
        title: "Run Dort locally",
        lead: "The whole app on your machine, for Your Claude and a live link to one export.",
        blocks: [
          {
            p: "Dort runs on your own machine. That is what makes **Your Claude** possible (answers from your own Claude Code and plan), and what lets the app read one project's export straight off disk, with no bridge in between.",
          },
          {
            code: "git clone https://github.com/maulana-tech/dort-app.git\ncd dort-app/apps/frontend\npnpm install\nDORT_DATA_PATH=/abs/path/to/your-project/dort-data.json pnpm dev",
          },
          {
            p: "Open http://localhost:3000/chat. Start test runs the exporter next to that file, and Reload run (⌘R) re-reads it after every export.",
          },
        ],
      },
      {
        slug: "privacy",
        title: "Privacy & security",
        lead: "What stays on your machine, and what Dort will never do.",
        blocks: [
          { h2: "Your code and runs" },
          {
            list: [
              "The exporter and the bridge run on your machine; your code is never uploaded.",
              "A dropped dort-data.json is read in your browser tab only.",
              "Triage notes, scenarios and AI settings are kept in your browser, per contract.",
              "Dort's server serves the app and the exporter scripts. Its local-only routes answer 404 on any public deploy.",
              "One route is not local-only: if the deployment sets `BEDROCK_API_KEY`, **Dort's model** answers through that operator's AWS account, so your question — and any code you send with it — leaves your browser for them. It is the default only while you have chosen no provider, the page says so wherever it answers, and picking any other provider in Connect AI stops it. Reviewing something unpublished? Bring your own key.",
            ],
          },
          { h2: "Defensive by design" },
          {
            list: [
              "No exploit code, attack contracts, calldata or attack steps, in the app or from its AI prompts.",
              "Scenarios and generated tests check intended behaviour.",
              "Exploits are closed, historical incidents written as post-mortems, without addresses or payloads.",
            ],
          },
        ],
      },
      {
        slug: "limits",
        title: "Known limits",
        lead: "What Dort does not do well yet.",
        blocks: [
          { h2: "Large projects" },
          {
            p: "Dort is not fast with large projects yet. It has been tried on small projects (the sample vault, a fresh `forge init`); hundreds of tests make a big dort-data.json that the browser can be slow to open. Export a part at a time:",
          },
          {
            code: "node dort-export.mjs --mc VaultTest      # one test contract\nnode dort-export.mjs --mt test_deposit   # one test",
          },
          { h2: "Browsers" },
          {
            p: "The bridge does not work in Safari, which blocks a secure page from reaching your computer. Everything else works in current Chrome, Brave, Edge, Firefox and Safari.",
          },
          { h2: "Windows" },
          {
            p: "Dort is tested on macOS. On Windows, use WSL, or `curl.exe` instead of `curl` in PowerShell, where `curl` is another command.",
          },
          { h2: "Phones" },
          {
            p: "Every page here works on a phone. The exporter and the bridge need a desktop, because they run `forge` on your own machine.",
          },
          { h2: "Test data" },
          {
            p: "Fuzz and invariant tests are listed with their runs, but only unit tests get line-by-line step data.",
          },
        ],
      },
    ],
  },
];

/** every page in reading order, for previous / next and the routes */
export const PAGES = GROUPS.flatMap((g) => g.pages);

export const pageBySlug = (slug: string) => PAGES.find((p) => p.slug === slug);

export const hrefOf = (p: DocPage) => (p.slug ? `/docs/${p.slug}` : "/docs");

/** the anchor of a heading: "What Dort is not" → "what-dort-is-not" */
export const anchorOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
