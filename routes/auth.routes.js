'use strict';

const express = require('express');
const router = express.Router();

const { db } = require('../config/firebase');
const { verifyAuth, extractSessionToken, resolveOptionalAuthUser } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum } = require('../utils/helpers');
const { bootstrapAccountByAuth } = require('../utils/accountBootstrap');
const { logCaughtError } = require('../utils/logger');
const { resolveAdminContext } = require('../middlewares/admin.middleware');
const { normalizeEmail, getPrimaryAdminIdentity, issueStepTicket, verifyStepTicket, verifySecondFactor, verifyThirdFactor, issueClientGateKey, verifyClientGateKey } = require('../utils/adminMatrix');
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


async function findUserUidByEmail(email = '') {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return '';
  try {
    const snap = await colUsers().where('email', '==', safeEmail).limit(1).get();
    if (!snap.empty) return cleanStr(snap.docs[0]?.id || '', 160);
  } catch (error) {
    logCaughtError('auth.find_user_by_email', error, { email: safeEmail });
  }
  return '';
}

async function findAdminMemberUidByEmail(email = '') {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return '';
  try {
    const snap = await db.collection('admin_members').where('email', '==', safeEmail).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return cleanStr(doc.data()?.uid || doc.id || '', 160);
    }
  } catch (error) {
    logCaughtError('auth.find_admin_member_by_email', error, { email: safeEmail });
  }
  return '';
}

function serializeAdminContext(context = {}) {
  return {
    role: cleanStr(context.role || 'admin', 32),
    roles: Array.isArray(context.roles) ? context.roles : [],
    permissions: Array.isArray(context.permissions) ? context.permissions : [],
    source: cleanStr(context.source || 'resolved', 64),
    resolutionChain: Array.isArray(context?.metadata?.resolutionChain) ? context.metadata.resolutionChain : []
  };
}

async function resolveAdminIdentityFromRequest(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  let user = null;

  if (authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await verifyFirebaseBearerToken(authHeader.slice(7).trim());
      user = {
        uid: cleanStr(decoded?.uid || '', 160),
        email: normalizeEmail(decoded?.email || ''),
        claims: decoded || {},
        sessionId: ''
      };
    } catch (error) {
      logCaughtError('auth.resolve_admin_identity.bearer', error, { requestId: req.requestId || null });
    }
  }

  if (!user?.uid) {
    try {
      const optionalUser = await resolveOptionalAuthUser(req);
      if (optionalUser?.uid) {
        user = {
          uid: cleanStr(optionalUser.uid || '', 160),
          email: normalizeEmail(optionalUser.email || ''),
          claims: optionalUser?.claims || {},
          sessionId: cleanStr(optionalUser.sessionId || '', 160)
        };
      }
    } catch (error) {
      logCaughtError('auth.resolve_admin_identity.optional', error, { requestId: req.requestId || null });
    }
  }

  if (!user?.uid) {
    return { ok: false, authenticated: false, admin: false, user: null, adminContext: null };
  }

  const adminContext = await resolveAdminContext(user);
  return {
    ok: true,
    authenticated: true,
    admin: !!adminContext?.isAdmin,
    user: {
      uid: cleanStr(user.uid || '', 160),
      email: normalizeEmail(user.email || '')
    },
    adminContext: adminContext?.isAdmin ? serializeAdminContext(adminContext) : null,
    claims: user.claims || {},
    sessionId: cleanStr(user.sessionId || '', 160)
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
  } catch (error) {
    logCaughtError('auth.resolve_login', error, { requestId: req.requestId || null, route: req.originalUrl || req.url || '' }, 'error');
    return res.status(500).json({ ok: false, error: 'Giriş çözümleme hatası.', requestId: req.requestId || null });
  }
});

