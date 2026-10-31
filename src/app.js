const crypto = require('node:crypto');
const express = require('express');
const { hashKey } = require('./keys');
const { createLogger } = require('./log');

function toTask(row) {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

function createApp(db, { log = createLogger() } = {}) {
  const app = express();

  // One log line per request, written when the response is sent.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    const reqId = crypto.randomUUID();
    const { method, path } = req;
    res.set('X-Request-ID', reqId);
    res.on('finish', () => {
      const fields = {
        reqId,
        method,
        path,
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10,
        tenantId: req.tenantId ?? null,
        keyPrefix: req.keyPrefix ?? null,
      };
      if (res.statusCode >= 500) {
        log.error({ ...fields, stack: res.locals.errorStack ?? null });
      } else {
        log.info(fields);
      }
    });
    next();
  });

  app.use(express.json());

  // The only query not filtered by tenant_id: it is how the tenant is found.
  // See CLAUDE.md.
  const findKeyByHash = db.prepare(
    'SELECT tenant_id, prefix FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
  );

  // Every request must carry a valid API key; the tenant comes from the key.
  app.use((req, res, next) => {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(req.get('Authorization') ?? '');
    const row = match && findKeyByHash.get(hashKey(match[1]));
    if (!row) {
      return res
        .status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({ error: 'A valid API key is required' });
    }
    req.tenantId = row.tenant_id;
    req.keyPrefix = row.prefix;
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

  // Client errors (e.g. malformed JSON) keep their status; anything else is
  // a 500 whose stack goes to the log, never to the client.
  app.use((err, req, res, next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) {
      res.locals.errorStack = err.stack ?? String(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(status).json({ error: 'Bad request' });
  });

  return app;
}

module.exports = { createApp };
