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

/**
 * What the view is, beside the view.
 *
 * The close-up is cropped from a 1440-wide world and the cards are 560 of it, so two thirds of
 * the frame was empty blue. A person who has never used Dort cannot tell what a deposit card
 * proves by looking at it; the column says, in the smallest number of true sentences.
 *
 * Every claim here is one the repository can be held to — the vault's address, the router's fee,
 * what is not deployed — because a landing page is the easiest place in a project to start
 * lying, and the only one where nobody runs the tests.
 */
function ViewCopy({
  title,
  lede,
  facts,
}: {
  title: string;
  lede: string;
  facts: string[];
}) {
  return (
    <div className="w-[440px] flex-none pt-6">
      <h3 className="font-medium text-[30px] text-fg leading-[1.1] tracking-[-0.02em]">
        {title}
      </h3>
      <p className="mt-3 text-[15px] text-body leading-relaxed">{lede}</p>
      <ul className="mt-6 grid gap-3">
        {facts.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span className="mt-[9px] size-1.5 flex-none rounded-full bg-primary" />
            <span className="text-[13.5px] text-dim leading-relaxed">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** card on the left, what it means on the right — the shape every view shares */
const Split = ({ children }: { children: ReactNode }) => (
  <div className="dot-grid-soft absolute inset-0 flex items-start gap-14 p-10">
    {children}
  </div>
);

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
      <Split>
        <div className="w-[620px] flex-none">
          <ChatThread demo={chat} compact />
        </div>
        <ViewCopy
          title="Ask in plain language"
          lede="One box, whatever you arrive with: a question, a transaction hash, a contract address, or your own .sol files."
          facts={[
            "Grounded in the Foundry run you have loaded — its tests, its failures, and the contracts the calls went through.",
            "Hand in a transaction and Dort reads the chain first: the real call tree from the node, not a guess from a function name.",
            "What comes back is candidates to check and what it could not look at. Never a verdict, never a score.",
            "Answered by your own model, or by this Dort's if you have chosen none — and the page says which of the two replied.",
          ]}
        />
      </Split>
    ),
    vault: (
      <Split>
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
        <ViewCopy
          title="Deposit, and see the shares first"
          lede="DortSafeVault on Base Sepolia. The figure you are about to receive is computed by the contract itself and shown before the wallet is asked to sign."
          facts={[
            "Deployed at 0x162Dcf95…24f85aF8, and the page reads it over RPC rather than trusting a number typed into the app.",
            "Rounding always goes toward the vault, and a virtual offset closes the first-depositor attack.",
            "Checks-effects-interactions and a reentrancy guard — written the way the flawed twin it teaches on is not.",
          ]}
        />
      </Split>
    ),
    swap: (
      <Split>
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
        <ViewCopy
          title="Trade on Portaldot's own DEX"
          lede="PortalSwapRouter is Portaldot V3's Uniswap V2 fork at 30 basis points. Its addresses, its fee and its pools were all read off the live chain."
          facts={[
            "Ten pools over five tokens, so every pair has one, and a path is always a single hop.",
            "The quote is computed from the pool's own reserves and pinned, in a check, against what the router really answered.",
            "These pools are small: the page shows price impact, because on a testnet that matters more than the rate.",
          ]}
        />
      </Split>
    ),
    bridge: (
      <Split>
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
        <ViewCopy
          title="Lock at home, mint on Portaldot"
          lede="An escrow on the home chain and a minter on Portaldot, with both sides' totals on the page at once. A bridge is only honest while those two numbers match."
          facts={[
            "The message id is recomputed in the browser, byte-identical to the one PortalBridgeEscrow computes, so the page can follow a transfer to the other chain.",
            "Nothing is deployed on the public testnets yet, and the page says so rather than showing a dead button.",
            "script/bridge-local-demo.sh runs the whole thing — both chains, both contracts, a real transfer — on two local anvils.",
          ]}
        />
      </Split>
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
