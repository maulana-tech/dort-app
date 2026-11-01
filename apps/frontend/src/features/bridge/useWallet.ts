"use client";

import { useCallback, useEffect, useState } from "react";
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

/**
 * The wallet, with no wallet library: Dort talks to whatever injected EIP-1193 provider the
 * browser has (MetaMask, Rabby, Brave). That keeps the one dependency this page added — viem, for
 * encoding — and nothing else. There is no WalletConnect and no hosted relay: the page only ever
 * speaks to the extension in front of the user.
 *
 * Reads go over each chain's public RPC with viem, so balances show before a wallet is connected
 * and never depend on which chain the wallet happens to be on.
 */

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const provider = (): EIP1193Provider | undefined =>
  typeof window === "undefined" ? undefined : window.ethereum;

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
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  /** switch, adding the chain first when the wallet has never heard of it */
  switchTo: (id: BridgeChainId) => Promise<void>;
  /** send one transaction and return its hash */
  send: (tx: {
    to: Address;
    data: `0x${string}`;
    chainId: BridgeChainId;
  }) => Promise<`0x${string}`>;
};

export function useWallet(): Wallet {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  // the provider only exists in the browser, and only after hydration
  useEffect(() => {
    const p = provider();
    setAvailable(Boolean(p));
    if (!p) return;

    // an already-authorised wallet reconnects silently; a fresh one stays disconnected
    p.request({ method: "eth_accounts" })
      .then((a) => setAccount(((a as Address[])[0] as Address) ?? null))
      .catch(() => {});
    p.request({ method: "eth_chainId" })
      .then((c) => setChainId(Number(BigInt(c as string))))
      .catch(() => {});

    const onAccounts = (a: unknown) =>
      setAccount(((a as Address[])?.[0] as Address) ?? null);
    const onChain = (c: unknown) => setChainId(Number(BigInt(c as string)));
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = provider();
    if (!p) {
      setError("No wallet extension found in this browser.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const a = (await p.request({
        method: "eth_requestAccounts",
      })) as Address[];
      setAccount(a[0] ?? null);
      const c = (await p.request({ method: "eth_chainId" })) as string;
      setChainId(Number(BigInt(c)));
    } catch (e) {
      setError(reason(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchTo = useCallback(async (id: BridgeChainId) => {
    const p = provider();
    if (!p) return;
    setError(null);
    const hex = `0x${id.toString(16)}`;
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (e) {
      // 4902: the wallet does not know this chain yet — Portaldot is new to every wallet
      if ((e as { code?: number }).code === 4902) {
        try {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [addChainParams(id)],
          });
          return;
        } catch (addErr) {
          setError(reason(addErr));
          return;
        }
      }
      setError(reason(e));
    }
  }, []);

  const send = useCallback(
    async (tx: {
      to: Address;
      data: `0x${string}`;
      chainId: BridgeChainId;
    }) => {
      const p = provider();
      if (!p || !account) throw new Error("Connect a wallet first.");
      const chain = isBridgeChain(tx.chainId) ? CHAINS[tx.chainId] : undefined;
      if (!chain) throw new Error("Unknown chain.");
      const wallet = createWalletClient({
        account,
        chain,
        transport: custom(p),
      });
      return wallet.sendTransaction({ to: tx.to, data: tx.data, chain });
    },
    [account],
  );

  return {
    account,
    chainId,
    available,
    connecting,
    error,
    connect,
    switchTo,
    send,
  };
}

/** Wallet errors are deep and noisy; the user only needs the sentence. */
export function reason(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; code?: number };
  if (any?.code === 4001) return "You rejected the request in your wallet.";
  const m = any?.shortMessage ?? any?.message ?? String(e);
  return m.split("\n")[0].slice(0, 160);
}
