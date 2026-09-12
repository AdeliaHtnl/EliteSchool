const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
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

function nowIso() {
  return new Date().toISOString();
}

function persist() {
  writeChain = writeChain.then(() => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + '.tmp';
    const payload = JSON.stringify(db, null, 2);
    fs.writeFileSync(tmp, payload);
    try {
      fs.copyFileSync(tmp, DB_PATH);
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    }
  }).catch((err) => {
    console.error('DB write failed:', err);
  });
  return writeChain;
}

const TEACHER_CODE = 'elite.mugalim35';

function seedIfEmpty() {
  if (db.users.length) return;
  const createdAt = nowIso();
  db.users.push({
    id: 'u-teacher-1',
    role: 'TEACHER',
    name: 'Учитель',
    code: TEACHER_CODE,
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
  db.users.forEach((u) => {
    if (u.role !== 'TEACHER') return;
    if (u.code !== TEACHER_CODE) {
      u.code = TEACHER_CODE;
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
  if (changed) persist();
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(LESSONS_DIR)) fs.mkdirSync(LESSONS_DIR, { recursive: true });
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
      persist();
    }
    seedIfEmpty();
    migrateAuth();
    migrateTracks();
    migrateQuizAttempts();
  }
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
  if (changed) persist();
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
    if (u.language !== 'RU' && u.language !== 'EN') {
      u.language = 'RU';
      changed = true;
    }
    if (!['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(u.enrollmentLevel)) {
      u.enrollmentLevel = 'BEGINNER';
      changed = true;
    }
  });
  (db.assignments || []).forEach((a) => {
    if (a.language !== 'RU' && a.language !== 'EN') {
      a.language = 'RU';
      changed = true;
    }
    if (a.targetLevel === undefined) {
      a.targetLevel = null;
      changed = true;
    }
  });
  (db.lessons || []).forEach((l) => {
    if (l.language !== 'RU' && l.language !== 'EN') {
      l.language = 'RU';
      changed = true;
    }
    if (l.targetLevel === undefined) {
      l.targetLevel = inferTargetLevel(l.level);
      changed = true;
    }
  });
  if (changed) persist();
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

module.exports = {
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  LESSONS_DIR,
  load,
  get,
  persist,
  nowIso,
  id,
  token,
  seedIfEmpty,
  TEACHER_CODE,
};
