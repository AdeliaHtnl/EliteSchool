const BASE = 'http://localhost:3000';
const fs = require('fs');
const path = require('path');

async function req(pathname, { method = 'GET', body, cookie, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + pathname, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const sid = (setCookie.find((c) => c.startsWith('sid=')) || '').split(';')[0];
  return { status: res.status, data, cookie: sid || cookie, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK  ', msg);
}

(async () => {
  let   r = await req('/api/auth/teacher', { method: 'POST', body: { code: 'elite.mugalim35' } });
  assert(r.status === 200 && r.data.user.role === 'TEACHER', 'teacher login');
  const teacher = r.cookie;
  assert(teacher, 'teacher cookie');

  r = await req('/api/auth/teacher', { method: 'POST', body: { code: 'TCH-8842' } });
  assert(r.status === 401, 'old teacher code rejected');

  const stamp = Date.now();
  const studentName = `Тест Ученик ${stamp}`;
  r = await req('/api/auth/register', { method: 'POST', body: { name: studentName, password: 'secret12', passwordConfirm: 'secret12' } });
  assert(r.status === 201 && r.data.user.role === 'STUDENT', 'student register');
  const student = r.cookie;

  r = await req('/api/auth/student', { method: 'POST', body: { name: studentName, password: 'wrong-pass' } });
  assert(r.status === 401, 'wrong student password rejected');

  r = await req('/api/auth/student', { method: 'POST', body: { name: studentName, password: 'secret12' } });
  assert(r.status === 200 && r.data.user.role === 'STUDENT', 'student login');

  r = await req('/api/teacher/dashboard', { cookie: student });
  assert(r.status === 403, 'student blocked from teacher API');

  r = await req('/api/student/dashboard', { cookie: teacher });
  assert(r.status === 403, 'teacher blocked from student API');

  r = await req('/api/teacher/students', { cookie: teacher });
  assert(r.status === 200 && r.data.students.length >= 1, 'teacher students list');
  const newbie = r.data.students.find((s) => s.name === studentName);
  assert(!!newbie, 'registered student appears for teacher');

  r = await req('/api/assignments', {
    method: 'POST',
    cookie: teacher,
    body: {
      title: 'Как зимуют звери',
      description: 'Прочитай и перескажи своими словами.',
      text: 'Каждую осень животные леса готовятся к зиме. Белки прячут орехи. Ежи ищут укромные места. Медведи накапливают жир. Волки и лисы охотятся зимой. Зайцы меняют шубку на белую.',
      readingTime: 8,
      preparationTime: 6,
      retellingTime: 30,
      mode: 'BOTH',
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
      studentIds: [newbie.id],
      status: 'ACTIVE',
    },
  });
  assert(r.status === 201 && r.data.assignment.id, 'create assignment');
  const assignmentId = r.data.assignment.id;

  r = await req('/api/assignments', { cookie: student });
  assert(r.data.assignments.some((a) => a.id === assignmentId), 'student sees assignment');
  assert(!r.data.assignments[0].text, 'list has no text');

  r = await req(`/api/assignments/${assignmentId}`, { cookie: student });
  assert(!r.data.assignment.text, 'intro has no text until start');

  r = await req(`/api/assignments/${assignmentId}/start`, { method: 'POST', cookie: student });
  assert(r.status === 200 && r.data.assignment.text, 'start returns text');
  assert(r.data.assignment.studentStatus === 'READING', 'stage reading');

  r = await req(`/api/assignments/${assignmentId}/complete-reading`, { method: 'POST', cookie: student });
  assert(r.data.assignment.studentStatus === 'PREPARATION', 'stage prep');
  assert(!r.data.assignment.text, 'text hidden after reading');

  r = await req(`/api/assignments/${assignmentId}`, { cookie: student });
  assert(!r.data.assignment.text, 'GET after reading has no text');

  r = await req(`/api/assignments/${assignmentId}/complete-prep`, { method: 'POST', cookie: student });
  assert(r.data.assignment.studentStatus === 'RECORDING', 'stage recording');

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('RIFF....WAVEfmt ')], { type: 'audio/webm' }), 't.webm');
  form.append('assignmentId', assignmentId);
  form.append('type', 'AUDIO');
  form.append('duration', '4');
  r = await req('/api/retellings', { method: 'POST', cookie: student, form });
  assert(r.status === 201 && r.data.retelling.status === 'SUBMITTED', 'upload retelling');
  const retellingId = r.data.retelling.id;

  r = await req('/api/retellings?status=pending', { cookie: teacher });
  assert(r.data.retellings.some((x) => x.id === retellingId), 'teacher sees pending');

  r = await req(`/api/retellings/${retellingId}/media`, { cookie: teacher });
  assert(r.status === 200, 'teacher can fetch media');

  r = await req(`/api/retellings/${retellingId}/media`, { cookie: student });
  assert(r.status === 200, 'owner can fetch media');

  const other = await req('/api/auth/register', { method: 'POST', body: { name: `Другой Ученик ${stamp}`, password: 'secret12', passwordConfirm: 'secret12' } });
  assert(other.status === 201, 'second student register');
  r = await req(`/api/retellings/${retellingId}`, { cookie: other.cookie });
  assert(r.status === 403, 'other student cannot open retelling');
  r = await req(`/api/teacher/students/${newbie.id}`, { cookie: other.cookie });
  assert(r.status === 403, 'student cannot open teacher student API');

  r = await req(`/api/retellings/${retellingId}/review`, {
    method: 'POST',
    cookie: teacher,
    body: {
      contentScore: 18,
      sequenceScore: 16,
      understandingScore: 14,
      speechScore: 15,
      vocabularyScore: 15,
      teacherComment: 'Отличная работа! Хорошо передана последовательность.',
      recommendations: 'Потренируй словарный запас в разделе тренировки.',
      strengths: 'Точная последовательность и уверенная речь.',
      improvements: 'Можно добавить деталь про зайца.',
    },
  });
  assert(r.status === 200 && r.data.retelling.scores.totalScore === 78, 'review saved 78');
  assert(r.data.retelling.status === 'REVIEWED', 'status reviewed');

  r = await req(`/api/retellings/${retellingId}`, { cookie: student });
  assert(r.data.retelling.scores.totalScore === 78, 'student sees score');

  r = await req('/api/student/progress', { cookie: student });
  assert(r.data.stats.completedCount >= 1, 'progress completed count');
  assert(r.data.stats.avgScore != null, 'progress avg');
  assert(r.data.stats.criteria.contentScore != null, 'content criterion present');

  r = await req('/api/student/dashboard', { cookie: student });
  assert(r.data.unread >= 1, 'student notification after review');

  r = await req('/api/teacher/dashboard', { cookie: teacher });
  assert(r.data.totals.students >= 1, 'teacher dashboard totals');

  r = await req(`/api/retellings/${retellingId}/ai-analyze`, { method: 'POST', cookie: teacher });
  assert(r.status === 501 && r.data.configured === false, 'AI not faked');

  r = await req('/api/literacy/meta', { cookie: student });
  assert(r.status === 200 && r.data.questionCount === 20, 'literacy meta 20 questions');
  assert(r.data.instruction.includes('один правильный'), 'literacy instruction');

  r = await req('/api/literacy/meta', { cookie: teacher });
  assert(r.status === 403, 'teacher blocked from student literacy meta');

  r = await req('/api/literacy/start', { method: 'POST', cookie: student });
  assert(r.status === 200 && r.data.questions.length === 20, 'literacy start 20 questions');
  assert(r.data.questions.every((q) => q.correctIndex === undefined && q.options.length === 4), 'answers not leaked to client');
  const litId = r.data.attempt.id;
  const litQuestions = r.data.questions;
  const diffs = ['EASY', 'MEDIUM', 'HARD'];
  const firstDiff = diffs.indexOf(litQuestions[0].difficulty);
  const lastDiff = diffs.indexOf(litQuestions[litQuestions.length - 1].difficulty);
  assert(firstDiff <= lastDiff, 'difficulty increases');

  r = await req('/api/literacy/start', { method: 'POST', cookie: student });
  assert(r.data.attempt.id === litId, 'resume same in-progress attempt');

  r = await req(`/api/literacy/attempts/${litId}/submit`, { method: 'POST', cookie: student, body: { answers: {} } });
  assert(r.status === 400, 'submit rejected until all answered');

  const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'literacy-questions.json'), 'utf8'));
  const litAnswers = {};
  litQuestions.forEach((q, i) => {
    const full = bank.find((b) => b.id === q.id);
    litAnswers[q.id] = i < 15 ? full.correctIndex : (full.correctIndex + 1) % 4;
  });
  const firstQ = litQuestions[0].id;
  r = await req(`/api/literacy/attempts/${litId}/answers`, {
    method: 'POST',
    cookie: student,
    body: { questionId: firstQ, selectedIndex: (litAnswers[firstQ] + 1) % 4 },
  });
  assert(r.status === 200 && r.data.attempt.answers[firstQ] !== litAnswers[firstQ], 'answer can be changed before submit');
  r = await req(`/api/literacy/attempts/${litId}/answers`, {
    method: 'POST',
    cookie: student,
    body: { questionId: firstQ, selectedIndex: litAnswers[firstQ] },
  });
  assert(r.data.attempt.answers[firstQ] === litAnswers[firstQ], 'changed answer saved');

  r = await req(`/api/literacy/attempts/${litId}/submit`, { method: 'POST', cookie: student, body: { answers: litAnswers } });
  assert(r.status === 200 && r.data.attempt.status === 'COMPLETED', 'literacy submitted');
  assert(r.data.attempt.result.correctCount === 15, '15 of 20 correct');
  assert(r.data.attempt.result.percent === 75, '75 percent');
  assert(r.data.attempt.result.level === 'Хороший', 'level Хороший for 75%');
  assert(r.data.attempt.result.categories.ORTHOGRAPHY, 'category scores present');
  assert(Array.isArray(r.data.attempt.result.topics), 'topic analysis present');

  r = await req('/api/literacy/history', { cookie: student });
  assert(r.data.stats.attempts >= 1 && r.data.stats.lastLevel === 'Хороший', 'student history saved');

  r = await req(`/api/literacy/attempts/${litId}`, { cookie: other.cookie });
  assert(r.status === 403, 'other student cannot see literacy result');

  r = await req('/api/teacher/literacy', { cookie: teacher });
  const litMark = r.data.students.find((s) => s.name === studentName);
  assert(!!litMark && litMark.lastPercent === 75 && litMark.lastLevel === 'Хороший', 'teacher sees student literacy result');
  assert(Array.isArray(litMark.weakTopics), 'teacher sees weak topics');
  assert(litMark.history.length >= 1, 'teacher sees dynamics history');

  r = await req(`/api/teacher/literacy/students/${newbie.id}`, { cookie: teacher });
  assert(r.status === 200 && r.data.student.lastPercent === 75, 'teacher student literacy detail');

  r = await req(`/api/literacy/topics/cases`, { cookie: student });
  assert(r.status === 200 && r.data.topic.title.includes('Падеж'), 'learning topic loaded');

  console.log('\nALL API CHECKS PASSED');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
