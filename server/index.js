const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const db = require('./db');
const literacy = require('./literacy');
const quizzes = require('./quizzes');

const PORT = Number(process.env.PORT) || 3000;
const COOKIE = 'sid';
const SESSION_DAYS = 7;
const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'audio/webm;codecs=opus',
  'video/webm', 'video/mp4', 'video/quicktime', 'video/ogg', 'video/x-matroska',
]);

const CRITERIA = ['contentScore', 'sequenceScore', 'understandingScore', 'speechScore', 'vocabularyScore'];

const LESSON_MIME = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska',
  'application/pdf',
]);

const MIME_EXT = {
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/aac': '.aac',
  'audio/x-m4a': '.m4a',
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
  'video/x-matroska': '.mkv',
  'application/pdf': '.pdf',
};

db.load();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

function store() {
  return db.get();
}

function save() {
  return db.persist();
}

function now() {
  return new Date();
}

function iso(d = now()) {
  return d.toISOString();
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    code: u.code,
    groupName: u.groupName || null,
    teacherId: u.teacherId || null,
    language: u.role === 'STUDENT' ? parseLang(u.language) : null,
    enrollmentLevel: u.role === 'STUDENT' ? parseLevel(u.enrollmentLevel) : null,
  };
}

function parseLang(value) {
  const s = String(value || '').trim().toUpperCase();
  return s === 'EN' || s === 'ENGLISH' ? 'EN' : 'RU';
}

function parseLevel(value) {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'INTERMEDIATE' || s === 'MEDIUM' || s === 'СРЕДНИЙ') return 'INTERMEDIATE';
  if (s === 'ADVANCED' || s === 'ПРОДВИНУТЫЙ') return 'ADVANCED';
  return 'BEGINNER';
}

function parseLevelOrAll(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s === 'ALL' || s === 'ANY' || /все\s*уровн/i.test(raw)) return null;
  if (s === 'INTERMEDIATE' || /средн|inter/i.test(raw)) return 'INTERMEDIATE';
  if (s === 'ADVANCED' || /продв|advan/i.test(raw)) return 'ADVANCED';
  if (s === 'BEGINNER' || /нач|begin|базов/i.test(raw)) return 'BEGINNER';
  return null;
}

function userLang(u) {
  return parseLang(u?.language);
}

function userLevel(u) {
  return parseLevel(u?.enrollmentLevel);
}

function assignmentLang(a) {
  return parseLang(a?.language);
}

function studentsOfTeacher(teacherId, { language, level } = {}) {
  return store().users.filter((u) => {
    if (u.role !== 'STUDENT' || u.teacherId !== teacherId) return false;
    if (language && userLang(u) !== parseLang(language)) return false;
    if (level && userLevel(u) !== parseLevel(level)) return false;
    return true;
  });
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function namesMatch(a, b) {
  return normalizeName(a).toLocaleLowerCase('ru-RU') === normalizeName(b).toLocaleLowerCase('ru-RU');
}

function getSession(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  const s = store().authSessions.find((x) => x.token === token);
  if (!s) return null;
  if (new Date(s.expiresAt) < now()) return null;
  const user = store().users.find((u) => u.id === s.userId);
  if (!user) return null;
  return { session: s, user };
}

function requireAuth(req, res, next) {
  const ctx = getSession(req);
  if (!ctx) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
  req.auth = ctx;
  ctx.user.lastActiveAt = iso();
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
    if (req.auth.user.role !== role) {
      return res.status(403).json({ error: 'Недостаточно прав для этого действия.' });
    }
    next();
  };
}

function teacherOwnsStudent(teacher, student) {
  return student && student.role === 'STUDENT' && student.teacherId === teacher.id;
}

function assignedTo(assignmentId, studentId) {
  return store().assignmentStudents.some((x) => x.assignmentId === assignmentId && x.studentId === studentId);
}

function getAssignment(id) {
  return store().assignments.find((a) => a.id === id) || null;
}

function refreshAssignmentStatus(a) {
  if (!a) return a;
  if (a.status === 'DRAFT') return a;
  const assigned = store().assignmentStudents.filter((x) => x.assignmentId === a.id);
  const submitted = store().retellings.filter((r) => r.assignmentId === a.id);
  if (assigned.length && submitted.length >= assigned.length) {
    a.status = 'COMPLETED';
    return a;
  }
  if (a.deadline && new Date(a.deadline) < now() && a.status === 'ACTIVE') {
    a.status = 'EXPIRED';
  }
  return a;
}

function levelFromScore(score) {
  if (score == null || Number.isNaN(score)) return '—';
  if (score >= 90) return 'Отлично';
  if (score >= 75) return 'Хорошо';
  if (score >= 60) return 'Базовый уровень';
  if (score >= 40) return 'Требуется развитие';
  return 'Начальный уровень';
}

function shortLevel(score) {
  if (score == null || Number.isNaN(score)) return 'Нет оценок';
  if (score >= 90) return 'Высокий';
  if (score >= 75) return 'Продвинутый';
  if (score >= 60) return 'Средний';
  if (score >= 40) return 'Базовый';
  return 'Начальный';
}

function studentStats(studentId) {
  const reviewed = store().retellings
    .filter((r) => r.studentId === studentId && r.status === 'REVIEWED' && r.scores)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  const scores = reviewed.map((r) => r.scores.totalScore);
  const avg = scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : null;
  const best = scores.length ? Math.max(...scores) : null;
  const criteria = {};
  CRITERIA.forEach((k) => {
    const vals = reviewed.map((r) => r.scores[k]).filter((n) => typeof n === 'number');
    criteria[k] = vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length / 20) * 100) : 0;
  });
  const teacher = store().users.find((u) => u.id === (store().users.find((x) => x.id === studentId) || {}).teacherId);
  const assignedIds = store().assignmentStudents.filter((x) => x.studentId === studentId).map((x) => x.assignmentId);
  const activeAssigned = assignedIds
    .map(getAssignment)
    .filter((a) => a && a.status !== 'DRAFT' && assignmentLang(a) === userLang(store().users.find((x) => x.id === studentId) || {}));
  const submittedIds = new Set(store().retellings.filter((r) => r.studentId === studentId).map((r) => r.assignmentId));
  const completedCount = reviewed.length;
  const submittedCount = submittedIds.size;
  const pendingCount = activeAssigned.filter((a) => !submittedIds.has(a.id)).length;
  const inReviewCount = store().retellings.filter((r) => r.studentId === studentId && (r.status === 'SUBMITTED' || r.status === 'IN_REVIEW')).length;
  const history = reviewed.map((r, i) => {
    const a = getAssignment(r.assignmentId);
    return {
      n: i + 1,
      retellingId: r.id,
      assignmentId: r.assignmentId,
      title: a ? a.title : 'Задание',
      score: r.scores.totalScore,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
    };
  });
  return {
    completedCount,
    submittedCount,
    pendingCount,
    inReviewCount,
    assignedCount: activeAssigned.length,
    avgScore: avg,
    bestScore: best,
    level: shortLevel(avg),
    scoreLevel: levelFromScore(avg),
    criteria,
    history,
    videoCount: store().retellings.filter((r) => r.studentId === studentId && r.type === 'VIDEO').length,
    lastActivity: store().users.find((u) => u.id === studentId)?.lastActiveAt || null,
    teacherName: teacher ? teacher.name : null,
  };
}

function notify(userId, payload) {
  store().notifications.unshift({
    id: db.id('n'),
    userId,
    read: false,
    createdAt: iso(),
    ...payload,
  });
}

function stripText(assignment, { includeText }) {
  if (!assignment) return null;
  refreshAssignmentStatus(assignment);
  const out = {
    id: assignment.id,
    teacherId: assignment.teacherId,
    title: assignment.title,
    description: assignment.description,
    readingTime: assignment.readingTime,
    preparationTime: assignment.preparationTime,
    retellingTime: assignment.retellingTime,
    mode: assignment.mode,
    deadline: assignment.deadline,
    status: assignment.status,
    createdAt: assignment.createdAt,
    language: assignmentLang(assignment),
    targetLevel: assignment.targetLevel || null,
  };
  if (includeText) out.text = assignment.text;
  return out;
}

function getFlow(assignmentId, studentId) {
  return store().flowSessions.find((s) => s.assignmentId === assignmentId && s.studentId === studentId) || null;
}

function completeReadingInternal(flow) {
  if (flow.stage !== 'READING') return flow;
  flow.readingCompletedAt = iso();
  flow.stage = 'PREPARATION';
  flow.prepStartedAt = iso();
  flow.updatedAt = iso();
  return flow;
}

function completePrepInternal(flow) {
  if (flow.stage !== 'PREPARATION') return flow;
  flow.prepCompletedAt = iso();
  flow.stage = 'RECORDING';
  flow.updatedAt = iso();
  return flow;
}

function syncFlow(flow, assignment) {
  if (!flow || !assignment) return flow;
  const t = now();
  if (flow.stage === 'READING' && flow.readingStartedAt) {
    const elapsed = (t - new Date(flow.readingStartedAt)) / 1000;
    if (elapsed >= assignment.readingTime) completeReadingInternal(flow);
  }
  if (flow.stage === 'PREPARATION' && flow.prepStartedAt) {
    const elapsed = (t - new Date(flow.prepStartedAt)) / 1000;
    if (elapsed >= assignment.preparationTime) completePrepInternal(flow);
  }
  return flow;
}

function remainingSeconds(startedAt, durationSec) {
  if (!startedAt) return durationSec;
  const elapsed = (now() - new Date(startedAt)) / 1000;
  return Math.max(0, Math.ceil(durationSec - elapsed));
}

