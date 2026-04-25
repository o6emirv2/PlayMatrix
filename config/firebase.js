'use strict';

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { loadEnvFiles, isProductionEnv, looksLikeRawFirebaseKey, isTruthyFlag } = require('../utils/env');
const { createMemoryFirestore } = require('../utils/memoryFirestore');
const { verifyIdTokenWithFirebaseRest } = require('../utils/firebaseRestAuth');
const { writeLine, serializeError } = require('../utils/logger');

loadEnvFiles({ cwd: path.join(__dirname, '..') });

const ROOT_DIR = path.join(__dirname, '..');

let firebaseReady = false;
let firebaseInitError = null;
let firebaseCredentialSource = '';
let firebaseUnavailableLogged = false;

const FIREBASE_DEGRADED_MODULES = Object.freeze([
  'auth.session-bootstrap',
  'profile.persistence',
  'reward-ledger',
  'market-inventory',
  'game-settlement',
  'crash-history',
  'pisti-rooms',
  'chess-rooms',
  'chat-retention',
  'admin-audit'
]);

function clean(value = '') {
  return String(value || '').trim();
}


function isPlaceholderCredential(value = '') {
  const raw = clean(value);
  if (!raw) return true;
  const lowered = raw.toLowerCase();
  return /^(SERVICE_ACCOUNT_JSON_BASE64|FIREBASE_KEY_BASE64|BASE64|YOUR_SERVICE_ACCOUNT_JSON_BASE64|CHANGE_ME|CHANGEME|TODO|PLACEHOLDER|EXAMPLE)$/i.test(raw)
    || /^<.+>$/.test(raw)
    || /^\*+$/.test(raw)
    || raw.includes('********')
    || /SERVICE_ACCOUNT_JSON_BASE64/i.test(raw)
    || /FIREBASE_KEY_BASE64/i.test(raw)
    || /buraya|benim|gizli|gizl[iı]|tek_sat[iı]r|yazs[iı]n|eklemedim|secret|redacted/.test(lowered);
}

function warnCredentialSkip(source = 'unknown', error = null) {
  const suffix = error ? `: ${error.message || error}` : '';
  console.warn(`[PlayMatrix][firebase] ${source} geçersiz/placeholder algılandı, sıradaki credential kaynağı deneniyor${suffix}`);
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
  if (!safeValue || isPlaceholderCredential(safeValue)) return '';
  try {
    if (safeValue.startsWith('{') && /\"type\"\s*:\s*\"service_account\"/i.test(safeValue)) {
      return safeValue;
    }
    const compact = safeValue.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) throw new Error('base64 formatı geçersiz');
    const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8').trim();
    if (!decoded) throw new Error('boş değer');
    if (!decoded.startsWith('{') && !decoded.includes('-----BEGIN')) {
      throw new Error('base64 çıktısı JSON/service-account formatında değil');
    }
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
  if (!value || isPlaceholderCredential(value)) return null;
  try {
    return { serviceAccount: JSON.parse(value), source };
  } catch (error) {
    throw new Error(`${source} JSON parse edilemedi: ${error.message}`);
  }
}

function tryParseServiceAccountJson(raw = '', source = 'unknown') {
  try {
    return parseServiceAccountJson(raw, source);
  } catch (error) {
    warnCredentialSkip(source, error);
    return null;
  }
}

