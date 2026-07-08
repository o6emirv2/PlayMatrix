'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');
const { getRedisClient } = require('./redisClient');

const COOKIE_NAME = 'pm_user_session';
const VERSION = 1;
const SESSION_TTL_MS = Math.max(60 * 60 * 1000, Math.min(7 * 86400000, Number(env.session?.ttlMs || 7 * 86400000)));

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}
function fromB64url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}
function sessionKey(uid = '') { return `pm:session:active:${String(uid || '').trim()}`; }
function getSecret() {
  const source = String(env.session?.secretSource || '').trim();
  if (!source) return null;
  return crypto.createHash('sha256').update(`playmatrix-user-session:${source}`).digest();
}
function sign(encodedPayload) {
  const secret = getSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(String(encodedPayload || '')).digest('base64url');
}
function safeEqual(a = '', b = '') {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function parseCookies(header = '') {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(value); } catch (_) { out[key] = value; }
  });
  return out;
}
function requestCookieHeader(reqOrSocket) {
  return String(reqOrSocket?.headers?.cookie || reqOrSocket?.handshake?.headers?.cookie || '');
}
function readToken(reqOrSocket) {
  return parseCookies(requestCookieHeader(reqOrSocket))[COOKIE_NAME] || '';
}
function encodeSession(payload = {}) {
  const encoded = b64url(JSON.stringify(payload));
  const signature = sign(encoded);
  return signature ? `${encoded}.${signature}` : '';
}
function decodeSession(token = '') {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  if (!expected || !safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(encoded));
    if (Number(payload.v || 0) !== VERSION) return null;
    if (!payload.uid || !payload.sid || Number(payload.exp || 0) <= Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}
async function storeActiveSession(payload = {}) {
  const key = sessionKey(payload.uid);
  const ttlMs = Math.max(1000, Number(payload.exp || 0) - Date.now());
  runtimeStore.temporary.set(key, { sid: payload.sid, exp: payload.exp }, ttlMs);
  try {
    const redis = await getRedisClient();
    if (redis?.isOpen) await redis.set(key, String(payload.sid), { PX: ttlMs });
  } catch (_) {}
}
async function activeSessionId(uid = '') {
  const key = sessionKey(uid);
  try {
    const redis = await getRedisClient();
    if (redis?.isOpen) {
      const value = await redis.get(key);
      if (value) return String(value);
    }
  } catch (_) {}
  const memory = runtimeStore.temporary.get(key);
  return String(memory?.sid || '');
}
async function revokeSession(payload = null) {
  if (!payload?.uid) return;
  const key = sessionKey(payload.uid);
  runtimeStore.temporary.delete(key);
  try {
    const redis = await getRedisClient();
    if (redis?.isOpen) await redis.del(key);
  } catch (_) {}
}
function cookieSecurity(req = null) {
  const host = String(req?.headers?.host || '').toLowerCase();
  const isLocal = /^(localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
  return {
    secure: env.nodeEnv === 'production' && !isLocal,
    sameSite: host.includes('onrender.com') ? 'None' : 'Lax'
  };
}
function sessionCookie(token, req = null) {
  const security = cookieSecurity(req);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    `SameSite=${security.sameSite}`
  ];
  if (security.secure) parts.push('Secure');
  return parts.join('; ');
}
function clearSessionCookie(req = null) {
  const security = cookieSecurity(req);
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0', 'SameSite=' + security.sameSite];
  if (security.secure) parts.push('Secure');
  return parts.join('; ');
}
async function createSessionFromIdToken(idToken = '') {
  const token = String(idToken || '').trim();
  if (!token) return { ok: false, code: 'AUTH_REQUIRED' };
  const { auth } = initFirebaseAdmin();
  if (!auth) return { ok: false, code: 'AUTH_UNAVAILABLE' };
  const decoded = await auth.verifyIdToken(token, true);
  const now = Date.now();
  const payload = {
    v: VERSION,
    uid: String(decoded.uid || ''),
    email: String(decoded.email || ''),
    emailVerified: !!decoded.email_verified,
    iat: now,
    exp: now + SESSION_TTL_MS,
    sid: crypto.randomBytes(24).toString('base64url')
  };
  if (!payload.uid) return { ok: false, code: 'AUTH_REQUIRED' };
  const signed = encodeSession(payload);
  if (!signed) return { ok: false, code: 'SESSION_SECRET_MISSING' };
  await storeActiveSession(payload);
  return { ok: true, token: signed, user: payload };
}
async function verifyUserSession(reqOrSocket) {
  const payload = decodeSession(readToken(reqOrSocket));
  if (!payload) return { ok: false, code: 'SESSION_INVALID' };
  const activeSid = await activeSessionId(payload.uid);
  if (activeSid && activeSid !== payload.sid) return { ok: false, code: 'SESSION_CONFLICT' };
  if (!activeSid) await storeActiveSession(payload);
  return { ok: true, ...payload };
}
async function authenticateSocketRequest(socket) {
  const bearer = String(socket?.handshake?.auth?.token || socket?.handshake?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    try {
      const { auth } = initFirebaseAdmin();
      if (auth) {
        const decoded = await auth.verifyIdToken(bearer);
        if (decoded?.uid) return { ok: true, uid: String(decoded.uid), email: String(decoded.email || ''), sid: '' };
      }
    } catch (_) {}
  }
  return verifyUserSession(socket);
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  sessionCookie,
  clearSessionCookie,
  createSessionFromIdToken,
  verifyUserSession,
  authenticateSocketRequest,
  revokeSession,
  decodeSession,
  readToken
};
