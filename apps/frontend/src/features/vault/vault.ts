import type { HomeChainId } from "@/features/bridge/chains";

/**
 * Deposit and withdraw against DortSafeVault (foundry/src/DortSafeVault.sol) — the vault written
 * correctly, not the deliberately flawed sample. The rules here mirror the contract's, so the
 * page can tell the user what will happen before they sign:
 *
 * - a deposit mints shares priced on the balance BEFORE the transfer, rounded down
 * - a withdraw burns shares rounded up
 * - both are refused while the vault is paused
 *
 * The share maths below is the contract's, including the virtual offset. It is here so previews
 * are instant and honest; the chain remains the authority.
 */

export const OFFSET = 3n;

export type VaultDeployment = {
  vault: `0x${string}` | null;
  asset: `0x${string}` | null;
  symbol: string;
  shareSymbol: string;
  decimals: number;
};

const NOT_DEPLOYED: VaultDeployment = {
  vault: null,
  asset: null,
  symbol: "USDC",
  shareSymbol: "dUSDC",
  decimals: 6,
};

/**
 * The vaults on each chain — one per asset, which is what makes the token picker a real choice
 * rather than a label. None is deployed on a testnet yet, so the page says so rather than
 * guessing at an address.
 */
export const VAULTS: Record<number, VaultDeployment[]> = {};

/**
 * `bash script/vault-local-demo.sh` deploys exactly these, in this order, on a fresh anvil:
 * MockUSDC, its vault, MockToken(USDT), its vault. The addresses are anvil's deterministic ones
 * for nonces 0–3 from its first account.
 */
export const LOCAL_VAULTS: VaultDeployment[] = [
  {
    asset: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    vault: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    symbol: "USDC",
    shareSymbol: "dUSDC",
    decimals: 6,
  },
  {
    asset: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    vault: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    symbol: "USDT",
    shareSymbol: "dUSDT",
    decimals: 6,
  },
];

/** The one the page opens on. */
export const LOCAL_VAULT: VaultDeployment = LOCAL_VAULTS[0];

/** Every vault the page can offer on this chain, in the order the picker lists them. */
export const vaultsFor = (
  chain: HomeChainId | number,
  local: boolean,
): VaultDeployment[] => (local ? LOCAL_VAULTS : (VAULTS[chain] ?? []));

/**
 * The vault for one asset, or the first on the chain when no symbol is asked for. A chain with
 * nothing deployed returns the empty deployment, which `vaultReady` reports as not usable — the
 * page then shows how to deploy one instead of a dead form.
 */
export const vaultFor = (
  chain: HomeChainId | number,
  local: boolean,
  symbol?: string,
): VaultDeployment => {
  const all = vaultsFor(chain, local);
  if (symbol) return all.find((v) => v.symbol === symbol) ?? NOT_DEPLOYED;
  return all[0] ?? NOT_DEPLOYED;
};

export const vaultReady = (d: VaultDeployment): boolean =>
  Boolean(d.vault && d.asset);

/** DortSafeVault._toShares, rounding down (a deposit) or up (a withdraw). */
export function toShares(
  assets: bigint,
  totalSupply: bigint,
  totalAssets: bigint,
  roundUp = false,
): bigint {
  const supply = totalSupply + 10n ** OFFSET;
  const held = totalAssets + 1n;
  const q = (assets * supply) / held;
  return roundUp && q * held < assets * supply ? q + 1n : q;
}

/** DortSafeVault._toAssets, rounding down (a redeem) or up (a mint). */
export function toAssets(
  shares: bigint,
  totalSupply: bigint,
  totalAssets: bigint,
  roundUp = false,
): bigint {
  const supply = totalSupply + 10n ** OFFSET;
  const held = totalAssets + 1n;
  const q = (shares * held) / supply;
  return roundUp && q * supply < shares * held ? q + 1n : q;
}

/**
 * Shares a deposit mints. The contract prices against the balance *before* the transfer, so a
 * preview that uses the balance after would promise too few.
 */
export const previewDeposit = (
  assets: bigint,
  totalSupply: bigint,
  totalAssets: bigint,
): bigint => toShares(assets, totalSupply, totalAssets);

/** Shares a withdraw burns: rounded up, against the caller. */
export const previewWithdraw = (
  assets: bigint,
  totalSupply: bigint,
  totalAssets: bigint,
): bigint => toShares(assets, totalSupply, totalAssets, true);

/** What a holding is worth right now. */
export const previewRedeem = (
  shares: bigint,
  totalSupply: bigint,
  totalAssets: bigint,
): bigint => toAssets(shares, totalSupply, totalAssets);

export type Side = "deposit" | "withdraw";

/**
 * Which unit the amount is in, on the withdraw side.
 *
 * It is a real choice, not a display preference: `assets` calls withdraw() and takes an exact
 * number of USDC, burning however many shares that costs rounded up; `shares` calls redeem() and
 * burns an exact number of shares. Only the second can empty a position completely — an exact
 * withdraw of everything a holding is worth can cost one share more than the holder has, because
 * the value rounds down and the share cost rounds up.
 */
export type Unit = "assets" | "shares";

export type VaultStep = "idle" | "approve" | "submit" | "done" | "error";

/**
 * What the one button says, and whether it can be pressed. Connecting outranks everything, the
 * same rule the bridge learned: a page with nothing deployed must still let a wallet in.
 */
export function vaultAction(s: {
  connected: boolean;
  deployed: boolean;
  onRightChain: boolean;
  paused: boolean;
  side: Side;
  amount: bigint | null;
  balance: bigint | null;
  needsApproval: boolean;
  step: VaultStep;
  chainName: string;
  /** withdraw only; "shares" burns an exact number of them instead of taking exact assets */
  unit?: Unit;
}): { label: string; disabled: boolean; why?: string } {
  if (!s.connected) return { label: "Connect wallet", disabled: false };
  if (!s.deployed)
    return {
      label: "No vault on this chain",
      disabled: true,
      why: "Deploy it with script/DeployVault.s.sol, or start the local demo.",
    };
  if (!s.onRightChain)
    return { label: `Switch to ${s.chainName}`, disabled: false };
  if (s.paused)
    return {
      label: "Vault paused",
      disabled: true,
      why: "The owner paused it.",
    };
  if (s.step === "approve") return { label: "Approving…", disabled: true };
  if (s.step === "submit")
    return { label: "Confirm in wallet…", disabled: true };
  if (s.amount === null) return { label: "Enter an amount", disabled: true };
  if (s.balance !== null && s.amount > s.balance)
    return { label: "Not enough balance", disabled: true };
  if (s.side === "deposit" && s.needsApproval)
    return { label: "Approve, then deposit", disabled: false };
  if (s.side === "withdraw")
    return {
      label: s.unit === "shares" ? "Redeem" : "Withdraw",
      disabled: false,
    };
  return { label: "Deposit", disabled: false };
}
