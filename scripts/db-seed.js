#!/usr/bin/env node
/**
 * Idempotent seed: ensure teacher user exists; verify catalog seed files.
 * Usage: npm run db:seed
 */
require('../server/env');
const fs = require('fs');
const path = require('path');
const { teacherLoginCode } = require('../server/env');
const { hasDatabaseUrl, query, closePool } = require('../server/pg');
const { resolveSeed } = require('../server/db');

const REQUIRED_SEEDS = [
  ['tests', 'subjects.json'],
  ['tests', 'quizzes.json'],
  ['tests', 'questions-english.json'],
  ['literacy-questions.json'],
  ['game-passages.json'],
];

async function seedPostgres() {
  const code = teacherLoginCode();
  const now = new Date().toISOString();
  const teacher = {
    id: 'u-teacher-1',
    role: 'TEACHER',
    name: 'Учитель',
    code,
    groupName: null,
    teacherId: null,
    createdAt: now,
    lastActiveAt: now,
  };
  const existing = await query(`SELECT id FROM users WHERE role = 'TEACHER' LIMIT 1`);
  if (!existing.rows.length) {
    await query(
      `INSERT INTO users (id, role, name, code, language, created_at, last_active_at, data)
       VALUES ($1, 'TEACHER', $2, $3, NULL, $4, $4, $5::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [teacher.id, teacher.name, code, now, JSON.stringify(teacher)]
    );
    console.log('OK: created teacher user u-teacher-1');
  } else {
    await query(
      `UPDATE users
       SET code = $1,
           name = 'Учитель',
           data = $2::jsonb,
           updated_at = now()
       WHERE role = 'TEACHER'`,
      [code, JSON.stringify(teacher)]
    );
    console.log('OK: teacher user repaired/synced');
  }
}

function verifySeeds() {
  let ok = true;
  for (const parts of REQUIRED_SEEDS) {
    const file = resolveSeed(...parts);
    if (!fs.existsSync(file)) {
      console.error('MISSING seed:', file);
      ok = false;
    } else {
      console.log('OK seed:', path.relative(path.join(__dirname, '..'), file));
    }
  }
  if (!ok) throw new Error('One or more catalog seed files are missing');
}

async function main() {
  verifySeeds();
  if (!hasDatabaseUrl()) {
    console.log('NOTE: DATABASE_URL not set — catalog seeds verified; skipping Postgres teacher seed');
    console.log('(JSON mode will create teacher via server/db.js on boot)');
    return;
  }
  await seedPostgres();
  await closePool();
  console.log('OK: db:seed complete');
}

main().catch(async (err) => {
  console.error('FAIL:', err.message);
  try { await closePool(); } catch (_) { /* ignore */ }
  process.exit(1);
});
