import { api, friendlyError, hydrateAuthMedia } from './api.js';
import { store, ic, formatTime, ring, skeletonPage, errorState, esc, parseLang, trackSlug, subjectSlugForUser } from './ui.js';
import * as views from './views.js';

const root = document.getElementById('root');
const toastWrap = document.createElement('div');
toastWrap.className = 'toast-wrap';
document.body.appendChild(toastWrap);

const STUDENT_ROUTES = new Set([
  'dashboard', 'retell-list', 'retell-intro', 'retell-read', 'retell-prep', 'retell-record',
  'retell-result', 'video-lessons', 'video-lesson-detail', 'bonus-lessons', 'bonus-lesson-detail',
  'training', 'training-test', 'diagnostic', 'diagnostic-result', 'progress', 'achievements', 'profile',
  'literacy', 'literacy-quiz', 'literacy-result', 'literacy-history', 'literacy-learn',
  'tests', 'tests-quiz', 'tests-result', 'tests-history',
  'games', 'game-story', 'game-idea', 'game-cloze', 'game-memory', 'game-sprint',
]);
const TEACHER_ROUTES = new Set([
  'teacher-dashboard', 'teacher-students', 'teacher-student-detail', 'teacher-assignments',
  'teacher-video-lessons', 'teacher-bonus', 'teacher-create', 'teacher-review', 'teacher-review-detail',
  'teacher-stats', 'teacher-profile', 'teacher-literacy',
  'teacher-video-create', 'teacher-bonus-create', 'teacher-lesson', 'teacher-track',
]);
const PUBLIC_ROUTES = new Set(['landing', 'track', 'student-login', 'student-register', 'teacher-login', '']);

function routeLang(id) {
  if (!id) return store.track || 'ru';
  return parseLang(id);
}

function studentSubjectSlug() {
  return subjectSlugForUser(store.user);
}

/** Central language route guard for students. Returns true if a redirect was issued. */
function ensureLanguageAccess(requiredLanguage) {
  if (!store.user || store.user.role !== 'STUDENT') return false;
  const userLanguage = parseLang(store.user.language);
  if (!userLanguage) {
    nav('student-login');
    return true;
  }
  if (requiredLanguage && userLanguage !== requiredLanguage) {
    nav(`tests/${studentSubjectSlug()}`);
    return true;
  }
  return false;
}

function languageForTestsSlug(slug) {
  const s = String(slug || '').toLowerCase();
  if (s === 'english' || s === 'en') return 'en';
  if (s === 'russian' || s === 'ru') return 'ru';
  return null;
}

function clearClientSession() {
  store.user = null;
  store.unread = 0;
  store.track = 'ru';
  studentsCache = [];
  studentFilter = 'all';
  literacyQuiz = null;
  literacyTeacherCache = [];
  literacyFilter = { lang: 'all', level: 'all', result: 'all', date: 'all' };
  literacyBusy = false;
  gameIdea = null;
  gameCloze = null;
  gameMemory = null;
  gameSprint = null;
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  recorder = null;
  recordKind = 'AUDIO';
}

let renderToken = 0;
let activeTimer = null;
let recorder = null;
let recordKind = 'AUDIO';
let studentsCache = [];
let studentFilter = 'all';
let literacyQuiz = null;
let literacyTeacherCache = [];
let literacyFilter = { lang: 'all', level: 'all', result: 'all', date: 'all' };
let literacyBusy = false;
let gameIdea = null;
let gameCloze = null;
let gameMemory = null;
let gameSprint = null;

function toast(message, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : 'ok'}`;
  el.textContent = type === 'err' ? friendlyError({ message }) : message;
  toastWrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function parseHash() {
  const raw = (location.hash || '#landing').replace(/^#/, '');
  const [name, id] = raw.split('/');
  return { name: name || 'landing', id: id || null };
}

function nav(hash) {
  location.hash = hash.startsWith('#') ? hash : `#${hash}`;
}

function stopTimer() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}

function teardownRecorder() {
  if (recorder) {
    recorder.discard();
    recorder = null;
  }
}

function homeFor(user) {
  return user?.role === 'TEACHER' ? 'teacher-dashboard' : 'dashboard';
}

function roleOf(user) {
  return user?.role === 'TEACHER' ? 'teacher' : 'student';
}

async function refreshMe() {
  try {
    const data = await api('/api/me');
    store.user = data.user;
    if (data.user?.role === 'STUDENT') store.track = parseLang(data.user.language) || 'ru';
    return data.user;
  } catch (_) {
    clearClientSession();
    return null;
  }
}

async function refreshUnread() {
  if (!store.user) {
    store.unread = 0;
    return;
  }
  try {
    const data = await api('/api/notifications');
    store.unread = data.unread || 0;
  } catch (_) {
    store.unread = 0;
  }
}

function setError(form, message) {
  const box = form.querySelector('[data-error]');
  if (!box) return;
  box.hidden = !message;
  box.textContent = message ? friendlyError({ message }) : '';
}

function mount(html) {
  stopTimer();
  root.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  bindKeyboardInset();
  hydrateAuthMedia(root).catch(() => {});
}

function bindKeyboardInset() {
  const apply = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    document.documentElement.classList.toggle('kb-open', inset > 80);
  };
  if (window.visualViewport && !bindKeyboardInset.bound) {
    bindKeyboardInset.bound = true;
    window.visualViewport.addEventListener('resize', apply);
    window.visualViewport.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
  }
  apply();
}

function toggleMore(force) {
  const sheet = document.getElementById('moreSheet');
  if (!sheet) return;
  const open = force === true ? true : force === false ? false : sheet.hasAttribute('hidden');
  if (open) {
    sheet.removeAttribute('hidden');
    sheet.classList.add('open');
  } else {
    sheet.setAttribute('hidden', '');
    sheet.classList.remove('open');
  }
}

function paintLiteracyQuiz() {
  if (!literacyQuiz) return;
  mount(views.viewLiteracyQuiz(literacyQuiz));
}

async function loadLiteracyQuiz(quizId, subjectSlug) {
  const id = quizId || 'quiz-ru-literacy';
  const subject = subjectSlug || (String(id).includes('-en-') || String(id).startsWith('quiz-en') ? 'english' : 'russian');
  const data = id === 'quiz-ru-literacy' && !subjectSlug
    ? await api('/api/literacy/start', { method: 'POST' })
    : await api(`/api/tests/quizzes/${encodeURIComponent(id)}/start`, {
      method: 'POST',
      body: { subject },
    });
  const answers = { ...(data.attempt.answers || {}) };
  Object.keys(answers).forEach((k) => { answers[k] = Number(answers[k]); });
  const questions = data.questions || [];
  let index = questions.findIndex((q) => !Number.isInteger(answers[q.id]));
  if (index < 0) index = Math.max(0, questions.length - 1);
  literacyQuiz = {
    attemptId: data.attempt.id,
    quizId: data.attempt.quizId || id,
    subjectSlug: data.attempt.subjectSlug || data.quiz?.subjectSlug || subject,
    title: data.quiz?.title || data.attempt.quizTitle || '',
    uiLocale: data.attempt.uiLocale || data.quiz?.uiLocale || 'ru',
    questions,
    answers,
    index,
  };
  paintLiteracyQuiz();
}

