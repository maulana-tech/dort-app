// node --experimental-strip-types src/features/bridge/bridge.check.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  action,
  DEPLOYMENTS,
  deploymentFor,
  directionOf,
  formatAmount,
  LOCAL_DEMO,
  messageId,
  parseAmount,
  ready,
  route,
  shortAddress,
} from "./bridge.ts";
import {
  DEFAULT_HOME,
  HOME_CHAINS,
  isBridgeChain,
  isHomeChain,
  PORTALDOT_ID,
} from "./chains.ts";

// the page's chains are the exporter's chains (foundry/dort-chains.mjs)
const { CHAINS } = (await import(
  new URL("../../../../../foundry/dort-chains.mjs", import.meta.url).href
)) as { CHAINS: Record<string, { name: string; id: number }> };
assert.equal(CHAINS["portaldot-testnet"].id, PORTALDOT_ID);
// every home chain the bridge offers is one the exporter knows, with the same id
for (const h of HOME_CHAINS) {
  const fromExporter = CHAINS[h.key];
  assert.ok(fromExporter, `exporter has no chain "${h.key}"`);
  assert.equal(fromExporter.id, h.id, `${h.key} id`);
  assert.equal(fromExporter.name, h.name, `${h.key} name`);
}
// Portaldot is the destination, never a home chain. (The types already rule this out, so the
// check is on the ids as numbers: it would catch a hand-edited entry that types cannot see.)
assert.ok(!HOME_CHAINS.some((c) => (c.id as number) === PORTALDOT_ID));
assert.equal(HOME_CHAINS.length, Object.keys(CHAINS).length - 1);

// a transfer always has two different ends
assert.ok(isBridgeChain(PORTALDOT_ID) && isBridgeChain(DEFAULT_HOME));
assert.ok(!isBridgeChain(1));
assert.ok(isHomeChain(DEFAULT_HOME) && !isHomeChain(PORTALDOT_ID));
assert.equal(directionOf(PORTALDOT_ID), "toHome");
assert.equal(directionOf(DEFAULT_HOME), "toPortaldot");
// a route always joins the chosen home chain to Portaldot, whichever home chain that is
for (const h of HOME_CHAINS) {
  assert.deepEqual(route("toPortaldot", h.id), {
    from: h.id,
    to: PORTALDOT_ID,
  });
  assert.deepEqual(route("toHome", h.id), { from: PORTALDOT_ID, to: h.id });
}

// ── the id must be the one the contracts compute, not merely the one we like ────────────────
// cast is Foundry's own encoder; if this page and Solidity ever disagree, a transfer is lost.
const args = {
  srcChainId: 84532n,
  dstChainId: 420420777n,
  nonce: 7n,
  token: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`,
  recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
  amount: 250000000n,
};
const mine = messageId(args);
try {
  const cast = execFileSync(
    "cast",
    [
      "keccak",
      execFileSync(
        "cast",
        [
          "abi-encode",
          "f(uint256,uint256,uint256,address,address,uint256)",
          String(args.srcChainId),
          String(args.dstChainId),
          String(args.nonce),
          args.token,
          args.recipient,
          String(args.amount),
        ],
        { encoding: "utf8" },
      ).trim(),
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(
    mine,
    cast,
    "messageId matches Solidity's abi.encode + keccak256",
  );
} catch (e) {
  if ((e as { code?: string }).code !== "ENOENT") throw e;
  // no forge on PATH (CI without the toolchain): the shape still has to hold
  assert.match(mine, /^0x[0-9a-f]{64}$/);
}

// ── amounts ─────────────────────────────────────────────────────────────────────────────────
assert.equal(parseAmount("1", 6), 1_000_000n);
assert.equal(parseAmount("0.5", 6), 500_000n);
assert.equal(parseAmount("250.123456", 6), 250_123_456n);
assert.equal(parseAmount(" 2 ", 6), 2_000_000n);
assert.equal(parseAmount("", 6), null);
assert.equal(parseAmount("0", 6), null, "zero is not a transfer");
assert.equal(
  parseAmount("0.0000001", 6),
  null,
  "finer than the token's decimals",
);
assert.equal(parseAmount("1e6", 6), null, "no exponents");
assert.equal(parseAmount("-1", 6), null);
assert.equal(parseAmount("abc", 6), null);

assert.equal(formatAmount(1_000_000n, 6), "1");
assert.equal(formatAmount(1_500_000n, 6), "1.5");
assert.equal(formatAmount(0n, 6), "0");
assert.equal(formatAmount(1n, 18), "0");
assert.equal(formatAmount(123_456_789n, 6), "123.456789");
assert.equal(
  shortAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
  "0xf39F…2266",
);

// ── deployment gating ───────────────────────────────────────────────────────────────────────
// nothing is claimed deployed before it is, on any chain
for (const h of HOME_CHAINS)
  assert.equal(
    ready(DEPLOYMENTS[h.id]),
    false,
    `${h.key} must not claim a deployment`,
  );
assert.equal(ready(LOCAL_DEMO), true);
assert.equal(ready(deploymentFor(DEFAULT_HOME, false)), false);
assert.equal(
  ready(deploymentFor(DEFAULT_HOME, true)),
  true,
  "local demo is usable",
);

// ── the one button ──────────────────────────────────────────────────────────────────────────
const base = {
  connected: true,
  deployed: true,
  onRightChain: true,
  paused: false,
  amount: 100n,
  balance: 1000n,
  allowance: 1000n,
  needsApproval: false,
  step: "idle" as const,
  chainName: "Portaldot V3 Testnet",
};
assert.equal(action(base).label, "Bridge");
assert.equal(action(base).disabled, false);
assert.equal(action({ ...base, deployed: false }).disabled, true);
assert.match(
  action({ ...base, deployed: false }).why ?? "",
  /Deploy both sides/,
);
assert.equal(action({ ...base, connected: false }).label, "Connect wallet");
assert.match(
  action({ ...base, onRightChain: false }).label,
  /Switch to Portaldot/,
);
assert.equal(action({ ...base, paused: true }).disabled, true);
assert.equal(action({ ...base, amount: null }).label, "Enter an amount");
assert.equal(action({ ...base, amount: 2000n }).label, "Not enough balance");
assert.equal(
  action({ ...base, needsApproval: true }).label,
  "Approve, then bridge",
);
assert.equal(action({ ...base, step: "relaying" }).disabled, true);
// Connecting outranks every other state. This is the regression that locked the page: with the
// deployment checked first, the button read "Not deployed yet" and was disabled, so a wallet
// could never be connected at all — on a chain with no escrow, the page offered no way in.
assert.equal(
  action({ ...base, connected: false, amount: null }).label,
  "Connect wallet",
);
assert.equal(
  action({ ...base, connected: false, deployed: false }).label,
  "Connect wallet",
  "a missing deployment must never block connecting a wallet",
);
assert.equal(
  action({ ...base, connected: false, deployed: false }).disabled,
  false,
  "the connect button must be pressable",
);

console.log("bridge ok");
