'use strict';

const { db } = require('../config/firebase');
const {
  parseCookieHeader,
  buildExpiredSessionCookie,
  resolveServerSession,
  touchServerSession,
  touchUserActivity,
  verifyFirebaseBearerToken,
  IDLE_TIMEOUT_MS
} = require('../utils/activity');
const { cleanStr, safeNum, nowMs } = require('../utils/helpers');

const colUsers = () => db.collection('users');

function extractBearerToken(req) {
  const h = String(req.headers.authorization || '').trim();
  if (!h.startsWith('Bearer ')) return '';
  return h.slice(7).trim();
}

function extractSessionToken(req) {
  const headerToken = cleanStr(req.headers['x-session-token'] || '', 400);
  if (headerToken) return headerToken;
  const cookies = parseCookieHeader(req.headers.cookie || '');
  return cleanStr(cookies.pm_session || '', 400);
}

function clearSessionCookieIfPossible(res) {
  try {
    res.setHeader('Set-Cookie', buildExpiredSessionCookie());
  } catch (_) {}
}

async function ensureUserIsActive(uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return { ok: false, reason: 'NO_UID' };
  const snap = await colUsers().doc(safeUid).get().catch(() => null);
  if (!snap?.exists) return { ok: true, userData: null };
  const data = snap.data() || {};
  if (safeNum(data.deletedAt, 0) > 0 || data.disabledAt) return { ok: false, reason: 'ACCOUNT_DISABLED' };
  const lastActiveAt = safeNum(data.lastActiveAt, 0);
  if (lastActiveAt > 0 && (nowMs() - lastActiveAt) > IDLE_TIMEOUT_MS) {
    return { ok: false, reason: 'IDLE_TIMEOUT', userData: data };
  }
  return { ok: true, userData: data };
}

async function hydrateRequestUser(req, tokenUser, extras = {}) {
  req.user = {
    ...tokenUser,
    claims: tokenUser?.claims || tokenUser || {},
    authType: cleanStr(extras.authType || 'bearer', 24),
    sessionId: cleanStr(extras.sessionId || '', 160)
  };

  const jobs = [];
  if (extras.touchActivity) {
    jobs.push(touchUserActivity(req.user.uid, {
      scope: extras.authType || 'bearer',
      login: !!extras.login,
      sessionId: extras.sessionId || '',
      status: 'IDLE'
    }));
  }
  if (extras.touchSession && extras.sessionRef) {
    jobs.push(touchServerSession(extras.sessionRef, { ip: req.ip || '', userAgent: req.headers['user-agent'] || '' }));
  }
  if (jobs.length) Promise.allSettled(jobs).catch(() => null);
}

async function verifyAuth(req, res, next) {
  const bearerToken = extractBearerToken(req);
  const sessionToken = extractSessionToken(req);

  try {
    if (sessionToken) {
      const session = await resolveServerSession(sessionToken);
      if (session?.valid) {
        const user = {
          uid: cleanStr(session.data.uid || '', 160),
          email: cleanStr(session.data.email || '', 200),
          email_verified: !!session.data.emailVerified,
          admin: false,
          claims: {}
        };
        const activeState = await ensureUserIsActive(user.uid);
        if (!activeState.ok) {
          clearSessionCookieIfPossible(res);
          return res.status(401).json({ ok: false, redirect: true, code: activeState.reason, error: 'Oturum süresi doldu.' });
        }
        await hydrateRequestUser(req, user, { authType: 'session', sessionId: session.id, sessionRef: session.ref });
        return next();
      }
      clearSessionCookieIfPossible(res);
      if (!bearerToken) {
        return res.status(401).json({ ok: false, redirect: true, code: session?.reason || 'INVALID_SESSION', error: 'Geçersiz oturum.' });
      }
    }

    if (!bearerToken) {
      return res.status(401).json({ ok: false, redirect: true, error: 'Oturum yok.' });
    }

    const decoded = await verifyFirebaseBearerToken(bearerToken);
    const activeState = await ensureUserIsActive(decoded.uid);
    if (!activeState.ok) {
      return res.status(401).json({ ok: false, redirect: true, code: activeState.reason, error: 'Oturum zaman aşımına uğradı.' });
    }

    await hydrateRequestUser(req, decoded, { authType: 'bearer' });
    return next();
  } catch (error) {
    clearSessionCookieIfPossible(res);
    return res.status(401).json({ ok: false, redirect: true, error: 'Geçersiz token.' });
  }
}

async function resolveOptionalAuthUser(req) {
  const sessionToken = extractSessionToken(req);
  if (sessionToken) {
    const session = await resolveServerSession(sessionToken).catch(() => null);
    if (session?.valid) {
      return {
        uid: cleanStr(session.data.uid || '', 160),
        email: cleanStr(session.data.email || '', 200),
        email_verified: !!session.data.emailVerified,
        authType: 'session',
        sessionId: cleanStr(session.id || '', 160)
      };
    }
  }

  const bearerToken = extractBearerToken(req);
  if (!bearerToken) return null;
  try {
    const decoded = await verifyFirebaseBearerToken(bearerToken);
    return { ...decoded, authType: 'bearer' };
  } catch (_) {
    return null;
  }
}

async function tryVerifyOptionalAuth(req, _res, next) {
  try {
    const optionalUser = await resolveOptionalAuthUser(req);
    if (optionalUser) {
      req.user = {
        ...optionalUser,
        claims: optionalUser?.claims || optionalUser || {},
        authType: cleanStr(optionalUser.authType || 'optional', 24),
        sessionId: cleanStr(optionalUser.sessionId || '', 160)
      };
    }
  } catch (_) {}
  return next();
}

module.exports = {
  verifyAuth,
  tryVerifyOptionalAuth,
  resolveOptionalAuthUser,
  extractBearerToken,
  extractSessionToken
};