async function saveLiteracyAnswer(questionId, selectedIndex) {
  if (!literacyQuiz) return;
  literacyQuiz.answers[questionId] = selectedIndex;
  const base = literacyQuiz.quizId === 'quiz-ru-literacy' ? '/api/literacy' : '/api/tests';
  try {
    await api(`${base}/attempts/${literacyQuiz.attemptId}/answers`, {
      method: 'POST',
      body: { questionId, selectedIndex },
    });
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function submitLiteracyQuiz() {
  if (!literacyQuiz || literacyBusy) return;
  literacyBusy = true;
  const base = literacyQuiz.quizId === 'quiz-ru-literacy' ? '/api/literacy' : '/api/tests';
  const en = literacyQuiz.uiLocale === 'en';
  try {
    const data = await api(`${base}/attempts/${literacyQuiz.attemptId}/submit`, {
      method: 'POST',
      body: { answers: literacyQuiz.answers },
    });
    const id = data.attempt.id;
    literacyQuiz = null;
    toast(en ? 'Quiz completed. Result saved.' : 'Тест завершён. Результат сохранён.');
    nav(`tests-result/${id}`);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    literacyBusy = false;
  }
}

function startCountdown(wrap, onDone) {
  stopTimer();
  const total = Number(wrap.dataset.total || 0);
  let left = Number(wrap.dataset.left || 0);
  const tval = wrap.querySelector('.tval');
  const size = wrap.classList.contains('timer-lg') ? 140 : wrap.style.width === '56px' ? 56 : 78;
  const stroke = size >= 140 ? 10 : size === 56 ? 6 : 7;
  const color = wrap.dataset.timer === 'prep' || wrap.dataset.timer === 'memory' ? 'var(--amber)' : 'var(--teal)';
  const tick = () => {
    if (left < 0) left = 0;
    const pct = total ? Math.round((1 - left / total) * 100) : 100;
    wrap.innerHTML = `${ring(pct, size, stroke, color)}<div class="tval">${formatTime(left)}</div>`;
    const bar = root.querySelector('.reading-progress i');
    if (bar) bar.style.width = `${pct}%`;
    const pctLabel = root.querySelector('[data-read-pct]');
    if (pctLabel) pctLabel.textContent = `Прогресс чтения: ${pct}%`;
    if (left <= 0) {
      stopTimer();
      onDone();
      return;
    }
    left -= 1;
  };
  tick();
  activeTimer = setInterval(tick, 1000);
}

async function gotoAssignmentStage(assignmentId) {
  const data = await api(`/api/assignments/${assignmentId}`);
  const a = data.assignment;
  const st = a.studentStatus;
  if (st === 'REVIEWED' && a.retelling) return nav(`retell-result/${a.retelling.id}`);
  if (st === 'SUBMITTED' || st === 'IN_REVIEW') {
    mount(views.viewRetellSubmitted(a));
    return;
  }
  if (st === 'RECORDING') return nav(`retell-record/${assignmentId}`);
  if (st === 'PREPARATION') return nav(`retell-prep/${assignmentId}`);
  if (st === 'READING') return nav(`retell-read/${assignmentId}`);
  mount(views.viewRetellIntro(a));
}

function updateWave(values) {
  const bars = root.querySelectorAll('[data-wave] span');
  if (!bars.length || !values?.length) return;
  const step = Math.max(1, Math.floor(values.length / bars.length));
  bars.forEach((el, i) => {
    const v = values[Math.min(values.length - 1, i * step)] || 0;
    el.style.height = `${6 + (v / 255) * 40}px`;
  });
}

function setMicStatus(state, label) {
  const box = root.querySelector('[data-mic-status]');
  if (!box) return;
  box.classList.remove('live', 'denied');
  if (state) box.classList.add(state);
  const l = box.querySelector('[data-mic-label]');
  if (l) l.textContent = label;
}

function refreshStoryNums() {
  const items = [...root.querySelectorAll('[data-story-item]')];
  items.forEach((el, i) => {
    const num = el.querySelector('.story-num');
    if (num) num.textContent = String(i + 1);
    const up = el.querySelector('[data-dir="up"]');
    const down = el.querySelector('[data-dir="down"]');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === items.length - 1;
    el.style.borderColor = '';
  });
}

function wireStoryDrag() {
  const list = root.querySelector('[data-story-list]');
  if (!list) return;
  let dragEl = null;
  list.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('[data-story-item]');
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  list.addEventListener('dragend', () => {
    if (dragEl) dragEl.classList.remove('dragging');
    dragEl = null;
    refreshStoryNums();
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = e.target.closest('[data-story-item]');
    if (!dragEl || !over || over === dragEl) return;
    const rect = over.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    list.insertBefore(dragEl, before ? over : over.nextSibling);
  });
}

function recButtons({ recording, paused, ready, submitting }) {
  const toggle = root.querySelector('[data-action="rec-toggle"]');
  const pause = root.querySelector('[data-action="rec-pause"]');
  const del = root.querySelector('[data-action="rec-delete"]');
  const submit = root.querySelector('[data-action="rec-submit"]');
  const circle = root.querySelector('.rec-circle');
  const hint = root.querySelector('[data-rec-hint]');
  const tag = root.querySelector('[data-rec-tag]');
  if (toggle) {
    toggle.hidden = !!ready || !!submitting;
    toggle.disabled = !!submitting;
    toggle.innerHTML = recording
      ? `${ic('square', 16)} Остановить`
      : `${ic('mic', 16)} Нажмите, чтобы начать`;
  }
  if (pause) {
    pause.hidden = !recording;
    pause.innerHTML = paused ? `${ic('play', 16)} Продолжить` : `${ic('pause', 16)} Пауза`;
  }
  const previewBtn = root.querySelector('[data-action="rec-preview"]');
  if (previewBtn) previewBtn.hidden = !ready;
  if (del) {
    del.hidden = !ready;
    del.innerHTML = `${ic('trash', 16)} Перезаписать`;
  }
  if (submit) {
    submit.hidden = !ready;
    submit.disabled = !!submitting;
    submit.innerHTML = submitting ? 'Отправка…' : `${ic('check2', 16)} Отправить`;
  }
  if (circle) {
    circle.classList.toggle('recording', !!recording && !paused);
    circle.hidden = !!ready;
  }
  if (tag) tag.hidden = !recording;
  if (hint && recording && !paused) hint.textContent = 'Идёт запись... говори чётко и не торопись.';
  if (hint && paused) hint.textContent = 'Пауза. Нажми «Продолжить», чтобы снова говорить.';
}

async function ensureRecorder(kind, preview) {
  if (recorder && recorder.kind === kind && recorder.stream) return recorder;
  teardownRecorder();
  const { RetellRecorder } = await import('./recorder.js');
  recorder = new RetellRecorder();
  await recorder.prepare(kind, preview);
  setMicStatus('live', kind === 'VIDEO' ? 'Камера и микрофон активны' : 'Микрофон активен');
  return recorder;
}

async function startRecording() {
  const box = root.querySelector('[data-recorder]');
  if (!box) return;
  const kind = box.dataset.type;
  const max = Number(box.dataset.max || 180);
  const help = root.querySelector('[data-perm-help]');
  const preview = root.querySelector('[data-live-video]');
  try {
    if (help) help.hidden = true;
    await ensureRecorder(kind, preview);
    recButtons({ recording: true, paused: false, ready: false });
    await recorder.start({
      maxSeconds: max,
      onTick: (sec) => {
        const t = formatTime(sec);
        const el = root.querySelector('[data-rec-timer]');
        if (el) el.textContent = t;
        const tagT = root.querySelector('[data-rec-tag-time]');
        if (tagT) tagT.textContent = t;
      },
      onWave: updateWave,
      onStop: (result) => showPlayback(result, kind),
    });
  } catch (err) {
    setMicStatus('denied', 'Нет доступа к устройству');
    if (help) {
      help.hidden = false;
      help.textContent = err.message;
    }
    toast(err.message, 'err');
    recButtons({ recording: false, ready: false });
  }
}

function showPlayback(result, kind) {
  recButtons({ recording: false, ready: true });
  setMicStatus('', 'Запись готова');
  const hint = root.querySelector('[data-rec-hint]');
  if (hint) hint.textContent = 'Прослушай или пересмотри запись. Можно удалить и записать заново.';
  const play = root.querySelector('[data-playback]');
  if (!play) return;
  play.hidden = false;
  const media = kind === 'VIDEO'
    ? `<video controls playsinline src="${result.url}" style="width:100%; border-radius:16px; background:#111;"></video>`
    : `<audio controls src="${result.url}" style="width:100%;"></audio>`;
  play.innerHTML = media;
  const live = root.querySelector('[data-live-video]');
  if (live) live.style.display = 'none';
  const wrap = root.querySelector('[data-video-wrap]');
  if (wrap) wrap.style.display = 'none';
}

async function submitRecording() {
  const box = root.querySelector('[data-recorder]');
  if (!box || !recorder?.blob) {
    toast('Сначала запишите пересказ.', 'err');
    return;
  }
  if (recorder.blob.size < 200) {
    toast('Запись не получилась. Нажмите «Перезаписать» и попробуйте снова.', 'err');
    return;
  }
  recButtons({ recording: false, ready: true, submitting: true });
  const fd = new FormData();
  const type = box.dataset.type;
  const ext = (recorder.blob.type || '').includes('mp4') ? 'mp4' : 'webm';
  fd.append('file', recorder.blob, `retelling.${ext}`);
  fd.append('assignmentId', box.dataset.assignment);
  fd.append('type', type);
  fd.append('duration', String(recorder.durationSec()));
  try {
    await api('/api/retellings', { method: 'POST', body: fd });
    toast('Пересказ отправлен учителю.');
    teardownRecorder();
    nav(`retell-intro/${box.dataset.assignment}`);
  } catch (err) {
    recButtons({ recording: false, ready: true });
    toast(err.message, 'err');
  }
}

function wireReviewForm() {
  const form = root.querySelector('[data-form="review"]');
  if (!form) return;
  const totalEl = form.querySelector('[data-total]');
  const recalc = () => {
    const sum = [...form.querySelectorAll('[data-score]')].reduce((s, el) => s + Number(el.value || 0), 0);
    if (totalEl) totalEl.textContent = `${sum} / 100`;
    form.querySelectorAll('[data-score]').forEach((el) => {
      const sv = el.parentElement.querySelector('.sv');
      if (sv) sv.textContent = el.value;
    });
  };
  form.querySelectorAll('[data-score]').forEach((el) => el.addEventListener('input', recalc));
  recalc();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    ['contentScore', 'sequenceScore', 'understandingScore', 'speechScore', 'vocabularyScore'].forEach((k) => {
      body[k] = Number(body[k]);
    });
    try {
      await api(`/api/retellings/${form.dataset.id}/review`, { method: 'POST', body });
      toast('Оценка сохранена. Ученик получит уведомление.');
      nav('teacher-review');
    } catch (err) {
      setError(form, err.message);
    }
  });
}

