const quizzes = require('./quizzes');

module.exports = {
  CATEGORY_LABELS: quizzes.CATEGORY_LABELS,
  loadBank: quizzes.loadAll,
  orderedBank: quizzes.orderedBank,
  publicQuestion(q) {
    return quizzes.publicQuestion(q, 'ru');
  },
  getQuestion: quizzes.getQuestion,
  scoreAttempt(questionIds, answers) {
    return quizzes.scoreAttempt(questionIds, answers, { locale: 'ru' });
  },
  literacyLevel(percent) {
    return quizzes.literacyLevel(percent, 'ru');
  },
  getTopic: quizzes.getTopic,
  meta: quizzes.meta,
  displayLevel: quizzes.displayLevel,
  levelTitle: quizzes.levelTitle,
};