function studentAssignmentView(assignment, student) {
  refreshAssignmentStatus(assignment);
  const flow = getFlow(assignment.id, student.id);
  if (flow) syncFlow(flow, assignment);
  const retelling = store().retellings.find((r) => r.assignmentId === assignment.id && r.studentId === student.id) || null;
  let studentStatus = 'NOT_STARTED';
  if (retelling) {
    studentStatus = retelling.status === 'REVIEWED' ? 'REVIEWED' : 'SUBMITTED';
  } else if (flow) {
    studentStatus = flow.stage;
  }
  const includeText = !!(flow && flow.stage === 'READING' && !retelling);
  const view = stripText(assignment, { includeText });
  view.studentStatus = studentStatus;
  view.flow = flow ? {
    stage: flow.stage,
    readingStartedAt: flow.readingStartedAt,
    readingCompletedAt: flow.readingCompletedAt,
    prepStartedAt: flow.prepStartedAt,
    prepCompletedAt: flow.prepCompletedAt,
    remainingReading: flow.stage === 'READING' ? remainingSeconds(flow.readingStartedAt, assignment.readingTime) : 0,
    remainingPrep: flow.stage === 'PREPARATION' ? remainingSeconds(flow.prepStartedAt, assignment.preparationTime) : 0,
    serverNow: iso(),
  } : null;
  view.retelling = retelling ? publicRetelling(retelling, { includeMedia: false, includeText: false }) : null;
  view.assigned = true;
  return view;
}

function publicRetelling(r, { includeAi = true } = {}) {
  const student = store().users.find((u) => u.id === r.studentId);
  const assignment = getAssignment(r.assignmentId);
  const scores = r.scores ? { ...r.scores } : null;
  if (scores) scores.level = levelFromScore(scores.totalScore);
  return {
    id: r.id,
    assignmentId: r.assignmentId,
    studentId: r.studentId,
    studentName: student ? student.name : 'Ученик',
    assignmentTitle: assignment ? assignment.title : 'Задание',
    type: r.type,
    duration: r.duration,
    submittedAt: r.submittedAt,
    status: r.status,
    scores,
    teacherComment: r.teacherComment || '',
    recommendations: r.recommendations || '',
    strengths: r.strengths || '',
    improvements: r.improvements || '',
    aiAnalysis: includeAi ? (r.aiAnalysis || null) : null,
    reviewedAt: r.reviewedAt || null,
    mediaUrl: `/api/retellings/${r.id}/media`,
  };
}

function assertTeacherAssignment(req, assignment) {
  if (!assignment) return { error: 'Задание не найдено.', status: 404 };
  if (assignment.teacherId !== req.auth.user.id) {
    return { error: 'Нет доступа к этому заданию.', status: 403 };
  }
  return null;
}

function mimeBase(m) {
  return String(m || '').split(';')[0].trim().toLowerCase();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(db.UPLOADS_DIR)) fs.mkdirSync(db.UPLOADS_DIR, { recursive: true });
    cb(null, db.UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = MIME_EXT[mimeBase(file.mimetype)] || path.extname(file.originalname) || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const m = mimeBase(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    const knownExt = ['.webm', '.m4a', '.mp4', '.ogg', '.wav', '.aac', '.mov', '.mp3'].includes(ext);
    if (!m && knownExt) cb(null, true);
    else if (ALLOWED_MIME.has(m) || ALLOWED_MIME.has(file.mimetype) || knownExt) cb(null, true);
    else cb(new Error('Неподдерживаемый формат записи. Используйте аудио или видео с микрофона/камеры.'));
  },
});

const lessonStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(db.LESSONS_DIR)) fs.mkdirSync(db.LESSONS_DIR, { recursive: true });
    cb(null, db.LESSONS_DIR);
  },
  filename: (_req, file, cb) => {
    const m = mimeBase(file.mimetype);
    const ext = m === 'application/pdf' ? '.pdf'
      : (MIME_EXT[m] || path.extname(file.originalname) || '.bin');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadLesson = multer({
  storage: lessonStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const m = mimeBase(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (LESSON_MIME.has(m) || ext === '.pdf' || ext === '.mp4' || ext === '.webm' || ext === '.mov') cb(null, true);
    else cb(new Error('Загрузите видео (MP4, WebM) или PDF.'));
  },
});

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function pruneSessions() {
  const t = now();
  store().authSessions = store().authSessions.filter((s) => new Date(s.expiresAt) > t);
}

function normalizeTeacherCode(code) {
  return String(code || '').trim().toLowerCase();
}

function cleanTitle(value) {
  return String(value || '').replace(/^#+\s*/, '').trim();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || hash.length !== 64) return false;
  const next = crypto.scryptSync(String(password), salt, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch (_) {
    return false;
  }
}

function defaultTeacher() {
  return store().users.find((u) => u.role === 'TEACHER') || null;
}

function startSession(user, res) {
  pruneSessions();
  const token = db.token();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  store().authSessions.push({ id: db.id('s'), userId: user.id, token, createdAt: iso(), expiresAt });
  user.lastActiveAt = iso();
  save();
  setSessionCookie(res, token);
}

// -------------------- Auth --------------------
app.post('/api/auth/register', (req, res) => {
  const name = normalizeName(req.body?.name);
  const password = String(req.body?.password || '');
  const confirm = req.body?.passwordConfirm != null ? String(req.body.passwordConfirm) : password;
  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Введите имя и фамилию.' });
  }
  if (name.length > 80) {
    return res.status(400).json({ error: 'Имя слишком длинное.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов.' });
  }
  if (password.length > 72) {
    return res.status(400).json({ error: 'Пароль слишком длинный.' });
  }
  if (password !== confirm) {
    return res.status(400).json({ error: 'Пароли не совпадают.' });
  }
  const taken = store().users.some((u) => u.role === 'STUDENT' && namesMatch(u.name, name));
  if (taken) {
    return res.status(409).json({ error: 'Ученик с таким именем уже есть. Войдите или выберите другое имя.' });
  }
  const teacher = defaultTeacher();
  if (!teacher) {
    return res.status(500).json({ error: 'На платформе ещё нет учителя.' });
  }
  const language = parseLang(req.body?.language);
  const enrollmentLevel = parseLevel(req.body?.enrollmentLevel || req.body?.level);
  const user = {
    id: db.id('u'),
    role: 'STUDENT',
    name,
    code: null,
    passwordHash: hashPassword(password),
    groupName: teacher.groupName || null,
    teacherId: teacher.id,
    language,
    enrollmentLevel,
    createdAt: iso(),
    lastActiveAt: iso(),
  };
  store().users.push(user);
  const langWord = language === 'EN' ? 'английском' : 'русском';
  const levelWord = enrollmentLevel === 'INTERMEDIATE' ? 'средний' : enrollmentLevel === 'ADVANCED' ? 'продвинутый' : 'начальный';
  notify(teacher.id, {
    type: 'STUDENT',
    title: 'Новый ученик',
    body: `${user.name} зарегистрировался в ${langWord} разделе, уровень: ${levelWord}.`,
    link: `#teacher-student-detail/${user.id}`,
  });
  startSession(user, res);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/student', (req, res) => {
  const name = normalizeName(req.body?.name);
  const password = String(req.body?.password || '');
  if (!name || !password) return res.status(400).json({ error: 'Введите имя и пароль.' });
  const user = store().users.find((u) => u.role === 'STUDENT' && namesMatch(u.name, name));
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверное имя или пароль.' });
  }
  startSession(user, res);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/teacher', (req, res) => {
  const code = normalizeTeacherCode(req.body?.code);
  if (!code) return res.status(400).json({ error: 'Введите код учителя.' });
  const user = store().users.find((u) => u.role === 'TEACHER' && normalizeTeacherCode(u.code) === code);
  if (!user) return res.status(401).json({ error: 'Неверный код учителя.' });
  startSession(user, res);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies[COOKIE];
  if (token) {
    store().authSessions = store().authSessions.filter((s) => s.token !== token);
    save();
  }
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/public/stats', (_req, res) => {
  const users = store().users || [];
  res.json({
    teachers: users.filter((u) => u.role === 'TEACHER').length,
    students: users.filter((u) => u.role === 'STUDENT').length,
    retellings: (store().retellings || []).length,
    lessons: (store().lessons || []).length,
  });
});

app.get('/api/me', (req, res) => {
  const ctx = getSession(req);
  if (!ctx) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
  res.json({ user: publicUser(ctx.user) });
});

// -------------------- Notifications --------------------
app.get('/api/notifications', requireAuth, (req, res) => {
  pruneStaleNotifications();
  const list = store().notifications.filter((n) => n.userId === req.auth.user.id).slice(0, 40);
  res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
});

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const n = store().notifications.find((x) => x.id === req.params.id && x.userId === req.auth.user.id);
  if (!n) return res.status(404).json({ error: 'Уведомление не найдено.' });
  n.read = true;
  save();
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  store().notifications.filter((n) => n.userId === req.auth.user.id).forEach((n) => { n.read = true; });
  save();
  res.json({ ok: true });
});

