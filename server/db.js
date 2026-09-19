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
  if (!row) return null;
  let data = row.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { data = null; }
  }
  if (data && typeof data === 'object') return data;
  return null;
}

function mapUserRow(r) {
  const d = rowData(r) || {};
  return {
    ...d,
    id: d.id || r.id,
    role: d.role || r.role,
    name: d.name || r.name,
    code: d.code != null ? d.code : r.code,
    passwordHash: d.passwordHash || r.password_hash || null,
    groupName: d.groupName != null ? d.groupName : r.group_name,
    teacherId: d.teacherId != null ? d.teacherId : r.teacher_id,
    language: d.language != null ? d.language : r.language,
    enrollmentLevel: d.enrollmentLevel != null ? d.enrollmentLevel : r.enrollment_level,
    createdAt: d.createdAt || r.created_at || nowIso(),
    lastActiveAt: d.lastActiveAt || r.last_active_at || null,
  };
}

function mapDocRow(r, extras = {}) {
  const d = rowData(r) || {};
  return { ...d, ...extras, id: d.id || r.id || extras.id };
}

async function loadFromPostgres() {
  const users = await pg.query(
    `SELECT id, role, name, code, password_hash, group_name, teacher_id, language,
            enrollment_level, created_at, last_active_at, data FROM users`
  );
  const sessions = await pg.query(
    `SELECT id, user_id, token, created_at, expires_at, data FROM auth_sessions`
  );
  const assignments = await pg.query(
    `SELECT id, teacher_id, language, status, title, created_at, data FROM assignments`
  );
  const links = await pg.query('SELECT assignment_id, student_id FROM assignment_students');
  const flows = await pg.query(
    `SELECT id, assignment_id, student_id, data FROM flow_sessions`
  );
  const retellings = await pg.query(
    `SELECT id, assignment_id, student_id, language, status, media_key, media_path, mime_type,
            media_base64, created_at, submitted_at, data FROM retellings`
  );
  const notifications = await pg.query(
    `SELECT id, user_id, title, body, read, created_at, data FROM notifications`
  );
  const attempts = await pg.query(
    `SELECT id, student_id, quiz_id, subject_id, language, status, started_at, completed_at, data
     FROM quiz_attempts`
  );
  const lessons = await pg.query(
    `SELECT id, teacher_id, language, section, title, file_key, file_path, mime_type,
            media_base64, created_at, data
     FROM lessons`
  );

  db = emptyDb();
  db.users = users.rows.map(mapUserRow).filter((u) => u && u.id);
  db.authSessions = sessions.rows.map((r) => {
    const d = rowData(r) || {};
    return {
      ...d,
      id: d.id || r.id,
      userId: d.userId || r.user_id,
      token: d.token || r.token,
      createdAt: d.createdAt || r.created_at,
      expiresAt: d.expiresAt || r.expires_at,
    };
  }).filter((s) => s && s.id && s.token);
  db.assignments = assignments.rows.map((r) => {
    const d = rowData(r) || {};
    return {
      ...d,
      id: d.id || r.id,
      teacherId: d.teacherId || r.teacher_id,
      language: d.language || r.language,
      status: d.status || r.status,
      title: d.title != null ? d.title : r.title,
      createdAt: d.createdAt || r.created_at,
    };
  }).filter((a) => a && a.id);
  db.assignmentStudents = links.rows.map((r) => ({
    assignmentId: r.assignment_id,
    studentId: r.student_id,
  }));
  db.flowSessions = flows.rows.map((r) => {
    const d = rowData(r) || {};
    return {
      ...d,
      id: d.id || r.id,
      assignmentId: d.assignmentId || r.assignment_id,
      studentId: d.studentId || r.student_id,
    };
  }).filter((f) => f && f.assignmentId && f.studentId);
  db.retellings = retellings.rows.map((r) => {
    const d = rowData(r) || {};
    const { mediaBase64: _drop, ...rest } = d;
    return {
      ...rest,
      id: d.id || r.id,
      assignmentId: d.assignmentId || r.assignment_id,
      studentId: d.studentId || r.student_id,
      language: d.language || r.language,
      status: d.status || r.status,
      mediaKey: d.mediaKey || r.media_key,
      mediaPath: d.mediaPath || r.media_path,
      mimeType: d.mimeType || r.mime_type,
      mediaBase64: r.media_base64 || d.mediaBase64 || null,
      submittedAt: d.submittedAt || r.submitted_at,
    };
  }).filter((x) => x && x.id);
  db.notifications = notifications.rows.map((r) => {
    const d = rowData(r) || {};
    return {
      ...d,
      id: d.id || r.id,
      userId: d.userId || r.user_id,
      title: d.title != null ? d.title : r.title,
      body: d.body != null ? d.body : r.body,
      read: d.read != null ? d.read : r.read,
      createdAt: d.createdAt || r.created_at,
    };
  }).filter((n) => n && n.id);
  db.literacyAttempts = attempts.rows.map((r) => {
    const d = rowData(r) || {};
    return {
      ...d,
      id: d.id || r.id,
      studentId: d.studentId || r.student_id,
      quizId: d.quizId || r.quiz_id,
      subjectId: d.subjectId || r.subject_id,
      status: d.status || r.status,
      startedAt: d.startedAt || r.started_at,
      completedAt: d.completedAt || r.completed_at,
    };
  }).filter((a) => a && a.id);
  db.lessons = lessons.rows.map((r) => {
    const d = rowData(r) || {};
    const { mediaBase64: _drop, ...rest } = d;
    return {
      ...rest,
      id: d.id || r.id,
      teacherId: d.teacherId || r.teacher_id,
      language: d.language || r.language,
      section: d.section || r.section,
      title: d.title != null ? d.title : r.title,
      fileKey: d.fileKey || r.file_key,
      filePath: d.filePath || r.file_path,
      mimeType: d.mimeType || r.mime_type,
      mediaBase64: r.media_base64 || d.mediaBase64 || null,
      createdAt: d.createdAt || r.created_at,
    };
  }).filter((l) => l && l.id);
}

