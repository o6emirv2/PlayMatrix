'use strict';

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { loadEnvFiles, isProductionEnv, looksLikeRawFirebaseKey, isTruthyFlag } = require('../utils/env');

loadEnvFiles({ cwd: path.join(__dirname, '..') });

const ROOT_DIR = path.join(__dirname, '..');

let firebaseReady = false;
let firebaseInitError = null;
let firebaseCredentialSource = '';

function clean(value = '') {
  return String(value || '').trim();
}

function readCredentialFile(filePath = '') {
  const safePath = clean(filePath);
  if (!safePath) return '';
  const absPath = path.isAbsolute(safePath) ? safePath : path.join(ROOT_DIR, safePath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return '';
  return fs.readFileSync(absPath, 'utf8');
}

function decodeBase64Credential(value = '', label = 'FIREBASE_KEY_BASE64') {
  const safeValue = clean(value);
  if (!safeValue) return '';
  try {
    const normalized = safeValue.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8').trim();
    if (!decoded) throw new Error('boş değer');
    return decoded;
  } catch (error) {
    throw new Error(`${label} çözümlenemedi: ${error.message}`);
  }
}

function normalizePrivateKey(value = '') {
  const key = String(value || '').trim();
  if (!key) return '';
  return key
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\r\n/g, '\n');
}

function parseServiceAccountJson(raw = '', source = 'unknown') {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    return { serviceAccount: JSON.parse(value), source };
  } catch (error) {
    throw new Error(`${source} JSON parse edilemedi: ${error.message}`);
  }
}

function buildServiceAccountFromEnv(env = process.env) {
  const privateKey = clean(env.FIREBASE_PRIVATE_KEY_BASE64 || '')
    ? normalizePrivateKey(decodeBase64Credential(env.FIREBASE_PRIVATE_KEY_BASE64, 'FIREBASE_PRIVATE_KEY_BASE64'))
    : normalizePrivateKey(env.FIREBASE_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY || '');

  const clientEmail = clean(env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL || '');
  const projectId = clean(env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || '');
  if (!privateKey && !clientEmail) return null;

  return {
    serviceAccount: {
      type: 'service_account',
      project_id: projectId,
      private_key_id: clean(env.FIREBASE_PRIVATE_KEY_ID || env.GOOGLE_PRIVATE_KEY_ID || ''),
      private_key: privateKey,
      client_email: clientEmail,
      client_id: clean(env.FIREBASE_CLIENT_ID || env.GOOGLE_CLIENT_ID || ''),
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: clientEmail ? `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}` : '',
      universe_domain: 'googleapis.com'
    },
    source: 'split-env'
  };
}

function normalizeServiceAccount(serviceAccount = {}) {
  const normalized = { ...serviceAccount };
  normalized.project_id = clean(normalized.project_id || process.env.FIREBASE_PROJECT_ID || '');
  normalized.client_email = clean(normalized.client_email || process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL || '');
  normalized.private_key = normalizePrivateKey(normalized.private_key || process.env.FIREBASE_PRIVATE_KEY || '');
  if (!normalized.type && (normalized.client_email || normalized.private_key || normalized.project_id)) normalized.type = 'service_account';
  return normalized;
}

function resolveFirebaseServiceAccount() {
  const base64Value = clean(process.env.FIREBASE_KEY_BASE64 || '');
  if (base64Value) return parseServiceAccountJson(decodeBase64Credential(base64Value), 'FIREBASE_KEY_BASE64');

  const explicitPath = clean(process.env.FIREBASE_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '');
  if (explicitPath) return parseServiceAccountJson(readCredentialFile(explicitPath), 'FIREBASE_KEY_PATH');

  const splitEnv = buildServiceAccountFromEnv(process.env);
  if (splitEnv) return splitEnv;

  const direct = clean(process.env.FIREBASE_KEY || '');
  if (direct) {
    if (looksLikeRawFirebaseKey(direct) || isProductionEnv(process.env)) {
      console.warn('[PlayMatrix][firebase] Legacy raw FIREBASE_KEY algılandı; deploy sürekliliği için okunuyor. En kısa sürede FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH standardına taşı.');
    }
    return parseServiceAccountJson(direct, 'FIREBASE_KEY');
  }

  if (!isProductionEnv(process.env)) {
    const localFallback = [
      path.join(ROOT_DIR, 'firebase-service-account.json'),
      path.join(ROOT_DIR, 'service-account.json')
    ].map((candidate) => ({ candidate, value: readCredentialFile(candidate) })).find((item) => item.value);
    if (localFallback) return parseServiceAccountJson(localFallback.value, path.basename(localFallback.candidate));
  }

  return null;
}

