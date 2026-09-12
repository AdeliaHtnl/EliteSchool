/**
 * Canonical student/content language: "ru" | "en"
 */

function normalizeLanguage(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'en' || s === 'english' || s === 'eng') return 'en';
  if (s === 'ru' || s === 'russian' || s === 'рус' || s === 'русский' || s === 'русск') return 'ru';
  return null;
}

function requireLanguage(value) {
  const lang = normalizeLanguage(value);
  if (!lang) {
    const err = new Error('Укажите language: ru или en.');
    err.status = 400;
    throw err;
  }
  return lang;
}

function getUserLanguage(user) {
  return normalizeLanguage(user?.language) || 'ru';
}

function subjectSlugForLanguage(lang) {
  return normalizeLanguage(lang) === 'en' ? 'english' : 'russian';
}

function languageForSubjectSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (s === 'english' || s === 'en' || s === 'sub-english') return 'en';
  if (s === 'russian' || s === 'ru' || s === 'sub-russian') return 'ru';
  return null;
}

function languageForSubjectId(subjectId) {
  const s = String(subjectId || '');
  if (s === 'sub-english') return 'en';
  if (s === 'sub-russian') return 'ru';
  return languageForSubjectSlug(s);
}

function subjectIdForLanguage(lang) {
  return normalizeLanguage(lang) === 'en' ? 'sub-english' : 'sub-russian';
}

/** Display labels (not storage values) */
function languageLabel(lang, uiLang = 'ru') {
  const L = normalizeLanguage(lang) || 'ru';
  const ui = normalizeLanguage(uiLang) || 'ru';
  if (L === 'en') return ui === 'en' ? 'English' : 'Английский';
  return ui === 'en' ? 'Russian' : 'Русский';
}

module.exports = {
  normalizeLanguage,
  requireLanguage,
  getUserLanguage,
  subjectSlugForLanguage,
  languageForSubjectSlug,
  languageForSubjectId,
  subjectIdForLanguage,
  languageLabel,
};
