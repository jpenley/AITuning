const crypto = require('node:crypto');
const store = require('../db/store');
const { SESSION_TTL_HOURS } = require('../config');

class Unauthorized extends Error {}
class Forbidden extends Error {}

// token -> { userId, expiresAt }. Held in memory only.
const sessions = new Map();

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function createUser({ email, password, role, customerId }) {
  return store.update((data) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const user = { id: store.nextId(data, 'usr'), email, salt, passwordHash: hash(password, salt), role, customerId: customerId ?? null };
    data.users.push(user);
    return user;
  });
}

function login(email, password) {
  const user = store.load().users.find((u) => u.email === email);
  if (!user || hash(password, user.salt) !== user.passwordHash) throw new Unauthorized('wrong email or password');
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_HOURS * 3600 * 1000 });
  return { token, expiresAt: sessions.get(token).expiresAt };
}

// Reads "Authorization: Bearer <token>" and returns the user, or throws Unauthorized.
function requireAuth(req) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) throw new Unauthorized('log in first');
  const user = store.load().users.find((u) => u.id === session.userId);
  if (!user) throw new Unauthorized('log in first');
  return user;
}

function requireAdmin(user) {
  if (user.role !== 'admin') throw new Forbidden('admins only');
  return user;
}

module.exports = { createUser, login, requireAuth, requireAdmin, Unauthorized, Forbidden };
