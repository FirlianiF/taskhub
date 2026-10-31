const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createApiKey, hashKey, revokeApiKey } = require('../src/keys');
const { createLogger } = require('../src/log');

let db;
let keyA;
let keyB;

beforeEach(() => {
  db = openDb(':memory:');
  keyA = createApiKey(db, 'tenant-a');
  keyB = createApiKey(db, 'tenant-b');
});

const prefixOf = (key) => key.slice(0, 8);
const revokedAt = (tenantId, key) =>
  db
    .prepare('SELECT revoked_at FROM api_keys WHERE tenant_id = ? AND key_hash = ?')
    .get(tenantId, hashKey(key)).revoked_at;

test('revokeApiKey sets revoked_at on the matching key and the key stops working', async () => {
  const app = createApp(db, { log: createLogger(() => {}) });
  await request(app).get('/tasks').set('Authorization', `Bearer ${keyA}`).expect(200);

  revokeApiKey(db, 'tenant-a', prefixOf(keyA));

  assert.ok(revokedAt('tenant-a', keyA));
  assert.equal(revokedAt('tenant-b', keyB), null);
  await request(app).get('/tasks').set('Authorization', `Bearer ${keyA}`).expect(401);
});

test('revokeApiKey refuses an unknown prefix', () => {
  assert.throws(() => revokeApiKey(db, 'tenant-a', 'th_nope0'), /No active key/);
  assert.equal(revokedAt('tenant-a', keyA), null);
});

test('revokeApiKey refuses an already revoked key', () => {
  revokeApiKey(db, 'tenant-a', prefixOf(keyA));
  assert.throws(() => revokeApiKey(db, 'tenant-a', prefixOf(keyA)), /No active key/);
});

test('revokeApiKey refuses a prefix shared by several active keys', () => {
  const keyA2 = createApiKey(db, 'tenant-a');
  db.prepare('UPDATE api_keys SET prefix = ? WHERE tenant_id = ?').run('th_same0', 'tenant-a');

  assert.throws(() => revokeApiKey(db, 'tenant-a', 'th_same0'), /matches 2 active keys/);
  assert.equal(revokedAt('tenant-a', keyA), null);
  assert.equal(revokedAt('tenant-a', keyA2), null);
});

test('tenant A cannot revoke tenant B\'s key', () => {
  assert.throws(() => revokeApiKey(db, 'tenant-a', prefixOf(keyB)), /No active key/);
  assert.equal(revokedAt('tenant-b', keyB), null);
});

test('a prefix shared across tenants only revokes the given tenant\'s key', () => {
  db.prepare('UPDATE api_keys SET prefix = ? WHERE tenant_id IN (?, ?)').run('th_same0', 'tenant-a', 'tenant-b');

  revokeApiKey(db, 'tenant-b', 'th_same0');

  assert.equal(revokedAt('tenant-a', keyA), null);
  assert.ok(revokedAt('tenant-b', keyB));
});

test('scripts/revoke-key.js revokes a key and exits 1 when it cannot', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhub-revoke-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'test.db');
  const fileDb = openDb(dbPath);
  const key = createApiKey(fileDb, 'tenant-a');
  fileDb.close();

  const run = (...args) =>
    spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'revoke-key.js'), ...args], {
      env: { ...process.env, DB_PATH: dbPath },
      encoding: 'utf8',
    });

  const usage = run();
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Usage/);

  const ok = run('tenant-a', prefixOf(key));
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Revoked/);

  const again = run('tenant-a', prefixOf(key));
  assert.equal(again.status, 1);
  assert.match(again.stderr, /No active key/);
});
