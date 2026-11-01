"use client";

import { useMemo, useState } from "react";
import {
  ActionButton,
  AmountField,
  DestinationRow,
  FlowArrow,
  Note,
  PillTabs,
  SourceRow,
  TokenPill,
} from "@/components/(main)/action/ActionCard";
import { ChainLogo, Chip, Panel, TokenIcon } from "@/components/ui";
import {
  action,
  type Direction,
  deploymentFor,
  formatAmount,
  parseAmount,
  ready,
  route,
  shortAddress,
} from "@/features/bridge/bridge";
import {
  chainName,
  DEFAULT_HOME,
  FAMILY,
  HOME_CHAINS,
  type HomeChainId,
  PORTALDOT_ID,
  txUrl,
} from "@/features/bridge/chains";
import { useBridge } from "@/features/bridge/useBridge";
import { useWallet } from "@/features/bridge/useWallet";

/**
 * Bridge: lock an asset on its home chain, use the wrapped copy on Portaldot V3, send it back.
 *
 * The card follows the shared action anatomy (components/(main)/action/ActionCard): choose the
 * direction, type an amount, see where it lands, press one button. Beside it sits the thing no
 * other bridge UI shows you — the invariant, both chains' numbers side by side, because a bridge
 * is only honest while what Portaldot issued equals what the home chain holds.
 */
