"use client";

import { useMemo, useState } from "react";
import {
  ActionButton,
  AmountField,
  DestinationRow,
  Note,
} from "@/components/(main)/action/ActionCard";
import { TokenSelect } from "@/components/(main)/action/TokenSelect";
import { WalletButton } from "@/components/(main)/action/WalletButton";
import { ChainLogo, Chip, Panel, TokenIcon } from "@/components/ui";
import {
  formatAmount,
  parseAmount,
  shortAddress,
} from "@/features/bridge/bridge";
import { txUrl } from "@/features/bridge/chains";
import { useWallet } from "@/features/bridge/WalletProvider";
import {
  amountOut,
  asErc20,
  DEFAULT_SLIPPAGE,
  depositNote,
  FEE_BPS,
  IMPACT_WARN_BPS,
  isWrap,
  maxSpendable,
  minOut,
  priceImpactBps,
  ROUTER,
  SLIPPAGE,
  SWAP_CHAIN,
  swapAction,
  TOKENS,
  tokenById,
} from "@/features/swap/swap";
import { useSwap } from "@/features/swap/useSwap";

/**
 * Swap: trade on Portaldot V3's own DEX, PortalSwapRouter.
 *
 * The card is the shared action anatomy (components/(main)/action/ActionCard) with a picker on
 * each side and a flip between them. What it shows that a swap box usually buries is the price
 * impact: these pools hold a few hundred tokens, so an ordinary-looking trade can cost several
 * percent, and the number is given its own line rather than a tooltip. Past 15% the button
 * refuses — on a pool this thin that is not a trade, it is a donation.
 *
 * The quote is computed locally from the pair's reserves (swap.ts reproduces the router's
 * arithmetic to the wei), so it answers while you type; the router prices it again immediately
 * before signing, and `amountOutMin` comes from that second number.
 */
