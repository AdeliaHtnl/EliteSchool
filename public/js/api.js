import { apiUrl } from './config.js';

export function friendlyError(err) {
  const status = err && err.status;
  const m = String((err && err.message) || err || '');
  // Only rewrite generic auth-required responses — keep login error text from API
  if (status === 401 && /нужно войти|сессия|session|unauthorized/i.test(m) && !/неверн|invalid|код|парол|password|code/i.test(m)) {
    return 'Сессия истекла. Войдите снова.';
  }
  if (status === 0 || /Failed to fetch|NetworkError|network|Load failed|offline/i.test(m)) {
    return 'Нет соединения с интернетом. Проверьте сеть и попробуйте снова.';
  }
  if (/TypeError|Cannot read|undefined is not|null is not|Internal Server|Unexpected token/i.test(m)) {
    return 'Что-то пошло не так. Обновите страницу и попробуйте снова.';
  }
  return m || 'Не получилось выполнить действие. Попробуйте снова.';
}

export async function api(path, options = {}) {
  const opts = { credentials: 'include', ...options };
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  opts.headers = headers;
  let res;
  try {
    res = await fetch(apiUrl(path), opts);
  } catch (_) {
    const err = new Error(friendlyError({ status: 0, message: 'Failed to fetch' }));
    err.status = 0;
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) {
    const raw = data.error || 'Ошибка запроса';
    const err = new Error(friendlyError({ status: res.status, message: raw }));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function mediaUrl(retellingId) {
  return apiUrl(`/api/retellings/${encodeURIComponent(retellingId)}/media`);
}

export function lessonFileUrl(id) {
  return apiUrl(`/api/lessons/${encodeURIComponent(id)}/file`);
}

/** Resolve a playable media URL (signed R2) or blob URL for auth-protected files. */
export async function authMediaObjectUrl(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : apiUrl(pathOrUrl);
  const join = url.includes('?') ? '&' : '?';

  // Prefer signed/direct URL — <video>/<audio>/<iframe> can play cross-origin without CORS.
  try {
    const metaRes = await fetch(`${url}${join}alt=url`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (metaRes.ok) {
      const meta = await metaRes.json().catch(() => ({}));
      if (meta?.url && /^https?:\/\//i.test(meta.url)) {
        return meta.url;
      }
    }
  } catch (_) { /* fall through to blob stream */ }

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    let msg = 'Не удалось загрузить медиа.';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  // If API still redirects to R2, reading the body fails CORS — surface a clear error.
  const finalHost = (() => {
    try { return new URL(res.url).hostname; } catch { return ''; }
  })();
  if (/r2\.cloudflarestorage\.com$|\.r2\.dev$/i.test(finalHost)) {
    const err = new Error('Медиа недоступно (CORS R2). Обновите API.');
    err.status = 0;
    throw err;
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function hydrateAuthMedia(root = document) {
  const nodes = root.querySelectorAll('[data-auth-media]');
  for (const el of nodes) {
    const src = el.getAttribute('data-auth-media');
    if (!src) continue;
    const wrap = el.closest('.auth-media-wrap') || el.parentElement;
    const fallback = wrap?.querySelector('[data-media-error]') || el.parentElement?.querySelector('[data-media-error]');
    try {
      const objectUrl = await authMediaObjectUrl(src);
      el.src = objectUrl;
      el.removeAttribute('data-auth-media');
      if (fallback) fallback.hidden = true;
      el.load?.();
    } catch (err) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = err.message || 'Медиа недоступно.';
      }
      el.removeAttribute('src');
    }
  }
  const downloads = root.querySelectorAll('[data-auth-download]');
  for (const a of downloads) {
    const src = a.getAttribute('data-auth-download');
    if (!src) continue;
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const objectUrl = await authMediaObjectUrl(src);
        const tmp = document.createElement('a');
        tmp.href = objectUrl;
        tmp.download = a.getAttribute('download') || 'file';
        tmp.click();
      } catch (err) {
        alert(err.message || 'Не удалось скачать файл.');
      }
    }, { once: false });
  }
}