export function BridgeWorkspace() {
  const wallet = useWallet();
  const [useLocal, setUseLocal] = useState(false);
  const [home, setHome] = useState<HomeChainId>(DEFAULT_HOME);
  const dep = deploymentFor(home, useLocal);
  const deployed = ready(dep);

  const [direction, setDirection] = useState<Direction>("toPortaldot");
  const { from, to } = route(direction, home);
  const b = useBridge(wallet, dep, direction, home, useLocal);

  const [input, setInput] = useState("");
  const amount = useMemo(
    () => parseAmount(input, dep.decimals),
    [input, dep.decimals],
  );

  const balance =
    direction === "toPortaldot" ? b.homeBalance : b.wrappedBalance;
  const tooMuch = amount !== null && balance !== null && amount > balance;
  const needsApproval =
    direction === "toPortaldot" &&
    amount !== null &&
    b.allowance !== null &&
    b.allowance < amount;

  const act = action({
    connected: Boolean(wallet.account),
    deployed,
    onRightChain: wallet.chainId === from,
    paused: b.paused,
    amount,
    balance,
    allowance: b.allowance,
    needsApproval,
    step: b.step,
    chainName: chainName(from),
  });

  const balanced =
    b.locked !== null &&
    b.wrappedSupply !== null &&
    b.locked === b.wrappedSupply;
  const symbol = direction === "toPortaldot" ? dep.symbol : `w${dep.symbol}`;
  const fam = (id: number) => FAMILY[id] ?? "local";

  async function onPress() {
    if (!wallet.account) return wallet.connect();
    if (wallet.chainId !== from) return wallet.switchTo(from);
    if (needsApproval) return b.approve();
    if (amount !== null) return b.submit(amount);
  }

  return (
    <div className="dot-grid min-h-[calc(100dvh-64px)] w-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-5xl items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── the action ───────────────────────────────────────────────── */}
        <Panel
          label="Bridge"
          aside={
            <WalletButton
              account={wallet.account}
              chainId={wallet.chainId}
              connecting={wallet.connecting}
              available={wallet.available}
              onConnect={() => void wallet.connect()}
            />
          }
        >
          <div className="grid gap-5 px-4 pb-4">
            <div className="grid gap-2">
              <span className="text-ui-xs text-dim">Home chain</span>
              <PillTabs
                label="Home chain"
                value={String(home)}
                disabled={b.step === "submit" || b.step === "relaying"}
                onChange={(v) => {
                  setHome(Number(v) as HomeChainId);
                  setInput("");
                  setDirection("toPortaldot");
                }}
                options={HOME_CHAINS.map((c) => ({
                  value: String(c.id),
                  label: (
                    <>
                      <ChainLogo family={c.family} className="size-4" />
                      {c.name
                        .replace(" Testnet", "")
                        .replace(" (Moderato)", "")}
                    </>
                  ),
                }))}
              />
            </div>

            <PillTabs
              label="Direction"
              value={direction}
              disabled={b.step === "submit" || b.step === "relaying"}
              onChange={(d) => {
                setDirection(d);
                setInput("");
              }}
              options={[
                {
                  value: "toPortaldot",
                  label: (
                    <>
                      <ChainLogo family={fam(home)} className="size-4" />
                      To Portaldot
                    </>
                  ),
                },
                {
                  value: "toHome",
                  label: (
                    <>
                      <ChainLogo family="portaldot" className="size-4" />
                      Back home
                    </>
                  ),
                },
              ]}
            />

            <SourceRow
              icon={<TokenIcon symbol={symbol} size={36} />}
              title={`From ${chainName(from)}`}
              ticker={symbol}
              amount={
                balance === null
                  ? "—"
                  : `${formatAmount(balance, dep.decimals)} ${symbol}`
              }
              secondary={`chain ${from}`}
            />

            <AmountField
              id="bridge-amount"
              label="Amount"
              value={input}
              onChange={setInput}
              disabled={
                !deployed || b.step === "submit" || b.step === "relaying"
              }
              tooMuch={tooMuch}
              token={
                <TokenPill
                  symbol={symbol}
                  icon={<TokenIcon symbol={symbol} size={22} />}
                />
              }
              secondary={
                amount === null
                  ? undefined
                  : `${formatAmount(amount, dep.decimals)} ${
                      direction === "toPortaldot"
                        ? `w${dep.symbol}`
                        : dep.symbol
                    } on ${chainName(to)}`
              }
              available={
                balance === null
                  ? undefined
                  : `Available ${formatAmount(balance, dep.decimals)}`
              }
              onMax={
                balance && balance > 0n
                  ? () => setInput(formatAmount(balance, dep.decimals))
                  : undefined
              }
            />

            <div>
              <FlowArrow />
              <DestinationRow
                label={`To ${chainName(to)}`}
                value={
                  <span className="flex items-center gap-2">
                    <ChainLogo family={fam(to)} className="size-4" />
                    <span className="font-mono text-ui-xs">
                      {wallet.account
                        ? shortAddress(wallet.account)
                        : "your wallet"}
                    </span>
                  </span>
                }
              />
            </div>

            <ActionButton disabled={act.disabled || tooMuch} onClick={onPress}>
              {tooMuch ? "Not enough balance" : act.label}
            </ActionButton>

            <div className="grid gap-2">
              {act.why && <p className="text-ui-xs text-dim">{act.why}</p>}
              {(wallet.error || b.error) && (
                <Note tone="bad">{wallet.error ?? b.error}</Note>
              )}
              {b.step === "relaying" && (
                <Note tone="warn">
                  Sent. The relayer has to deliver it on {chainName(to)} — this
                  page is watching the supply there.
                </Note>
              )}
              {b.arrived && (
                <Note tone="ok">Delivered on {chainName(to)}.</Note>
              )}
              {b.txHash && (
                <p className="text-ui-xs text-dim">
                  {txUrl(from, b.txHash) ? (
                    <a
                      href={txUrl(from, b.txHash) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline-offset-2 hover:text-fg hover:underline"
                    >
                      {shortAddress(b.txHash)}
                    </a>
                  ) : (
                    <span className="font-mono">{shortAddress(b.txHash)}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </Panel>

        {/* ── both chains, side by side ────────────────────────────────── */}
        <div className="grid content-start gap-4">
          <Panel
            label="The invariant"
            aside={
              <Chip dot tone={balanced ? "ok" : "warn"}>
                {balanced ? "In balance" : "Settling"}
              </Chip>
            }
          >
            <div className="grid gap-2 px-4 pb-1">
              <Side
                chain={FAMILY[home] ?? "base"}
                name={chainName(home)}
                rows={[
                  ["Locked in escrow", fmt(b.locked, dep)],
                  ["Your balance", fmt(b.homeBalance, dep)],
                ]}
              />
              <Side
                chain="portaldot"
                name={chainName(PORTALDOT_ID)}
                rows={[
                  ["Wrapped supply", fmt(b.wrappedSupply, dep)],
                  ["Your balance", fmt(b.wrappedBalance, dep)],
                ]}
              />
            </div>
            <p className="px-4 pt-3 pb-4 text-ui-xs text-dim">
              {balanced
                ? "Portaldot has issued exactly what the home chain holds."
                : "A transfer is in flight, or the relayer has not delivered it yet."}
            </p>
          </Panel>

          <Panel label="How this bridge is trusted">
            <div className="px-4 pb-4">
              <p className="text-ui-sm text-body leading-relaxed">
                Messages cross by a{" "}
                <strong className="font-medium text-fg">trusted relayer</strong>
                : an address the owner appoints, which reads one chain and calls
                the other. There is no light client, so a stolen relayer key
                could move everything bridgeable. Testnet scope only.
              </p>
              <p className="mt-2 text-ui-sm text-body leading-relaxed">
                What holds without trusting it: a message pays out at most once,
                a release can never exceed what is locked, transfers obey a
                per-message cap, and the owner can pause instantly.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip dot tone="info">{`chain ${PORTALDOT_ID}`}</Chip>
                {wallet.account && <Chip>{shortAddress(wallet.account)}</Chip>}
                <button
                  type="button"
                  onClick={() => setUseLocal((v) => !v)}
                  className="text-ui-xs text-dim underline-offset-2 hover:text-fg hover:underline"
                >
                  {useLocal ? "Use testnet addresses" : "Use the local demo"}
                </button>
              </div>
              {!deployed && (
                <p className="mt-2 text-ui-xs text-dim">
                  Nothing is deployed on the testnets yet. Run{" "}
                  <code className="font-mono">script/DeployBridge.s.sol</code>{" "}
                  on both chains, or start{" "}
                  <code className="font-mono">script/bridge-local-demo.sh</code>{" "}
                  and switch to the local demo above.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * The way in. It never depends on whether anything is deployed — a wallet has to be reachable
 * even on a chain the bridge does not live on yet, or the page offers no entry at all.
 */
function WalletButton({
  account,
  chainId,
  connecting,
  available,
  onConnect,
}: {
  account: string | null;
  chainId: number | null;
  connecting: boolean;
  available: boolean;
  onConnect: () => void;
}) {
  if (account)
    return (
      <span className="inline-flex items-center gap-2">
        {chainId != null && (
          <ChainLogo family={FAMILY[chainId] ?? "local"} className="size-4" />
        )}
        <span className="font-mono text-ui-xs text-text">
          {shortAddress(account)}
        </span>
      </span>
    );
  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={connecting}
      className="inline-flex h-7 items-center rounded-chip bg-raised px-3 text-ui-xs text-text outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
    >
      {connecting
        ? "Connecting…"
        : available
          ? "Connect wallet"
          : "No wallet found"}
    </button>
  );
}

const fmt = (v: bigint | null, dep: ReturnType<typeof deploymentFor>) =>
  v === null ? "—" : `${formatAmount(v, dep.decimals)} ${dep.symbol}`;

function Side({
  chain,
  name,
  rows,
}: {
  chain: string;
  name: string;
  rows: [string, string][];
}) {
  return (
    <div className="rounded-inner border border-border bg-inner-grad p-3">
      <div className="flex items-center gap-2">
        <ChainLogo family={chain} />
        <span className="text-ui-md text-text">{name}</span>
      </div>
      <dl className="mt-2 grid gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-ui-xs text-muted">{k}</dt>
            <dd className="font-mono text-ui-sm text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
