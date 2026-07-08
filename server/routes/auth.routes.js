'use strict';

const express = require('express');
const env = require('../config/env');
const { requireAuth, strictLimiter } = require('../core/security');
const { assertDateOfBirthInput } = require('../core/ageGateService');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const {
  createSessionCookie,
  verifyRequestSession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  publicUser
} = require('../core/userSessionService');

const router = express.Router();
const FIREBASE_IDENTITY_BASE = 'https://identitytoolkit.googleapis.com/v1';
const RESERVED_USERNAMES = new Set(['admin','administrator','support','moderator','system','playmatrix','root','owner','official','staff','yonetici','yönetici','destek','sistem']);
const USERNAME_RE = /^[\p{L}\p{N}._-]{5,20}$/u;
const PERSON_NAME_RE = /^[\p{L}]{3,50}$/u;

function normalizeUsername(value = '') {
  return String(value || '').trim().replace(/\s+/g, '').slice(0, 20);
}

function validUsername(value = '') {
  const username = normalizeUsername(value);
  return USERNAME_RE.test(username) && !RESERVED_USERNAMES.has(username.toLocaleLowerCase('tr-TR'));
}

function validPersonName(value = '') {
  return PERSON_NAME_RE.test(String(value || '').trim());
}

async function usernameExists(db, usernameLower = '') {
  if (!db || !usernameLower) return false;
  const [registry, users] = await Promise.all([
    db.collection('usernames').doc(usernameLower).get().catch(() => null),
    db.collection('users').where('usernameLower', '==', usernameLower).limit(1).get().catch(() => null)
  ]);
  return !!(registry?.exists || (users && !users.empty));
}

async function persistRegistrationProfile({ uid, email, username, firstName, lastName, dob }) {
  const { db, admin } = initFirebaseAdmin();
  if (!db || !admin) return { persisted: false };
  const usernameLower = username.toLocaleLowerCase('tr-TR');
  if (await usernameExists(db, usernameLower)) {
    const error = new Error('USERNAME_TAKEN');
    error.code = 'USERNAME_TAKEN';
    error.status = 409;
    throw error;
  }
  const userRef = db.collection('users').doc(uid);
  const usernameRef = db.collection('usernames').doc(usernameLower);
  const ledgerRef = db.collection('ledger').doc(`signup_${uid}`);
  const at = Date.now();
  await db.runTransaction(async (tx) => {
    const registry = await tx.get(usernameRef);
    if (registry.exists && String(registry.data()?.uid || '') !== uid) {
      const error = new Error('USERNAME_TAKEN');
      error.code = 'USERNAME_TAKEN';
      error.status = 409;
      throw error;
    }
    tx.set(usernameRef, { uid, username, usernameLower, createdAt: at, updatedAt: at }, { merge: true });
    tx.set(userRef, {
      uid,
      email,
      username,
      usernameLower,
      displayName: username,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      dateOfBirth: dob.dateOfBirth,
      age: dob.age,
      ageVerified: true,
      ageVerifiedAt: at,
      emailVerified: false,
      balance: 50000,
      signupBonusClaimed: true,
      signupBonusAt: at,
      acceptedTerms: true,
      acceptedTermsAt: at,
      acceptedKvkk: true,
      acceptedKvkkAt: at,
      acceptedMcVirtualPoints: true,
      acceptedMcVirtualPointsAt: at,
      accountLevel: 1,
      level: 1,
      accountXp: '0',
      xp: '0',
      selectedFrame: 0,
      usernameChangeLimit: 3,
      usernameChangesUsed: 0,
      createdAt: at,
      updatedAt: at,
      lastLogin: at,
      lastSeen: at
    }, { merge: false });
    tx.set(ledgerRef, {
      uid,
      operationType: 'signup-reward',
      type: 'signup-reward',
      amount: 50000,
      balanceAfter: 50000,
      idempotencyKey: `signup_${uid}`,
      createdAt: at,
      at
    }, { merge: true });
  });
  return { persisted: true };
}

function response(res, status, { ok = false, data = null, code = '', message = '' } = {}) {
  return res.status(status).json({ ok, data, message, code: String(code || (ok ? 'SUCCESS' : 'UNKNOWN_ERROR')) });
}

function authErrorCode(error = null) {
  const raw = String(error?.code || error?.message || error || '').toUpperCase();
  if (/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND/.test(raw)) return 'INVALID_CREDENTIALS';
  if (/USERNAME_TAKEN/.test(raw)) return 'USERNAME_TAKEN';
  if (/EMAIL_EXISTS/.test(raw)) return 'EMAIL_ALREADY_EXISTS';
  if (/INVALID_EMAIL/.test(raw)) return 'INVALID_EMAIL';
  if (/WEAK_PASSWORD/.test(raw)) return 'WEAK_PASSWORD';
  if (/TOO_MANY_ATTEMPTS/.test(raw)) return 'RATE_LIMITED';
  if (/USER_DISABLED/.test(raw)) return 'ACCOUNT_LOCKED';
  if (/AUTH_REQUIRED/.test(raw)) return 'AUTH_REQUIRED';
  return 'AUTH_SERVICE_UNAVAILABLE';
}

