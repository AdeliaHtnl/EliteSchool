const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  });
}

loadDotEnv();

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function teacherLoginCode() {
  const code = String(process.env.TEACHER_LOGIN_CODE || '').trim();
  if (code) return code.toLowerCase();
  if (isProduction()) {
    throw new Error('TEACHER_LOGIN_CODE is required in production');
  }
  // Local-only fallback so `npm start` works before .env is created.
  // Never use this value in production (blocked above).
  return 'local-dev-teacher';
}

module.exports = {
  loadDotEnv,
  isProduction,
  teacherLoginCode,
};
