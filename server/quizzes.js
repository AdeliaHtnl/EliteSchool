const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data');
const TESTS_DIR = path.join(ROOT, 'tests');

const CATEGORY_LABELS_RU = {
  ORTHOGRAPHY: 'Орфография',
  GRAMMAR: 'Грамматика',
  PUNCTUATION: 'Пунктуация',
  SPEECH: 'Речевая грамотность',
  VOCABULARY: 'Vocabulary',
  READING: 'Reading',
};

const CATEGORY_LABELS_EN = {
  ORTHOGRAPHY: 'Spelling',
  GRAMMAR: 'Grammar',
  PUNCTUATION: 'Punctuation',
  SPEECH: 'Speech',
  VOCABULARY: 'Vocabulary',
  READING: 'Reading',
};

const LEVEL_BY_PERCENT = [
  { min: 90, code: 'Продвинутый', codeEn: 'Advanced', title: 'Продвинутый уровень', titleEn: 'Advanced level' },
  { min: 75, code: 'Хороший', codeEn: 'Good', title: 'Хороший результат', titleEn: 'Good result' },
  { min: 60, code: 'Средний', codeEn: 'Average', title: 'Средний уровень', titleEn: 'Average level' },
  { min: 40, code: 'Базовый', codeEn: 'Basic', title: 'Базовый уровень', titleEn: 'Basic level' },
  { min: 0, code: 'Начальный', codeEn: 'Beginner', title: 'Начальный уровень', titleEn: 'Beginner level' },
];

const RU_EXPLANATIONS = {
  'q-01': 'Бежит — проверяем ударным бЕг.',
  'q-02': 'Словарное слово: грамматика (удвоенная м).',
  'q-03': 'Согласно + дательный падеж: согласно приказу директора.',
  'q-04': 'Яблоко — средний род: красное яблоко.',
  'q-05': 'Обращение выделяется запятой: Маша, иди сюда.',
  'q-06': 'Однородные члены разделяются запятыми.',
  'q-07': 'Одевать — кого; надевать — что. Надень шапку.',
  'q-08': 'Устойчивое сочетание: ни разу не.',
  'q-09': 'Тоже (= также) пишется слитно.',
  'q-10': 'Студентки — женский род: обе студентки.',
  'q-11': 'Вчера требует прошедшего времени: ходил.',
  'q-12': 'Вводное «конечно» выделяется запятой.',
  'q-13': 'Части сложного предложения с союзом и разделяются запятой.',
  'q-14': 'Ихний — речевая ошибка; правильно: их.',
  'q-15': 'Избегайте тавтологии: в связи с болезнью.',
  'q-16': 'Причастие с зависимыми словами: жаренная на сковороде.',
  'q-17': 'Благодаря + дательный: благодаря другу.',
  'q-18': 'Деепричастный оборот относится к подлежащему: я потерял шляпу.',
  'q-19': 'Придаточное которое выделяется запятыми с двух сторон.',
  'q-20': 'Вакансия уже значит свободное место; «свободная вакансия» — плеоназм.',
};

let subjects = [];
let quizzes = [];
let questions = [];
let topics = {};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadAll() {
  subjects = readJson(path.join(TESTS_DIR, 'subjects.json'));
  quizzes = readJson(path.join(TESTS_DIR, 'quizzes.json'));
  const ruLegacy = readJson(path.join(ROOT, 'literacy-questions.json')).map((q) => ({
    ...q,
    subjectId: 'sub-russian',
    quizIds: ['quiz-ru-literacy'],
    explanation: q.explanation || RU_EXPLANATIONS[q.id] || '',
  }));
  // Category quizzes reuse the same RU bank filtered by category
  ruLegacy.forEach((q) => {
    const catQuiz = quizzes.find((qz) => qz.subjectId === 'sub-russian' && qz.categoryFilter === q.category);
    if (catQuiz && !q.quizIds.includes(catQuiz.id)) q.quizIds.push(catQuiz.id);
  });
  const en = readJson(path.join(TESTS_DIR, 'questions-english.json')).map((q) => ({
    ...q,
    subjectId: 'sub-english',
  }));
  questions = [...ruLegacy, ...en];
  topics = readJson(path.join(ROOT, 'literacy-topics.json'));

  subjects.forEach((s) => {
    if (!s.id || !s.slug) throw new Error(`Bad subject: ${JSON.stringify(s)}`);
  });
  quizzes.forEach((q) => {
    if (!q.id || !q.subjectId || !subjects.some((s) => s.id === q.subjectId)) {
      throw new Error(`Bad quiz: ${q.id}`);
    }
  });
  questions.forEach((q) => {
    if (!q.id || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctIndex !== 'number') {
      throw new Error(`Bad question: ${q.id || '?'}`);
    }
    if (q.correctIndex < 0 || q.correctIndex > 3) throw new Error(`Bad answer key: ${q.id}`);
    const ids = q.quizIds || [];
    ids.forEach((qid) => {
      if (!quizzes.some((qz) => qz.id === qid)) throw new Error(`Question ${q.id} → unknown quiz ${qid}`);
    });
  });
}

