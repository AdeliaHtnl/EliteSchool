import {
  ic, esc, displayTitle, ring, orb, initials, formatTime, formatDate, formatDay, relativeDate, minutesLabel,
  modeLabel, studentStatusBadge, assignmentStatusBadge, appPage, emptyState,
  CRITERIA_META, achievementsFromStats, firstName, store,
  parseLang, parseLevel, trackSlug, langLabel, levelLabel, studentIsEn, subjectSlugForUser, brandLogo,
} from './ui.js';
import { mediaUrl, lessonFileUrl } from './api.js';
import { renderUploadCard } from './upload.js';

function authMediaPlayer(kind, path, style = '') {
  const tag = kind === 'VIDEO' ? 'video' : 'audio';
  const attrs = kind === 'VIDEO'
    ? `controls playsinline style="width:100%; border-radius:18px; background:#111; ${style}"`
    : `controls style="width:100%; ${style}"`;
  return `<div class="auth-media-wrap">
    <${tag} ${attrs} data-auth-media="${esc(path)}"></${tag}>
    <p class="section-sub" data-media-error hidden style="color:var(--red); margin-top:10px;"></p>
  </div>`;
}

function formatRichText(text) {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n+/)
    .map((p) => p.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  if (!blocks.length) return '<p>Текст недоступен.</p>';
  return blocks.map((p) => `<p>${esc(p)}</p>`).join('');
}

function retellListAction(status) {
  if (status === 'REVIEWED') return 'Результат';
  if (status === 'SUBMITTED' || status === 'IN_REVIEW') return 'Статус';
  if (status === 'NOT_STARTED') return 'Открыть';
  return 'Продолжить';
}

function flowShell(activeStep, stageLabel, inner, footer, title = 'Пересказ') {
  const dots = [1, 2, 3].map((n) => `<div class="flow-dot ${n < activeStep ? 'done' : n === activeStep ? 'now' : ''}"></div>`).join('');
  return appPage('student', 'retell-list', title, null, `
    <div class="flow-shell">
      <div class="flow-progress">${dots}</div>
      <div class="stage-card">
        <div class="stage-label">${stageLabel}</div>
        ${inner}
      </div>
      ${footer || ''}
    </div>
  `);
}

function teacherPage(lang, title, greet, bodyHtml) {
  const slug = trackSlug(lang);
  store.track = parseLang(lang);
  return appPage('teacher', `teacher-track/${slug}`, title, greet, bodyHtml);
}

function levelOptions(ui = 'ru', selected = 'BEGINNER') {
  return ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((key) => (
    `<label><input type="radio" name="enrollmentLevel" value="${key}" ${key === selected ? 'checked' : ''} required> ${esc(levelLabel(key, ui))}</label>`
  )).join('');
}

export function viewLanding(stats = {}) {
  const teachers = Number(stats.teachers) || 0;
  const students = Number(stats.students) || 0;
  const retellings = Number(stats.retellings) || 0;
  return `
  <nav class="landing-nav"><div class="container landing-nav-inner">
    ${brandLogo()}
    <div class="landing-auth-row">
      <span class="landing-auth-label">Регистрация:</span>
      <a href="#track/ru" class="btn btn-ghost btn-sm">Русский</a>
      <a href="#track/en" class="btn btn-ghost btn-sm">English</a>
      <a href="#teacher-login" class="btn btn-primary btn-sm">Учителю</a>
    </div>
  </div></nav>
  <div class="container hero">
    <div>
      <span class="hero-eyebrow">${ic('mic', 14)} Платформа развития речи</span>
      <h1>Выбери язык.<br>Учи свой раздел.</h1>
      <p class="lead">Рядом с регистрацией — Русский или English. После выбора откроется отдельная страница раздела: те же функции (чтение, запись, видеоуроки, игры), но свой язык, чтобы ученики не путались.</p>
      <div class="track-pick">
        <a href="#track/ru" class="track-card ru">
          <span class="badge badge-green">Регистрация · Русский</span>
          <h2>Русский раздел</h2>
          <p>Отдельная страница: вход, регистрация, пересказы и уроки на русском.</p>
          <span class="track-cta">Открыть русский →</span>
        </a>
        <a href="#track/en" class="track-card en">
          <span class="badge badge-amber">Sign up · English</span>
          <h2>English section</h2>
          <p>Separate page: log in, register, retellings and lessons in English.</p>
          <span class="track-cta">Open English →</span>
        </a>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b>${retellings}</b><span>пересказов на платформе</span></div>
        <div class="hero-stat"><b>${teachers}</b><span>${teachers === 1 ? 'учитель' : 'учителей'}</span></div>
        <div class="hero-stat"><b>${students}</b><span>учеников</span></div>
      </div>
    </div>
    <div class="hero-visual">
      ${orb()}
      <div class="float-card float-1">${ic('check2', 16)} Функции одинаковые в обоих разделах</div>
      <div class="float-card float-2">${ic('book', 16)} Уровень указываешь при регистрации</div>
    </div>
  </div>
  <div class="container landing-footer">
    <span>© 2026 EliteSchool — платформа развития речи</span>
    <span>Сделано для учеников и учителей</span>
  </div>`;
}

export function viewTrackLanding(lang) {
  const isEn = parseLang(lang) === 'en';
  const slug = trackSlug(lang);
  if (isEn) {
    return `
    <nav class="landing-nav"><div class="container landing-nav-inner">
      ${brandLogo({ href: '#landing' })}
      <a href="#track/ru" class="btn btn-ghost btn-sm">← Русский раздел</a>
    </div></nav>
    <div class="container hero" style="grid-template-columns:1fr;">
      <div>
        <span class="hero-eyebrow">${ic('book', 14)} English section</span>
        <h1>Read. Prepare.<br>Retell in English.</h1>
        <p class="lead">Same three steps as the Russian section: read the text, prepare, then record. Your teacher sends English assignments and video lessons for your level — Beginner, Intermediate or Advanced.</p>
        <div class="hero-cta">
          <a href="#student-login/en" class="btn btn-primary">Student log in</a>
          <a href="#student-register/en" class="btn btn-ghost">Create student account</a>
        </div>
      </div>
    </div>`;
  }
  return `
  <nav class="landing-nav"><div class="container landing-nav-inner">
    ${brandLogo({ href: '#landing' })}
    <a href="#track/en" class="btn btn-ghost btn-sm">English section →</a>
  </div></nav>
  <div class="container hero" style="grid-template-columns:1fr;">
    <div>
      <span class="hero-eyebrow">${ic('book', 14)} Русский раздел</span>
      <h1>Читай. Готовься.<br>Пересказывай по-русски.</h1>
      <p class="lead">Те же три этапа: чтение, подготовка, запись. Учитель пришлёт русские тексты и видеоуроки для твоего уровня — начальный, средний или продвинутый.</p>
      <div class="hero-cta">
        <a href="#student-login/${slug}" class="btn btn-primary">Войти как ученик</a>
        <a href="#student-register/${slug}" class="btn btn-ghost">Регистрация ученика</a>
      </div>
    </div>
  </div>`;
}

export function viewStudentLogin(lang) {
  const isEn = parseLang(lang) === 'en';
  const slug = trackSlug(lang);
  if (isEn) {
    return `
    <div class="auth-shell">
      <div class="auth-side">
        ${brandLogo()}
        <div class="auth-quote">English section. Read, prepare and record your retelling.<span>Student log in</span></div>
        ${orb('sm')}
      </div>
      <div class="auth-form-col">
        <div class="auth-card">
          <h2>Student log in</h2>
          <p class="sub">Use the name and password from registration. You will stay in the English section.</p>
          <form data-form="student-login">
            <div class="form-error" data-error hidden></div>
            <div class="field"><label>Name</label><input name="name" type="text" autocomplete="username" placeholder="First and last name" required></div>
            <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" placeholder="Your password" required minlength="6"></div>
            <button type="submit" class="btn btn-primary btn-block">Log in</button>
          </form>
          <div class="auth-switch">No account yet? <a href="#student-register/${slug}">Register</a></div>
          <div class="auth-switch"><a href="#track/en">← English section</a> · <a href="#track/ru">Русский раздел</a></div>
        </div>
      </div>
    </div>`;
  }
  return `
  <div class="auth-shell">
    <div class="auth-side">
      ${brandLogo()}
      <div class="auth-quote">Русский раздел. Читай, готовься и записывай пересказ.<span>Вход ученика</span></div>
      ${orb('sm')}
    </div>
    <div class="auth-form-col">
      <div class="auth-card">
        <h2>Вход для ученика</h2>
        <p class="sub">Имя и пароль с регистрации. Ты попадёшь в свой раздел — русский или английский.</p>
        <form data-form="student-login">
          <div class="form-error" data-error hidden></div>
          <div class="field"><label>Имя</label><input name="name" type="text" autocomplete="username" placeholder="Имя и фамилия" required></div>
          <div class="field"><label>Пароль</label><input name="password" type="password" autocomplete="current-password" placeholder="Ваш пароль" required minlength="6"></div>
          <button type="submit" class="btn btn-primary btn-block">Войти</button>
        </form>
        <div class="auth-switch">Ещё нет аккаунта? <a href="#student-register/${slug}">Зарегистрироваться</a></div>
        <div class="auth-switch"><a href="#track/ru">← Русский раздел</a> · <a href="#teacher-login">Я учитель</a></div>
      </div>
    </div>
  </div>`;
}

export function viewStudentRegister(lang) {
  const isEn = parseLang(lang) === 'en';
  const slug = trackSlug(lang);
  const ui = isEn ? 'en' : 'ru';
  if (isEn) {
    return `
    <div class="auth-shell">
      <div class="auth-side">
        ${brandLogo()}
        <div class="auth-quote">Join the English section and choose your level. The teacher will send matching texts and videos.<span>Student registration</span></div>
        ${orb('sm')}
      </div>
      <div class="auth-form-col">
        <div class="auth-card">
          <h2>Create student account</h2>
          <p class="sub">You are registering for the English section. Pick your level so the teacher does not mix beginner and intermediate work.</p>
          <form data-form="student-register">
            <div class="form-error" data-error hidden></div>
            <input type="hidden" name="language" value="en">
            <div class="field"><label>Full name</label><input name="name" type="text" autocomplete="name" placeholder="How should we call you" required minlength="2" maxlength="80"></div>
            <div class="field"><label>Your level</label>
              <div class="chip-select">${levelOptions('en')}</div>
            </div>
            <div class="field"><label>Password</label><input name="password" type="password" autocomplete="new-password" placeholder="At least 6 characters" required minlength="6"></div>
            <div class="field"><label>Repeat password</label><input name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Password again" required minlength="6"></div>
            <button type="submit" class="btn btn-primary btn-block">Register</button>
          </form>
          <div class="auth-switch">Already have an account? <a href="#student-login/${slug}">Log in</a></div>
        </div>
      </div>
    </div>`;
  }
  return `
  <div class="auth-shell">
    <div class="auth-side">
      ${brandLogo()}
      <div class="auth-quote">Русский раздел. Укажи уровень — учитель пришлёт подходящие тексты и видеоуроки.<span>Регистрация ученика</span></div>
      ${orb('sm')}
    </div>
    <div class="auth-form-col">
      <div class="auth-card">
        <h2>Регистрация ученика</h2>
        <p class="sub">Ты в русском разделе. Выбери уровень, чтобы не получать задания другого класса.</p>
        <form data-form="student-register">
          <div class="form-error" data-error hidden></div>
          <input type="hidden" name="language" value="ru">
          <div class="field"><label>Имя и фамилия</label><input name="name" type="text" autocomplete="name" placeholder="Как к тебе обращаться" required minlength="2" maxlength="80"></div>
          <div class="field"><label>Твой уровень</label>
            <div class="chip-select">${levelOptions('ru')}</div>
          </div>
          <div class="field"><label>Пароль</label><input name="password" type="password" autocomplete="new-password" placeholder="Не меньше 6 символов" required minlength="6"></div>
          <div class="field"><label>Повтори пароль</label><input name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Ещё раз пароль" required minlength="6"></div>
          <button type="submit" class="btn btn-primary btn-block">Зарегистрироваться</button>
        </form>
        <div class="auth-switch">Уже есть аккаунт? <a href="#student-login/${slug}">Войти</a></div>
      </div>
    </div>
  </div>`;
}

export function viewTeacherLogin() {
  return `
  <div class="auth-shell">
    <div class="auth-side">
      ${brandLogo()}
      <div class="auth-quote">Проверка пересказов, результаты тестов и материалы для класса.<span>Панель учителя</span></div>
      ${orb('sm')}
    </div>
    <div class="auth-form-col">
      <div class="auth-card">
        <h2>Панель учителя</h2>
        <p class="sub">Введите код учителя, который вам выдали.</p>
        <form data-form="teacher-login">
          <div class="form-error" data-error hidden></div>
          <div class="field"><label>Код учителя</label><input name="code" type="text" autocomplete="username" placeholder="elite.mugalim35" required></div>
          <button type="submit" class="btn btn-primary btn-block">Войти в панель</button>
        </form>
        <div class="auth-switch">Вы ученик? <a href="#student-login">Войти как ученик</a></div>
      </div>
    </div>
  </div>`;
}

function skillRows(criteria) {
  return CRITERIA_META.map((c) => {
    const pct = criteria?.[c.key] ?? 0;
    return `<div class="skill-row"><span class="name">${c.name}</span><div class="bar"><i style="width:${pct}%"></i></div><span class="pct">${pct}%</span></div>`;
  }).join('');
}

export function viewStudentDashboard(data) {
  const stats = data.stats || {};
  const next = data.nextAssignment;
  const list = data.assignments || [];
  const ach = achievementsFromStats(stats).filter((a) => !a.locked).slice(0, 3);
  const body = `
    <div class="dash-stack">
    <div class="hero-progress-card">
      <div>
        <h2>Привет, ${esc(firstName(store.user?.name))}! 👋</h2>
        <p>${stats.completedCount
          ? `По пересказам уровень «${esc(stats.level)}». Проверено: ${stats.completedCount}.`
          : 'Пока нет проверенных пересказов — уровень появится после оценки учителя.'}${data.literacy?.lastLevel ? ` Тесты: ${esc(data.literacy.lastLevel)} (${data.literacy.lastPercent}%).` : ''}</p>
        <div class="streak-badge">${ic('award', 16)} Лучший результат: ${stats.bestScore != null ? stats.bestScore + ' / 100' : 'пока нет'}</div>
      </div>
      ${orb('sm')}
    </div>
    <div class="grid-4">
      <div class="card stat-card"><span class="label">Уровень и XP</span><b>${esc(stats.level || '—')}</b><span class="delta" style="color:var(--muted)">${esc(stats.scoreLevel || 'нет оценок')} · лучший ${stats.bestScore != null ? stats.bestScore : '—'}</span></div>
      <div class="card stat-card"><span class="label">Прогресс</span><b>${stats.completedCount || 0}</b><span class="delta">${ic('arrowR', 12)} назначено: ${stats.assignedCount || 0}</span></div>
      <div class="card stat-card"><span class="label">Средняя оценка</span><b>${stats.avgScore != null ? stats.avgScore : '—'}</b><span class="delta">${ic('arrowR', 12)} из 100</span></div>
      <div class="card stat-card"><span class="label">На проверке</span><b>${stats.inReviewCount || 0}</b><span class="delta" style="color:var(--muted)">ожидают оценки</span></div>
    </div>
    <div class="grid-2">
      <div class="card card-lg ${next ? 'hoverable' : ''}">
        <div class="row-between"><div><p class="section-title">Ближайшее задание</p><p class="section-sub">${next ? `Назначено учителем · до ${esc(formatDate(next.deadline))}` : 'Новых заданий пока нет'}</p></div>${next ? studentStatusBadge(next.studentStatus) : ''}</div>
        ${next ? `<div class="task-row" style="border:none; padding-top:6px;">
          <div class="task-ic">${ic(next.mode === 'VIDEO' ? 'video' : 'mic', 18)}</div>
          <div style="flex:1; min-width:0;"><p class="t-title">${esc(displayTitle(next.title))}</p><p class="t-meta">Режим: ${esc(modeLabel(next.mode))} · чтение ${esc(minutesLabel(next.readingTime))}</p></div>
          <a href="#retell-intro/${esc(next.id)}" class="btn btn-primary btn-sm">Начать</a>
        </div>` : emptyState('Пока тихо', 'Как только учитель назначит текст, он появится здесь.')}
      </div>
      <div class="card card-lg">
        <p class="section-title">Последние результаты</p>
        <p class="section-sub">По проверенным пересказам</p>
        ${stats.completedCount ? skillRows(stats.criteria) : `<p class="section-sub">Статистика появится после первой проверки.</p>`}
      </div>
    </div>
    <div class="grid-2">
      <div class="card card-lg">
        <div class="row-between"><p class="section-title">История заданий</p><a href="#progress" style="font-size:13px; color:var(--teal); font-weight:600;">Смотреть всё</a></div>
        ${list.length ? list.map((t) => `<div class="task-row">
          <div class="task-ic">${ic(t.mode === 'VIDEO' ? 'video' : 'mic', 16)}</div>
          <div style="flex:1; min-width:0;"><p class="t-title">${esc(displayTitle(t.title))}</p><p class="t-meta">${esc(modeLabel(t.mode))} · ${t.retelling?.scores ? `Оценка ${t.retelling.scores.totalScore}` : formatDate(t.deadline)}</p></div>
          <a href="#retell-intro/${esc(t.id)}">${studentStatusBadge(t.studentStatus)}</a>
        </div>`).join('') : emptyState('Нет заданий', 'Ожидайте задание от учителя.')}
      </div>
      <div class="card card-lg">
        <p class="section-title">Достижения</p>
        <p class="section-sub">Последние награды</p>
        <div class="ach-grid" style="grid-template-columns:repeat(3,1fr);">
          ${(ach.length ? ach : achievementsFromStats(stats).slice(0, 3)).map((a) => `<div class="ach ${a.locked ? 'locked' : ''}"><span class="emoji">${a.emoji}</span><b>${esc(a.title)}</b></div>`).join('')}
        </div>
        <a href="#achievements" class="btn btn-ghost btn-block btn-sm" style="margin-top:16px;">Все достижения</a>
      </div>
    </div>
    ${literacyDashCard(data.literacy)}
    </div>
  `;
  return appPage('student', 'dashboard', 'Главная', 'С возвращением! Продолжай в том же духе.', body);
}

