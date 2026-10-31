const express = require('express');

function toTask(row) {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

function createApp(db) {
  const app = express();
  app.use(express.json());

  // Every request must identify its tenant.
  app.use((req, res, next) => {
    const tenantId = req.get('X-Tenant-ID')?.trim();
    if (!tenantId) {
      return res.status(400).json({ error: 'X-Tenant-ID header is required' });
    }
    req.tenantId = tenantId;
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
