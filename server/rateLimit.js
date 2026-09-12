/**
 * Lightweight in-memory rate limiter (no extra dependencies).
 * key -> { count, resetAt }
 */
const buckets = new Map();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 30, keyFn } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = (keyFn ? keyFn(req) : null) || `${req.ip}|${req.path}`;
    let row = buckets.get(key);
    if (!row || row.resetAt <= now) {
      row = { count: 0, resetAt: now + windowMs };
      buckets.set(key, row);
    }
    row.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - row.count)));
    if (row.count > max) {
      const retry = Math.ceil((row.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'Слишком много попыток. Подождите и попробуйте снова.' });
    }
    next();
  };
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets.entries()) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}, 60 * 1000).unref?.();

module.exports = { rateLimit };
