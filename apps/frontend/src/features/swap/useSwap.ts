"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, encodeFunctionData, maxUint256 } from "viem";
import { ERC20_ABI } from "@/features/bridge/abi";
import { publicClient, reason, type Wallet } from "@/features/bridge/useWallet";
import { FACTORY_ABI, PAIR_ABI, ROUTER_ABI } from "./abi";
import {
  asErc20,
  deadline,
  FACTORY,
  GAS_RESERVE,
  minOut,
  pathFor,
  ROUTER,
  SWAP_CHAIN,
  type SwapStep,
  type Token,
} from "./swap";

/**
 * The live numbers behind one swap on PortalSwapRouter.
 *
 * Reserves rather than quotes: with the pair's reserves in hand the page prices every keystroke
 * itself (swap.ts reproduces the router's arithmetic exactly), so the quote and the price impact
 * appear as you type instead of one RPC round trip later. `getAmountsOut` is still called once
 * before the transaction, as a check that the local figure and the chain agree.
 *
 * The wallet and the chain list come from features/bridge, which owns them for the whole app.
 */
export type SwapState = {
  /** the pair for the two tokens, or null while loading / if it does not exist */
  pair: Address | null;
  /** reserves already oriented as (in, out) for the current direction */
  reserveIn: bigint | null;
  reserveOut: bigint | null;
  balanceIn: bigint | null;
  balanceOut: bigint | null;
  allowance: bigint | null;
  step: SwapStep;
  /**
   * True when the wallet's node and this page's node disagree about the account's money, which
   * means one of them is the fork and the other is not. Null while unknown or not applicable.
   */
  nodeMismatch: boolean | null;
  error: string | null;
  txHash: `0x${string}` | null;
  refresh: () => void;
  approve: () => Promise<void>;
  /** confirms the local quote against the router, then sends */
  swap: (
    amount: bigint,
    expected: bigint,
    slippageBps: number,
  ) => Promise<void>;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * `local` points every read at the anvil in LOCAL_RPC instead of the public RPC, the way
 * useVault already does. It is not a convenience: Portaldot's faucet is the only way onto the
 * live chain, and when it is down an unfunded reader sees a balance of 0, a disabled button and
 * a receipt wait that never returns — the page is dead for a reason that has nothing to do with
 * this code. Against a fork of the chain (script/portaldot-fork-demo.sh) the pools, the router
 * and its arithmetic are the real ones; only the funds are local.
 */
export function useSwap(
  wallet: Wallet,
  from: Token,
  to: Token,
  local = false,
): SwapState {
  const [pair, setPair] = useState<Address | null>(null);
  const [reserveIn, setReserveIn] = useState<bigint | null>(null);
  const [reserveOut, setReserveOut] = useState<bigint | null>(null);
  const [balanceIn, setBalanceIn] = useState<bigint | null>(null);
  const [balanceOut, setBalanceOut] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [step, setStep] = useState<SwapStep>("idle");
  const [nodeMismatch, setNodeMismatch] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  /** bumped on every load; a reply from an older one is dropped instead of overwriting state */
  const gen = useRef(0);

  const account = wallet.account;
  const inAddr = asErc20(from).address;
  const outAddr = asErc20(to).address;
  const sameToken = inAddr === outAddr;

  const refresh = useCallback(() => {
    const mine = ++gen.current;
    const stale = () => mine !== gen.current;
    if (!inAddr || !outAddr || sameToken) {
      setPair(null);
      setReserveIn(null);
      setReserveOut(null);
      return;
    }
    void (async () => {
      try {
        const c = publicClient(SWAP_CHAIN, local);
        const p = (await c.readContract({
          address: FACTORY,
          abi: FACTORY_ABI,
          functionName: "getPair",
          args: [inAddr, outAddr],
        })) as Address;
        if (stale()) return;
        if (!p || p === ZERO) {
          setPair(null);
          setReserveIn(null);
          setReserveOut(null);
        } else {
          setPair(p);
          const [reserves, token0] = await Promise.all([
            c.readContract({
              address: p,
              abi: PAIR_ABI,
              functionName: "getReserves",
            }),
            c.readContract({
              address: p,
              abi: PAIR_ABI,
              functionName: "token0",
            }),
          ]);
          if (stale()) return;
          const [r0, r1] = reserves as [bigint, bigint, number];
          // the pair stores them sorted by address; the page wants them by direction
          const inIsToken0 =
            (token0 as string).toLowerCase() === inAddr.toLowerCase();
          setReserveIn(inIsToken0 ? r0 : r1);
          setReserveOut(inIsToken0 ? r1 : r0);
        }

        if (!account) return;
        // the native coin is a balance on the account, not in a contract
        const [bIn, bOut, allow] = await Promise.all([
          from.native
            ? c.getBalance({ address: account })
            : c.readContract({
                address: inAddr,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [account],
              }),
          to.native
            ? c.getBalance({ address: account })
            : c.readContract({
                address: outAddr,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [account],
              }),
          from.native
            ? Promise.resolve(maxUint256)
            : c.readContract({
                address: inAddr,
                abi: ERC20_ABI,
                functionName: "allowance",
                args: [account, ROUTER],
              }),
        ]);
        if (stale()) return;
        setBalanceIn(bIn as bigint);
        setBalanceOut(bOut as bigint);
        setAllowance(allow as bigint);
      } catch (e) {
        if (!stale()) setError(reason(e));
      }
    })();
  }, [inAddr, outAddr, sameToken, account, from.native, to.native, local]);

  useEffect(() => {
    refresh();
    return () => {
      gen.current++;
    };
  }, [refresh]);

  /**
   * Whether the wallet is looking at the same node as the page.
   *
   * Both report chain 420420777 — a fork keeps the id — so the chain id cannot answer this, and
   * neither can codeAt: the router exists on the fork too, because the fork copied it. The money
   * is what differs. Forget to flip the switch (or to repoint the wallet) and the page would
   * otherwise show a balance from one node while the transaction is signed against the other:
   * either a confusing "insufficient funds" from the wallet, or a disabled button with no reason
   * given. Both are worst at exactly the moment someone is recording a demo.
   */
  const { balanceAt, chainId: walletChain } = wallet;
  useEffect(() => {
    if (!account || walletChain !== SWAP_CHAIN) {
      setNodeMismatch(null);
      return;
    }
    let live = true;
    void (async () => {
      const [page, inWallet] = await Promise.all([
        publicClient(SWAP_CHAIN, local)
          .getBalance({ address: account })
          .catch(() => null),
        balanceAt(account),
      ]);
      if (!live || page === null || inWallet === null) return;
      // A block can arrive between the two reads, so a little drift is honest; a different node
      // is never a little. GAS_RESERVE is the smallest amount this page already treats as real.
      const gap = page > inWallet ? page - inWallet : inWallet - page;
      setNodeMismatch(gap > GAS_RESERVE);
    })();
    return () => {
      live = false;
    };
  }, [account, walletChain, local, balanceAt]);

  const approve = useCallback(async () => {
    if (!inAddr || from.native) return;
    setError(null);
    setStep("approve");
    try {
      const hash = await wallet.send({
        to: inAddr,
        chainId: SWAP_CHAIN,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ROUTER, maxUint256],
        }),
      });
      setTxHash(hash);
      await publicClient(SWAP_CHAIN, local).waitForTransactionReceipt({ hash });
      setStep("idle");
      refresh();
    } catch (e) {
      setError(reason(e));
      setStep("error");
    }
  }, [inAddr, from.native, wallet, refresh, local]);

  const swap = useCallback(
    async (amount: bigint, expected: bigint, slippageBps: number) => {
      const path = pathFor(from, to);
      if (!account || path.length !== 2) return;
      setError(null);
      setStep("submit");
      try {
        const c = publicClient(SWAP_CHAIN, local);
        // the chain prices it too: if the pool moved since the last read, use ITS number, so the
        // floor below is never computed from a quote that is already stale
        const amounts = (await c.readContract({
          address: ROUTER,
          abi: ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [amount, path],
        })) as bigint[];
        const onChain = amounts[amounts.length - 1] ?? expected;
        const floor = minOut(onChain, slippageBps);
        if (floor === 0n) throw new Error("The pool cannot fill this trade.");

        const to20 = account as Address;
        const until = deadline(Date.now());
        const data = from.native
          ? encodeFunctionData({
              abi: ROUTER_ABI,
              functionName: "swapExactPOTForTokens",
              args: [floor, path, to20, until],
            })
          : to.native
            ? encodeFunctionData({
                abi: ROUTER_ABI,
                functionName: "swapExactTokensForPOT",
                args: [amount, floor, path, to20, until],
              })
            : encodeFunctionData({
                abi: ROUTER_ABI,
                functionName: "swapExactTokensForTokens",
                args: [amount, floor, path, to20, until],
              });

        const hash = await wallet.send({
          to: ROUTER,
          chainId: SWAP_CHAIN,
          data,
          ...(from.native ? { value: amount } : {}),
        });
        setTxHash(hash);
        await c.waitForTransactionReceipt({ hash });
        setStep("done");
        refresh();
      } catch (e) {
        setError(reason(e));
        setStep("error");
      }
    },
    [from, to, account, wallet, refresh, local],
  );

  return {
    pair,
    reserveIn,
    reserveOut,
    balanceIn,
    balanceOut,
    allowance,
    step,
    nodeMismatch,
    error,
    txHash,
    refresh,
    approve,
    swap,
  };
}
