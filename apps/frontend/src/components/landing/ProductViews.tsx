"use client";

import type { ReactNode } from "react";
import {
  ActionButton,
  AmountField,
  DestinationRow,
  FlowArrow,
  Note,
  PillTabs,
  SourceRow,
} from "@/components/(main)/action/ActionCard";
import { ChainLogo, Chip, Panel, TokenIcon } from "@/components/ui";
import { formatAmount } from "@/features/bridge/bridge";
import { previewDeposit } from "@/features/vault/vault";
import { ChatThread } from "./ChatThread";
import type { ViewId } from "./ProductTabs";
import type { ChatDemo } from "./stats";

/**
 * The product tour's four views — the four things you can actually do in this build.
 *
 * Every one is the app's own component on real values, never a screenshot and never a mock-up of
 * a component that does not exist. The three on-chain cards are assembled from the very pieces
 * their pages use (ActionCard), so a change to the real card changes the tour with it; the Chat
 * view is the same thread the hero shows.
 *
 * They are deliberately not the live workspaces. Mounting those here would have every visitor's
 * browser read Base Sepolia and Portaldot over RPC just to draw a landing page — the figures
 * below are fixed, honest ones instead: the shares come from the vault's own arithmetic, and the
 * swap quote is the amount PortalSwapRouter really returned for 1 POT when it was recorded
 * (pinned in swap.check.ts).
 */

const none = () => {};

/** A card as the on-chain pages frame it: the panel, its label, the chain pill, the one action. */
function ActionShell({
  label,
  chain,
  family,
  children,
}: {
  label: string;
  chain: string;
  family: string;
  children: ReactNode;
}) {
  return (
    <div className="w-[560px]">
      <Panel
        label={label}
        aside={
          <Chip dot tone="ok">
            Open
          </Chip>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 pb-4">
          <div className="grid gap-2">
            <span className="text-ui-xs text-dim">Chain</span>
            <PillTabs
              label="Chain"
              value={chain}
              onChange={none}
              options={[
                {
                  value: chain,
                  label: (
                    <>
                      <ChainLogo family={family} className="size-4" />
                      {chain}
                    </>
                  ),
                },
              ]}
            />
          </div>
          {children}
        </div>
      </Panel>
    </div>
  );
}

export function Views({
  chat,
  at,
  seen,
  ids,
}: {
  /** the view ids in tab order (ProductTabs VIEWS) */
  ids: ViewId[];
  chat: ChatDemo;
  at: number;
  seen: ReadonlySet<number>;
}) {
  // the vault's own arithmetic, not a number typed into a landing page: a first deposit into an
  // empty vault is priced by the virtual offset alone
  const deposit = 1_000_000_000n; // 1,000 USDC, six decimals
  const shares = previewDeposit(deposit, 0n, 0n);

  const content: Record<ViewId, ReactNode> = {
    chat: (
      <div className="dot-grid-soft absolute inset-0 p-10">
        <div className="w-[820px]">
          <ChatThread demo={chat} compact />
        </div>
      </div>
    ),
    vault: (
      <div className="dot-grid-soft absolute inset-0 p-10">
        <ActionShell label="Vault" chain="Base Sepolia" family="base">
          <SourceRow
            icon={<TokenIcon symbol="USDC" size={36} />}
            title="In your wallet"
            ticker="USDC"
            amount="5,000 USDC"
            secondary="vault 0x162D…5aF8"
          />
          <AmountField
            id="lp-vault"
            label="Deposit"
            value={formatAmount(deposit, 6)}
            onChange={none}
            token={<span className="text-ui-sm text-fg">USDC</span>}
            secondary={`≈ ${formatAmount(shares, 6)} dUSDC`}
            available="Available 5,000"
          />
          <div>
            <FlowArrow />
            <DestinationRow label="Shares to you (dUSDC)" value="your wallet" />
          </div>
          <ActionButton onClick={none}>Deposit</ActionButton>
          <Note>
            The shares a deposit will mint, priced with the contract&rsquo;s own
            arithmetic — shown before you sign, not after.
          </Note>
        </ActionShell>
      </div>
    ),
    swap: (
      <div className="dot-grid-soft absolute inset-0 p-10">
        <ActionShell label="Swap" chain="Portaldot V3" family="portaldot">
          <SourceRow
            icon={<TokenIcon symbol="POT" size={36} />}
            title="You pay"
            ticker="POT"
            amount="1 POT"
            secondary="PortalSwapRouter · 0.30%"
          />
          <AmountField
            id="lp-swap"
            label="You receive"
            value="4.330837"
            onChange={none}
            token={<span className="text-ui-sm text-fg">pUSDT</span>}
            secondary="1 POT = 4.330837 pUSDT"
          />
          <div>
            <FlowArrow />
            <DestinationRow label="pUSDT to you" value="your wallet" />
          </div>
          <ActionButton onClick={none}>Swap</ActionButton>
          <Note>
            The quote is computed from the pool&rsquo;s own reserves and pinned
            against what the router really answers — these pools are small, so
            the price impact matters more than the rate.
          </Note>
        </ActionShell>
      </div>
    ),
    bridge: (
      <div className="dot-grid-soft absolute inset-0 p-10">
        <ActionShell label="Bridge" chain="Base Sepolia" family="base">
          <SourceRow
            icon={<TokenIcon symbol="USDC" size={36} />}
            title="Lock at home"
            ticker="USDC"
            amount="250 USDC"
            secondary="escrow holds it until the message is proven"
          />
          <AmountField
            id="lp-bridge"
            label="Send"
            value="250"
            onChange={none}
            token={<span className="text-ui-sm text-fg">USDC</span>}
            secondary="≈ 250 wUSDC on Portaldot"
          />
          <div>
            <FlowArrow />
            <DestinationRow
              label="wUSDC on Portaldot V3"
              value={
                <span className="flex items-center gap-2">
                  <ChainLogo family="portaldot" className="size-4" />
                  <span className="font-mono text-ui-xs">your wallet</span>
                </span>
              }
            />
          </div>
          <ActionButton onClick={none}>Lock and bridge</ActionButton>
          <Note>
            Both sides&rsquo; numbers sit side by side on the page: what the
            escrow holds and what Portaldot has issued. A bridge is only honest
            while those match.
          </Note>
        </ActionShell>
      </div>
    ),
  };

  return (
    <>
      {ids.map((id, i) => (
        <div
          key={id}
          inert
          aria-hidden={i !== at}
          className={`absolute inset-0 transition-opacity ease-out motion-reduce:transition-none ${
            i === at
              ? "opacity-100 delay-200 duration-300"
              : "opacity-0 duration-200"
          }`}
        >
          {seen.has(i) && content[id]}
        </div>
      ))}
    </>
  );
}