loadAll();

function getSubject(idOrSlug) {
  const key = String(idOrSlug || '');
  return subjects.find((s) => s.id === key || s.slug === key) || null;
}

function getQuiz(idOrSlug, subjectId) {
  const key = String(idOrSlug || '');
  return quizzes.find((q) => {
    if (q.id !== key && q.slug !== key) return false;
    if (subjectId && q.subjectId !== subjectId) return false;
    return true;
  }) || null;
}

function questionsForQuiz(quiz) {
  if (!quiz) return [];
  let list = questions.filter((q) => (q.quizIds || []).includes(quiz.id));
  if (quiz.categoryFilter) {
    list = list.filter((q) => q.category === quiz.categoryFilter);
  }
  const rank = { EASY: 0, MEDIUM: 1, HARD: 2 };
  list = [...list].sort((a, b) => (rank[a.difficulty] ?? 9) - (rank[b.difficulty] ?? 9));
  const limit = Number(quiz.questionCount) || list.length;
  return list.slice(0, Math.min(limit, list.length));
}

function publicQuestion(q, locale = 'ru') {
  const labels = locale === 'en' ? CATEGORY_LABELS_EN : CATEGORY_LABELS_RU;
  return {
    id: q.id,
    subjectId: q.subjectId,
    category: q.category,
    categoryLabel: labels[q.category] || q.category,
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    options: q.options,
  };
}

function getQuestion(id) {
  return questions.find((q) => q.id === id) || null;
}

function difficultyLabel(code, locale = 'ru') {
  const map = {
    BEGINNER: { ru: 'Начальный', en: 'Beginner' },
    EASY: { ru: 'Лёгкий', en: 'Easy' },
    INTERMEDIATE: { ru: 'Средний', en: 'Intermediate' },
    MEDIUM: { ru: 'Средний', en: 'Intermediate' },
    ADVANCED: { ru: 'Продвинутый', en: 'Advanced' },
    HARD: { ru: 'Сложный', en: 'Hard' },
  };
  const row = map[code] || { ru: code, en: code };
  return locale === 'en' ? row.en : row.ru;
}

function publicQuiz(quiz, { progress } = {}) {
  const subject = getSubject(quiz.subjectId);
  const locale = subject?.uiLocale === 'en' ? 'en' : 'ru';
  const available = questionsForQuiz(quiz).length;
  return {
    id: quiz.id,
    subjectId: quiz.subjectId,
    subjectSlug: subject?.slug,
    subjectName: locale === 'en' ? subject?.name : (subject?.nameRu || subject?.name),
    slug: quiz.slug,
    title: locale === 'en' ? quiz.title : (quiz.titleRu || quiz.title),
    description: quiz.description,
    category: quiz.category,
    difficulty: quiz.difficulty,
    difficultyLabel: difficultyLabel(quiz.difficulty, locale),
    timeLimitMin: quiz.timeLimitMin,
    questionCount: Math.min(quiz.questionCount || available, available),
    availableCount: available,
    isActive: !!quiz.isActive,
    uiLocale: locale,
    progress: progress || null,
  };
}

function publicSubject(subject, quizList) {
  return {
    id: subject.id,
    slug: subject.slug,
    name: subject.uiLocale === 'en' ? subject.name : (subject.nameRu || subject.name),
    description: subject.description,
    icon: subject.icon,
    color: subject.color,
    uiLocale: subject.uiLocale,
    quizzes: quizList,
  };
}

function listCatalog() {
  return subjects
    .filter((s) => s.isActive)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((s) => {
      const qs = quizzes
        .filter((q) => q.subjectId === s.id && q.isActive)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((q) => publicQuiz(q));
      return publicSubject(s, qs);
    });
}

