"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem } from "viem";
import { CHAINS, chainName } from "../bridge/chains";
import { publicClient } from "../bridge/useWallet";
import { VAULT_ABI } from "../vault/abi";
import { previewRedeem, VAULTS, vaultReady } from "../vault/vault";
import {
  byRecent,
  DEFAULT_WINDOW,
  LOG_RPC,
  LOG_WINDOW,
  type Move,
  type Position,
  type Span,
  windows,
} from "./portfolio";

const DEPOSIT = parseAbiItem(
  "event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares)",
);
const WITHDRAW = parseAbiItem(
  "event Withdraw(address indexed caller, address indexed receiver, address indexed shareOwner, uint256 assets, uint256 shares)",
);

export type PortfolioState = {
  positions: Position[];
  moves: Move[];
  /** false when a log scan hit its cap or an endpoint refused: the page must say so */
  complete: boolean;
  /** the oldest block any scan actually reached */
  oldest: number | null;
  loading: boolean;
  errors: string[];
  refresh: () => void;
};

/** Logs come from their own endpoint where the chain's usual one caps the range too tightly. */
function logClient(id: number) {
  const url = LOG_RPC[id];
  return url
    ? createPublicClient({ chain: CHAINS[id], transport: http(url) })
    : publicClient(id);
}

export function usePortfolio(account: `0x${string}` | null): PortfolioState {
  const [positions, setPositions] = useState<Position[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [complete, setComplete] = useState(true);
  const [oldest, setOldest] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!account) {
      setPositions([]);
      setMoves([]);
      setErrors([]);
      setComplete(true);
      setOldest(null);
      return;
    }
    setLoading(true);
    const nextPositions: Position[] = [];
    const nextMoves: Move[] = [];
    const problems: string[] = [];
    let whole = true;
    let floor: number | null = null;

    const live = Object.entries(VAULTS).flatMap(([id, ds]) =>
      ds.filter(vaultReady).map((d) => ({ id: Number(id), d })),
    );

    await Promise.all(
      live.map(async ({ id, d }) => {
        const vault = d.vault as `0x${string}`;
        const name = chainName(id);
        // the position first: it is three calls and it is exact, so a chain whose logs are
        // unreachable still shows what is actually held there
        try {
          const client = publicClient(id);
          // previewRedeem is not a call here: the vault page computes it from the two totals
          // with the pure function vault.check.ts pins against DortSafeVault's own arithmetic,
          // and a second implementation is a second thing to get wrong.
          const [shares, supply, assets] = (await Promise.all([
            client.readContract({
              address: vault,
              abi: VAULT_ABI,
              functionName: "balanceOf",
              args: [account],
            }),
            client.readContract({
              address: vault,
              abi: VAULT_ABI,
              functionName: "totalSupply",
            }),
            client.readContract({
              address: vault,
              abi: VAULT_ABI,
              functionName: "totalAssets",
            }),
          ])) as [bigint, bigint, bigint];
          const worth =
            shares === 0n ? 0n : previewRedeem(shares, supply, assets);
          nextPositions.push({
            chain: id,
            chainName: name,
            vault,
            symbol: d.symbol,
            shareSymbol: d.shareSymbol,
            decimals: d.decimals,
            shares,
            worth,
          });
        } catch (e) {
          problems.push(`${name}: ${(e as Error).message}`);
        }

        // then the history, which is the part that can fail honestly
        try {
          const client = logClient(id);
          const head = Number(await client.getBlockNumber());
          const size = LOG_WINDOW[id] ?? DEFAULT_WINDOW;
          const { spans, complete: all } = windows(d.block ?? head, head, size);
          if (!all) whole = false;
          const reached = spans.at(-1)?.from ?? head;
          floor = floor === null ? reached : Math.min(floor, reached);

          const read = async (span: Span) => {
            const [ins, outs] = await Promise.all([
              client.getLogs({
                address: vault,
                event: DEPOSIT,
                args: { receiver: account },
                fromBlock: BigInt(span.from),
                toBlock: BigInt(span.to),
              }),
              client.getLogs({
                address: vault,
                event: WITHDRAW,
                args: { receiver: account },
                fromBlock: BigInt(span.from),
                toBlock: BigInt(span.to),
              }),
            ]);
            for (const l of ins)
              nextMoves.push({
                kind: "deposit",
                chain: id,
                chainName: name,
                vault,
                symbol: d.symbol,
                shareSymbol: d.shareSymbol,
                decimals: d.decimals,
                assets: l.args.assets ?? 0n,
                shares: l.args.shares ?? 0n,
                block: Number(l.blockNumber),
                tx: l.transactionHash,
              });
            for (const l of outs)
              nextMoves.push({
                kind: "withdraw",
                chain: id,
                chainName: name,
                vault,
                symbol: d.symbol,
                shareSymbol: d.shareSymbol,
                decimals: d.decimals,
                assets: l.args.assets ?? 0n,
                shares: l.args.shares ?? 0n,
                block: Number(l.blockNumber),
                tx: l.transactionHash,
              });
          };

          // serially, newest window first: a free endpoint answers a queue and rate-limits a
          // burst, and stopping early still leaves the most recent moves found
          for (const span of spans) {
            try {
              await read(span);
            } catch (e) {
              whole = false;
              problems.push(
                `${name}: the log endpoint stopped answering (${(e as Error).message.slice(0, 90)}).`,
              );
              break;
            }
          }
        } catch (e) {
          whole = false;
          problems.push(`${name}: no history (${(e as Error).message}).`);
        }
      }),
    );

    nextPositions.sort((a, b) => Number(b.worth - a.worth));
    setPositions(nextPositions);
    setMoves(nextMoves.sort(byRecent));
    setComplete(whole);
    setOldest(floor);
    setErrors(problems);
    setLoading(false);
  }, [account]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    positions,
    moves,
    complete,
    oldest,
    loading,
    errors,
    refresh: load,
  };
}
