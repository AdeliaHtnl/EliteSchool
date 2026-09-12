/**
 * API base URL for split Vercel (frontend) + Render (API) deployments.
 * Local same-origin: leave window.ELITESCHOOL_API_URL empty / unset.
 * Production: set in public/index.html or inject at deploy time.
 */
export const API_BASE = String(
  (typeof window !== 'undefined' && window.ELITESCHOOL_API_URL) || ''
).replace(/\/$/, '');

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