async function loadNotifyPanel() {
  const panel = document.getElementById('notifyPanel');
  if (!panel) return;
  try {
    const data = await api('/api/notifications');
    store.unread = data.unread || 0;
    if (!data.notifications?.length) {
      panel.innerHTML = '<div class="empty-state" style="padding:24px;">Нет уведомлений</div>';
      return;
    }
    panel.innerHTML = data.notifications.map((n) => `
      <a class="notify-item ${n.read ? '' : 'unread'}" href="${esc(n.link || '#')}" data-nid="${esc(n.id)}">
        <b style="display:block; font-size:13px; margin-bottom:4px;">${esc(n.title)}</b>
        <span style="color:var(--muted);">${esc(n.body)}</span>
      </a>`).join('');
  } catch (_) {
    panel.innerHTML = '<div class="empty-state" style="padding:24px;">Не удалось загрузить</div>';
  }
}

root.addEventListener('click', async (e) => {
  const moreBtn = e.target.closest('[data-action="toggle-more"]');
  if (moreBtn) {
    e.preventDefault();
    toggleMore();
    return;
  }
  const moreSheet = e.target.closest('#moreSheet');
  if (moreSheet && !e.target.closest('.more-sheet-inner')) {
    toggleMore(false);
    return;
  }

  const logout = e.target.closest('[data-action="logout"]');
  if (logout) {
    e.preventDefault();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
    clearClientSession();
    nav('landing');
    return;
  }

  const notifyBtn = e.target.closest('[data-action="toggle-notify"]');
  if (notifyBtn) {
    const panel = document.getElementById('notifyPanel');
    if (!panel) return;
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    if (open) loadNotifyPanel();
    return;
  }

  const nItem = e.target.closest('[data-nid]');
  if (nItem) {
    api(`/api/notifications/${nItem.dataset.nid}/read`, { method: 'POST' }).catch(() => {});
  }

  const filterBtn = e.target.closest('[data-action="student-filter"]');
  if (filterBtn) {
    studentFilter = filterBtn.dataset.filter;
    render();
    return;
  }

  const startBtn = e.target.closest('[data-action="start-assignment"]');
  if (startBtn) {
    startBtn.disabled = true;
    try {
      await api(`/api/assignments/${startBtn.dataset.id}/start`, { method: 'POST' });
      nav(`retell-read/${startBtn.dataset.id}`);
    } catch (err) {
      toast(err.message, 'err');
      startBtn.disabled = false;
    }
    return;
  }

  const readBtn = e.target.closest('[data-action="complete-reading"]');
  if (readBtn) {
    readBtn.disabled = true;
    try {
      await api(`/api/assignments/${readBtn.dataset.id}/complete-reading`, { method: 'POST' });
      nav(`retell-prep/${readBtn.dataset.id}`);
    } catch (err) {
      toast(err.message, 'err');
      readBtn.disabled = false;
    }
    return;
  }

  const prepBtn = e.target.closest('[data-action="complete-prep"]');
  if (prepBtn) {
    prepBtn.disabled = true;
    try {
      await api(`/api/assignments/${prepBtn.dataset.id}/complete-prep`, { method: 'POST' });
      nav(`retell-record/${prepBtn.dataset.id}`);
    } catch (err) {
      toast(err.message, 'err');
      prepBtn.disabled = false;
    }
    return;
  }

  const modeBtn = e.target.closest('[data-action="set-mode"]');
  if (modeBtn) {
    recordKind = modeBtn.dataset.mode;
    teardownRecorder();
    render();
    return;
  }

  const recToggle = e.target.closest('[data-action="rec-toggle"]');
  if (recToggle) {
    if (recorder?.recording) recorder.stop();
    else startRecording();
    return;
  }

  const recPause = e.target.closest('[data-action="rec-pause"]');
  if (recPause && recorder) {
    if (recorder.paused) {
      if (!recorder.resume()) toast('Пауза недоступна в этом браузере.', 'err');
    } else if (!recorder.pause()) {
      toast('Пауза недоступна в этом браузере. Можно остановить запись.', 'err');
    }
    recButtons({ recording: true, paused: recorder.paused, ready: false });
    return;
  }

  const recDelete = e.target.closest('[data-action="rec-delete"]');
  if (recDelete) {
    teardownRecorder();
    render();
    return;
  }

  const recPreview = e.target.closest('[data-action="rec-preview"]');
  if (recPreview) {
    const play = root.querySelector('[data-playback]');
    const media = root.querySelector('[data-playback] video, [data-playback] audio');
    if (play) play.hidden = false;
    if (media) {
      try { await media.play(); } catch (_) { /* user can tap native controls */ }
    }
    return;
  }

  const recSubmit = e.target.closest('[data-action="rec-submit"]');
  if (recSubmit) {
    submitRecording();
    return;
  }

  const litStart = e.target.closest('[data-action="literacy-start"]');
  if (litStart) {
    litStart.disabled = true;
    try {
      await loadLiteracyQuiz(litStart.dataset.quiz || 'quiz-ru-literacy');
      nav(`tests-quiz/${literacyQuiz.quizId}`);
    } catch (err) {
      toast(err.message, 'err');
      litStart.disabled = false;
    }
    return;
  }

  const testsStart = e.target.closest('[data-action="tests-start"]');
  if (testsStart) {
    testsStart.disabled = true;
    try {
      const subject = testsStart.dataset.subject || (location.hash.includes('/english') ? 'english' : 'russian');
      await loadLiteracyQuiz(testsStart.dataset.quiz, subject);
      nav(`tests-quiz/${literacyQuiz.quizId}`);
    } catch (err) {
      toast(err.message, 'err');
      testsStart.disabled = false;
    }
    return;
  }

  const litPick = e.target.closest('[data-action="literacy-pick"]');
  if (litPick && literacyQuiz) {
    const q = literacyQuiz.questions[literacyQuiz.index];
    if (!q) return;
    const idx = Number(litPick.dataset.i);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return;
    literacyQuiz.answers[q.id] = idx;
    root.querySelectorAll('[data-action="literacy-pick"]').forEach((el) => el.classList.remove('selected', 'correct', 'wrong'));
    litPick.classList.add('selected');
    const next = root.querySelector('[data-action="literacy-next"], [data-action="literacy-submit"]');
    if (next) next.disabled = false;
    saveLiteracyAnswer(q.id, idx);
    return;
  }

  const litNext = e.target.closest('[data-action="literacy-next"]');
  if (litNext && literacyQuiz) {
    const q = literacyQuiz.questions[literacyQuiz.index];
    if (!Number.isInteger(literacyQuiz.answers[q?.id])) {
      toast(literacyQuiz.uiLocale === 'en' ? 'Choose an answer first.' : 'Сначала выберите ответ.', 'err');
      return;
    }
    if (literacyQuiz.index < literacyQuiz.questions.length - 1) {
      literacyQuiz.index += 1;
      paintLiteracyQuiz();
    }
    return;
  }

  const litBack = e.target.closest('[data-action="literacy-back"]');
  if (litBack && literacyQuiz) {
    if (literacyQuiz.index > 0) {
      literacyQuiz.index -= 1;
      paintLiteracyQuiz();
    }
    return;
  }

  const litExit = e.target.closest('[data-action="literacy-exit"]');
  if (litExit) {
    nav(literacyQuiz?.subjectSlug ? `tests/${literacyQuiz.subjectSlug}` : 'tests');
    return;
  }

  const litSubmit = e.target.closest('[data-action="literacy-submit"]');
  if (litSubmit) {
    litSubmit.disabled = true;
    await submitLiteracyQuiz();
    if (litSubmit.isConnected) litSubmit.disabled = false;
    return;
  }

  const litFilter = e.target.closest('[data-action="lit-filter"]');
  if (litFilter) {
    literacyFilter = { ...literacyFilter, [litFilter.dataset.group]: litFilter.dataset.value };
    mount(views.viewTeacherLiteracy(literacyTeacherCache, literacyFilter));
    return;
  }

  const delLesson = e.target.closest('[data-action="delete-lesson"]');
  if (delLesson) {
    e.preventDefault();
    if (delLesson.dataset.busy === '1') return;
    if (!window.confirm('Удалить этот урок? Ученики больше его не увидят.')) return;
    delLesson.dataset.busy = '1';
    delLesson.disabled = true;
    try {
      await api(`/api/lessons/${encodeURIComponent(delLesson.dataset.id)}`, { method: 'DELETE' });
      toast('Урок удалён.');
      // Always remount — page has both desktop table + mobile cards
      await render();
    } catch (err) {
      toast(err.message, 'err');
      delLesson.disabled = false;
      delete delLesson.dataset.busy;
    }
    return;
  }

  const storyMove = e.target.closest('[data-action="story-move"]');
  if (storyMove) {
    const item = storyMove.closest('[data-story-item]');
    const list = root.querySelector('[data-story-list]');
    if (!item || !list) return;
    if (storyMove.dataset.dir === 'up' && item.previousElementSibling) {
      list.insertBefore(item, item.previousElementSibling);
    }
    if (storyMove.dataset.dir === 'down' && item.nextElementSibling) {
      list.insertBefore(item.nextElementSibling, item);
    }
    refreshStoryNums();
    return;
  }

  const storyCheck = e.target.closest('[data-action="story-check"]');
  if (storyCheck) {
    const items = [...root.querySelectorAll('[data-story-item]')];
    const order = items.map((el) => el.dataset.id);
    const sessionId = storyCheck.dataset.gameSession || root.querySelector('[data-game-session]')?.dataset.gameSession;
    storyCheck.disabled = true;
    try {
      const data = await api('/api/games/story/check', { method: 'POST', body: { sessionId, order } });
      const msg = root.querySelector('[data-story-msg]');
      if (msg) {
        msg.hidden = false;
        msg.textContent = data.ok
          ? 'Верно: события стоят в том порядке, в каком их нужно пересказывать.'
          : 'Пока неверно. Подумай, что было в начале, в середине и в конце.';
        msg.style.background = data.ok ? 'var(--surface-glass)' : 'var(--red-soft)';
        msg.style.color = data.ok ? 'var(--purple-primary)' : 'var(--red)';
      }
      if (Array.isArray(data.correctOrder)) {
        items.forEach((el) => {
          const expect = data.correctOrder.indexOf(el.dataset.id);
          const got = order.indexOf(el.dataset.id);
          el.style.borderColor = expect === got ? 'var(--purple-primary)' : 'var(--red)';
        });
      }
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      if (storyCheck.isConnected) storyCheck.disabled = false;
    }
    return;
  }

  const ideaPick = e.target.closest('[data-action="idea-pick"]');
  if (ideaPick && gameIdea && !gameIdea.locked) {
    const i = Number(ideaPick.dataset.i);
    ideaPick.disabled = true;
    try {
      const data = await api('/api/games/idea/check', {
        method: 'POST',
        body: { sessionId: gameIdea.sessionId, selectedIndex: i },
      });
      gameIdea = {
        ...gameIdea,
        locked: true,
        picked: i,
        correct: data.correct,
        why: data.why,
        ok: data.ok,
      };
      mount(views.viewGameIdea(gameIdea, i));
    } catch (err) {
      toast(err.message, 'err');
    }
    return;
  }

  const clozeBlank = e.target.closest('[data-action="cloze-blank"]');
  if (clozeBlank && gameCloze) {
    gameCloze.active = Number(clozeBlank.dataset.i);
    root.querySelectorAll('.cloze-gap').forEach((el) => el.classList.toggle('on', el === clozeBlank));
    return;
  }

  const clozeWord = e.target.closest('[data-action="cloze-word"]');
  if (clozeWord && gameCloze) {
    const word = clozeWord.dataset.word;
    const idx = Number.isInteger(gameCloze.active) ? gameCloze.active : Object.keys(gameCloze.filled).length;
    const blanks = gameCloze.blanks || [];
    const target = blanks.some((b) => b.i === idx) ? idx : (blanks.find((b) => gameCloze.filled[b.i] == null) || {}).i;
    if (target == null) return;
    Object.keys(gameCloze.filled).forEach((k) => {
      if (gameCloze.filled[k] === word) delete gameCloze.filled[k];
    });
    gameCloze.filled[target] = word;
    gameCloze.active = null;
    mount(views.viewGameCloze(gameCloze, gameCloze.filled, gameCloze.message, gameCloze.ok));
    return;
  }

  const clozeCheck = e.target.closest('[data-action="cloze-check"]');
  if (clozeCheck && gameCloze) {
    clozeCheck.disabled = true;
    try {
      const data = await api('/api/games/cloze/check', {
        method: 'POST',
        body: { sessionId: gameCloze.sessionId, filled: gameCloze.filled },
      });
      gameCloze.ok = data.ok;
      gameCloze.message = data.ok
        ? 'Все слова на месте. Так же точно подбирай слова в пересказе.'
        : `Есть ошибки: ${data.score} из ${data.total}. Попробуй ещё раз с новым набором.`;
      mount(views.viewGameCloze(gameCloze, gameCloze.filled, gameCloze.message, data.ok));
    } catch (err) {
      toast(err.message, 'err');
      if (clozeCheck.isConnected) clozeCheck.disabled = false;
    }
    return;
  }

  const memStart = e.target.closest('[data-action="memory-start-quiz"]');
  if (memStart && gameMemory) {
    stopTimer();
    gameMemory.stage = 'quiz';
    mount(views.viewGameMemory(gameMemory, 'quiz', gameMemory.answers, false));
    return;
  }

  const memFact = e.target.closest('[data-action="memory-fact"]');
  if (memFact && gameMemory && !gameMemory.done) {
    const i = Number(memFact.dataset.i);
    gameMemory.answers[i] = memFact.dataset.val === 'true';
    mount(views.viewGameMemory(gameMemory, 'quiz', gameMemory.answers, false));
    return;
  }

  const memCheck = e.target.closest('[data-action="memory-check"]');
  if (memCheck && gameMemory) {
    memCheck.disabled = true;
    try {
      const data = await api('/api/games/memory/check', {
        method: 'POST',
        body: { sessionId: gameMemory.sessionId, answers: gameMemory.answers },
      });
      gameMemory.done = true;
      gameMemory.score = data.score;
      gameMemory.total = data.total;
      gameMemory.detail = data.detail || [];
      mount(views.viewGameMemory(gameMemory, 'quiz', gameMemory.answers, true));
    } catch (err) {
      toast(err.message, 'err');
      if (memCheck.isConnected) memCheck.disabled = false;
    }
    return;
  }

  const sprintPick = e.target.closest('[data-action="sprint-pick"]');
  if (sprintPick && gameSprint && !gameSprint.done) {
    const i = Number(sprintPick.dataset.i);
    const q = gameSprint.questions[gameSprint.index];
    if (!q || Number.isInteger(gameSprint.picked) || gameSprint.busy) return;
    gameSprint.busy = true;
    gameSprint.picked = i;
    try {
      const data = await api('/api/games/sprint/answer', {
        method: 'POST',
        body: { sessionId: gameSprint.sessionId, questionId: q.id, selectedIndex: i },
      });
      gameSprint.lastOk = data.ok;
      gameSprint.score = data.score;
      if (data.done) {
        gameSprint.done = true;
        gameSprint.score = data.finalScore ?? data.score;
      }
      mount(views.viewGameSprint(gameSprint));
    } catch (err) {
      gameSprint.picked = null;
      toast(err.message, 'err');
      mount(views.viewGameSprint(gameSprint));
    } finally {
      gameSprint.busy = false;
    }
    return;
  }

  const sprintNext = e.target.closest('[data-action="sprint-next"]');
  if (sprintNext && gameSprint) {
    if (gameSprint.done) {
      mount(views.viewGameSprint(gameSprint));
      return;
    }
    if (gameSprint.index + 1 >= gameSprint.questions.length) {
      gameSprint.done = true;
    } else {
      gameSprint.index += 1;
      gameSprint.picked = null;
      gameSprint.lastOk = null;
    }
    mount(views.viewGameSprint(gameSprint));
  }
});

