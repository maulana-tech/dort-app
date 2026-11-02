import { defineChain } from "viem";

/**
 * The chains the bridge can join. Portaldot V3 is always one end — it is the chain Dort is built
 * for — and the other end is any testnet the exporter already forks (foundry/dort-chains.mjs).
 * bridge.check.ts keeps the two lists in step, so a chain can never appear here with an id the
 * exporter disagrees with.
 *
 * A home chain is only usable once an escrow is deployed on it (DEPLOYMENTS in bridge.ts); until
 * then the picker still lists it and the page says plainly that nothing is deployed there.
 */
export const PORTALDOT_ID = 420420777;

export const portaldotV3 = defineChain({
  id: PORTALDOT_ID,
  name: "Portaldot V3 Testnet",
  nativeCurrency: { name: "POT", symbol: "POT", decimals: 18 },
  rpcUrls: { default: { http: ["https://test-evm-rpc-v3.portaldot.dev"] } },
  blockExplorers: {
    default: {
      name: "Node console",
      url: "https://node-console.portaldot.dev",
    },
  },
  testnet: true,
});

/** One entry per chain the exporter forks, minus Portaldot itself. */
const HOME = [
  {
    id: 11155111,
    key: "sepolia",
    name: "Ethereum Sepolia",
    family: "ethereum",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    symbol: "ETH",
    explorer: "https://sepolia.etherscan.io",
  },
  {
    id: 421614,
    key: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    family: "arbitrum",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    symbol: "ETH",
    explorer: "https://sepolia.arbiscan.io",
  },
  {
    id: 84532,
    key: "base-sepolia",
    name: "Base Sepolia",
    family: "base",
    rpc: "https://sepolia.base.org",
    symbol: "ETH",
    explorer: "https://sepolia.basescan.org",
  },
  {
    id: 46630,
    key: "robinhood-testnet",
    name: "Robinhood Chain Testnet",
    family: "robinhood",
    rpc: "https://rpc.testnet.chain.robinhood.com",
    symbol: "ETH",
    explorer: null,
  },
  {
    id: 998,
    key: "hyperevm-testnet",
    name: "HyperEVM Testnet",
    family: "hyperliquid",
    rpc: "https://rpc.hyperliquid-testnet.xyz/evm",
    symbol: "HYPE",
    explorer: null,
  },
  {
    id: 42431,
    key: "tempo-testnet",
    name: "Tempo Testnet (Moderato)",
    family: "tempo",
    rpc: "https://rpc.moderato.tempo.xyz",
    symbol: "TEMPO",
    explorer: null,
  },
] as const;

export type HomeChainId = (typeof HOME)[number]["id"];
export type BridgeChainId = HomeChainId | typeof PORTALDOT_ID;

/** Where the page opens: Base Sepolia has the friendliest faucet of the six. */
export const DEFAULT_HOME: HomeChainId = 84532;

const homeChains = Object.fromEntries(
  HOME.map((c) => [
    c.id,
    defineChain({
      id: c.id,
      name: c.name,
      nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals: 18 },
      rpcUrls: { default: { http: [c.rpc] } },
      ...(c.explorer
        ? { blockExplorers: { default: { name: "Explorer", url: c.explorer } } }
        : {}),
      testnet: true,
    }),
  ]),
);

export const CHAINS: Record<number, ReturnType<typeof defineChain>> = {
  ...homeChains,
  [PORTALDOT_ID]: portaldotV3,
};

/** Every home chain, in the order the exporter lists them, for the picker. */
export const HOME_CHAINS = HOME.map((c) => ({
  id: c.id as HomeChainId,
  key: c.key,
  name: c.name,
  family: c.family,
}));

/** Chain id → the family name ChainLogo draws. */
export const FAMILY: Record<number, string> = {
  ...Object.fromEntries(HOME.map((c) => [c.id, c.family])),
  [PORTALDOT_ID]: "portaldot",
};

/**
 * Where a vault can live. A vault is one contract on one chain — unlike the bridge it has no
 * second end — so Portaldot itself is a candidate here, and the first one: it is the chain Dort
 * is built for, and the chain /swap already trades on, so a single faucet covers both getting
 * the asset and paying for the deposit. The home chains follow, for a vault deployed beside a
 * bridge escrow.
 */
export const VAULT_CHAINS: {
  id: BridgeChainId;
  key: string;
  name: string;
  family: string;
}[] = [
  {
    id: PORTALDOT_ID,
    key: "portaldot-testnet",
    name: "Portaldot V3 Testnet",
    family: "portaldot",
  },
  ...HOME_CHAINS,
];

export const isHomeChain = (id: number | undefined): id is HomeChainId =>
  HOME.some((c) => c.id === id);

export const isBridgeChain = (id: number | undefined): id is BridgeChainId =>
  id === PORTALDOT_ID || isHomeChain(id);

export const chainName = (id: number): string =>
  CHAINS[id]?.name ?? `chain ${id}`;

/** `wallet_addEthereumChain` needs the chain spelled out; no wallet knows Portaldot yet. */
export function addChainParams(id: BridgeChainId) {
  const c = CHAINS[id];
  return {
    chainId: `0x${id.toString(16)}`,
    chainName: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: [...c.rpcUrls.default.http],
    blockExplorerUrls: c.blockExplorers ? [c.blockExplorers.default.url] : [],
  };
}

/** A transaction's page on that chain's explorer, or null where there is none to link to. */
export function txUrl(id: BridgeChainId, hash: string): string | null {
  const base = CHAINS[id]?.blockExplorers?.default.url;
  if (!base || id === PORTALDOT_ID) return null; // the node console has no per-tx page
  return `${base}/tx/${hash}`;
}

/**
 * Where script/bridge-local-demo.sh puts its two anvil chains. Picking the local demo has to move
 * the RPC too, not just the addresses, or the page would read the real testnets at addresses that
 * hold nothing there.
 */
/**
 * The chain id script/vault-local-demo.sh runs its anvil under. The demo borrows a real chain's
 * id so the page and the wallet can agree on it, and LOCAL_RPC maps that id to the port anvil
 * listens on — so selecting the local demo on the Vault page has to move the chain too, not
 * merely flip a flag. vault.check.ts holds this against the script's own --chain-id.
 */
export const LOCAL_VAULT_CHAIN: HomeChainId = 84532;

export const LOCAL_RPC: Record<number, string> = {
  84532: "http://127.0.0.1:8545",
  [PORTALDOT_ID]: "http://127.0.0.1:8546",
};