router.post('/auth/session/create', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) {
      res.locals.errorLogged = true;
      return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', error: 'Kimlik doğrulama gerekli.' });
    }
    const decoded = await verifyFirebaseBearerToken(authHeader.slice(7).trim());
    const bootstrap = await bootstrapAccountByAuth({
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: !!decoded.email_verified,
      referenceId: 'auth_session_create'
    });
    const session = await createServerSession({
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: !!decoded.email_verified,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      source: 'firebase_id_token'
    });
    await touchUserActivity(decoded.uid, { scope: 'session_create', login: true, sessionId: session.sessionId, status: 'ACTIVE', activity: 'login' });
    res.setHeader('Set-Cookie', buildSessionCookie(session.token, { secure: req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' }));

    return res.json({
      ok: true,
      session: {
        id: session.sessionId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
        ttlMs: SESSION_TTL_MS
      },
      rewardBootstrap: {
        signupGranted: !!bootstrap.grantedSignupReward,
        emailGranted: !!bootstrap.grantedEmailReward,
        emailRewardBlocked: !!bootstrap.emailRewardBlocked
      }
    });
  } catch (error) {
    const code = String(error?.code || '');
    const isTemporaryAuthBackendError = error?.statusCode === 503
      || code === 'FIREBASE_ADMIN_UNAVAILABLE'
      || code === 'PUBLIC_FIREBASE_API_KEY_MISSING'
      || code === 'FIREBASE_REST_AUTH_NETWORK';
    if (isTemporaryAuthBackendError) {
      return res.status(503).json({
        ok: false,
        code: code || 'AUTH_BACKEND_TEMPORARILY_UNAVAILABLE',
        error: 'Sunucu kimlik doğrulama altyapısı geçici olarak kullanılamıyor.'
      });
    }
    res.locals.errorLogged = true;
    return res.status(401).json({ ok: false, code: 'SESSION_CREATE_FAILED', error: 'Oturum oluşturulamadı.' });
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
    if (!sessionToken) return res.json({ ok: true, active: false, session: null });
    const session = await resolveServerSession(sessionToken);
    if (!session?.valid) {
      res.setHeader('Set-Cookie', buildExpiredSessionCookie());
      return res.json({ ok: true, active: false, session: null, code: session?.reason || 'INVALID_SESSION' });
    }
    return res.json({
      ok: true,
      active: true,
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
    return res.status(500).json({ ok: false, error: 'Oturum durumu alınamadı.' });
  }
});




router.post('/auth/admin/matrix/step-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const identity = await resolveAdminIdentityFromRequest(req);

    if (!identity.ok || !identity.authenticated || !identity.user?.uid) {
      return res.status(401).json({ ok: false, error: 'Aktif yönetici oturumu bulunamadı. Önce yönetici hesabıyla giriş yapın.' });
    }

    const authenticatedEmail = normalizeEmail(identity.user?.email || '');
    if (!authenticatedEmail || authenticatedEmail !== email) {
      return res.status(403).json({ ok: false, error: 'Algılanan e-posta aktif oturumla eşleşmiyor.' });
    }

    if (!identity.admin) {
      return res.status(403).json({ ok: false, error: 'Bu aktif oturum için yönetici yetkisi doğrulanamadı.' });
    }

    const context = await resolveAdminContext({
      uid: cleanStr(identity.user.uid || '', 160),
      email: authenticatedEmail,
      claims: identity.claims || {}
    });

    if (!context?.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Bu hesap için aktif yönetici bağlamı çözümlenemedi.' });
    }

    return res.json({
      ok: true,
      boundToSession: true,
      ticket: issueStepTicket({
        uid: cleanStr(context.uid || identity.user.uid || '', 160),
        email: authenticatedEmail,
        role: context.role,
        roles: context.roles,
        permissions: context.permissions,
        source: context.source,
        resolutionChain: Array.isArray(context?.metadata?.resolutionChain) ? context.metadata.resolutionChain : [],
        stage: 2,
        prev: 'session_bound_identity'
      }),
      admin: serializeAdminContext(context)
    });
  } catch (_error) {
    return res.status(400).json({ ok: false, error: 'Yönetici hesabı doğrulanamadı.' });
  }
});

router.post('/auth/admin/matrix/step-password', async (req, res) => {
  try {
    const verified = verifyStepTicket(req.body?.ticket || '', 2);
    if (!verified.ok) return res.status(401).json({ ok: false, error: 'Güvenlik oturumu geçersiz.' });
    const password = String(req.body?.password || '');
    if (!verifySecondFactor(password)) {
      return res.status(403).json({ ok: false, error: 'Güvenlik şifresi doğrulanamadı.' });
    }
    return res.json({ ok: true, ticket: issueStepTicket({ ...verified.payload, stage: 3, prev: 'identity+password' }) });
  } catch (_error) {
    return res.status(400).json({ ok: false, error: 'Şifre doğrulanamadı.' });
  }
});

router.post('/auth/admin/matrix/step-name', async (req, res) => {
  try {
    const verified = verifyStepTicket(req.body?.ticket || '', 3);
    if (!verified.ok) return res.status(401).json({ ok: false, error: 'Güvenlik oturumu geçersiz.' });
    const adminName = String(req.body?.adminName || req.body?.name || '');
    if (!verifyThirdFactor(adminName)) {
      return res.status(403).json({ ok: false, error: 'Son güvenlik doğrulaması başarısız oldu.' });
    }

    const uid = cleanStr(verified.payload?.uid || '', 160);
    const email = normalizeEmail(verified.payload?.email || '');
    if (!uid || !email) {
      return res.status(400).json({ ok: false, error: 'Yönetici kimliği eksik. Lütfen işlemi yeniden başlatın.' });
    }

    const context = await resolveAdminContext({ uid, email, claims: {} });
    if (!context?.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Bu hesap için aktif yönetici yetkisi bulunamadı.' });
    }

    const session = await createServerSession({
      uid,
      email,
      emailVerified: true,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      source: 'admin_matrix'
    });

    await touchUserActivity(uid, {
      scope: 'admin_matrix',
      login: true,
      sessionId: session.sessionId,
      status: 'ACTIVE',
      activity: 'admin'
    }).catch(() => null);

    res.setHeader('Set-Cookie', buildSessionCookie(session.token, {
      secure: req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'
    }));

    const clientKey = issueClientGateKey({ uid, email, sessionId: session.sessionId });
    return res.json({
      ok: true,
      redirectTo: '/admin/admin.html',
      clientKey,
      admin: serializeAdminContext(context)
    });
  } catch (_error) {
    return res.status(400).json({ ok: false, error: 'Yönetici girişi tamamlanamadı.' });
  }
});


