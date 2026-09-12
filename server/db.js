const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { teacherLoginCode, isProduction } = require('./env');
const {
  normalizeLanguage,
} = require('./lang');
const pg = require('./pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SEEDS_DIR = path.join(DATA_DIR, 'seeds');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'retellings');
const LESSONS_DIR = path.join(__dirname, '..', 'uploads', 'lessons');

const emptyDb = () => ({
  users: [],
  authSessions: [],
  assignments: [],
  assignmentStudents: [],
  flowSessions: [],
  retellings: [],
  notifications: [],
  literacyAttempts: [],
  lessons: [],
});

let db = emptyDb();
let writeChain = Promise.resolve();
let storageMode = 'json'; // 'json' | 'postgres'

function nowIso() {
  return new Date().toISOString();
}

function currentTeacherCode() {
  return teacherLoginCode();
}

function usePostgres() {
  return pg.hasDatabaseUrl();
}

function seedIfEmpty() {
  if (db.users.length) return;
  const createdAt = nowIso();
  db.users.push({
    id: 'u-teacher-1',
    role: 'TEACHER',
    name: 'Учитель',
    code: currentTeacherCode(),
    groupName: null,
    teacherId: null,
    createdAt,
    lastActiveAt: createdAt,
  });
}

function migrateAuth() {
  let changed = false;
  if (!db.users.some((u) => u.role === 'TEACHER')) {
    seedIfEmpty();
    changed = true;
  }
  const code = currentTeacherCode();
  db.users.forEach((u) => {
    if (u.role !== 'TEACHER') return;
    if (u.code !== code) {
      u.code = code;
      changed = true;
    }
    if (u.name === 'Елена Викторовна') {
      u.name = 'Учитель';
      changed = true;
    }
    if (u.groupName === 'Радуга') {
      u.groupName = null;
      changed = true;
    }
  });
  return changed;
}

function migrateQuizAttempts() {
  let changed = false;
  (db.literacyAttempts || []).forEach((a) => {
    if (!a.quizId) {
      a.quizId = 'quiz-ru-literacy';
      changed = true;
    }
    if (!a.subjectId) {
      a.subjectId = 'sub-russian';
      changed = true;
    }
  });
  return changed;
}

function inferTargetLevel(levelText) {
  const s = String(levelText || '').toLowerCase();
  if (/нач|begin|базов/.test(s)) return 'BEGINNER';
  if (/средн|inter/.test(s)) return 'INTERMEDIATE';
  if (/продв|advan/.test(s)) return 'ADVANCED';
  return null;
}

function migrateTracks() {
  let changed = false;
  (db.users || []).forEach((u) => {
    if (u.role !== 'STUDENT') return;
    const lang = normalizeLanguage(u.language);
    if (lang && u.language !== lang) {
      u.language = lang;
      changed = true;
    } else if (!lang) {
      u.language = 'ru';
      changed = true;
    }
    if (!['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(u.enrollmentLevel)) {
      u.enrollmentLevel = 'BEGINNER';
      changed = true;
    }
  });
  (db.assignments || []).forEach((a) => {
    const lang = normalizeLanguage(a.language);
    if (lang && a.language !== lang) {
      a.language = lang;
      changed = true;
    } else if (!lang) {
      a.language = 'ru';
      changed = true;
    }
    if (a.targetLevel === undefined) {
      a.targetLevel = null;
      changed = true;
    }
  });
  (db.lessons || []).forEach((l) => {
    if (String(l.language || '').toUpperCase() === 'GLOBAL') {
      l.language = 'GLOBAL';
    } else {
      const lang = normalizeLanguage(l.language);
      if (lang && l.language !== lang) {
        l.language = lang;
        changed = true;
      } else if (!lang) {
        l.language = 'ru';
        changed = true;
      }
    }
    if (l.targetLevel === undefined) {
      l.targetLevel = inferTargetLevel(l.level);
      changed = true;
    }
  });
  return changed;
}

function rowData(row) {
  if (row && row.data && typeof row.data === 'object') return row.data;
  return null;
}

async function loadFromPostgres() {
  const users = await pg.query('SELECT data FROM users');
  const sessions = await pg.query('SELECT data FROM auth_sessions');
  const assignments = await pg.query('SELECT data FROM assignments');
  const links = await pg.query('SELECT assignment_id, student_id FROM assignment_students');
  const flows = await pg.query('SELECT data FROM flow_sessions');
  const retellings = await pg.query('SELECT data FROM retellings');
  const notifications = await pg.query('SELECT data FROM notifications');
  const attempts = await pg.query('SELECT data FROM quiz_attempts');
  const lessons = await pg.query('SELECT data FROM lessons');

  db = emptyDb();
  db.users = users.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.authSessions = sessions.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.assignments = assignments.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.assignmentStudents = links.rows.map((r) => ({
    assignmentId: r.assignment_id,
    studentId: r.student_id,
  }));
  db.flowSessions = flows.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.retellings = retellings.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.notifications = notifications.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.literacyAttempts = attempts.rows.map((r) => rowData(r) || r).filter(Boolean);
  db.lessons = lessons.rows.map((r) => rowData(r) || r).filter(Boolean);
}

async function persistToPostgres() {
  const client = await pg.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM quiz_attempts');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM retellings');
    await client.query('DELETE FROM flow_sessions');
    await client.query('DELETE FROM assignment_students');
    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM lessons');
    await client.query('DELETE FROM auth_sessions');
    await client.query('DELETE FROM users');

    for (const u of db.users) {
      const language = u.role === 'STUDENT' ? (normalizeLanguage(u.language) || 'ru') : null;
      await client.query(
        `INSERT INTO users (
           id, role, name, code, password_hash, group_name, teacher_id, language, enrollment_level,
           created_at, last_active_at, data
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
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
          u.createdAt || nowIso(),
          u.lastActiveAt || null,
          JSON.stringify(u),
        ]
      );
    }

    for (const s of db.authSessions) {
      await client.query(
        `INSERT INTO auth_sessions (id, user_id, token, created_at, expires_at, data)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [s.id, s.userId, s.token, s.createdAt || nowIso(), s.expiresAt, JSON.stringify(s)]
      );
    }

    for (const a of db.assignments) {
      await client.query(
        `INSERT INTO assignments (id, teacher_id, language, status, title, created_at, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          a.id,
          a.teacherId,
          normalizeLanguage(a.language) || 'ru',
          a.status || 'ACTIVE',
          a.title || '',
          a.createdAt || nowIso(),
          JSON.stringify(a),
        ]
      );
    }

    for (const x of db.assignmentStudents) {
      await client.query(
        `INSERT INTO assignment_students (assignment_id, student_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [x.assignmentId, x.studentId]
      );
    }

    for (const f of db.flowSessions) {
      const id = f.id || `flow-${f.assignmentId}-${f.studentId}`;
      await client.query(
        `INSERT INTO flow_sessions (id, assignment_id, student_id, data)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (assignment_id, student_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [id, f.assignmentId, f.studentId, JSON.stringify(f)]
      );
    }

    for (const r of db.retellings) {
      const student = db.users.find((u) => u.id === r.studentId);
      const assignment = db.assignments.find((a) => a.id === r.assignmentId);
      const language = normalizeLanguage(r.language || student?.language || assignment?.language) || 'ru';
      await client.query(
        `INSERT INTO retellings (
           id, assignment_id, student_id, language, status, media_key, media_path, mime_type,
           created_at, submitted_at, data
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          r.id,
          r.assignmentId,
          r.studentId,
          language,
          r.status || 'SUBMITTED',
          r.mediaKey || null,
          r.mediaPath || null,
          r.mimeType || null,
          r.createdAt || r.submittedAt || nowIso(),
          r.submittedAt || null,
          JSON.stringify(r),
        ]
      );
    }

    for (const note of db.notifications) {
      await client.query(
        `INSERT INTO notifications (id, user_id, title, body, read, created_at, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          note.id,
          note.userId,
          note.title || '',
          note.body || note.message || '',
          Boolean(note.read),
          note.createdAt || nowIso(),
          JSON.stringify(note),
        ]
      );
    }

    for (const a of db.literacyAttempts) {
      const language = a.subjectId === 'sub-english' ? 'en' : 'ru';
      await client.query(
        `INSERT INTO quiz_attempts (
           id, student_id, quiz_id, subject_id, language, status, started_at, completed_at, data
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
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
    }

    for (const l of db.lessons) {
      const language = String(l.language || '').toUpperCase() === 'GLOBAL'
        ? 'GLOBAL'
        : (normalizeLanguage(l.language) || 'ru');
      await client.query(
        `INSERT INTO lessons (
           id, teacher_id, language, section, title, file_key, file_path, mime_type, created_at, data
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          l.id,
          l.teacherId,
          language,
          l.section || 'VIDEO',
          l.title || '',
          l.fileKey || null,
          l.filePath || null,
          l.mimeType || null,
          l.createdAt || nowIso(),
          JSON.stringify(l),
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

function persistJson() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  const payload = JSON.stringify(db, null, 2);
  fs.writeFileSync(tmp, payload);
  try {
    fs.copyFileSync(tmp, DB_PATH);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  }
}

function persist() {
  writeChain = writeChain.then(async () => {
    if (storageMode === 'postgres') {
      await persistToPostgres();
    } else {
      persistJson();
    }
  }).catch((err) => {
    console.error('DB write failed:', err.message || err);
  });
  return writeChain;
}

function ensureLocalDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!usePostgres()) {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(LESSONS_DIR)) fs.mkdirSync(LESSONS_DIR, { recursive: true });
  }
}

/**
 * Sync JSON bootstrap (local/dev without DATABASE_URL).
 * When DATABASE_URL is set, call loadAsync() instead.
 */
function load() {
  if (usePostgres()) {
    throw new Error('DATABASE_URL is set — call await db.loadAsync() instead of db.load()');
  }
  ensureLocalDirs();
  storageMode = 'json';
  if (!fs.existsSync(DB_PATH)) {
    db = emptyDb();
    seedIfEmpty();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } else {
    try {
      db = Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
      if (!Array.isArray(db.literacyAttempts)) db.literacyAttempts = [];
      if (!Array.isArray(db.lessons)) db.lessons = [];
    } catch (err) {
      console.error('DB parse failed, recreating:', err.message);
      db = emptyDb();
      seedIfEmpty();
      persistJson();
    }
    seedIfEmpty();
    const changed = migrateAuth() | migrateTracks() | migrateQuizAttempts();
    if (changed) persistJson();
  }
}

/**
 * Preferred boot path: async load (JSON or Postgres).
 */
async function loadAsync() {
  ensureLocalDirs();

  if (isProduction() && !usePostgres()) {
    throw new Error('DATABASE_URL is required in production');
  }

  if (usePostgres()) {
    storageMode = 'postgres';
    // Ensure schema
    const schemaPath = path.join(__dirname, 'sql', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pg.query(sql);
    await loadFromPostgres();
    seedIfEmpty();
    const changed = migrateAuth() | migrateTracks() | migrateQuizAttempts();
    if (changed || !db.users.length) await persistToPostgres();
    console.log(`DB mode: postgres (${db.users.length} users)`);
    pg.installShutdownHooks();
    return;
  }

  storageMode = 'json';
  load(); // sync JSON path
  console.log(`DB mode: json (${db.users.length} users)`);
}

function get() {
  return db;
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function token() {
  return crypto.randomBytes(32).toString('hex');
}

function resolveSeed(...parts) {
  const seeded = path.join(SEEDS_DIR, ...parts);
  if (fs.existsSync(seeded)) return seeded;
  const legacy = path.join(DATA_DIR, ...parts);
  if (fs.existsSync(legacy)) return legacy;
  return seeded;
}

function getStorageMode() {
  return storageMode;
}

module.exports = {
  DATA_DIR,
  SEEDS_DIR,
  DB_PATH,
  UPLOADS_DIR,
  LESSONS_DIR,
  load,
  loadAsync,
  get,
  persist,
  nowIso,
  id,
  token,
  seedIfEmpty,
  resolveSeed,
  currentTeacherCode,
  getStorageMode,
  usePostgres,
  TEACHER_CODE: null,
};
