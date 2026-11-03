import { type Abi, toFunctionSelector } from "viem";
import { ERC20_ABI, ESCROW_ABI, MINTER_ABI } from "@/features/bridge/abi";
import { FACTORY_ABI, PAIR_ABI, ROUTER_ABI } from "@/features/swap/abi";
import { VAULT_ABI } from "@/features/vault/abi";

/**
 * 4-byte selector → signature, for every function Dort already carries an ABI for.
 *
 * This is deliberately *only* what the app knows: ERC-20, the vault, the bridge's escrow and
 * minter, and PortalSwapRouter's three contracts. A call into anything else keeps its raw
 * selector in the trace, because a guessed function name in an audit tool is worse than four
 * honest bytes — the reader would build on it.
 *
 * Built once, lazily: a dozen ABIs hashed on every render would be wasted work.
 */
const ABIS: Abi[] = [
  ERC20_ABI,
  VAULT_ABI,
  ESCROW_ABI,
  MINTER_ABI,
  ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
] as Abi[];

let built: Record<string, string> | null = null;

export function knownSelectors(): Record<string, string> {
  if (built) return built;
  const map: Record<string, string> = {};
  for (const abi of ABIS)
    for (const item of abi) {
      if (item.type !== "function") continue;
      const sig = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
      try {
        map[toFunctionSelector(sig)] = sig;
      } catch {
        // an ABI entry viem cannot hash is skipped rather than failing the page
      }
    }
  built = map;
  return map;
}
