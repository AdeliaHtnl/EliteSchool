#!/usr/bin/env node
/**
 * Update FRONTEND_URL on Render via API (uses ~/.render/cli.yaml token).
 * Usage: node scripts/set-render-frontend-url.js https://your-app.vercel.app
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const frontendUrl = String(process.argv[2] || '').trim().replace(/\/$/, '');
if (!frontendUrl || !/^https:\/\//i.test(frontendUrl)) {
  console.error('Usage: node scripts/set-render-frontend-url.js https://your-app.vercel.app');
  process.exit(1);
}

const svcPath = path.join(__dirname, '..', '.render-service.json');
const svc = JSON.parse(fs.readFileSync(svcPath, 'utf8'));
const serviceId = svc.id;
if (!serviceId) throw new Error('Missing service id in .render-service.json');

const cliYaml = fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.render', 'cli.yaml'), 'utf8');
const tokenMatch = cliYaml.match(/^\s*key:\s*(\S+)/m)
  || cliYaml.match(/apiToken:\s*(\S+)/i)
  || cliYaml.match(/token:\s*(\S+)/i);
if (!tokenMatch) throw new Error('No Render CLI token found — run render login');
const token = tokenMatch[1].replace(/['"]/g, '');

function req(method, urlPath, body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.render.com',
        path: urlPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch (_) {}
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  // PUT env var FRONTEND_URL (Render API: update env vars)
  const r = await req('PUT', `/v1/services/${serviceId}/env-vars/FRONTEND_URL`, {
    value: frontendUrl,
  });
  if (r.status >= 300) {
    // Fallback: bulk update
    const r2 = await req('PUT', `/v1/services/${serviceId}/env-vars`, [
      { key: 'FRONTEND_URL', value: frontendUrl },
    ]);
    if (r2.status >= 300) {
      console.error('Failed to set FRONTEND_URL', r.status, r2.status);
      process.exit(1);
    }
  }
  console.log('OK: FRONTEND_URL updated on Render');
  console.log('Triggering redeploy…');
  const d = await req('POST', `/v1/services/${serviceId}/deploys`, { clearCache: false });
  if (d.status >= 300) {
    console.error('Env set but redeploy failed — restart from dashboard');
    process.exit(1);
  }
  console.log('OK: redeploy triggered');
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
