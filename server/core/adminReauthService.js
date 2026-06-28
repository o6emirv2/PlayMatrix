const crypto = require('crypto');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const env = require('../config/env');

const SECRET_KEY_PATTERN = /(token|secret|password|pass|private|key|authorization|cookie|serviceAccount|hash|salt|thirdFactor|firebase_key|admin_panel|session)/i;

function sanitizeAuditValue(value, depth = 0) {
  if (depth > 4) return '[TRUNCATED]';
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 80)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[MASKED]' : sanitizeAuditValue(entry, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

function readReauthPassword(req) {
  const body = req.body || {};
  return String(
    body.adminPassword ||
    body.reauthPassword ||
    body.confirmPassword ||
    req.headers['x-admin-reauth'] ||
    ''
  );
}

function adminIdentity(req) {
  return {
    uid: String(req.user?.uid || req.headers['x-admin-uid'] || '').trim(),
    email: String(req.user?.email || req.headers['x-admin-email'] || '').trim().toLowerCase()
  };
}

async function verifyFirebasePassword({ email, password }) {
  const apiKey = String(env.firebase?.publicConfig?.apiKey || process.env.FIREBASE_WEB_API_KEY || process.env.PUBLIC_FIREBASE_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'ADMIN_REAUTH_CONFIG_MISSING' };
  if (!email || !password) return { ok: false, error: 'ADMIN_REAUTH_REQUIRED' };
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
  let response;
  let payload = null;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false })
    });
    payload = await response.json().catch(() => null);
  } catch (_) {
    return { ok: false, error: 'ADMIN_REAUTH_UNAVAILABLE' };
  }
  if (!response.ok || !payload?.localId) return { ok: false, error: 'ADMIN_REAUTH_INVALID' };
  return { ok: true, uid: String(payload.localId || ''), email: String(payload.email || email).toLowerCase() };
}

async function verifyAdminReauth(req) {
  const { uid, email } = adminIdentity(req);
  const password = readReauthPassword(req);
  if (!uid || !email) return { ok: false, error: 'ADMIN_REAUTH_REQUIRED' };
  const result = await verifyFirebasePassword({ email, password });
  if (!result.ok) return result;
  if (result.uid !== uid || result.email !== email) return { ok: false, error: 'ADMIN_REAUTH_INVALID' };
  return { ok: true, method: 'firebase-account-password', uid, email };
}

async function requireAdminReauth(req, res, next) {
  try {
    const result = await verifyAdminReauth(req);
    if (!result.ok) {
      return res.status(result.error === 'ADMIN_REAUTH_INVALID' ? 403 : 401).json({
        ok: false,
        error: result.error,
        message: result.error === 'ADMIN_REAUTH_INVALID'
          ? 'Kritik işlem doğrulaması başarısız oldu.'
          : 'Kritik işlem için mevcut admin hesap şifresi gerekiyor.'
      });
    }
    req.adminReauth = result;
    return next();
  } catch (_) {
    return res.status(503).json({ ok: false, error: 'ADMIN_REAUTH_UNAVAILABLE', message: 'Kritik işlem doğrulaması şu anda tamamlanamadı.' });
  }
}

async function writeAdminAudit(req, action, details = {}) {
  try {
    const { db } = initFirebaseAdmin();
    if (!db) return { ok: false, firestore: false };
    const id = `audit_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const row = {
      id,
      action: String(action || 'admin.action').slice(0, 160),
      actor: {
        uid: String(req?.user?.uid || '').slice(0, 160),
        email: String(req?.user?.email || '').toLowerCase().slice(0, 254)
      },
      path: String(req?.originalUrl || req?.url || '').slice(0, 300),
      method: String(req?.method || '').slice(0, 10),
      reauth: req?.adminReauth ? { ok: true, method: req.adminReauth.method || 'unknown' } : { ok: false },
      details: sanitizeAuditValue(details),
      createdAt: Date.now()
    };
    await db.collection('adminAudit').doc(id).set(row, { merge: false });
    return { ok: true, firestore: true, id };
  } catch (error) {
    return { ok: false, firestore: false, error: error?.message || 'ADMIN_AUDIT_FAILED' };
  }
}

module.exports = { requireAdminReauth, verifyAdminReauth, writeAdminAudit, sanitizeAuditValue };
