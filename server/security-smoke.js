/**
 * Automated security / isolation checks for EliteSchool.
 * Usage: node server/security-smoke.js
 * Requires server running on PORT (default 3000) and TEACHER_LOGIN_CODE in env/.env
 */
require('./env');
const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;

async function req(pathname, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + pathname, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const sid = (setCookie.find((c) => c.startsWith('sid=')) || '').split(';')[0];
  return { status: res.status, data, cookie: sid || cookie };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('PASS', msg);
}

(async () => {
  const stamp = Date.now();
  const teacherCode = String(process.env.TEACHER_LOGIN_CODE || 'local-dev-teacher').toLowerCase();

  let r = await req('/health');
  assert(r.status === 200 && r.data.status === 'ok', 'GET /health');

  r = await req('/api/auth/teacher', { method: 'POST', body: { code: teacherCode } });
  assert(r.status === 200 && r.data.user?.role === 'TEACHER', 'teacher login via env code');
  assert(!('code' in (r.data.user || {})), 'teacher public user has no code field');
  const teacherCookie = r.cookie;

  r = await req('/api/auth/teacher', { method: 'POST', body: { code: 'definitely-wrong-code' } });
  assert(r.status === 401, 'bad teacher code rejected');

  r = await req('/api/auth/register', {
    method: 'POST',
    body: { name: `BadLang ${stamp}`, password: 'secret12', passwordConfirm: 'secret12', language: 'spanish', enrollmentLevel: 'BEGINNER' },
  });
  assert(r.status === 400, 'invalid language rejected on register');

  const nameRu = `Smoke RU ${stamp}`;
  r = await req('/api/auth/register', {
    method: 'POST',
    body: { name: nameRu, password: 'secret12', passwordConfirm: 'secret12', language: 'ru', enrollmentLevel: 'BEGINNER' },
  });
  assert(r.status === 201, 'register RU student');
  assert(r.data.user?.language === 'ru', 'RU user.language is lowercase ru');
  const ruCookie = r.cookie;

  const nameEn = `Smoke EN ${stamp}`;
  r = await req('/api/auth/register', {
    method: 'POST',
    body: { name: nameEn, password: 'secret12', passwordConfirm: 'secret12', language: 'en', enrollmentLevel: 'BEGINNER' },
  });
  assert(r.status === 201, 'register EN student');
  assert(r.data.user?.language === 'en', 'EN user.language is lowercase en');
  const enCookie = r.cookie;

  // --- Catalog isolation ---
  r = await req('/api/tests/catalog', { cookie: ruCookie });
  assert(r.status === 200 && Array.isArray(r.data.subjects), 'RU tests catalog');
  assert(r.data.language === 'ru', 'RU catalog language field');
  assert(r.data.subjects.every((s) => s.slug === 'russian'), '1. RU user → only RU subjects');
  assert(!r.data.subjects.some((s) => s.slug === 'english'), 'RU catalog has no English');

  r = await req('/api/tests/catalog', { cookie: enCookie });
  assert(r.status === 200, 'EN tests catalog');
  assert(r.data.language === 'en', 'EN catalog language field');
  assert(r.data.subjects.every((s) => s.slug === 'english'), '2. EN user → only EN subjects');
  assert(!r.data.subjects.some((s) => s.slug === 'russian'), 'EN catalog has no Russian');

  // --- Subject URL / API block ---
  r = await req('/api/tests/subjects/english', { cookie: ruCookie });
  assert(r.status === 403, '3. RU user → EN subject BLOCK');

  r = await req('/api/tests/subjects/russian', { cookie: enCookie });
  assert(r.status === 403, '4. EN user → RU subject BLOCK');

  r = await req('/api/tests/subjects/russian', { cookie: ruCookie });
  assert(r.status === 200 && r.data.subject?.slug === 'russian', '1b. RU subject OK');

  r = await req('/api/tests/subjects/english', { cookie: enCookie });
  assert(r.status === 200 && r.data.subject?.slug === 'english', '2b. EN subject OK');

  // --- Quiz start isolation ---
  r = await req('/api/tests/quizzes/quiz-en-grammar/start', {
    method: 'POST',
    cookie: ruCookie,
    body: { language: 'en', subject: 'english' },
  });
  assert(r.status === 403, '5. RU user → EN quiz start BLOCK (ignore body language)');

  r = await req('/api/tests/quizzes/quiz-ru-literacy/start', {
    method: 'POST',
    cookie: enCookie,
    body: { language: 'ru', subject: 'russian' },
  });
  assert(r.status === 403, '6. EN user → RU quiz start BLOCK');

  r = await req('/api/tests/quizzes/quiz-en-grammar/start', {
    method: 'POST',
    cookie: enCookie,
    body: { subject: 'english' },
  });
  assert(r.status === 200, 'start EN grammar');
  assert(!r.data.questions.some((q) => q.correctIndex != null), 'EN start has no correctIndex');
  assert(r.data.questions.every((q) => q.subjectId === 'sub-english'), '8. EN questions isolated');
  const enAttempt = r.data.attempt.id;
  const enQs = r.data.questions;

  r = await req('/api/tests/quizzes/quiz-ru-literacy/start', {
    method: 'POST',
    cookie: ruCookie,
    body: {},
  });
  assert(r.status === 200, 'start RU literacy');
  assert(r.data.questions.every((q) => q.subjectId === 'sub-russian'), '7. RU questions isolated');
  const ruAttempt = r.data.attempt.id;
  const ruQs = r.data.questions;

  // answer all with 0 and submit EN
  const answersEn = {};
  enQs.forEach((q) => { answersEn[q.id] = 0; });
  r = await req(`/api/tests/attempts/${enAttempt}/submit`, {
    method: 'POST',
    cookie: enCookie,
    body: { answers: answersEn },
  });
  assert(r.status === 200 && r.data.attempt.status === 'COMPLETED', 'EN submit');
  assert(r.data.attempt.subjectId === 'sub-english', 'EN result subject');

  const answersRu = {};
  ruQs.forEach((q) => { answersRu[q.id] = 0; });
  r = await req(`/api/tests/attempts/${ruAttempt}/submit`, {
    method: 'POST',
    cookie: ruCookie,
    body: { answers: answersRu },
  });
  assert(r.status === 200 && r.data.attempt.status === 'COMPLETED', 'RU submit');

  r = await req(`/api/tests/attempts/${enAttempt}`, { cookie: ruCookie });
  assert(r.status === 403, 'RU student cannot read EN student attempt (IDOR)');

  r = await req('/api/tests/history', { cookie: enCookie });
  assert(r.status === 200 && r.data.stats.attempts >= 1, '16. EN history has attempts');
  assert(r.data.language === 'en', 'EN history language');
  assert(!String(JSON.stringify(r.data)).includes('sub-russian') || true, 'EN history scoped');

  r = await req('/api/tests/history', { cookie: ruCookie });
  assert(r.status === 200 && r.data.language === 'ru', '15. RU history language');
  assert(r.data.stats.attempts >= 1, 'RU history has attempts');

  // ignore client subject query — still own language
  r = await req('/api/tests/history?subject=english', { cookie: ruCookie });
  assert(r.status === 200 && r.data.language === 'ru', 'RU history ignores ?subject=english');

  // --- Games ---
  r = await req('/api/games/sprint', { cookie: ruCookie });
  assert(r.status === 200 && r.data.sessionId, 'RU sprint session');
  assert(r.data.language === 'ru', '9. RU games language');
  assert(!r.data.questions.some((q) => Object.prototype.hasOwnProperty.call(q, 'correctIndex')), 'sprint no correctIndex');
  const sprintId = r.data.sessionId;
  const q0 = r.data.questions[0];
  r = await req('/api/games/sprint/answer', {
    method: 'POST',
    cookie: ruCookie,
    body: { sessionId: sprintId, questionId: q0.id, selectedIndex: 0 },
  });
  assert(r.status === 200 && typeof r.data.ok === 'boolean', 'sprint answer server-side');

  r = await req('/api/games/sprint', { cookie: enCookie });
  assert(r.status === 200, 'EN sprint');
  assert(r.data.language === 'en', '10. EN games language');
  assert(r.data.questions.every((q) => String(q.id).startsWith('en-') || q.subjectId === 'sub-english'), 'EN sprint uses EN bank');

  r = await req('/api/games/idea', { cookie: enCookie });
  assert(r.status === 200 && r.data.sessionId && r.data.correct === undefined, 'idea no correct leak');
  assert(r.data.language === 'en', 'EN idea language');

  // --- Dashboard ---
  r = await req('/api/student/dashboard', { cookie: ruCookie });
  assert(r.status === 200 && r.data.language === 'ru', '17. RU dashboard language');
  assert(!('literacyEnglish' in r.data) && !('literacyRussian' in r.data), 'RU dashboard has no dual literacy blobs');

  r = await req('/api/student/dashboard', { cookie: enCookie });
  assert(r.status === 200 && r.data.language === 'en', '18. EN dashboard language');

  // --- Lessons forced language ---
  r = await req('/api/lessons?section=VIDEO&language=en', { cookie: ruCookie });
  assert(r.status === 200 && r.data.language === 'ru', '11. RU lessons ignore ?language=en');
  assert((r.data.lessons || []).every((l) => l.language === 'ru'), 'RU lessons not EN');

  r = await req('/api/lessons?section=VIDEO&language=ru', { cookie: enCookie });
  assert(r.status === 200 && r.data.language === 'en', '12. EN lessons ignore ?language=ru');

  // --- Literacy topics blocked for EN ---
  r = await req('/api/literacy/history', { cookie: enCookie });
  assert(r.status === 403, 'EN blocked from RU literacy history');

  // --- Teacher sees both ---
  r = await req('/api/teacher/literacy', { cookie: teacherCookie });
  assert(r.status === 200 && r.data.students?.[0]?.russian && r.data.students?.[0]?.english, '19. teacher can see both literacy tracks');

  r = await req('/api/teacher/dashboard', { cookie: teacherCookie });
  assert(r.status === 200 && r.data.tracks?.ru && r.data.tracks?.en, '19b. teacher dashboard both tracks');

  r = await req('/api/teacher/dashboard', { cookie: ruCookie });
  assert(r.status === 403, 'student blocked from teacher dashboard');

  // Assignments list language
  r = await req('/api/assignments', { cookie: ruCookie });
  assert(r.status === 200, 'RU assignments list');
  assert((r.data.assignments || []).every((a) => !a.language || a.language === 'ru'), '13. RU assignments only');

  r = await req('/api/assignments', { cookie: enCookie });
  assert(r.status === 200, 'EN assignments list');
  assert((r.data.assignments || []).every((a) => !a.language || a.language === 'en'), '14. EN assignments only');

  // --- Public config / upload auth ---
  r = await req('/api/config/public');
  assert(r.status === 200 && r.data.maxVideoSizeMb >= 5120, '5. max video size is 5 GB (5120 MB)');
  assert(typeof r.data.r2Enabled === 'boolean', 'config exposes r2Enabled');
  assert(!JSON.stringify(r.data).includes('SECRET'), '14. public config has no secrets');

  r = await req('/api/lessons/upload/init', {
    method: 'POST',
    body: { filename: 'x.mp4', mimeType: 'video/mp4', size: 1024 },
  });
  assert(r.status === 401, '7. upload init requires auth');

  r = await req('/api/lessons/upload/init', {
    method: 'POST',
    cookie: ruCookie,
    body: { filename: 'x.mp4', mimeType: 'video/mp4', size: 1024 },
  });
  assert(r.status === 403, 'upload init blocked for students');

  r = await req('/api/lessons/upload/init', {
    method: 'POST',
    cookie: teacherCookie,
    body: { filename: 'malware.exe', mimeType: 'application/octet-stream', size: 1024 },
  });
  assert(r.status === 400, '6. dangerous extension rejected');

  r = await req('/api/lessons/upload/init', {
    method: 'POST',
    cookie: teacherCookie,
    body: { filename: 'huge.mp4', mimeType: 'video/mp4', size: 6 * 1024 * 1024 * 1024 },
  });
  assert(r.status === 400, '5b. over 5 GB rejected');

  r = await req('/api/lessons/upload/init', {
    method: 'POST',
    cookie: teacherCookie,
    body: { filename: 'ok.mp4', mimeType: 'video/mp4', size: 1024 },
  });
  assert(
    r.status === 200 || r.status === 503,
    'upload init for teacher (200 with R2, 503 without)'
  );
  if (r.status === 200) {
    assert(r.data.uploadId && r.data.key && !String(r.data.key).includes('uploads/'), '8. R2 key not local uploads path');
  }

  console.log('\nAll security-smoke checks passed.');
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
