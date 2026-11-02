import Image from "next/image";
import Link from "next/link";
import { ChainLogo, PH, PhIcon } from "@/components/ui";
import { PORTALDOT_ID } from "@/features/bridge/chains";
import { FEE_BPS, ROUTER, TOKENS } from "@/features/swap/swap";
import { VAULTS } from "@/features/vault/vault";
import { Reveal } from "./motion";

/**
 * The on-chain half of Dort: the three pages that move value, and the chain they were built for.
 *
 * Every figure here is read from the app's own source rather than written as copy — the vault
 * address from `VAULTS`, the router and its fee from `features/swap`, the chain id from the
 * bridge's chain list — so the landing cannot claim a deployment the app does not have. The
 * things that were measured against the live chain (the fee, the getter's name, the pool count)
 * are pinned by swap.check.ts against answers recorded from the router itself.
 */

const PORTALDOT = {
  rpc: "https://test-evm-rpc-v3.portaldot.dev",
  console: "https://node-console.portaldot.dev",
};

const deployed = VAULTS[84532]?.find((v) => v.vault)?.vault ?? null;
/**
 * The pools are over the ERC-20s. TOKENS also carries POT, the native coin, which has no address
 * and no pool of its own — the router wraps it. Counting the list would say six where the factory
 * holds pairs over five.
 */
const POOLED = TOKENS.filter((t) => t.address).length;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const CARDS = [
  {
    href: "/vault",
    label: "Vault",
    icon: PH.boxOn,
    title: "Deposit, and see the shares first",
    body: "DortSafeVault is the vault written correctly: effects before the transfer, a reentrancy guard, rounding that always favours the vault, and a virtual offset against the first-depositor attack. The page shows the shares a deposit will mint before you sign — not after.",
    facts: deployed
      ? [
          ["Live on Base Sepolia", short(deployed)],
          ["Asset", "Circle's own USDC"],
          ["On Portaldot", "pUSDT, pending testnet gas"],
        ]
      : [["Asset", "pUSDT on Portaldot V3"]],
  },
  {
    href: "/swap",
    label: "Swap",
    icon: PH.reload,
    title: "Trade on Portaldot's own DEX",
    body: "PortalSwapRouter is a Uniswap V2 fork living on Portaldot V3. Its fee, its function names and its pools were read off the live chain rather than assumed from the V2 interface — the quote here reproduces what the router really answers, to the wei.",
    facts: [
      ["Router", short(ROUTER)],
      ["Fee", `${(Number(FEE_BPS) / 100).toFixed(2)}% exactly`],
      ["Pools", `10 over ${POOLED} tokens — always one hop`],
    ],
  },
  {
    href: "/bridge",
    label: "Bridge",
    icon: PH.path,
    title: "Lock at home, mint on Portaldot",
    body: "An escrow holds the real asset on its home chain; a minter issues the wrapped copy on Portaldot, once per message. Both sides' numbers sit side by side on the page, because a bridge is only honest while what the escrow holds matches what Portaldot has issued.",
    facts: [
      ["Home chains", "Ethereum, Arbitrum, Base and three more"],
      ["Relayer", "dort-relayer.mjs, your own key"],
      ["Replay", "refused: one mint per message id"],
    ],
  },
] as const;

export function OnChain() {
  return (
    <section
      data-tone="deep"
      className="relative mx-auto max-w-[1240px] px-4 py-24 md:px-6 md:py-32"
    >
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[.18] bg-white/[.1] px-3 py-1 font-mono text-[12px] text-on-canvas-muted">
              <Image
                src="/logos/chains/portaldot.png"
                alt=""
                width={16}
                height={16}
                className="size-4 rounded-[4px]"
              />
              Portaldot V3 Testnet · chain {PORTALDOT_ID}
            </p>
            <h2 className="max-w-[18ch] font-light text-[clamp(32px,4.2vw,58px)] text-on-canvas leading-[1.02] tracking-[-0.03em]">
              Reading is half of it.
            </h2>
          </div>
          <p className="max-w-[420px] text-[15px] text-on-canvas-muted leading-relaxed md:text-[16px]">
            The other half is doing something with what you read. Three pages
            move real value on Portaldot V3, and each one tells you what will
            happen before it asks for a signature.
          </p>
        </div>
      </Reveal>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {CARDS.map((c, i) => (
          <Reveal key={c.label} delay={0.08 * i}>
            <Link
              href={c.href}
              className="group flex h-full flex-col rounded-card border border-white/[.1] bg-card-grad p-5 shadow-soft transition-colors hover:border-white/[.2]"
            >
              <span className="flex items-center gap-2 text-[13px] text-dim">
                <PhIcon d={c.icon} className="size-[15px]" />
                {c.label}
                <PhIcon
                  d={PH.caretRight}
                  className="ml-auto size-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </span>
              <h3 className="mt-3 font-medium text-[19px] text-fg leading-snug tracking-[-0.01em]">
                {c.title}
              </h3>
              <p className="mt-2 text-[13.5px] text-body leading-relaxed">
                {c.body}
              </p>
              <dl className="mt-4 grid gap-1.5 border-border border-t pt-3">
                {c.facts.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-[12px] text-muted">{k}</dt>
                    <dd className="text-right font-mono text-[12px] text-fg">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          </Reveal>
        ))}
      </div>

      {/* the chain itself, named rather than implied */}
      <Reveal delay={0.24}>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-white/[.1] bg-white/[.04] px-5 py-4 font-mono text-[12.5px] text-on-canvas-dim">
          <span className="flex items-center gap-2 text-on-canvas">
            <ChainLogo family="portaldot" className="size-5" />
            Portaldot V3
          </span>
          <span>chain id {PORTALDOT_ID}</span>
          <a
            href={PORTALDOT.rpc}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-on-canvas"
          >
            {PORTALDOT.rpc.replace("https://", "")}
          </a>
          <a
            href={PORTALDOT.console}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-on-canvas"
          >
            node console ↗
          </a>
          <span className="ml-auto">POT · 18 decimals over the EVM RPC</span>
        </div>
      </Reveal>
    </section>
  );
}