export function SwapWorkspace() {
  const wallet = useWallet();
  const [fromId, setFromId] = useState("POT");
  const [toId, setToId] = useState("pUSDT");
  const [input, setInput] = useState("");
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);

  const from = tokenById(fromId);
  const to = tokenById(toId);
  const s = useSwap(wallet, from, to);

  const amount = useMemo(
    () => parseAmount(input, from.decimals),
    [input, from.decimals],
  );
  const quote =
    amount === null || s.reserveIn === null || s.reserveOut === null
      ? null
      : amountOut(amount, s.reserveIn, s.reserveOut);
  const impact =
    amount === null || s.reserveIn === null || s.reserveOut === null
      ? 0
      : priceImpactBps(amount, s.reserveIn, s.reserveOut);

  const needsApproval =
    !from.native &&
    amount !== null &&
    s.allowance !== null &&
    s.allowance < amount;
  const tooMuch =
    amount !== null && s.balanceIn !== null && amount > s.balanceIn;
  // why a native balance reads a tenth below what the wallet says: the chain keeps that much
  // in every account and eth_getBalance has already taken it off
  const deposit = depositNote(!!from.native);

  const act = swapAction({
    connected: Boolean(wallet.account),
    onRightChain: wallet.chainId === SWAP_CHAIN,
    from,
    to,
    amount,
    balance: s.balanceIn,
    quote,
    impactBps: impact,
    needsApproval,
    step: s.step,
  });

  const busy = s.step === "approve" || s.step === "submit";
  const flip = () => {
    setFromId(toId);
    setToId(fromId);
    setInput("");
  };

  // the rate, read the way a trader reads it: one of the input token, in the output token
  const one = 10n ** BigInt(from.decimals);
  const rate =
    s.reserveIn === null || s.reserveOut === null
      ? null
      : amountOut(one, s.reserveIn, s.reserveOut);

  async function onPress() {
    if (!wallet.account) return wallet.connect();
    if (wallet.chainId !== SWAP_CHAIN) return wallet.switchTo(SWAP_CHAIN);
    if (needsApproval) return s.approve();
    if (amount !== null && quote !== null)
      return s.swap(amount, quote, slippage);
  }

  const choices = (exclude: string) =>
    TOKENS.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      disabled: t.id === exclude,
    }));

  return (
    <div className="dot-grid min-h-[calc(100dvh-64px)] w-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── the action ───────────────────────────────────────────────── */}
        <Panel label="Swap" aside={<WalletButton wallet={wallet} />}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pb-4">
            <AmountField
              id="swap-amount"
              label="You pay"
              value={input}
              onChange={setInput}
              disabled={busy}
              tooMuch={tooMuch}
              token={
                <TokenSelect
                  value={fromId}
                  tokens={choices(toId)}
                  onChange={(id) => {
                    if (id === toId) return flip();
                    setFromId(id);
                    setInput("");
                  }}
                  ariaLabel="You pay"
                  disabled={busy}
                />
              }
              secondary={
                rate === null
                  ? undefined
                  : `1 ${from.symbol} ≈ ${formatAmount(rate, to.decimals)} ${to.symbol}`
              }
              available={
                s.balanceIn === null ? undefined : (
                  <>
                    {`Available ${formatAmount(s.balanceIn, from.decimals)}`}
                    {deposit && <span className="text-dim"> · {deposit}</span>}
                  </>
                )
              }
              onMax={
                s.balanceIn && maxSpendable(s.balanceIn, !!from.native) > 0n
                  ? () =>
                      setInput(
                        formatAmount(
                          maxSpendable(s.balanceIn ?? 0n, !!from.native),
                          from.decimals,
                        ),
                      )
                  : undefined
              }
            />

            <div className="-my-1.5 flex justify-center">
              <button
                type="button"
                onClick={flip}
                disabled={busy}
                aria-label="Swap the two tokens around"
                className="relative z-10 grid size-8 place-items-center rounded-full border border-border bg-raised text-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-40"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none">
                  <title>flip</title>
                  <path
                    d="M5 3v10m0 0 2.5-2.5M5 13 2.5 10.5M11 13V3m0 0L8.5 5.5M11 3l2.5 2.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <AmountField
              id="swap-receive"
              label="You receive"
              value={quote === null ? "" : formatAmount(quote, to.decimals)}
              onChange={() => {}}
              disabled
              token={
                <TokenSelect
                  value={toId}
                  tokens={choices(fromId)}
                  onChange={(id) => {
                    if (id === fromId) return flip();
                    setToId(id);
                  }}
                  ariaLabel="You receive"
                  disabled={busy}
                />
              }
              secondary={
                quote === null || quote === 0n
                  ? undefined
                  : `at worst ${formatAmount(minOut(quote, slippage), to.decimals)} after ${(slippage / 100).toFixed(2)}% slippage`
              }
              available={
                s.balanceOut === null
                  ? undefined
                  : `Balance ${formatAmount(s.balanceOut, to.decimals)}`
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-ui-xs text-dim">Max slippage</span>
              <div className="flex items-center gap-1.5">
                {SLIPPAGE.map((bps) => (
                  <button
                    key={bps}
                    type="button"
                    disabled={busy}
                    onClick={() => setSlippage(bps)}
                    className={`h-7 rounded-chip px-2.5 text-ui-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-40 ${
                      bps === slippage
                        ? "bg-primary text-primary-fg"
                        : "bg-raised text-muted hover:bg-hover hover:text-fg"
                    }`}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>
            </div>

            <DestinationRow
              label="Route"
              value={
                isWrap(from, to) ? (
                  <span className="text-dim">not a swap</span>
                ) : (
                  <span className="flex items-center gap-2 font-mono text-ui-xs">
                    {from.symbol}
                    <span className="text-dim">→</span>
                    {to.symbol}
                    <span className="text-dim">· one hop</span>
                  </span>
                )
              }
            />

            <ActionButton disabled={act.disabled || tooMuch} onClick={onPress}>
              {tooMuch ? "Not enough balance" : act.label}
            </ActionButton>

            <div className="grid gap-2">
              {act.why && <p className="text-ui-xs text-dim">{act.why}</p>}
              {!act.why && impact >= IMPACT_WARN_BPS && quote !== null && (
                <Note tone="warn">
                  This trade moves the price {(impact / 100).toFixed(2)}%. These
                  testnet pools are small — a smaller amount costs far less.
                </Note>
              )}
              {s.pair === null && !isWrap(from, to) && (
                <Note tone="bad">
                  No pool for {from.symbol} → {to.symbol} on this router.
                </Note>
              )}
              {(wallet.error || s.error) && (
                <Note tone="bad">{wallet.error ?? s.error}</Note>
              )}
              {s.step === "done" && <Note tone="ok">Swapped.</Note>}
              {s.txHash && (
                <p className="font-mono text-ui-xs text-dim">
                  {txUrl(SWAP_CHAIN, s.txHash) ? (
                    <a
                      href={txUrl(SWAP_CHAIN, s.txHash) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:text-fg hover:underline"
                    >
                      {shortAddress(s.txHash)}
                    </a>
                  ) : (
                    shortAddress(s.txHash)
                  )}
                </p>
              )}
            </div>
          </div>
        </Panel>

        {/* ── the pool, and what it costs to trade in it ───────────────── */}
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4">
          <Panel
            label="The pool"
            aside={
              <Chip
                dot
                tone={
                  impact >= IMPACT_WARN_BPS ? "warn" : s.pair ? "ok" : "neutral"
                }
              >
                {s.pair
                  ? `${asErc20(from).symbol}/${asErc20(to).symbol}`
                  : "none"}
              </Chip>
            }
          >
            <dl className="grid gap-1 px-4 pb-4">
              {/* the pool holds the wrapped token, never the native coin: say which */}
              <Row
                k={`${asErc20(from).symbol} in the pool`}
                v={
                  s.reserveIn === null
                    ? "—"
                    : formatAmount(s.reserveIn, from.decimals)
                }
              />
              <Row
                k={`${asErc20(to).symbol} in the pool`}
                v={
                  s.reserveOut === null
                    ? "—"
                    : formatAmount(s.reserveOut, to.decimals)
                }
              />
              <Row
                k="Price impact"
                v={amount === null ? "—" : `${(impact / 100).toFixed(2)}%`}
              />
              <Row k="Router fee" v={`${Number(FEE_BPS) / 100}%`} />
              <Row k="Pair" v={s.pair ? shortAddress(s.pair) : "—"} />
            </dl>
          </Panel>

          <Panel label="What this is">
            <div className="px-4 pb-4">
              <p className="text-ui-sm text-body leading-relaxed">
                <strong className="font-medium text-fg">
                  PortalSwapRouter
                </strong>
                , Portaldot V3&rsquo;s own DEX — a Uniswap V2 fork taking{" "}
                {Number(FEE_BPS) / 100}% per trade. Its factory holds a pool for
                every pair of these five tokens, so nothing here ever needs more
                than one hop.
              </p>
              <p className="mt-2 text-ui-sm text-body leading-relaxed">
                The quote you see is computed here from the pair&rsquo;s
                reserves, with the router&rsquo;s own arithmetic — a check pins
                it against answers read from the live contract. Before you sign,
                the router prices the trade again, and the floor you are
                protected by comes from that second number, not this one.
              </p>
              <p className="mt-2 text-ui-sm text-body leading-relaxed">
                Native POT is routed through WPOT and needs no approval;
                everything else does, once per token.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip dot tone="info">
                  <ChainLogo family="portaldot" className="size-3.5" />
                  {`chain ${SWAP_CHAIN}`}
                </Chip>
                <Chip>{shortAddress(ROUTER)}</Chip>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ui-xs text-muted">{k}</dt>
      <dd className="font-mono text-ui-sm text-fg tabular-nums">{v}</dd>
    </div>
  );
}

/** The two token marks, for the header chip. Kept here so the panel stays one component. */
export const SwapMarks = ({ a, b }: { a: string; b: string }) => (
  <span className="flex items-center -space-x-1.5">
    <TokenIcon symbol={a} size={18} />
    <TokenIcon symbol={b} size={18} />
  </span>
);