function literacyDashCard(lit) {
  const has = lit && lit.attempts > 0;
  const en = studentIsEn();
  const testsHref = `#tests/${subjectSlugForUser()}`;
  return `
    <div class="card card-lg" style="margin-top:18px;">
      <div class="row-between" style="gap:16px; flex-wrap:wrap;">
        <div>
          <p class="section-title">${en ? 'Tests' : 'Тесты'}</p>
          <p class="section-sub" style="margin-bottom:0;">${has
            ? (en
              ? `Last result: ${lit.lastPercent}% · ${esc(lit.lastLevel)} · ${esc(lit.lastLevelTitle || '')}`
              : `Последний результат: ${lit.lastPercent}% · ${esc(lit.lastLevel)} · ${esc(lit.lastLevelTitle || '')}`)
            : (en ? 'Quizzes for your English track only.' : 'Тесты только вашего русского раздела.')}</p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${has ? `<a href="#tests-history" class="btn btn-ghost btn-sm">${en ? 'History' : 'История'}</a>` : ''}
          <a href="${testsHref}" class="btn btn-primary btn-sm">${has ? (en ? 'Open' : 'Открыть') : (en ? 'Start' : 'Начать')}</a>
        </div>
      </div>
    </div>`;
}

function testsWrap(html) {
  return `<div class="tests-theme">${html}</div>`;
}

function categoryRowsDynamic(categories) {
  const cats = categories || {};
  const keys = Object.keys(cats);
  if (!keys.length) return '<p class="section-sub">Нет данных по категориям.</p>';
  return keys.map((key) => {
    const c = cats[key];
    if (!c) return '';
    return `<div class="skill-row"><span class="name">${esc(c.label || key)}</span><div class="bar"><i style="width:${c.percent}%"></i></div><span class="pct">${c.percent}%</span></div>`;
  }).join('');
}

export function viewRetellList(assignments) {
  const body = `
    ${assignments.length ? `<div class="card card-lg">${assignments.map((t) => `<div class="task-row">
      <div class="task-ic">${ic(t.mode === 'VIDEO' ? 'video' : 'mic', 16)}</div>
      <div style="flex:1; min-width:0;"><p class="t-title">${esc(displayTitle(t.title))}</p><p class="t-meta">${esc(t.description || modeLabel(t.mode))} · до ${esc(formatDate(t.deadline))}</p></div>
      ${studentStatusBadge(t.studentStatus)}
      <a href="#retell-intro/${esc(t.id)}" class="btn btn-primary btn-sm">${retellListAction(t.studentStatus)}</a>
    </div>`).join('')}</div>` : `<div class="card card-lg">${emptyState('Заданий нет', 'Учитель ещё не назначил пересказ.')}</div>`}
  `;
  return appPage('student', 'retell-list', 'Пересказы', 'Все назначенные тексты для пересказа.', body);
}

export function viewRetellIntro(a) {
  const inner = `
    <h2>«${esc(displayTitle(a.title))}»</h2>
    <p class="hint">${esc(a.description || 'Прочитай текст и подготовь устный пересказ своими словами.')}</p>
    <ul class="rules-list" style="margin-bottom:28px;">
      <li><span class="n">1</span>Чтение текста — ${esc(minutesLabel(a.readingTime))}</li>
      <li><span class="n">2</span>Подготовка к пересказу — ${esc(minutesLabel(a.preparationTime))}</li>
      <li><span class="n">3</span>Запись пересказа (${esc(modeLabel(a.mode))}) — до ${esc(minutesLabel(a.retellingTime))}</li>
    </ul>
    ${a.deadline ? `<p class="hint">Сдать до ${esc(formatDate(a.deadline))}</p>` : ''}
    <button type="button" class="btn btn-primary btn-block" data-action="start-assignment" data-id="${esc(a.id)}">Начать задание ${ic('arrowR', 16)}</button>
  `;
  return flowShell(1, ic('book', 15) + ' Задание', inner);
}

export function viewRetellRead(a) {
  const left = a.flow?.remainingReading ?? a.readingTime;
  const pct = a.readingTime ? Math.round((1 - left / a.readingTime) * 100) : 0;
  const inner = `
    <div class="read-sticky">
      <div style="min-width:0; flex:1;">
        <h2>«${esc(displayTitle(a.title))}»</h2>
        <p class="hint" style="margin:4px 0 0;">После этого этапа текст скрывается.</p>
      </div>
      <div class="timer-ring-wrap" data-timer="reading" data-left="${left}" data-total="${a.readingTime}">${ring(pct, 78, 7, 'var(--teal)')}<div class="tval">${formatTime(left)}</div></div>
    </div>
    <div class="reading-text">${formatRichText(a.text)}</div>
    <div class="reading-progress"><i style="width:${pct}%"></i></div>
  `;
  const footer = `<div class="read-footer"><span style="font-size:13px; color:var(--muted);" data-read-pct>Прогресс чтения: ${pct}%</span>
    <button type="button" class="btn btn-primary" data-action="complete-reading" data-id="${esc(a.id)}">Завершить чтение ${ic('arrowR', 16)}</button></div>`;
  return flowShell(1, ic('book', 15) + ' Этап 1 · Чтение', inner, footer);
}

export function viewRetellPrep(a) {
  const left = a.flow?.remainingPrep ?? a.preparationTime;
  const pct = a.preparationTime ? Math.round((1 - left / a.preparationTime) * 100) : 0;
  const inner = `
    <div class="prep-stage">
      <div class="timer-ring-wrap timer-lg" data-timer="prep" data-left="${left}" data-total="${a.preparationTime}">${ring(pct, 140, 10, 'var(--amber)')}<div class="tval">${formatTime(left)}</div></div>
      <h2>Подготовься к пересказу</h2>
      <p class="hint" style="margin:0 0 8px;">Текст больше недоступен. Собери мысли — и можно записывать.</p>
      <ul class="rules-list">
        <li><span class="n">1</span>Вспомни главную мысль</li>
        <li><span class="n">2</span>Выдели главных героев</li>
        <li><span class="n">3</span>Восстанови последовательность событий</li>
      </ul>
      <button type="button" class="btn btn-primary btn-block" data-action="complete-prep" data-id="${esc(a.id)}">Готов пересказывать ${ic('arrowR', 16)}</button>
    </div>
  `;
  return flowShell(2, ic('clock', 15) + ' Этап 2 · Подготовка', inner);
}

export function viewRetellRecord(a, kind) {
  const allowAudio = a.mode === 'AUDIO' || a.mode === 'BOTH';
  const allowVideo = a.mode === 'VIDEO' || a.mode === 'BOTH';
  const type = kind === 'VIDEO' && allowVideo ? 'VIDEO' : 'AUDIO';
  const inner = `
    <h2>${type === 'VIDEO' ? 'Запиши видео-пересказ' : 'Запиши свой пересказ'}</h2>
    <p class="hint">Максимум ${esc(minutesLabel(a.retellingTime))}. Можно поставить на паузу и пересмотреть запись перед отправкой.</p>
    ${a.mode === 'BOTH' ? `<div class="mode-toggle">
      <button type="button" class="${type === 'AUDIO' ? 'on' : ''}" data-action="set-mode" data-mode="AUDIO" ${allowAudio ? '' : 'disabled'}>${ic('mic', 15)} Голос</button>
      <button type="button" class="${type === 'VIDEO' ? 'on' : ''}" data-action="set-mode" data-mode="VIDEO" ${allowVideo ? '' : 'disabled'}>${ic('camera', 15)} Видео</button>
    </div>` : ''}
    <div class="record-stage" data-recorder data-assignment="${esc(a.id)}" data-type="${type}" data-max="${a.retellingTime}">
      <div class="mic-status" data-mic-status><span class="pip"></span><span data-mic-label>Микрофон не активен</span></div>
      ${type === 'VIDEO' ? `<div class="video-preview" data-video-wrap>
        <video data-live-video playsinline muted autoplay></video>
        <div class="rec-tag" data-rec-tag hidden><i></i>REC <span data-rec-tag-time>00:00</span></div>
      </div>` : `<div class="rec-circle" data-action="rec-toggle" role="button" aria-label="Начать запись"><div class="rec-dot"></div></div>`}
      <div class="wave-live" data-wave>${Array.from({ length: 24 }).map(() => '<span style="height:6px"></span>').join('')}</div>
      <div class="rec-timer" data-rec-timer>00:00</div>
      <p class="hint" style="margin:0 0 20px;" data-rec-hint>Нажмите, чтобы начать. Разрешите доступ к ${type === 'VIDEO' ? 'камере и микрофону' : 'микрофону'}.</p>
      <div class="perm-help" data-perm-help hidden></div>
      <div class="playback" data-playback hidden></div>
      <div class="rec-controls">
        <button type="button" class="btn btn-ghost rec-cta" data-action="rec-pause" hidden>${ic('pause', 16)} Пауза</button>
        <button type="button" class="btn btn-primary rec-cta" data-action="rec-toggle">${type === 'VIDEO' ? ic('camera', 18) : ic('mic', 18)} Нажмите, чтобы начать</button>
        <button type="button" class="btn btn-ghost rec-cta" data-action="rec-preview" hidden>${ic('play', 16)} Посмотреть</button>
        <button type="button" class="btn btn-ghost rec-cta" data-action="rec-delete" hidden>${ic('trash', 16)} Перезаписать</button>
        <button type="button" class="btn btn-amber rec-cta" data-action="rec-submit" hidden>${ic('check2', 16)} Отправить</button>
      </div>
    </div>
  `;
  return flowShell(3, ic(type === 'VIDEO' ? 'camera' : 'mic', 15) + ' Этап 3 · Пересказ', inner);
}

export function viewRetellSubmitted(a) {
  const inner = `
    <div class="analysis-hero">
      <div class="score-ring">${ring(0, 118, 9, 'var(--amber)')}<div class="val"><b>—</b><span>из 100</span></div></div>
      <div>
        <span class="badge badge-amber">${ic('clock', 13)} Отправлено на проверку</span>
        <h2 style="margin:10px 0 4px;">Пересказ получен</h2>
        <p class="hint" style="margin:0;">Учитель прослушает запись, поставит оценки по пяти критериям и оставит комментарий. Оценка появится здесь и в профиле.</p>
      </div>
    </div>
    <a href="#dashboard" class="btn btn-primary">На главную</a>
  `;
  return appPage('student', 'retell-list', 'Пересказ', null, `<div class="flow-shell"><div class="stage-card">${inner}</div></div>`);
}

export function viewRetellResult(retelling) {
  const s = retelling.scores || {};
  const total = s.totalScore ?? 0;
  const inner = `
    <div class="analysis-hero">
      <div class="score-ring">${ring(total, 118, 9, 'var(--teal)')}<div class="val"><b>${total}</b><span>из 100</span></div></div>
      <div>
        <span class="badge badge-green">${ic('check2', 13)} ${esc(s.level || 'Проверено')}</span>
        <h2 style="margin:10px 0 4px;">Итог: ${total} / 100</h2>
        <p class="hint" style="margin:0;">${esc(displayTitle(retelling.assignmentTitle || ''))} · ${esc(formatDate(retelling.submittedAt))} · ${retelling.type === 'VIDEO' ? 'видео' : 'голос'} · ${formatTime(retelling.duration)}</p>
      </div>
    </div>
    <p class="section-title">Критерии</p>
    ${CRITERIA_META.map((c) => {
      const v = s[c.key] ?? 0;
      return `<div class="skill-row"><span class="name">${c.name}</span><div class="bar"><i style="width:${v / 20 * 100}%"></i></div><span class="pct">${v}/20</span></div>`;
    }).join('')}
    <div class="feedback-cols">
      <div class="fb-box fb-good"><h4>${ic('check2', 14)} Что получилось хорошо</h4>${retelling.strengths ? `<p style="margin:0; font-size:13.5px; color:var(--ink-soft);">${esc(retelling.strengths)}</p>` : '<p style="margin:0; font-size:13.5px; color:var(--ink-soft);">Учитель не отметил отдельные сильные стороны.</p>'}</div>
      <div class="fb-box fb-improve"><h4>${ic('target', 14)} Что нужно улучшить</h4>${retelling.improvements ? `<p style="margin:0; font-size:13.5px; color:var(--ink-soft);">${esc(retelling.improvements)}</p>` : '<p style="margin:0; font-size:13.5px; color:var(--ink-soft);">Отдельных замечаний нет.</p>'}</div>
    </div>
    ${retelling.teacherComment ? `<div class="card" style="margin-top:16px;"><p class="section-title">Комментарий учителя</p><p class="hint" style="margin:0;">${esc(retelling.teacherComment)}</p></div>` : ''}
    ${retelling.recommendations ? `<div class="card" style="margin-top:12px;"><p class="section-title">Рекомендации</p><p class="hint" style="margin:0;">${esc(retelling.recommendations)}</p></div>` : ''}
    <div class="row-between" style="margin-top:26px;">
      <a href="#dashboard" class="btn btn-ghost">На главную</a>
      <a href="#progress" class="btn btn-primary">Мой прогресс ${ic('arrowR', 16)}</a>
    </div>
  `;
  return appPage('student', 'retell-list', 'Результат', null, `<div class="flow-shell"><div class="stage-card">${inner}</div></div>`);
}

