"use client";

import {
  ActionButton,
  AmountField,
  SourceRow,
} from "@/components/(main)/action/ActionCard";
import { KindBadge, Meter, TokenIcon } from "@/components/ui";
import { formatAmount } from "@/features/bridge/bridge";
import { displayKind, type Frame, human, splitArgs } from "@/features/trace";
import { previewDeposit, VAULTS } from "@/features/vault/vault";
import { ChatThread } from "./ChatThread";
import type { ChatDemo } from "./stats";
import { Window } from "./Window";

/*
 * Feature-row widgets. R21 (pin 489273947042736110): ONE focused product widget per feature, an
 * isolated card rather than a whole-app screenshot. R11 (pin 15270086238695547): each one is a
 * small, clean mini-UI with nothing cut off at its edges. R16: window chrome where it is a window.
 * All of them render the app's own components / utils on the same sample data the app falls back to.
 *
 * The Lab, Findings and Coverage widgets left with the pages behind them: a landing row is a
 * promise, and this build cannot keep those. Chat and Vault took their slots.
 */

/** Trace: the first decoded frames of one test, in the app's row anatomy (TraceRow) without the clipped arg chips. */
export function TraceWidget({
  test,
  frames,
}: {
  test: string;
  frames: Frame[];
}) {
  const top = Math.min(...frames.map((f) => f.d));
  const maxGas = Math.max(1, ...frames.map((f) => f.gas ?? 0));
  return (
    <Window
      tab={test}
      aside="forge test -vvvv"
      className="w-full max-w-[560px]"
    >
      <ol className="@container p-2">
        {frames.map((f, i) => {
          const kind = displayKind(f);
          const [arg] = splitArgs(f.args);
          return (
            <li
              key={`${i}${f.fn}`}
              className="flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-tile py-1 pr-3 pl-1.5"
            >
              <span className="w-[18px] flex-none text-right font-mono text-[11px] text-dim">
                {i + 1}
              </span>
              <span
                className="tree-guides flex-none self-stretch"
                style={{ width: (f.d - top) * 18 }}
              />
              <KindBadge kind={kind} size="sm" />
              <span className="font-mono text-[13px]">
                <span className="text-body">{f.to}</span>
                <span className="mx-px text-dim">.</span>
                <span className="font-medium text-fg">{f.fn}</span>
              </span>
              {f.ret ? (
                <span
                  className={`hidden rounded-chip bg-raised px-2 py-0.5 font-mono text-[11px] sm:inline ${f.ok ? "text-body" : "text-red"}`}
                >
                  {f.ok ? `→ ${human(f.ret)}` : `✕ ${f.ret}`}
                </span>
              ) : (
                arg && (
                  <span className="hidden rounded-chip bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg sm:inline">
                    <em className="mr-1.5 text-dim not-italic">{arg[0]}</em>
                    {arg[1]}
                  </span>
                )
              )}
              <span className="ml-auto flex flex-none items-center gap-2 pl-3">
                {f.callSite && (
                  <span className="font-mono text-[11px] text-dim">
                    L{f.callSite.line}
                  </span>
                )}
                {f.gas != null && kind !== "EVENT" && (
                  <Meter
                    value={f.gas / maxGas}
                    className="hidden w-12 @[520px]:block"
                  />
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </Window>
  );
}

/** Thousands separators, so a figure beside another figure reads the same way. */
const group = (n: string) => {
  const [whole, frac] = n.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
};

/** Chat: the same thread the hero and the product tour show (ChatThread), in a window. */
export function ChatWidget({ demo }: { demo: ChatDemo }) {
  return (
    <Window tab="/chat" aside="Sample" className="w-full max-w-[460px]">
      <div className="dot-grid-soft p-3">
        <ChatThread demo={demo} compact />
      </div>
    </Window>
  );
}

/**
 * Vault: the deposit card as `/vault` draws it, on the vault's own arithmetic. The address is
 * read from VAULTS rather than written here, so the widget cannot outlive the deployment.
 */
export function VaultWidget() {
  const deposit = 1_000_000_000n; // 1,000 USDC, six decimals
  const shares = previewDeposit(deposit, 0n, 0n);
  const live = VAULTS[84532]?.find((v) => v.vault)?.vault ?? null;
  return (
    <Window tab="/vault" aside="Base Sepolia" className="w-full max-w-[460px]">
      <div className="dot-grid-soft grid gap-4 p-4">
        <SourceRow
          icon={<TokenIcon symbol="USDC" size={34} />}
          title="In your wallet"
          ticker="USDC"
          amount="5,000 USDC"
          secondary={
            live
              ? `vault ${live.slice(0, 6)}…${live.slice(-4)}`
              : "not deployed"
          }
        />
        <AmountField
          id="lp-how-vault"
          label="Deposit"
          value={group(formatAmount(deposit, 6))}
          onChange={() => {}}
          token={<span className="text-ui-sm text-fg">USDC</span>}
          secondary={`≈ ${group(formatAmount(shares, 6))} dUSDC`}
        />
        <ActionButton onClick={() => {}}>Deposit</ActionButton>
      </div>
    </Window>
  );
}