// -------------------- Assignments --------------------
app.get('/api/assignments', requireAuth, (req, res) => {
  const user = req.auth.user;
  if (user.role === 'TEACHER') {
    const langFilter = req.query.language ? parseLang(req.query.language) : null;
    const list = store().assignments
      .filter((a) => a.teacherId === user.id && (!langFilter || assignmentLang(a) === langFilter))
      .map((a) => {
        refreshAssignmentStatus(a);
        const assigned = store().assignmentStudents.filter((x) => x.assignmentId === a.id);
        const rets = store().retellings.filter((r) => r.assignmentId === a.id);
        const reviewed = rets.filter((r) => r.status === 'REVIEWED' && r.scores);
        const avg = reviewed.length
          ? Math.round((reviewed.reduce((s, r) => s + r.scores.totalScore, 0) / reviewed.length) * 10) / 10
          : null;
        return {
          ...stripText(a, { includeText: false }),
          assignedCount: assigned.length,
          submittedCount: rets.length,
          reviewedCount: reviewed.length,
          pendingReview: rets.filter((r) => r.status === 'SUBMITTED' || r.status === 'IN_REVIEW').length,
          avgScore: avg,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    save();
    return res.json({ assignments: list });
  }
  const ids = store().assignmentStudents.filter((x) => x.studentId === user.id).map((x) => x.assignmentId);
  const list = ids
    .map(getAssignment)
    .filter((a) => a && a.status !== 'DRAFT' && assignmentLang(a) === userLang(user))
    .map((a) => studentAssignmentView(a, user))
    .sort((a, b) => new Date(a.deadline || a.createdAt) - new Date(b.deadline || b.createdAt));
  save();
  res.json({ assignments: list });
});

app.get('/api/assignments/:id', requireAuth, (req, res) => {
  const a = getAssignment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Задание не найдено.' });
  const user = req.auth.user;
  if (user.role === 'TEACHER') {
    const denied = assertTeacherAssignment(req, a);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    refreshAssignmentStatus(a);
    const assigned = store().assignmentStudents
      .filter((x) => x.assignmentId === a.id)
      .map((x) => store().users.find((u) => u.id === x.studentId))
      .filter(Boolean)
      .map((u) => ({ id: u.id, name: u.name, code: u.code }));
    const retellings = store().retellings
      .filter((r) => r.assignmentId === a.id)
      .map((r) => publicRetelling(r));
    save();
    return res.json({
      assignment: { ...stripText(a, { includeText: true }), assignedStudents: assigned },
      retellings,
    });
  }
  if (!assignedTo(a.id, user.id) || a.status === 'DRAFT' || assignmentLang(a) !== userLang(user)) {
    return res.status(403).json({ error: 'Это задание вам не назначено.' });
  }
  const view = studentAssignmentView(a, user);
  save();
  res.json({ assignment: view });
});

app.post('/api/assignments', requireAuth, requireRole('TEACHER'), (req, res) => {
  const b = req.body || {};
  const title = cleanTitle(b.title);
  const text = String(b.text || '').trim();
  if (!title) return res.status(400).json({ error: 'Укажите название задания.' });
  if (!text) return res.status(400).json({ error: 'Добавьте текст для пересказа.' });
  const readingTime = Number(b.readingTime);
  const preparationTime = Number(b.preparationTime);
  const retellingTime = Number(b.retellingTime);
  if (![readingTime, preparationTime, retellingTime].every((n) => Number.isFinite(n) && n > 0 && n <= 60 * 60 * 3)) {
    return res.status(400).json({ error: 'Время чтения, подготовки и пересказа должно быть больше нуля.' });
  }
  const mode = String(b.mode || 'AUDIO').toUpperCase();
  if (!['AUDIO', 'VIDEO', 'BOTH'].includes(mode)) {
    return res.status(400).json({ error: 'Недопустимый тип записи.' });
  }
  const status = b.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE';
  let deadline = b.deadline ? new Date(b.deadline) : null;
  if (b.deadline && Number.isNaN(deadline.getTime())) {
    return res.status(400).json({ error: 'Некорректный дедлайн.' });
  }
  const teacherId = req.auth.user.id;
  const language = parseLang(b.language);
  const targetLevel = parseLevelOrAll(b.targetLevel);
  const myStudents = studentsOfTeacher(teacherId, { language, level: targetLevel });
  let studentIds = Array.isArray(b.studentIds) ? b.studentIds.map(String) : [];
  if (!studentIds.length) studentIds = myStudents.map((s) => s.id);
  studentIds = [...new Set(studentIds)];
  const allowed = new Set(myStudents.map((s) => s.id));
  if (studentIds.some((id) => !allowed.has(id))) {
    return res.status(403).json({ error: 'Нельзя назначить задание ученику другого раздела или уровня.' });
  }
  if (!studentIds.length) return res.status(400).json({ error: 'Нет учеников для назначения.' });

  const assignment = {
    id: db.id('a'),
    teacherId,
    title,
    description: String(b.description || '').trim(),
    text,
    readingTime: Math.round(readingTime),
    preparationTime: Math.round(preparationTime),
    retellingTime: Math.round(retellingTime),
    mode,
    deadline: deadline ? deadline.toISOString() : null,
    status,
    language,
    targetLevel,
    createdAt: iso(),
  };
  store().assignments.push(assignment);
  studentIds.forEach((studentId) => {
    store().assignmentStudents.push({ assignmentId: assignment.id, studentId });
    if (status === 'ACTIVE') {
      notify(studentId, {
        type: 'ASSIGNMENT',
        title: 'Новое задание',
        body: `Учитель назначил задание «${title}».`,
        link: `#retell-intro/${assignment.id}`,
      });
    }
  });
  save();
  res.status(201).json({ assignment: stripText(assignment, { includeText: true }) });
});

app.patch('/api/assignments/:id', requireAuth, requireRole('TEACHER'), (req, res) => {
  const a = getAssignment(req.params.id);
  const denied = assertTeacherAssignment(req, a);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  const b = req.body || {};
  if (typeof b.title === 'string' && cleanTitle(b.title)) a.title = cleanTitle(b.title);
  if (typeof b.description === 'string') a.description = b.description.trim();
  if (typeof b.text === 'string' && b.text.trim()) a.text = b.text.trim();
  const prev = a.status;
  if (b.status && ['DRAFT', 'ACTIVE', 'COMPLETED'].includes(b.status)) a.status = b.status;
  if (prev === 'DRAFT' && a.status === 'ACTIVE') {
    store().assignmentStudents.filter((x) => x.assignmentId === a.id).forEach((x) => {
      notify(x.studentId, {
        type: 'ASSIGNMENT',
        title: 'Новое задание',
        body: `Учитель назначил задание «${a.title}».`,
        link: `#retell-intro/${a.id}`,
      });
    });
  }
  save();
  res.json({ assignment: stripText(a, { includeText: true }) });
});

app.post('/api/assignments/:id/start', requireAuth, requireRole('STUDENT'), (req, res) => {
  const a = getAssignment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Задание не найдено.' });
  refreshAssignmentStatus(a);
  const student = req.auth.user;
  if (!assignedTo(a.id, student.id)) return res.status(403).json({ error: 'Это задание вам не назначено.' });
  if (a.status === 'DRAFT') return res.status(400).json({ error: 'Задание ещё не опубликовано.' });
  if (a.status === 'EXPIRED') return res.status(400).json({ error: 'Срок выполнения задания истёк.' });
  if (a.deadline && new Date(a.deadline) < now()) {
    a.status = 'EXPIRED';
    save();
    return res.status(400).json({ error: 'Срок выполнения задания истёк.' });
  }
  const existingRet = store().retellings.find((r) => r.assignmentId === a.id && r.studentId === student.id);
  if (existingRet) return res.status(400).json({ error: 'Пересказ по этому заданию уже отправлен.' });
  let flow = getFlow(a.id, student.id);
  if (!flow) {
    flow = {
      id: db.id('f'),
      assignmentId: a.id,
      studentId: student.id,
      stage: 'READING',
      readingStartedAt: iso(),
      readingCompletedAt: null,
      prepStartedAt: null,
      prepCompletedAt: null,
      createdAt: iso(),
      updatedAt: iso(),
    };
    store().flowSessions.push(flow);
  } else {
    syncFlow(flow, a);
  }
  save();
  res.json({ assignment: studentAssignmentView(a, student) });
});

app.post('/api/assignments/:id/complete-reading', requireAuth, requireRole('STUDENT'), (req, res) => {
  const a = getAssignment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Задание не найдено.' });
  const student = req.auth.user;
  if (!assignedTo(a.id, student.id)) return res.status(403).json({ error: 'Это задание вам не назначено.' });
  const flow = getFlow(a.id, student.id);
  if (!flow) return res.status(400).json({ error: 'Сначала начните задание.' });
  syncFlow(flow, a);
  if (flow.stage === 'READING') completeReadingInternal(flow);
  save();
  res.json({ assignment: studentAssignmentView(a, student) });
});

app.post('/api/assignments/:id/complete-prep', requireAuth, requireRole('STUDENT'), (req, res) => {
  const a = getAssignment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Задание не найдено.' });
  const student = req.auth.user;
  if (!assignedTo(a.id, student.id)) return res.status(403).json({ error: 'Это задание вам не назначено.' });
  const flow = getFlow(a.id, student.id);
  if (!flow) return res.status(400).json({ error: 'Сначала начните задание.' });
  syncFlow(flow, a);
  if (flow.stage === 'READING') completeReadingInternal(flow);
  if (flow.stage === 'PREPARATION') completePrepInternal(flow);
  save();
  res.json({ assignment: studentAssignmentView(a, student) });
});

// -------------------- Retellings --------------------
app.get('/api/retellings', requireAuth, (req, res) => {
  const user = req.auth.user;
  let list = store().retellings;
  if (user.role === 'STUDENT') {
    list = list.filter((r) => r.studentId === user.id);
  } else {
    const myStudents = new Set(store().users.filter((u) => u.teacherId === user.id).map((u) => u.id));
    list = list.filter((r) => myStudents.has(r.studentId));
    if (req.query.status === 'pending') {
      list = list.filter((r) => r.status === 'SUBMITTED' || r.status === 'IN_REVIEW');
    }
    if (req.query.language) {
      const lang = parseLang(req.query.language);
      list = list.filter((r) => {
        const a = getAssignment(r.assignmentId);
        return a && assignmentLang(a) === lang;
      });
    }
  }
  list = list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).map((r) => publicRetelling(r));
  res.json({ retellings: list });
});

app.get('/api/retellings/:id', requireAuth, (req, res) => {
  const r = store().retellings.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Пересказ не найден.' });
  const user = req.auth.user;
  const student = store().users.find((u) => u.id === r.studentId);
  const assignment = getAssignment(r.assignmentId);
  if (user.role === 'STUDENT') {
    if (r.studentId !== user.id) return res.status(403).json({ error: 'Нет доступа к этой записи.' });
  } else if (user.role === 'TEACHER') {
    if (!teacherOwnsStudent(user, student)) return res.status(403).json({ error: 'Нет доступа к этой записи.' });
    if (r.status === 'SUBMITTED') {
      r.status = 'IN_REVIEW';
      save();
    }
  } else {
    return res.status(403).json({ error: 'Нет доступа.' });
  }
  const includeText = user.role === 'TEACHER';
  res.json({
    retelling: publicRetelling(r),
    assignment: assignment ? stripText(assignment, { includeText }) : null,
    student: student ? { id: student.id, name: student.name, code: user.role === 'TEACHER' ? student.code : undefined } : null,
  });
});

app.get('/api/retellings/:id/media', requireAuth, (req, res) => {
  const r = store().retellings.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Файл не найден.' });
  const user = req.auth.user;
  const student = store().users.find((u) => u.id === r.studentId);
  if (user.role === 'STUDENT' && r.studentId !== user.id) {
    return res.status(403).json({ error: 'Нет доступа к этой записи.' });
  }
  if (user.role === 'TEACHER' && !teacherOwnsStudent(user, student)) {
    return res.status(403).json({ error: 'Нет доступа к этой записи.' });
  }
  const filePath = path.join(db.UPLOADS_DIR, path.basename(r.mediaPath));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл записи отсутствует на сервере.' });
  res.setHeader('Content-Type', r.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  res.sendFile(filePath);
});

function handleUpload(req, res) {
  const user = req.auth.user;
  const assignmentId = String(req.body?.assignmentId || '');
  const type = String(req.body?.type || '').toUpperCase();
  const duration = Number(req.body?.duration);
  const a = getAssignment(assignmentId);
  if (!a) return res.status(404).json({ error: 'Задание не найдено.' });
  refreshAssignmentStatus(a);
  if (!assignedTo(a.id, user.id)) return res.status(403).json({ error: 'Это задание вам не назначено.' });
  if (a.status === 'DRAFT') return res.status(400).json({ error: 'Задание ещё не опубликовано.' });
  if (a.status === 'EXPIRED' || (a.deadline && new Date(a.deadline) < now())) {
    a.status = a.status === 'EXPIRED' ? a.status : 'EXPIRED';
    save();
    return res.status(400).json({ error: 'Срок выполнения задания истёк. Отправка невозможна.' });
  }
  if (!['AUDIO', 'VIDEO'].includes(type)) return res.status(400).json({ error: 'Укажите тип записи: AUDIO или VIDEO.' });
  if (a.mode !== 'BOTH' && a.mode !== type) {
    return res.status(400).json({ error: 'Этот формат записи не разрешён для задания.' });
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: 'Некорректная длительность записи.' });
  }
  if (duration > a.retellingTime + 20) {
    return res.status(400).json({ error: 'Запись длиннее разрешённого времени пересказа.' });
  }
  if (store().retellings.some((r) => r.assignmentId === a.id && r.studentId === user.id)) {
    return res.status(400).json({ error: 'Пересказ по этому заданию уже отправлен.' });
  }
  const flow = getFlow(a.id, user.id);
  if (!flow) return res.status(400).json({ error: 'Сначала пройдите чтение и подготовку.' });
  syncFlow(flow, a);
  if (flow.stage === 'READING' || flow.stage === 'PREPARATION') {
    return res.status(400).json({ error: 'Сначала завершите чтение и подготовку.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Файл записи не получен.' });
  if (!req.file.size || req.file.size < 200) {
    try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    return res.status(400).json({ error: 'Файл записи пустой. Запишите пересказ ещё раз.' });
  }

  const retelling = {
    id: db.id('r'),
    assignmentId: a.id,
    studentId: user.id,
    type,
    mediaPath: req.file.filename,
    mimeType: mimeBase(req.file.mimetype),
    duration: Math.round(duration),
    submittedAt: iso(),
    status: 'SUBMITTED',
    scores: null,
    teacherComment: '',
    recommendations: '',
    strengths: '',
    improvements: '',
    aiAnalysis: null,
    reviewedAt: null,
    reviewedBy: null,
  };
  store().retellings.push(retelling);
  flow.stage = 'SUBMITTED';
  flow.updatedAt = iso();
  user.lastActiveAt = iso();
  const teacher = store().users.find((u) => u.id === a.teacherId);
  if (teacher) {
    notify(teacher.id, {
      type: 'SUBMISSION',
      title: 'Новый пересказ на проверку',
      body: `${user.name} отправил(а) пересказ «${a.title}».`,
      link: `#teacher-review-detail/${retelling.id}`,
    });
  }
  refreshAssignmentStatus(a);
  save();
  res.status(201).json({ retelling: publicRetelling(retelling) });
}

app.post('/api/retellings', requireAuth, requireRole('STUDENT'), (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Файл слишком большой. Максимум 120 МБ.'
        : (err.message || 'Не удалось загрузить файл.');
      return res.status(400).json({ error: msg });
    }
    handleUpload(req, res);
  });
});