export function viewProgress(stats) {
  const hist = stats.history || [];
  const max = Math.max(100, ...hist.map((h) => h.score), 1);
  const body = `
    <div class="grid-2" style="margin-bottom:18px;">
      <div class="card card-lg">
        <p class="section-title">Динамика прогресса</p>
        <p class="section-sub">Оценка за каждый проверенный пересказ</p>
        ${hist.length ? `<div class="chart-bars">${hist.map((h) => `<div class="chart-col" title="${esc(h.title)}: ${h.score}"><div class="col" style="height:${Math.max(8, h.score / max * 130)}px;"></div><span style="font-size:11px; color:var(--muted);">№${h.n}</span></div>`).join('')}</div>` : emptyState('Пока нет оценок', 'После проверки первого пересказа здесь появится график.')}
      </div>
      <div class="card card-lg">
        <p class="section-title">Навыки сейчас</p>
        ${stats.completedCount ? skillRows(stats.criteria) : '<p class="section-sub">Нет данных.</p>'}
        <div class="grid-2" style="gap:12px; margin-top:12px;">
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${stats.avgScore ?? '—'}</b><div class="section-sub" style="margin:0;">средняя</div></div>
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${stats.bestScore ?? '—'}</b><div class="section-sub" style="margin:0;">лучшая</div></div>
        </div>
      </div>
    </div>
    <div class="card card-lg">
      <p class="section-title">История заданий</p>
        ${hist.length ? `<div class="table-wrap desktop-only"><table class="data">
        <thead><tr><th>Задание</th><th>Дата</th><th>Оценка</th><th></th></tr></thead>
        <tbody>${hist.map((h) => `<tr><td>${esc(h.title)}</td><td>${esc(formatDate(h.submittedAt))}</td><td>${h.score}</td><td><a href="#retell-result/${esc(h.retellingId)}" class="btn btn-ghost btn-sm">Открыть</a></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="m-card-list">${hist.map((h) => `
        <article class="m-card">
          <p class="t-title">${esc(h.title)}</p>
          <p class="t-meta" style="margin:4px 0 12px;">${esc(formatDate(h.submittedAt))} · оценка ${h.score}</p>
          <a href="#retell-result/${esc(h.retellingId)}" class="btn btn-primary">Открыть</a>
        </article>`).join('')}</div>` : emptyState('История пуста', 'Отправь первый пересказ, чтобы увидеть прогресс.')}
    </div>
  `;
  return appPage('student', 'progress', 'Мой прогресс', null, body);
}

export function viewAchievements(stats) {
  const list = achievementsFromStats(stats);
  const earned = list.filter((a) => !a.locked).length;
  const body = `
    <div class="card card-lg" style="margin-bottom:18px;">
      <div class="row-between"><p class="section-title">Собрано ${earned} из ${list.length}</p><span class="badge badge-green">${ic('award', 13)} ${esc(stats.level || '')}</span></div>
      <div class="bar" style="margin-top:10px;"><i style="width:${earned / list.length * 100}%"></i></div>
    </div>
    <div class="ach-grid">
      ${list.map((a) => `<div class="ach ${a.locked ? 'locked' : ''}"><span class="emoji">${a.emoji}</span><b>${esc(a.title)}</b><span>${a.locked ? 'Ещё не открыто' : 'Получено'}</span></div>`).join('')}
    </div>
  `;
  return appPage('student', 'achievements', 'Достижения', null, body);
}

export function viewProfile(stats) {
  const u = store.user || {};
  const ui = studentIsEn() ? 'en' : 'ru';
  const body = `
    <div class="grid-2">
      <div class="card card-lg">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:22px;">
          <div class="avatar" style="width:64px;height:64px;font-size:20px;">${esc(initials(u.name))}</div>
          <div>
            <p class="section-title" style="margin-bottom:2px;">${esc(u.name)}</p>
            <p class="section-sub" style="margin:0;">${esc(levelLabel(u.enrollmentLevel, ui))}</p>
          </div>
        </div>
        <div class="field" style="margin-bottom:18px;">
          <label>${ui === 'en' ? 'Language' : 'Язык'}</label>
          <p class="section-title" style="margin:6px 0 0;">${esc(langLabel(u.language, ui))}</p>
          <p class="hint" style="margin:6px 0 0;">${ui === 'en' ? 'Language is set at registration and cannot be changed here.' : 'Язык задаётся при регистрации и здесь не меняется.'}</p>
        </div>
        <div class="grid-3" style="gap:12px;">
          <div class="card" style="padding:16px; text-align:center;"><b style="font-family:'Unbounded'; font-size:20px;">${stats.completedCount || 0}</b><div class="section-sub" style="margin:0;">${ui === 'en' ? 'reviewed' : 'проверено'}</div></div>
          <div class="card" style="padding:16px; text-align:center;"><b style="font-family:'Unbounded'; font-size:20px;">${stats.submittedCount || 0}</b><div class="section-sub" style="margin:0;">${ui === 'en' ? 'submitted' : 'отправлено'}</div></div>
          <div class="card" style="padding:16px; text-align:center;"><b style="font-family:'Unbounded'; font-size:20px;">${stats.avgScore ?? '—'}</b><div class="section-sub" style="margin:0;">${ui === 'en' ? 'avg score' : 'ср. оценка'}</div></div>
        </div>
        <p class="section-title" style="margin-top:26px;">${ui === 'en' ? 'Skills' : 'Навыки'}</p>
        ${stats.completedCount ? skillRows(stats.criteria) : `<p class="section-sub">${ui === 'en' ? 'Scores appear after teacher review.' : 'Оценки появятся после проверки.'}</p>`}
      </div>
      <div class="card card-lg">
        <p class="section-title">${ui === 'en' ? 'Recent results' : 'Последние результаты'}</p>
        ${(stats.history || []).slice().reverse().slice(0, 6).map((h) => `<div class="task-row">
          <div class="task-ic">${ic('mic', 16)}</div>
          <div style="flex:1;"><p class="t-title">${esc(h.title)}</p><p class="t-meta">${esc(formatDate(h.reviewedAt || h.submittedAt))}</p></div>
          <a href="#retell-result/${esc(h.retellingId)}" class="badge badge-green">${h.score}/100</a>
        </div>`).join('') || emptyState(ui === 'en' ? 'Empty for now' : 'Пока пусто', ui === 'en' ? 'Reviewed retellings will appear here.' : 'Здесь появятся проверенные пересказы.')}
      </div>
    </div>
  `;
  return appPage('student', 'profile', ui === 'en' ? 'Profile' : 'Профиль', null, body);
}

function youtubeEmbed(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

function lessonThumb(lesson) {
  if (lesson.type === 'PDF') return ic('clip', 22);
  if (lesson.type === 'COMPUTER') return ic('train', 22);
  return ic('play', 22);
}

function lessonPlayer(lesson) {
  if (lesson.type === 'PDF') {
    if (!lesson.hasFile) return emptyState('Нет файла', 'PDF ещё не приложен.');
    return `<iframe class="lesson-pdf" data-auth-media="${esc(lessonFileUrl(lesson.id))}" title="${esc(lesson.title)}"></iframe>
      <p class="section-sub" data-media-error hidden style="color:var(--red); margin-top:10px;"></p>
      <a class="btn btn-ghost btn-sm" data-auth-download="${esc(lessonFileUrl(lesson.id))}" download="${esc(lesson.originalName || 'document.pdf')}" style="margin-top:12px;">Скачать PDF</a>`;
  }
  const yt = youtubeEmbed(lesson.videoUrl);
  if (yt) {
    return `<div class="lesson-player"><iframe src="${yt}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="${esc(lesson.title)}"></iframe></div>`;
  }
  if (lesson.hasFile) {
    return `<div class="lesson-player">${authMediaPlayer('VIDEO', lessonFileUrl(lesson.id))}</div>`;
  }
  if (lesson.videoUrl) {
    return `<div class="lesson-player"><video controls playsinline src="${esc(lesson.videoUrl)}"></video></div>`;
  }
  return emptyState('Нет видео', 'Учитель ещё не приложил ролик.');
}

function lessonCard(lesson, href) {
  const isPdf = lesson.type === 'PDF';
  const bg = isPdf
    ? 'linear-gradient(135deg,#5A6B4E,var(--teal-mid))'
    : lesson.type === 'COMPUTER'
      ? 'linear-gradient(135deg,#2C4A5A,var(--teal))'
      : lesson.section === 'BONUS'
        ? 'linear-gradient(135deg,var(--amber),#F2C374)'
        : 'linear-gradient(135deg,var(--teal-deep),var(--teal-mid))';
  const color = lesson.section === 'BONUS' && !isPdf && lesson.type !== 'COMPUTER' ? 'color:var(--teal-deep);' : 'color:#fff;';
  return `
    <a href="${href}" class="card hoverable" style="display:block; padding:0; overflow:hidden;">
      <div style="aspect-ratio:16/9; background:${bg}; display:flex; align-items:center; justify-content:center; position:relative;">
        <div style="width:52px;height:52px;border-radius:50%; background:rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; ${color}">${lessonThumb(lesson)}</div>
        ${lesson.duration ? `<span style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,.5); color:#fff; font-size:11px; padding:3px 8px; border-radius:100px;">${esc(lesson.duration)}</span>` : ''}
        ${isPdf ? `<span style="position:absolute; bottom:10px; left:10px; background:rgba(0,0,0,.5); color:#fff; font-size:11px; padding:3px 8px; border-radius:100px;">PDF</span>` : ''}
      </div>
      <div style="padding:18px;">
        <span class="badge badge-grey" style="margin-bottom:10px;">${esc(lesson.category || lesson.typeLabel)}</span>
        <p class="section-title" style="margin-bottom:4px; font-size:14.5px;">${esc(lesson.title)}</p>
        <p class="section-sub" style="margin:0;">${lesson.level ? `Уровень: ${esc(lesson.level)}` : esc(lesson.teacherName || '')}</p>
      </div>
    </a>`;
}

export function viewVideoLessons(lessons) {
  const list = lessons || [];
  const body = list.length
    ? `<div class="grid-3">${list.map((v) => lessonCard(v, `#video-lesson-detail/${esc(v.id)}`)).join('')}</div>`
    : `<div class="card card-lg">${emptyState('Видеоуроков пока нет', 'Как только учитель добавит урок, он появится здесь.')}</div>`;
  return appPage('student', 'video-lessons', 'Видеоуроки', 'Уроки, которые добавил учитель.', body);
}

export function viewVideoLessonDetail(payload) {
  const v = payload.lesson;
  const others = payload.others || [];
  const body = `
    <a href="#video-lessons" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} Ко всем видеоурокам</a>
    <div class="grid-2">
      <div class="card card-lg" style="padding:0; overflow:hidden;">
        <div style="padding:0;">${lessonPlayer(v)}</div>
        <div style="padding:24px;">
          <span class="badge badge-grey" style="margin-bottom:12px;">${esc(v.category || 'Видеоурок')}${v.level ? ` · ${esc(v.level)}` : ''}</span>
          <h2 style="font-size:21px; margin:0 0 10px;">${esc(v.title)}</h2>
          <p class="hint" style="margin:0;">${esc(v.description || '')}</p>
        </div>
      </div>
      <div class="card card-lg">
        <p class="section-title">Другие видеоуроки</p>
        ${others.length ? others.map((l) => `<a href="#video-lesson-detail/${esc(l.id)}" class="task-row" style="color:inherit;">
          <div class="task-ic">${ic('video', 16)}</div>
          <div style="flex:1;"><p class="t-title">${esc(l.title)}</p><p class="t-meta">${esc(l.category)} · ${esc(l.duration || l.level || '')}</p></div>
        </a>`).join('') : '<p class="section-sub">Других уроков пока нет.</p>'}
      </div>
    </div>
  `;
  return appPage('student', 'video-lessons', 'Видеоурок', null, body);
}

function bonusGroup(title, items) {
  if (!items.length) return '';
  return `<p class="section-title">${esc(title)}</p>
    <div class="grid-3" style="margin-bottom:26px;">${items.map((b) => lessonCard(b, `#bonus-lesson-detail/${esc(b.id)}`)).join('')}</div>`;
}

export function viewBonusLessons(lessons) {
  const list = lessons || [];
  const videos = list.filter((l) => l.type === 'VIDEO');
  const pdfs = list.filter((l) => l.type === 'PDF');
  const computers = list.filter((l) => l.type === 'COMPUTER');
  const body = `
    <div class="card card-lg" style="background:linear-gradient(135deg, var(--teal-deep), var(--teal-mid)); color:#fff; margin-bottom:22px; display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
      <div style="width:52px;height:52px;border-radius:14px; background:rgba(255,255,255,.12); display:flex; align-items:center; justify-content:center;">${ic('gift', 24)}</div>
      <div style="flex:1; min-width:200px;">
        <p style="margin:0 0 4px; font-family:'Unbounded'; font-size:16px;">Дополнительные материалы от учителя</p>
        <p style="margin:0; font-size:13.5px; color:rgba(255,255,255,.7);">Видео, PDF и уроки про компьютер — то, что учитель выдал в этом разделе.</p>
      </div>
    </div>
    ${list.length
      ? `${bonusGroup('Видеоуроки', videos)}${bonusGroup('PDF-документы', pdfs)}${bonusGroup('Видеоуроки про компьютер', computers)}`
      : `<div class="card card-lg">${emptyState('Бонусных уроков пока нет', 'Учитель ещё не выдал дополнительные материалы.')}</div>`}
  `;
  return appPage('student', 'bonus-lessons', 'Бонусные уроки', null, body);
}

export function viewBonusLessonDetail(payload) {
  const b = payload.lesson;
  const body = `
    <a href="#bonus-lessons" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} Ко всем бонусным урокам</a>
    <div class="grid-2">
      <div class="card card-lg" style="padding:0; overflow:hidden;">
        <div style="padding:0;">${lessonPlayer(b)}</div>
        <div style="padding:24px;">
          <span class="badge badge-amber" style="margin-bottom:12px;">${ic('gift', 12)} ${esc(b.typeLabel || 'Бонус')}</span>
          <h2 style="font-size:21px; margin:0 0 10px;">${esc(b.title)}</h2>
          <p class="hint" style="margin:0;">${esc(b.description || '')}</p>
        </div>
      </div>
      <div class="card card-lg">
        <p class="section-title">Комментарий учителя</p>
        ${b.note
          ? `<div class="fb-box fb-good"><p style="margin:0; font-size:13.5px;">«${esc(b.note)}» — ${esc(b.teacherName)}</p></div>`
          : `<p class="section-sub">Учитель не оставил комментарий к этому материалу.</p>`}
      </div>
    </div>
  `;
  return appPage('student', 'bonus-lessons', 'Бонусный урок', null, body);
}

export function viewTraining() {
  const en = studentIsEn();
  const items = en ? [
    ['puzzle', 'Games', 'Main idea, story order, cloze and sprint', '#games'],
    ['book', 'English tests', 'Quizzes for your English track', `#tests/${subjectSlugForUser()}`],
    ['mic', 'Retellings', 'Assignments from your teacher', '#retell-list'],
    ['video', 'Video lessons', 'Materials from your teacher', '#video-lessons'],
    ['gift', 'Bonus lessons', 'Video, PDF and computer lessons', '#bonus-lessons'],
    ['chart', 'My progress', 'Scores from reviewed retellings', '#progress'],
  ] : [
    ['puzzle', 'Игры', 'Главная мысль, порядок событий, слова и спринт грамотности', '#games'],
    ['book', 'Русские тесты', 'Тесты только вашего русского раздела', `#tests/${subjectSlugForUser()}`],
    ['mic', 'Пересказы', 'Задания, которые назначил учитель', '#retell-list'],
    ['video', 'Видеоуроки', 'Материалы, которые добавил учитель', '#video-lessons'],
    ['gift', 'Бонусные уроки', 'Видео, PDF и уроки про компьютер', '#bonus-lessons'],
    ['chart', 'Мой прогресс', 'Реальные оценки за проверенные пересказы', '#progress'],
  ];
  const body = `<div class="grid-3">${items.map(([i, t, c, href]) => `
    <a href="${href}" class="card hoverable" style="display:block;">
      <div class="task-ic" style="margin-bottom:14px;">${ic(i, 18)}</div>
      <p class="section-title" style="margin-bottom:2px;">${t}</p>
      <p class="section-sub" style="margin:0;">${c}</p>
    </a>`).join('')}</div>`;
  return appPage('student', 'training', en ? 'Practice' : 'Тренировка', en ? 'Working sections of the platform.' : 'Здесь только рабочие разделы платформы.', body);
}

export function viewTeacherDashboard(data) {
  const t = data.totals || {};
  const pending = data.pending || [];
  const tracks = data.tracks || {};
  const ru = tracks.ru || tracks.RU || {};
  const en = tracks.en || tracks.EN || {};
  const activity = data.activity || [0, 0, 0, 0, 0, 0, 0];
  const maxA = Math.max(1, ...activity);
  const days = activity.map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (activity.length - 1 - i));
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  });
  const body = `
    <div class="grid-2" style="margin-bottom:18px;">
      <a href="#teacher-track/ru" class="card card-lg hoverable" style="display:block;">
        <span class="badge badge-green">Русский раздел</span>
        <p class="section-title" style="margin-top:10px;">Русский</p>
        <p class="section-sub">Ученики: ${ru.students || 0} · задания: ${ru.assignments || 0} · на проверке: ${ru.pending || 0}</p>
        <p class="hint" style="margin:0;">Начальный ${ru.levels?.BEGINNER || 0} · средний ${ru.levels?.INTERMEDIATE || 0} · продвинутый ${ru.levels?.ADVANCED || 0}</p>
      </a>
      <a href="#teacher-track/en" class="card card-lg hoverable" style="display:block;">
        <span class="badge badge-amber">English section</span>
        <p class="section-title" style="margin-top:10px;">English</p>
        <p class="section-sub">Students: ${en.students || 0} · assignments: ${en.assignments || 0} · to review: ${en.pending || 0}</p>
        <p class="hint" style="margin:0;">Beginner ${en.levels?.BEGINNER || 0} · intermediate ${en.levels?.INTERMEDIATE || 0} · advanced ${en.levels?.ADVANCED || 0}</p>
      </a>
    </div>
    <div class="grid-4" style="margin-bottom:18px;">
      <div class="card stat-card"><span class="label">Всего учеников</span><b>${t.students || 0}</b></div>
      <div class="card stat-card"><span class="label">Сдали все назначенное</span><b>${t.completed || 0}</b></div>
      <div class="card stat-card"><span class="label">Есть несданные</span><b>${t.notCompleted || 0}</b></div>
      <div class="card stat-card"><span class="label">На проверке</span><b>${t.inReview || 0}</b><span class="delta">ср. оценка ${t.avgScore ?? '—'}</span></div>
    </div>
    <div class="grid-2">
      <div class="card card-lg">
        <p class="section-title">Активность учеников</p>
        <p class="section-sub">Отправленные пересказы за последние 7 дней. 0 — в этот день отправок не было.</p>
        <div class="chart-bars">${activity.map((v, i) => `<div class="chart-col"><div class="col" style="height:${Math.max(4, v / maxA * 120)}px; background:${i === activity.length - 1 ? 'var(--amber)' : 'var(--teal)'};"></div><span style="font-size:11px; color:var(--muted);">${esc(days[i] || '')}</span></div>`).join('')}</div>
      </div>
      <div class="card card-lg">
        <div class="row-between"><p class="section-title">На проверку</p><a href="#teacher-review" style="font-size:13px; color:var(--teal); font-weight:600;">Все</a></div>
        ${pending.length ? pending.map((r) => `<div class="task-row"><div class="task-ic">${ic(r.type === 'VIDEO' ? 'video' : 'mic', 16)}</div><div style="flex:1; min-width:0;"><p class="t-title">${esc(r.studentName)}</p><p class="t-meta">${esc(displayTitle(r.assignmentTitle))} · ${esc(formatDate(r.submittedAt))}</p></div><a href="#teacher-review-detail/${esc(r.id)}" class="btn btn-ghost btn-sm">Открыть</a></div>`).join('') : emptyState('Очередь пуста', 'Новых пересказов пока нет.')}
      </div>
    </div>
    <div class="card card-lg" style="margin-top:18px;">
      <div class="row-between" style="flex-wrap:wrap; gap:12px;">
        <div>
          <p class="section-title">Тесты</p>
          <p class="section-sub" style="margin:0;">English / Русский · результаты учеников</p>
        </div>
        <a href="#teacher-literacy" class="btn btn-primary btn-sm">Открыть кабинет</a>
      </div>
    </div>
  `;
  return appPage('teacher', 'teacher-dashboard', 'Главная', store.user?.groupName ? `Группа «${esc(store.user.groupName)}» · сводка` : 'Сводка', body);
}

