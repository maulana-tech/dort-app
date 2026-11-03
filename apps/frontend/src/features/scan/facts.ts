"use client";

import { erc20Abi } from "viem";
import {
  addressUrl,
  type BridgeChainId,
  CHAINS,
  chainName,
  rpcUrl,
  txUrl,
} from "@/features/bridge/chains";
import { publicClient } from "@/features/bridge/useWallet";
import { knownEvents, knownSelectors } from "./selectors";
import {
  type CallNode,
  flattenTrace,
  type ScanFacts,
  type ScanInput,
} from "./utils/scan";

/**
 * What the chain itself can tell us, before any model is asked anything.
 *
 * This is the half of the feature a chat window cannot do. A reader pasting a transaction hash
 * into a chatbot gets a story about the hash; pasting it here gets the actual call tree, read
 * from the node, and the model is then arguing with facts rather than inventing them.
 *
 * `debug_traceTransaction` with `callTracer` is supported on Portaldot V3 — probed against a real
 * transaction on the live RPC before this was written. Many public RPCs disable it, so a failure
 * here is expected and never fatal: the review still runs, and the page says the trace was
 * unavailable instead of pretending the transaction had no calls.
 */

/** One JSON-RPC call, straight to the chain's own endpoint. */
async function rpc<T>(
  chainId: number,
  method: string,
  params: unknown[],
): Promise<T> {
  const url = CHAINS[chainId]?.rpcUrls.default.http[0];
  if (!url) throw new Error(`no RPC for chain ${chainId}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: ${res.status}`);
  const json = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

export type Gathered = {
  facts: ScanFacts;
  /** why the call tree is missing, when it is — shown rather than swallowed */
  traceNote: string | null;
};

export async function gatherFacts(
  chainId: number,
  input: ScanInput,
): Promise<Gathered> {
  const facts: ScanFacts = { chain: chainName(chainId) };
  if (input.kind === "source") return { facts, traceNote: null };

  // where to see it, or failing that what to run. Portaldot has no browsable explorer, so on
  // that chain the honest "check it yourself" is the call Dort itself made, not a dead link.
  const id = chainId as BridgeChainId;
  facts.explorer =
    input.kind === "tx" ? txUrl(id, input.value) : addressUrl(id, input.value);
  // `endpoint`, not `rpc`: this module already has an rpc() of its own, and shadowing it here
  // would have made every JSON-RPC call below a call to a string
  const endpoint = rpcUrl(id);
  facts.probe = facts.explorer
    ? null
    : endpoint
      ? input.kind === "tx"
        ? `cast tx ${input.value} --rpc-url ${endpoint}`
        : `cast code ${input.value} --rpc-url ${endpoint}`
      : null;

  const client = publicClient(chainId);

  if (input.kind === "address") {
    const address = input.value as `0x${string}`;
    const code = await client.getCode({ address });
    // "0x" and undefined both mean nothing is deployed; bytes, not characters
    facts.bytecodeBytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    // an address that answers symbol() and decimals() is almost certainly a token, and that one
    // fact changes every question worth asking about it. A plain contract just refuses.
    facts.token = null;
    if (facts.bytecodeBytes > 0) {
      try {
        const [symbol, decimals] = await Promise.all([
          client.readContract({
            address,
            abi: erc20Abi,
            functionName: "symbol",
          }),
          client.readContract({
            address,
            abi: erc20Abi,
            functionName: "decimals",
          }),
        ]);
        facts.token = { symbol, decimals };
      } catch {
        // not a token: the honest answer, not an error
      }
    }
    return { facts, traceNote: null };
  }

  const hash = input.value as `0x${string}`;
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }).catch(() => null),
  ]);
  facts.from = tx.from;
  facts.to = tx.to ?? "(contract creation)";
  facts.value = tx.value.toString();
  facts.block = Number(tx.blockNumber);
  facts.status = receipt?.status === "success" ? "success" : "reverted";
  // the rest of the envelope, which an explorer would list and we were throwing away: a reader
  // asking "what is this transaction" wants when, by whom, in what order and at what cost, and
  // the model reasons better about a call it knows the shape of
  facts.nonce = tx.nonce;
  facts.index = tx.transactionIndex ?? undefined;
  facts.txType = typeof tx.type === "string" ? tx.type : undefined;
  facts.gasLimit = tx.gas === undefined ? null : Number(tx.gas);
  facts.gasUsed =
    receipt?.gasUsed === undefined ? null : Number(receipt.gasUsed);
  facts.gasPrice = receipt?.effectiveGasPrice?.toString();
  facts.selector = tx.input?.slice(0, 10);
  facts.inputBytes = tx.input ? Math.max(0, (tx.input.length - 2) / 2) : 0;
  facts.logs = receipt?.logs?.length;
  // one more call for the one thing neither of the first two carries
  try {
    const block = await client.getBlock({ blockNumber: tx.blockNumber ?? 0n });
    facts.at = Number(block.timestamp);
  } catch {
    /* a chain that will not give up the block still gave us the transaction */
  }

  let traceNote: string | null = null;
  try {
    const root = await rpc<CallNode>(chainId, "debug_traceTransaction", [
      hash,
      { tracer: "callTracer" },
    ]);
    facts.frames = flattenTrace(root, knownSelectors(), knownEvents());
    if (!facts.frames.length) traceNote = "The node returned an empty trace.";
  } catch (e) {
    traceNote = `No call tree: this chain's RPC refused debug_traceTransaction (${(e as Error).message}). The review below reads the transaction's envelope only.`;
  }
  return { facts, traceNote };
}