app.post('/api/retellings/:id/review', requireAuth, requireRole('TEACHER'), (req, res) => {
  const r = store().retellings.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Пересказ не найден.' });
  const student = store().users.find((u) => u.id === r.studentId);
  if (!teacherOwnsStudent(req.auth.user, student)) {
    return res.status(403).json({ error: 'Нельзя оценивать чужого ученика.' });
  }
  const b = req.body || {};
  const scores = {};
  for (const key of CRITERIA) {
    const n = Number(b[key]);
    if (!Number.isFinite(n) || n < 0 || n > 20) {
      return res.status(400).json({ error: 'Каждый критерий должен быть числом от 0 до 20.' });
    }
    scores[key] = Math.round(n);
  }
  scores.totalScore = CRITERIA.reduce((s, k) => s + scores[k], 0);
  r.scores = scores;
  r.teacherComment = String(b.teacherComment || '').trim();
  r.recommendations = String(b.recommendations || '').trim();
  r.strengths = String(b.strengths || '').trim();
  r.improvements = String(b.improvements || '').trim();
  r.status = 'REVIEWED';
  r.reviewedAt = iso();
  r.reviewedBy = req.auth.user.id;
  const assignment = getAssignment(r.assignmentId);
  notify(student.id, {
    type: 'REVIEW',
    title: 'Пересказ проверен',
    body: `Оценка за «${assignment ? assignment.title : 'задание'}»: ${scores.totalScore} / 100.`,
    link: `#retell-result/${r.id}`,
  });
  save();
  res.json({ retelling: publicRetelling(r) });
});

app.post('/api/retellings/:id/ai-analyze', requireAuth, requireRole('TEACHER'), (req, res) => {
  const r = store().retellings.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Пересказ не найден.' });
  const student = store().users.find((u) => u.id === r.studentId);
  if (!teacherOwnsStudent(req.auth.user, student)) {
    return res.status(403).json({ error: 'Нет доступа к этой записи.' });
  }
  if (!process.env.AI_API_KEY) {
    return res.status(501).json({
      configured: false,
      error: 'AI API не подключён. Окончательную оценку ставит учитель.',
    });
  }
  return res.status(501).json({
    configured: false,
    error: 'AI API указан, но провайдер ещё не подключён.',
  });
});

// -------------------- Student dashboard / progress --------------------
app.get('/api/student/dashboard', requireAuth, requireRole('STUDENT'), (req, res) => {
  const user = req.auth.user;
  const stats = studentStats(user.id);
  const ids = store().assignmentStudents.filter((x) => x.studentId === user.id).map((x) => x.assignmentId);
  const assignments = ids
    .map(getAssignment)
    .filter((a) => a && a.status !== 'DRAFT' && assignmentLang(a) === userLang(user))
    .map((a) => studentAssignmentView(a, user));
  const next = assignments.find((a) => a.studentStatus === 'NOT_STARTED' || a.studentStatus === 'READING' || a.studentStatus === 'PREPARATION' || a.studentStatus === 'RECORDING')
    || assignments.find((a) => a.studentStatus !== 'REVIEWED' && a.studentStatus !== 'SUBMITTED');
  const notifications = store().notifications.filter((n) => n.userId === user.id && !n.read);
  save();
  res.json({
    user: publicUser(user),
    stats,
    nextAssignment: next || null,
    assignments: assignments.slice(0, 8),
    unread: notifications.length,
    literacy: literacyStatsForStudent(user.id),
  });
});

app.get('/api/student/progress', requireAuth, requireRole('STUDENT'), (req, res) => {
  res.json({ stats: studentStats(req.auth.user.id) });
});

const GAME_PASSAGES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'game-passages.json'), 'utf8'));

function studentHasSeenText(assignment, student) {
  const retelling = store().retellings.find((r) => r.assignmentId === assignment.id && r.studentId === student.id);
  if (retelling) return true;
  const flow = getFlow(assignment.id, student.id);
  if (!flow) return false;
  if (flow.readingCompletedAt) return true;
  return !!(flow.stage && flow.stage !== 'READING');
}

