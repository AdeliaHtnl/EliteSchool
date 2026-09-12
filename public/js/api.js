export function friendlyError(err) {
  const status = err && err.status;
  const m = String((err && err.message) || err || '');
  if (status === 401) return 'Сессия истекла. Войдите снова.';
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
    res = await fetch(path, opts);
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
  return `/api/retellings/${encodeURIComponent(retellingId)}/media`;
}

export function lessonFileUrl(id) {
  return `/api/lessons/${encodeURIComponent(id)}/file`;
}
