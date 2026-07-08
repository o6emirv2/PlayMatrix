const express = require('express');
const { requireAuth, strictLimiter } = require('../core/security');
const { runtimeStore } = require('../core/runtimeStore');
const { asEmail } = require('../core/validation');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const env = require('../config/env');

const router = express.Router();

function parseEmail(value) {
  try { return asEmail(value); } catch (_) { return ''; }
}
function optionalContinueUrl() {
  return String(process.env.FIREBASE_EMAIL_CONTINUE_URL || '').trim().replace(/\/$/, '');
}
function firebaseWebApiKey() {
  return String(process.env.FIREBASE_WEB_API_KEY || process.env.PUBLIC_FIREBASE_API_KEY || env?.firebase?.publicConfig?.apiKey || '').trim();
}
function friendlyFirebaseEmailError(payload = {}) {
  const raw = String(payload?.error?.message || payload?.error || '').toUpperCase();
  if (raw.includes('TOO_MANY_ATTEMPTS')) return { status: 429, error: 'EMAIL_TOO_MANY_ATTEMPTS', message: 'Çok fazla e-posta denemesi yapıldı. Bir süre sonra tekrar dene.' };
  if (raw.includes('EMAIL_EXISTS')) return { status: 409, error: 'EMAIL_ALREADY_IN_USE', message: 'Bu e-posta başka bir hesapta kullanılıyor.' };
  if (raw.includes('INVALID_ID_TOKEN') || raw.includes('USER_NOT_FOUND')) return { status: 401, error: 'AUTH_REQUIRED', message: 'Devam etmek için tekrar giriş yapman gerekiyor.' };
  if (raw.includes('INVALID_EMAIL')) return { status: 400, error: 'EMAIL_INVALID', message: 'E-posta adresi geçersiz.' };
  if (raw.includes('DOMAIN_NOT_ALLOWED') || raw.includes('INVALID_CONTINUE_URI')) return { status: 400, error: 'EMAIL_CONTINUE_URL_NOT_ALLOWED', message: 'E-posta bağlantısı alan adı ayarı nedeniyle gönderilemedi.' };
  return { status: 503, error: 'EMAIL_LINK_DELIVERY_FAILED', message: 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.' };
}
async function sendFirebaseOobCode(body = {}) {
  const key = firebaseWebApiKey();
  if (!key) return { ok: false, status: 503, error: 'EMAIL_LINK_DELIVERY_FAILED', message: 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.' };
  const continueUrl = optionalContinueUrl();
  const payloadBody = { canHandleCodeInApp: false, ...body };
  if (continueUrl) payloadBody.continueUrl = continueUrl;
  const send = async (bodyPayload) => {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };
  let { response, payload } = await send(payloadBody);
  const rawCode = String(payload?.error?.message || '').toUpperCase();
  if ((!response.ok || payload?.error) && payloadBody.continueUrl && (rawCode.includes('DOMAIN_NOT_ALLOWED') || rawCode.includes('INVALID_CONTINUE_URI'))) {
    const retryBody = { ...payloadBody };
    delete retryBody.continueUrl;
    ({ response, payload } = await send(retryBody));
  }
  if (!response.ok || payload?.error) return { ok: false, ...friendlyFirebaseEmailError(payload), rawCode: payload?.error?.message || '' };
  return { ok: true, payload };
}
async function updateUserProfile(uid, patch) {
  const { db } = initFirebaseAdmin();
  if (db && uid) await db.collection('users').doc(uid).set({ ...patch, updatedAt: Date.now() }, { merge: true });
}
function respondEmailFailure(res, result = {}) {
  return res.status(Number(result.status || 503)).json({
    ok: false,
    error: result.error || 'EMAIL_LINK_DELIVERY_FAILED',
    message: result.message || 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.'
  });
}

router.post('/email/send-verification', strictLimiter, requireAuth, async (req, res) => {
  const email = parseEmail(req.user?.email || req.body?.email || '');
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID', message: 'E-posta adresi geçersiz.' });
  try {
    const uid = String(req.user?.uid || '');
    const verified = !!(req.user?.email_verified || req.user?.emailVerified);
    if (verified) {
      await updateUserProfile(uid, { email, emailVerified: true, emailVerifiedAt: Date.now() });
      return res.json({ ok: true, alreadyVerified: true, email, message: 'E-postan zaten doğrulanmış.' });
    }
    const idToken = String(req.firebaseIdToken || '').trim();
    if (!idToken) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED', message: 'Devam etmek için tekrar giriş yapman gerekiyor.' });
    const result = await sendFirebaseOobCode({ requestType: 'VERIFY_EMAIL', idToken });
    if (!result.ok) return respondEmailFailure(res, result);
    await updateUserProfile(uid, { email, emailVerified: false, emailVerificationLinkSentAt: Date.now() });
    return res.json({ ok: true, linkSent: true, email, message: 'E-posta doğrulama bağlantısı gönderildi.' });
  } catch (error) {
    console.error('[email:verification:error]', { email: email.replace(/^(.{2}).*(@.*)$/,'$1***$2'), message: error?.message || String(error) });
    return respondEmailFailure(res);
  }
});

router.post('/email/change-link', strictLimiter, requireAuth, async (req, res) => {
  const email = parseEmail(req.body.email || req.body.newEmail || '');
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID', message: 'E-posta adresi geçersiz.' });
  try {
    const currentEmail = parseEmail(req.user?.email || '');
    if (email === currentEmail) return res.status(400).json({ ok: false, error: 'EMAIL_SAME_AS_CURRENT', message: 'Yeni e-posta mevcut e-posta adresinle aynı olamaz.' });
    if (!(req.user?.email_verified || req.user?.emailVerified)) return res.status(403).json({ ok: false, error: 'EMAIL_VERIFICATION_REQUIRED', message: 'E-posta güncellemeden önce mevcut e-postanı doğrulaman gerekiyor.' });
    const idToken = String(req.firebaseIdToken || '').trim();
    if (!idToken) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED', message: 'Devam etmek için tekrar giriş yapman gerekiyor.' });
    const result = await sendFirebaseOobCode({ requestType: 'VERIFY_AND_CHANGE_EMAIL', idToken, newEmail: email });
    if (!result.ok) return respondEmailFailure(res, result);
    runtimeStore.temporary.set(`email-change:${req.user.uid}`, { uid: req.user.uid, email, previousEmail: currentEmail, at: Date.now() }, 60 * 60 * 1000);
    await updateUserProfile(req.user.uid, { pendingEmail: email, emailChangeLinkSentAt: Date.now() });
    return res.json({ ok: true, linkSent: true, email, message: 'E-posta güncelleme bağlantısı gönderildi.' });
  } catch (error) {
    console.error('[email:change:error]', { email: email.replace(/^(.{2}).*(@.*)$/,'$1***$2'), message: error?.message || String(error) });
    return respondEmailFailure(res);
  }
});

module.exports = router;
