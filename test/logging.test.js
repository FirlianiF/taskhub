const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createApiKey } = require('../src/keys');
const { createLogger } = require('../src/log');

let db;
let app;
let lines;
let key;

beforeEach(() => {
  db = openDb(':memory:');
  key = createApiKey(db, 'tenant-a');
  lines = [];
  app = createApp(db, { log: createLogger((line) => lines.push(line)) });
});

const auth = (k) => ({ Authorization: `Bearer ${k}` });
const entries = () => lines.map((line) => JSON.parse(line));

test('writes one JSON line per request with the expected fields', async () => {
  const res = await request(app).post('/tasks').set(auth(key)).send({ title: 'x' }).expect(201);

  assert.equal(lines.length, 1);
  const [entry] = entries();
  assert.equal(entry.level, 'info');
  assert.ok(!Number.isNaN(Date.parse(entry.time)));
  assert.equal(entry.reqId, res.headers['x-request-id']);
  assert.equal(entry.method, 'POST');
  assert.equal(entry.path, '/tasks');
  assert.equal(entry.status, 201);
  assert.equal(typeof entry.durationMs, 'number');
  assert.equal(entry.tenantId, 'tenant-a');
  assert.equal(entry.keyPrefix, key.slice(0, 8));
});

test('unauthenticated requests are logged without tenant or prefix', async () => {
  await request(app).get('/tasks').expect(401);

  const [entry] = entries();
  assert.equal(entry.status, 401);
  assert.equal(entry.tenantId, null);
  assert.equal(entry.keyPrefix, null);
});

test('API keys and the Authorization header never appear in logs', async () => {
  const unknownKey = 'th_' + crypto.randomBytes(32).toString('base64url');
  const otherSecret = 'not-a-taskhub-token-' + crypto.randomBytes(8).toString('hex');

  await request(app).get('/tasks').set(auth(key)).expect(200);
  await request(app).get('/tasks').set(auth(unknownKey)).expect(401);
  await request(app).get('/tasks').set(auth(otherSecret)).expect(401);
  await request(app).get('/tasks').set('Authorization', `Token ${key}`).expect(401);
  await request(app).get(`/tasks?key=${key}`).set(auth(key)).expect(200);
  db.exec('DROP TABLE tasks');
  await request(app).get('/tasks').set(auth(key)).expect(500);

  assert.equal(lines.length, 6);
  for (const line of lines) {
    assert.ok(!line.includes(key), `full key leaked: ${line}`);
    assert.ok(!line.includes(unknownKey), `unknown key leaked: ${line}`);
    assert.ok(!line.includes(otherSecret), `token leaked: ${line}`);
    assert.ok(!/bearer|authorization/i.test(line), `auth header leaked: ${line}`);
    assert.ok(!/th_[A-Za-z0-9_-]{20,}/.test(line), `key-shaped string leaked: ${line}`);
  }
  assert.ok(entries().every((e) => e.path === '/tasks'));
});

test('500s are logged with a stack trace that never reaches the client', async () => {
  db.exec('DROP TABLE tasks');
  const res = await request(app).get('/tasks').set(auth(key)).expect(500);

  assert.deepEqual(res.body, { error: 'Internal server error' });
  const [entry] = entries();
  assert.equal(entry.level, 'error');
  assert.equal(entry.status, 500);
  assert.match(entry.stack, /no such table/);
});

test('malformed JSON is a logged 400, not a 500', async () => {
  await request(app)
    .post('/tasks')
    .set(auth(key))
    .set('Content-Type', 'application/json')
    .send('{"title":')
    .expect(400);

  const [entry] = entries();
  assert.equal(entry.status, 400);
  assert.equal(entry.level, 'info');
});

test('the logger scrubs key-shaped strings from any field', () => {
  const captured = [];
  const log = createLogger((line) => captured.push(line));
  log.error({ stack: `Error: failed for ${key}\n    at somewhere` });

  assert.ok(!captured[0].includes(key));
  assert.match(captured[0], /\[REDACTED\]/);
});
