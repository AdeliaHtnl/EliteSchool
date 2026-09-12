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

  let r = await req('/api/auth/teacher', { method: 'POST', body: { code: teacherCode } });
  assert(r.status === 200 && r.data.user?.role === 'TEACHER', 'teacher login via env code');
  assert(!('code' in (r.data.user || {})), 'teacher public user has no code field');
  const teacherCookie = r.cookie;

  r = await req('/api/auth/teacher', { method: 'POST', body: { code: 'definitely-wrong-code' } });
  assert(r.status === 401, 'bad teacher code rejected');

  const nameRu = `Smoke RU ${stamp}`;
  r = await req('/api/auth/register', {
    method: 'POST',
    body: { name: nameRu, password: 'secret12', passwordConfirm: 'secret12', language: 'RU', enrollmentLevel: 'BEGINNER' },
  });
  assert(r.status === 201, 'register RU student');
  const ruCookie = r.cookie;

  const nameEn = `Smoke EN ${stamp}`;
  r = await req('/api/auth/register', {
    method: 'POST',
    body: { name: nameEn, password: 'secret12', passwordConfirm: 'secret12', language: 'EN', enrollmentLevel: 'BEGINNER' },
  });
  assert(r.status === 201, 'register EN student');
  const enCookie = r.cookie;

  r = await req('/api/tests/catalog', { cookie: ruCookie });
  assert(r.status === 200 && Array.isArray(r.data.subjects), 'tests catalog');
  const enSub = r.data.subjects.find((s) => s.slug === 'english');
  const ruSub = r.data.subjects.find((s) => s.slug === 'russian');
  assert(enSub && ruSub, 'english and russian subjects present');

  r = await req('/api/tests/quizzes/quiz-en-grammar/start', {
    method: 'POST',
    cookie: ruCookie,
    body: { subject: 'russian' },
  });
  assert(r.status === 403, 'cannot start EN quiz with russian subject hint');

  r = await req('/api/tests/quizzes/quiz-en-grammar/start', {
    method: 'POST',
    cookie: enCookie,
    body: { subject: 'english' },
  });
  assert(r.status === 200, 'start EN grammar');
  assert(!r.data.questions.some((q) => q.correctIndex != null), 'EN start has no correctIndex');
  assert(r.data.questions.every((q) => q.subjectId === 'sub-english' || !q.id.startsWith('q-')), 'EN questions isolated');
  const enAttempt = r.data.attempt.id;
  const enQs = r.data.questions;

  // answer all with 0 and submit
  const answers = {};
  enQs.forEach((q) => { answers[q.id] = 0; });
  r = await req(`/api/tests/attempts/${enAttempt}/submit`, {
    method: 'POST',
    cookie: enCookie,
    body: { answers },
  });
  assert(r.status === 200 && r.data.attempt.status === 'COMPLETED', 'EN submit');
  assert(r.data.attempt.subjectId === 'sub-english', 'EN result subject');
  assert(Array.isArray(r.data.attempt.result?.review), 'review after submit');

  r = await req(`/api/tests/attempts/${enAttempt}`, { cookie: ruCookie });
  assert(r.status === 403, 'RU student cannot read EN student attempt (IDOR)');

  r = await req('/api/tests/history?subject=english', { cookie: enCookie });
  assert(r.status === 200 && r.data.stats.attempts >= 1, 'EN history isolated');

  r = await req('/api/games/sprint', { cookie: ruCookie });
  assert(r.status === 200 && r.data.sessionId, 'RU sprint session');
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
  assert(r.data.language === 'EN', 'EN sprint language');
  assert(r.data.questions.every((q) => String(q.id).startsWith('en-')), 'EN sprint uses EN bank');

  r = await req('/api/games/idea', { cookie: enCookie });
  assert(r.status === 200 && r.data.sessionId && r.data.correct === undefined, 'idea no correct leak');

  r = await req('/api/teacher/literacy', { cookie: teacherCookie });
  assert(r.status === 200 && r.data.students?.[0]?.russian && r.data.students?.[0]?.english, 'teacher literacy split');

  r = await req('/api/teacher/dashboard', { cookie: ruCookie });
  assert(r.status === 403, 'student blocked from teacher dashboard');

  console.log('\nAll security-smoke checks passed.');
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