function storyPieces(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const parts = [];
  String(text || '').replace(/[^.!?…\n]+[.!?…]*/g, (m) => {
    const t = m.replace(/\s+/g, ' ').trim();
    if (t.length > 6) parts.push(t);
    return m;
  });
  let pieces = parts;
  if (pieces.length < 3) {
    pieces = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (pieces.length < 3) {
    const words = raw.split(/\s+/).filter(Boolean);
    const size = Math.max(5, Math.ceil(words.length / 4));
    pieces = [];
    for (let i = 0; i < words.length; i += size) pieces.push(words.slice(i, i + size).join(' '));
  }
  return pieces.filter(Boolean).slice(0, 8);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function studentSeenAssignments(user) {
  const ids = store().assignmentStudents.filter((x) => x.studentId === user.id).map((x) => x.assignmentId);
  const assigned = ids.map(getAssignment).filter((a) => a && a.status !== 'DRAFT');
  const seen = assigned.filter((a) => studentHasSeenText(a, user) && String(a.text || '').trim());
  const pendingCount = assigned.filter((a) => !studentHasSeenText(a, user)).length;
  return { assigned, seen, pendingCount };
}

function pickPassage() {
  const list = GAME_PASSAGES.filter((p) => p && p.text);
  return list[Math.floor(Math.random() * list.length)] || GAME_PASSAGES[0];
}

function buildStoryPayload(title, text, extra = {}) {
  const pieces = storyPieces(text);
  if (pieces.length < 3) return null;
  return {
    available: true,
    title,
    sentences: shuffleInPlace(pieces.map((sentence, correct) => ({
      id: String(correct),
      text: sentence,
      correct,
    }))),
    ...extra,
  };
}

function makeCloze(title, text, source) {
  const tokens = String(text || '').split(/(\s+)/);
  const wordIdx = [];
  tokens.forEach((tok, i) => {
    const clean = tok.replace(/^[«"'(]+|[.,!?;:»"')]+$/g, '');
    if (/^[А-Яа-яЁёA-Za-z]{5,}$/.test(clean)) wordIdx.push({ i, word: clean });
  });
  shuffleInPlace(wordIdx);
  const picked = wordIdx.slice(0, Math.min(5, wordIdx.length)).sort((a, b) => a.i - b.i);
  if (picked.length < 3) return null;
  const bank = shuffleInPlace(picked.map((p) => p.word));
  picked.forEach((p, n) => {
    tokens[p.i] = `{{${n}}}`;
  });
  return {
    title,
    source,
    template: tokens.join(''),
    blanks: picked.map((p, n) => ({ i: n, word: p.word })),
    bank,
  };
}

app.get('/api/games', requireAuth, requireRole('STUDENT'), (req, res) => {
  const { seen, pendingCount } = studentSeenAssignments(req.auth.user);
  res.json({
    pendingCount,
    assignmentTitle: seen[0]?.title || null,
    games: [
      { id: 'story', title: 'Собери историю', skill: 'Порядок событий', ready: true },
      { id: 'idea', title: 'Главная мысль', skill: 'Понимание текста', ready: true },
      { id: 'cloze', title: 'Вставь слово', skill: 'Словарный запас', ready: true },
      { id: 'memory', title: 'Память текста', skill: 'Внимательное чтение', ready: true },
      { id: 'sprint', title: 'Спринт грамотности', skill: 'Орфография и речь', ready: true },
    ],
  });
});

app.get('/api/games/story', requireAuth, requireRole('STUDENT'), (req, res) => {
  const { seen, pendingCount } = studentSeenAssignments(req.auth.user);
  const pick = seen[0] || null;
  if (pick) {
    const payload = buildStoryPayload(pick.title, pick.text, {
      pendingCount,
      assignmentId: pick.id,
      source: 'assignment',
    });
    if (payload) return res.json(payload);
  }
  const passage = pickPassage();
  const payload = buildStoryPayload(passage.title, passage.text, {
    pendingCount,
    source: 'practice',
    passageId: passage.id,
  });
  if (!payload) return res.json({ available: false, pendingCount, title: null, sentences: [] });
  res.json(payload);
});

app.get('/api/games/idea', requireAuth, requireRole('STUDENT'), (_req, res) => {
  const p = pickPassage();
  res.json({
    title: p.title,
    skill: p.skill,
    text: p.text,
    options: p.mainOptions,
    correct: p.mainCorrect,
    why: p.mainWhy,
  });
});

app.get('/api/games/cloze', requireAuth, requireRole('STUDENT'), (req, res) => {
  const { seen } = studentSeenAssignments(req.auth.user);
  let title;
  let text;
  let source;
  if (seen[0]) {
    title = seen[0].title;
    text = seen[0].text;
    source = 'assignment';
  } else {
    const p = pickPassage();
    title = p.title;
    text = p.text;
    source = 'practice';
  }
  const cloze = makeCloze(title, text, source);
  if (!cloze) return res.status(400).json({ error: 'Для этой игры нужен более длинный текст.' });
  res.json(cloze);
});

app.get('/api/games/memory', requireAuth, requireRole('STUDENT'), (_req, res) => {
  const p = pickPassage();
  res.json({
    title: p.title,
    text: p.text,
    seconds: 20,
    facts: shuffleInPlace((p.facts || []).map((f, i) => ({ id: i, q: f.q, a: !!f.a }))),
  });
});

app.get('/api/games/sprint', requireAuth, requireRole('STUDENT'), (_req, res) => {
  const bank = shuffleInPlace([...literacy.orderedBank()]);
  const questions = bank.slice(0, 8).map((q) => ({
    ...literacy.publicQuestion(q),
    correctIndex: q.correctIndex,
  }));
  res.json({ questions, total: questions.length });
});

// -------------------- Teacher --------------------
app.get('/api/teacher/students', requireAuth, requireRole('TEACHER'), (req, res) => {
  const teacher = req.auth.user;
  const langFilter = req.query.language ? parseLang(req.query.language) : null;
  const levelFilter = parseLevelOrAll(req.query.level);
  const students = store().users
    .filter((u) => u.role === 'STUDENT' && u.teacherId === teacher.id)
    .filter((u) => !langFilter || userLang(u) === langFilter)
    .filter((u) => !levelFilter || userLevel(u) === levelFilter)
    .map((u) => {
      const st = studentStats(u.id);
      return {
        id: u.id,
        name: u.name,
        code: u.code,
        lastActiveAt: u.lastActiveAt,
        language: userLang(u),
        enrollmentLevel: userLevel(u),
        ...st,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  res.json({ students });
});

app.get('/api/teacher/students/:id', requireAuth, requireRole('TEACHER'), (req, res) => {
  const student = store().users.find((u) => u.id === req.params.id);
  if (!student || !teacherOwnsStudent(req.auth.user, student)) {
    return res.status(403).json({ error: 'Нет доступа к этому ученику.' });
  }
  const assignments = store().assignmentStudents
    .filter((x) => x.studentId === student.id)
    .map((x) => getAssignment(x.assignmentId))
    .filter(Boolean)
    .map((a) => studentAssignmentView(a, student));
  const retellings = store().retellings
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .map((r) => publicRetelling(r));
  res.json({
    student: { ...publicUser(student), ...studentStats(student.id) },
    assignments,
    retellings,
    literacy: literacyStatsForStudent(student.id),
  });
});

function trackBundle(teacherId, lang) {
  const language = parseLang(lang);
  const students = studentsOfTeacher(teacherId, { language });
  const levels = { BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 };
  students.forEach((s) => {
    levels[userLevel(s)] += 1;
  });
  const assignments = store().assignments.filter((a) => a.teacherId === teacherId && assignmentLang(a) === language && a.status !== 'DRAFT');
  const studentIds = new Set(students.map((s) => s.id));
  const pending = store().retellings.filter((r) => {
    if (!studentIds.has(r.studentId) || (r.status !== 'SUBMITTED' && r.status !== 'IN_REVIEW')) return false;
    const a = getAssignment(r.assignmentId);
    return a && assignmentLang(a) === language;
  });
  const lessons = (store().lessons || []).filter((l) => l.teacherId === teacherId && parseLang(l.language) === language);
  return {
    language,
    students: students.length,
    levels,
    assignments: assignments.length,
    pending: pending.length,
    videos: lessons.filter((l) => l.section === 'VIDEO').length,
    bonuses: lessons.filter((l) => l.section === 'BONUS').length,
  };
}

app.get('/api/teacher/dashboard', requireAuth, requireRole('TEACHER'), (req, res) => {
  const teacher = req.auth.user;
  const students = store().users.filter((u) => u.role === 'STUDENT' && u.teacherId === teacher.id);
  const myStudentIds = new Set(students.map((s) => s.id));
  const myAssignments = store().assignments.filter((a) => a.teacherId === teacher.id && a.status !== 'DRAFT');
  myAssignments.forEach(refreshAssignmentStatus);
  const rets = store().retellings.filter((r) => myStudentIds.has(r.studentId));
  const pending = rets.filter((r) => r.status === 'SUBMITTED' || r.status === 'IN_REVIEW');
  const reviewed = rets.filter((r) => r.status === 'REVIEWED' && r.scores);
  const avg = reviewed.length
    ? Math.round((reviewed.reduce((s, r) => s + r.scores.totalScore, 0) / reviewed.length) * 10) / 10
    : null;

  const active = myAssignments.filter((a) => a.status === 'ACTIVE');
  let doneStudents = 0;
  let notDoneStudents = 0;
  students.forEach((s) => {
    const need = store().assignmentStudents.filter((x) => {
      const a = getAssignment(x.assignmentId);
      return x.studentId === s.id && a && a.teacherId === teacher.id && a.status !== 'DRAFT';
    });
    if (!need.length) return;
    const submitted = new Set(rets.filter((r) => r.studentId === s.id).map((r) => r.assignmentId));
    if (need.every((x) => submitted.has(x.assignmentId))) doneStudents += 1;
    else notDoneStudents += 1;
  });

  const activityCounts = [0, 0, 0, 0, 0, 0, 0];
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  rets.forEach((r) => {
    const d = new Date(r.submittedAt);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((startToday - d) / 86400000);
    if (diff >= 0 && diff < 7) activityCounts[6 - diff] += 1;
  });

  save();
  res.json({
    totals: {
      students: students.length,
      completed: doneStudents,
      notCompleted: notDoneStudents,
      inReview: pending.length,
      avgScore: avg,
      activeAssignments: active.length,
    },
    activity: activityCounts,
    pending: pending.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 8).map((r) => publicRetelling(r)),
    tracks: {
      RU: trackBundle(teacher.id, 'RU'),
      EN: trackBundle(teacher.id, 'EN'),
    },
  });
});

app.get('/api/teacher/stats', requireAuth, requireRole('TEACHER'), (req, res) => {
  const teacher = req.auth.user;
  const langFilter = req.query.language ? parseLang(req.query.language) : null;
  const students = store().users.filter((u) => u.role === 'STUDENT' && u.teacherId === teacher.id && (!langFilter || userLang(u) === langFilter));
  const myStudentIds = new Set(students.map((s) => s.id));
  const reviewed = store().retellings.filter((r) => myStudentIds.has(r.studentId) && r.status === 'REVIEWED' && r.scores);
  const criteria = {};
  CRITERIA.forEach((k) => {
    const vals = reviewed.map((r) => r.scores[k]);
    criteria[k] = vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length / 20) * 100) : 0;
  });
  const levels = { 'Нет оценок': 0, 'Начальный': 0, 'Базовый': 0, 'Средний': 0, 'Продвинутый': 0, 'Высокий': 0 };
  students.forEach((s) => {
    const st = studentStats(s.id);
    const key = st.completedCount ? st.level : 'Нет оценок';
    levels[key] = (levels[key] || 0) + 1;
  });
  const weekAvg = [];
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const from = new Date(startToday.getTime() - i * 86400000);
    const to = new Date(from.getTime() + 86400000);
    const chunk = reviewed.filter((r) => {
      const d = new Date(r.reviewedAt || r.submittedAt);
      return d >= from && d < to;
    });
    weekAvg.push(chunk.length
      ? Math.round((chunk.reduce((s, r) => s + r.scores.totalScore, 0) / chunk.length) * 10) / 10
      : 0);
  }
  res.json({
    avgScore: reviewed.length
      ? Math.round((reviewed.reduce((s, r) => s + r.scores.totalScore, 0) / reviewed.length) * 10) / 10
      : null,
    criteria,
    levels,
    weekAvg,
    reviewedCount: reviewed.length,
    studentsCount: students.length,
  });
});

function honestLiteracyResult(result) {
  if (!result) return null;
  const level = literacy.displayLevel(result.level);
  return {
    ...result,
    level,
    levelTitle: literacy.levelTitle(level) || result.levelTitle || '',
  };
}

function pruneStaleNotifications() {
  const titles = new Set((store().lessons || []).map((l) => l.title));
  const before = store().notifications.length;
  store().notifications = (store().notifications || []).filter((n) => {
    if (n.type !== 'LESSON') return true;
    const m = String(n.body || '').match(/добавила?:\s*(.+)$/i);
    if (!m) return true;
    return titles.has(m[1].trim());
  }).map((n) => {
    if (n.type === 'LITERACY' && n.body) {
      n.body = String(n.body)
        .replace(/\(C1\)/g, '(Продвинутый)')
        .replace(/\(B2\)/g, '(Хороший)')
        .replace(/\(B1\)/g, '(Средний)')
        .replace(/\(A2\)/g, '(Базовый)')
        .replace(/\(A1\)/g, '(Начальный)');
    }
    return n;
  });
  if (store().notifications.length !== before) save();
}

function publicLiteracyAttempt(a, { includeAnswers = false } = {}) {
  const quiz = a.quizId ? quizzes.getQuiz(a.quizId) : null;
  const subject = a.subjectId ? quizzes.getSubject(a.subjectId) : null;
  const locale = subject?.uiLocale === 'en' ? 'en' : 'ru';
  const out = {
    id: a.id,
    studentId: a.studentId,
    quizId: a.quizId || 'quiz-ru-literacy',
    subjectId: a.subjectId || 'sub-russian',
    quizTitle: quiz ? (locale === 'en' ? quiz.title : (quiz.titleRu || quiz.title)) : null,
    subjectSlug: subject?.slug || 'russian',
    uiLocale: locale,
    status: a.status,
    startedAt: a.startedAt,
    completedAt: a.completedAt || null,
    result: honestLiteracyResult(a.result),
    answeredCount: Object.keys(a.answers || {}).length,
    questionCount: (a.questionIds || []).length,
  };
  if (includeAnswers && a.status === 'IN_PROGRESS') out.answers = a.answers || {};
  return out;
}

function literacyStatsForStudent(studentId, { quizId, subjectId } = {}) {
  const done = store().literacyAttempts
    .filter((a) => {
      if (a.studentId !== studentId || a.status !== 'COMPLETED' || !a.result) return false;
      if (quizId && a.quizId !== quizId) return false;
      if (subjectId && a.subjectId !== subjectId) return false;
      return true;
    })
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  if (!done.length) {
    return {
      attempts: 0,
      lastPercent: null,
      lastLevel: null,
      lastAt: null,
      avgPercent: null,
      lastCategories: null,
      weakTopics: [],
      history: [],
    };
  }
  const percents = done.map((a) => a.result.percent);
  const last = done[done.length - 1];
  return {
    attempts: done.length,
    lastPercent: last.result.percent,
    lastLevel: literacy.displayLevel(last.result.level),
    lastLevelTitle: literacy.levelTitle(last.result.level) || last.result.levelTitle,
    lastAt: last.completedAt,
    avgPercent: Math.round(percents.reduce((s, n) => s + n, 0) / percents.length),
    lastCategories: last.result.categories,
    weakTopics: (last.result.topics || []).filter((t) => t.weak).slice(0, 4),
    history: done.map((a) => ({
      id: a.id,
      quizId: a.quizId || 'quiz-ru-literacy',
      subjectId: a.subjectId || 'sub-russian',
      completedAt: a.completedAt,
      percent: a.result.percent,
      level: literacy.displayLevel(a.result.level),
      correctCount: a.result.correctCount,
      total: a.result.total,
    })),
  };
}

function findInProgressAttempt(studentId, quizId) {
  return store().literacyAttempts.find(
    (a) => a.studentId === studentId && a.status === 'IN_PROGRESS' && a.quizId === quizId
  );
}

function startQuizAttempt(student, quiz) {
  let attempt = findInProgressAttempt(student.id, quiz.id);
  if (!attempt) {
    const bank = quizzes.questionsForQuiz(quiz);
    if (!bank.length) {
      const err = new Error(quiz.subjectId === 'sub-english' ? 'No questions in this quiz.' : 'В этом тесте пока нет вопросов.');
      err.status = 400;
      throw err;
    }
    attempt = {
      id: db.id('lt'),
      studentId: student.id,
      quizId: quiz.id,
      subjectId: quiz.subjectId,
      status: 'IN_PROGRESS',
      questionIds: bank.map((q) => q.id),
      answers: {},
      startedAt: iso(),
      completedAt: null,
      result: null,
    };
    store().literacyAttempts.push(attempt);
    save();
  }
  const subject = quizzes.getSubject(quiz.subjectId);
  const locale = subject?.uiLocale === 'en' ? 'en' : 'ru';
  const questions = attempt.questionIds
    .map((id) => quizzes.getQuestion(id))
    .filter(Boolean)
    .map((q) => quizzes.publicQuestion(q, locale));
  return {
    attempt: publicLiteracyAttempt(attempt, { includeAnswers: true }),
    questions,
    quiz: quizzes.publicQuiz(quiz),
  };
}

function answerQuizAttempt(attempt, user, questionId, selectedIndex) {
  if (!attempt || attempt.studentId !== user.id) {
    const err = new Error('Нет доступа к этому тесту.');
    err.status = 403;
    throw err;
  }
  if (attempt.status !== 'IN_PROGRESS') {
    const err = new Error('Тест уже завершён.');
    err.status = 400;
    throw err;
  }
  if (!attempt.questionIds.includes(questionId)) {
    const err = new Error('Такого вопроса нет в этом тесте.');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
    const err = new Error('Выберите один из четырёх вариантов.');
    err.status = 400;
    throw err;
  }
  attempt.answers[questionId] = selectedIndex;
  save();
  return publicLiteracyAttempt(attempt, { includeAnswers: true });
}

function submitQuizAttempt(attempt, user, incomingAnswers) {
  if (!attempt || attempt.studentId !== user.id) {
    const err = new Error('Нет доступа к этому тесту.');
    err.status = 403;
    throw err;
  }
  if (attempt.status === 'COMPLETED') {
    return publicLiteracyAttempt(attempt);
  }
  const incoming = incomingAnswers && typeof incomingAnswers === 'object' ? incomingAnswers : {};
  Object.entries(incoming).forEach(([qid, idx]) => {
    const n = Number(idx);
    if (attempt.questionIds.includes(qid) && Number.isInteger(n) && n >= 0 && n <= 3) {
      attempt.answers[qid] = n;
    }
  });
  const missing = attempt.questionIds.filter((id) => attempt.answers[id] == null);
  if (missing.length) {
    const err = new Error(`Ответьте на все вопросы. Осталось: ${missing.length}.`);
    err.status = 400;
    throw err;
  }
  const subject = quizzes.getSubject(attempt.subjectId);
  const locale = subject?.uiLocale === 'en' ? 'en' : 'ru';
  attempt.result = quizzes.scoreAttempt(attempt.questionIds, attempt.answers, { locale });
  attempt.status = 'COMPLETED';
  attempt.completedAt = iso();
  user.lastActiveAt = iso();
  const teacher = store().users.find((u) => u.id === user.teacherId);
  if (teacher) {
    const quiz = quizzes.getQuiz(attempt.quizId);
    const title = locale === 'en'
      ? (quiz?.title || 'Quiz')
      : (quiz?.titleRu || quiz?.title || 'Тест');
    notify(teacher.id, {
      type: 'LITERACY',
      title: locale === 'en' ? 'Quiz completed' : 'Тест пройден',
      body: `${user.name}: ${attempt.result.percent}% · ${title}`,
      link: `#teacher-literacy`,
    });
  }
  save();
  return publicLiteracyAttempt(attempt);
}

app.get('/api/literacy/meta', requireAuth, requireRole('STUDENT'), (_req, res) => {
  res.json(literacy.meta());
});

app.get('/api/literacy/current', requireAuth, requireRole('STUDENT'), (req, res) => {
  const attempt = findInProgressAttempt(req.auth.user.id, 'quiz-ru-literacy');
  res.json({ attempt: attempt ? publicLiteracyAttempt(attempt, { includeAnswers: true }) : null });
});

app.post('/api/literacy/start', requireAuth, requireRole('STUDENT'), (req, res) => {
  try {
    const quiz = quizzes.getQuiz('quiz-ru-literacy');
    const payload = startQuizAttempt(req.auth.user, quiz);
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка запуска теста.' });
  }
});

app.post('/api/literacy/attempts/:id/answers', requireAuth, requireRole('STUDENT'), (req, res) => {
  try {
    const attempt = store().literacyAttempts.find((a) => a.id === req.params.id);
    const questionId = String(req.body?.questionId || '');
    const selectedIndex = Number(req.body?.selectedIndex);
    const out = answerQuizAttempt(attempt, req.auth.user, questionId, selectedIndex);
    res.json({ attempt: out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Не удалось сохранить ответ.' });
  }
});

app.post('/api/literacy/attempts/:id/submit', requireAuth, requireRole('STUDENT'), (req, res) => {
  try {
    const attempt = store().literacyAttempts.find((a) => a.id === req.params.id);
    const out = submitQuizAttempt(attempt, req.auth.user, req.body?.answers);
    res.json({ attempt: out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Не удалось завершить тест.' });
  }
});

app.get('/api/literacy/attempts/:id', requireAuth, (req, res) => {
  const attempt = store().literacyAttempts.find((a) => a.id === req.params.id);
  if (!attempt) return res.status(404).json({ error: 'Результат не найден.' });
  const user = req.auth.user;
  const student = store().users.find((u) => u.id === attempt.studentId);
  if (user.role === 'STUDENT' && attempt.studentId !== user.id) {
    return res.status(403).json({ error: 'Нет доступа к этому результату.' });
  }
  if (user.role === 'TEACHER' && !teacherOwnsStudent(user, student)) {
    return res.status(403).json({ error: 'Нет доступа к этому результату.' });
  }
  if (user.role === 'STUDENT' && attempt.status === 'IN_PROGRESS') {
    const subject = quizzes.getSubject(attempt.subjectId);
    const locale = subject?.uiLocale === 'en' ? 'en' : 'ru';
    const questions = attempt.questionIds
      .map((id) => quizzes.getQuestion(id))
      .filter(Boolean)
      .map((q) => quizzes.publicQuestion(q, locale));
    return res.json({ attempt: publicLiteracyAttempt(attempt, { includeAnswers: true }), questions });
  }
  res.json({
    attempt: publicLiteracyAttempt(attempt),
    student: student ? { id: student.id, name: student.name } : null,
  });
});

app.get('/api/literacy/history', requireAuth, requireRole('STUDENT'), (req, res) => {
  res.json({ stats: literacyStatsForStudent(req.auth.user.id, { quizId: 'quiz-ru-literacy' }) });
});

app.get('/api/literacy/topics/:slug', requireAuth, (req, res) => {
  const topic = literacy.getTopic(req.params.slug);
  if (!topic) return res.status(404).json({ error: 'Материал не найден.' });
  res.json({ topic });
});

app.get('/api/tests/catalog', requireAuth, requireRole('STUDENT'), (req, res) => {
  const catalog = quizzes.listCatalog().map((subject) => ({
    ...subject,
    quizzes: subject.quizzes.map((q) => {
      const progress = findInProgressAttempt(req.auth.user.id, q.id);
      const stats = literacyStatsForStudent(req.auth.user.id, { quizId: q.id });
      return {
        ...q,
        progress: progress
          ? { attemptId: progress.id, answeredCount: Object.keys(progress.answers || {}).length, questionCount: progress.questionIds.length }
          : null,
        lastPercent: stats.lastPercent,
        attempts: stats.attempts,
      };
    }),
  }));
  res.json({ subjects: catalog });
});

app.get('/api/tests/subjects/:slug', requireAuth, requireRole('STUDENT'), (req, res) => {
  const subject = quizzes.getSubject(req.params.slug);
  if (!subject || !subject.isActive) return res.status(404).json({ error: 'Предмет не найден.' });
  const list = quizzes.listCatalog().find((s) => s.id === subject.id);
  if (!list) return res.status(404).json({ error: 'Предмет не найден.' });
  const quizzesOut = list.quizzes.map((q) => {
    const progress = findInProgressAttempt(req.auth.user.id, q.id);
    const stats = literacyStatsForStudent(req.auth.user.id, { quizId: q.id });
    return {
      ...q,
      progress: progress
        ? { attemptId: progress.id, answeredCount: Object.keys(progress.answers || {}).length, questionCount: progress.questionIds.length }
        : null,
      lastPercent: stats.lastPercent,
      attempts: stats.attempts,
    };
  });
  res.json({
    subject: { ...list, quizzes: quizzesOut },
    stats: literacyStatsForStudent(req.auth.user.id, { subjectId: subject.id }),
  });
});

app.get('/api/tests/quizzes/:id', requireAuth, requireRole('STUDENT'), (req, res) => {
  const quiz = quizzes.getQuiz(req.params.id);
  if (!quiz || !quiz.isActive) return res.status(404).json({ error: 'Тест не найден.' });
  const progress = findInProgressAttempt(req.auth.user.id, quiz.id);
  const stats = literacyStatsForStudent(req.auth.user.id, { quizId: quiz.id });
  res.json({
    quiz: quizzes.publicQuiz(quiz, {
      progress: progress
        ? { attemptId: progress.id, answeredCount: Object.keys(progress.answers || {}).length, questionCount: progress.questionIds.length }
        : null,
    }),
    stats,
  });
});

app.post('/api/tests/quizzes/:id/start', requireAuth, requireRole('STUDENT'), (req, res) => {
  try {
    const quiz = quizzes.getQuiz(req.params.id);
    if (!quiz || !quiz.isActive) return res.status(404).json({ error: 'Тест не найден.' });
    res.json(startQuizAttempt(req.auth.user, quiz));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка запуска теста.' });
  }
});

app.get('/api/tests/current', requireAuth, requireRole('STUDENT'), (req, res) => {
  const quizId = String(req.query.quizId || '');
  if (!quizId) return res.status(400).json({ error: 'Укажите quizId.' });
  const attempt = findInProgressAttempt(req.auth.user.id, quizId);
  res.json({ attempt: attempt ? publicLiteracyAttempt(attempt, { includeAnswers: true }) : null });
});

app.post('/api/tests/attempts/:id/answers', requireAuth, requireRole('STUDENT'), (req, res) => {
  try {
    const attempt = store().literacyAttempts.find((a) => a.id === req.params.id);
    const questionId = String(req.body?.questionId || '');
    const selectedIndex = Number(req.body?.selectedIndex);
    const out = answerQuizAttempt(attempt, req.auth.user, questionId, selectedIndex);
    res.json({ attempt: out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Не удалось сохранить ответ.' });
  }
});

app.post('/api/tests/attempts/:id/submit', requireAuth, requireRole('STUDENT'), (req, res) => {
  try {
    const attempt = store().literacyAttempts.find((a) => a.id === req.params.id);
    const out = submitQuizAttempt(attempt, req.auth.user, req.body?.answers);
    res.json({ attempt: out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Не удалось завершить тест.' });
  }
});

app.get('/api/tests/attempts/:id', requireAuth, (req, res) => {
  const attempt = store().literacyAttempts.find((a) => a.id === req.params.id);
  if (!attempt) return res.status(404).json({ error: 'Результат не найден.' });
  const user = req.auth.user;
  const student = store().users.find((u) => u.id === attempt.studentId);
  if (user.role === 'STUDENT' && attempt.studentId !== user.id) {
    return res.status(403).json({ error: 'Нет доступа к этому результату.' });
  }
  if (user.role === 'TEACHER' && !teacherOwnsStudent(user, student)) {
    return res.status(403).json({ error: 'Нет доступа к этому результату.' });
  }
  if (user.role === 'STUDENT' && attempt.status === 'IN_PROGRESS') {
    const subject = quizzes.getSubject(attempt.subjectId);
    const locale = subject?.uiLocale === 'en' ? 'en' : 'ru';
    const questions = attempt.questionIds
      .map((id) => quizzes.getQuestion(id))
      .filter(Boolean)
      .map((q) => quizzes.publicQuestion(q, locale));
    return res.json({ attempt: publicLiteracyAttempt(attempt, { includeAnswers: true }), questions });
  }
  res.json({
    attempt: publicLiteracyAttempt(attempt),
    student: student ? { id: student.id, name: student.name } : null,
  });
});

app.get('/api/tests/history', requireAuth, requireRole('STUDENT'), (req, res) => {
  const quizId = req.query.quizId ? String(req.query.quizId) : null;
  const subjectId = req.query.subjectId ? String(req.query.subjectId) : null;
  const subjectSlug = req.query.subject ? String(req.query.subject) : null;
  let sid = subjectId;
  if (subjectSlug) {
    const subject = quizzes.getSubject(subjectSlug);
    if (!subject) return res.status(404).json({ error: 'Предмет не найден.' });
    sid = subject.id;
  }
  res.json({ stats: literacyStatsForStudent(req.auth.user.id, { quizId, subjectId: sid }) });
});

app.get('/api/teacher/literacy', requireAuth, requireRole('TEACHER'), (req, res) => {
  const teacher = req.auth.user;
  const students = store().users
    .filter((u) => u.role === 'STUDENT' && u.teacherId === teacher.id)
    .map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      language: u.language || 'RU',
      ...literacyStatsForStudent(u.id),
      russian: literacyStatsForStudent(u.id, { subjectId: 'sub-russian' }),
      english: literacyStatsForStudent(u.id, { subjectId: 'sub-english' }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  res.json({ students });
});

app.get('/api/teacher/literacy/students/:id', requireAuth, requireRole('TEACHER'), (req, res) => {
  const student = store().users.find((u) => u.id === req.params.id);
  if (!student || !teacherOwnsStudent(req.auth.user, student)) {
    return res.status(403).json({ error: 'Нет доступа к этому ученику.' });
  }
  res.json({
    student: {
      id: student.id,
      name: student.name,
      code: student.code,
      language: student.language || 'RU',
      ...literacyStatsForStudent(student.id),
      russian: literacyStatsForStudent(student.id, { subjectId: 'sub-russian' }),
      english: literacyStatsForStudent(student.id, { subjectId: 'sub-english' }),
    },
  });
});

const LESSON_TYPE_META = {
  VIDEO: { label: 'Видеоурок', category: 'Видеоурок' },
  PDF: { label: 'PDF-документ', category: 'Документ' },
  COMPUTER: { label: 'Видеоурок про компьютер', category: 'Компьютер' },
};

function publicLesson(l, { forTeacher = false } = {}) {
  const teacher = store().users.find((u) => u.id === l.teacherId);
  const out = {
    id: l.id,
    teacherId: l.teacherId,
    teacherName: teacher?.name || '',
    section: l.section,
    type: l.type,
    typeLabel: LESSON_TYPE_META[l.type]?.label || l.type,
    title: l.title,
    description: l.description || '',
    category: l.category || LESSON_TYPE_META[l.type]?.category || '',
    level: l.level || '',
    targetLevel: l.targetLevel || null,
    language: parseLang(l.language),
    note: l.note || '',
    videoUrl: l.videoUrl || '',
    duration: l.duration || '',
    createdAt: l.createdAt,
    hasFile: !!l.filePath,
    mimeType: l.mimeType || '',
    originalName: l.originalName || '',
  };
  if (forTeacher) {
    out.studentIds = l.studentIds || [];
    const names = (l.studentIds || [])
      .map((sid) => store().users.find((u) => u.id === sid)?.name)
      .filter(Boolean);
    out.assignedLabel = (l.studentIds || []).length
      ? names.join(', ')
      : (l.targetLevel
        ? `Уровень: ${l.targetLevel === 'INTERMEDIATE' ? 'средний' : l.targetLevel === 'ADVANCED' ? 'продвинутый' : 'начальный'}`
        : 'Всем ученикам раздела');
  }
  return out;
}

function lessonVisibleTo(lesson, user) {
  if (!lesson || !user) return false;
  if (user.role === 'TEACHER') return lesson.teacherId === user.id;
  if (user.role !== 'STUDENT' || lesson.teacherId !== user.teacherId) return false;
  if (parseLang(lesson.language) !== userLang(user)) return false;
  if (lesson.studentIds && lesson.studentIds.length) return lesson.studentIds.includes(user.id);
  if (lesson.targetLevel) return userLevel(user) === parseLevel(lesson.targetLevel);
  return true;
}

function parseStudentIdsField(body) {
  if (body.assignAll === '1' || body.assignAll === 'true') return [];
  const raw = body.studentIds;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

app.get('/api/lessons', requireAuth, (req, res) => {
  const section = String(req.query.section || '').toUpperCase();
  const user = req.auth.user;
  let list = store().lessons || [];
  if (user.role === 'TEACHER') list = list.filter((l) => l.teacherId === user.id);
  else list = list.filter((l) => lessonVisibleTo(l, user));
  if (section === 'VIDEO' || section === 'BONUS') list = list.filter((l) => l.section === section);
  if (req.query.language) {
    const lang = parseLang(req.query.language);
    list = list.filter((l) => parseLang(l.language) === lang);
  }
  list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ lessons: list.map((l) => publicLesson(l, { forTeacher: user.role === 'TEACHER' })) });
});

app.get('/api/lessons/:id', requireAuth, (req, res) => {
  const lesson = store().lessons.find((l) => l.id === req.params.id);
  if (!lesson || !lessonVisibleTo(lesson, req.auth.user)) {
    return res.status(404).json({ error: 'Урок не найден.' });
  }
  const others = store().lessons
    .filter((l) => l.id !== lesson.id && lessonVisibleTo(l, req.auth.user) && l.section === lesson.section)
    .slice(0, 6)
    .map((l) => publicLesson(l, { forTeacher: req.auth.user.role === 'TEACHER' }));
  res.json({
    lesson: publicLesson(lesson, { forTeacher: req.auth.user.role === 'TEACHER' }),
    others,
  });
});

app.get('/api/lessons/:id/file', requireAuth, (req, res) => {
  const lesson = store().lessons.find((l) => l.id === req.params.id);
  if (!lesson || !lessonVisibleTo(lesson, req.auth.user)) {
    return res.status(404).json({ error: 'Файл не найден.' });
  }
  if (!lesson.filePath) return res.status(404).json({ error: 'К этому уроку файл не приложен.' });
  const filePath = path.join(db.LESSONS_DIR, path.basename(lesson.filePath));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден на диске.' });
  const inline = String(lesson.mimeType || '').includes('pdf') || String(lesson.mimeType || '').startsWith('video/');
  res.setHeader('Content-Type', lesson.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(lesson.originalName || 'file')}"`);
  res.sendFile(filePath);
});

app.post('/api/lessons', requireAuth, requireRole('TEACHER'), (req, res) => {
  uploadLesson.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Не удалось загрузить файл.' });
    const teacher = req.auth.user;
    const body = req.body || {};
    const section = String(body.section || '').toUpperCase() === 'BONUS' ? 'BONUS' : 'VIDEO';
    let type = String(body.type || 'VIDEO').toUpperCase();
    if (section === 'VIDEO') type = 'VIDEO';
    if (!['VIDEO', 'PDF', 'COMPUTER'].includes(type)) type = 'VIDEO';
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Укажите название урока.' });
    const videoUrl = String(body.videoUrl || '').trim();
    const file = req.file;
    if (type === 'PDF' && !file) {
      return res.status(400).json({ error: 'Приложите PDF-документ.' });
    }
    if ((type === 'VIDEO' || type === 'COMPUTER') && !file && !videoUrl) {
      return res.status(400).json({ error: 'Загрузите видео или вставьте ссылку (YouTube).' });
    }
    if (file && type === 'PDF') {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const m = mimeBase(file.mimetype);
      if (m !== 'application/pdf' && ext !== '.pdf') {
        try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
        return res.status(400).json({ error: 'Для этого типа нужен PDF-файл.' });
      }
    }
    let studentIds = parseStudentIdsField(body);
    const language = parseLang(body.language);
    const targetLevel = parseLevelOrAll(body.targetLevel);
    const assignAll = body.assignAll === '1' || body.assignAll === 'true' || section === 'VIDEO';
    if (section === 'VIDEO' || assignAll) studentIds = [];
    else if (!studentIds.length) {
      if (file) try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
      return res.status(400).json({ error: 'Выберите учеников или отметьте «Всем ученикам».' });
    }
    studentIds = studentIds.filter((sid) => {
      const s = store().users.find((u) => u.id === sid);
      return teacherOwnsStudent(teacher, s) && userLang(s) === language && (!targetLevel || userLevel(s) === targetLevel);
    });
    const meta = LESSON_TYPE_META[type] || LESSON_TYPE_META.VIDEO;
    const lesson = {
      id: db.id('lsn'),
      teacherId: teacher.id,
      section,
      type,
      title,
      description: String(body.description || '').trim(),
      category: String(body.category || '').trim() || meta.category,
      level: String(body.level || '').trim(),
      targetLevel,
      language,
      note: String(body.note || '').trim(),
      videoUrl,
      duration: String(body.duration || '').trim(),
      filePath: file ? path.basename(file.path) : null,
      mimeType: file ? mimeBase(file.mimetype) : '',
      originalName: file ? file.originalname : '',
      studentIds,
      createdAt: iso(),
    };
    store().lessons.push(lesson);
    const pool = studentsOfTeacher(teacher.id, { language, level: targetLevel });
    const targets = studentIds.length
      ? store().users.filter((u) => studentIds.includes(u.id))
      : pool;
    const link = section === 'BONUS' ? '#bonus-lessons' : '#video-lessons';
    targets.forEach((s) => {
      notify(s.id, {
        type: 'LESSON',
        title: section === 'BONUS' ? 'Новый бонусный урок' : 'Новый видеоурок',
        body: `${teacher.name} добавила: ${title}`,
        link,
      });
    });
    save();
    res.status(201).json({ lesson: publicLesson(lesson, { forTeacher: true }) });
  });
});

app.delete('/api/lessons/:id', requireAuth, requireRole('TEACHER'), (req, res) => {
  const idx = store().lessons.findIndex((l) => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Урок не найден.' });
  const lesson = store().lessons[idx];
  if (lesson.teacherId !== req.auth.user.id) {
    return res.status(403).json({ error: 'Нет доступа к этому уроку.' });
  }
  if (lesson.filePath) {
    const filePath = path.join(db.LESSONS_DIR, path.basename(lesson.filePath));
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  }
  store().lessons.splice(idx, 1);
  save();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  setHeaders(res, filePath) {
    if (/\.(?:js|css|html)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Маршрут не найден.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
});

app.listen(PORT, () => {
  pruneStaleNotifications();
  const teacher = store().users.find((u) => u.role === 'TEACHER');
  const student = store().users.find((u) => u.role === 'STUDENT');
  console.log(`Пересказ: http://localhost:${PORT}`);
  if (teacher) console.log(`Учитель — код: ${teacher.code}`);
  console.log('Ученик — регистрация: имя и пароль');
});
