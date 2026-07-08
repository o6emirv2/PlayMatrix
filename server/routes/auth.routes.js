const express = require('express'); const env = require('../config/env'); const { requireAuth, strictLimiter } = require('../core/security');
const { createSessionFromIdToken, sessionCookie, clearSessionCookie, verifyUserSession, revokeSession } = require('../core/userSessionService');
const router = express.Router();
router.get('/public/runtime-config', (req,res)=>res.json({ ok:true, ...env.publicRuntimeConfig(), requestId: req.requestId || null }));
router.get('/auth/me', requireAuth, (req,res)=>res.json({ ok:true, user:req.user }));

router.post('/auth/session', strictLimiter, async (req, res) => {
  try {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const idToken = bearer || String(req.body?.idToken || '').trim();
    const remember = req.body?.remember === true || String(req.body?.persistence || '').toLowerCase() === 'local';
    const created = await createSessionFromIdToken(idToken, { remember });
    if (!created.ok) {
      const status = ['SESSION_SECRET_MISSING','AUTH_UNAVAILABLE'].includes(created.code) ? 503 : 401;
      return res.status(status).json({ ok:false, data:null, message:'', code:created.code, error:created.code });
    }
    res.setHeader('Set-Cookie', sessionCookie(created.token, req, { remember }));
    return res.json({ ok:true, data:{ user:{ uid:created.user.uid, email:created.user.email, emailVerified:created.user.emailVerified }, expiresAt:created.user.exp, remember }, message:'', code:'SUCCESS' });
  } catch (error) {
    const rawCode = String(error?.code || '').toLowerCase();
    const unavailable = /credential|network|unavailable|app\/no-app|project-not-found/.test(rawCode);
    const code = unavailable ? 'AUTH_UNAVAILABLE' : 'AUTH_INVALID';
    console.warn('[auth:session:create:failed]', JSON.stringify({ code, requestId: req.requestId || null }));
    return res.status(unavailable ? 503 : 401).json({ ok:false, data:null, message:'', code, error:code });
  }
});
router.get('/auth/session', async (req, res) => {
  const session = await verifyUserSession(req).catch(() => ({ ok:false, code:'SESSION_INVALID' }));
  if (!session.ok) return res.status(401).json({ ok:false, data:null, message:'', code:session.code || 'SESSION_INVALID', error:session.code || 'SESSION_INVALID' });
  return res.json({ ok:true, data:{ user:{ uid:session.uid, email:session.email, emailVerified:session.emailVerified }, expiresAt:session.exp, remember:!!session.remember }, message:'', code:'SUCCESS' });
});
router.delete('/auth/session', async (req, res) => {
  const session = await verifyUserSession(req).catch(() => null);
  if (session?.ok) await revokeSession(session).catch(() => null);
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  return res.json({ ok:true, data:null, message:'', code:'SUCCESS' });
});
module.exports = router;
