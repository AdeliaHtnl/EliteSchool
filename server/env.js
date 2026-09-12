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
  return 'local-dev-teacher';
}

function frontendOrigins() {
  const raw = String(process.env.FRONTEND_URL || '').trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (!isProduction()) {
    list.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173');
  }
  return [...new Set(list)];
}

function sessionCookieOptions() {
  const crossSite = isProduction() && Boolean(String(process.env.FRONTEND_URL || '').trim());
  return {
    httpOnly: true,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: isProduction() || crossSite,
    sameSite: crossSite ? 'none' : 'lax',
  };
}

function sessionSecret() {
  const s = String(process.env.SESSION_SECRET || '').trim();
  if (s) return s;
  if (isProduction()) throw new Error('SESSION_SECRET is required in production');
  return 'local-dev-session-secret';
}

module.exports = {
  loadDotEnv,
  isProduction,
  teacherLoginCode,
  frontendOrigins,
  sessionCookieOptions,
  sessionSecret,
};
