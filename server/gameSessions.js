/**
 * Game session store abstraction.
 * v1: in-memory Map (single Render instance).
 * Swap implementation later for Redis without changing callers.
 */
const crypto = require('crypto');

class MemoryGameSessionStore {
  constructor(ttlMs = 2 * 60 * 60 * 1000) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
  }

  prune() {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (s.expiresAt <= now) this.sessions.delete(id);
    }
  }

  createSession(userId, type, secret, publicPayload) {
    this.prune();
    const id = `gs-${crypto.randomUUID()}`;
    this.sessions.set(id, {
      id,
      userId,
      type,
      secret,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    });
    return { sessionId: id, ...publicPayload };
  }

  getSession(sessionId, userId, type) {
    this.prune();
    const s = this.sessions.get(String(sessionId || ''));
    if (!s) return null;
    if (s.userId !== userId) return null;
    if (type && s.type !== type) return null;
    if (s.expiresAt <= Date.now()) {
      this.sessions.delete(s.id);
      return null;
    }
    return s;
  }

  destroySession(sessionId) {
    this.sessions.delete(String(sessionId || ''));
  }
}

const defaultStore = new MemoryGameSessionStore();

module.exports = {
  MemoryGameSessionStore,
  createSession: (...args) => defaultStore.createSession(...args),
  getSession: (...args) => defaultStore.getSession(...args),
  destroySession: (...args) => defaultStore.destroySession(...args),
  store: defaultStore,
};
