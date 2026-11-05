"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  http,
} from "viem";
import {
  addChainParams,
  type BridgeChainId,
  CHAINS,
  isBridgeChain,
  LOCAL_RPC,
} from "./chains";
import {
  type DiscoveredWallet,
  INJECTED,
  mergeWallet,
  orderWallets,
  pickWallet,
  unknownChain,
  WALLET_KEY,
} from "./wallet";

/**
 * The wallet, with no wallet library: Dort talks to the EIP-1193 providers the browser has
 * (MetaMask, Rabby, Brave, …). That keeps the one dependency this page added — viem, for
 * encoding — and nothing else. There is no WalletConnect and no hosted relay: the page only ever
 * speaks to an extension in front of the user.
 *
 * Wallets are found by EIP-6963, not by reading `window.ethereum`. That slot holds one provider
 * and every extension overwrites it, so with two wallets installed the single slot connects
 * whichever loaded last and the user cannot choose. Under EIP-6963 each wallet announces itself
 * and the page lists them all. `window.ethereum` is kept only as a last resort, for a wallet too
 * old to announce.
 *
 * Reads go over each chain's public RPC with viem, so balances show before a wallet is connected
 * and never depend on which chain the wallet happens to be on.
 */

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type AnnounceEvent = CustomEvent<{
  info: DiscoveredWallet["info"];
  provider: EIP1193Provider;
}>;

/**
 * A read-only client per chain, memoised. `local` points it at the anvil pair that
 * script/bridge-local-demo.sh starts, so the demo reads the chains it actually deployed to.
 */
const make = (chain: Chain, url?: string) =>
  createPublicClient({ chain, transport: http(url) });

const clients = new Map<string, ReturnType<typeof make>>();

export function publicClient(id: number, local = false) {
  const chain = CHAINS[id];
  if (!chain) throw new Error(`unknown chain ${id}`);
  const key = `${id}:${local}`;
  let c = clients.get(key);
  if (!c) {
    c = make(chain, local ? LOCAL_RPC[id] : undefined);
    clients.set(key, c);
  }
  return c;
}

export type Wallet = {
  /** null until the user connects; this page never connects on its own */
  account: Address | null;
  chainId: number | null;
  /** an injected wallet exists at all */
  available: boolean;
  /** every wallet that announced itself, the remembered one first */
  wallets: DiscoveredWallet[];
  /** the one currently connected, so the header can name it */
  connected: DiscoveredWallet | null;
  connecting: boolean;
  error: string | null;
  /** `rdns` picks one of `wallets`; without it the remembered or first wallet is used */
  connect: (rdns?: string) => Promise<void>;
  /** forget the account and the remembered wallet; the extension keeps its own permission */
  disconnect: () => void;
  /** the code at an address as THIS wallet's node sees it, for the local-demo mismatch check */
  codeAt: (address: Address) => Promise<string | null>;
  /** switch, adding the chain first when the wallet has never heard of it */
  switchTo: (id: BridgeChainId) => Promise<void>;
  /**
   * The native balance according to the WALLET's node, not the page's.
   *
   * codeAt settles the question for a contract that exists on one node and not the other. It
   * cannot settle it for `swap`, whose router exists on both — a fork copies it. What differs
   * there is the money: a forked account is funded and the live one is not. So compare the two
   * answers and the mismatch becomes visible before a transaction is signed into the wrong node.
   */
  balanceAt: (address: Address) => Promise<bigint | null>;
  /**
   * Sign a line of text — personal_sign, which can move nothing and which a wallet shows as
   * words. The one thing Dort asks a wallet to sign with no transaction behind it.
   */
  sign: (message: string) => Promise<`0x${string}`>;
  /** send one transaction and return its hash; `value` is for a payable call (a native swap) */
  send: (tx: {
    to: Address;
    data: `0x${string}`;
    chainId: BridgeChainId;
    value?: bigint;
  }) => Promise<`0x${string}`>;
};

