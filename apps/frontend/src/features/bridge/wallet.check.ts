// node --experimental-strip-types src/features/bridge/wallet.check.ts
import assert from "node:assert/strict";
import {
  codeMissing,
  connectLabel,
  type DiscoveredWallet,
  INJECTED,
  INJECTED_RDNS,
  INSTALL,
  mergeWallet,
  orderWallets,
  pickWallet,
  unknownChain,
} from "./wallet.ts";

const w = (rdns: string, name = rdns): DiscoveredWallet => ({
  info: { uuid: `u-${rdns}`, name, icon: "", rdns },
  // the provider is never called here; these tests are about identity and order only
  provider: {} as DiscoveredWallet["provider"],
});

const mm = w("io.metamask", "MetaMask");
const rabby = w("io.rabby", "Rabby");
const injected = {
  info: INJECTED,
  provider: {} as DiscoveredWallet["provider"],
};

// ── merging announcements ──────────────────────────────────────────────────────────────────
let list: DiscoveredWallet[] = [];
list = mergeWallet(list, mm);
list = mergeWallet(list, rabby);
assert.deepEqual(
  list.map((x) => x.info.rdns),
  ["io.metamask", "io.rabby"],
  "announcements keep the order they arrived in",
);

// wallets re-announce on every request; that must not grow the list
const mmAgain = w("io.metamask", "MetaMask");
list = mergeWallet(list, mmAgain);
assert.equal(list.length, 2, "a repeat announcement replaces, never appends");
assert.equal(
  list[0].info.uuid,
  mmAgain.info.uuid,
  "and the fresh provider wins, since the old one may be dead",
);
assert.equal(
  list[0].info.rdns,
  "io.metamask",
  "in place, not moved to the end",
);

// ── ordering ───────────────────────────────────────────────────────────────────────────────
const three = [mm, injected, rabby];
assert.deepEqual(
  orderWallets(three, null).map((x) => x.info.rdns),
  ["io.metamask", "io.rabby", INJECTED_RDNS],
  "the bare window.ethereum always sinks to the bottom",
);
assert.deepEqual(
  orderWallets(three, "io.rabby").map((x) => x.info.rdns),
  ["io.rabby", "io.metamask", INJECTED_RDNS],
  "the remembered wallet comes first",
);
assert.deepEqual(
  orderWallets(three, INJECTED_RDNS).map((x) => x.info.rdns),
  [INJECTED_RDNS, "io.metamask", "io.rabby"],
  "unless the remembered one IS the bare provider",
);
assert.deepEqual(
  orderWallets([], "io.rabby"),
  [],
  "nothing to order is not an error",
);

// ── picking ────────────────────────────────────────────────────────────────────────────────
assert.equal(pickWallet(three, "io.rabby", null)?.info.rdns, "io.rabby");
assert.equal(
  pickWallet(three, null, "io.rabby")?.info.rdns,
  "io.rabby",
  "with no explicit ask, the remembered one is used",
);
assert.equal(
  pickWallet(three, null, "io.nope")?.info.rdns,
  "io.metamask",
  "a remembered wallet that is gone falls back to the first announced",
);
assert.equal(
  pickWallet(three, "io.nope", "io.rabby"),
  null,
  "but an explicit ask for a wallet that is not there picks nothing, never a surprise wallet",
);
assert.equal(pickWallet([], null, null), null);

// ── the button's own words ─────────────────────────────────────────────────────────────────
assert.equal(connectLabel([], false), "No wallet found");
assert.equal(connectLabel([mm], false), "Connect MetaMask");
assert.equal(
  connectLabel(three, false),
  "Connect wallet",
  "with several, the button opens the picker rather than naming one",
);
assert.equal(connectLabel(three, true), "Connecting…");
assert.ok(
  INSTALL.every((i) => i.url.startsWith("https://")),
  "every install link is https",
);

// ── the local-demo trap ────────────────────────────────────────────────────────────────────
assert.equal(
  codeMissing("0x"),
  true,
  "no code: the wallet is on another network",
);
assert.equal(
  codeMissing("0x0"),
  true,
  "some nodes answer 0x0 for the same thing",
);
assert.equal(codeMissing("0x60806040"), false);
assert.equal(
  codeMissing(null),
  false,
  "not asked yet is not the same as empty — the page must not warn before it knows",
);

console.log("wallet ok");

// unknownChain: a wallet that has never heard of the chain. MetaMask answers 4902, but wraps it,
// and the wrapped form is the one that was missed in the field (Base Sepolia on a fresh install).
assert.equal(unknownChain({ code: 4902 }), true);
assert.equal(
  unknownChain({ code: -32603, data: { originalError: { code: 4902 } } }),
  true,
  "MetaMask wraps the provider error; the real code is under data.originalError",
);
assert.equal(
  unknownChain({ message: 'Unrecognized chain ID "0x14a34".' }),
  true,
  "last resort: a wallet that sends neither code",
);
assert.equal(
  unknownChain({ code: 4001 }),
  false,
  "user rejected is not a missing chain",
);
assert.equal(
  unknownChain({ code: -32603 }),
  false,
  "a bare internal error is not a missing chain",
);
assert.equal(unknownChain(null), false);
assert.equal(unknownChain(undefined), false);
assert.equal(unknownChain({ message: "insufficient funds" }), false);
