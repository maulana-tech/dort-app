"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { ERC20_ABI } from "@/features/bridge/abi";
import type { HomeChainId } from "@/features/bridge/chains";
import { publicClient, reason, type Wallet } from "@/features/bridge/useWallet";
import { VAULT_ABI } from "./abi";
import type { Side, Unit, VaultDeployment, VaultStep } from "./vault";

/**
 * The live numbers behind one deposit or withdraw. Reads go straight to the chain's RPC so the
 * figures are there before a wallet is connected; the previews in vault.ts mirror the contract's
 * own maths so the page can say what will happen before anything is signed.
 *
 * The wallet, the chain list and the ERC-20 slice come from `features/bridge`: there is one
 * injected wallet per browser and one chain list per project, so a second copy of either would be
 * a second thing to keep in step with foundry/dort-chains.mjs. Vault owns only its own calls.
 */
export type VaultState = {
  /** the asset in the user's wallet */
  assetBalance: bigint | null;
  /** shares the user holds */
  shareBalance: bigint | null;
  /** what those shares are worth */
  redeemable: bigint | null;
  totalAssets: bigint | null;
  totalSupply: bigint | null;
  allowance: bigint | null;
  paused: boolean;
  step: VaultStep;
  error: string | null;
  txHash: `0x${string}` | null;
  refresh: () => void;
  approve: () => Promise<void>;
  /** `unit` only matters on a withdraw: "shares" burns an exact number of them (redeem) */
  submit: (side: Side, amount: bigint, unit?: Unit) => Promise<void>;
};

export function useVault(
  wallet: Wallet,
  dep: VaultDeployment,
  chain: HomeChainId,
  local = false,
): VaultState {
  const [assetBalance, setAssetBalance] = useState<bigint | null>(null);
  const [shareBalance, setShareBalance] = useState<bigint | null>(null);
  const [redeemable, setRedeemable] = useState<bigint | null>(null);
  const [totalAssets, setTotalAssets] = useState<bigint | null>(null);
  const [totalSupply, setTotalSupply] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState<VaultStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const gen = useRef(0);

  const { vault, asset } = dep;
  const account = wallet.account;

  const refresh = useCallback(() => {
    if (!vault || !asset) return;
    const mine = ++gen.current;
    const stale = () => mine !== gen.current;
    void (async () => {
      try {
        const c = publicClient(chain, local);
        const [ta, ts, isPaused] = await Promise.all([
          c.readContract({
            address: vault,
            abi: VAULT_ABI,
            functionName: "totalAssets",
          }),
          c.readContract({
            address: vault,
            abi: VAULT_ABI,
            functionName: "totalSupply",
          }),
          c.readContract({
            address: vault,
            abi: VAULT_ABI,
            functionName: "paused",
          }),
        ]);
        if (stale()) return;
        setTotalAssets(ta as bigint);
        setTotalSupply(ts as bigint);
        setPaused(Boolean(isPaused));

        if (!account) return;
        const [bal, shares, allow, max] = await Promise.all([
          c.readContract({
            address: asset,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [account],
          }),
          c.readContract({
            address: vault,
            abi: VAULT_ABI,
            functionName: "balanceOf",
            args: [account],
          }),
          c.readContract({
            address: asset,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [account, vault],
          }),
          c.readContract({
            address: vault,
            abi: VAULT_ABI,
            functionName: "maxWithdraw",
            args: [account],
          }),
        ]);
        if (stale()) return;
        setAssetBalance(bal as bigint);
        setShareBalance(shares as bigint);
        setAllowance(allow as bigint);
        setRedeemable(max as bigint);
      } catch (e) {
        if (!stale()) setError(reason(e));
      }
    })();
  }, [vault, asset, account, chain, local]);

  useEffect(() => {
    refresh();
    return () => {
      gen.current++;
    };
  }, [refresh]);

  const approve = useCallback(async () => {
    if (!vault || !asset) return;
    setError(null);
    setStep("approve");
    try {
      const hash = await wallet.send({
        to: asset,
        chainId: chain,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [vault, maxUint256],
        }),
      });
      setTxHash(hash);
      await publicClient(chain, local).waitForTransactionReceipt({ hash });
      setStep("idle");
      refresh();
    } catch (e) {
      setError(reason(e));
      setStep("error");
    }
  }, [vault, asset, wallet, chain, local, refresh]);

  const submit = useCallback(
    async (side: Side, amount: bigint, unit: Unit = "assets") => {
      if (!vault || !account) return;
      setError(null);
      setStep("submit");
      try {
        const me = account as Address;
        const call =
          side === "deposit"
            ? { functionName: "deposit" as const, args: [amount, me] as const }
            : unit === "shares"
              ? {
                  functionName: "redeem" as const,
                  args: [amount, me, me] as const,
                }
              : {
                  functionName: "withdraw" as const,
                  args: [amount, me, me] as const,
                };
        const data = encodeFunctionData({ abi: VAULT_ABI, ...call });
        const hash = await wallet.send({ to: vault, chainId: chain, data });
        setTxHash(hash);
        await publicClient(chain, local).waitForTransactionReceipt({ hash });
        setStep("done");
        refresh();
      } catch (e) {
        setError(reason(e));
        setStep("error");
      }
    },
    [vault, account, wallet, chain, local, refresh],
  );

  return {
    assetBalance,
    shareBalance,
    redeemable,
    totalAssets,
    totalSupply,
    allowance,
    paused,
    step,
    error,
    txHash,
    refresh,
    approve,
    submit,
  };
}
