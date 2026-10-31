const express = require('express');
const { hashKey } = require('./keys');

function toTask(row) {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

function createApp(db) {
  const app = express();
  app.use(express.json());

  // The only query not filtered by tenant_id: it is how the tenant is found.
  // See CLAUDE.md.
  const findTenantByKeyHash = db.prepare(
    'SELECT tenant_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
  );

  // Every request must carry a valid API key; the tenant comes from the key.
  app.use((req, res, next) => {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(req.get('Authorization') ?? '');
    const row = match && findTenantByKeyHash.get(hashKey(match[1]));
    if (!row) {
      return res
        .status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({ error: 'A valid API key is required' });
    }
    req.tenantId = row.tenant_id;
    next();
  });

  const insertTask = db.prepare(
    'INSERT INTO tasks (tenant_id, title, done) VALUES (?, ?, ?) RETURNING id, title, done'
  );
  const listTasks = db.prepare(
    'SELECT id, title, done FROM tasks WHERE tenant_id = ? ORDER BY id'
  );

  app.post('/tasks', (req, res) => {
    const { title, done = false } = req.body ?? {};
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    const row = insertTask.get(req.tenantId, title.trim(), done ? 1 : 0);
    res.status(201).json(toTask(row));
  });

  app.get('/tasks', (req, res) => {
    res.json(listTasks.all(req.tenantId).map(toTask));
  });

  return app;
}

module.exports = { createApp };
