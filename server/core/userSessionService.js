'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');

const COOKIE_NAME = 'pm_session';
const REMEMBER_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const BROWSER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFY_CACHE_TTL_MS = 30 * 1000;

function parseCookies(header = '') {
  return String(header || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 1) return cookies;
    const key = part.slice(0, index).trim();
    if (!key) return cookies;
    try { cookies[key] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch (_) { cookies[key] = part.slice(index + 1).trim(); }
    return cookies;
  }, {});
}

function readSessionCookie(req) {
  return String(parseCookies(req?.headers?.cookie || '')[COOKIE_NAME] || '').trim();
}

function cookieAttributes({ remember = false, clear = false } = {}) {
  const production = env.nodeEnv === 'production';
  const attributes = [
    `${COOKIE_NAME}=${clear ? '' : '__VALUE__'}`,
    'Path=/',
    'HttpOnly',
    production ? 'Secure' : '',
    production ? 'SameSite=None' : 'SameSite=Lax',
    clear ? 'Max-Age=0' : (remember ? `Max-Age=${Math.floor(REMEMBER_TTL_MS / 1000)}` : ''),
    clear ? 'Expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''
  ].filter(Boolean);
  return attributes.join('; ');
}

function sessionCookieHeader(value, remember = false) {
  return cookieAttributes({ remember }).replace('__VALUE__', encodeURIComponent(String(value || '')));
}

function clearSessionCookieHeader() {
  return cookieAttributes({ clear: true });
}

function sessionHash(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40);
}

function trustedOrigin(req) {
  const origin = env.normalizeOrigin(req?.headers?.origin || '');
  if (!origin) return env.nodeEnv !== 'production';
  return env.allowedOrigins.includes(origin);
}

async function createUserSession(idToken, remember = false) {
  const { auth } = initFirebaseAdmin();
  if (!auth || !idToken) throw Object.assign(new Error('AUTH_UNAVAILABLE'), { statusCode: 503, code: 'AUTH_UNAVAILABLE' });
  const expiresIn = remember ? REMEMBER_TTL_MS : BROWSER_SESSION_TTL_MS;
  const decoded = await auth.verifyIdToken(String(idToken), true);
  const sessionCookie = await auth.createSessionCookie(String(idToken), { expiresIn });
  return { sessionCookie, decoded, remember: !!remember, expiresIn };
}

async function verifyUserSession(req, { checkRevoked = true } = {}) {
  const sessionCookie = readSessionCookie(req);
  if (!sessionCookie) return null;
  const key = `user-session:${sessionHash(sessionCookie)}:${checkRevoked ? 'r' : 'n'}`;
  const cached = runtimeStore.temporary.get(key);
  if (cached && Number(cached.expiresAt || 0) > Date.now()) return cached.user || null;
  const { auth } = initFirebaseAdmin();
  if (!auth) return null;
  const decoded = await auth.verifySessionCookie(sessionCookie, checkRevoked);
  const user = { ...decoded, uid: decoded.uid || decoded.sub };
  runtimeStore.temporary.set(key, { user, expiresAt: Date.now() + VERIFY_CACHE_TTL_MS }, VERIFY_CACHE_TTL_MS + 5000);
  return user;
}

module.exports = {
  COOKIE_NAME,
  REMEMBER_TTL_MS,
  BROWSER_SESSION_TTL_MS,
  readSessionCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
  trustedOrigin,
  createUserSession,
  verifyUserSession
};