export function viewTeacherTrack(lang, data = {}) {
  const isEn = parseLang(lang) === 'en';
  const slug = trackSlug(lang);
  const code = parseLang(lang);
  const track = (data.tracks && data.tracks[code]) || {};
  const levels = track.levels || {};
  const title = isEn ? 'English section' : 'Русский раздел';
  const body = `
    <a href="#teacher-dashboard" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} На главную</a>
    <div class="grid-4" style="margin-bottom:18px;">
      <div class="card stat-card"><span class="label">Ученики</span><b>${track.students || 0}</b></div>
      <div class="card stat-card"><span class="label">Задания</span><b>${track.assignments || 0}</b></div>
      <div class="card stat-card"><span class="label">На проверке</span><b>${track.pending || 0}</b></div>
      <div class="card stat-card"><span class="label">Видеоуроки</span><b>${track.videos || 0}</b></div>
    </div>
    <div class="grid-3" style="margin-bottom:18px;">
      <div class="card"><p class="section-sub" style="margin:0 0 4px;">${isEn ? 'Beginner' : 'Начальный'}</p><b style="font-family:'Unbounded'; font-size:22px;">${levels.BEGINNER || 0}</b></div>
      <div class="card"><p class="section-sub" style="margin:0 0 4px;">${isEn ? 'Intermediate' : 'Средний'}</p><b style="font-family:'Unbounded'; font-size:22px;">${levels.INTERMEDIATE || 0}</b></div>
      <div class="card"><p class="section-sub" style="margin:0 0 4px;">${isEn ? 'Advanced' : 'Продвинутый'}</p><b style="font-family:'Unbounded'; font-size:22px;">${levels.ADVANCED || 0}</b></div>
    </div>
    <div class="grid-2">
      <div class="card card-lg">
        <p class="section-title">${isEn ? 'Assignments' : 'Задания'}</p>
        <p class="section-sub">${isEn ? 'Create texts for this language and level only.' : 'Создавайте тексты только для этого языка и уровня.'}</p>
        <a href="#teacher-create/${slug}" class="btn btn-primary btn-block" style="margin-bottom:8px;">${ic('plus', 16)} ${isEn ? 'Create assignment' : 'Создать задание'}</a>
        <a href="#teacher-assignments/${slug}" class="btn btn-ghost btn-block">${isEn ? 'All assignments' : 'Все задания'}</a>
      </div>
      <div class="card card-lg">
        <p class="section-title">${isEn ? 'Lessons & review' : 'Уроки и проверка'}</p>
        <p class="section-sub">${isEn ? 'Video for beginners stays separate from intermediate.' : 'Видео для начального не смешивается со средним.'}</p>
        <a href="#teacher-video-create/${slug}" class="btn btn-primary btn-block" style="margin-bottom:8px;">${ic('video', 16)} ${isEn ? 'Add video lesson' : 'Добавить видеоурок'}</a>
        <a href="#teacher-video-lessons/${slug}" class="btn btn-ghost btn-block" style="margin-bottom:8px;">${isEn ? 'Video lessons' : 'Видеоуроки'}</a>
        <a href="#teacher-bonus-create/${slug}" class="btn btn-ghost btn-block" style="margin-bottom:8px;">${ic('gift', 16)} ${isEn ? 'Bonus lesson' : 'Бонусный урок'}</a>
        <a href="#teacher-review/${slug}" class="btn btn-amber btn-block">${ic('check2', 16)} ${isEn ? 'Review queue' : 'Проверка'}</a>
      </div>
    </div>
  `;
  return teacherPage(lang, title, isEn ? 'Same tools, English materials only' : 'Те же функции, только русские материалы', body);
}

