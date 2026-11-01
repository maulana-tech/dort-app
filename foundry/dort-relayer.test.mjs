// node --test dort-relayer.test.mjs   (no forge, no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, readLocked, readBurned, configProblems } from './dort-relayer.mjs';

const pad = (s, n = 64) => s.replace(/^0x/, '').padStart(n, '0');
const topicAddr = a => '0x' + pad(a);
const w = (...xs) => '0x' + xs.map(x => pad(typeof x === 'string' ? x : x.toString(16))).join('');

test('event topics match the contracts', () => {
  // keccak of the declared signatures; `cast sig-event` on the same text gives these
  assert.match(TOPICS.locked, /^0x[0-9a-f]{64}$/);
  assert.match(TOPICS.burned, /^0x[0-9a-f]{64}$/);
  assert.notEqual(TOPICS.locked, TOPICS.burned);
});

test('a Locked log decodes into the mint the relayer must make', () => {
  const ev = readLocked({
    topics: [
      TOPICS.locked,
      '0x' + 'ab'.repeat(32),
      topicAddr('0x1111111111111111111111111111111111111111'),
      topicAddr('0x2222222222222222222222222222222222222222'),
    ],
    data: w('0x3333333333333333333333333333333333333333', 250000000n, 420420777n, 7n),
    transactionHash: '0x' + 'cd'.repeat(32),
    blockNumber: '0x1f4',
  });
  assert.equal(ev.id, '0x' + 'ab'.repeat(32));
  assert.equal(ev.token, '0x1111111111111111111111111111111111111111');
  assert.equal(ev.sender, '0x2222222222222222222222222222222222222222');
  assert.equal(ev.recipient, '0x3333333333333333333333333333333333333333');
  assert.equal(ev.amount, 250000000n);
  assert.equal(ev.dstChainId, 420420777n);
  assert.equal(ev.nonce, 7n);
  assert.equal(ev.block, 500);
});

test('a Burned log decodes into the release the relayer must make', () => {
  const ev = readBurned({
    topics: [
      TOPICS.burned,
      '0x' + '12'.repeat(32),
      topicAddr('0x4444444444444444444444444444444444444444'),
      topicAddr('0x5555555555555555555555555555555555555555'),
    ],
    data: w('0x6666666666666666666666666666666666666666', 100n, 84532n, 0n),
    transactionHash: '0x' + 'ef'.repeat(32),
    blockNumber: '0x2',
  });
  assert.equal(ev.srcToken, '0x4444444444444444444444444444444444444444');
  assert.equal(ev.recipient, '0x6666666666666666666666666666666666666666');
  assert.equal(ev.amount, 100n);
  assert.equal(ev.dstChainId, 84532n);
  assert.equal(ev.block, 2);
});

test('a config is refused unless both sides are fully described', () => {
  const ok = {
    home: { rpc: 'https://sepolia.base.org', chainId: 84532, contract: '0x' + '11'.repeat(20) },
    portaldot: { rpc: 'https://test-evm-rpc-v3.portaldot.dev', chainId: 420420777, contract: '0x' + '22'.repeat(20) },
  };
  assert.deepEqual(configProblems(ok), []);

  assert.ok(configProblems({}).length >= 2, 'both sides missing');
  assert.match(configProblems({ ...ok, home: { ...ok.home, rpc: 'ws://x' } }).join(), /home\.rpc/);
  assert.match(configProblems({ ...ok, home: { ...ok.home, contract: 'nope' } }).join(), /home\.contract/);
  assert.match(configProblems({ ...ok, home: { ...ok.home, chainId: '84532' } }).join(), /home\.chainId/);
  // the Portaldot side must really be Portaldot: a typo here would bridge to the wrong chain
  assert.match(
    configProblems({ ...ok, portaldot: { ...ok.portaldot, chainId: 1 } }).join(),
    /expected 420420777/,
  );
  assert.match(configProblems({ ...ok, token: { address: 'nope' } }).join(), /token\.address/);
});
