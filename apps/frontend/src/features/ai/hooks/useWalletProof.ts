"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/features/bridge/WalletProvider";
import { hourOf, proofMessage } from "../utils/allowance";

/**
 * A signature saying this reader holds the wallet they are asking from.
 *
 * Signed once an hour, kept in this browser, and sent with each question so the server can count
 * against the wallet rather than against everyone sharing an exit address. The hour is the
 * window because the thing it guards is a handful of questions: asking someone to approve a
 * popup per message, to save an operator a few cents, is a worse trade than the one it makes.
 *
 * Never automatic. A wallet popup nobody asked for is how a page teaches people to click through
 * them, so this signs when a reader presses the button and at no other time. Until then the page
 * works, with the anonymous allowance, and says so.
 */
export type WalletProof = {
  /** what travels with a question, or undefined when there is nothing proved */
  claim: { address: string; hour: number; signature: string } | undefined;
  /** a wallet is connected and could be proved */
  can: boolean;
  signing: boolean;
  error: string | null;
  prove: () => Promise<void>;
};

const KEY = "dort.wallet-proof";

type Stored = { address: string; hour: number; signature: string };

const read = (): Stored | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Stored>;
    return typeof p.address === "string" &&
      typeof p.signature === "string" &&
      typeof p.hour === "number"
      ? { address: p.address, hour: p.hour, signature: p.signature }
      : null;
  } catch {
    return null;
  }
};

export function useWalletProof(): WalletProof {
  const { account, sign } = useWallet();
  const [stored, setStored] = useState<Stored | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setStored(read()), []);

  const prove = useCallback(async () => {
    if (!account) return;
    setSigning(true);
    setError(null);
    try {
      const hour = hourOf(Date.now());
      const signature = await sign(proofMessage(account, hour));
      const next = { address: account.toLowerCase(), hour, signature };
      setStored(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* a locked-down browser keeps the proof for this page only */
      }
    } catch (e) {
      // a refusal is a choice, not a failure: say nothing and leave the allowance as it was
      const msg = (e as Error).message ?? "";
      setError(/reject|denied|User/i.test(msg) ? null : msg);
    } finally {
      setSigning(false);
    }
  }, [account, sign]);

  // a proof is for one wallet and one hour; it is simply absent otherwise, never stale-but-sent
  const hour = hourOf(Date.now());
  const claim =
    stored &&
    account &&
    stored.address === account.toLowerCase() &&
    (stored.hour === hour || stored.hour === hour - 1)
      ? stored
      : undefined;

  return { claim, can: !!account, signing, error, prove };
}