root.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  if (form.dataset.form === 'review') return;
  e.preventDefault();
  if (form.dataset.form === 'student-login') {
    const fd = new FormData(form);
    try {
      const data = await api('/api/auth/student', { method: 'POST', body: { name: fd.get('name'), password: fd.get('password') } });
      store.user = data.user;
      store.track = parseLang(data.user.language) || 'ru';
      nav('dashboard');
    } catch (err) {
      setError(form, err.message);
    }
    return;
  }
  if (form.dataset.form === 'student-register') {
    const fd = new FormData(form);
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          password: fd.get('password'),
          passwordConfirm: fd.get('passwordConfirm'),
          language: fd.get('language') || 'ru',
          enrollmentLevel: fd.get('enrollmentLevel') || 'BEGINNER',
        },
      });
      store.user = data.user;
      store.track = parseLang(data.user.language) || 'ru';
      toast(parseLang(data.user.language) === 'en'
        ? 'Account created. Your teacher sees your English level.'
        : 'Аккаунт создан. Учитель видит твой раздел и уровень.');
      nav('dashboard');
    } catch (err) {
      setError(form, err.message);
    }
    return;
  }
  if (form.dataset.form === 'teacher-login') {
    const fd = new FormData(form);
    try {
      const data = await api('/api/auth/teacher', { method: 'POST', body: { code: fd.get('code') } });
      store.user = data.user;
      nav('teacher-dashboard');
    } catch (err) {
      setError(form, err.message);
    }
    return;
  }
  if (form.dataset.form === 'create-assignment') {
    const fd = new FormData(form);
    const submitter = e.submitter;
    const status = submitter?.value || 'ACTIVE';
    const assignAll = form.querySelector('[data-assign-all]')?.checked;
    const studentIds = assignAll ? [] : [...form.querySelectorAll('input[name="studentIds"]:checked')].map((i) => i.value);
    const deadlineRaw = fd.get('deadline');
    const body = {
      title: fd.get('title'),
      description: fd.get('description'),
      text: fd.get('text'),
      readingTime: Number(fd.get('readingMin')) * 60,
      preparationTime: Number(fd.get('prepMin')) * 60,
      retellingTime: Number(fd.get('retellMin')) * 60,
      mode: fd.get('mode'),
      deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
      studentIds,
      status,
      language: fd.get('language') || store.track || 'ru',
      targetLevel: fd.get('targetLevel') || 'ALL',
    };
    try {
      await api('/api/assignments', { method: 'POST', body });
      toast(status === 'DRAFT' ? 'Черновик сохранён.' : 'Задание опубликовано и назначено ученикам.');
      nav(`teacher-track/${trackSlug(body.language)}`);
    } catch (err) {
      setError(form, err.message);
    }
    return;
  }
  if (form.dataset.form === 'lesson-replace-file') {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await api(`/api/lessons/${encodeURIComponent(id)}/file`, { method: 'POST', body: fd });
      toast('Медиа обновлено.');
      nav(`teacher-lesson/${id}`);
    } catch (err) {
      setError(form, err.message);
      if (submitBtn) submitBtn.disabled = false;
    }
    return;
  }
  if (form.dataset.form === 'create-lesson') {
    const fd = new FormData(form);
    if (!fd.get('language')) fd.set('language', store.track || 'ru');
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await api('/api/lessons', { method: 'POST', body: fd });
      const section = fd.get('section');
      const lang = parseLang(fd.get('language') || store.track);
      toast(section === 'BONUS' ? 'Бонусный урок выдан ученикам.' : 'Видеоурок опубликован.');
      nav(`teacher-track/${trackSlug(lang)}`);
    } catch (err) {
      setError(form, err.message);
      if (submitBtn) submitBtn.disabled = false;
    }
  }
});