function literacyLevel(percent, locale = 'ru') {
  const n = Number(percent);
  const row = LEVEL_BY_PERCENT.find((r) => n >= r.min) || LEVEL_BY_PERCENT[LEVEL_BY_PERCENT.length - 1];
  if (locale === 'en') return { code: row.codeEn, title: row.titleEn };
  return { code: row.code, title: row.title };
}

function displayLevel(code) {
  if (!code) return null;
  const legacy = { C1: 'Продвинутый', B2: 'Хороший', B1: 'Средний', A2: 'Базовый', A1: 'Начальный' };
  return legacy[code] || code;
}

function levelTitle(code) {
  const mapped = displayLevel(code);
  const row = LEVEL_BY_PERCENT.find((x) => x.code === mapped || x.codeEn === mapped);
  return row ? row.title : mapped;
}

function scoreAttempt(questionIds, answers, { locale = 'ru' } = {}) {
  const picked = questionIds.map(getQuestion).filter(Boolean);
  let correctCount = 0;
  const byCategory = {};
  const byTopic = {};
  const review = [];
  picked.forEach((q) => {
    const selected = Number(answers[q.id]);
    const ok = Number.isInteger(selected) && selected === q.correctIndex;
    if (ok) correctCount += 1;
    const labelMap = locale === 'en' ? CATEGORY_LABELS_EN : CATEGORY_LABELS_RU;
    if (!byCategory[q.category]) {
      byCategory[q.category] = {
        correct: 0,
        total: 0,
        percent: 0,
        label: labelMap[q.category] || q.category,
      };
    }
    byCategory[q.category].total += 1;
    if (ok) byCategory[q.category].correct += 1;
    if (!byTopic[q.topic]) {
      byTopic[q.topic] = {
        topic: q.topic,
        slug: q.learnSlug || null,
        correct: 0,
        total: 0,
        percent: 0,
      };
    }
    byTopic[q.topic].total += 1;
    if (ok) byTopic[q.topic].correct += 1;
    if (!ok) {
      review.push({
        questionId: q.id,
        prompt: q.prompt,
        selectedIndex: Number.isInteger(selected) ? selected : null,
        selectedText: Number.isInteger(selected) ? q.options[selected] : null,
        correctIndex: q.correctIndex,
        correctText: q.options[q.correctIndex],
        explanation: q.explanation || '',
        category: q.category,
        topic: q.topic,
        learnSlug: q.learnSlug || null,
      });
    }
  });
  Object.values(byCategory).forEach((c) => {
    c.percent = c.total ? Math.round((c.correct / c.total) * 100) : 0;
  });
  const topicsList = Object.values(byTopic).map((t) => {
    t.percent = t.total ? Math.round((t.correct / t.total) * 100) : 0;
    t.weak = t.percent < 80;
    return t;
  }).sort((a, b) => a.percent - b.percent);
  const total = picked.length;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;
  const level = literacyLevel(percent, locale);
  return {
    correctCount,
    wrongCount: total - correctCount,
    total,
    percent,
    level: level.code,
    levelTitle: level.title,
    categories: byCategory,
    topics: topicsList,
    review,
  };
}

function getTopic(slug) {
  const t = topics[slug];
  if (!t) return null;
  return { slug, ...t };
}

function orderedBank() {
  return questionsForQuiz(getQuiz('quiz-ru-literacy'));
}

function meta() {
  const bank = orderedBank();
  return {
    questionCount: bank.length,
    duration: 'нет',
    instruction: 'Выберите один правильный вариант ответа',
    categories: Object.entries(CATEGORY_LABELS_RU).map(([key, label]) => ({
      key,
      label,
      share: { ORTHOGRAPHY: 25, GRAMMAR: 30, PUNCTUATION: 25, SPEECH: 20 }[key] || 0,
    })),
  };
}

module.exports = {
  loadAll,
  listCatalog,
  getSubject,
  getQuiz,
  questionsForQuiz,
  publicQuestion,
  publicQuiz,
  getQuestion,
  scoreAttempt,
  literacyLevel,
  getTopic,
  meta,
  displayLevel,
  levelTitle,
  orderedBank,
  CATEGORY_LABELS: CATEGORY_LABELS_RU,
};
