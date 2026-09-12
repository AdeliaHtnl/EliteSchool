#!/usr/bin/env node
/**
 * Migrate data/db.json → PostgreSQL (idempotent upserts).
 * Does NOT delete JSON seed files.
 * Usage: npm run db:migrate-json
 */
require('../server/env');
const fs = require('fs');
const path = require('path');
const { normalizeLanguage } = require('../server/lang');
const { hasDatabaseUrl, query, getPool, closePool } = require('../server/pg');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function loadJsonDb() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Missing ${DB_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  return {
    users: raw.users || [],
    authSessions: raw.authSessions || [],
    assignments: raw.assignments || [],
    assignmentStudents: raw.assignmentStudents || [],
    flowSessions: raw.flowSessions || [],
    retellings: raw.retellings || [],
    notifications: raw.notifications || [],
    literacyAttempts: raw.literacyAttempts || [],
    lessons: raw.lessons || [],
  };
}

function langOf(value, fallback = 'ru') {
  return normalizeLanguage(value) || fallback;
}

async function upsertUsers(users) {
  let n = 0;
  for (const u of users) {
    const language = u.role === 'STUDENT' ? langOf(u.language) : null;
    await query(
      `INSERT INTO users (
         id, role, name, code, password_hash, group_name, teacher_id, language, enrollment_level,
         created_at, last_active_at, data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role,
         name = EXCLUDED.name,
         code = EXCLUDED.code,
         password_hash = EXCLUDED.password_hash,
         group_name = EXCLUDED.group_name,
         teacher_id = EXCLUDED.teacher_id,
         language = EXCLUDED.language,
         enrollment_level = EXCLUDED.enrollment_level,
         last_active_at = EXCLUDED.last_active_at,
         data = EXCLUDED.data,
         updated_at = now()`,
      [
        u.id,
        u.role,
        u.name,
        u.code || null,
        u.passwordHash || null,
        u.groupName || null,
        u.teacherId || null,
        language,
        u.enrollmentLevel || null,
        u.createdAt || new Date().toISOString(),
        u.lastActiveAt || null,
        JSON.stringify(u),
      ]
    );
    n += 1;
  }
  return n;
}

async function upsertSessions(rows) {
  let n = 0;
  for (const s of rows) {
    await query(
      `INSERT INTO auth_sessions (id, user_id, token, created_at, expires_at, data)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         token = EXCLUDED.token,
         expires_at = EXCLUDED.expires_at,
         data = EXCLUDED.data`,
      [s.id, s.userId, s.token, s.createdAt || new Date().toISOString(), s.expiresAt, JSON.stringify(s)]
    );
    n += 1;
  }
  return n;
}

async function upsertAssignments(rows) {
  let n = 0;
  for (const a of rows) {
    await query(
      `INSERT INTO assignments (id, teacher_id, language, status, title, created_at, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         teacher_id = EXCLUDED.teacher_id,
         language = EXCLUDED.language,
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         data = EXCLUDED.data,
         updated_at = now()`,
      [
        a.id,
        a.teacherId,
        langOf(a.language),
        a.status || 'ACTIVE',
        a.title || '',
        a.createdAt || new Date().toISOString(),
        JSON.stringify(a),
      ]
    );
    n += 1;
  }
  return n;
}

