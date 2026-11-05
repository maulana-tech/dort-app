import type { EIP1193Provider } from "viem";

/**
 * Finding the user's wallet, and saying so honestly when there isn't one.
 *
 * `window.ethereum` is a single slot that every extension fights over: with MetaMask and Rabby
 * and Phantom installed, whichever loaded last wins it, and "Connect wallet" then opens the wrong
 * one with no way to choose. EIP-6963 fixes that — each wallet announces itself, the page
 * collects the announcements and lets the user pick. This file is the pure half of that: merging
 * announcements, ordering them, and remembering the choice. The listening lives in useWallet.
 */

export type WalletInfo = {
  /** per-session id from the wallet; not stable across reloads, so never persist it */
  uuid: string;
  name: string;
  /** a data: URI the wallet provides */
  icon: string;
  /** reverse-DNS id, stable across reloads: this is what we remember */
  rdns: string;
};

export type DiscoveredWallet = { info: WalletInfo; provider: EIP1193Provider };

/** The key the chosen wallet's rdns is kept under, so the next visit reconnects to the same one. */
export const WALLET_KEY = "dort.wallet.rdns";

/** The legacy `window.ethereum`, shown only when no wallet announced itself properly. */
export const INJECTED_RDNS = "injected";

export const INJECTED: WalletInfo = {
  uuid: INJECTED_RDNS,
  name: "Browser wallet",
  icon: "",
  rdns: INJECTED_RDNS,
};

/**
 * Add one announcement to the list.
 *
 * A wallet may announce more than once — on every `eip6963:requestProvider`, and some do it
 * unprompted too. The rdns is the identity, so a repeat replaces the entry in place rather than
 * appending a duplicate, and the order stays the order they first appeared in.
 */
export function mergeWallet(
  list: DiscoveredWallet[],
  found: DiscoveredWallet,
): DiscoveredWallet[] {
  const at = list.findIndex((w) => w.info.rdns === found.info.rdns);
  if (at === -1) return [...list, found];
  const next = [...list];
  next[at] = found;
  return next;
}

/**
 * The order the picker lists them in: the remembered wallet first, then the rest as announced.
 *
 * The bare `window.ethereum` entry always sinks to the bottom — it is the fallback, and a wallet
 * that announced itself properly is the better guess every time.
 */
export function orderWallets(
  list: DiscoveredWallet[],
  preferred: string | null,
): DiscoveredWallet[] {
  const rank = (w: DiscoveredWallet) =>
    w.info.rdns === preferred ? 0 : w.info.rdns === INJECTED_RDNS ? 2 : 1;
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/**
 * Which wallet a connect should use: the one asked for, else the remembered one, else the first.
 * Returns null when there is nothing to connect to, which the page reports rather than throwing.
 */
export function pickWallet(
  list: DiscoveredWallet[],
  wanted: string | null,
  preferred: string | null,
): DiscoveredWallet | null {
  if (wanted) return list.find((w) => w.info.rdns === wanted) ?? null;
  if (preferred) {
    const hit = list.find((w) => w.info.rdns === preferred);
    if (hit) return hit;
  }
  return orderWallets(list, preferred)[0] ?? null;
}

/** What the button says before anything is connected. */
export function connectLabel(
  list: DiscoveredWallet[],
  connecting: boolean,
): string {
  if (connecting) return "Connecting…";
  if (list.length === 0) return "No wallet found";
  if (list.length === 1) return `Connect ${list[0].info.name}`;
  return "Connect wallet";
}

/** Where to send someone who has no wallet at all. Not an endorsement, just the two commonest. */
export const INSTALL = [
  { name: "MetaMask", url: "https://metamask.io/download/" },
  { name: "Rabby", url: "https://rabby.io/" },
] as const;

/**
 * Whether the wallet is really looking at the same chain the page is reading.
 *
 * The local demo runs anvil under a real chain's id, so a wallet pointed at the real testnet
 * reports the right `chainId` and is still the wrong network: the contracts exist only on the
 * node the page reads. Comparing the code at the address through the *wallet's* own RPC catches
 * that — an empty answer means a transaction would be sent into nothing.
 */
export const codeMissing = (code: string | null): boolean =>
  code !== null && (code === "0x" || code === "0x0");

/**
 * "This wallet has never heard of that chain."
 *
 * EIP-3326 says a wallet answers 4902 when asked to switch to a chain it does not hold, and the
 * caller is then meant to add it. MetaMask does answer 4902 — but not always where you look for
 * it: it wraps provider errors, so the real code often arrives as `data.originalError.code` while
 * the top-level code is -32603. Reading only `e.code` therefore skips the add entirely and leaves
 * the reader staring at MetaMask's own "Unrecognized chain ID" text, which tells them to do
 * something they cannot do from the page.
 *
 * That is not hypothetical: it is what Base Sepolia (0x14a34) did on a fresh MetaMask, which does
 * not ship testnets. The message is the last resort, for wallets that send neither code.
 */
export function unknownChain(e: unknown): boolean {
  const err = e as {
    code?: unknown;
    message?: unknown;
    data?: { originalError?: { code?: unknown } };
  };
  if (err?.code === 4902 || err?.data?.originalError?.code === 4902)
    return true;
  return /unrecognized chain/i.test(String(err?.message ?? ""));
}
