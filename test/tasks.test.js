const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createApiKey, hashKey } = require('../src/keys');

let db;
let app;
let keyA;
let keyB;

beforeEach(() => {
  db = openDb(':memory:');
  keyA = createApiKey(db, 'tenant-a');
  keyB = createApiKey(db, 'tenant-b');
  app = createApp(db);
});

const auth = (key) => ({ Authorization: `Bearer ${key}` });

test('rejects requests without a valid API key with 401', async () => {
  const cases = [
    {},
    { Authorization: '' },
    { Authorization: `Basic ${keyA}` },
    { Authorization: 'Bearer' },
    { Authorization: 'Bearer th_not-a-real-key' },
  ];
  for (const headers of cases) {
    const res = await request(app).get('/tasks').set(headers).expect(401);
    assert.equal(res.headers['www-authenticate'], 'Bearer');
  }
  await request(app).post('/tasks').send({ title: 'x' }).expect(401);
});

test('X-Tenant-ID header is no longer accepted', async () => {
  await request(app).get('/tasks').set('X-Tenant-ID', 'tenant-a').expect(401);
});

test('revoked keys are rejected', async () => {
  db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE tenant_id = ? AND key_hash = ?")
    .run('tenant-a', hashKey(keyA));
  await request(app).get('/tasks').set(auth(keyA)).expect(401);
});

test('only the key hash is stored, never the key', () => {
  const rows = db.prepare('SELECT key_hash, prefix FROM api_keys WHERE tenant_id = ?').all('tenant-a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key_hash, hashKey(keyA));
  assert.notEqual(rows[0].key_hash, keyA);
  assert.ok(keyA.startsWith(rows[0].prefix));
  assert.ok(rows[0].prefix.length < keyA.length);
});

test('POST /tasks creates a task', async () => {
  const res = await request(app)
    .post('/tasks')
    .set(auth(keyA))
    .send({ title: 'Write tests' })
    .expect(201);

  assert.equal(typeof res.body.id, 'number');
  assert.equal(res.body.title, 'Write tests');
  assert.equal(res.body.done, false);
});

test('POST /tasks validates the body', async () => {
  const post = (body) => request(app).post('/tasks').set(auth(keyA)).send(body);

  await post({}).expect(400);
  await post({ title: '' }).expect(400);
  await post({ title: 42 }).expect(400);
  await post({ title: 'ok', done: 'yes' }).expect(400);
});

test('GET /tasks lists the tenant\'s tasks', async () => {
  const agent = request(app);
  await agent.post('/tasks').set(auth(keyA)).send({ title: 'One' }).expect(201);
  await agent.post('/tasks').set(auth(keyA)).send({ title: 'Two', done: true }).expect(201);

  const res = await agent.get('/tasks').set(auth(keyA)).expect(200);
  assert.deepEqual(
    res.body.map(({ title, done }) => ({ title, done })),
    [
      { title: 'One', done: false },
      { title: 'Two', done: true },
    ]
  );
});

test('tenant A cannot see tenant B\'s tasks', async () => {
  const agent = request(app);
  await agent.post('/tasks').set(auth(keyB)).send({ title: 'B secret' }).expect(201);
  await agent.post('/tasks').set(auth(keyA)).send({ title: 'A task' }).expect(201);

  const a = await agent.get('/tasks').set(auth(keyA)).expect(200);
  assert.deepEqual(a.body.map((t) => t.title), ['A task']);

  const b = await agent.get('/tasks').set(auth(keyB)).expect(200);
  assert.deepEqual(b.body.map((t) => t.title), ['B secret']);
});

test('X-Tenant-ID cannot override the tenant derived from the key', async () => {
  const agent = request(app);
  await agent.post('/tasks').set(auth(keyB)).send({ title: 'B secret' }).expect(201);

  const res = await agent
    .get('/tasks')
    .set(auth(keyA))
    .set('X-Tenant-ID', 'tenant-b')
    .expect(200);
  assert.deepEqual(res.body, []);
});

test('multiple keys for the same tenant see the same tasks', async () => {
  const keyA2 = createApiKey(db, 'tenant-a');
  await request(app).post('/tasks').set(auth(keyA)).send({ title: 'Shared' }).expect(201);

  const res = await request(app).get('/tasks').set(auth(keyA2)).expect(200);
  assert.deepEqual(res.body.map((t) => t.title), ['Shared']);
});
