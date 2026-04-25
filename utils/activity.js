'use strict';

const crypto = require('crypto');
const { db, admin, auth } = require('../config/firebase');
const { cleanStr, nowMs, safeNum, sha256Hex } = require('./helpers');

const colUsers = () => db.collection('users');
const colSessions = () => db.collection('sessions');

const IDLE_TIMEOUT_MS = Math.max(5 * 60 * 1000, safeNum(process.env.IDLE_TIMEOUT_MS, 60 * 60 * 1000));
const SESSION_TTL_MS = Math.max(IDLE_TIMEOUT_MS, safeNum(process.env.SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000));
const ACTIVITY_TOUCH_THROTTLE_MS = Math.max(15 * 1000, safeNum(process.env.ACTIVITY_TOUCH_THROTTLE_MS, 60 * 1000));
const inMemoryTouchCache = new Map();

function getIstanbulDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function buildSessionToken() {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { token: raw, tokenHash: sha256Hex(raw) };
}

function parseCookieHeader(header = '') {
  const jar = Object.create(null);
  String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx <= 0) return;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!key) return;
      jar[key] = decodeURIComponent(value);
    });
  return jar;
}

function buildSessionCookie(token, options = {}) {
  const maxAge = Math.max(0, Math.floor(safeNum(options.maxAgeMs, SESSION_TTL_MS)));
  const parts = [
    `pm_session=${encodeURIComponent(String(token || ''))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAge / 1000)}`
  ];
  if (options.secure !== false) parts.push('Secure');
  return parts.join('; ');
}

function buildExpiredSessionCookie() {
  return 'pm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure';
}

async function createServerSession({ uid = '', email = '', emailVerified = false, ip = '', userAgent = '', source = 'firebase_id_token' } = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) throw new Error('SESSION_UID_REQUIRED');
  const { token, tokenHash } = buildSessionToken();
  const createdAt = nowMs();
  const sessionRef = colSessions().doc();
  const payload = {
    uid: safeUid,
    email: cleanStr(email, 200).toLowerCase(),
    emailVerified: !!emailVerified,
    tokenHash,
    source: cleanStr(source, 40),
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    revokedAt: 0,
    ip: cleanStr(ip, 120),
    userAgent: cleanStr(userAgent, 400),
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };
  await sessionRef.set(payload, { merge: true });
  return { sessionId: sessionRef.id, token, ...payload };
}

async function revokeServerSessionByToken(rawToken = '') {
  const safeToken = String(rawToken || '').trim();
  if (!safeToken) return false;
  const tokenHash = sha256Hex(safeToken);
  const snap = await colSessions().where('tokenHash', '==', tokenHash).limit(3).get();
  if (snap.empty) return false;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.set(doc.ref, { revokedAt: nowMs() }, { merge: true }));
  await batch.commit();
  return true;
}

async function revokeAllUserSessions(uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return 0;
  const snap = await colSessions().where('uid', '==', safeUid).where('revokedAt', '==', 0).limit(500).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.set(doc.ref, { revokedAt: nowMs() }, { merge: true }));
  await batch.commit();
  return snap.size;
}

async function resolveServerSession(rawToken = '') {
  const safeToken = String(rawToken || '').trim();
  if (!safeToken) return null;
  const tokenHash = sha256Hex(safeToken);
  const snap = await colSessions().where('tokenHash', '==', tokenHash).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() || {};
  if (safeNum(data.revokedAt, 0) > 0) return { valid: false, reason: 'REVOKED', ref: doc.ref, data };
  const now = nowMs();
  const expiresAt = safeNum(data.expiresAt, 0);
  const lastSeenAt = safeNum(data.lastSeenAt, 0);
  const idleMs = Math.max(IDLE_TIMEOUT_MS, safeNum(data.idleTimeoutMs, IDLE_TIMEOUT_MS));
  if (expiresAt > 0 && now > expiresAt) return { valid: false, reason: 'EXPIRED', ref: doc.ref, data };
  if (lastSeenAt > 0 && (now - lastSeenAt) > idleMs) return { valid: false, reason: 'IDLE_TIMEOUT', ref: doc.ref, data };
  return { valid: true, id: doc.id, ref: doc.ref, data };
}

async function touchServerSession(sessionRefOrId, extras = {}) {
  if (!sessionRefOrId) return false;
  const ref = typeof sessionRefOrId === 'string' ? colSessions().doc(sessionRefOrId) : sessionRefOrId;
  await ref.set({
    lastSeenAt: nowMs(),
    expiresAt: nowMs() + SESSION_TTL_MS,
    ip: cleanStr(extras.ip || '', 120),
    userAgent: cleanStr(extras.userAgent || '', 400)
  }, { merge: true });
  return true;
}

async function touchUserActivity(uid = '', extras = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return false;
  const now = nowMs();
  const cacheKey = `${safeUid}:${cleanStr(extras.scope || 'default', 32)}`;
  const lastTouch = safeNum(inMemoryTouchCache.get(cacheKey), 0);
  if (lastTouch > 0 && (now - lastTouch) < ACTIVITY_TOUCH_THROTTLE_MS) return false;
  inMemoryTouchCache.set(cacheKey, now);
  const payload = {
    lastActiveAt: now,
    lastSeen: now,
    presenceUpdatedAt: now
  };
  if (extras.login === true) payload.lastLogin = now;
  if (extras.activity) payload.currentActivity = cleanStr(extras.activity, 80);
  if (extras.sessionId) payload.lastSessionId = cleanStr(extras.sessionId, 120);
  if (extras.status) payload.currentStatus = cleanStr(extras.status, 24).toUpperCase();
  await colUsers().doc(safeUid).set(payload, { merge: true });
  return true;
}


async function touchUserPresence(uid = '', extras = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return false;
  const now = nowMs();
  const payload = {
    lastSeen: now,
    presenceUpdatedAt: now
  };
  if (extras.activity) payload.currentActivity = cleanStr(extras.activity, 80);
  if (extras.sessionId) payload.lastSessionId = cleanStr(extras.sessionId, 120);
  if (extras.status) payload.currentStatus = cleanStr(extras.status, 24).toUpperCase();
  await colUsers().doc(safeUid).set(payload, { merge: true });
  return true;
}

async function verifyFirebaseBearerToken(idToken = '') {
  const safeToken = String(idToken || '').trim();
  if (!safeToken) return null;
  return auth.verifyIdToken(safeToken);
}

module.exports = {
  IDLE_TIMEOUT_MS,
  SESSION_TTL_MS,
  ACTIVITY_TOUCH_THROTTLE_MS,
  getIstanbulDateKey,
  parseCookieHeader,
  buildSessionCookie,
  buildExpiredSessionCookie,
  createServerSession,
  revokeServerSessionByToken,
  revokeAllUserSessions,
  resolveServerSession,
  touchServerSession,
  touchUserActivity,
  touchUserPresence,
  verifyFirebaseBearerToken
};
