'use strict';

const express = require('express');
const router = express.Router();

const { db } = require('../config/firebase');
const { verifyAuth, tryVerifyOptionalAuth, extractSessionToken, extractBearerToken } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum } = require('../utils/helpers');
const { isAdminUser, getAdminMatchDiagnostics } = require('../middlewares/admin.middleware');
const { sendApiSuccess, sendApiError } = require('../utils/apiResponse');
const {
  buildSessionCookie,
  buildExpiredSessionCookie,
  createServerSession,
  revokeServerSessionByToken,
  resolveServerSession,
  touchUserActivity,
  verifyFirebaseBearerToken,
  IDLE_TIMEOUT_MS,
  SESSION_TTL_MS
} = require('../utils/activity');

const colUsers = () => db.collection('users');

function normalizeOriginValue(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getRequestOriginInfo(req) {
  const protocol = normalizeOriginValue(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')) || 'http';
  const host = normalizeOriginValue(req.headers['x-forwarded-host'] || req.headers.host || '');
  const requestOrigin = normalizeOriginValue(req.headers.origin || '');
  const serverOrigin = host ? `${protocol}://${host}` : '';
  const sameOrigin = !!requestOrigin && !!serverOrigin && requestOrigin === serverOrigin;
  const secureRequest = protocol === 'https';
  return {
    requestOrigin,
    serverOrigin,
    sameOrigin,
    secureRequest,
    cookieBootstrapSupported: sameOrigin,
    recommendedMode: sameOrigin ? 'cookie_session' : 'bearer_header'
  };
}

function buildAdminSecurityState(req, user = {}, extras = {}) {
  const diagnostics = getAdminMatchDiagnostics(user);
  const originInfo = getRequestOriginInfo(req);
  const sessionToken = extractSessionToken(req);
  const bearerToken = extractBearerToken(req);
  const authMode = cleanStr(extras.authMode || (sessionToken ? 'session' : (bearerToken ? 'bearer' : 'none')), 32);
  return {
    authMode,
    secureRequest: originInfo.secureRequest,
    sameOrigin: originInfo.sameOrigin,
    cookieBootstrapSupported: originInfo.cookieBootstrapSupported,
    sessionCookiePresented: !!sessionToken,
    bearerPresented: !!bearerToken,
    envReady: !!(diagnostics?.configured?.uidConfigured || diagnostics?.configured?.emailConfigured),
    requiresUidMatch: !!diagnostics?.configured?.uidConfigured,
    requiresEmailMatch: !!diagnostics?.configured?.emailConfigured,
    recommendedMode: originInfo.recommendedMode,
    adminAllowlistMode: diagnostics?.match?.source || 'none',
    manualTokenPersistence: 'memory_only',
    cookie: {
      name: 'pm_session',
      sameSite: 'Lax',
      httpOnly: true,
      secureByDefault: true
    }
  };
}

router.post('/auth/resolve-login', profileLimiter, async (req, res) => {
  try {
    const identifier = cleanStr(req.body?.identifier || req.body?.email || '', 160).trim().toLowerCase();
    if (!identifier) return res.status(400).json({ ok: false, error: 'Geçersiz giriş.' });

    if (identifier.includes('@')) return res.json({ ok: true, email: identifier });

    const unameSnap = await db.collection('usernames').doc(identifier).get();
    if (!unameSnap.exists) return res.status(400).json({ ok: false, error: 'Geçersiz giriş.' });
    const uid = cleanStr(unameSnap.data()?.uid || '', 160);
    if (!uid) return res.status(400).json({ ok: false, error: 'Geçersiz giriş.' });

    const userSnap = await colUsers().doc(uid).get();
    const email = cleanStr(userSnap.data()?.email || '', 200).toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'Geçersiz giriş.' });

    return res.json({ ok: true, email });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Giriş çözümleme hatası.' });
  }
});

router.post('/auth/session/create', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) return sendApiError(req, res, 401, 'Kimlik doğrulama gerekli.', { code: 'AUTH_REQUIRED', retryable: false });
    const decoded = await verifyFirebaseBearerToken(authHeader.slice(7).trim());
    const session = await createServerSession({
      uid: decoded.uid,
      email: decoded.email || '',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      source: 'firebase_id_token'
    });
    await touchUserActivity(decoded.uid, { scope: 'session_create', login: true, sessionId: session.sessionId, status: 'ACTIVE', activity: 'login' });
    res.setHeader('Set-Cookie', buildSessionCookie(session.token, { secure: req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' }));
    return sendApiSuccess(req, res, {
      session: {
        id: session.sessionId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
        ttlMs: SESSION_TTL_MS
      }
    });
  } catch (_error) {
    return sendApiError(req, res, 401, 'Oturum oluşturulamadı.', { code: 'SESSION_CREATE_FAILED', retryable: false });
  }
});

router.post('/auth/session/logout', async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (sessionToken) await revokeServerSessionByToken(sessionToken).catch(() => null);
    res.setHeader('Set-Cookie', buildExpiredSessionCookie());
    return res.json({ ok: true });
  } catch (_error) {
    res.setHeader('Set-Cookie', buildExpiredSessionCookie());
    return res.json({ ok: true });
  }
});

