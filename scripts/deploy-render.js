#!/usr/bin/env node
/**
 * Create Render web service from local .env (does not print secret values).
 * Usage: node scripts/deploy-render.js
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('../server/env');

function must(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

const databaseUrl = must('DATABASE_URL');
const teacherCode = must('TEACHER_LOGIN_CODE');
let sessionSecret = String(process.env.SESSION_SECRET || '').trim();
if (!sessionSecret || /change-me/i.test(sessionSecret)) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.log('NOTE: generated SESSION_SECRET for Render (not written to local .env)');
}

const frontendUrl = String(process.env.FRONTEND_URL || '').trim()
  || process.env.DEPLOY_FRONTEND_URL
  || 'https://eliteschool-web.onrender.com';

// Use KEY=VALUE flags so Windows shells don't split "npm install"
const args = [
  'services',
  'create',
  '--name=eliteschool-api',
  '--type=web_service',
  '--repo=https://github.com/AdeliaHtnl/EliteSchool',
  '--branch=main',
  '--runtime=node',
  '--plan=free',
  '--region=oregon',
  '--build-command=npm install',
  '--start-command=npm start',
  '--health-check-path=/health',
  '--auto-deploy',
  `--env-var=NODE_ENV=production`,
  `--env-var=DATABASE_URL=${databaseUrl}`,
  `--env-var=TEACHER_LOGIN_CODE=${teacherCode}`,
  `--env-var=SESSION_SECRET=${sessionSecret}`,
  `--env-var=FRONTEND_URL=${frontendUrl}`,
  '--output=json',
  '--confirm',
];

console.log('Creating Render service eliteschool-api…');
const r = spawnSync('render', args, {
  encoding: 'utf8',
  shell: false,
  env: process.env,
  maxBuffer: 10 * 1024 * 1024,
  windowsHide: true,
});

if (r.stdout) {
  // Redact secrets from any accidental echo
  const scrubbed = r.stdout
    .replace(databaseUrl, '[DATABASE_URL]')
    .replace(teacherCode, '[TEACHER_LOGIN_CODE]')
    .replace(sessionSecret, '[SESSION_SECRET]');
  process.stdout.write(scrubbed);
}
if (r.stderr) {
  const scrubbed = r.stderr
    .replace(databaseUrl, '[DATABASE_URL]')
    .replace(teacherCode, '[TEACHER_LOGIN_CODE]')
    .replace(sessionSecret, '[SESSION_SECRET]');
  process.stderr.write(scrubbed);
}

if (r.status !== 0) {
  process.exit(r.status || 1);
}

try {
  const data = JSON.parse(r.stdout);
  const svc = Array.isArray(data) ? data[0] : data;
  const url = svc?.service?.url || svc?.url || svc?.serviceDetails?.url;
  const id = svc?.service?.id || svc?.id;
  const out = { id, url, name: svc?.service?.name || svc?.name || 'eliteschool-api' };
  fs.writeFileSync(path.join(__dirname, '..', '.render-service.json'), JSON.stringify(out, null, 2));
  console.log('Wrote .render-service.json');
  console.log('Service id:', id || '(see JSON above)');
  console.log('Service url:', url || '(check dashboard)');
} catch (_) {
  console.log('Parse note: inspect JSON output above for service URL');
}
