const rateLimit = require('express-rate-limit');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const env = require('../config/env');
const { runtimeStore } = require('../core/runtimeStore');
const { readAgeGate } = require('./ageGateService');
const { verifyUserSession } = require('./userSessionService');
const apiLimiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

function isAdminRequest(req) {
  return String(req.originalUrl || req.url || '').includes('/admin');
}
function restrictionTarget(req) {
  const url = String(req.originalUrl || req.url || '').toLowerCase();
  if (url.includes('/api/games') || url.includes('/api/crash') || url.includes('/api/chess') || url.includes('/api/pisti-online')) return 'games_mute';
  if (url.includes('/api/market') || url.includes('/api/marketplace')) return 'market';
  if (url.includes('/api/wheel')) return 'wheel';
  if (url.includes('/api/promo')) return 'promo';
  return '';
}
async function readRestrictionSnapshot(uid) {
  const cacheKey = `restriction:${uid}`;
  const cached = runtimeStore.temporary.get(cacheKey);
  if (cached) return cached;
  const { db } = initFirebaseAdmin();
  if (!db || !uid) return {};
  const snap = await db.collection('users').doc(uid).get().catch(() => null);
  const data = snap?.exists ? (snap.data() || {}) : {};
  const compact = {
    banned: !!data.banned,
    gameRestricted: !!data.gameRestricted,
    gameRestrictedUntil: Number(data.gameRestrictedUntil || 0),
    restrictions: data.restrictions || {}
  };
  runtimeStore.temporary.set(cacheKey, compact, 60000);
  return compact;
}
async function finalizeAuth(req, res, next, user) {
  req.user = user;
  if (isAdminRequest(req)) return next();
  const uid = String(user?.uid || '');
  const restrictions = await readRestrictionSnapshot(uid).catch(() => ({}));
  if (restrictions.banned) return res.status(403).json({ ok:false, error:'USER_BANNED' });
  const target = restrictionTarget(req);
  if (['games_mute', 'market', 'wheel', 'promo'].includes(target)) {
    const gate = await readAgeGate(uid).catch(() => ({ ok: false, code: 'AGE_REQUIRED' }));
    if (!gate.ok) return res.status(gate.code === 'ACCOUNT_LOCKED' ? 423 : 403).json({ ok: false, error: gate.code || 'AGE_REQUIRED', code: gate.code || 'AGE_REQUIRED', data: null, message: '' });
  }
  const active = restrictions.restrictions?.[target];
  const notExpired = !active?.expiresAt || Number(active.expiresAt || 0) > Date.now();
  const flagActive = (flag, until) => !!flag && (!Number(until || 0) || Number(until || 0) > Date.now());
  if ((target === 'games_mute' && flagActive(restrictions.gameRestricted, restrictions.gameRestrictedUntil)) || (active?.active && notExpired)) {
    return res.status(403).json({ ok:false, error:'USER_RESTRICTED', restriction:target || 'restricted' });
  }
  return next();
}
async function requireAuth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const { auth } = initFirebaseAdmin();
    if (auth && token) {
      req.firebaseIdToken = token;
      return finalizeAuth(req, res, next, await auth.verifyIdToken(token));
    }
    const session = await verifyUserSession(req).catch(() => ({ ok:false }));
    if (session?.ok && session.uid) {
      return finalizeAuth(req, res, next, { uid: String(session.uid), email: String(session.email || ''), email_verified: !!session.emailVerified, emailVerified: !!session.emailVerified, sessionId: String(session.sid || '') });
    }
    const devUid = req.headers['x-playmatrix-user'] || req.body?.uid || req.query?.uid;
    if (process.env.NODE_ENV !== 'production' && devUid) return finalizeAuth(req, res, next, { uid: String(devUid), email: 'local@playmatrix.test' });
    return res.status(401).json({ ok: false, data:null, message:'', code:'AUTH_REQUIRED', error: 'AUTH_REQUIRED' });
  } catch (error) { return res.status(401).json({ ok: false, data:null, message:'', code:'AUTH_INVALID', error: 'AUTH_INVALID' }); }
}
function isEnvBootstrapAdmin(uid = '', email = '') {
  const safeUid = String(uid || '').trim();
  const safeEmail = String(email || '').trim().toLowerCase();
  return (!!safeUid && env.adminUids.includes(safeUid)) || (!!safeEmail && env.adminEmails.includes(safeEmail));
}

async function hasFirestoreAdminAllowlistEntries(db) {
  const cacheKey = 'admin-allowlist:has-any';
  const cached = runtimeStore.temporary.get(cacheKey);
  if (cached && Number(cached.expiresAt || 0) > Date.now()) return !!cached.hasAny;
  if (!db) return false;
  const [allowSnap, usersSnap] = await Promise.all([
    db.collection('adminAllowlist').limit(1).get().catch(() => null),
    db.collection('adminUsers').limit(1).get().catch(() => null)
  ]);
  const hasAny = !!((allowSnap && !allowSnap.empty) || (usersSnap && !usersSnap.empty));
  runtimeStore.temporary.set(cacheKey, { hasAny, expiresAt: Date.now() + 60000 }, 65000);
  return hasAny;
}

async function isFirestoreAdmin(uid = '', email = '') {
  const safeUid = String(uid || '').trim();
  const safeEmail = String(email || '').trim().toLowerCase();
  const cacheKey = `admin-allowlist:${safeUid}:${safeEmail}`;
  const cached = runtimeStore.temporary.get(cacheKey);
  if (cached && Number(cached.expiresAt || 0) > Date.now()) return !!cached.allowed;
  const { db } = initFirebaseAdmin();
  if (!db) return false;
  let allowed = false;
  const checks = [];
  if (safeUid) {
    checks.push(db.collection('adminAllowlist').doc(safeUid).get().catch(() => null));
    checks.push(db.collection('adminUsers').doc(safeUid).get().catch(() => null));
  }
  if (safeEmail) {
    checks.push(db.collection('adminAllowlist').doc(safeEmail).get().catch(() => null));
    checks.push(db.collection('adminUsers').doc(safeEmail).get().catch(() => null));
  }
  const snaps = await Promise.all(checks);
  for (const snap of snaps) {
    if (!snap?.exists) continue;
    const data = snap.data?.() || {};
    if (data.disabled === true || data.active === false || data.revoked === true) continue;
    allowed = true;
    break;
  }
  runtimeStore.temporary.set(cacheKey, { allowed, expiresAt: Date.now() + 60000 }, 65000);
  return allowed;
}

async function isAdminPrincipal(uid = '', email = '') {
  const { db } = initFirebaseAdmin();
  if (await isFirestoreAdmin(uid, email)) return true;
  if (!db) return isEnvBootstrapAdmin(uid, email);
  const hasAny = await hasFirestoreAdminAllowlistEntries(db).catch(() => true);
  return !hasAny && isEnvBootstrapAdmin(uid, email);
}

async function requireAdmin(req, res, next) {
  const uid = String(req.user?.uid || '').trim();
  const email = String(req.user?.email || '').trim().toLowerCase();
  try {
    if (await isAdminPrincipal(uid, email)) return next();
    return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
  } catch (_) {
    return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
  }
}
module.exports = { apiLimiter, strictLimiter, requireAuth, requireAdmin, isAdminPrincipal, isEnvBootstrapAdmin };