function buildServiceAccountFromEnv(env = process.env) {
  let privateKey = '';
  try {
    privateKey = clean(env.FIREBASE_PRIVATE_KEY_BASE64 || '') && !isPlaceholderCredential(env.FIREBASE_PRIVATE_KEY_BASE64)
      ? normalizePrivateKey(decodeBase64Credential(env.FIREBASE_PRIVATE_KEY_BASE64, 'FIREBASE_PRIVATE_KEY_BASE64'))
      : normalizePrivateKey(env.FIREBASE_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY || '');
  } catch (error) {
    warnCredentialSkip('FIREBASE_PRIVATE_KEY_BASE64', error);
    privateKey = normalizePrivateKey(env.FIREBASE_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY || '');
  }

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
  if (base64Value) {
    if (isPlaceholderCredential(base64Value)) {
      warnCredentialSkip('FIREBASE_KEY_BASE64', new Error('placeholder değer'));
    } else {
      try {
        const parsed = tryParseServiceAccountJson(decodeBase64Credential(base64Value, 'FIREBASE_KEY_BASE64'), 'FIREBASE_KEY_BASE64');
        if (parsed) return parsed;
      } catch (error) {
        warnCredentialSkip('FIREBASE_KEY_BASE64', error);
      }
    }
  }

  const explicitPath = clean(process.env.FIREBASE_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '');
  if (explicitPath) {
    const parsed = tryParseServiceAccountJson(readCredentialFile(explicitPath), 'FIREBASE_KEY_PATH');
    if (parsed) return parsed;
  }

  const splitEnv = buildServiceAccountFromEnv(process.env);
  if (splitEnv) return splitEnv;

  const direct = clean(process.env.FIREBASE_KEY || '');
  if (direct) {
    if (looksLikeRawFirebaseKey(direct) || isProductionEnv(process.env)) {
      console.warn('[PlayMatrix][firebase] Legacy raw FIREBASE_KEY algılandı; deploy sürekliliği için okunuyor. En kısa sürede FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH standardına taşı.');
    }
    const parsed = tryParseServiceAccountJson(direct, 'FIREBASE_KEY');
    if (parsed) return parsed;
  }

  if (!isProductionEnv(process.env)) {
    const localFallback = [
      path.join(ROOT_DIR, 'firebase-service-account.json'),
      path.join(ROOT_DIR, 'service-account.json')
    ].map((candidate) => ({ candidate, value: readCredentialFile(candidate) })).find((item) => item.value);
    if (localFallback) {
      const parsed = tryParseServiceAccountJson(localFallback.value, path.basename(localFallback.candidate));
      if (parsed) return parsed;
    }
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
  firebaseCredentialSource = source || firebaseCredentialSource || 'degraded-memory';
  firebaseInitError = error instanceof Error ? error : new Error(String(error || 'Firebase Admin kullanılamıyor.'));
  const message = firebaseInitError.message || 'bilinmeyen hata';
  const strictBoot = isProductionEnv(process.env) && isTruthyFlag(process.env.FIREBASE_ADMIN_STRICT_BOOT || '');
  const payload = {
    source: firebaseCredentialSource,
    mode: 'rest-auth-memory-store',
    degraded: true,
    strictBoot,
    impactedModules: FIREBASE_DEGRADED_MODULES,
    error: serializeError(firebaseInitError)
  };

  if (strictBoot) {
    writeLine('fatal', 'firebase_admin_unavailable_strict_boot', payload);
    throw firebaseInitError;
  }

  if (!firebaseUnavailableLogged) {
    firebaseUnavailableLogged = true;
    writeLine('warn', 'firebase_admin_degraded_mode_enabled', payload);
  }
  console.warn(`[PlayMatrix][firebase] Firebase Admin devre dışı; REST auth + memory-store degraded mod aktif. Etkilenen modüller: ${FIREBASE_DEGRADED_MODULES.join(', ')}. Kök hata: ${message}`);
}

function unavailableError() {
  const err = new Error(firebaseInitError?.message || 'Firebase Admin hazır değil. Render üzerinde geçerli FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH tanımla.');
  err.code = 'FIREBASE_ADMIN_UNAVAILABLE';
  err.statusCode = 503;
  return err;
}

function createDegradedAuth() {
  return {
    __degraded: true,
    async verifyIdToken(idToken) {
      return verifyIdTokenWithFirebaseRest(idToken);
    }
  };
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

const db = firebaseReady ? admin.firestore() : createMemoryFirestore();
const auth = firebaseReady ? admin.auth() : createDegradedAuth();

function isFirebaseReady() {
  return firebaseReady;
}

function getFirebaseStatus(options = {}) {
  const exposeError = options.exposeError !== false;
  return {
    ready: firebaseReady,
    degraded: !firebaseReady,
    mode: firebaseReady ? 'admin-sdk' : 'rest-auth-memory-store',
    source: firebaseCredentialSource || null,
    strictBoot: !!(isProductionEnv(process.env) && isTruthyFlag(process.env.FIREBASE_ADMIN_STRICT_BOOT || '')),
    impactedModules: firebaseReady ? [] : FIREBASE_DEGRADED_MODULES.slice(),
    error: exposeError && firebaseInitError ? firebaseInitError.message : null
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
  assertFirebaseReady,
  FIREBASE_DEGRADED_MODULES
};