router.get('/auth/admin/matrix/identity', async (req, res) => {
  try {
    const identity = await resolveAdminIdentityFromRequest(req);
    if (!identity.ok || !identity.authenticated) {
      return res.status(401).json({ ok: false, authenticated: false, admin: false, user: null, error: 'Aktif oturum bulunamadı.' });
    }
    if (!identity.admin) {
      return res.status(403).json({
        ok: false,
        authenticated: true,
        admin: false,
        user: identity.user,
        adminContext: null,
        error: 'Bu hesap için yönetici yetkisi bulunamadı.'
      });
    }
    return res.json({
      ok: true,
      authenticated: true,
      admin: true,
      user: identity.user,
      adminContext: identity.adminContext
    });
  } catch (_error) {
    return res.status(500).json({ ok: false, authenticated: false, admin: false, error: 'Yönetici kimliği çözümlenemedi.' });
  }
});

router.get('/auth/admin/matrix/status', async (req, res) => {
  try {
    const optionalUser = await resolveOptionalAuthUser(req);
    if (!optionalUser?.uid) {
      return res.status(401).json({ ok: false, authenticated: false, redirectTo: '/admin/index.html', error: 'Yönetici oturumu bulunamadı.' });
    }

    const context = await resolveAdminContext({
      uid: cleanStr(optionalUser.uid || '', 160),
      email: normalizeEmail(optionalUser.email || ''),
      claims: optionalUser?.claims || {}
    });

    if (!context?.isAdmin) {
      return res.status(403).json({ ok: false, authenticated: false, redirectTo: '/admin/index.html', error: 'Yönetici yetkisi doğrulanamadı.' });
    }

    const clientKey = cleanStr(req.headers['x-admin-client-key'] || req.query?.clientKey || '', 2000);
    const clientKeyState = verifyClientGateKey(clientKey);
    const currentSessionId = cleanStr(optionalUser.sessionId || '', 160);
    const clientKeyMatches = !!(clientKeyState.ok
      && clientKeyState.payload.uid === cleanStr(context.uid || '', 160)
      && normalizeEmail(clientKeyState.payload.email || '') === normalizeEmail(context.email || '')
      && (!currentSessionId || clientKeyState.payload.sessionId === currentSessionId));

    const refreshedClientKey = clientKeyMatches
      ? ''
      : issueClientGateKey({ uid: context.uid, email: context.email, sessionId: currentSessionId });

    return res.json({
      ok: true,
      authenticated: true,
      user: { uid: context.uid, email: context.email },
      admin: serializeAdminContext(context),
      clientKey: refreshedClientKey || undefined
    });
  } catch (_error) {
    return res.status(401).json({ ok: false, authenticated: false, redirectTo: '/admin/index.html', error: 'Yönetici doğrulaması tamamlanamadı.' });
  }
});

router.post('/auth/admin/matrix/logout', async (req, res) => {
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

router.post('/auth/admin/bootstrap', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Kimlik doğrulama gerekli.' });
    }

    const decoded = await verifyFirebaseBearerToken(authHeader.slice(7).trim());
    const user = {
      uid: cleanStr(decoded?.uid || '', 160),
      email: cleanStr(decoded?.email || '', 200).toLowerCase()
    };

    const adminContext = await resolveAdminContext({ ...user, claims: decoded || {} });
    if (!adminContext?.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Bu hesap için aktif yönetici yetkisi bulunamadı.' });
    }

    const session = await createServerSession({
      uid: user.uid,
      email: user.email,
      emailVerified: !!decoded.email_verified,
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

    return res.json({
      ok: true,
      admin: {
        uid: user.uid,
        email: user.email,
        ...serializeAdminContext(adminContext)
      },
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
    return res.status(401).json({ ok: false, error: 'Admin oturumu oluşturulamadı.' });
  }
});

router.get('/auth/admin/status', verifyAuth, async (req, res) => {
  try {
    const user = {
      uid: cleanStr(req.user?.uid || '', 160),
      email: cleanStr(req.user?.email || '', 200).toLowerCase()
    };

    const adminContext = await resolveAdminContext({ ...user, claims: req.user?.claims || {} });

    return res.json({
      ok: true,
      authenticated: !!user.uid,
      admin: !!adminContext?.isAdmin,
      user: {
        uid: user.uid,
        email: user.email
      },
      adminContext: adminContext?.isAdmin ? serializeAdminContext(adminContext) : null
    });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Admin durum bilgisi alınamadı.' });
  }
});

module.exports = router;
