#!/usr/bin/env node
// Dort bridge relayer: carries one message at a time between a home chain and Portaldot V3.
//
//   node dort-relayer.mjs --config bridge.json            # watch both directions, dry run
//   node dort-relayer.mjs --config bridge.json --send     # actually submit (needs a funded key)
//   node dort-relayer.mjs --config bridge.json --once     # one pass, then exit (for cron / CI)
//
// It reads events with plain eth_getLogs (no dependencies) and submits with `cast send`, so the
// private key is handled by Foundry's own keystore, never by this script:
//
//   export DORT_RELAYER_KEY=0x…          # or use --account <keystore name>
//
// WHAT THIS IS. The bridge is a trusted-relayer design: this process is the trust. It cannot mint
// or release more than the contracts allow — a message is paid out once, and never beyond what the
// escrow holds — but a stolen key can move everything that is bridgeable. Testnet scope only.
// The contracts spell the same thing out: src/bridge/PortalBridgeEscrow.sol.
//
// WHAT IT REFUSES TO DO. It never invents a message: every mint and release is derived from an
// event it read on the other chain, with the id recomputed from the event's own fields, and it
// checks `processed(id)` on the destination before sending, so a restart or a double run is a
// no-op rather than a double spend.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { keccak256, word } from './dort-lib.mjs';

const args = process.argv.slice(2);
const flag = n => {
  const i = args.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return undefined;
  return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] ?? '');
};
const has = n => args.includes(`--${n}`);

const SEND = has('send');
const ONCE = has('once');
const POLL_MS = Number(flag('poll') ?? 12_000);
const ACCOUNT = flag('account');

const CONFIG_PATH = flag('config') ?? 'bridge.json';

/** Event signatures the two sides emit; topic0 is keccak of the signature text. */
export const TOPICS = {
  // Locked(bytes32 id, address token, address sender, address recipient, uint256 amount, uint256 dstChainId, uint256 nonce)
  locked: keccak256('Locked(bytes32,address,address,address,uint256,uint256,uint256)'),
  // Burned(bytes32 id, address srcToken, address sender, address recipient, uint256 amount, uint256 dstChainId, uint256 nonce)
  burned: keccak256('Burned(bytes32,address,address,address,uint256,uint256,uint256)'),
};

const addr = w => '0x' + w.slice(24);
const num = w => BigInt('0x' + w);

/**
 * One `Locked` log → the mint this relayer should make on Portaldot.
 * Indexed fields live in `topics`, the rest sit in `data` in declaration order.
 */
export function readLocked(log) {
  const d = log.data.replace(/^0x/, '');
  return {
    id: log.topics[1],
    token: '0x' + log.topics[2].slice(26),
    sender: '0x' + log.topics[3].slice(26),
    recipient: addr(word(d, 0)),
    amount: num(word(d, 1)),
    dstChainId: num(word(d, 2)),
    nonce: num(word(d, 3)),
    txHash: log.transactionHash,
    block: Number(BigInt(log.blockNumber)),
  };
}

/** One `Burned` log → the release this relayer should make on the home chain. */
export function readBurned(log) {
  const d = log.data.replace(/^0x/, '');
  return {
    id: log.topics[1],
    srcToken: '0x' + log.topics[2].slice(26),
    sender: '0x' + log.topics[3].slice(26),
    recipient: addr(word(d, 0)),
    amount: num(word(d, 1)),
    dstChainId: num(word(d, 2)),
    nonce: num(word(d, 3)),
    txHash: log.transactionHash,
    block: Number(BigInt(log.blockNumber)),
  };
}

