import { encodeAbiParameters, keccak256 } from "viem";
import {
  type BridgeChainId,
  HOME_CHAINS,
  type HomeChainId,
  PORTALDOT_ID,
} from "./chains.ts";

/**
 * Where each side of the bridge lives. Null until it is deployed — the page then says so plainly
 * instead of pretending. Fill these in from
 * broadcast/DeployBridge.s.sol/<chainid>/run-latest.json after running the deploy script, or
 * point the page at the local demo (script/bridge-local-demo.sh), whose addresses are
 * deterministic because anvil starts from a fresh nonce every time.
 */
export type Deployment = {
  /** PortalBridgeEscrow, on the home chain */
  escrow: `0x${string}` | null;
  /** PortalBridgeMinter, on Portaldot */
  minter: `0x${string}` | null;
  /** the asset that gets bridged, on the home chain */
  token: `0x${string}` | null;
  symbol: string;
  decimals: number;
};

const NOT_DEPLOYED: Deployment = {
  escrow: null,
  minter: null,
  token: null,
  symbol: "USDC",
  decimals: 6,
};

/**
 * One escrow per home chain. Every chain the exporter forks can host one; none is deployed yet,
 * so each entry stays null until `script/DeployBridge.s.sol` is run there and its address from
 * broadcast/DeployBridge.s.sol/<chainid>/run-latest.json is pasted in.
 */
export const DEPLOYMENTS: Record<HomeChainId, Deployment> = Object.fromEntries(
  HOME_CHAINS.map((c) => [c.id, { ...NOT_DEPLOYED }]),
) as Record<HomeChainId, Deployment>;

export const deploymentFor = (home: HomeChainId, local: boolean): Deployment =>
  local ? LOCAL_DEMO : (DEPLOYMENTS[home] ?? NOT_DEPLOYED);

/** `bash script/bridge-local-demo.sh` deploys exactly these, in this order, on a fresh anvil. */
export const LOCAL_DEMO: Deployment = {
  token: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  escrow: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  minter: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  symbol: "USDC",
  decimals: 6,
};

export const ready = (d: Deployment): boolean =>
  Boolean(d.escrow && d.minter && d.token);

/**
 * The same id both contracts compute, recomputed here so the page can show it and follow it to
 * the other chain. Must stay byte-identical to PortalBridgeEscrow.messageId:
 *   keccak256(abi.encode(srcChainId, dstChainId, nonce, token, recipient, amount))
 */
export function messageId(args: {
  srcChainId: bigint;
  dstChainId: bigint;
  nonce: bigint;
  token: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        args.srcChainId,
        args.dstChainId,
        args.nonce,
        args.token,
        args.recipient,
        args.amount,
      ],
    ),
  );
}

/** A decimal string the user typed → base units, or null when it is not a usable amount. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!s || !/^\d*\.?\d*$/.test(s)) return null;
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > decimals) return null; // more precision than the token has
  const units = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  return units > 0n ? units : null;
}

/** Base units → a short decimal string, trailing zeros dropped. */
export function formatAmount(v: bigint, decimals: number, max = 6): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, max);
  frac = frac.replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export const shortAddress = (a: string): string =>
  a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

export type Direction = "toPortaldot" | "toHome";

export const directionOf = (chainId: number): Direction =>
  chainId === PORTALDOT_ID ? "toHome" : "toPortaldot";

/** Which chain a transfer in this direction starts and ends on, for the chosen home chain. */
export function route(
  d: Direction,
  home: HomeChainId,
): {
  from: BridgeChainId;
  to: BridgeChainId;
} {
  return d === "toPortaldot"
    ? { from: home, to: PORTALDOT_ID }
    : { from: PORTALDOT_ID, to: home };
}

export type Step =
  | "idle"
  | "approve"
  | "submit"
  | "relaying"
  | "done"
  | "error";

/**
 * What the one button should say and whether it can be pressed. One place for the whole rule, so
 * the UI never invents its own enabled-state and the check below can pin every case.
 */
export function action(s: {
  connected: boolean;
  deployed: boolean;
  onRightChain: boolean;
  paused: boolean;
  amount: bigint | null;
  balance: bigint | null;
  allowance: bigint | null;
  needsApproval: boolean;
  step: Step;
  chainName: string;
}): { label: string; disabled: boolean; why?: string } {
  // Connecting comes first: a wallet must be reachable even where nothing is deployed, or the
  // page offers no way in at all. (It used to gate on `deployed` here, which locked the button.)
  if (!s.connected) return { label: "Connect wallet", disabled: false };
  if (!s.deployed)
    return {
      label: "Not deployed on this chain",
      disabled: true,
      why: "Deploy both sides with script/DeployBridge.s.sol, pick another home chain, or start the local demo.",
    };
  if (!s.onRightChain)
    return { label: `Switch to ${s.chainName}`, disabled: false };
  if (s.paused)
    return {
      label: "Bridge paused",
      disabled: true,
      why: "The owner paused this side.",
    };
  if (s.step === "approve") return { label: "Approving…", disabled: true };
  if (s.step === "submit")
    return { label: "Confirm in wallet…", disabled: true };
  if (s.step === "relaying")
    return { label: "Waiting for the relayer…", disabled: true };
  if (s.amount === null) return { label: "Enter an amount", disabled: true };
  if (s.balance !== null && s.amount > s.balance)
    return { label: "Not enough balance", disabled: true };
  if (s.needsApproval)
    return { label: "Approve, then bridge", disabled: false };
  return { label: "Bridge", disabled: false };
}
