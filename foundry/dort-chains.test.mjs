// node --test dort-chains.test.mjs   (no forge, no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAINS, forkKeys, latestBlock, resolveChain } from './dort-chains.mjs';

test('resolves chains, RPC overridable, unknown keys throw', () => {
  assert.equal(resolveChain('base-sepolia', {}).rpc, CHAINS['base-sepolia'].rpc);
  assert.equal(resolveChain('portaldot-testnet', {}).id, 420420777);
  assert.equal(resolveChain('portaldot-testnet', { DORT_RPC_PORTALDOT_TESTNET: 'http://pd' }).rpc, 'http://pd');
  assert.equal(resolveChain('base-sepolia', { DORT_RPC_BASE_SEPOLIA: 'http://x' }).rpc, 'http://x');
  assert.throws(() => resolveChain('mainnet', {}), /one of portaldot-testnet, sepolia/);
  assert.deepEqual(forkKeys('all'), Object.keys(CHAINS));
  assert.deepEqual(forkKeys('sepolia, tempo-testnet'), ['sepolia', 'tempo-testnet']);
  assert.throws(() => forkKeys('sepolia,nope'));
});

test('latestBlock refuses an RPC that serves another chain', async () => {
  const rpc = answers => async (_url, { body }) => ({ status: 200, json: async () => ({ result: answers[JSON.parse(body).method] }) });
  const chain = resolveChain('base-sepolia', {});
  assert.equal(await latestBlock(chain, rpc({ eth_chainId: '0x14a34', eth_blockNumber: '0x10' })), 16);
  await assert.rejects(latestBlock(chain, rpc({ eth_chainId: '0x1', eth_blockNumber: '0x10' })), /not Base Sepolia/);
});
