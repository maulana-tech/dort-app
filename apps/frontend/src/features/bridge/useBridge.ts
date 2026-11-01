"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { ERC20_ABI, ESCROW_ABI, MINTER_ABI } from "./abi";
import { type Deployment, type Direction, route, type Step } from "./bridge";
import { type HomeChainId, PORTALDOT_ID } from "./chains";
import { publicClient, reason, type Wallet } from "./useWallet";

/**
 * The live numbers behind one transfer, and the two buttons that move it. Reads go to each
 * chain's public RPC directly, so both sides are visible at once no matter which chain the wallet
 * sits on — that is the whole point of a bridge screen.
 *
 * The relayer is a separate process (foundry/dort-relayer.mjs); this hook does not and cannot
 * carry the message itself. After a lock or a burn it watches the far side for the arrival and
 * says plainly when it is still waiting, rather than pretending the transfer is finished.
 */

export type BridgeState = {
  /** balance of the asset on the home chain */
  homeBalance: bigint | null;
  /** balance of the wrapped copy on Portaldot */
  wrappedBalance: bigint | null;
  /** what the escrow holds, and what Portaldot has issued: these must match */
  locked: bigint | null;
  wrappedSupply: bigint | null;
  allowance: bigint | null;
  paused: boolean;
  wrappedToken: Address | null;
  step: Step;
  error: string | null;
  txHash: `0x${string}` | null;
  /** set once the far side shows the arrival */
  arrived: boolean;
  refresh: () => void;
  approve: () => Promise<void>;
  submit: (amount: bigint) => Promise<void>;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function useBridge(
  wallet: Wallet,
  dep: Deployment,
  direction: Direction,
  home: HomeChainId,
  local = false,
): BridgeState {
  const [homeBalance, setHomeBalance] = useState<bigint | null>(null);
  const [wrappedBalance, setWrappedBalance] = useState<bigint | null>(null);
  const [locked, setLocked] = useState<bigint | null>(null);
  const [wrappedSupply, setWrappedSupply] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [paused, setPaused] = useState(false);
  const [wrappedToken, setWrappedToken] = useState<Address | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [arrived, setArrived] = useState(false);
  const watching = useRef<number | null>(null);
  /** bumped on every load; a reply from an older one is dropped instead of overwriting state */
  const gen = useRef(0);

  const { escrow, minter, token } = dep;
  const account = wallet.account;

  // ── read both chains ────────────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    if (!escrow || !minter || !token) return;
    const mine = ++gen.current;
    const stale = () => mine !== gen.current;
    void (async () => {
      try {
        const homeClient = publicClient(home, local);
        const portal = publicClient(PORTALDOT_ID, local);

        const [lockedNow, pausedHome, wrappedAddr] = await Promise.all([
          homeClient.readContract({
            address: escrow,
            abi: ESCROW_ABI,
            functionName: "locked",
            args: [token],
          }),
          homeClient.readContract({
            address: escrow,
            abi: ESCROW_ABI,
            functionName: "paused",
          }),
          portal.readContract({
            address: minter,
            abi: MINTER_ABI,
            functionName: "wrapped",
            args: [token],
          }),
        ]);
        if (stale()) return;
        setLocked(lockedNow as bigint);
        setPaused(Boolean(pausedHome));
        const w =
          (wrappedAddr as Address) !== ZERO ? (wrappedAddr as Address) : null;
        setWrappedToken(w);

        if (w) {
          const supply = await portal.readContract({
            address: w,
            abi: ERC20_ABI,
            functionName: "totalSupply",
          });
          if (!stale()) setWrappedSupply(supply as bigint);
        } else if (!stale()) setWrappedSupply(0n);

        if (account) {
          const [bal, allow] = await Promise.all([
            homeClient.readContract({
              address: token,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [account],
            }),
            homeClient.readContract({
              address: token,
              abi: ERC20_ABI,
              functionName: "allowance",
              args: [account, escrow],
            }),
          ]);
          if (stale()) return;
          setHomeBalance(bal as bigint);
          setAllowance(allow as bigint);
          if (w) {
            const wb = await portal.readContract({
              address: w,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [account],
            });
            if (!stale()) setWrappedBalance(wb as bigint);
          } else if (!stale()) setWrappedBalance(0n);
        }
      } catch (e) {
        if (!stale()) setError(reason(e));
      }
    })();
  }, [escrow, minter, token, account, local, home]);

  useEffect(() => {
    refresh();
    // a load in flight when the inputs change is dropped by the generation guard above
    return () => {
      gen.current++;
    };
  }, [refresh]);

  // ── watch the far side for the relayer's delivery ───────────────────────────────────────
  const watchArrival = useCallback(
    (expected: bigint) => {
      if (watching.current) window.clearInterval(watching.current);
      const started = Date.now();
      watching.current = window.setInterval(async () => {
        try {
          if (Date.now() - started > 10 * 60_000) {
            window.clearInterval(watching.current ?? undefined);
            setStep("idle");
            setError("No delivery after 10 minutes — is the relayer running?");
            return;
          }
          const portal = publicClient(PORTALDOT_ID, local);
          const w =
            wrappedToken ??
            ((await portal.readContract({
              address: minter as Address,
              abi: MINTER_ABI,
              functionName: "wrapped",
              args: [token as Address],
            })) as Address);
          if (!w || w === ZERO) return;
          const supply = (await portal.readContract({
            address: w,
            abi: ERC20_ABI,
            functionName: "totalSupply",
          })) as bigint;
          if (supply === expected) {
            window.clearInterval(watching.current ?? undefined);
            setArrived(true);
            setStep("done");
            refresh();
          }
        } catch {
          /* a flaky public RPC is not a failed transfer; keep waiting */
        }
      }, 6_000);
    },
    [minter, token, wrappedToken, refresh, local],
  );

  useEffect(
    () => () => {
      if (watching.current) window.clearInterval(watching.current);
    },
    [],
  );

  // ── the two things the user can do ──────────────────────────────────────────────────────
  const approve = useCallback(async () => {
    if (!escrow || !token) return;
    setError(null);
    setStep("approve");
    try {
      const hash = await wallet.send({
        to: token,
        chainId: home,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [escrow, maxUint256],
        }),
      });
      setTxHash(hash);
      await publicClient(home, local).waitForTransactionReceipt({ hash });
      setStep("idle");
      refresh();
    } catch (e) {
      setError(reason(e));
      setStep("error");
    }
  }, [escrow, token, wallet, refresh, local, home]);

  const submit = useCallback(
    async (amount: bigint) => {
      if (!escrow || !minter || !token || !account) return;
      setError(null);
      setArrived(false);
      setStep("submit");
      const { from, to } = route(direction, home);
      try {
        const data =
          direction === "toPortaldot"
            ? encodeFunctionData({
                abi: ESCROW_ABI,
                functionName: "lock",
                args: [token, amount, BigInt(to), account],
              })
            : encodeFunctionData({
                abi: MINTER_ABI,
                functionName: "burn",
                args: [token, amount, BigInt(to), account],
              });
        const hash = await wallet.send({
          to: direction === "toPortaldot" ? escrow : minter,
          chainId: from,
          data,
        });
        setTxHash(hash);
        await publicClient(from, local).waitForTransactionReceipt({ hash });
        setStep("relaying");
        // the relayer now has to act; watch the supply on Portaldot settle to its new value
        const supplyNow = wrappedSupply ?? 0n;
        watchArrival(
          direction === "toPortaldot" ? supplyNow + amount : supplyNow - amount,
        );
        refresh();
      } catch (e) {
        setError(reason(e));
        setStep("error");
      }
    },
    [
      escrow,
      minter,
      token,
      account,
      direction,
      wallet,
      wrappedSupply,
      watchArrival,
      refresh,
      local,
      home,
    ],
  );

  return {
    homeBalance,
    wrappedBalance,
    locked,
    wrappedSupply,
    allowance,
    paused,
    wrappedToken,
    step,
    error,
    txHash,
    arrived,
    refresh,
    approve,
    submit,
  };
}
