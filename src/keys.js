const crypto = require('node:crypto');

const KEY_PREFIX = 'th_';
const DISPLAY_PREFIX_LENGTH = 8;

function generateKey() {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

// Keys are 256-bit random values, not passwords, so a fast hash is enough:
// there is nothing to brute-force, and it allows an indexed lookup.
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Creates the tenant if it doesn't exist yet. Returns the plain key,
// which is never stored and cannot be recovered later.
function createApiKey(db, tenantId, tenantName = tenantId) {
  db.prepare('INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)').run(tenantId, tenantName);

  const key = generateKey();
  db.prepare('INSERT INTO api_keys (tenant_id, key_hash, prefix) VALUES (?, ?, ?)').run(
    tenantId,
    hashKey(key),
    key.slice(0, DISPLAY_PREFIX_LENGTH)
  );
  return key;
}

// Revokes the tenant's single active key with this display prefix. Throws
// if the prefix matches no active key or more than one, so a typo or an
// ambiguous prefix never revokes the wrong key.
function revokeApiKey(db, tenantId, prefix) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = db
      .prepare('SELECT id FROM api_keys WHERE tenant_id = ? AND prefix = ? AND revoked_at IS NULL')
      .all(tenantId, prefix);
    if (rows.length === 0) {
      throw new Error(`No active key with prefix "${prefix}" for tenant "${tenantId}"`);
    }
    if (rows.length > 1) {
      throw new Error(
        `Prefix "${prefix}" matches ${rows.length} active keys for tenant "${tenantId}"; refusing to revoke`
      );
    }
    db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE tenant_id = ? AND id = ?").run(
      tenantId,
      rows[0].id
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { generateKey, hashKey, createApiKey, revokeApiKey };
