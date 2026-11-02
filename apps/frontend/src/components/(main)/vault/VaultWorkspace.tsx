"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  AmountField,
  DestinationRow,
  FlowArrow,
  Note,
  PillTabs,
  SourceRow,
} from "@/components/(main)/action/ActionCard";
import { TokenSelect } from "@/components/(main)/action/TokenSelect";
import { WalletButton } from "@/components/(main)/action/WalletButton";
import { ChainLogo, Chip, Panel, TokenIcon } from "@/components/ui";
import {
  formatAmount,
  parseAmount,
  shortAddress,
} from "@/features/bridge/bridge";
import {
  chainName,
  DEFAULT_HOME,
  FAMILY,
  HOME_CHAINS,
  type HomeChainId,
  txUrl,
} from "@/features/bridge/chains";
import { useWallet } from "@/features/bridge/useWallet";
import { useVault } from "@/features/vault/useVault";
import {
  previewDeposit,
  previewRedeem,
  previewWithdraw,
  type Side,
  type Unit,
  vaultAction,
  vaultFor,
  vaultReady,
  vaultsFor,
} from "@/features/vault/vault";

/**
 * Vault: put an asset in, hold shares, take it out again.
 *
 * It drives foundry/src/DortSafeVault.sol — the vault written correctly, as opposed to the
 * deliberately flawed DortVault the trace view teaches on. The things that make it correct are
 * the things this page shows: the shares a deposit will mint before it is signed, what a holding
 * is worth now, and the two different exits (an exact amount of the asset, or an exact number of
 * shares) as an explicit choice rather than a hidden one.
 *
 * The token picker is a real dropdown over the vaults on this chain, not a tile that cycles on
 * click: a picker you have to press repeatedly to discover is a guessing game.
 */
