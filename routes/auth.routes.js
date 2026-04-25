'use strict';

const express = require('express');
const router = express.Router();

const { db } = require('../config/firebase');
const { verifyAuth, extractSessionToken } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum } = require('../utils/helpers');
const { isAdminUser } = require('../middlewares/admin.middleware');
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
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Kimlik doğrulama gerekli.' });
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
    return res.json({
      ok: true,
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
    return res.status(401).json({ ok: false, error: 'Oturum oluşturulamadı.' });
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

    if (!isAdminUser(user)) {
      return res.status(403).json({ ok: false, error: 'Bu hesap admin yetkisine sahip değil.' });
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

    return res.json({
      ok: true,
      admin: {
        uid: user.uid,
        email: user.email
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

    return res.json({
      ok: true,
      authenticated: !!user.uid,
      admin: isAdminUser(user),
      user: {
        uid: user.uid,
        email: user.email
      }
    });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Admin durum bilgisi alınamadı.' });
  }
});

module.exports = router;
