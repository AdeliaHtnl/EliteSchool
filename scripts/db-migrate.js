#!/usr/bin/env node
/**
 * Apply server/sql/schema.sql to DATABASE_URL.
 * Usage: npm run db:migrate
 */
require('../server/env');
const fs = require('fs');
const path = require('path');
const { hasDatabaseUrl, query, closePool } = require('../server/pg');

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('FAIL: DATABASE_URL is required for db:migrate');
    process.exit(1);
  }
  const schemaPath = path.join(__dirname, '..', 'server', 'sql', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await query(sql);
  console.log('OK: schema applied from server/sql/schema.sql');
  await closePool();
}

main().catch(async (err) => {
  console.error('FAIL:', err.message);
  try { await closePool(); } catch (_) { /* ignore */ }
  process.exit(1);
});