const PERSIST_LOCK_KEY = 88442201; // advisory lock id for EliteSchool persist

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isDeadlock(err) {
  return err && (err.code === '40P01' || /deadlock detected/i.test(String(err.message || '')));
}

async function applyLightMigrationsPg() {
  // Targeted updates — never DELETE ALL on boot (avoids Neon deadlocks with other instances)
  const code = currentTeacherCode();
  await pg.query(
    `UPDATE users
     SET code = $1,
         name = CASE WHEN name = 'Елена Викторовна' THEN 'Учитель' ELSE name END,
         group_name = CASE WHEN group_name = 'Радуга' THEN NULL ELSE group_name END,
         data = data
           || jsonb_build_object('code', $1::text)
           || CASE WHEN name = 'Елена Викторовна' THEN jsonb_build_object('name', 'Учитель') ELSE '{}'::jsonb END,
         updated_at = now()
     WHERE role = 'TEACHER'`,
    [code]
  );
  await pg.query(
    `UPDATE users
     SET language = COALESCE(NULLIF(lower(language), ''), 'ru'),
         enrollment_level = CASE
           WHEN enrollment_level IN ('BEGINNER','INTERMEDIATE','ADVANCED') THEN enrollment_level
           ELSE 'BEGINNER'
         END,
         updated_at = now()
     WHERE role = 'STUDENT'`
  );
}

