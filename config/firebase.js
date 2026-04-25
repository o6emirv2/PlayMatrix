'use strict';

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { loadEnvFiles, isProductionEnv, looksLikeRawFirebaseKey, isTruthyFlag } = require('../utils/env');
const { createMemoryFirestore } = require('../utils/memoryFirestore');
const { verifyIdTokenWithFirebaseRest } = require('../utils/firebaseRestAuth');
const { writeLine } = require('../utils/logger');

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

function decodeBase64Text(value = '', label = 'base64') {
  const safeValue = clean(value);
  if (!safeValue || isPlaceholderCredential(safeValue)) return '';
  const compact = safeValue.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) throw new Error(`${label} formatı geçersiz`);
  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8').trim();
}

function decodeBase64Credential(value = '', label = 'FIREBASE_KEY_BASE64') {
  const safeValue = clean(value);
  if (!safeValue || isPlaceholderCredential(safeValue)) return '';
  try {
    if (safeValue.startsWith('{')) return safeValue;
    const decoded = decodeBase64Text(safeValue, label);
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
    .replace(/^[\'"]|[\'"]$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\r\n/g, '\n');
}

function pickNestedCredentialObject(candidate = {}) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const nestedKeys = ['serviceAccount', 'service_account', 'firebaseServiceAccount', 'firebase_service_account', 'credential', 'credentials'];
  for (const key of nestedKeys) {
    if (candidate[key] && typeof candidate[key] === 'object') return candidate[key];
  }
  return candidate;
}

function coerceServiceAccount(serviceAccount = {}) {
  const input = pickNestedCredentialObject(serviceAccount);
  const normalized = { ...(input && typeof input === 'object' ? input : {}) };
  normalized.type = clean(normalized.type || normalized.account_type || 'service_account');
  normalized.project_id = clean(normalized.project_id || normalized.projectId || normalized.projectID || process.env.FIREBASE_PROJECT_ID || '');
  normalized.private_key_id = clean(normalized.private_key_id || normalized.privateKeyId || normalized.privateKeyID || process.env.FIREBASE_PRIVATE_KEY_ID || process.env.GOOGLE_PRIVATE_KEY_ID || '');
  const rawPrivateKey = normalized.private_key
    || normalized.privateKey
    || normalized.privateKeyPem
    || normalized.private_key_pem
    || normalized.key
    || process.env.FIREBASE_PRIVATE_KEY
    || process.env.GOOGLE_PRIVATE_KEY
    || '';
  let privateKey = normalizePrivateKey(rawPrivateKey);
  const privateKeyBase64 = clean(normalized.private_key_base64 || normalized.privateKeyBase64 || process.env.FIREBASE_PRIVATE_KEY_BASE64 || '');
  if (!privateKey && privateKeyBase64 && !isPlaceholderCredential(privateKeyBase64)) {
    try {
      privateKey = normalizePrivateKey(decodeBase64Text(privateKeyBase64, 'private_key_base64'));
    } catch (error) {
      warnCredentialSkip('private_key_base64', error);
    }
  }
  normalized.private_key = privateKey;
  normalized.client_email = clean(normalized.client_email || normalized.clientEmail || normalized.serviceAccountEmail || process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '');
  normalized.client_id = clean(normalized.client_id || normalized.clientId || process.env.FIREBASE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '');
  normalized.auth_uri = clean(normalized.auth_uri || normalized.authUri || 'https://accounts.google.com/o/oauth2/auth');
  normalized.token_uri = clean(normalized.token_uri || normalized.tokenUri || 'https://oauth2.googleapis.com/token');
  normalized.auth_provider_x509_cert_url = clean(normalized.auth_provider_x509_cert_url || normalized.authProviderX509CertUrl || 'https://www.googleapis.com/oauth2/v1/certs');
  normalized.client_x509_cert_url = clean(normalized.client_x509_cert_url || normalized.clientX509CertUrl || (normalized.client_email ? `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(normalized.client_email)}` : ''));
  normalized.universe_domain = clean(normalized.universe_domain || normalized.universeDomain || 'googleapis.com');
  return normalized;
}

function validateServiceAccount(serviceAccount = {}) {
  const normalized = coerceServiceAccount(serviceAccount);
  const missing = [];
  if (normalized.type !== 'service_account') missing.push('type=service_account');
  if (!clean(normalized.project_id)) missing.push('project_id');
  if (!clean(normalized.client_email) || !/@.+\.iam\.gserviceaccount\.com$/i.test(clean(normalized.client_email))) missing.push('client_email');
  if (!clean(normalized.private_key) || !/-----BEGIN [^-]+ PRIVATE KEY-----/i.test(clean(normalized.private_key))) missing.push('private_key');
  if (missing.length) throw new Error(`Firebase service account eksik/geçersiz alanlar: ${missing.join(', ')}`);
  return normalized;
}

function parseServiceAccountJson(raw = '', source = 'unknown') {
  const value = String(raw || '').trim();
  if (!value || isPlaceholderCredential(value)) return null;
  if (/-----BEGIN [^-]+ PRIVATE KEY-----/i.test(value) && !value.startsWith('{')) {
    return { serviceAccount: coerceServiceAccount({ private_key: value }), source };
  }
  try {
    return { serviceAccount: coerceServiceAccount(JSON.parse(value)), source };
  } catch (error) {
    throw new Error(`${source} JSON parse edilemedi: ${error.message}`);
  }
}

function tryResolveCredentialCandidate(raw = '', source = 'unknown') {
  try {
    const parsed = parseServiceAccountJson(raw, source);
    if (!parsed?.serviceAccount) return null;
    parsed.serviceAccount = validateServiceAccount(parsed.serviceAccount);
    return parsed;
  } catch (error) {
    warnCredentialSkip(source, error);
    return null;
  }
}

function buildServiceAccountFromEnv(env = process.env) {
  const hasSplitCredential = clean(env.FIREBASE_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY_BASE64 || '')
    || clean(env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL || '');
  if (!hasSplitCredential) return null;

  const serviceAccount = coerceServiceAccount({
    type: 'service_account',
    project_id: clean(env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || ''),
    private_key_id: clean(env.FIREBASE_PRIVATE_KEY_ID || env.GOOGLE_PRIVATE_KEY_ID || ''),
    private_key: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY || ''),
    private_key_base64: clean(env.FIREBASE_PRIVATE_KEY_BASE64 || ''),
    client_email: clean(env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL || ''),
    client_id: clean(env.FIREBASE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '')
  });

  try {
    return { serviceAccount: validateServiceAccount(serviceAccount), source: 'split-env' };
  } catch (error) {
    warnCredentialSkip('split-env', error);
    return null;
  }
}

function normalizeServiceAccount(serviceAccount = {}) {
  return coerceServiceAccount(serviceAccount);
}

function resolveFirebaseServiceAccount() {
  const base64Value = clean(process.env.FIREBASE_KEY_BASE64 || '');
  if (base64Value) {
    if (isPlaceholderCredential(base64Value)) {
      warnCredentialSkip('FIREBASE_KEY_BASE64', new Error('placeholder değer'));
    } else {
      try {
        const parsed = tryResolveCredentialCandidate(decodeBase64Credential(base64Value, 'FIREBASE_KEY_BASE64'), 'FIREBASE_KEY_BASE64');
        if (parsed) return parsed;
      } catch (error) {
        warnCredentialSkip('FIREBASE_KEY_BASE64', error);
      }
    }
  }

  const explicitPath = clean(process.env.FIREBASE_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '');
  if (explicitPath) {
    const parsed = tryResolveCredentialCandidate(readCredentialFile(explicitPath), 'FIREBASE_KEY_PATH');
    if (parsed) return parsed;
  }

  const splitEnv = buildServiceAccountFromEnv(process.env);
  if (splitEnv) return splitEnv;

  const direct = clean(process.env.FIREBASE_KEY || '');
  if (direct) {
    if (looksLikeRawFirebaseKey(direct) || isProductionEnv(process.env)) {
      console.warn('[PlayMatrix][firebase] Legacy raw FIREBASE_KEY algılandı; deploy sürekliliği için okunuyor. En kısa sürede FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH standardına taşı.');
    }
    const parsed = tryResolveCredentialCandidate(direct, 'FIREBASE_KEY');
    if (parsed) return parsed;
  }

  if (!isProductionEnv(process.env)) {
    const localFallback = [
      path.join(ROOT_DIR, 'firebase-service-account.json'),
      path.join(ROOT_DIR, 'service-account.json')
    ].map((candidate) => ({ candidate, value: readCredentialFile(candidate) })).find((item) => item.value);
    if (localFallback) {
      const parsed = tryResolveCredentialCandidate(localFallback.value, path.basename(localFallback.candidate));
      if (parsed) return parsed;
    }
  }

  return null;
}

function buildFirebaseAdminOptions(serviceAccount) {
  const normalized = validateServiceAccount(normalizeServiceAccount(serviceAccount));
  const options = { credential: admin.credential.cert(normalized) };
  const projectId = clean(process.env.FIREBASE_PROJECT_ID || normalized.project_id || '');
  const databaseURL = clean(process.env.FIREBASE_DATABASE_URL || '');
  const storageBucket = clean(process.env.FIREBASE_STORAGE_BUCKET || normalized.storage_bucket || '');
  if (projectId) options.projectId = projectId;
  if (databaseURL) options.databaseURL = databaseURL;
  if (storageBucket) options.storageBucket = storageBucket;
  return options;
}

function serializeStartupError(error) {
  const err = error instanceof Error ? error : new Error(String(error || 'Firebase Admin kullanılamıyor.'));
  return {
    name: clean(err.name || 'Error'),
    message: clean(err.message || 'Bilinmeyen Firebase Admin hatası')
  };
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
    error: serializeStartupError(firebaseInitError)
  };

  if (strictBoot) {
    writeLine('fatal', 'firebase_admin_unavailable_strict_boot', payload);
    throw firebaseInitError;
  }

  if (!firebaseUnavailableLogged) {
    firebaseUnavailableLogged = true;
    writeLine('warn', 'firebase_admin_degraded_mode_enabled', payload);
    console.warn(`[PlayMatrix][firebase] Firebase Admin devre dışı; REST auth + memory-store degraded mod aktif. Kök hata: ${message}`);
  }
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
      throw new Error('Firebase Admin credential bulunamadı veya service-account formatında değil. FIREBASE_KEY_BASE64 gerçek service-account JSON base64 olmalı; Firebase web config değildir. Alternatif: FIREBASE_KEY_PATH veya split FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL.');
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
