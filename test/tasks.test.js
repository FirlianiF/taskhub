const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

let app;

beforeEach(() => {
  app = createApp(openDb(':memory:'));
});

test('rejects requests without X-Tenant-ID with 400', async () => {
  await request(app).get('/tasks').expect(400);
  await request(app).post('/tasks').send({ title: 'x' }).expect(400);
  await request(app).get('/tasks').set('X-Tenant-ID', '   ').expect(400);
});

test('POST /tasks creates a task', async () => {
  const res = await request(app)
    .post('/tasks')
    .set('X-Tenant-ID', 'tenant-a')
    .send({ title: 'Write tests' })
    .expect(201);

  assert.equal(typeof res.body.id, 'number');
  assert.equal(res.body.title, 'Write tests');
  assert.equal(res.body.done, false);
});

test('POST /tasks validates the body', async () => {
  const post = (body) =>
    request(app).post('/tasks').set('X-Tenant-ID', 'tenant-a').send(body);

  await post({}).expect(400);
  await post({ title: '' }).expect(400);
  await post({ title: 42 }).expect(400);
  await post({ title: 'ok', done: 'yes' }).expect(400);
});

test('GET /tasks lists the tenant\'s tasks', async () => {
  const agent = request(app);
  await agent.post('/tasks').set('X-Tenant-ID', 'tenant-a').send({ title: 'One' }).expect(201);
  await agent.post('/tasks').set('X-Tenant-ID', 'tenant-a').send({ title: 'Two', done: true }).expect(201);

  const res = await agent.get('/tasks').set('X-Tenant-ID', 'tenant-a').expect(200);
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
  await agent.post('/tasks').set('X-Tenant-ID', 'tenant-b').send({ title: 'B secret' }).expect(201);
  await agent.post('/tasks').set('X-Tenant-ID', 'tenant-a').send({ title: 'A task' }).expect(201);

  const a = await agent.get('/tasks').set('X-Tenant-ID', 'tenant-a').expect(200);
  assert.deepEqual(a.body.map((t) => t.title), ['A task']);

  const b = await agent.get('/tasks').set('X-Tenant-ID', 'tenant-b').expect(200);
  assert.deepEqual(b.body.map((t) => t.title), ['B secret']);
});