async function persistToPostgres() {
  const maxAttempts = 6;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await pg.getPool().connect();
    let locked = false;
    try {
      // Serialize writers across Render + local so Neon never deadlocks on DELETE ALL
      await client.query('SELECT pg_advisory_lock($1)', [PERSIST_LOCK_KEY]);
      locked = true;
      await client.query('BEGIN');

      // Snapshot media before cascade deletes wipe retellings (assignments → ON DELETE CASCADE)
      const retMediaSnap = await client.query(
        `SELECT id, media_base64, media_key, media_path, mime_type FROM retellings
         WHERE media_base64 IS NOT NULL OR media_key IS NOT NULL OR media_path IS NOT NULL`
      );

      await client.query('DELETE FROM quiz_attempts');
      await client.query('DELETE FROM notifications');
      await client.query('DELETE FROM flow_sessions');
      await client.query('DELETE FROM assignment_students');
      await client.query('DELETE FROM assignments');
      // lessons: synced via dedicated SQL in API (avoid rewriting huge media_base64 on every save)
      await client.query('DELETE FROM auth_sessions');
      await client.query('DELETE FROM users');

      const usersOrdered = [
        ...db.users.filter((u) => u && u.role === 'TEACHER'),
        ...db.users.filter((u) => u && u.role !== 'TEACHER'),
      ];
      for (const u of usersOrdered) {
        if (!u || !u.id || !u.role || !u.name) {
          console.warn('Skipping invalid user row during persist');
          continue;
        }
        const language = u.role === 'STUDENT' ? (normalizeLanguage(u.language) || 'ru') : null;
        // Ensure teacher_id points to an existing teacher in this batch
        let teacherId = u.teacherId || null;
        if (teacherId && !usersOrdered.some((x) => x.id === teacherId)) teacherId = null;
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
            teacherId,
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

      // lessons.teacher_id FK is ON DELETE CASCADE — DELETE users wiped all lessons.
      // Re-upsert every in-memory lesson after users are restored.
      const lessonIds = (db.lessons || []).map((l) => l && l.id).filter(Boolean);
      if (lessonIds.length) {
        await client.query(
          `DELETE FROM lessons WHERE NOT (id = ANY($1::text[]))`,
          [lessonIds]
        );
      }
      for (const lesson of db.lessons || []) {
        if (!lesson || !lesson.id) continue;
        const language = String(lesson.language || '').toUpperCase() === 'GLOBAL'
          ? 'GLOBAL'
          : (normalizeLanguage(lesson.language) || 'ru');
        await client.query(
          `INSERT INTO lessons (
             id, teacher_id, language, section, title, file_key, file_path, mime_type,
             media_base64, created_at, data
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             teacher_id = EXCLUDED.teacher_id,
             language = EXCLUDED.language,
             section = EXCLUDED.section,
             title = EXCLUDED.title,
             file_key = EXCLUDED.file_key,
             file_path = EXCLUDED.file_path,
             mime_type = EXCLUDED.mime_type,
             media_base64 = COALESCE(EXCLUDED.media_base64, lessons.media_base64),
             data = EXCLUDED.data,
             updated_at = now()`,
          [
            lesson.id,
            lesson.teacherId,
            language,
            lesson.section || 'VIDEO',
            lesson.title || '',
            lesson.fileKey || null,
            lesson.filePath || null,
            lesson.mimeType || null,
            lesson.mediaBase64 || null,
            lesson.createdAt || nowIso(),
            JSON.stringify(leanWithoutMedia(lesson)),
          ]
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

      const retellingIds = db.retellings.map((r) => r.id).filter(Boolean);
      if (retellingIds.length) {
        await client.query(
          `DELETE FROM retellings WHERE NOT (id = ANY($1::text[]))`,
          [retellingIds]
        );
      } else {
        await client.query('DELETE FROM retellings');
      }
      for (const r of db.retellings) {
        if (!r?.id) continue;
        const student = db.users.find((u) => u.id === r.studentId);
        const assignment = db.assignments.find((a) => a.id === r.assignmentId);
        const language = normalizeLanguage(r.language || student?.language || assignment?.language) || 'ru';
        const lean = leanWithoutMedia(r);
        await client.query(
          `INSERT INTO retellings (
             id, assignment_id, student_id, language, status, media_key, media_path, mime_type,
             media_base64, created_at, submitted_at, data
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             assignment_id = EXCLUDED.assignment_id,
             student_id = EXCLUDED.student_id,
             language = EXCLUDED.language,
             status = EXCLUDED.status,
             media_key = COALESCE(EXCLUDED.media_key, retellings.media_key),
             media_path = COALESCE(EXCLUDED.media_path, retellings.media_path),
             mime_type = COALESCE(EXCLUDED.mime_type, retellings.mime_type),
             media_base64 = COALESCE(retellings.media_base64, EXCLUDED.media_base64),
             submitted_at = COALESCE(EXCLUDED.submitted_at, retellings.submitted_at),
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
            null,
            r.createdAt || r.submittedAt || nowIso(),
            r.submittedAt || null,
            JSON.stringify(lean),
          ]
        );
      }

      for (const row of retMediaSnap.rows) {
        await client.query(
          `UPDATE retellings SET
             media_base64 = COALESCE($2, media_base64),
             media_key = COALESCE($3, media_key),
             media_path = COALESCE($4, media_path),
             mime_type = COALESCE($5, mime_type)
           WHERE id = $1`,
          [row.id, row.media_base64, row.media_key, row.media_path, row.mime_type]
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

      await client.query('COMMIT');
      return;
    } catch (err) {
      lastErr = err;
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      if (isDeadlock(err) && attempt < maxAttempts) {
        const wait = 150 * attempt + Math.floor(Math.random() * 400);
        console.warn(`DB persist deadlock (attempt ${attempt}/${maxAttempts}), retry in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      if (locked) {
        try { await client.query('SELECT pg_advisory_unlock($1)', [PERSIST_LOCK_KEY]); } catch (_) { /* ignore */ }
      }
      client.release();
    }
  }
  throw lastErr || new Error('persistToPostgres failed');
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
  // Always ensure upload dirs — used as R2 fallback (incl. production without R2)
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(LESSONS_DIR)) fs.mkdirSync(LESSONS_DIR, { recursive: true });
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
    // In-memory migrations for runtime consistency
    migrateAuth();
    migrateTracks();
    migrateQuizAttempts();
    if (!db.users.length) {
      // First boot only — full seed write
      await persistToPostgres();
    } else {
      // Never DELETE ALL on boot (causes Neon deadlocks with overlapping instances)
      try {
        await applyLightMigrationsPg();
      } catch (err) {
        console.warn('Light DB migration skipped:', err.message || err);
      }
    }
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

function leanWithoutMedia(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = { ...obj };
  delete copy.mediaBase64;
  return copy;
}

async function upsertLessonPg(lesson) {
  if (!usePostgres() || !lesson?.id) return;
  const language = String(lesson.language || '').toUpperCase() === 'GLOBAL'
    ? 'GLOBAL'
    : (normalizeLanguage(lesson.language) || 'ru');
  await pg.query(
    `INSERT INTO lessons (
       id, teacher_id, language, section, title, file_key, file_path, mime_type,
       media_base64, created_at, data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       teacher_id = EXCLUDED.teacher_id,
       language = EXCLUDED.language,
       section = EXCLUDED.section,
       title = EXCLUDED.title,
       file_key = EXCLUDED.file_key,
       file_path = EXCLUDED.file_path,
       mime_type = EXCLUDED.mime_type,
       media_base64 = EXCLUDED.media_base64,
       data = EXCLUDED.data,
       updated_at = now()`,
    [
      lesson.id,
      lesson.teacherId,
      language,
      lesson.section || 'VIDEO',
      lesson.title || '',
      lesson.fileKey || null,
      lesson.filePath || null,
      lesson.mimeType || null,
      lesson.mediaBase64 || null,
      lesson.createdAt || nowIso(),
      JSON.stringify(leanWithoutMedia(lesson)),
    ]
  );
}

async function upsertRetellingPg(retelling) {
  if (!usePostgres() || !retelling?.id) return;
  const student = db.users.find((u) => u.id === retelling.studentId);
  const assignment = db.assignments.find((a) => a.id === retelling.assignmentId);
  const language = normalizeLanguage(retelling.language || student?.language || assignment?.language) || 'ru';
  await pg.query(
    `INSERT INTO retellings (
       id, assignment_id, student_id, language, status, media_key, media_path, mime_type,
       media_base64, created_at, submitted_at, data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       assignment_id = EXCLUDED.assignment_id,
       student_id = EXCLUDED.student_id,
       language = EXCLUDED.language,
       status = EXCLUDED.status,
       media_key = COALESCE(EXCLUDED.media_key, retellings.media_key),
       media_path = COALESCE(EXCLUDED.media_path, retellings.media_path),
       mime_type = COALESCE(EXCLUDED.mime_type, retellings.mime_type),
       media_base64 = COALESCE(EXCLUDED.media_base64, retellings.media_base64),
       submitted_at = COALESCE(EXCLUDED.submitted_at, retellings.submitted_at),
       data = EXCLUDED.data,
       updated_at = now()`,
    [
      retelling.id,
      retelling.assignmentId,
      retelling.studentId,
      language,
      retelling.status || 'SUBMITTED',
      retelling.mediaKey || null,
      retelling.mediaPath || null,
      retelling.mimeType || null,
      retelling.mediaBase64 || null,
      retelling.createdAt || retelling.submittedAt || nowIso(),
      retelling.submittedAt || null,
      JSON.stringify(leanWithoutMedia(retelling)),
    ]
  );
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
  upsertLessonPg,
  upsertRetellingPg,
  TEACHER_CODE: null,
};