async function firebaseIdentityRequest(action, payload = {}) {
  const apiKey = String(env.firebase?.publicConfig?.apiKey || '').trim();
  if (!apiKey) {
    const error = new Error('PUBLIC_FIREBASE_API_KEY_MISSING');
    error.code = 'AUTH_SERVICE_UNAVAILABLE';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${FIREBASE_IDENTITY_BASE}/accounts:${action}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      const error = new Error(data?.error?.message || `IDENTITY_HTTP_${response.status}`);
      error.code = authErrorCode(data?.error?.message || error.message);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function issueSession(res, idToken = '') {
  const created = await createSessionCookie(idToken);
  res.setHeader('Set-Cookie', sessionCookieHeader(created.sessionCookie));
  res.setHeader('Cache-Control', 'no-store');
  return publicUser(created.decoded);
}

router.get('/public/runtime-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({ ok: true, ...env.publicRuntimeConfig(), code: 'SUCCESS', message: '' });
});

router.post('/auth/session', strictLimiter, async (req, res) => {
  try {
    const authorization = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const idToken = authorization || String(req.body?.idToken || req.body?.token || '').trim();
    if (!idToken) return response(res, 401, { code: 'AUTH_REQUIRED' });
    const user = await issueSession(res, idToken);
    return response(res, 200, { ok: true, data: { user, expiresInMs: 7 * 24 * 60 * 60 * 1000 }, code: 'SUCCESS' });
  } catch (error) {
    return response(res, error?.status === 429 ? 429 : 401, { code: authErrorCode(error) });
  }
});

router.get('/auth/session', strictLimiter, async (req, res) => {
  try {
    const decoded = await verifyRequestSession(req, { checkRevoked: true });
    res.setHeader('Cache-Control', 'no-store');
    return response(res, 200, { ok: true, data: { user: publicUser(decoded) }, code: 'SUCCESS' });
  } catch (_) {
    res.setHeader('Set-Cookie', clearSessionCookieHeader());
    return response(res, 401, { code: 'AUTH_REQUIRED' });
  }
});

router.post('/auth/login', strictLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return response(res, 400, { code: 'VALIDATION_ERROR' });
    const result = await firebaseIdentityRequest('signInWithPassword', { email, password, returnSecureToken: true });
    const user = await issueSession(res, result.idToken);
    return response(res, 200, { ok: true, data: { user }, code: 'SUCCESS' });
  } catch (error) {
    const code = authErrorCode(error);
    const status = code === 'RATE_LIMITED' ? 429 : code === 'AUTH_SERVICE_UNAVAILABLE' ? 503 : 401;
    return response(res, status, { code });
  }
});

router.post('/auth/register', strictLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const username = normalizeUsername(req.body?.username || req.body?.displayName || '');
    const firstName = String(req.body?.firstName || '').trim().slice(0, 50);
    const lastName = String(req.body?.lastName || '').trim().slice(0, 50);
    const displayName = username;
    if (!email || !password || !username || !firstName || !lastName) return response(res, 400, { code: 'VALIDATION_ERROR' });
    if (!validUsername(username)) return response(res, 400, { code: 'INVALID_USERNAME' });
    if (!validPersonName(firstName) || !validPersonName(lastName)) return response(res, 400, { code: 'INVALID_PERSON_NAME' });
    if (req.body?.acceptedTerms !== true || req.body?.acceptedKvkk !== true || req.body?.acceptedMcVirtualPoints !== true) {
      return response(res, 400, { code: 'CONSENT_REQUIRED' });
    }
    const dob = assertDateOfBirthInput(req.body?.dateOfBirth || { year: req.body?.birthYear, month: req.body?.birthMonth, day: req.body?.birthDay });
    if (!dob.ok) return response(res, dob.code === 'AGE_RESTRICTED' ? 403 : 400, { code: dob.code || 'DATE_OF_BIRTH_REQUIRED' });
    const { db, auth } = initFirebaseAdmin();
    if (db && await usernameExists(db, username.toLocaleLowerCase('tr-TR'))) return response(res, 409, { code: 'USERNAME_TAKEN' });
    const result = await firebaseIdentityRequest('signUp', { email, password, displayName, returnSecureToken: true });
    const user = await issueSession(res, result.idToken);
    try {
      var profileState = await persistRegistrationProfile({ uid: user.uid || result.localId, email, username, firstName, lastName, dob });
    } catch (profileError) {
      if (auth && (user.uid || result.localId)) await auth.deleteUser(user.uid || result.localId).catch(() => null);
      res.setHeader('Set-Cookie', clearSessionCookieHeader());
      throw profileError;
    }
    firebaseIdentityRequest('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: result.idToken }).catch(() => null);
    return response(res, 201, { ok: true, data: { user: { ...user, username, displayName: username }, dateOfBirth: dob.dateOfBirth, age: dob.age, ageVerified: true, profilePersisted: profileState?.persisted === true }, code: 'SUCCESS' });
  } catch (error) {
    const code = authErrorCode(error);
    const status = ['EMAIL_ALREADY_EXISTS', 'USERNAME_TAKEN'].includes(code) ? 409 : code === 'RATE_LIMITED' ? 429 : code === 'AUTH_SERVICE_UNAVAILABLE' ? 503 : 400;
    return response(res, status, { code });
  }
});

router.post('/auth/logout', async (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookieHeader());
  res.setHeader('Cache-Control', 'no-store');
  return response(res, 200, { ok: true, data: null, code: 'SUCCESS' });
});

router.get('/auth/me', requireAuth, (req, res) => response(res, 200, { ok: true, data: { user: publicUser(req.user || {}) }, code: 'SUCCESS' }));

module.exports = router;