async function upsertAssignmentStudents(rows) {
  let n = 0;
  for (const x of rows) {
    await query(
      `INSERT INTO assignment_students (assignment_id, student_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [x.assignmentId, x.studentId]
    );
    n += 1;
  }
  return n;
}

async function upsertFlows(rows) {
  let n = 0;
  for (const f of rows) {
    const id = f.id || `flow-${f.assignmentId}-${f.studentId}`;
    await query(
      `INSERT INTO flow_sessions (id, assignment_id, student_id, data)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         data = EXCLUDED.data,
         updated_at = now()`,
      [id, f.assignmentId, f.studentId, JSON.stringify(f)]
    );
    n += 1;
  }
  return n;
}

async function upsertRetellings(rows, usersById, assignmentsById) {
  let n = 0;
  for (const r of rows) {
    const student = usersById.get(r.studentId);
    const assignment = assignmentsById.get(r.assignmentId);
    const language = langOf(r.language || student?.language || assignment?.language);
    await query(
      `INSERT INTO retellings (
         id, assignment_id, student_id, language, status, media_key, media_path, mime_type,
         created_at, submitted_at, data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         language = EXCLUDED.language,
         status = EXCLUDED.status,
         media_key = EXCLUDED.media_key,
         media_path = EXCLUDED.media_path,
         mime_type = EXCLUDED.mime_type,
         submitted_at = EXCLUDED.submitted_at,
         data = EXCLUDED.data,
         updated_at = now()`,
      [
        r.id,
        r.assignmentId,
        r.studentId,
        language,
        r.status || 'SUBMITTED',
        r.mediaKey || null,
        r.mediaPath || null,
        r.mimeType || null,
        r.createdAt || r.submittedAt || new Date().toISOString(),
        r.submittedAt || null,
        JSON.stringify(r),
      ]
    );
    n += 1;
  }
  return n;
}

async function upsertNotifications(rows) {
  let n = 0;
  for (const note of rows) {
    await query(
      `INSERT INTO notifications (id, user_id, title, body, read, created_at, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         read = EXCLUDED.read,
         data = EXCLUDED.data`,
      [
        note.id,
        note.userId,
        note.title || '',
        note.body || note.message || '',
        Boolean(note.read),
        note.createdAt || new Date().toISOString(),
        JSON.stringify(note),
      ]
    );
    n += 1;
  }
  return n;
}

async function upsertAttempts(rows) {
  let n = 0;
  for (const a of rows) {
    const language = a.subjectId === 'sub-english' ? 'en' : 'ru';
    await query(
      `INSERT INTO quiz_attempts (
         id, student_id, quiz_id, subject_id, language, status, started_at, completed_at, data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         completed_at = EXCLUDED.completed_at,
         data = EXCLUDED.data,
         updated_at = now()`,
      [
        a.id,
        a.studentId,
        a.quizId || 'quiz-ru-literacy',
        a.subjectId || 'sub-russian',
        language,
        a.status || 'IN_PROGRESS',
        a.startedAt || null,
        a.completedAt || null,
        JSON.stringify(a),
      ]
    );
    n += 1;
  }
  return n;
}

async function upsertLessons(rows) {
  let n = 0;
  for (const l of rows) {
    const language = String(l.language || '').toUpperCase() === 'GLOBAL'
      ? 'GLOBAL'
      : langOf(l.language);
    await query(
      `INSERT INTO lessons (
         id, teacher_id, language, section, title, file_key, file_path, mime_type, created_at, data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         language = EXCLUDED.language,
         section = EXCLUDED.section,
         title = EXCLUDED.title,
         file_key = EXCLUDED.file_key,
         file_path = EXCLUDED.file_path,
         mime_type = EXCLUDED.mime_type,
         data = EXCLUDED.data,
         updated_at = now()`,
      [
        l.id,
        l.teacherId,
        language,
        l.section || 'VIDEO',
        l.title || '',
        l.fileKey || null,
        l.filePath || null,
        l.mimeType || null,
        l.createdAt || new Date().toISOString(),
        JSON.stringify(l),
      ]
    );
    n += 1;
  }
  return n;
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('FAIL: DATABASE_URL is required');
    process.exit(1);
  }
  // Ensure schema exists
  const schema = fs.readFileSync(path.join(__dirname, '..', 'server', 'sql', 'schema.sql'), 'utf8');
  await query(schema);

  const data = loadJsonDb();
  const usersById = new Map(data.users.map((u) => [u.id, u]));
  const assignmentsById = new Map(data.assignments.map((a) => [a.id, a]));

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Use module query (same pool); wrap in transaction via client for safety
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  const stats = {
    users: await upsertUsers(data.users),
    authSessions: await upsertSessions(data.authSessions),
    assignments: await upsertAssignments(data.assignments),
    assignmentStudents: await upsertAssignmentStudents(data.assignmentStudents),
    flowSessions: await upsertFlows(data.flowSessions),
    retellings: await upsertRetellings(data.retellings, usersById, assignmentsById),
    notifications: await upsertNotifications(data.notifications),
    quizAttempts: await upsertAttempts(data.literacyAttempts),
    lessons: await upsertLessons(data.lessons),
  };

  console.log('Migration complete:');
  Object.entries(stats).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('JSON seed catalog files were NOT deleted.');
  await closePool();
}

main().catch(async (err) => {
  console.error('FAIL:', err.message);
  try { await closePool(); } catch (_) { /* ignore */ }
  process.exit(1);
});
