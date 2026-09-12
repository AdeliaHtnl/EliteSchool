const crypto = require('crypto');

/** In-memory game sessions: sessionId -> payload */
const sessions = new Map();
const TTL_MS = 2 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (s.expiresAt <= now) sessions.delete(id);
  }
}

function createSession(userId, type, secret, publicPayload) {
  prune();
  const id = `gs-${crypto.randomUUID()}`;
  sessions.set(id, {
    id,
    userId,
    type,
    secret,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  });
  return { sessionId: id, ...publicPayload };
}

function getSession(sessionId, userId, type) {
  prune();
  const s = sessions.get(String(sessionId || ''));
  if (!s) return null;
  if (s.userId !== userId) return null;
  if (type && s.type !== type) return null;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(s.id);
    return null;
  }
  return s;
}

function destroySession(sessionId) {
  sessions.delete(String(sessionId || ''));
}

module.exports = {
  createSession,
  getSession,
  destroySession,
};
