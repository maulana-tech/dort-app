import "server-only";

import { createPublicClient, http, verifyMessage } from "viem";
import { CHAINS, PORTALDOT_ID } from "@/features/bridge/chains";
import {
  type Allowance,
  allowanceOf,
  creditAllowance,
  hourOk,
  proofMessage,
  type Tier,
} from "../utils/allowance";

/**
 * Which allowance a request has earned, decided on the server and never taken on trust.
 *
 * The browser can say anything. It says an address, the hour it signed for, and a signature; the
 * first two are claims and the third is the only one that means something, so it is checked
 * before either is used. An unverified address is the same as no address at all.
 *
 * "On chain" means the wallet has a nonce or a balance on a chain Dort reads — someone went to a
 * faucet and waited. That is the whole of the friction this buys and it is worth being plain
 * about: it is one faucet claim, not identity, and a determined script will pay it. What it
 * stops is the free, infinite case, which is the one that empties an operator's budget.
 *
 * Cross-chain by the only definition that matters here: history anywhere Dort supports counts,
 * so a reader who has only ever touched Base is not told to go and use Portaldot first.
 */

/** Checked in this order and stopped at the first hit: the home chain, then where the vault is. */
const LOOK_ON = [PORTALDOT_ID, 84532] as const;

/** Addresses seen recently, so a page of questions is not a page of RPC calls. */
const seen = new Map<string, { tier: Tier; allow: Allowance; at: number }>();
const REMEMBER = 10 * 60_000;

const clientFor = (id: number) => {
  const chain = CHAINS[id];
  return chain ? createPublicClient({ chain, transport: http() }) : null;
};

/**
 * What this wallet holds, across the chains Dort reads — the largest balance found, not the sum.
 *
 * The largest, because the chains' tokens are different things and adding tPOT to Sepolia ETH
 * would be arithmetic on two unrelated units. Cross-chain in the sense that matters here: a
 * reader who has only ever touched Base is not told to go and use Portaldot first.
 *
 * A nonce without a balance still counts for something — the wallet has been used — so it
 * returns a balance of zero rather than nothing, and the caller reads that as the wallet tier.
 */
async function holdings(
  address: `0x${string}`,
): Promise<{ balance: bigint; used: boolean }> {
  let balance = 0n;
  let used = false;
  for (const id of LOOK_ON) {
    const client = clientFor(id);
    if (!client) continue;
    try {
      const [count, held] = await Promise.all([
        client.getTransactionCount({ address }),
        client.getBalance({ address }),
      ]);
      if (count > 0) used = true;
      if (held > balance) balance = held;
    } catch {
      // a chain that will not answer is not evidence either way; try the next one
    }
  }
  return { balance, used };
}

export type WalletClaim = {
  address?: unknown;
  hour?: unknown;
  signature?: unknown;
};

/**
 * The tier and the key to count against. The key is the wallet when it proved itself and the
 * caller's address otherwise, so one reader behind a shared exit address no longer spends
 * everybody else's share.
 */
export async function tierOf(
  claim: WalletClaim | undefined,
  fallbackKey: string,
  now: number,
): Promise<{ tier: Tier; key: string; allow: Allowance }> {
  const address = typeof claim?.address === "string" ? claim.address : "";
  const signature = typeof claim?.signature === "string" ? claim.signature : "";
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    !/^0x[0-9a-fA-F]+$/.test(signature) ||
    !hourOk(claim?.hour, now)
  )
    return { tier: "anon", key: fallbackKey, allow: allowanceOf("anon") };

  const addr = address.toLowerCase() as `0x${string}`;
  let ok = false;
  try {
    ok = await verifyMessage({
      address: addr,
      message: proofMessage(addr, claim?.hour as number),
      signature: signature as `0x${string}`,
    });
  } catch {
    ok = false;
  }
  if (!ok)
    return { tier: "anon", key: fallbackKey, allow: allowanceOf("anon") };

  const cached = seen.get(addr);
  if (cached && now - cached.at < REMEMBER)
    return { tier: cached.tier, key: addr, allow: cached.allow };

  const { balance, used } = await holdings(addr);
  const tier: Tier = balance > 0n || used ? "onchain" : "wallet";
  // what the faucet gave becomes the size of the allowance; a wallet that has been used but
  // holds nothing keeps the floor rather than dropping back to an unproven one
  const allow =
    tier === "onchain" ? creditAllowance(balance) : allowanceOf("wallet");
  seen.set(addr, { tier, allow, at: now });
  return { tier, key: addr, allow };
}