export function viewTeacherStudents(students, filter = 'all') {
  const filtered = students.filter((s) => {
    const lang = parseLang(s.language) || 'ru';
    if (filter === 'ru') return lang === 'ru';
    if (filter === 'en') return lang === 'en';
    if (filter === 'done') return s.pendingCount === 0 && s.assignedCount > 0;
    if (filter === 'todo') return s.pendingCount > 0;
    if (filter === 'review') return s.inReviewCount > 0;
    if (filter === 'high') return (s.avgScore || 0) >= 75;
    if (filter === 'low') return s.avgScore != null && s.avgScore < 60;
    return true;
  }).slice().sort((a, b) => {
    const la = parseLang(a.language) || 'ru';
    const lb = parseLang(b.language) || 'ru';
    if (la !== lb) return la === 'ru' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
  });
  const ruN = students.filter((s) => (parseLang(s.language) || 'ru') === 'ru').length;
  const enN = students.filter((s) => parseLang(s.language) === 'en').length;
  const body = `
    <div class="card card-lg">
      <div class="filter-row">
        ${[['all', `Все (${students.length})`], ['ru', `Русский (${ruN})`], ['en', `English (${enN})`], ['done', 'Выполнено'], ['todo', 'Не выполнено'], ['review', 'На проверке'], ['high', 'Высокий результат'], ['low', 'Низкий результат']].map(([id, label]) => `<button type="button" data-action="student-filter" data-filter="${id}" class="${filter === id ? 'on' : ''}">${label}</button>`).join('')}
      </div>
      ${filtered.length ? `<div class="table-wrap desktop-only"><table class="data">
        <thead><tr><th>Ученик</th><th>Язык</th><th>Уровень</th><th>По оценкам</th><th>Проверено</th><th>Не сдано</th><th>Средняя оценка</th><th>Последняя активность</th><th></th></tr></thead>
        <tbody>${filtered.map((s) => {
          const lang = parseLang(s.language) || 'ru';
          return `<tr>
          <td><div class="student-cell"><div class="avatar" style="width:30px;height:30px;font-size:11px;">${esc(initials(s.name))}</div>${esc(s.name)}</div></td>
          <td><span class="pill ${lang === 'en' ? 'pill-en' : 'pill-ru'}">${esc(langLabel(lang))}</span></td>
          <td>${esc(levelLabel(s.enrollmentLevel))}</td>
          <td>${s.completedCount ? esc(s.level) : '—'}</td>
          <td>${s.completedCount}</td>
          <td>${s.pendingCount}</td>
          <td>${s.avgScore ?? '—'}</td>
          <td><span class="status-dot ${s.inReviewCount ? 'progress' : s.pendingCount ? 'pending' : 'done'}"></span>${esc(relativeDate(s.lastActiveAt))}</td>
          <td><a href="#teacher-student-detail/${esc(s.id)}" class="btn btn-ghost btn-sm">Открыть</a></td>
        </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="m-card-list">${filtered.map((s) => {
        const lang = parseLang(s.language) || 'ru';
        return `
        <article class="m-card">
          <div class="m-card-head">
            <div class="avatar">${esc(initials(s.name))}</div>
            <div>
              <p class="t-title">${esc(s.name)}</p>
              <p class="t-meta"><span class="pill ${lang === 'en' ? 'pill-en' : 'pill-ru'}">${esc(langLabel(lang))}</span> · ${esc(levelLabel(s.enrollmentLevel))} · по оценкам: ${s.completedCount ? esc(s.level) : '—'}</p>
            </div>
          </div>
          <dl class="m-card-meta">
            <div><dt>Выполнено</dt><dd>${s.completedCount}</dd></div>
            <div><dt>Не сдано</dt><dd>${s.pendingCount}</dd></div>
            <div><dt>Средняя оценка</dt><dd>${s.avgScore ?? '—'}</dd></div>
          </dl>
          <a href="#teacher-student-detail/${esc(s.id)}" class="btn btn-primary">Открыть профиль</a>
        </article>`;
      }).join('')}</div>` : emptyState('Никого не найдено', 'Измените фильтр.')}
    </div>
  `;
  return appPage('teacher', 'teacher-students', 'Ученики', `${ruN} RU · ${enN} EN`, body);
}

export function viewTeacherStudentDetail(payload) {
  const s = payload.student;
  const body = `
    <a href="#teacher-students" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} К списку учеников</a>
    <div class="grid-2">
      <div class="card card-lg">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:18px;">
          <div class="avatar" style="width:56px;height:56px;font-size:17px;">${esc(initials(s.name))}</div>
          <div><p class="section-title" style="margin-bottom:2px;">${esc(s.name)}</p><p class="section-sub" style="margin:0;">Language: ${esc(langLabel(s.language))} · ${s.completedCount ? esc(s.level) : 'Ученик'}</p></div>
        </div>
        ${s.completedCount ? skillRows(s.criteria) : '<p class="section-sub">Оценки появятся после проверки пересказов.</p>'}
      </div>
      <div class="card card-lg">
        <p class="section-title">Сводка</p>
        <div class="grid-2" style="gap:12px; margin-bottom:16px;">
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${s.completedCount}</b><div class="section-sub" style="margin:0;">проверено</div></div>
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${s.avgScore ?? '—'}</b><div class="section-sub" style="margin:0;">ср. оценка</div></div>
        </div>
        <p class="section-title">Пересказы</p>
        ${(payload.retellings || []).map((r) => `<div class="task-row">
          <div class="task-ic">${ic(r.type === 'VIDEO' ? 'video' : 'mic', 16)}</div>
          <div style="flex:1; min-width:0;"><p class="t-title">${esc(displayTitle(r.assignmentTitle))}</p><p class="t-meta">${esc(formatDate(r.submittedAt))} · ${r.scores ? r.scores.totalScore + '/100' : r.status}</p></div>
          <a href="#teacher-review-detail/${esc(r.id)}" class="btn btn-ghost btn-sm">Открыть</a>
        </div>`).join('') || emptyState('Нет работ', 'Ученик ещё не отправлял пересказ.')}
      </div>
    </div>
    ${teacherLiteracySnippet(payload.literacy, s.id)}
  `;
  return appPage('teacher', 'teacher-students', 'Профиль ученика', null, body);
}

function teacherLiteracySnippet(lit, studentId) {
  const has = lit && lit.attempts > 0;
  const weak = (lit?.weakTopics || []).map((t) => t.topic).join(', ');
  return `
    <div class="card card-lg" style="margin-top:18px;">
      <div class="row-between" style="flex-wrap:wrap; gap:12px;">
        <div>
          <p class="section-title">Тесты</p>
          <p class="section-sub" style="margin:0;">${has
            ? `${esc(lit.lastLevel)} · последний ${lit.lastPercent}% · средний ${lit.avgPercent}%${weak ? ` · слабо: ${esc(weak)}` : ''}`
            : 'Ученик ещё не проходил тесты.'}</p>
        </div>
        <a href="#teacher-literacy/${esc(studentId)}" class="btn btn-ghost btn-sm">Подробнее</a>
      </div>
    </div>`;
}

export function viewTeacherAssignments(list, lang = 'ru') {
  const slug = trackSlug(lang);
  const groups = [
    ['Активные', list.filter((a) => a.status === 'ACTIVE')],
    ['Черновики', list.filter((a) => a.status === 'DRAFT')],
    ['Завершённые', list.filter((a) => a.status === 'COMPLETED')],
    ['Просроченные', list.filter((a) => a.status === 'EXPIRED')],
  ];
  const body = `
    <div class="grid-4" style="margin-bottom:22px;">
      <div class="card stat-card"><span class="label">Активные</span><b>${groups[0][1].length}</b></div>
      <div class="card stat-card"><span class="label">Черновики</span><b>${groups[1][1].length}</b></div>
      <div class="card stat-card"><span class="label">Завершённые</span><b>${groups[2][1].length}</b></div>
      <div class="card stat-card"><span class="label">Просроченные</span><b>${groups[3][1].length}</b></div>
    </div>
    ${groups.map(([name, items]) => `
      <p class="section-title">${name}</p>
      <div class="card card-lg" style="margin-bottom:22px;">
        ${items.length ? items.map((a) => `<div class="task-row">
          <div class="task-ic">${ic('clip', 16)}</div>
          <div style="flex:1; min-width:0;"><p class="t-title">${esc(displayTitle(a.title))}</p><p class="t-meta">Назначено: ${a.assignedCount} · Сдали: ${a.submittedCount} · На проверке: ${a.pendingReview} · Ср. оценка: ${a.avgScore ?? '—'}</p></div>
          ${assignmentStatusBadge(a.status)}
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <a href="#teacher-assignment-edit/${esc(a.id)}" class="btn btn-ghost btn-sm">Изменить</a>
            <button type="button" class="btn btn-ghost btn-sm" data-action="delete-assignment" data-id="${esc(a.id)}" data-back="teacher-assignments/${slug}">Удалить</button>
          </div>
        </div>`).join('') : `<div class="section-sub">Пока пусто</div>`}
      </div>`).join('')}
    <a href="#teacher-create/${slug}" class="btn btn-primary">${ic('plus', 16)} Создать задание</a>
  `;
  return appPage('teacher', 'teacher-assignments', 'Задания', null, body);
}

export function viewTeacherCreate(students, lang = 'ru') {
  const code = parseLang(lang);
  const slug = trackSlug(code);
  const isEn = code === 'en';
  const list = (students || []).filter((s) => parseLang(s.language) === code);
  const body = `
    <a href="#teacher-track/${slug}" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} ${isEn ? 'Back to English section' : 'К русскому разделу'}</a>
    <div class="card card-lg" style="max-width:820px;">
      <form data-form="create-assignment">
        <div class="form-error" data-error hidden></div>
        <input type="hidden" name="language" value="${code}">
        <div class="form-grid">
          <div class="field span-2"><label>${isEn ? 'Title' : 'Название'}</label><input name="title" type="text" required placeholder="${isEn ? 'e.g. My summer holiday' : 'Например, «Как зимуют звери»'}"></div>
          <div class="field span-2"><label>${isEn ? 'Description' : 'Описание'}</label><textarea name="description" placeholder="${isEn ? 'Short note for the student' : 'Короткое описание для ученика'}"></textarea></div>
          <div class="field span-2"><label>${isEn ? 'Text' : 'Текст'}</label><textarea name="text" required style="min-height:160px;" placeholder="${isEn ? 'Paste the English text for retelling' : 'Вставьте текст для пересказа'}"></textarea></div>
          <div class="field"><label>${isEn ? 'Reading (min)' : 'Время чтения (минуты)'}</label><input name="readingMin" type="number" min="1" max="60" value="5" required></div>
          <div class="field"><label>${isEn ? 'Prep (min)' : 'Время подготовки (минуты)'}</label><input name="prepMin" type="number" min="1" max="60" value="2" required></div>
          <div class="field"><label>${isEn ? 'Retelling max (min)' : 'Максимальное время пересказа (минуты)'}</label><input name="retellMin" type="number" min="1" max="30" value="5" required></div>
          <div class="field"><label>${isEn ? 'Deadline' : 'Дедлайн'}</label><input name="deadline" type="datetime-local"></div>
          <div class="field span-2"><label>${isEn ? 'Level for this assignment' : 'Уровень задания'}</label>
            <div class="chip-select">
              <label><input type="radio" name="targetLevel" value="BEGINNER" checked> ${isEn ? 'Beginner' : 'Начальный'}</label>
              <label><input type="radio" name="targetLevel" value="INTERMEDIATE"> ${isEn ? 'Intermediate' : 'Средний'}</label>
              <label><input type="radio" name="targetLevel" value="ADVANCED"> ${isEn ? 'Advanced' : 'Продвинутый'}</label>
              <label><input type="radio" name="targetLevel" value="ALL"> ${isEn ? 'All levels' : 'Все уровни раздела'}</label>
            </div>
          </div>
          <div class="field span-2"><label>${isEn ? 'Recording type' : 'Тип записи'}</label>
            <div class="chip-select">
              <label><input type="radio" name="mode" value="AUDIO" checked> ${isEn ? 'Audio' : 'Голос'}</label>
              <label><input type="radio" name="mode" value="VIDEO"> ${isEn ? 'Video' : 'Видео'}</label>
              <label><input type="radio" name="mode" value="BOTH"> ${isEn ? 'Audio or video' : 'Голос и видео на выбор'}</label>
            </div>
          </div>
          <div class="field span-2"><label>${isEn ? 'Students in this section' : 'Ученики этого раздела'}</label>
            <div class="chip-select">
              <label><input type="checkbox" data-assign-all checked> ${isEn ? 'All matching students' : 'Всем подходящим ученикам'}</label>
            </div>
            <div class="chip-select" data-student-chips style="margin-top:10px;">
              ${list.length ? list.map((s) => `<label><input type="checkbox" name="studentIds" value="${esc(s.id)}" checked> ${esc(s.name)} · ${esc(levelLabel(s.enrollmentLevel, isEn ? 'en' : 'ru'))}</label>`).join('') : `<p class="section-sub">${isEn ? 'No students in English yet.' : 'Пока нет учеников в этом разделе.'}</p>`}
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-ghost" name="status" value="DRAFT">${isEn ? 'Save draft' : 'Сохранить черновик'}</button>
          <button type="submit" class="btn btn-primary" name="status" value="ACTIVE">${isEn ? 'Publish' : 'Опубликовать задание'} ${ic('arrowR', 16)}</button>
        </div>
      </form>
    </div>
  `;
  return teacherPage(code, isEn ? 'Create English assignment' : 'Создать задание', null, body);
}

function toDatetimeLocal(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function viewTeacherEditAssignment(payload, students) {
  const a = payload?.assignment || {};
  const code = parseLang(a.language);
  const slug = trackSlug(code);
  const isEn = code === 'en';
  const list = (students || []).filter((s) => parseLang(s.language) === code);
  const assigned = new Set((a.assignedStudents || []).map((s) => s.id));
  const level = a.targetLevel || 'ALL';
  const mode = a.mode || 'AUDIO';
  const body = `
    <a href="#teacher-assignments/${slug}" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} ${isEn ? 'Back to assignments' : 'К списку заданий'}</a>
    <div class="card card-lg" style="max-width:820px;">
      <form data-form="edit-assignment" data-id="${esc(a.id)}">
        <div class="form-error" data-error hidden></div>
        <input type="hidden" name="language" value="${code}">
        <div class="form-grid">
          <div class="field span-2"><label>${isEn ? 'Title' : 'Название'}</label><input name="title" type="text" required value="${esc(a.title || '')}"></div>
          <div class="field span-2"><label>${isEn ? 'Description' : 'Описание'}</label><textarea name="description">${esc(a.description || '')}</textarea></div>
          <div class="field span-2"><label>${isEn ? 'Text' : 'Текст'}</label><textarea name="text" required style="min-height:160px;">${esc(a.text || '')}</textarea></div>
          <div class="field"><label>${isEn ? 'Reading (min)' : 'Время чтения (минуты)'}</label><input name="readingMin" type="number" min="1" max="60" value="${Math.max(1, Math.round((a.readingTime || 300) / 60))}" required></div>
          <div class="field"><label>${isEn ? 'Prep (min)' : 'Время подготовки (минуты)'}</label><input name="prepMin" type="number" min="1" max="60" value="${Math.max(1, Math.round((a.preparationTime || 120) / 60))}" required></div>
          <div class="field"><label>${isEn ? 'Retelling max (min)' : 'Максимальное время пересказа (минуты)'}</label><input name="retellMin" type="number" min="1" max="30" value="${Math.max(1, Math.round((a.retellingTime || 300) / 60))}" required></div>
          <div class="field"><label>${isEn ? 'Deadline' : 'Дедлайн'}</label><input name="deadline" type="datetime-local" value="${esc(toDatetimeLocal(a.deadline))}"></div>
          <div class="field span-2"><label>${isEn ? 'Level' : 'Уровень задания'}</label>
            <div class="chip-select">
              <label><input type="radio" name="targetLevel" value="BEGINNER" ${level === 'BEGINNER' ? 'checked' : ''}> ${isEn ? 'Beginner' : 'Начальный'}</label>
              <label><input type="radio" name="targetLevel" value="INTERMEDIATE" ${level === 'INTERMEDIATE' ? 'checked' : ''}> ${isEn ? 'Intermediate' : 'Средний'}</label>
              <label><input type="radio" name="targetLevel" value="ADVANCED" ${level === 'ADVANCED' ? 'checked' : ''}> ${isEn ? 'Advanced' : 'Продвинутый'}</label>
              <label><input type="radio" name="targetLevel" value="ALL" ${level === 'ALL' || !level ? 'checked' : ''}> ${isEn ? 'All levels' : 'Все уровни раздела'}</label>
            </div>
          </div>
          <div class="field span-2"><label>${isEn ? 'Recording type' : 'Тип записи'}</label>
            <div class="chip-select">
              <label><input type="radio" name="mode" value="AUDIO" ${mode === 'AUDIO' ? 'checked' : ''}> ${isEn ? 'Audio' : 'Голос'}</label>
              <label><input type="radio" name="mode" value="VIDEO" ${mode === 'VIDEO' ? 'checked' : ''}> ${isEn ? 'Video' : 'Видео'}</label>
              <label><input type="radio" name="mode" value="BOTH" ${mode === 'BOTH' ? 'checked' : ''}> ${isEn ? 'Audio or video' : 'Голос и видео на выбор'}</label>
            </div>
          </div>
          <div class="field span-2"><label>${isEn ? 'Status' : 'Статус'}</label>
            <div class="chip-select">
              <label><input type="radio" name="status" value="DRAFT" ${a.status === 'DRAFT' ? 'checked' : ''}> ${isEn ? 'Draft' : 'Черновик'}</label>
              <label><input type="radio" name="status" value="ACTIVE" ${a.status === 'ACTIVE' || a.status === 'EXPIRED' ? 'checked' : ''}> ${isEn ? 'Active' : 'Активное'}</label>
              <label><input type="radio" name="status" value="COMPLETED" ${a.status === 'COMPLETED' ? 'checked' : ''}> ${isEn ? 'Completed' : 'Завершённое'}</label>
            </div>
            ${a.status === 'EXPIRED' ? `<p class="section-sub" style="margin-top:8px;">${isEn ? 'Was expired — saving as Active will reopen it.' : 'Было просрочено — сохранение как «Активное» снова откроет задание.'}</p>` : ''}
          </div>
          <div class="field span-2"><label>${isEn ? 'Students' : 'Ученики'}</label>
            <div class="chip-select">
              <label><input type="checkbox" data-assign-all ${assigned.size === list.length && list.length ? 'checked' : ''}> ${isEn ? 'All matching students' : 'Всем подходящим ученикам'}</label>
            </div>
            <div class="chip-select" data-student-chips style="margin-top:10px;">
              ${list.length ? list.map((s) => `<label><input type="checkbox" name="studentIds" value="${esc(s.id)}" ${assigned.has(s.id) ? 'checked' : ''}> ${esc(s.name)} · ${esc(levelLabel(s.enrollmentLevel, isEn ? 'en' : 'ru'))}</label>`).join('') : `<p class="section-sub">${isEn ? 'No students yet.' : 'Пока нет учеников.'}</p>`}
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-action="delete-assignment" data-id="${esc(a.id)}" data-back="teacher-assignments/${slug}">${isEn ? 'Delete' : 'Удалить'}</button>
          <button type="submit" class="btn btn-primary">${isEn ? 'Save changes' : 'Сохранить изменения'} ${ic('arrowR', 16)}</button>
        </div>
      </form>
    </div>
  `;
  return teacherPage(code, isEn ? 'Edit assignment' : 'Изменить задание', null, body);
}

export function viewTeacherReview(list) {
  const body = `
    <div class="card card-lg">
      <div class="row-between" style="margin-bottom:16px;"><p class="section-title" style="margin:0;">Ожидают проверки</p><span class="badge badge-amber">${list.length} новых</span></div>
      ${list.length ? list.map((r) => `<div class="task-row">
        <div class="task-ic">${ic(r.type === 'VIDEO' ? 'video' : 'mic', 16)}</div>
        <div style="flex:1; min-width:0;"><p class="t-title">${esc(r.studentName)} — ${esc(displayTitle(r.assignmentTitle))}</p><p class="t-meta">${esc(formatDate(r.submittedAt))} · длительность ${formatTime(r.duration)}</p></div>
        <a href="#teacher-review-detail/${esc(r.id)}" class="btn btn-primary btn-sm">Проверить</a>
      </div>`).join('') : emptyState('Всё проверено', 'Новых пересказов нет.')}
    </div>
  `;
  return appPage('teacher', 'teacher-review', 'Проверка заданий', null, body);
}

const RUBRICS = {
  contentScore: '17–20 почти все мысли; 13–16 основная мысль; 9–12 часть содержания; 5–8 фрагменты; 0–4 не передано.',
  sequenceScore: '17–20 логично; 13–16 небольшие нарушения; 9–12 путаница; 5–8 сильно нарушено; 0–4 не связано.',
  understandingScore: '17–20 своими словами; 13–16 небольшие неточности; 9–12 общий смысл; 5–8 поверхностно; 0–4 почти нет.',
  speechScore: 'Чёткость, связность, темп, паузы, произношение, повторы. Акцент не снижает оценку, если речь понятна.',
  vocabularyScore: '17–20 разнообразная лексика; 13–16 хорошая; 9–12 простые слова; 5–8 ограничивает; 0–4 трудности с формулировками.',
};

export function viewTeacherReviewDetail(payload) {
  const r = payload.retelling;
  const a = payload.assignment;
  const s = payload.student;
  const scores = r.scores || {};
  const player = authMediaPlayer(r.type === 'VIDEO' ? 'VIDEO' : 'AUDIO', mediaUrl(r.id));
  const body = `
    <a href="#teacher-review" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} К списку на проверку</a>
    <div class="grid-2">
      <div class="card card-lg">
        <p class="section-title">${esc(s?.name || r.studentName)} — «${esc(displayTitle(a?.title || r.assignmentTitle))}»</p>
        <p class="section-sub">Отправлено ${esc(formatDate(r.submittedAt))} · ${formatTime(r.duration)} · ${r.type === 'VIDEO' ? 'видео' : 'голос'}</p>
        <div class="playback" style="margin:18px 0;">${player}</div>
        ${a?.text ? `<p class="section-title">Текст задания</p><div class="reading-text reading-scroll">${formatRichText(a.text)}</div>` : ''}
        <div class="ai-box">
          <p class="section-title">Оценка</p>
          <p class="hint" style="margin:0;">Разбор делает учитель по записи и тексту задания. Автоматического AI-анализа на платформе нет.</p>
        </div>
      </div>
      <div class="card card-lg">
        <form data-form="review" data-id="${esc(r.id)}">
          <p class="section-title">Оценка по критериям</p>
          <p class="section-sub">Каждый критерий — от 0 до 20. Максимум 100.</p>
          ${CRITERIA_META.map((c) => `
            <div class="field">
              <label>${c.name}</label>
              <div class="score-field">
                <input type="range" name="${c.key}" min="0" max="20" value="${scores[c.key] ?? 0}" data-score>
                <span class="sv">${scores[c.key] ?? 0}</span>
              </div>
              <p class="score-hint">${RUBRICS[c.key]}</p>
            </div>`).join('')}
          <div class="total-box"><span>Итог</span><b data-total>${(scores.totalScore ?? 0)} / 100</b></div>
          <div class="field"><label>Что получилось хорошо</label><textarea name="strengths">${esc(r.strengths || '')}</textarea></div>
          <div class="field"><label>Что нужно улучшить</label><textarea name="improvements">${esc(r.improvements || '')}</textarea></div>
          <div class="field"><label>Комментарий учителя</label><textarea name="teacherComment" placeholder="Напишите комментарий ученику">${esc(r.teacherComment || '')}</textarea></div>
          <div class="field"><label>Рекомендации ученику</label><textarea name="recommendations" placeholder="Что потренировать дальше">${esc(r.recommendations || '')}</textarea></div>
          <div class="form-error" data-error hidden></div>
          <button type="submit" class="btn btn-primary btn-block">${ic('check2', 16)} Сохранить оценку</button>
        </form>
      </div>
    </div>
  `;
  return appPage('teacher', 'teacher-review', 'Проверка задания', null, body);
}

export function viewTeacherStats(stats) {
  const week = stats.weekAvg || [];
  const max = Math.max(100, ...week, 1);
  const levels = stats.levels || {};
  const totalS = stats.studentsCount || 1;
  const labels = week.map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (week.length - 1 - i));
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  });
  const body = `
    <div class="grid-2" style="margin-bottom:18px;">
      <div class="card card-lg">
        <p class="section-title">Средняя оценка по группе</p>
        <p class="section-sub">По дням, когда были проверенные пересказы. 0 — в этот день проверок не было.</p>
        <div class="chart-bars">${week.map((v, i) => `<div class="chart-col"><div class="col" style="height:${Math.max(4, v / max * 130)}px;"></div><span style="font-size:11px; color:var(--muted);">${esc(labels[i] || '')}</span></div>`).join('')}</div>
      </div>
      <div class="card card-lg">
        <p class="section-title">Распределение по уровням</p>
        ${Object.entries(levels).map(([l, c]) => `<div class="skill-row"><span class="name">${esc(l)}</span><div class="bar"><i style="width:${c / totalS * 100}%"></i></div><span class="pct">${c}</span></div>`).join('')}
      </div>
    </div>
      <div class="card card-lg">
        <p class="section-title">Навыки группы в среднем</p>
        ${stats.reviewedCount ? skillRows(stats.criteria) : '<p class="section-sub">Средние навыки появятся после первой проверки.</p>'}
      </div>
  `;
  return appPage('teacher', 'teacher-stats', 'Статистика группы', null, body);
}

export function viewTeacherProfile(totals) {
  const u = store.user || {};
  const body = `
    <div class="card card-lg" style="max-width:520px;">
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:22px;">
        <div class="avatar" style="width:64px;height:64px;font-size:18px;">${esc(initials(u.name))}</div>
        <div><p class="section-title" style="margin-bottom:2px;">${esc(u.name)}</p><p class="section-sub" style="margin:0;">Учитель${u.groupName ? ` · группа «${esc(u.groupName)}»` : ''}</p></div>
      </div>
      <div class="grid-3" style="gap:12px;">
        <div class="card" style="padding:16px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${totals?.students ?? '—'}</b><div class="section-sub" style="margin:0;">учеников</div></div>
        <div class="card" style="padding:16px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${totals?.inReview ?? 0}</b><div class="section-sub" style="margin:0;">на проверке</div></div>
        <div class="card" style="padding:16px; text-align:center;"><b style="font-family:'Unbounded'; font-size:19px;">${totals?.avgScore ?? '—'}</b><div class="section-sub" style="margin:0;">ср. оценка</div></div>
      </div>
    </div>
  `;
  return appPage('teacher', 'teacher-profile', 'Профиль', null, body);
}

export function viewTeacherVideoLessons(lessons, lang = 'ru') {
  const list = lessons || [];
  const back = `teacher-video-lessons/${trackSlug(lang)}`;
  const createHref = `teacher-video-create/${trackSlug(lang)}`;
  const body = `
    <div class="row-between" style="margin-bottom:18px; gap:12px; flex-wrap:wrap;">
      <p class="section-sub" style="margin:0;">Видео, которые видят все ваши ученики в разделе «Видеоуроки».</p>
      <a href="#${createHref}" class="btn btn-primary btn-sm">${ic('plus', 14)} Добавить видеоурок</a>
    </div>
    <div class="card card-lg">
      ${list.length ? `<div class="table-wrap desktop-only"><table class="data">
        <thead><tr><th>Видеоурок</th><th>Категория</th><th>Уровень</th><th>Длительность</th><th></th></tr></thead>
        <tbody>${list.map((v) => `<tr>
          <td><div class="student-cell"><div class="task-ic" style="width:30px;height:30px;">${ic('video', 14)}</div>${esc(v.title)}</div></td>
          <td>${esc(v.category)}</td><td>${esc(v.level || '—')}</td><td>${esc(v.duration || '—')}</td>
          <td style="white-space:nowrap;">
            <a href="#teacher-lesson/${esc(v.id)}" class="btn btn-ghost btn-sm">Открыть</a>
            <button type="button" class="btn btn-ghost btn-sm" data-action="delete-lesson" data-id="${esc(v.id)}" data-back="${back}">Удалить</button>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="m-card-list">${list.map((v) => `
        <article class="m-card">
          <p class="t-title">${esc(v.title)}</p>
          <p class="t-meta" style="margin:4px 0 12px;">${esc(v.category)} · ${esc(v.level || '—')} · ${esc(v.duration || '—')}</p>
          <a href="#teacher-lesson/${esc(v.id)}" class="btn btn-primary" style="margin-bottom:8px;">Открыть</a>
          <button type="button" class="btn btn-ghost" data-action="delete-lesson" data-id="${esc(v.id)}" data-back="${back}">Удалить</button>
        </article>`).join('')}</div>` : emptyState('Пока пусто', 'Добавьте первый видеоурок — ученики увидят его сразу.')}
    </div>
  `;
  return appPage('teacher', 'teacher-video-lessons', 'Видеоуроки', null, body);
}

