// Usage: node scripts/revoke-key.js <tenantId> <prefix>
// Revokes the tenant's active API key with the given display prefix (the
// first 8 characters of the key). Refuses if the prefix matches no active
// key or more than one.
const { openDb } = require('../src/db');
const { revokeApiKey } = require('../src/keys');

const [tenantId, prefix] = process.argv.slice(2);
if (!tenantId || !prefix) {
  console.error('Usage: node scripts/revoke-key.js <tenantId> <prefix>');
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || 'taskhub.db');
try {
  revokeApiKey(db, tenantId, prefix);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  db.close();
}

if (!process.exitCode) {
  console.log(`Revoked key "${prefix}" for tenant "${tenantId}".`);
}
