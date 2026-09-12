/**
 * PostgreSQL pool for Neon / Render.
 * Uses DATABASE_URL. SSL enabled for hosted Neon by default.
 */
const { Pool } = require('pg');
const { isProduction } = require('./env');

let pool = null;

function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || '').trim());
}

function getPool() {
  if (!hasDatabaseUrl()) return null;
  if (pool) return pool;
  const connectionString = String(process.env.DATABASE_URL).trim()
    // node-pg warning: prefer explicit compat flag for sslmode=require
    .replace(/([?&])sslmode=require\b/i, '$1sslmode=require&uselibpqcompat=true');
  // Avoid duplicate uselibpqcompat
  const cleaned = connectionString.replace(/(uselibpqcompat=true&){2,}/g, 'uselibpqcompat=true&');
  const needsSsl = /neon\.tech|sslmode=require|render\.com/i.test(cleaned)
    || isProduction()
    || String(process.env.PGSSL || '').toLowerCase() === 'true';
  pool = new Pool({
    connectionString: cleaned,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not configured');
  return p.query(text, params);
}

async function healthCheck() {
  if (!hasDatabaseUrl()) {
    return { ok: false, mode: 'json', error: 'DATABASE_URL not set' };
  }
  try {
    const r = await query('SELECT 1 AS ok');
    return { ok: r.rows[0]?.ok === 1, mode: 'postgres' };
  } catch (err) {
    return { ok: false, mode: 'postgres', error: err.message };
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function installShutdownHooks() {
  const stop = async () => {
    try { await closePool(); } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

module.exports = {
  hasDatabaseUrl,
  getPool,
  query,
  healthCheck,
  closePool,
  installShutdownHooks,
};
