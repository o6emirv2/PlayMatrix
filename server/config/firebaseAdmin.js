const admin = require('firebase-admin');
const env = require('./env');

function parseServiceAccount(raw) {
  if (!raw || raw.includes('<PLAYMATRIXPRO_SERVICE_ACCOUNT_JSON>')) return null;
  const normalized = raw.trim();
  try { return JSON.parse(normalized); } catch (_) {}
  try { return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')); } catch (_) {}
  return null;
}

let app = null;
let db = null;
let auth = null;
let disabled = false;
let disabledLogged = false;
let initErrorLogged = false;

function disabledResult() {
  if (!disabledLogged) {
    console.warn('[firebase] FIREBASE_KEY missing or placeholder; Firebase Admin disabled for local smoke test.');
    disabledLogged = true;
  }
  return { admin, app: null, db: null, auth: null, enabled: false };
}

function initFirebaseAdmin() {
  if (app) return { admin, app, db, auth, enabled: true };
  if (disabled) return disabledResult();
  const serviceAccount = parseServiceAccount(env.firebase.serviceAccount);
  if (!serviceAccount) {
    disabled = true;
    return disabledResult();
  }
  try {
    app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: env.firebase.storageBucket, projectId: env.firebase.projectId });
    db = admin.firestore();
    auth = admin.auth();
    console.info('[firebase] Admin initialized for project', env.firebase.projectId);
    return { admin, app, db, auth, enabled: true };
  } catch (error) {
    if (!initErrorLogged) {
      console.error('[firebase:init:error]', { message: error.message, projectId: env.firebase.projectId });
      initErrorLogged = true;
    }
    disabled = true;
    return disabledResult();
  }
}

module.exports = { initFirebaseAdmin, get db(){ return db; }, get auth(){ return auth; } };
