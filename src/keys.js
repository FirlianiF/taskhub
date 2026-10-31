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

module.exports = { generateKey, hashKey, createApiKey };
