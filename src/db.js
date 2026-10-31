const { DatabaseSync } = require('node:sqlite');

function openDb(path = 'taskhub.db') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tenants (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id  TEXT NOT NULL REFERENCES tenants (id),
      key_hash   TEXT NOT NULL UNIQUE,
      prefix     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT    NOT NULL REFERENCES tenants (id),
      title     TEXT    NOT NULL,
      done      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks (tenant_id);
  `);
  return db;
}

module.exports = { openDb };
