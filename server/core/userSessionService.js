'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');

const COOKIE_NAME = 'pm_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(header = '') {
  const result = Object.create(null);
  String(header || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 1) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    const raw = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(raw); }
    catch (_) { result[key] = raw; }
  });
  return result;
}

function readSessionCookieFromHeader(header = '') {
  return String(parseCookies(header)[COOKIE_NAME] || '').trim();
}

function readSessionCookie(req) {
  return readSessionCookieFromHeader(req?.headers?.cookie || '');
}

function cookieAttributes({ clear = false } = {}) {
  const attrs = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (env.nodeEnv === 'production') attrs.push('Secure');
  if (clear) {
    attrs.push('Max-Age=0');
    attrs.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  } else {
    attrs.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  }
  return attrs.join('; ');
}

function sessionCookieHeader(value = '') {
  return `${COOKIE_NAME}=${encodeURIComponent(String(value || ''))}; ${cookieAttributes()}`;
}

function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; ${cookieAttributes({ clear: true })}`;
}

async function verifyIdToken(idToken = '', checkRevoked = false) {
  const token = String(idToken || '').trim();
  if (!token) {
    const error = new Error('AUTH_REQUIRED');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const { auth } = initFirebaseAdmin();
  if (!auth) {
    const error = new Error('AUTH_SERVICE_UNAVAILABLE');
    error.code = 'AUTH_SERVICE_UNAVAILABLE';
    throw error;
  }
  return auth.verifyIdToken(token, !!checkRevoked);
}

async function createSessionCookie(idToken = '') {
  const { auth } = initFirebaseAdmin();
  if (!auth) {
    const error = new Error('AUTH_SERVICE_UNAVAILABLE');
    error.code = 'AUTH_SERVICE_UNAVAILABLE';
    throw error;
  }
  const decoded = await auth.verifyIdToken(String(idToken || '').trim(), true);
  const sessionCookie = await auth.createSessionCookie(String(idToken || '').trim(), { expiresIn: SESSION_TTL_MS });
  return { sessionCookie, decoded };
}

async function verifySessionCookie(sessionCookie = '', checkRevoked = true) {
  const cookie = String(sessionCookie || '').trim();
  if (!cookie) {
    const error = new Error('AUTH_REQUIRED');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const { auth } = initFirebaseAdmin();
  if (!auth) {
    const error = new Error('AUTH_SERVICE_UNAVAILABLE');
    error.code = 'AUTH_SERVICE_UNAVAILABLE';
    throw error;
  }
  return auth.verifySessionCookie(cookie, !!checkRevoked);
}

async function verifyRequestSession(req, { checkRevoked = true } = {}) {
  return verifySessionCookie(readSessionCookie(req), checkRevoked);
}

async function verifySocketSession(socket, { checkRevoked = true } = {}) {
  const token = String(socket?.handshake?.auth?.token || '').trim();
  if (token) return verifyIdToken(token, false);
  const cookie = readSessionCookieFromHeader(socket?.handshake?.headers?.cookie || socket?.request?.headers?.cookie || '');
  return verifySessionCookie(cookie, checkRevoked);
}

function publicUser(decoded = {}) {
  return {
    uid: String(decoded.uid || decoded.sub || '').trim(),
    email: String(decoded.email || '').trim(),
    emailVerified: decoded.email_verified === true || decoded.emailVerified === true,
    authTime: Number(decoded.auth_time || 0),
    sessionId: crypto.createHash('sha256').update(String(decoded.uid || '') + ':' + String(decoded.auth_time || '')).digest('hex').slice(0, 20)
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  parseCookies,
  readSessionCookie,
  readSessionCookieFromHeader,
  sessionCookieHeader,
  clearSessionCookieHeader,
  verifyIdToken,
  createSessionCookie,
  verifySessionCookie,
  verifyRequestSession,
  verifySocketSession,
  publicUser
};