export function viewTeacherVideoCreate(lang = 'ru') {
  const code = parseLang(lang);
  const slug = trackSlug(code);
  const isEn = code === 'en';
  const body = `
    <a href="#teacher-track/${slug}" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} ${isEn ? 'Back to English section' : 'К разделу'}</a>
    <div class="card card-lg" style="max-width:760px;">
      <form data-form="create-lesson">
        <div class="form-error" data-error hidden></div>
        <input type="hidden" name="section" value="VIDEO">
        <input type="hidden" name="type" value="VIDEO">
        <input type="hidden" name="language" value="${code}">
        <div class="form-grid">
          <div class="field span-2"><label>${isEn ? 'Title' : 'Название'}</label><input name="title" type="text" required placeholder="${isEn ? 'e.g. Finding the main idea' : 'Например, «Как найти главную мысль»'}"></div>
          <div class="field"><label>${isEn ? 'Category' : 'Категория'}</label>
            <select name="category">
              <option>${isEn ? 'Reading' : 'Понимание текста'}</option>
              <option>${isEn ? 'Memory' : 'Память'}</option>
              <option>${isEn ? 'Speech' : 'Речь'}</option>
              <option>${isEn ? 'Vocabulary' : 'Словарный запас'}</option>
              <option>${isEn ? 'Retelling' : 'Пересказ'}</option>
              <option>${isEn ? 'Other' : 'Другое'}</option>
            </select>
          </div>
          <div class="field"><label>${isEn ? 'Level label' : 'Подпись уровня'}</label>
            <select name="level">
              <option>${isEn ? 'Beginner' : 'Базовый'}</option>
              <option>${isEn ? 'Intermediate' : 'Средний'}</option>
              <option>${isEn ? 'Advanced' : 'Продвинутый'}</option>
              <option>${isEn ? 'All levels' : 'Все уровни'}</option>
            </select>
          </div>
          <div class="field span-2"><label>${isEn ? 'Who sees this lesson' : 'Кому показать урок'}</label>
            <div class="chip-select">
              <label><input type="radio" name="targetLevel" value="BEGINNER" checked> ${isEn ? 'Beginner only' : 'Только начальный'}</label>
              <label><input type="radio" name="targetLevel" value="INTERMEDIATE"> ${isEn ? 'Intermediate only' : 'Только средний'}</label>
              <label><input type="radio" name="targetLevel" value="ADVANCED"> ${isEn ? 'Advanced only' : 'Только продвинутый'}</label>
              <label><input type="radio" name="targetLevel" value="ALL"> ${isEn ? 'Whole English section' : 'Весь раздел'}</label>
            </div>
          </div>
          <div class="field span-2"><label>${isEn ? 'Description' : 'Описание'}</label><textarea name="description" placeholder="${isEn ? 'What the lesson is about' : 'Коротко, о чём урок'}"></textarea></div>
          <div class="field"><label>${isEn ? 'Duration' : 'Длительность'}</label><input name="duration" type="text" placeholder="6:12"></div>
          <div class="field"><label>YouTube</label><input name="videoUrl" type="url" placeholder="https://youtu.be/…"></div>
          <div class="field span-2">
            <label>${isEn ? 'Or upload video (up to 5 GB via Cloudflare R2)' : 'Или загрузите видео (до 5 ГБ через Cloudflare R2)'}</label>
            ${renderUploadCard({ maxLabel: '5 GB', name: 'file' })}
          </div>
        </div>
        <p class="section-sub">${isEn
          ? 'Large videos upload directly to Cloudflare R2 (not Render disk). YouTube links also work.'
          : 'Большие видео загружаются напрямую в Cloudflare R2 (не на диск Render). Можно и ссылку YouTube.'}</p>
        <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px;">${ic('plus', 16)} ${isEn ? 'Publish lesson' : 'Опубликовать урок'}</button>
      </form>
    </div>
  `;
  return teacherPage(code, isEn ? 'New video lesson' : 'Новый видеоурок', null, body);
}

export function viewTeacherBonus(lessons) {
  const list = lessons || [];
  const body = `
    <div class="row-between" style="margin-bottom:18px; gap:12px; flex-wrap:wrap;">
      <p class="section-sub" style="margin:0;">Видеоуроки, PDF и уроки про компьютер — дополнительные материалы для учеников.</p>
      <a href="#teacher-bonus-create" class="btn btn-primary btn-sm">${ic('plus', 14)} Добавить бонусный урок</a>
    </div>
    <div class="card card-lg">
      ${list.length ? `<div class="table-wrap desktop-only"><table class="data">
        <thead><tr><th>Урок</th><th>Тип</th><th>Кому</th><th>Дата</th><th></th></tr></thead>
        <tbody>${list.map((b) => `<tr>
          <td><div class="student-cell"><div class="task-ic" style="width:30px;height:30px;">${ic(b.type === 'PDF' ? 'clip' : 'gift', 14)}</div>${esc(b.title)}</div></td>
          <td>${esc(b.typeLabel)}</td>
          <td>${esc(b.assignedLabel || 'Всем ученикам')}</td>
          <td>${esc(formatDay(b.createdAt))}</td>
          <td style="white-space:nowrap;">
            <a href="#teacher-lesson/${esc(b.id)}" class="btn btn-ghost btn-sm">Открыть</a>
            <button type="button" class="btn btn-ghost btn-sm" data-action="delete-lesson" data-id="${esc(b.id)}" data-back="teacher-bonus">Удалить</button>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="m-card-list">${list.map((b) => `
        <article class="m-card">
          <p class="t-title">${esc(b.title)}</p>
          <p class="t-meta" style="margin:4px 0 12px;">${esc(b.typeLabel)} · ${esc(b.assignedLabel || 'Всем ученикам')}</p>
          <a href="#teacher-lesson/${esc(b.id)}" class="btn btn-primary" style="margin-bottom:8px;">Открыть</a>
          <button type="button" class="btn btn-ghost" data-action="delete-lesson" data-id="${esc(b.id)}" data-back="teacher-bonus">Удалить</button>
        </article>`).join('')}</div>` : emptyState('Пока пусто', 'Добавьте видео, PDF или урок про компьютер.')}
    </div>
  `;
  return appPage('teacher', 'teacher-bonus', 'Бонусные уроки', null, body);
}

export function viewTeacherBonusCreate(students, lang = 'ru') {
  const code = parseLang(lang);
  const slug = trackSlug(code);
  const isEn = code === 'en';
  const list = (students || []).filter((s) => parseLang(s.language) === code);
  const body = `
    <a href="#teacher-track/${slug}" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} ${isEn ? 'Back to English section' : 'К разделу'}</a>
    <div class="card card-lg" style="max-width:760px;">
      <form data-form="create-lesson">
        <div class="form-error" data-error hidden></div>
        <input type="hidden" name="section" value="BONUS">
        <input type="hidden" name="language" value="${code}">
        <div class="form-grid">
          <div class="field span-2"><label>${isEn ? 'Material type' : 'Тип материала'}</label>
            <div class="chip-select">
              <label><input type="radio" name="type" value="VIDEO" checked data-lesson-type> ${isEn ? 'Video' : 'Видеоурок'}</label>
              <label><input type="radio" name="type" value="PDF" data-lesson-type> PDF</label>
              <label><input type="radio" name="type" value="COMPUTER" data-lesson-type> ${isEn ? 'Computer video' : 'Видеоурок про компьютер'}</label>
            </div>
          </div>
          <div class="field span-2"><label>${isEn ? 'Title' : 'Название'}</label><input name="title" type="text" required placeholder="${isEn ? 'e.g. Keyboard and mouse' : 'Например, «Клавиатура и мышь»'}"></div>
          <div class="field span-2"><label>${isEn ? 'Description' : 'Описание'}</label><textarea name="description"></textarea></div>
          <div class="field span-2"><label>${isEn ? 'Note for student' : 'Сообщение ученику'}</label><textarea name="note"></textarea></div>
          <div class="field span-2"><label>${isEn ? 'Level' : 'Уровень'}</label>
            <div class="chip-select">
              <label><input type="radio" name="targetLevel" value="BEGINNER" checked> ${isEn ? 'Beginner' : 'Начальный'}</label>
              <label><input type="radio" name="targetLevel" value="INTERMEDIATE"> ${isEn ? 'Intermediate' : 'Средний'}</label>
              <label><input type="radio" name="targetLevel" value="ADVANCED"> ${isEn ? 'Advanced' : 'Продвинутый'}</label>
              <label><input type="radio" name="targetLevel" value="ALL"> ${isEn ? 'All levels' : 'Все уровни'}</label>
            </div>
          </div>
          <div class="field" data-lesson-url><label>YouTube</label><input name="videoUrl" type="url" placeholder="https://youtu.be/…"></div>
          <div class="field" data-lesson-duration><label>${isEn ? 'Duration' : 'Длительность'}</label><input name="duration" type="text" placeholder="8:00"></div>
          <div class="field span-2"><label data-file-label>${isEn ? 'File' : 'Файл'}</label><input name="file" type="file" data-lesson-file accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,application/pdf,.pdf"></div>
          <div class="field span-2"><label>${isEn ? 'Students' : 'Кому выдать'}</label>
            <div class="chip-select">
              <label><input type="checkbox" name="assignAll" value="1" data-assign-all checked> ${isEn ? 'All matching students' : 'Всем подходящим'}</label>
            </div>
            <div class="chip-select" style="margin-top:10px;">
              ${list.map((s) => `<label><input type="checkbox" name="studentIds" value="${esc(s.id)}" checked> ${esc(s.name)} · ${esc(levelLabel(s.enrollmentLevel, isEn ? 'en' : 'ru'))}</label>`).join('') || `<p class="section-sub">${isEn ? 'No students yet.' : 'Пока нет учеников.'}</p>`}
            </div>
          </div>
        </div>
        <button type="submit" class="btn btn-amber btn-block" style="margin-top:8px;">${ic('gift', 16)} ${isEn ? 'Give to students' : 'Выдать ученикам'}</button>
      </form>
    </div>
  `;
  return teacherPage(code, isEn ? 'Bonus lesson' : 'Бонусный урок', null, body);
}

export function viewTeacherLessonDetail(payload) {
  const l = payload.lesson;
  const back = l.section === 'BONUS' ? 'teacher-bonus' : 'teacher-video-lessons';
  const needsFix = !l.mediaDurable || (!l.videoUrl && l.hasFile === false);
  const body = `
    <a href="#${back}" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} Назад</a>
    <div class="card card-lg">
      <span class="badge badge-grey" style="margin-bottom:12px;">${esc(l.typeLabel)} · ${esc(l.assignedLabel || 'Всем')}</span>
      <h2 style="font-size:21px; margin:0 0 12px;">${esc(l.title)}</h2>
      ${l.description ? `<p class="hint">${esc(l.description)}</p>` : ''}
      ${lessonPlayer(l)}
      ${!l.mediaDurable ? `<p class="section-sub" style="color:var(--amber); margin-top:12px;">Файл мог пропасть после обновления сервера (Render стирает локальные файлы). Загрузите снова или вставьте YouTube — тогда видео сохранится.</p>` : ''}
      <form data-form="lesson-replace-file" data-id="${esc(l.id)}" style="margin-top:18px; display:grid; gap:12px;">
        <p class="section-title" style="margin:0;">${needsFix ? 'Восстановить видео' : 'Заменить файл / ссылку'}</p>
        <div class="field"><label>YouTube (рекомендуется)</label><input name="videoUrl" type="url" placeholder="https://youtu.be/…" value="${esc(l.videoUrl || '')}"></div>
        <div class="field"><label>Или загрузка в R2 (до 5 ГБ)</label>${renderUploadCard({ maxLabel: '5 GB', name: 'file' })}</div>
        <div class="form-error" data-error hidden></div>
        <button type="submit" class="btn btn-primary">${ic('plus', 16)} Сохранить медиа</button>
      </form>
    </div>
  `;
  return appPage('teacher', l.section === 'BONUS' ? 'teacher-bonus' : 'teacher-video-lessons', l.title, null, body);
}

const LIT_LETTERS = ['A', 'B', 'C', 'D'];
const LIT_CAT_ORDER = ['ORTHOGRAPHY', 'GRAMMAR', 'PUNCTUATION', 'SPEECH'];

function literacyLevelTone(code) {
  const key = String(code || '');
  if (key === 'C1' || key === 'B2' || key === 'Продвинутый' || key === 'Хороший') return 'var(--teal)';
  if (key === 'B1' || key === 'Средний') return 'var(--amber)';
  return 'var(--red)';
}

function literacyChart(history, height = 150) {
  const rows = history || [];
  if (!rows.length) return emptyState('Пока нет попыток', 'Пройдите тест, чтобы увидеть прогресс.');
  const max = 100;
  return `<div class="chart-bars" style="height:${height}px;">${rows.map((h) => {
    const label = formatDay(h.completedAt).slice(0, 5);
    return `<div class="chart-col" title="${esc(formatDay(h.completedAt))}: ${h.percent}%">
      <span style="font-size:11px; font-weight:700; color:var(--ink-soft);">${h.percent}%</span>
      <div class="col" style="height:${Math.max(6, (h.percent / max) * (height - 40))}px;"></div>
      <span style="font-size:11px; color:var(--muted);">${esc(label)}</span>
    </div>`;
  }).join('')}</div>`;
}

function literacySpark(history) {
  const rows = history || [];
  if (!rows.length) return '<span class="section-sub">нет данных</span>';
  return `<div class="spark" aria-hidden="true">${rows.map((h) => `<i style="height:${Math.max(12, h.percent)}%"></i>`).join('')}</div>`;
}

function categoryRows(categories) {
  const cats = categories || {};
  return LIT_CAT_ORDER.map((key) => {
    const c = cats[key];
    if (!c) return '';
    return `<div class="skill-row"><span class="name">${esc(c.label)}</span><div class="bar"><i style="width:${c.percent}%"></i></div><span class="pct">${c.percent}%</span></div>`;
  }).join('');
}

export function viewLiteracyIntro(meta, stats, current) {
  const qCount = meta?.questionCount || 20;
  const duration = meta?.duration || 'нет';
  const instruction = meta?.instruction || 'Выберите один правильный вариант ответа';
  const cats = meta?.categories || [];
  const inProgress = current && current.status === 'IN_PROGRESS';
  const hasHistory = stats && stats.attempts > 0;
  const body = testsWrap(`
  <div class="test-shell">
    <a href="#tests/${subjectSlugForUser()}" class="btn btn-ghost btn-sm" style="margin-bottom:14px;">${ic('arrowL', 14)} ${studentIsEn() ? 'Back to tests' : 'К тестам'}</a>
    <div class="stage-card" style="text-align:center; padding:48px 32px;">
      ${orb('sm')}
      <h2 style="margin-top:18px;">Тест на грамотность</h2>
      <p class="hint" style="max-width:440px; margin-left:auto; margin-right:auto;">Тест из ${qCount} вопросов по орфографии, грамматике, пунктуации и речи. Уровень считается по проценту правильных ответов в этом тесте.</p>
      <div class="lit-meta">
        <div><b>${qCount}</b><span>вопросов</span></div>
        <div><b>${esc(duration)}</b><span>таймера</span></div>
        <div><b>1</b><span>верный ответ</span></div>
      </div>
      <p class="hint" style="margin:8px 0 0;">${esc(instruction)}</p>
      ${inProgress ? `<p class="hint">У вас есть незавершённый тест (${current.answeredCount} из ${current.questionCount}). Можно продолжить.</p>` : ''}
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:22px;">
        <button type="button" class="btn btn-primary" data-action="literacy-start">${inProgress ? 'Продолжить тест' : 'Начать тест'} ${ic('arrowR', 16)}</button>
        ${hasHistory ? `<a href="#literacy-history" class="btn btn-ghost">История тестов</a>` : ''}
      </div>
    </div>
    ${cats.length ? `<div class="grid-2" style="margin-top:16px;">${cats.map((c) => `
      <div class="card"><p class="section-title" style="margin-bottom:4px;">${esc(c.label)}</p><p class="section-sub" style="margin:0;">${c.share}% вопросов теста</p></div>`).join('')}</div>` : ''}
    ${hasHistory ? `<div class="card card-lg" style="margin-top:16px;">
      <div class="row-between"><p class="section-title">Последний результат</p><span class="level-pill" style="margin:0;">${esc(stats.lastLevel)} · ${stats.lastPercent}%</span></div>
      ${categoryRows(stats.lastCategories)}
    </div>` : ''}
  </div>`);
  return appPage('student', 'tests', 'Тест на грамотность', 'Диагностика орфографии, грамматики, пунктуации и речи.', body);
}

export function viewLiteracyQuiz(quiz) {
  const en = quiz?.uiLocale === 'en';
  const questions = quiz.questions || [];
  const total = questions.length || 20;
  const index = quiz.index || 0;
  const q = questions[index];
  const title = quiz.title || (en ? 'Quiz' : 'Тест');
  if (!q) {
    return appPage('student', 'tests', title, null, testsWrap(`<div class="test-shell">${emptyState(en ? 'Question not found' : 'Вопрос не найден', en ? 'Refresh or start again.' : 'Обновите страницу или начните тест заново.')}</div>`));
  }
  const selected = quiz.answers?.[q.id];
  const hasAnswer = Number.isInteger(selected);
  const last = index === total - 1;
  const barPct = Math.round(((index + 1) / total) * 100);
  const body = testsWrap(`
  <div class="test-shell">
    <div class="row-between" style="margin-bottom:14px; gap:12px;">
      <span class="badge badge-grey">${en ? `Question ${index + 1} of ${total}` : `Вопрос ${index + 1} из ${total}`}</span>
      <span class="badge badge-green">${esc(q.categoryLabel || '')}</span>
    </div>
    <div class="bar lit-progress"><i style="width:${barPct}%"></i></div>
    <p class="section-sub" style="margin:8px 0 16px;">${en ? `Progress: ${index + 1} of ${total}` : `Прогресс: ${index + 1} из ${total}`}</p>
    <div class="stage-card">
      <p class="section-sub" style="margin-bottom:8px;">${en ? 'Choose one correct answer' : 'Выберите один правильный вариант'}</p>
      <h2 style="font-size:20px; margin-bottom:6px;">${esc(q.prompt)}</h2>
      <div class="q-options" id="qOptions">
        ${(q.options || []).map((opt, i) => `<button type="button" class="q-option ${selected === i ? 'selected' : ''}" data-action="literacy-pick" data-i="${i}"><span class="letter">${LIT_LETTERS[i]}</span>${esc(opt)}</button>`).join('')}
      </div>
      <div class="row-between quiz-nav" style="margin-top:24px; gap:10px;">
        ${index > 0
          ? `<button type="button" class="btn btn-ghost" data-action="literacy-back">${ic('arrowL', 16)} ${en ? 'Back' : 'Назад'}</button>`
          : `<button type="button" class="btn btn-ghost" data-action="literacy-exit">${ic('arrowL', 16)} ${en ? 'Exit' : 'Выйти'}</button>`}
        ${last
          ? `<button type="button" class="btn btn-primary" data-action="literacy-submit" ${hasAnswer ? '' : 'disabled'}>${en ? 'Finish' : 'Завершить тест'} ${ic('arrowR', 16)}</button>`
          : `<button type="button" class="btn btn-primary" data-action="literacy-next" ${hasAnswer ? '' : 'disabled'}>${en ? 'Next' : 'Следующий вопрос'} ${ic('arrowR', 16)}</button>`}
      </div>
    </div>
  </div>`);
  return appPage('student', 'tests', title, null, body);
}

export function viewLiteracyResult(attempt) {
  const en = attempt?.uiLocale === 'en';
  const r = attempt?.result || {};
  const percent = r.percent ?? 0;
  const level = r.level || r.levelTitle || (en ? 'No level' : 'Нет уровня');
  const title = r.levelTitle || '';
  const weak = (r.topics || []).filter((t) => t.weak);
  const learnSlug = weak[0]?.slug || (r.topics || [])[0]?.slug;
  const review = r.review || [];
  const subjectHref = `#tests/${esc(attempt?.subjectSlug || 'russian')}`;
  const retryHref = attempt?.quizId ? `#tests-quiz/${esc(attempt.quizId)}` : subjectHref;
  const body = testsWrap(`
  <div class="test-shell">
    <div class="stage-card lit-result-hero">
      <div class="score-ring">${ring(percent, 132, 10, literacyLevelTone(level))}<div class="val"><b>${percent}%</b><span>${esc(level)}</span></div></div>
      <div>
        <span class="level-pill">${ic('star', 15)} ${esc(title || level)}</span>
        <h2 style="margin:10px 0 8px;">${en ? `Your score: ${percent}%` : `Ваш результат: ${percent}%`}</h2>
        <p class="hint" style="margin:0;">${en
          ? `Correct: ${r.correctCount ?? 0} of ${r.total ?? 0}. Wrong: ${r.wrongCount ?? 0}.`
          : `Правильных ответов: ${r.correctCount ?? 0} из ${r.total ?? 20}. Ошибок: ${r.wrongCount ?? 0}.`}</p>
      </div>
    </div>
    <div class="card card-lg" style="margin-top:16px;">
      <p class="section-title">${en ? 'By category' : 'Результат по категориям'}</p>
      ${categoryRowsDynamic(r.categories)}
    </div>
    ${review.length ? `<div class="card card-lg" style="margin-top:16px;">
      <p class="section-title">${en ? 'Review mistakes' : 'Разбор ошибок'}</p>
      <div class="review-list">${review.map((item) => `
        <div class="review-item">
          <p class="t-title" style="margin:0 0 8px;">${esc(item.prompt)}</p>
          <p class="wrong" style="margin:0 0 4px; font-size:13.5px;">${en ? 'Your answer' : 'Ваш ответ'}: ${esc(item.selectedText || '—')}</p>
          <p class="right" style="margin:0 0 6px; font-size:13.5px;">${en ? 'Correct' : 'Правильно'}: ${esc(item.correctText || '—')}</p>
          ${item.explanation ? `<p class="hint" style="margin:0;">${esc(item.explanation)}</p>` : ''}
        </div>`).join('')}</div>
    </div>` : ''}
    <div class="card card-lg" style="margin-top:16px;">
      <p class="section-title">${en ? 'Improve next' : 'Что стоит улучшить'}</p>
      ${weak.length ? weak.map((t) => `
        <div class="task-row">
          <div class="task-ic">${ic('book', 16)}</div>
          <div style="flex:1;">
            <p class="t-title">${esc(t.topic)} — ${t.percent}%</p>
            <p class="t-meta">${en ? 'Review this topic' : `Рекомендуем повторить: ${esc(t.topic)}`}</p>
          </div>
          ${!en && t.slug ? `<a href="#literacy-learn/${esc(t.slug)}" class="btn btn-ghost btn-sm">Материал</a>` : ''}
        </div>`).join('') : `<p class="section-sub">${en ? 'No major weak spots — great work.' : 'Сильных пробелов нет — можно переходить к более сложным текстам.'}</p>`}
      ${!en && learnSlug ? `<a href="#literacy-learn/${esc(learnSlug)}" class="btn btn-primary" style="margin-top:8px;">Перейти к обучению ${ic('arrowR', 16)}</a>` : ''}
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
      <a href="${retryHref}" class="btn btn-primary" data-action="tests-retry" data-quiz="${esc(attempt?.quizId || '')}">${en ? 'Try again' : 'Пройти снова'}</a>
      <a href="${subjectHref}" class="btn btn-ghost">${en ? 'Back to subject' : 'К предмету'}</a>
      <a href="#tests" class="btn btn-ghost">${en ? 'All tests' : 'Все тесты'}</a>
    </div>
  </div>`);
  return appPage('student', 'tests', en ? 'Quiz result' : 'Результат теста', null, body);
}

