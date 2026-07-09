'use strict';

const express = require('express');
const env = require('../config/env');
const { requireAuth, strictLimiter } = require('../core/security');
const {
  trustedOrigin,
  createUserSession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  verifyUserSession
} = require('../core/userSessionService');

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  next();
});

router.get('/public/runtime-config', (req, res) => res.json({ ok: true, ...env.publicRuntimeConfig(), requestId: req.requestId || null }));
router.get('/auth/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user, authSource: req.authSource || 'bearer' }));

router.post('/auth/session', strictLimiter, async (req, res) => {
  if (!trustedOrigin(req)) return res.status(403).json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
  const idToken = String(req.body?.idToken || '').trim();
  if (!idToken) return res.status(400).json({ ok: false, error: 'ID_TOKEN_REQUIRED' });
  try {
    const result = await createUserSession(idToken, req.body?.remember === true);
    res.setHeader('Set-Cookie', sessionCookieHeader(result.sessionCookie, result.remember));
    return res.json({
      ok: true,
      user: { uid: result.decoded.uid || result.decoded.sub, email: result.decoded.email || '', emailVerified: !!result.decoded.email_verified },
      persistent: result.remember,
      expiresIn: result.expiresIn
    });
  } catch (_) {
    res.setHeader('Set-Cookie', clearSessionCookieHeader());
    return res.status(401).json({ ok: false, error: 'AUTH_INVALID' });
  }
});

router.get('/auth/session', async (req, res) => {
  const user = await verifyUserSession(req, { checkRevoked: true }).catch(() => null);
  if (!user?.uid) return res.status(401).json({ ok: false, error: 'SESSION_INVALID' });
  return res.json({ ok: true, authenticated: true, user: { uid: user.uid, email: user.email || '', emailVerified: !!user.email_verified } });
});

router.post('/auth/logout', strictLimiter, (req, res) => {
  if (!trustedOrigin(req)) return res.status(403).json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
  res.setHeader('Set-Cookie', clearSessionCookieHeader());
  return res.json({ ok: true });
});

module.exports = router;
