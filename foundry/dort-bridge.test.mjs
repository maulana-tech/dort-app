// node --test dort-bridge.test.mjs — the bridge's guard and argument rules, then one real round
// trip: a fake exporter in a temp folder, /run streamed over HTTP the way the app reads it.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { APPS, exportArgs, linkOf, refuse, serve } from './dort-bridge.mjs';

// The bridge has no default origin any more: whoever starts it names the Dort it is for, so the
// tests do the same rather than leaning on a constant that no longer exists.
const APP = 'http://localhost:3000';

test('exportArgs: names only, never a flag or a path', () => {
  assert.deepEqual(exportArgs({}), []);
  assert.deepEqual(exportArgs({ fork: 'base-sepolia' }), ['--forks', 'base-sepolia']);
  assert.equal(exportArgs({ fork: 'mainnet' }), 'Unknown fork.');
  assert.equal(exportArgs({ fork: '--rpc-url=http://evil' }), 'Unknown fork.');
  assert.deepEqual(exportArgs({ tests: [{ suite: 'VaultTest', name: 'test_deposit()' }] }), ['--mc', '^(VaultTest)$', '--mt', '^(test_deposit)\\(']);
  assert.equal(exportArgs({ tests: [{ suite: 'VaultTest', name: 'x; rm -rf /' }] }), 'Tests are named by their contract and function.');
  assert.equal(exportArgs({ tests: [{ suite: '../../etc', name: 'test_x' }] }), 'Tests are named by their contract and function.');
  assert.equal(exportArgs({ tests: [] }), 'Choose between 1 and 500 tests.');
  assert.equal(exportArgs(null), 'Send a JSON object.');
  assert.equal(exportArgs([]), 'Send a JSON object.');
});

test('refuse: loopback host, the app origin, the token', () => {
  const ok = { host: '127.0.0.1:7457', origin: APP, auth: 'Bearer t0k', port: 7457, token: 't0k', apps: [APP] };
  assert.equal(refuse(ok), null);
  assert.equal(refuse({ ...ok, host: 'localhost:7457' }), null);
  assert.equal(refuse({ ...ok, origin: undefined }), null); // a local tool without Origin still needs the token
  assert.match(refuse({ ...ok, host: 'evil.example:7457' }), /loopback/); // DNS rebinding
  assert.match(refuse({ ...ok, origin: 'https://evil.example' }), /may not use/);
  assert.match(refuse({ ...ok, auth: 'Bearer nope' }), /token/);
  assert.match(refuse({ ...ok, auth: undefined }), /token/);
  // with nothing named by --app, no site may use the bridge at all
  assert.match(refuse({ ...ok, apps: APPS }), /may not use/);
});

test('linkOf: the token rides in the #fragment', () => {
  assert.equal(linkOf('http://localhost:3000', 7457, 'abc'), 'http://localhost:3000/chat#bridge=7457.abc');
  // the allow-list is empty on purpose: a default origin here would be a standing permission for
  // a site this project does not control, and the bridge runs forge on request
  assert.deepEqual(APPS, [], 'no origin is trusted until --app names one');
});

test('serve: health, data, CORS and a streamed run', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dort-bridge-'));
  // a stand-in exporter: one progress line, one log line, then the file
  writeFileSync(
    join(cwd, 'dort-export.mjs'),
    `import { writeFileSync } from 'node:fs';
console.log('dort: building');
console.log('dort:: ' + JSON.stringify({ run: 'local', plan: [{ suite: 'T', name: 'test_a()' }] }));
writeFileSync('dort-data.json', JSON.stringify({ args: process.argv.slice(2) }));`,
  );
  const token = 'secret-token';
  const port = 17457 + Math.floor(Math.random() * 1000);
  const server = serve({ cwd, port, token, apps: [APP] });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  const auth = { authorization: `Bearer ${token}`, origin: APP };
  try {
    assert.equal((await fetch(`${base}/health`)).status, 403);
    const h = await fetch(`${base}/health`, { headers: auth });
    assert.equal(h.headers.get('access-control-allow-origin'), APP);
    assert.deepEqual(await h.json(), { ok: true, project: cwd.split('/').pop(), exporter: true, data: false, running: false });
    assert.equal((await fetch(`${base}/data`, { headers: auth })).status, 404);

    const pre = await fetch(`${base}/run`, { method: 'OPTIONS', headers: { origin: APP, 'access-control-request-private-network': 'true' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
    assert.equal((await fetch(`${base}/run`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/run`, { method: 'POST', headers: auth, body: '{"fork":"mainnet"}' })).status, 400);

    const run = await fetch(`${base}/run`, { method: 'POST', headers: auth, body: JSON.stringify({ tests: [{ suite: 'T', name: 'test_a()' }] }) });
    const events = (await run.text()).trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(events.find(e => e.progress)?.progress, { run: 'local', plan: [{ suite: 'T', name: 'test_a()' }] });
    assert.equal(events.find(e => e.log)?.log, 'dort: building');
    const done = events.at(-1);
    assert.equal(done.done, true);
    assert.equal(done.code, 0);
    assert.deepEqual(JSON.parse(done.file).args, ['--mc', '^(T)$', '--mt', '^(test_a)\\(']);
    assert.equal((await fetch(`${base}/data`, { headers: auth })).status, 200);
  } finally {
    server.close();
  }
});
