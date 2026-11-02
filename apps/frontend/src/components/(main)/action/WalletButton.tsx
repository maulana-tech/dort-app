"use client";

import { ChainLogo, Dropdown, type DropdownOption } from "@/components/ui";
import { shortAddress } from "@/features/bridge/bridge";
import { FAMILY } from "@/features/bridge/chains";
import type { Wallet } from "@/features/bridge/useWallet";
import { connectLabel, INSTALL } from "@/features/bridge/wallet";

/**
 * The way in, in a panel's header.
 *
 * It never depends on whether anything is deployed — a wallet has to be reachable even on a chain
 * the feature does not live on yet, or the page offers no entry at all. Both the bridge and the
 * vault learned that the hard way (their action models pin the rule in a check).
 *
 * With more than one wallet installed it opens a picker rather than guessing: the wallets come
 * from EIP-6963, so each is named and the user chooses which one to connect. With exactly one it
 * says so by name and connects in a single press. With none it offers somewhere to get one,
 * instead of a dead button.
 */
export function WalletButton({ wallet }: { wallet: Wallet }) {
  const { account, chainId, wallets, connecting } = wallet;

  if (account) {
    const options: DropdownOption<string>[] = [
      { value: "disconnect", label: "Disconnect", text: "Disconnect" },
    ];
    return (
      <Dropdown
        value=""
        options={options}
        onChange={() => wallet.disconnect()}
        ariaLabel={`Connected as ${account}`}
        variant="pill"
        placeholder={
          <span className="inline-flex items-center gap-2">
            {chainId != null && (
              <ChainLogo
                family={FAMILY[chainId] ?? "local"}
                className="size-4"
              />
            )}
            <span className="font-mono text-ui-xs text-text">
              {shortAddress(account)}
            </span>
          </span>
        }
      />
    );
  }

  // nothing installed: the button's job is to point somewhere useful, not to fail
  if (wallets.length === 0) {
    return (
      <Dropdown
        value=""
        options={INSTALL.map((i) => ({
          value: i.url,
          label: `Get ${i.name}`,
          text: i.name,
        }))}
        onChange={(url) => window.open(url, "_blank", "noopener,noreferrer")}
        ariaLabel="No wallet found — install one"
        variant="pill"
        placeholder="No wallet found"
      />
    );
  }

  // exactly one: no menu to open, just connect it
  if (wallets.length === 1) {
    return (
      <button
        type="button"
        onClick={() => void wallet.connect(wallets[0].info.rdns)}
        disabled={connecting}
        className="inline-flex h-7 items-center gap-2 rounded-chip bg-raised px-3 text-ui-xs text-text outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
      >
        <Mark src={wallets[0].info.icon} name={wallets[0].info.name} />
        {connectLabel(wallets, connecting)}
      </button>
    );
  }

  return (
    <Dropdown
      value=""
      options={wallets.map((w) => ({
        value: w.info.rdns,
        label: w.info.name,
        text: w.info.name,
        icon: <Mark src={w.info.icon} name={w.info.name} />,
      }))}
      onChange={(rdns) => void wallet.connect(rdns)}
      ariaLabel="Choose a wallet"
      variant="pill"
      placeholder={connectLabel(wallets, connecting)}
    />
  );
}

/** The wallet's own mark. It arrives as a data: URI from the extension, or not at all. */
function Mark({ src, name }: { src: string; name: string }) {
  if (!src) return <span className="size-4 flex-none rounded-full bg-hover" />;
  return (
    // a data: URI handed over by the extension; next/image cannot optimise it and would not help
    // biome-ignore lint/performance/noImgElement: data: URI from the wallet, not a project asset
    <img
      src={src}
      alt=""
      aria-hidden="true"
      title={name}
      width={16}
      height={16}
      className="size-4 flex-none rounded-full"
    />
  );
}