export function viewLiteracyHistory(stats) {
  const history = [...(stats?.history || [])].reverse();
  const body = testsWrap(`
    <div class="grid-4" style="margin-bottom:18px;">
      <div class="card stat-card"><span class="label">Попыток</span><b>${stats?.attempts || 0}</b></div>
      <div class="card stat-card"><span class="label">Последний результат</span><b>${stats?.lastPercent != null ? stats.lastPercent + '%' : '—'}</b></div>
      <div class="card stat-card"><span class="label">Уровень</span><b>${esc(stats?.lastLevel || '—')}</b></div>
      <div class="card stat-card"><span class="label">Средний результат</span><b>${stats?.avgPercent != null ? stats.avgPercent + '%' : '—'}</b></div>
    </div>
    <div class="card card-lg" style="margin-bottom:16px;">
      <p class="section-title">График прогресса</p>
      <p class="section-sub">Как менялся результат от попытки к попытке</p>
      ${literacyChart(stats?.history || [])}
    </div>
    <div class="card card-lg">
      <div class="row-between"><p class="section-title">История тестов</p><a href="#tests" class="btn btn-primary btn-sm">К тестам</a></div>
      ${history.length ? `<div class="table-wrap desktop-only"><table class="data">
        <thead><tr><th>Дата</th><th>Результат</th><th>Уровень</th><th>Правильных</th><th></th></tr></thead>
        <tbody>${history.map((h) => `<tr>
          <td>${esc(formatDay(h.completedAt))}</td>
          <td>${h.percent}%</td>
          <td>${esc(h.level)}</td>
          <td>${h.correctCount} из ${h.total}</td>
          <td><a href="#tests-result/${esc(h.id)}" class="btn btn-ghost btn-sm">Открыть</a></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="m-card-list">${history.map((h) => `
        <article class="m-card">
          <p class="t-title">${h.percent}% · ${esc(h.level)}</p>
          <p class="t-meta" style="margin:4px 0 12px;">${esc(formatDay(h.completedAt))} · ${h.correctCount} из ${h.total}</p>
          <a href="#tests-result/${esc(h.id)}" class="btn btn-primary">Открыть</a>
        </article>`).join('')}</div>` : emptyState('История пуста', 'После первого теста здесь появятся дата, процент и уровень.')}
    </div>`);
  return appPage('student', 'tests', 'История тестов', 'Все прохождения тестов.', body);
}

export function viewLiteracyLearn(topic) {
  const t = topic || {};
  const body = testsWrap(`
  <div class="test-shell">
    <a href="#tests/${subjectSlugForUser()}" class="btn btn-ghost btn-sm" style="margin-bottom:14px;">${ic('arrowL', 14)} ${studentIsEn() ? 'Back to tests' : 'К тестам'}</a>
    <div class="stage-card">
      <span class="badge badge-green" style="margin-bottom:12px;">${esc(t.category || 'Грамотность')}</span>
      <h2 style="margin-top:0;">${esc(t.title || 'Материал')}</h2>
      <p class="hint">${esc(t.summary || '')}</p>
      ${(t.rules || []).length ? `<p class="section-title">Правила</p><ul class="rules-list">${t.rules.map((rule, i) => `<li><span class="n">${i + 1}</span>${esc(rule)}</li>`).join('')}</ul>` : ''}
      ${(t.examples || []).length ? `<div class="fb-box fb-good" style="margin-top:18px;"><h4>Примеры</h4><ul>${t.examples.map((ex) => `<li>${esc(ex)}</li>`).join('')}</ul></div>` : ''}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:22px;">
        <a href="#tests/${subjectSlugForUser()}" class="btn btn-primary">${studentIsEn() ? 'Back to tests' : 'К тестам'}</a>
        <a href="#tests-history" class="btn btn-ghost">История</a>
      </div>
    </div>
  </div>`);
  return appPage('student', 'tests', t.title || 'Обучение', 'Разбор правила по результатам диагностики.', body);
}

export function viewTestsHub(subjects) {
  // Kept for teacher/public edge cases; students are redirected away from #tests hub.
  const list = subjects || [];
  const body = testsWrap(`
    <div class="stage-card" style="text-align:center; padding:40px 28px;">
      <h2 style="margin:0 0 8px;">Тесты</h2>
      <p class="hint" style="max-width:460px; margin:0 auto 22px;">Выберите предмет.</p>
      <div class="subject-pick">
        ${list.map((s) => `
          <a href="#tests/${esc(s.slug)}" class="subject-card">
            <b>${esc(s.name)}</b>
            <span class="section-sub" style="margin:0; display:block;">${esc(s.description || '')}</span>
            <span class="section-sub" style="margin:10px 0 0; display:block;">${(s.quizzes || []).length} ${(s.uiLocale === 'en' ? 'quizzes' : 'тестов')}</span>
          </a>`).join('')}
      </div>
    </div>
  `);
  return appPage('student', 'tests', 'Тесты', null, body);
}

export function viewTestsSubject(subject, stats) {
  const s = subject || {};
  const en = s.uiLocale === 'en' || parseLang(s.language) === 'en' || studentIsEn();
  const quizzes = s.quizzes || [];
  const body = testsWrap(`
    <div class="stage-card" style="margin-bottom:16px;">
      <h2 style="margin:0 0 6px;">${esc(s.name)}</h2>
      <p class="hint" style="margin:0;">${esc(s.description || '')}</p>
      ${stats?.attempts ? `<p class="section-sub" style="margin:12px 0 0;">${en ? `Last: ${stats.lastPercent}% · ${esc(stats.lastLevel || '')}` : `Последний: ${stats.lastPercent}% · ${esc(stats.lastLevel || '')}`}</p>` : ''}
    </div>
    <div class="quiz-grid">
      ${quizzes.map((q) => {
        const progress = q.progress;
        const label = progress
          ? (en ? `Continue (${progress.answeredCount}/${progress.questionCount})` : `Продолжить (${progress.answeredCount}/${progress.questionCount})`)
          : (en ? 'Start' : 'Начать');
        return `<div class="quiz-row">
          <div class="grow">
            <p class="t-title">${esc(q.title)}</p>
            <p class="t-meta">${esc(q.description || '')} · ${q.questionCount} ${en ? 'questions' : 'вопросов'}${q.lastPercent != null ? ` · ${en ? 'best' : 'лучший'} ${q.lastPercent}%` : ''}</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-action="tests-start" data-quiz="${esc(q.id)}" data-subject="${esc(s.slug)}">${label}</button>
        </div>`;
      }).join('') || emptyState(en ? 'No quizzes yet' : 'Пока нет тестов', '')}
    </div>
  `);
  return appPage('student', 'tests', s.name || (en ? 'Tests' : 'Тесты'), null, body);
}

export function viewTeacherLiteracy(students, filter) {
  const f = filter || { lang: 'all', level: 'all', result: 'all', date: 'all' };
  const now = Date.now();
  const filtered = (students || []).filter((s) => {
    const lang = parseLang(s.language) || 'ru';
    if (f.lang === 'ru' && lang !== 'ru') return false;
    if (f.lang === 'en' && lang !== 'en') return false;
    if (f.level !== 'all') {
      if (f.level === 'none') { if (s.lastLevel) return false; }
      else if (s.lastLevel !== f.level) return false;
    }
    if (f.result !== 'all') {
      if (f.result === 'none' && s.lastPercent != null) return false;
      if (f.result === 'high' && !(s.lastPercent >= 75)) return false;
      if (f.result === 'mid' && !(s.lastPercent >= 60 && s.lastPercent < 75)) return false;
      if (f.result === 'low' && !(s.lastPercent != null && s.lastPercent < 60)) return false;
    }
    if (f.date !== 'all') {
      if (!s.lastAt) return f.date === 'none';
      const t = new Date(s.lastAt).getTime();
      if (Number.isNaN(t)) return false;
      const day = 86400000;
      if (f.date === 'today' && now - t > day) return false;
      if (f.date === 'week' && now - t > 7 * day) return false;
      if (f.date === 'month' && now - t > 30 * day) return false;
      if (f.date === 'none') return false;
    }
    return true;
  }).slice().sort((a, b) => {
    const la = parseLang(a.language) || 'ru';
    const lb = parseLang(b.language) || 'ru';
    if (la !== lb) return la === 'ru' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
  });
  const ruCount = (students || []).filter((s) => (parseLang(s.language) || 'ru') === 'ru').length;
  const enCount = (students || []).filter((s) => parseLang(s.language) === 'en').length;
  const chip = (group, value, label) => `<button type="button" data-action="lit-filter" data-group="${group}" data-value="${value}" class="${f[group] === value ? 'on' : ''}">${label}</button>`;
  const langBadge = (s) => {
    const lang = parseLang(s.language) || 'ru';
    return `<span class="pill ${lang === 'en' ? 'pill-en' : 'pill-ru'}">${esc(langLabel(lang))}</span>`;
  };
  const body = `
    <div class="card card-lg">
      <p class="section-sub" style="margin-bottom:8px;">Язык / Language</p>
      <div class="filter-row">
        ${chip('lang', 'all', `Все (${students.length})`)}
        ${chip('lang', 'ru', `Русский (${ruCount})`)}
        ${chip('lang', 'en', `English (${enCount})`)}
      </div>
      <p class="section-sub" style="margin-bottom:8px;">Уровень</p>
      <div class="filter-row">
        ${chip('level', 'all', 'Все')}
        ${['Продвинутый', 'Хороший', 'Средний', 'Базовый', 'Начальный'].map((l) => chip('level', l, l)).join('')}
        ${chip('level', 'none', 'Не проходили')}
      </div>
      <p class="section-sub" style="margin-bottom:8px;">Результат</p>
      <div class="filter-row">
        ${chip('result', 'all', 'Все')}
        ${chip('result', 'high', '75% и выше')}
        ${chip('result', 'mid', '60–74%')}
        ${chip('result', 'low', 'ниже 60%')}
        ${chip('result', 'none', 'Нет результата')}
      </div>
      <p class="section-sub" style="margin-bottom:8px;">Дата прохождения</p>
      <div class="filter-row">
        ${chip('date', 'all', 'Все')}
        ${chip('date', 'today', 'Сегодня')}
        ${chip('date', 'week', '7 дней')}
        ${chip('date', 'month', '30 дней')}
        ${chip('date', 'none', 'Не проходили')}
      </div>
      ${filtered.length ? `<div class="table-wrap desktop-only"><table class="data">
        <thead><tr><th>Ученик</th><th>Язык</th><th>Уровень</th><th>Последний</th><th>Средний</th><th>Слабые категории</th><th>Динамика</th><th></th></tr></thead>
        <tbody>${filtered.map((s) => {
          const weak = (s.weakTopics || []).map((t) => t.topic).join(', ') || '—';
          return `<tr>
            <td><div class="student-cell"><div class="avatar" style="width:30px;height:30px;font-size:11px;">${esc(initials(s.name))}</div>${esc(s.name)}</div></td>
            <td>${langBadge(s)}</td>
            <td>${esc(s.lastLevel || '—')}</td>
            <td>${s.lastPercent != null ? s.lastPercent + '%' : '—'}</td>
            <td>${s.avgPercent != null ? s.avgPercent + '%' : '—'}</td>
            <td>${esc(weak)}</td>
            <td>${literacySpark(s.history)}</td>
            <td><a href="#teacher-literacy/${esc(s.id)}" class="btn btn-ghost btn-sm">Открыть</a></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="m-card-list">${filtered.map((s) => {
        const weak = (s.weakTopics || []).map((t) => t.topic).join(', ') || '—';
        return `<article class="m-card">
          <div class="m-card-head">
            <div class="avatar">${esc(initials(s.name))}</div>
            <div>
              <p class="t-title">${esc(s.name)}</p>
              <p class="t-meta">${langBadge(s)} · Уровень: ${esc(s.lastLevel || '—')}</p>
            </div>
          </div>
          <dl class="m-card-meta">
            <div><dt>Последний</dt><dd>${s.lastPercent != null ? s.lastPercent + '%' : '—'}</dd></div>
            <div><dt>Средний</dt><dd>${s.avgPercent != null ? s.avgPercent + '%' : '—'}</dd></div>
            <div style="grid-column:1/-1;"><dt>Слабые темы</dt><dd style="font-weight:500; font-size:13px;">${esc(weak)}</dd></div>
          </dl>
          <a href="#teacher-literacy/${esc(s.id)}" class="btn btn-primary">Открыть профиль</a>
        </article>`;
      }).join('')}</div>` : emptyState('Никого не найдено', 'Измените фильтры.')}
    </div>`;
  return appPage('teacher', 'teacher-literacy', 'Тесты', `${ruCount} RU · ${enCount} EN`, body);
}

export function viewTeacherLiteracyStudent(student) {
  const s = student || {};
  const cats = s.lastCategories || {};
  const ru = s.russian || {};
  const en = s.english || {};
  const body = `
    <a href="#teacher-literacy" class="btn btn-ghost btn-sm" style="margin-bottom:18px;">${ic('arrowL', 14)} К результатам группы</a>
    <div class="grid-2" style="margin-bottom:16px;">
      <div class="card card-lg">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
          <div class="avatar" style="width:56px;height:56px;font-size:17px;">${esc(initials(s.name))}</div>
          <div>
            <p class="section-title" style="margin-bottom:2px;">${esc(s.name)}</p>
            <p class="section-sub" style="margin:0;"><span class="pill ${(parseLang(s.language) || 'ru') === 'en' ? 'pill-en' : 'pill-ru'}">${esc(langLabel(s.language || 'ru'))}</span> · ${s.lastLevel ? `${esc(s.lastLevel)} · ${esc(s.lastLevelTitle || '')}` : 'Тесты ещё не пройдены'}</p>
          </div>
        </div>
        <div class="grid-3" style="gap:10px;">
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:18px;">${s.lastPercent != null ? s.lastPercent + '%' : '—'}</b><div class="section-sub" style="margin:0;">последний</div></div>
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:18px;">${s.avgPercent != null ? s.avgPercent + '%' : '—'}</b><div class="section-sub" style="margin:0;">средний</div></div>
          <div class="card" style="padding:14px; text-align:center;"><b style="font-family:'Unbounded'; font-size:18px;">${s.attempts || 0}</b><div class="section-sub" style="margin:0;">попыток</div></div>
        </div>
      </div>
      <div class="card card-lg">
        <p class="section-title">Категории (последний тест)</p>
        ${s.attempts ? categoryRowsDynamic(cats) : emptyState('Нет данных', 'Ученик ещё не завершал тест.')}
        ${(s.weakTopics || []).length ? `<p class="section-title" style="margin-top:16px;">Слабые темы</p>${s.weakTopics.map((t) => `<div class="skill-row"><span class="name">${esc(t.topic)}</span><div class="bar"><i style="width:${t.percent}%"></i></div><span class="pct">${t.percent}%</span></div>`).join('')}` : ''}
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:16px;">
      <div class="card card-lg">
        <p class="section-title">Русский</p>
        <p class="section-sub">${ru.attempts ? `${ru.lastPercent}% · ${esc(ru.lastLevel || '')} · ${ru.attempts} попыток` : 'Нет попыток'}</p>
      </div>
      <div class="card card-lg">
        <p class="section-title">English</p>
        <p class="section-sub">${en.attempts ? `${en.lastPercent}% · ${esc(en.lastLevel || '')} · ${en.attempts} attempts` : 'No attempts yet'}</p>
      </div>
    </div>
    <div class="card card-lg">
      <p class="section-title">Динамика результатов</p>
      ${literacyChart(s.history || [])}
      ${(s.history || []).length ? `<div class="table-wrap" style="margin-top:16px;"><table class="data" style="min-width:480px;">
        <thead><tr><th>Дата</th><th>Результат</th><th>Уровень</th><th>Правильных</th></tr></thead>
        <tbody>${[...s.history].reverse().map((h) => `<tr>
          <td>${esc(formatDay(h.completedAt))}</td>
          <td>${h.percent}%</td>
          <td>${esc(h.level)}</td>
          <td>${h.correctCount} из ${h.total}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>`;
  return appPage('teacher', 'teacher-literacy', s.name || 'Ученик', 'Результаты тестов', body);
}

export function viewGames(payload = {}) {
  const assignment = payload.assignmentTitle;
  const cards = [
    ['game-story', '🧩', 'Собери историю', 'Порядок событий', 'Расставь предложения так, как они шли в тексте. Это учит логике пересказа.'],
    ['game-idea', '💡', 'Главная мысль', 'Понимание', 'Прочитай короткий текст и выбери, о чём он на самом деле.'],
    ['game-cloze', '🔤', 'Вставь слово', 'Словарь', 'Верни пропущенные слова на место — так запоминается лексика текста.'],
    ['game-memory', '🧠', 'Память текста', 'Внимание', '20 секунд на чтение, потом вопросы по фактам. Как на этапе чтения перед пересказом.'],
    ['game-sprint', '⚡', 'Спринт грамотности', 'Орфография и речь', '8 быстрых вопросов из банка грамотности. Не заменяет большой тест — это разминка.'],
  ];
  const body = `
    <div class="game-hero">
      <p class="game-hero-kicker">Тренировка речи</p>
      <h2>Играй и учись пересказывать</h2>
      <p>Короткие игры на порядок событий, главную мысль, слова и грамотность. Можно играть сразу — даже если учитель ещё не назначил текст.</p>
      ${assignment ? `<p class="game-hero-note">Есть прочитанное задание: «${esc(displayTitle(assignment))}». Часть игр использует его.</p>` : ''}
    </div>
    <div class="games-grid">
      ${cards.map(([href, emoji, title, skill, desc]) => `
        <a href="#${href}" class="game-card">
          <span class="game-emoji">${emoji}</span>
          <span class="game-skill">${esc(skill)}</span>
          <p class="t-title">${esc(title)}</p>
          <p class="t-meta">${esc(desc)}</p>
        </a>`).join('')}
    </div>
  `;
  return appPage('student', 'games', 'Игры', 'Обучающие мини-игры для пересказа и грамотности.', body);
}

export function viewGameStory(game) {
  const items = game.sentences || [];
  const source = game.source === 'assignment'
    ? 'Текст из задания учителя'
    : 'Тренировочный текст для пересказа';
  const body = `
    <div class="card card-lg" style="max-width:720px;">
      <p class="game-skill" style="margin-bottom:6px;">Порядок событий</p>
      <p class="section-title">${esc(game.title || 'Собери историю')}</p>
      <p class="section-sub">${esc(source)}. Поставь предложения по порядку — так восстанавливают сюжет перед пересказом.</p>
      <div data-story-list>
        ${items.map((s, i) => `
          <div class="story-item" draggable="true" data-story-item data-id="${esc(s.id)}">
            <span class="story-num">${i + 1}</span>
            <p>${esc(s.text)}</p>
            <div class="story-moves touch-move">
              <button type="button" data-action="story-move" data-dir="up" aria-label="Переместить вверх" ${i === 0 ? 'disabled' : ''}>${ic('up', 18)}</button>
              <button type="button" data-action="story-move" data-dir="down" aria-label="Переместить вниз" ${i === items.length - 1 ? 'disabled' : ''}>${ic('down', 18)}</button>
            </div>
          </div>`).join('')}
      </div>
      <p class="form-error" data-story-msg hidden></p>
      <button type="button" class="btn btn-primary btn-block" data-action="story-check" style="margin-top:8px;" data-game-session="${esc(game.sessionId || '')}">Проверить</button>
      <a href="#game-story" class="btn btn-ghost btn-block" style="margin-top:8px;">Другой набор</a>
      <a href="#games" class="btn btn-ghost btn-block" style="margin-top:8px;">К играм</a>
    </div>
  `;
  return appPage('student', 'games', 'Собери историю', null, body);
}

export function viewGameIdea(game, picked = null) {
  const locked = !!(game.locked || (Number.isInteger(picked) && Number.isInteger(game.correct)));
  const choice = Number.isInteger(picked) ? picked : game.picked;
  const ok = locked && game.ok;
  const body = `
    <div class="card card-lg" style="max-width:720px;">
      <p class="game-skill" style="margin-bottom:6px;">Понимание текста</p>
      <p class="section-title">${esc(game.title)}</p>
      <p class="section-sub">Прочитай и выбери главную мысль. Это тот же навык, который учитель оценивает в пересказе.</p>
      <div class="reading-text" style="margin-bottom:18px;">${formatRichText(game.text)}</div>
      <div class="q-options">
        ${(game.options || []).map((opt, i) => {
          let cls = '';
          if (locked) {
            if (i === game.correct) cls = 'correct';
            else if (i === choice) cls = 'wrong';
          } else if (choice === i) cls = 'selected';
          return `<button type="button" class="q-option ${cls}" data-action="idea-pick" data-i="${i}" ${locked ? 'disabled' : ''}><span class="letter">${i + 1}</span>${esc(opt)}</button>`;
        }).join('')}
      </div>
      ${locked ? `<p class="form-error" style="margin-top:14px; background:${ok ? 'var(--surface-glass)' : 'var(--red-soft)'}; color:${ok ? 'var(--purple-primary)' : 'var(--red)'};">${ok ? 'Верно. ' : 'Не совсем. '}${esc(game.why || '')}</p>
        <a href="#game-idea" class="btn btn-primary btn-block" style="margin-top:12px;">Ещё текст</a>` : ''}
      <a href="#games" class="btn btn-ghost btn-block" style="margin-top:8px;">К играм</a>
    </div>
  `;
  return appPage('student', 'games', 'Главная мысль', null, body);
}

export function viewGameCloze(game, filled = {}, message = null, ok = null) {
  const parts = String(game.template || '').split(/\{\{(\d+)\}\}/);
  let html = '';
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) html += esc(parts[i]);
    else {
      const n = Number(parts[i]);
      const val = filled[n];
      html += `<button type="button" class="cloze-gap ${val ? 'filled' : ''}" data-action="cloze-blank" data-i="${n}">${val ? esc(val) : '…'}</button>`;
    }
  }
  const used = new Set(Object.values(filled));
  const body = `
    <div class="card card-lg" style="max-width:720px;">
      <p class="game-skill" style="margin-bottom:6px;">Словарный запас</p>
      <p class="section-title">${esc(game.title)}</p>
      <p class="section-sub">${game.source === 'assignment' ? 'Слова из задания учителя.' : 'Тренировочный текст.'} Нажми пропуск, затем слово из набора.</p>
      <p class="cloze-text">${html}</p>
      <div class="word-bank">
        ${(game.bank || []).map((w) => `<button type="button" class="btn btn-ghost ${used.has(w) ? 'used' : ''}" data-action="cloze-word" data-word="${esc(w)}" ${used.has(w) ? 'disabled' : ''}>${esc(w)}</button>`).join('')}
      </div>
      ${message ? `<p class="form-error" style="margin-top:14px; background:${ok ? 'var(--teal-soft)' : 'var(--red-soft)'}; color:${ok ? 'var(--teal-mid)' : 'var(--red)'};">${esc(message)}</p>` : ''}
      <button type="button" class="btn btn-primary btn-block" data-action="cloze-check" style="margin-top:16px;">Проверить</button>
      <a href="#game-cloze" class="btn btn-ghost btn-block" style="margin-top:8px;">Новые пропуски</a>
      <a href="#games" class="btn btn-ghost btn-block" style="margin-top:8px;">К играм</a>
    </div>
  `;
  return appPage('student', 'games', 'Вставь слово', null, body);
}

export function viewGameMemory(game, stage = 'read', answers = {}, done = false) {
  if (stage === 'read') {
    const body = `
      <div class="card card-lg prep-stage" style="max-width:720px;">
        <p class="game-skill">Внимательное чтение</p>
        <div class="timer-ring-wrap timer-lg" data-timer="memory" data-left="${game.seconds}" data-total="${game.seconds}">${ring(0, 140, 10, 'var(--amber)')}<div class="tval">${formatTime(game.seconds)}</div></div>
        <h2>${esc(game.title)}</h2>
        <p class="hint">Запомни факты. Потом текст скроется — как на пересказе.</p>
        <div class="reading-text" style="text-align:left; width:100%;">${formatRichText(game.text)}</div>
        <button type="button" class="btn btn-primary btn-block" data-action="memory-start-quiz" style="margin-top:16px;">Я запомнил(а)</button>
      </div>
    `;
    return appPage('student', 'games', 'Память текста', null, body);
  }
  const facts = game.facts || [];
  const allAnswered = facts.every((f) => {
    const key = f.id != null ? f.id : facts.indexOf(f);
    return answers[key] === true || answers[key] === false || answers[facts.indexOf(f)] === true || answers[facts.indexOf(f)] === false;
  });
  const score = done ? (game.score ?? 0) : 0;
  const total = done ? (game.total ?? facts.length) : facts.length;
  const detailMap = Object.fromEntries((game.detail || []).map((d) => [d.id, d]));
  const body = `
    <div class="card card-lg" style="max-width:720px;">
      <p class="game-skill" style="margin-bottom:6px;">Проверка памяти</p>
      <p class="section-title">${esc(game.title)}</p>
      <p class="section-sub">Текст скрыт. Ответь по памяти — правда или нет.</p>
      ${facts.map((f, i) => {
        const id = f.id != null ? f.id : i;
        const picked = answers[id] ?? answers[i];
        const locked = done;
        const det = detailMap[id];
        const expectTrue = det ? det.expected === true : null;
        return `<div class="memory-fact">
          <p class="t-title">${esc(f.q)}</p>
          <div class="memory-btns">
            <button type="button" class="btn ${picked === true ? 'btn-primary' : 'btn-ghost'} ${locked && expectTrue === true ? 'ok-border' : ''} ${locked && picked === true && det && !det.ok ? 'bad-border' : ''}" data-action="memory-fact" data-i="${id}" data-val="true" ${locked ? 'disabled' : ''}>Правда</button>
            <button type="button" class="btn ${picked === false ? 'btn-primary' : 'btn-ghost'} ${locked && expectTrue === false ? 'ok-border' : ''} ${locked && picked === false && det && !det.ok ? 'bad-border' : ''}" data-action="memory-fact" data-i="${id}" data-val="false" ${locked ? 'disabled' : ''}>Неправда</button>
          </div>
        </div>`;
      }).join('')}
      ${done ? `<p class="game-score">Результат: ${score} из ${total}</p>
        <p class="section-sub">${score === total ? 'Отличная память — так же внимательно читай задания для пересказа.' : 'Перечитай текст ещё раз: перед пересказом важно держать факты.'}</p>
        <a href="#game-memory" class="btn btn-primary btn-block">Ещё текст</a>` : `<button type="button" class="btn btn-primary btn-block" data-action="memory-check" ${allAnswered ? '' : 'disabled'}>Проверить</button>`}
      <a href="#games" class="btn btn-ghost btn-block" style="margin-top:8px;">К играм</a>
    </div>
  `;
  return appPage('student', 'games', 'Память текста', null, body);
}

export function viewGameSprint(session) {
  const qs = session.questions || [];
  const total = qs.length || 8;
  if (session.done) {
    const pct = Math.round((session.score / total) * 100);
    const body = `
      <div class="card card-lg" style="max-width:720px; text-align:center;">
        <p class="game-skill">Разминка по грамотности</p>
        <p class="game-score">${session.score} из ${total}</p>
        <p class="section-title">${pct >= 75 ? 'Сильная разминка' : pct >= 50 ? 'Есть прогресс' : 'Стоит повторить правила'}</p>
        <p class="section-sub">Это не заменяет полный тест из 20 вопросов — только короткая тренировка.</p>
        <a href="#game-sprint" class="btn btn-primary btn-block">Ещё раз</a>
        <a href="#tests/${subjectSlugForUser()}" class="btn btn-ghost btn-block" style="margin-top:8px;">${studentIsEn() ? 'Full quiz' : 'Полный тест'}</a>
        <a href="#games" class="btn btn-ghost btn-block" style="margin-top:8px;">К играм</a>
      </div>
    `;
    return appPage('student', 'games', 'Спринт грамотности', null, body);
  }
  const q = qs[session.index];
  const picked = session.picked;
  const locked = Number.isInteger(picked);
  const body = `
    <div class="card card-lg" style="max-width:720px;">
      <div class="row-between" style="margin-bottom:10px;">
        <span class="badge badge-grey">Вопрос ${session.index + 1} из ${total}</span>
        <span class="badge badge-green">${esc(q.categoryLabel || '')}</span>
      </div>
      <div class="bar lit-progress"><i style="width:${Math.round(((session.index + (locked ? 1 : 0)) / total) * 100)}%"></i></div>
      <p class="section-sub" style="margin:10px 0 8px;">Верных: ${session.score}</p>
      <h2 style="font-size:20px; margin-bottom:8px;">${esc(q.prompt)}</h2>
      <p class="t-meta" style="margin-bottom:14px;">${esc(q.topic || '')}</p>
      <div class="q-options">
        ${(q.options || []).map((opt, i) => {
          let cls = '';
          if (locked) {
            if (i === picked && session.lastOk) cls = 'correct';
            else if (i === picked && session.lastOk === false) cls = 'wrong';
            else if (i === picked) cls = 'selected';
          }
          return `<button type="button" class="q-option ${cls}" data-action="sprint-pick" data-i="${i}" ${locked ? 'disabled' : ''}><span class="letter">${LIT_LETTERS[i] || i + 1}</span>${esc(opt)}</button>`;
        }).join('')}
      </div>
      ${locked ? `<button type="button" class="btn btn-primary btn-block" data-action="sprint-next" style="margin-top:16px;">${session.done || session.index + 1 >= total ? 'Результат' : 'Дальше'}</button>` : ''}
      <a href="#games" class="btn btn-ghost btn-block" style="margin-top:8px;">К играм</a>
    </div>
  `;
  return appPage('student', 'games', 'Спринт грамотности', null, body);
}