router.get('/auth/session/status', async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken) return sendApiSuccess(req, res, { active: false, session: null }, { meta: { authState: 'anonymous' } });
    const session = await resolveServerSession(sessionToken);
    if (!session?.valid) {
      res.setHeader('Set-Cookie', buildExpiredSessionCookie());
      return sendApiSuccess(req, res, { active: false, session: null, code: session?.reason || 'INVALID_SESSION' }, { meta: { authState: 'invalid_session' } });
    }
    return sendApiSuccess(req, res, {
      active: true,
      transport: 'session',
      security: buildAdminSecurityState(req, {
        uid: cleanStr(session.data.uid || '', 160),
        email: cleanStr(session.data.email || '', 200).toLowerCase()
      }, { authMode: 'session' }),
      session: {
        id: session.id,
        uid: session.data.uid,
        email: session.data.email,
        createdAt: safeNum(session.data.createdAt, 0),
        lastSeenAt: safeNum(session.data.lastSeenAt, 0),
        expiresAt: safeNum(session.data.expiresAt, 0),
        idleTimeoutMs: Math.max(IDLE_TIMEOUT_MS, safeNum(session.data.idleTimeoutMs, IDLE_TIMEOUT_MS))
      }
    });
  } catch (_error) {
    return sendApiError(req, res, 500, 'Oturum durumu alınamadı.', { code: 'SESSION_STATUS_FAILED', retryable: true });
  }
});


router.post('/auth/admin/bootstrap', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) {
      return sendApiError(req, res, 401, 'Kimlik doğrulama gerekli.', { code: 'AUTH_REQUIRED', retryable: false });
    }

    const decoded = await verifyFirebaseBearerToken(authHeader.slice(7).trim());
    const user = {
      uid: cleanStr(decoded?.uid || '', 160),
      email: cleanStr(decoded?.email || '', 200).toLowerCase()
    };

    if (!isAdminUser(user)) {
      return sendApiError(req, res, 403, 'Bu hesap admin yetkisine sahip değil.', { code: 'ADMIN_ACCESS_DENIED', retryable: false, details: { diagnostics: getAdminMatchDiagnostics(user), bootstrap: getRequestOriginInfo(req) } });
    }

    const session = await createServerSession({
      uid: user.uid,
      email: user.email,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      source: 'admin_bootstrap'
    });

    await touchUserActivity(user.uid, {
      scope: 'admin_bootstrap',
      login: true,
      sessionId: session.sessionId,
      status: 'ACTIVE',
      activity: 'admin'
    });

    res.setHeader('Set-Cookie', buildSessionCookie(session.token, {
      secure: req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'
    }));

    return sendApiSuccess(req, res, {
      admin: {
        uid: user.uid,
        email: user.email
      },
      diagnostics: getAdminMatchDiagnostics(user),
      bootstrap: getRequestOriginInfo(req),
      security: buildAdminSecurityState(req, user, { authMode: 'bearer_bootstrap' }),
      session: {
        id: session.sessionId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
        ttlMs: SESSION_TTL_MS
      }
    });
  } catch (_error) {
    return sendApiError(req, res, 401, 'Admin oturumu oluşturulamadı.', { code: 'ADMIN_BOOTSTRAP_FAILED', retryable: false });
  }
});

router.get('/auth/admin/status', verifyAuth, async (req, res) => {
  try {
    const user = {
      uid: cleanStr(req.user?.uid || '', 160),
      email: cleanStr(req.user?.email || '', 200).toLowerCase()
    };

    return sendApiSuccess(req, res, {
      authenticated: !!user.uid,
      admin: isAdminUser(user),
      diagnostics: getAdminMatchDiagnostics(user),
      bootstrap: getRequestOriginInfo(req),
      security: buildAdminSecurityState(req, user, { authMode: cleanStr(req.user?.authType || '', 24) || 'session' }),
      transport: cleanStr(req.user?.authType || '', 24) || 'session',
      user: {
        uid: user.uid,
        email: user.email
      }
    });
  } catch (_error) {
    return sendApiError(req, res, 500, 'Admin durum bilgisi alınamadı.', { code: 'ADMIN_STATUS_FAILED', retryable: true });
  }
});


router.get('/auth/admin/diagnostics', async (req, res) => {
  try {
    const optionalUser = await tryVerifyOptionalAuth(req).catch(() => null);
    const user = {
      uid: cleanStr(optionalUser?.uid || '', 160),
      email: cleanStr(optionalUser?.email || '', 200).toLowerCase()
    };

    return sendApiSuccess(req, res, {
      authenticated: !!user.uid,
      admin: !!user.uid && isAdminUser(user),
      diagnostics: getAdminMatchDiagnostics(user),
      bootstrap: getRequestOriginInfo(req),
      security: buildAdminSecurityState(req, user, { authMode: cleanStr(optionalUser?.authType || '', 24) || 'none' }),
      transport: cleanStr(optionalUser?.authType || '', 24) || 'none',
      user: user.uid ? {
        uid: user.uid,
        email: user.email
      } : null
    });
  } catch (_error) {
    return sendApiError(req, res, 500, 'Admin tanı bilgisi alınamadı.', { code: 'ADMIN_DIAGNOSTICS_FAILED', retryable: true });
  }
});

module.exports = router;