export function VaultWorkspace() {
  const wallet = useWallet();
  const [useLocal, setUseLocal] = useState(false);
  const [home, setHome] = useState<HomeChainId>(DEFAULT_HOME);
  const [side, setSide] = useState<Side>("deposit");
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");

  const all = useMemo(() => vaultsFor(home, useLocal), [home, useLocal]);
  const fallback = vaultFor(home, useLocal);
  const dep = useMemo(
    () => all.find((v) => v.symbol === token) ?? fallback,
    [all, token, fallback],
  );
  const deployed = vaultReady(dep);

  // on the withdraw side the picker chooses the unit, which is a different call on the contract
  const unit: Unit = token === dep.shareSymbol ? "shares" : "assets";
  const v = useVault(wallet, dep, home, useLocal);

  // changing chain or demo changes which assets exist; a stale symbol would silently pick another
  useEffect(() => {
    setToken(all[0]?.symbol ?? "");
    setInput("");
  }, [all]);

  const amount = useMemo(
    () => parseAmount(input, dep.decimals),
    [input, dep.decimals],
  );
  const balance =
    side === "deposit"
      ? v.assetBalance
      : unit === "shares"
        ? v.shareBalance
        : v.redeemable;
  const tooMuch = amount !== null && balance !== null && amount > balance;
  const needsApproval =
    side === "deposit" &&
    amount !== null &&
    v.allowance !== null &&
    v.allowance < amount;

  const act = vaultAction({
    connected: Boolean(wallet.account),
    deployed,
    onRightChain: wallet.chainId === home,
    paused: v.paused,
    side,
    amount,
    balance,
    needsApproval,
    step: v.step,
    chainName: chainName(home),
    unit,
    wrongNetwork: v.wrongNetwork,
  });

  // the picker's options: the assets with a vault on the deposit side, the two exits on the other.
  // With nothing deployed there is still one name to show, or the field would read "—".
  const assets = all.length ? all : [dep];
  const tokens =
    side === "deposit"
      ? assets.map((d) => ({
          id: d.symbol,
          symbol: d.symbol,
          // only the selected vault is read, so only its balance is known
          hint:
            d.symbol === dep.symbol
              ? (fmt(v.assetBalance, d) ?? undefined)
              : undefined,
        }))
      : [
          {
            id: dep.symbol,
            symbol: dep.symbol,
            hint: fmt(v.redeemable, dep) ?? undefined,
          },
          {
            id: dep.shareSymbol,
            symbol: dep.shareSymbol,
            hint:
              v.shareBalance === null
                ? undefined
                : `${formatAmount(v.shareBalance, dep.decimals)} ${dep.shareSymbol}`,
          },
        ];
  const fieldSymbol = side === "deposit" ? dep.symbol : tokenSymbol(token, dep);
  const busy = v.step === "submit" || v.step === "approve";

  const secondary = (() => {
    if (amount === null || v.totalSupply === null || v.totalAssets === null)
      return undefined;
    const { totalSupply: ts, totalAssets: ta } = v;
    if (side === "deposit")
      return `≈ ${formatAmount(previewDeposit(amount, ts, ta), dep.decimals)} ${dep.shareSymbol}`;
    if (unit === "shares")
      return `≈ ${formatAmount(previewRedeem(amount, ts, ta), dep.decimals)} ${dep.symbol}`;
    return `costs ${formatAmount(previewWithdraw(amount, ts, ta), dep.decimals)} ${dep.shareSymbol}`;
  })();

  // an empty vault has no price: the virtual offset alone would quote one, which means nothing
  const sharePrice =
    v.totalSupply === null || v.totalAssets === null || v.totalSupply === 0n
      ? "—"
      : `${formatAmount(
          previewRedeem(
            10n ** BigInt(dep.decimals),
            v.totalSupply,
            v.totalAssets,
          ),
          dep.decimals,
        )} ${dep.symbol}`;

  async function onPress() {
    if (!wallet.account) return wallet.connect();
    if (wallet.chainId !== home) return wallet.switchTo(home);
    if (side === "deposit" && needsApproval) return v.approve();
    if (amount !== null) return v.submit(side, amount, unit);
  }

  return (
    <div className="dot-grid min-h-[calc(100dvh-64px)] w-full overflow-y-auto p-4 md:p-6">
      {/* grid-cols-[minmax(0,1fr)]: a grid column is min-content wide by default, so on a phone
          the card grew past the screen instead of letting its own rows wrap */}
      <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── the action ───────────────────────────────────────────────── */}
        <Panel label="Vault" aside={<WalletButton wallet={wallet} />}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 pb-4">
            <div className="grid gap-2">
              <span className="text-ui-xs text-dim">Chain</span>
              <PillTabs
                label="Chain"
                value={String(home)}
                disabled={busy}
                onChange={(x) => {
                  setHome(Number(x) as HomeChainId);
                  setInput("");
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
              label="Side"
              value={side}
              disabled={busy}
              onChange={(nextSide) => {
                setSide(nextSide);
                setInput("");
                // the sides name their units differently, so both start on the asset
                setToken(dep.symbol);
              }}
              options={[
                { value: "deposit", label: "Deposit" },
                { value: "withdraw", label: "Withdraw" },
              ]}
            />

            <SourceRow
              icon={<TokenIcon symbol={fieldSymbol} size={36} />}
              title={side === "deposit" ? "In your wallet" : "Your position"}
              ticker={fieldSymbol}
              amount={
                balance === null
                  ? "—"
                  : `${formatAmount(balance, dep.decimals)} ${fieldSymbol}`
              }
              secondary={
                side === "deposit"
                  ? `vault ${dep.vault ? shortAddress(dep.vault) : "not deployed"}`
                  : `${fmt(v.shareBalance, dep) ?? "—"} ${dep.shareSymbol} held`
              }
            />

            <AmountField
              id="vault-amount"
              label={side === "deposit" ? "Deposit" : "Withdraw"}
              value={input}
              onChange={setInput}
              disabled={!deployed || busy}
              tooMuch={tooMuch}
              token={
                <TokenSelect
                  value={token || fieldSymbol}
                  tokens={tokens}
                  onChange={setToken}
                  ariaLabel={side === "deposit" ? "Asset" : "Take out as"}
                  disabled={busy}
                />
              }
              secondary={secondary}
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
                label={
                  side === "deposit"
                    ? `Shares to you (${dep.shareSymbol})`
                    : `${dep.symbol} to you`
                }
                value={
                  <span className="flex items-center gap-2">
                    <ChainLogo
                      family={FAMILY[home] ?? "local"}
                      className="size-4"
                    />
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
              {wallet.error && <Note tone="bad">{wallet.error}</Note>}
              {!wallet.error && v.error && (
                <Note tone="bad">
                  {useLocal
                    ? `Cannot reach the local chain. Run script/vault-local-demo.sh first (${v.error}).`
                    : v.error}
                </Note>
              )}
              {side === "withdraw" && unit === "assets" && (
                <Note>
                  An exact amount of {dep.symbol}: the shares it costs are
                  rounded up, against you. To empty the position entirely,
                  choose {dep.shareSymbol} and press max.
                </Note>
              )}
              {v.step === "done" && <Note tone="ok">Done.</Note>}
              {v.txHash && (
                <p className="text-ui-xs text-dim">
                  {txUrl(home, v.txHash) ? (
                    <a
                      href={txUrl(home, v.txHash) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline-offset-2 hover:text-fg hover:underline"
                    >
                      {shortAddress(v.txHash)}
                    </a>
                  ) : (
                    <span className="font-mono">{shortAddress(v.txHash)}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </Panel>

        {/* ── what the numbers are ─────────────────────────────────────── */}
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4">
          <Panel
            label="The vault"
            aside={
              <Chip dot tone={v.paused ? "warn" : "ok"}>
                {v.paused ? "Paused" : "Open"}
              </Chip>
            }
          >
            <dl className="grid gap-1 px-4 pb-4">
              <Row k="Total assets" val={fmt(v.totalAssets, dep) ?? "—"} />
              <Row
                k="Shares issued"
                val={
                  v.totalSupply === null
                    ? "—"
                    : `${formatAmount(v.totalSupply, dep.decimals)} ${dep.shareSymbol}`
                }
              />
              <Row k={`Price of 1 ${dep.shareSymbol}`} val={sharePrice} />
              <Row
                k="Your shares"
                val={
                  v.shareBalance === null
                    ? "—"
                    : `${formatAmount(v.shareBalance, dep.decimals)} ${dep.shareSymbol}`
                }
              />
              <Row k="Worth now" val={fmt(v.redeemable, dep) ?? "—"} />
            </dl>
          </Panel>

          <Panel label="Why this one is safe">
            <div className="px-4 pb-4">
              <p className="text-ui-sm text-body leading-relaxed">
                <strong className="font-medium text-fg">
                  Effects before the transfer.
                </strong>{" "}
                Shares are burnt before any asset moves, and a reentrancy guard
                refuses a second entry outright — so a token that calls back
                mid-withdraw finds no stale state to drain.
              </p>
              <p className="mt-2 text-ui-sm text-body leading-relaxed">
                <strong className="font-medium text-fg">
                  Rounding goes the vault&rsquo;s way.
                </strong>{" "}
                A deposit mints down, a withdraw burns up. A fuzz test proves no
                round trip can profit.
              </p>
              <p className="mt-2 text-ui-sm text-body leading-relaxed">
                <strong className="font-medium text-fg">
                  No first-depositor trick.
                </strong>{" "}
                A virtual offset prices the empty vault, so donating to it
                cannot round the next depositor down to nothing.
              </p>
              <p className="mt-2 text-ui-sm text-body leading-relaxed">
                <strong className="font-medium text-fg">
                  What arrived, not what was asked.
                </strong>{" "}
                Shares are priced on the balance delta, so a fee-on-transfer
                asset shortchanges nobody else.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip dot tone="info">{`chain ${home}`}</Chip>
                {dep.vault && <Chip>{shortAddress(dep.vault)}</Chip>}
                <button
                  type="button"
                  onClick={() => setUseLocal((x) => !x)}
                  className="text-ui-xs text-dim underline-offset-2 hover:text-fg hover:underline"
                >
                  {useLocal ? "Use testnet addresses" : "Use the local demo"}
                </button>
              </div>
              {!deployed && (
                <p className="mt-2 text-ui-xs text-dim">
                  No vault on {chainName(home)} yet. Deploy one with{" "}
                  <code className="font-mono">script/DeployVault.s.sol</code>,
                  or run{" "}
                  <code className="font-mono">script/vault-local-demo.sh</code>{" "}
                  and switch to the local demo above.
                </p>
              )}
              <p className="mt-3 text-ui-xs text-dim">
                The flawed twin is{" "}
                <code className="font-mono">src/DortVault.sol</code> — open it
                in Trace to watch the difference.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** "USDC" for the asset, "dUSDC" for the share: whichever the picker currently holds. */
const tokenSymbol = (
  picked: string,
  dep: { symbol: string; shareSymbol: string },
) => (picked === dep.shareSymbol ? dep.shareSymbol : dep.symbol);

const fmt = (v: bigint | null, dep: { symbol: string; decimals: number }) =>
  v === null ? null : `${formatAmount(v, dep.decimals)} ${dep.symbol}`;

function Row({ k, val }: { k: string; val: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ui-xs text-muted">{k}</dt>
      <dd className="font-mono text-ui-sm text-fg tabular-nums">{val}</dd>
    </div>
  );
}