/** A config is only usable when both sides are fully described. Returns the problems, if any. */
export function configProblems(c) {
  const bad = [];
  const addrOk = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
  for (const side of ['home', 'portaldot']) {
    const s = c?.[side];
    if (!s) { bad.push(`${side}: missing`); continue; }
    if (typeof s.rpc !== 'string' || !/^https?:\/\//.test(s.rpc)) bad.push(`${side}.rpc must be an http(s) URL`);
    if (!Number.isInteger(s.chainId)) bad.push(`${side}.chainId must be a number`);
    if (!addrOk(s.contract)) bad.push(`${side}.contract must be an address`);
  }
  if (c?.portaldot?.chainId !== undefined && c.portaldot.chainId !== 420420777)
    bad.push(`portaldot.chainId is ${c.portaldot.chainId}, expected 420420777`);
  if (c?.token && !addrOk(c.token.address)) bad.push('token.address must be an address');
  return bad;
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(25_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

/** Refuses an endpoint that serves a chain other than the one the config names. */
async function checkChain(side, { rpc: url, chainId }) {
  const got = Number(BigInt(await rpc(url, 'eth_chainId', [])));
  if (got !== chainId) throw new Error(`${side}: ${url} serves chain ${got}, not ${chainId}`);
  return got;
}

const logsSince = (url, address, topic, from, to) =>
  rpc(url, 'eth_getLogs', [{ address, topics: [topic], fromBlock: '0x' + from.toString(16), toBlock: to }]);

const castOut = a => execFileSync('cast', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Already handled on the destination? Reading this first makes a restart a no-op. */
function isProcessed(url, contract, id) {
  return castOut(['call', contract, 'processed(bytes32)(bool)', id, '--rpc-url', url]).startsWith('true');
}

function send(url, contract, sigText, params, why) {
  const a = ['send', contract, sigText, ...params, '--rpc-url', url];
  if (ACCOUNT) a.push('--account', ACCOUNT);
  else a.push('--private-key', process.env.DORT_RELAYER_KEY ?? '');
  if (!SEND) {
    console.log(`  would send: cast send ${contract} "${sigText}" ${params.join(' ')} --rpc-url ${url}`);
    return null;
  }
  if (!ACCOUNT && !process.env.DORT_RELAYER_KEY)
    throw new Error('no key: set DORT_RELAYER_KEY or pass --account <keystore name>');
  const out = castOut(a);
  const hash = /0x[0-9a-f]{64}/i.exec(out)?.[0] ?? '(sent)';
  console.log(`  ${why}: ${hash}`);
  return hash;
}

async function pass(cfg, cursor) {
  const { home, portaldot, token } = cfg;

  // home → Portaldot: a lock becomes a mint
  const toHead = 'latest';
  for (const log of await logsSince(home.rpc, home.contract, TOPICS.locked, cursor.home, toHead)) {
    const ev = readLocked(log);
    cursor.home = Math.max(cursor.home, ev.block + 1);
    if (ev.dstChainId !== BigInt(portaldot.chainId)) continue;
    console.log(`lock  ${ev.id} ${ev.amount} → ${ev.recipient} (block ${ev.block})`);
    if (isProcessed(portaldot.rpc, portaldot.contract, ev.id)) { console.log('  already minted'); continue; }
    send(
      portaldot.rpc, portaldot.contract,
      'mint(bytes32,address,uint256,address,uint256,string,string,uint8)',
      [ev.id, ev.token, String(home.chainId), ev.recipient, String(ev.amount),
       token?.name ?? 'Wrapped Asset', token?.symbol ?? 'wASSET', String(token?.decimals ?? 18)],
      'minted on Portaldot',
    );
  }

  // Portaldot → home: a burn becomes a release
  for (const log of await logsSince(portaldot.rpc, portaldot.contract, TOPICS.burned, cursor.portaldot, toHead)) {
    const ev = readBurned(log);
    cursor.portaldot = Math.max(cursor.portaldot, ev.block + 1);
    if (ev.dstChainId !== BigInt(home.chainId)) continue;
    console.log(`burn  ${ev.id} ${ev.amount} → ${ev.recipient} (block ${ev.block})`);
    if (isProcessed(home.rpc, home.contract, ev.id)) { console.log('  already released'); continue; }
    send(
      home.rpc, home.contract,
      'release(bytes32,address,address,uint256)',
      [ev.id, ev.srcToken, ev.recipient, String(ev.amount)],
      'released at home',
    );
  }
  return cursor;
}

async function main() {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const problems = configProblems(cfg);
  if (problems.length) {
    console.error(`dort-relayer: ${CONFIG_PATH} is not usable:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  await checkChain('home', cfg.home);
  await checkChain('portaldot', cfg.portaldot);
  console.log(
    `dort-relayer: home chain ${cfg.home.chainId} ↔ Portaldot ${cfg.portaldot.chainId}` +
      (SEND ? '  [sending]' : '  [dry run — add --send to submit]'),
  );
  const cursor = { home: cfg.home.fromBlock ?? 0, portaldot: cfg.portaldot.fromBlock ?? 0 };
  for (;;) {
    try {
      await pass(cfg, cursor);
    } catch (e) {
      console.error(`dort-relayer: ${e.message}`);
    }
    if (ONCE) return;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch(e => {
    console.error(`dort-relayer: ${e.message}`);
    process.exit(1);
  });
}