function validateServiceAccount(serviceAccount = {}) {
  const missing = [];
  if (serviceAccount.type !== 'service_account') missing.push('type=service_account');
  if (!clean(serviceAccount.project_id)) missing.push('project_id');
  if (!clean(serviceAccount.client_email) || !/@.+\.iam\.gserviceaccount\.com$/i.test(clean(serviceAccount.client_email))) missing.push('client_email');
  if (!clean(serviceAccount.private_key) || !/-----BEGIN [^-]+ PRIVATE KEY-----/i.test(clean(serviceAccount.private_key))) missing.push('private_key');
  if (missing.length) {
    throw new Error(`Firebase service account eksik/geçersiz alanlar: ${missing.join(', ')}`);
  }
}

function buildFirebaseAdminOptions(serviceAccount) {
  const normalized = normalizeServiceAccount(serviceAccount);
  validateServiceAccount(normalized);

  const options = {
    credential: admin.credential.cert(normalized)
  };

  const projectId = clean(process.env.FIREBASE_PROJECT_ID || normalized.project_id || '');
  const databaseURL = clean(process.env.FIREBASE_DATABASE_URL || '');
  const storageBucket = clean(process.env.FIREBASE_STORAGE_BUCKET || normalized.storage_bucket || '');

  if (projectId) options.projectId = projectId;
  if (databaseURL) options.databaseURL = databaseURL;
  if (storageBucket) options.storageBucket = storageBucket;

  return options;
}

function markFirebaseUnavailable(error, source = '') {
  firebaseReady = false;
  firebaseCredentialSource = source || firebaseCredentialSource || 'unavailable';
  firebaseInitError = error instanceof Error ? error : new Error(String(error || 'Firebase Admin kullanılamıyor.'));
  const message = firebaseInitError.message || 'bilinmeyen hata';
  console.error(`[PlayMatrix][firebase] Firebase Admin devre dışı: ${message}`);
  if (isProductionEnv(process.env) && isTruthyFlag(process.env.FIREBASE_ADMIN_STRICT_BOOT || '')) {
    throw firebaseInitError;
  }
}

function unavailableError() {
  const err = new Error(firebaseInitError?.message || 'Firebase Admin hazır değil. Render üzerinde geçerli FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH tanımla.');
  err.code = 'FIREBASE_ADMIN_UNAVAILABLE';
  err.statusCode = 503;
  return err;
}

function unavailableFunction() {
  throw unavailableError();
}

function createUnavailableFirestore() {
  const docRef = () => new Proxy({}, { get: () => unavailableFunction });
  const collectionRef = () => new Proxy({ doc: docRef }, { get: (target, prop) => target[prop] || unavailableFunction });
  return new Proxy({
    __unavailable: true,
    collection: collectionRef,
    doc: docRef,
    batch: unavailableFunction,
    runTransaction: unavailableFunction
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return unavailableFunction;
    }
  });
}

function createUnavailableAuth() {
  return new Proxy({ __unavailable: true }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return unavailableFunction;
    }
  });
}

(function initFirebase() {
  if (admin.apps.length) {
    firebaseReady = true;
    firebaseCredentialSource = 'existing-app';
    return;
  }

  let resolved = null;
  try {
    resolved = resolveFirebaseServiceAccount();
    if (!resolved?.serviceAccount) {
      throw new Error('Firebase Admin credential bulunamadı. FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH tanımla. Geçici uyumluluk için FIREBASE_KEY okunabilir.');
    }
    const serviceAccount = normalizeServiceAccount(resolved.serviceAccount);
    admin.initializeApp(buildFirebaseAdminOptions(serviceAccount));
    firebaseReady = true;
    firebaseInitError = null;
    firebaseCredentialSource = resolved.source || 'unknown';
    console.log(`[PlayMatrix][firebase] Firebase Admin başlatıldı: ${firebaseCredentialSource}`);
  } catch (error) {
    markFirebaseUnavailable(new Error(`Firebase Admin başlatılamadı: ${error.message}`), resolved?.source || 'unresolved');
  }
})();

const db = firebaseReady ? admin.firestore() : createUnavailableFirestore();
const auth = firebaseReady ? admin.auth() : createUnavailableAuth();

function isFirebaseReady() {
  return firebaseReady;
}

function getFirebaseStatus() {
  return {
    ready: firebaseReady,
    source: firebaseCredentialSource || null,
    error: firebaseInitError ? firebaseInitError.message : null
  };
}

function assertFirebaseReady() {
  if (!firebaseReady) throw unavailableError();
  return true;
}

module.exports = {
  admin,
  db,
  auth,
  isFirebaseReady,
  getFirebaseStatus,
  assertFirebaseReady
};
