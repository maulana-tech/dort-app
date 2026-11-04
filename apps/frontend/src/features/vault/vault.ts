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

/**
 * Portaldot V3, spelled out rather than imported from features/bridge for the same reason
 * features/swap spells it out: this file is pure and Node runs it for vault.check.ts, which
 * cannot resolve the `@/` alias. The check reads the bridge's own PORTALDOT_ID and fails if the
 * two ever disagree.
 */
export const VAULT_PORTALDOT = 420420777;

/**
 * Portal USDT on Portaldot V3: a real 6-decimal ERC-20 already live on the chain — the same
 * token /swap trades, read off the live deployment. It is the asset a vault here is built over,
 * because it puts the whole demo on one chain: faucet POT, swap it for pUSDT, deposit. A vault
 * on a home chain would need a second chain, a second faucet and a second native coin for gas.
 * vault.check.ts pins this address against features/swap's own token list.
 */
export const PORTALDOT_USDT =
  "0xe0114Adc0a2072B602C645f5a07EeFA1eaDBDbc2" as const;

/**
 * Circle's own USDC on Base Sepolia — six decimals, like pUSDT, and the asset a vault there is
 * built over. Base Sepolia is the second chain because the vault is the one on-chain feature
 * that has no second end: the same contract deployed twice is simply available in two places,
 * which is worth having while Portaldot's own faucet is handed out by an admin.
 */
export const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

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
 * rather than a label.
 *
 * `vault: null` is the honest middle state: the asset is a real address on a real chain, the
 * vault over it is not deployed. `vaultReady` reports that as unusable, so the page names the
 * asset and says plainly that nothing is deployed instead of guessing at an address. Fill the
 * `vault` field from what script/DeployVault.s.sol prints; nothing else here has to change.
 */
export const VAULTS: Record<number, VaultDeployment[]> = {
  [VAULT_PORTALDOT]: [
    {
      vault: null,
      asset: PORTALDOT_USDT,
      symbol: "pUSDT",
      shareSymbol: "dpUSDT",
      decimals: 6,
    },
  ],
  84532: [
    {
      // deployed 2026-11-02, block 53482026, tx 0x2aafcfaa…04e8d
      //
      // Funded for real on 2026-11-04: 20 USDC in at block 54377074,
      // tx 0xa89a75c364ac9a2d201bbfac93951295acfca4aac974c3267318b9b307ec5a44
      // (the approve before it, block 54376967, tx 0x113aa3ba…d5e5c). It minted
      // 20,000,000,000 shares — the 10**3 virtual offset against the first-depositor
      // attack is why that is not 20,000,000 — and previewRedeem on all of them returns
      // exactly 20,000,000 back, so the first deposit into an empty vault lost nothing to
      // rounding. Gas for both: 0.00000107 ETH.
      vault: "0x162Dcf95Eb9df70F314CD4648565E6eb24f85aF8",
      asset: BASE_SEPOLIA_USDC,
      symbol: "USDC",
      shareSymbol: "dUSDC",
      decimals: 6,
    },
  ],
};

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
export const vaultsFor = (chain: number, local: boolean): VaultDeployment[] =>
  local ? LOCAL_VAULTS : (VAULTS[chain] ?? []);

/**
 * The vault for one asset, or the first on the chain when no symbol is asked for. A chain with
 * nothing deployed returns the empty deployment, which `vaultReady` reports as not usable — the
 * page then shows how to deploy one instead of a dead form.
 */
export const vaultFor = (
  chain: number,
  local: boolean,
  symbol?: string,
): VaultDeployment => {
  const all = vaultsFor(chain, local);
  if (symbol) return all.find((v) => v.symbol === symbol) ?? NOT_DEPLOYED;
  return all[0] ?? NOT_DEPLOYED;
};

export const vaultReady = (d: VaultDeployment): boolean =>
  Boolean(d.vault && d.asset);

/**
 * The chain the page should open on: the first one, in the order the picker lists them, that
 * really has a vault. Without this the page would open on a chain whose form is dead while a
 * live one sits two pills away — and hardcoding the answer would go stale the moment another
 * chain is deployed to. The caller passes the picker's own order, because this file is pure and
 * cannot import the chain list.
 */
export const firstDeployedChain = (order: number[]): number | null =>
  order.find((id) => (VAULTS[id] ?? []).some(vaultReady)) ?? null;

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
  /** the wallet reports the right chain id but has no code at the vault: a different network */
  wrongNetwork?: boolean;
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
  // the id matches and the vault is still not there, which the local demo makes easy to hit:
  // anvil runs under a real chain's id, so a wallet on the real testnet looks correct and is not
  if (s.wrongNetwork)
    return {
      label: "Wallet is on another network",
      disabled: true,
      why: `Your wallet says ${s.chainName}, but it cannot see the vault. Point it at the node this page is reading — for the local demo, the RPC is http://127.0.0.1:8545.`,
    };
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