/**
 * The wallet state itself. One of these exists, inside WalletProvider — call `useWallet` to read
 * it. Mounting two would be two separate connections: the header would show an address while the
 * page still asked you to connect, which is exactly the bug this split exists to prevent.
 */
export function useWalletState(): Wallet {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [chosen, setChosen] = useState<DiscoveredWallet | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** the rdns remembered from last time; read once, then kept in step with `chosen` */
  const preferred = useRef<string | null>(null);
  /**
   * The silent reconnect is allowed once per page load. Without this, pressing Disconnect would
   * clear `chosen`, the effect below would see a wallet that is still authorised and reconnect
   * it on the next render, and the button would do nothing at all.
   */
  const autoTried = useRef(false);

  // ── find the wallets ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    preferred.current = safeGet(WALLET_KEY);

    const onAnnounce = (e: Event) => {
      const { info, provider } = (e as AnnounceEvent).detail;
      if (!info?.rdns || !provider) return;
      setWallets((list) => mergeWallet(list, { info, provider }));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // a wallet too old for EIP-6963 only exists in the single slot; list it last, and only if
    // nothing has claimed that slot's identity already
    const legacy = window.ethereum;
    if (legacy)
      setWallets((list) =>
        list.some((w) => w.provider === legacy)
          ? list
          : mergeWallet(list, { info: INJECTED, provider: legacy }),
      );

    return () =>
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  // ── reconnect silently to the wallet that was already authorised ────────────────────────
  useEffect(() => {
    if (autoTried.current || chosen || wallets.length === 0) return;
    const want = pickWallet(wallets, null, preferred.current);
    if (!want) return;
    autoTried.current = true;
    let live = true;
    want.provider
      .request({ method: "eth_accounts" })
      .then((a) => {
        const first = (a as Address[])[0];
        // no account means the user never authorised this wallet: stay disconnected, silently
        if (!live || !first) return;
        setChosen(want);
        setAccount(first);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wallets, chosen]);

  // ── follow the connected wallet ─────────────────────────────────────────────────────────
  useEffect(() => {
    const p = chosen?.provider;
    if (!p) {
      setChainId(null);
      return;
    }
    p.request({ method: "eth_chainId" })
      .then((c) => setChainId(Number(BigInt(c as string))))
      .catch(() => {});

    const onAccounts = (a: unknown) => {
      const next = (a as Address[])?.[0] ?? null;
      setAccount(next);
      // the user disconnected the site from inside the wallet; let the page go back to its
      // disconnected state rather than showing an account that is no longer authorised
      if (!next) setChosen(null);
    };
    const onChain = (c: unknown) => setChainId(Number(BigInt(c as string)));
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, [chosen]);

  const connect = useCallback(
    async (rdns?: string) => {
      const want = pickWallet(wallets, rdns ?? null, preferred.current);
      if (!want) {
        setError(
          wallets.length === 0
            ? "No wallet extension found in this browser."
            : "That wallet is no longer available.",
        );
        return;
      }
      setConnecting(true);
      setError(null);
      try {
        const a = (await want.provider.request({
          method: "eth_requestAccounts",
        })) as Address[];
        if (!a[0]) throw new Error("The wallet returned no account.");
        setChosen(want);
        setAccount(a[0]);
        const c = (await want.provider.request({
          method: "eth_chainId",
        })) as string;
        setChainId(Number(BigInt(c)));
        preferred.current = want.info.rdns;
        safeSet(WALLET_KEY, want.info.rdns);
      } catch (e) {
        setError(reason(e));
      } finally {
        setConnecting(false);
      }
    },
    [wallets],
  );

  /**
   * Let go of the wallet here. The extension's own permission survives — only it can revoke
   * that — so this is honest about what it does: the page forgets, the wallet does not.
   */
  const disconnect = useCallback(() => {
    autoTried.current = true;
    setChosen(null);
    setAccount(null);
    setChainId(null);
    setError(null);
    preferred.current = null;
    safeSet(WALLET_KEY, null);
  }, []);

  const switchTo = useCallback(
    async (id: BridgeChainId) => {
      const p = chosen?.provider;
      if (!p) return;
      setError(null);
      const hex = `0x${id.toString(16)}`;
      try {
        await p.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hex }],
        });
      } catch (e) {
        // the wallet does not know this chain yet — Portaldot is new to every wallet, and a
        // fresh MetaMask does not ship Base Sepolia either
        if (unknownChain(e)) {
          try {
            await p.request({
              method: "wallet_addEthereumChain",
              params: [addChainParams(id)],
            });
            // adding does not always switch, and some wallets answer the second call silently
            await p
              .request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: hex }],
              })
              .catch(() => {});
            return;
          } catch (addErr) {
            setError(reason(addErr));
            return;
          }
        }
        setError(reason(e));
      }
    },
    [chosen],
  );

  /**
   * What the wallet's own node has at an address. The page reads chains over its public RPCs,
   * so this is the only way to tell whether the wallet is looking at the same chain the page is
   * — which the local demo, running anvil under a real chain's id, makes easy to get wrong.
   */
  const codeAt = useCallback(
    async (address: Address): Promise<string | null> => {
      const p = chosen?.provider;
      if (!p) return null;
      try {
        return (await p.request({
          method: "eth_getCode",
          params: [address, "latest"],
        } as never)) as string;
      } catch {
        return null;
      }
    },
    [chosen],
  );

  /** eth_getBalance against the wallet's own node — see `balanceAt` on Wallet for why. */
  const balanceAt = useCallback(
    async (address: Address): Promise<bigint | null> => {
      const p = chosen?.provider;
      if (!p) return null;
      try {
        const hex = (await p.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        } as never)) as string;
        return BigInt(hex);
      } catch {
        return null;
      }
    },
    [chosen],
  );

  /**
   * Sign a line of text with the connected wallet.
   *
   * personal_sign and nothing else: it cannot move anything, and a wallet shows the words as
   * words. Used to prove this reader holds the address they claim (features/ai allowance), which
   * is the only thing Dort ever asks a wallet to sign without a transaction behind it.
   */
  const sign = useCallback(
    async (message: string): Promise<`0x${string}`> => {
      const p = chosen?.provider;
      if (!p || !account) throw new Error("Connect a wallet first.");
      return (await p.request({
        method: "personal_sign",
        params: [message, account],
      } as never)) as `0x${string}`;
    },
    [account, chosen],
  );

  const send = useCallback(
    async (tx: {
      to: Address;
      data: `0x${string}`;
      chainId: BridgeChainId;
      value?: bigint;
    }) => {
      const p = chosen?.provider;
      if (!p || !account) throw new Error("Connect a wallet first.");
      const chain = isBridgeChain(tx.chainId) ? CHAINS[tx.chainId] : undefined;
      if (!chain) throw new Error("Unknown chain.");
      const wallet = createWalletClient({
        account,
        chain,
        transport: custom(p),
      });
      return wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        chain,
        ...(tx.value === undefined ? {} : { value: tx.value }),
      });
    },
    [account, chosen],
  );

  return {
    account,
    chainId,
    available: wallets.length > 0,
    wallets: orderWallets(wallets, preferred.current),
    connected: chosen,
    connecting,
    error,
    connect,
    disconnect,
    codeAt,
    balanceAt,
    switchTo,
    send,
    sign,
  };
}

/** localStorage throws in a locked-down browser; a remembered wallet is never worth a crash. */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* a wallet the page cannot remember still works; it just asks again next time */
  }
}

/** Wallet errors are deep and noisy; the user only needs the sentence. */
export function reason(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; code?: number };
  if (any?.code === 4001) return "You rejected the request in your wallet.";
  const m = any?.shortMessage ?? any?.message ?? String(e);
  return m.split("\n")[0].slice(0, 160);
}
