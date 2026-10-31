// Usage: node scripts/create-key.js <tenantId> [tenantName]
// Creates the tenant if needed and prints a new API key. The key is shown
// only once; only its hash is stored.
const { openDb } = require('../src/db');
const { createApiKey } = require('../src/keys');

const [tenantId, tenantName] = process.argv.slice(2);
if (!tenantId) {
  console.error('Usage: node scripts/create-key.js <tenantId> [tenantName]');
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || 'taskhub.db');
const key = createApiKey(db, tenantId, tenantName);
db.close();

console.log(`API key for tenant "${tenantId}" (store it now, it will not be shown again):`);
console.log(key);
