const { DatabaseSync } = require('node:sqlite');

function openDb(path = 'taskhub.db') {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT    NOT NULL,
      title     TEXT    NOT NULL,
      done      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks (tenant_id);
  `);
  return db;
}

module.exports = { openDb };
