"use client";

import { WalletButton } from "@/components/(main)/action/WalletButton";
import { Button, Chip, Panel } from "@/components/ui";
import { formatAmount } from "@/features/bridge/bridge";
import { type BridgeChainId, txUrl } from "@/features/bridge/chains";
import { useWallet } from "@/features/bridge/WalletProvider";
import {
  coverage,
  held,
  type Move,
  type Position,
  totals,
  usePortfolio,
} from "@/features/portfolio";

/**
 * Everything you hold in Dort's vaults, and how you came to hold it.
 *
 * The page is split the way its data is. Positions are direct calls — exact, cheap, always
 * available — so they lead. History is `eth_getLogs`, which every public endpoint caps, so it
 * follows and is allowed to say it did not see everything: `coverage()` names the oldest block
 * actually read. A portfolio that silently drops a withdrawal because an RPC refused a block
 * range is worse than one that admits the range.
 *
 * Nothing here is a price. Worth is `previewRedeem` in the vault's own asset — what the chain
 * would give back right now — and there is no dollar figure anywhere, because Dort has no
 * business inventing one for a testnet token.
 */
export function PortfolioWorkspace() {
  const wallet = useWallet();
  const p = usePortfolio(wallet.account);
  const open = p.positions.filter(held);
  const sums = totals(open);
  const note = coverage(p.complete, p.oldest);

  return (
    <div className="dot-grid min-h-[calc(100dvh-64px)] w-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          label="Positions"
          aside={
            <div className="flex items-center gap-2">
              {p.loading && <Chip>Reading…</Chip>}
              <WalletButton wallet={wallet} />
            </div>
          }
        >
          <div className="grid gap-3 px-4 pb-4">
            {!wallet.account ? (
              <p className="max-w-[60ch] text-ui-xs text-body leading-normal">
                Connect a wallet and this reads every vault Dort knows about, on
                every chain, and shows what that address holds. It only reads —
                nothing here can move anything.
              </p>
            ) : open.length === 0 ? (
              <p className="max-w-[60ch] text-ui-xs text-body leading-normal">
                {p.loading
                  ? "Reading the vaults…"
                  : "No position in any vault yet. Deposit on the Vault page and it appears here."}
              </p>
            ) : (
              <>
                {sums.map((t) => (
                  <div
                    key={t.symbol}
                    className="flex items-baseline justify-between gap-3 rounded-tile bg-inset px-3 py-2.5"
                  >
                    <span className="text-ui-xs text-muted">
                      Total {t.symbol}, across {open.length} vault
                      {open.length === 1 ? "" : "s"}
                    </span>
                    <span className="font-mono text-[15px] text-fg">
                      {formatAmount(t.worth, t.decimals)} {t.symbol}
                    </span>
                  </div>
                ))}
                {open.map((o) => (
                  <PositionRow key={`${o.chain}-${o.vault}`} p={o} />
                ))}
              </>
            )}

            {p.errors.map((e) => (
              <p
                key={e}
                className="flex items-start gap-2 text-ui-xs text-body leading-normal"
              >
                <span className="mt-1.5 size-1.5 flex-none rounded-full bg-red" />
                <span>{e}</span>
              </p>
            ))}
          </div>
        </Panel>

        <Panel
          label="History"
          aside={
            <Button
              size="sm"
              variant="ghost"
              disabled={p.loading}
              onClick={p.refresh}
            >
              {p.loading ? "Reading…" : "Reload"}
            </Button>
          }
        >
          <div className="grid gap-2.5 px-4 pb-4">
            {!wallet.account ? (
              <p className="text-ui-xs text-dim leading-normal">
                Every deposit and withdrawal this address made, read from the
                vaults' own events.
              </p>
            ) : p.moves.length === 0 ? (
              <p className="text-ui-xs text-dim leading-normal">
                {p.loading ? "Scanning the logs…" : "Nothing yet."}
              </p>
            ) : (
              p.moves.map((m) => (
                <MoveRow key={`${m.tx}-${m.block}-${m.kind}`} m={m} />
              ))
            )}
            {note && (
              <p className="flex items-start gap-2 text-ui-xs text-dim leading-normal">
                <span className="mt-1.5 size-1.5 flex-none rounded-full bg-yellow" />
                <span>{note}</span>
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PositionRow({ p }: { p: Position }) {
  return (
    <div className="grid gap-1.5 rounded-tile border border-border bg-inset p-3">
      <div className="flex items-center gap-2">
        <span className="size-1.5 flex-none rounded-full bg-green" />
        <span className="text-ui-sm text-fg">{p.chainName}</span>
        <span className="ml-auto font-mono text-ui-sm text-fg">
          {formatAmount(p.worth, p.decimals)} {p.symbol}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11.5px] text-dim">{p.vault}</span>
        <span className="font-mono text-[11.5px] text-dim">
          {formatAmount(p.shares, p.decimals)} {p.shareSymbol}
        </span>
      </div>
    </div>
  );
}

function MoveRow({ m }: { m: Move }) {
  const url = txUrl(m.chain as BridgeChainId, m.tx);
  const sign = m.kind === "deposit" ? "+" : "−";
  return (
    <div className="grid gap-1 rounded-tile bg-inset px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ui-xs text-text capitalize">{m.kind}</span>
        <span className="font-mono text-ui-xs text-fg">
          {sign}
          {formatAmount(m.assets, m.decimals)} {m.symbol}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11.5px] text-dim">
        <span>
          {m.chainName} · block {m.block.toLocaleString("en-US")}
        </span>
        <span>
          {sign}
          {formatAmount(m.shares, m.decimals)} {m.shareSymbol}
        </span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate font-mono text-[11.5px] text-dim underline-offset-2 hover:text-fg hover:underline"
        >
          {m.tx}
        </a>
      )}
    </div>
  );
}
