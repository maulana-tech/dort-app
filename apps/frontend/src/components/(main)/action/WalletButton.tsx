"use client";

import { ChainLogo } from "@/components/ui";
import { shortAddress } from "@/features/bridge/bridge";
import { FAMILY } from "@/features/bridge/chains";

/**
 * The way in, in a panel's header.
 *
 * It never depends on whether anything is deployed — a wallet has to be reachable even on a chain
 * the feature does not live on yet, or the page offers no entry at all. Both the bridge and the
 * vault learned that the hard way (features/*\/*.check.ts pin the rule in their action models).
 */
export function WalletButton({
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