root.addEventListener('change', (e) => {
  const all = e.target.closest('[data-assign-all]');
  if (all) {
    root.querySelectorAll('input[name="studentIds"]').forEach((i) => { i.checked = all.checked; });
  }
  const typeRadio = e.target.closest('[data-lesson-type]');
  if (typeRadio) syncLessonTypeForm(typeRadio.closest('form'));
});

function syncLessonTypeForm(form) {
  if (!form) return;
  const type = form.querySelector('input[name="type"]:checked')?.value || 'VIDEO';
  const isPdf = type === 'PDF';
  const urlBox = form.querySelector('[data-lesson-url]');
  const durBox = form.querySelector('[data-lesson-duration]');
  const file = form.querySelector('[data-lesson-file]');
  const label = form.querySelector('[data-file-label]');
  if (urlBox) urlBox.hidden = isPdf;
  if (durBox) durBox.hidden = isPdf;
  if (file) file.accept = isPdf ? 'application/pdf,.pdf' : 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
  if (label) label.textContent = isPdf ? 'PDF-файл' : 'Видеофайл (если нет ссылки YouTube)';
}

async function render() {
  const token = ++renderToken;
  const { name, id } = parseHash();

  if (!store.user) await refreshMe();
  if (token !== renderToken) return;

  if (store.user && PUBLIC_ROUTES.has(name)) {
    nav(homeFor(store.user));
    return;
  }
  if (!store.user && !PUBLIC_ROUTES.has(name)) {
    nav(name.startsWith('teacher') ? 'teacher-login' : 'student-login');
    return;
  }
  if (store.user?.role === 'STUDENT' && TEACHER_ROUTES.has(name)) {
    nav('dashboard');
    return;
  }
  if (store.user?.role === 'TEACHER' && STUDENT_ROUTES.has(name)) {
    nav('teacher-dashboard');
    return;
  }

  if (store.user) await refreshUnread();
  if (token !== renderToken) return;

  const role = roleOf(store.user);

  try {
    if (name === 'landing' || name === '') {
      try {
        const data = await api('/api/public/stats');
        if (token !== renderToken) return;
        mount(views.viewLanding(data));
      } catch (_) {
        mount(views.viewLanding({}));
      }
      return;
    }
    if (name === 'track') {
      mount(views.viewTrackLanding(routeLang(id)));
      return;
    }
    if (name === 'student-login') {
      mount(views.viewStudentLogin(routeLang(id)));
      return;
    }
    if (name === 'student-register') {
      mount(views.viewStudentRegister(routeLang(id)));
      return;
    }
    if (name === 'teacher-login') {
      mount(views.viewTeacherLogin());
      return;
    }
    if (name === 'dashboard') {
      mount(skeletonPage(role, 'dashboard', 'Главная'));
      const data = await api('/api/student/dashboard');
      if (token !== renderToken) return;
      mount(views.viewStudentDashboard(data));
      return;
    }
    if (name === 'retell-list') {
      const data = await api('/api/assignments');
      if (token !== renderToken) return;
      mount(views.viewRetellList(data.assignments || []));
      return;
    }
    if (name === 'retell-intro' && id) {
      await gotoAssignmentStage(id);
      return;
    }
    if (name === 'retell-read' && id) {
      const data = await api(`/api/assignments/${id}`);
      if (token !== renderToken) return;
      const a = data.assignment;
      if (a.studentStatus !== 'READING') {
        await gotoAssignmentStage(id);
        return;
      }
      if (!a.text) {
        toast('Текст недоступен. Чтение уже завершено.', 'err');
        await gotoAssignmentStage(id);
        return;
      }
      mount(views.viewRetellRead(a));
      const wrap = root.querySelector('[data-timer="reading"]');
      if (wrap) startCountdown(wrap, async () => {
        try {
          await api(`/api/assignments/${id}/complete-reading`, { method: 'POST' });
          nav(`retell-prep/${id}`);
        } catch (err) {
          toast(err.message, 'err');
        }
      });
      return;
    }
    if (name === 'retell-prep' && id) {
      const data = await api(`/api/assignments/${id}`);
      if (token !== renderToken) return;
      const a = data.assignment;
      if (a.studentStatus !== 'PREPARATION') {
        await gotoAssignmentStage(id);
        return;
      }
      mount(views.viewRetellPrep(a));
      const wrap = root.querySelector('[data-timer="prep"]');
      if (wrap) startCountdown(wrap, async () => {
        try {
          await api(`/api/assignments/${id}/complete-prep`, { method: 'POST' });
          nav(`retell-record/${id}`);
        } catch (err) {
          toast(err.message, 'err');
        }
      });
      return;
    }
    if (name === 'retell-record' && id) {
      const data = await api(`/api/assignments/${id}`);
      if (token !== renderToken) return;
      const a = data.assignment;
      if (a.studentStatus !== 'RECORDING') {
        await gotoAssignmentStage(id);
        return;
      }
      if (a.mode === 'VIDEO') recordKind = 'VIDEO';
      else if (a.mode === 'AUDIO') recordKind = 'AUDIO';
      mount(views.viewRetellRecord(a, recordKind));
      return;
    }
    if (name === 'retell-result' && id) {
      const data = await api(`/api/retellings/${id}`);
      if (token !== renderToken) return;
      if (data.retelling.status !== 'REVIEWED') {
        mount(views.viewRetellSubmitted(data.assignment || {}));
        return;
      }
      mount(views.viewRetellResult(data.retelling));
      return;
    }
    if (name === 'progress') {
      const data = await api('/api/student/progress');
      if (token !== renderToken) return;
      mount(views.viewProgress(data.stats));
      return;
    }
    if (name === 'achievements') {
      const data = await api('/api/student/progress');
      if (token !== renderToken) return;
      mount(views.viewAchievements(data.stats));
      return;
    }
    if (name === 'profile') {
      const data = await api('/api/student/progress');
      if (token !== renderToken) return;
      mount(views.viewProfile(data.stats));
      return;
    }
    if (name === 'video-lessons') {
      const data = await api('/api/lessons?section=VIDEO');
      if (token !== renderToken) return;
      mount(views.viewVideoLessons(data.lessons || []));
      return;
    }
    if (name === 'video-lesson-detail' && id) {
      const data = await api(`/api/lessons/${id}`);
      if (token !== renderToken) return;
      mount(views.viewVideoLessonDetail(data));
      return;
    }
    if (name === 'bonus-lessons') {
      const data = await api('/api/lessons?section=BONUS');
      if (token !== renderToken) return;
      mount(views.viewBonusLessons(data.lessons || []));
      return;
    }
    if (name === 'bonus-lesson-detail' && id) {
      const data = await api(`/api/lessons/${id}`);
      if (token !== renderToken) return;
      mount(views.viewBonusLessonDetail(data));
      return;
    }
    if (name === 'training') { mount(views.viewTraining()); return; }
    if (name === 'games') {
      const data = await api('/api/games');
      if (token !== renderToken) return;
      mount(views.viewGames(data));
      return;
    }
    if (name === 'game-story') {
      const data = await api('/api/games/story');
      if (token !== renderToken) return;
      if (!data.available || !data.sentences?.length) {
        mount(views.viewGames({ assignmentTitle: null }));
        toast(data.error || 'Не удалось собрать предложения для игры.', 'err');
        return;
      }
      mount(views.viewGameStory(data));
      wireStoryDrag();
      return;
    }
    if (name === 'game-idea') {
      gameIdea = await api('/api/games/idea');
      if (token !== renderToken) return;
      mount(views.viewGameIdea(gameIdea));
      return;
    }
    if (name === 'game-cloze') {
      const data = await api('/api/games/cloze');
      if (token !== renderToken) return;
      gameCloze = { ...data, filled: {}, active: null, message: null, ok: null };
      mount(views.viewGameCloze(gameCloze, gameCloze.filled));
      return;
    }
    if (name === 'game-memory') {
      gameMemory = { ...(await api('/api/games/memory')), stage: 'read', answers: {}, done: false };
      if (token !== renderToken) return;
      mount(views.viewGameMemory(gameMemory, 'read'));
      const wrap = root.querySelector('[data-timer="memory"]');
      if (wrap) {
        startCountdown(wrap, () => {
          if (!gameMemory || gameMemory.stage !== 'read') return;
          gameMemory.stage = 'quiz';
          mount(views.viewGameMemory(gameMemory, 'quiz', gameMemory.answers, false));
        });
      }
      return;
    }
    if (name === 'game-sprint') {
      const data = await api('/api/games/sprint');
      if (token !== renderToken) return;
      gameSprint = {
        sessionId: data.sessionId,
        questions: data.questions || [],
        index: 0,
        score: 0,
        picked: null,
        lastOk: null,
        done: false,
        language: data.language,
      };
      mount(views.viewGameSprint(gameSprint));
      return;
    }
    if (name === 'training-test') { nav('training'); return; }
    if (name === 'diagnostic' || name === 'diagnostic-result') {
      nav(`tests/${studentSubjectSlug()}`);
      return;
    }

    if (name === 'tests' || name === 'literacy') {
      const mine = studentSubjectSlug();
      // No dual-language hub for students — always land on their subject
      if (!id || (name === 'literacy' && !id)) {
        nav(`tests/${mine}`);
        return;
      }
      const slugLang = languageForTestsSlug(id);
      if (slugLang && ensureLanguageAccess(slugLang)) return;
      if (slugLang && slugLang !== parseLang(store.user.language)) {
        nav(`tests/${mine}`);
        return;
      }
      // Unknown slug → own subject
      if (!slugLang) {
        nav(`tests/${mine}`);
        return;
      }
      mount(skeletonPage(role, 'tests', parseLang(store.user.language) === 'en' ? 'Tests' : 'Тесты'));
      try {
        const data = await api(`/api/tests/subjects/${encodeURIComponent(mine)}`);
        if (token !== renderToken) return;
        mount(views.viewTestsSubject(data.subject, data.stats));
      } catch (err) {
        if (token !== renderToken) return;
        // Cross-language or forbidden → bounce home to own tests
        if (err.status === 403 || err.status === 404) {
          nav(`tests/${mine}`);
          return;
        }
        mount(errorState(err.message || 'Ошибка загрузки тестов'));
      }
      return;
    }
    if (name === 'tests-quiz' || name === 'literacy-quiz') {
      const quizId = id || literacyQuiz?.quizId || 'quiz-ru-literacy';
      if (literacyQuiz?.questions?.length && (!id || literacyQuiz.quizId === quizId)) {
        paintLiteracyQuiz();
        return;
      }
      mount(skeletonPage(role, 'tests', 'Тест'));
      await loadLiteracyQuiz(quizId);
      return;
    }
    if ((name === 'tests-result' || name === 'literacy-result') && id) {
      let data;
      try {
        data = await api(`/api/tests/attempts/${id}`);
      } catch (_) {
        data = await api(`/api/literacy/attempts/${id}`);
      }
      if (token !== renderToken) return;
      if (data.attempt.status !== 'COMPLETED') {
        nav(`tests-quiz/${data.attempt.quizId || 'quiz-ru-literacy'}`);
        return;
      }
      mount(views.viewLiteracyResult(data.attempt));
      return;
    }
    if (name === 'tests-history' || name === 'literacy-history') {
      const q = id ? `?subject=${encodeURIComponent(id)}` : '';
      const data = await api(`/api/tests/history${q}`);
      if (token !== renderToken) return;
      mount(views.viewLiteracyHistory(data.stats));
      return;
    }
    if (name === 'literacy-learn' && id) {
      const data = await api(`/api/literacy/topics/${id}`);
      if (token !== renderToken) return;
      mount(views.viewLiteracyLearn(data.topic));
      return;
    }

    if (name === 'teacher-dashboard') {
      const data = await api('/api/teacher/dashboard');
      if (token !== renderToken) return;
      mount(views.viewTeacherDashboard(data));
      return;
    }
    if (name === 'teacher-track') {
      const lang = routeLang(id || 'ru');
      store.track = lang;
      const data = await api('/api/teacher/dashboard');
      if (token !== renderToken) return;
      mount(views.viewTeacherTrack(lang, data));
      return;
    }
    if (name === 'teacher-students') {
      const data = await api('/api/teacher/students');
      if (token !== renderToken) return;
      studentsCache = data.students || [];
      mount(views.viewTeacherStudents(studentsCache, studentFilter));
      return;
    }
    if (name === 'teacher-student-detail' && id) {
      const data = await api(`/api/teacher/students/${id}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherStudentDetail(data));
      return;
    }
    if (name === 'teacher-assignments') {
      const lang = routeLang(id);
      store.track = lang;
      const data = await api(`/api/assignments?language=${lang}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherAssignments(data.assignments || []));
      return;
    }
    if (name === 'teacher-create') {
      const lang = routeLang(id);
      store.track = lang;
      const data = await api(`/api/teacher/students?language=${lang}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherCreate(data.students || [], lang));
      return;
    }
    if (name === 'teacher-review') {
      const lang = id ? routeLang(id) : null;
      if (lang) store.track = lang;
      const q = lang ? `&language=${lang}` : '';
      const data = await api(`/api/retellings?status=pending${q}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherReview(data.retellings || []));
      return;
    }
    if (name === 'teacher-review-detail' && id) {
      const data = await api(`/api/retellings/${id}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherReviewDetail(data));
      wireReviewForm();
      return;
    }
    if (name === 'teacher-stats') {
      const data = await api('/api/teacher/stats');
      if (token !== renderToken) return;
      mount(views.viewTeacherStats(data));
      return;
    }
    if (name === 'teacher-profile') {
      const data = await api('/api/teacher/dashboard');
      if (token !== renderToken) return;
      mount(views.viewTeacherProfile(data.totals));
      return;
    }
    if (name === 'teacher-video-lessons') {
      const lang = routeLang(id);
      store.track = lang;
      const data = await api(`/api/lessons?section=VIDEO&language=${lang}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherVideoLessons(data.lessons || [], lang));
      return;
    }
    if (name === 'teacher-video-create') {
      const lang = routeLang(id);
      store.track = lang;
      mount(views.viewTeacherVideoCreate(lang));
      return;
    }
    if (name === 'teacher-bonus') {
      const lang = routeLang(id);
      store.track = lang;
      const data = await api(`/api/lessons?section=BONUS&language=${lang}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherBonus(data.lessons || []));
      return;
    }
    if (name === 'teacher-bonus-create') {
      const lang = routeLang(id);
      store.track = lang;
      const data = await api(`/api/teacher/students?language=${lang}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherBonusCreate(data.students || [], lang));
      syncLessonTypeForm(root.querySelector('[data-form="create-lesson"]'));
      return;
    }
    if (name === 'teacher-lesson' && id) {
      const data = await api(`/api/lessons/${id}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherLessonDetail(data));
      return;
    }
    if (name === 'teacher-literacy' && id) {
      const data = await api(`/api/teacher/literacy/students/${id}`);
      if (token !== renderToken) return;
      mount(views.viewTeacherLiteracyStudent(data.student));
      return;
    }
    if (name === 'teacher-literacy') {
      const data = await api('/api/teacher/literacy');
      if (token !== renderToken) return;
      literacyTeacherCache = data.students || [];
      mount(views.viewTeacherLiteracy(literacyTeacherCache, literacyFilter));
      return;
    }

    mount(views.viewLanding());
  } catch (err) {
    if (err.status === 401) {
      clearClientSession();
      toast('Сессия истекла. Войдите снова.', 'err');
      nav('student-login');
      return;
    }
    if (err.status === 403) {
      toast(err.message, 'err');
      nav(homeFor(store.user));
      return;
    }
    mount(`<div class="container" style="padding:48px 20px;">${errorState(friendlyError(err))}</div>`);
  }
}

window.addEventListener('hashchange', () => {
  teardownRecorder();
  render();
});
render();
