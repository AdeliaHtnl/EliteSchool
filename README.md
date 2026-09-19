# EliteSchool

EdTech platform for reading, retelling, quizzes, games, and teacher review.

**Stack:** Vanilla HTML/CSS/JS SPA · Node.js + Express · Neon PostgreSQL · Cloudflare R2

## Architecture

```
GitHub
  ├── Vercel  → static SPA (public/)
  └── Render  → Express API
                  ├── Neon PostgreSQL (runtime data)
                  └── Cloudflare R2 (audio/video/PDF)
```

Quiz catalog (subjects/questions/passages) stays in `data/seeds/` as read-only seed JSON.

## Local development

```bash
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000

Without `DATABASE_URL`, the API uses `data/db.json` (dev only).  
**Production requires `DATABASE_URL`.**

### With Neon

```bash
# set DATABASE_URL in .env
npm run db:migrate
npm run db:seed
# optional one-time import of existing JSON runtime:
npm run db:migrate-json
npm start
```

## Environment variables

See [`.env.example`](.env.example).

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `FRONTEND_URL` | Allowed CORS origin(s), comma-separated |
| `TEACHER_LOGIN_CODE` | Teacher login secret |
| `SESSION_SECRET` | Session hardening secret |
| `R2_*` | Cloudflare R2 credentials + public URL |

## Frontend API URL

Local (same origin): leave empty.

Production (`public/index.html`):

```html
<script>window.ELITESCHOOL_API_URL = "https://YOUR-RENDER-SERVICE.onrender.com";</script>
```

All fetches go through [`public/js/config.js`](public/js/config.js) + [`public/js/api.js`](public/js/api.js) with `credentials: "include"`.

## Deploy

### Vercel (frontend)

- Root / output: `public/`
- Config: [`vercel.json`](vercel.json)
- Do **not** deploy `server/`, `.env`, `uploads/`, `data/db.json`
- Set `ELITESCHOOL_API_URL` in `index.html` (or inject via CI) to the Render URL

### Render (API)

- Config: [`render.yaml`](render.yaml)
- Start: `npm start` → listens on `0.0.0.0:$PORT`
- Health: `GET /health`
- Set env vars from `.env.example` (never commit secrets)

### Neon

- Create a database, copy `DATABASE_URL`
- Run `npm run db:migrate` then `npm run db:seed`
- Enable PITR / backups in Neon dashboard

### Cloudflare R2

- Create bucket + API token with Object Read & Write
- Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- **CORS on the bucket** (required for browser multipart PUT):

```json
[
  {
    "AllowedOrigins": ["https://YOUR-VERCEL-APP.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- Lesson videos: browser → presigned multipart → R2 (up to `MAX_VIDEO_SIZE_MB`, default **5120 = 5 GB**)
- Render never stores 5 GB files on local disk
- Object keys: `lessons/<uuid>.ext`, `retellings/<uuid>.ext`

## Cookies / CORS

Production cross-site (Vercel ≠ Render):

- Cookie: `httpOnly`, `secure`, `sameSite=none`
- CORS: whitelist `FRONTEND_URL` only (no `*`)
- Frontend: `credentials: "include"`

## Language isolation

Student `language` is `ru` | `en` only.  
Backend always uses authenticated `user.language` — never trusts body/query for student content access.

## Testing

```bash
npm start   # terminal 1
npm test    # terminal 2 — security + language isolation smoke
```

## Important production notes

1. **Single Render instance (v1):** game sessions and rate limits are in-memory. Scale later with Redis via `GameSessionStore`.
2. Do not commit large `.mov` media or `.env`.
3. Runtime must not depend on `data/db.json` or local `uploads/` in production.
4. Restore: Neon PITR + R2 versioning/backups; re-seed catalog with `npm run db:seed`.

## Scripts

| Script | Description |
|---|---|
| `npm start` | Run API |
| `npm test` | Security smoke tests |
| `npm run db:migrate` | Apply SQL schema |
| `npm run db:seed` | Idempotent teacher + seed file check |
| `npm run db:migrate-json` | Import `data/db.json` → Postgres |
