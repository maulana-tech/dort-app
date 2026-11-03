"use client";

import { createContext, type ReactNode, useContext } from "react";
import { useWalletState, type Wallet } from "./useWallet";

/**
 * One wallet for the whole app.
 *
 * The hook underneath holds plain React state, so every component that called it got a wallet of
 * its own. That was harmless while only one page could be mounted at a time — but the moment a
 * connect button lives in the header beside a page that also has one, two copies mean two
 * connections: the header shows an address, the page still asks you to connect, and neither is
 * wrong about its own state. A browser has one wallet, so the app keeps one.
 */
const Ctx = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useWalletState()}>{children}</Ctx.Provider>;
}

export function useWallet(): Wallet {
  const w = useContext(Ctx);
  if (!w)
    throw new Error(
      "useWallet must be used inside WalletProvider (it is mounted in MainShell).",
    );
  return w;
}
