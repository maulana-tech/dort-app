"use client";

import Link from "next/link";
import { PH, PhIcon } from "@/components/ui";
import { shortAddress } from "@/features/bridge/bridge";
import { chainName } from "@/features/bridge/chains";
import { useWallet } from "@/features/bridge/WalletProvider";
import { connectLabel } from "@/features/bridge/wallet";

/**
 * The wallet, in the header, for the whole app.
 *
 * Three of the six pages need one, so it earns the slot the AI settings used to hold — those
 * moved to /settings, which this links to beside it. One connection serves every page because
 * WalletProvider owns the state: a button here and a button on the page would otherwise be two
 * wallets, agreeing with nothing.
 */
export function HeaderWallet() {
  const wallet = useWallet();
  const label = connectLabel(wallet.wallets, wallet.connecting);

  return (
    <>
      <Link
        href="/settings"
        title="Choose which model answers in Chat"
        className="hdr-pill on-blue sm hidden md:inline-flex"
      >
        <PhIcon d={PH.sparkle} className="size-[15px]" />
        AI
      </Link>
      <button
        type="button"
        onClick={() =>
          wallet.account ? wallet.disconnect() : wallet.connect()
        }
        title={
          wallet.account
            ? `${wallet.connected?.info.name ?? "Wallet"} on ${wallet.chainId ? chainName(wallet.chainId) : "an unknown chain"} — click to disconnect`
            : label
        }
        className={`group hdr-pill on-blue ${wallet.account ? "" : "lit"}`}
      >
        {wallet.account ? (
          <>
            <span className="hdr-dot text-green" aria-hidden="true" />
            <span className="font-mono text-[12px]">
              {shortAddress(wallet.account)}
            </span>
          </>
        ) : (
          <>
            <PhIcon
              d={PH.boxOn}
              className="size-[15px] transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none"
            />
            {label}
          </>
        )}
      </button>
    </>
  );
}
