const DEFAULT_PUBLIC_BASE_URL = 'https://playmatrix.com.tr';
const DEFAULT_WWW_BASE_URL = 'https://www.playmatrix.com.tr';
const DEFAULT_BACKEND_ORIGIN = 'https://emirhan-siye.onrender.com';
const DEFAULT_FIREBASE_PROJECT_ID = 'playmatrixpro-b18b7';
const DEFAULT_FIREBASE_AUTH_DOMAIN = 'playmatrixpro-b18b7.firebaseapp.com';
const DEFAULT_FIREBASE_STORAGE_BUCKET = 'playmatrixpro-b18b7.firebasestorage.app';
const DEFAULT_FIREBASE_MESSAGING_SENDER_ID = '401147567674';
const DEFAULT_FIREBASE_APP_ID = '1:401147567674:web:37f609d8527e61a72c5f03';
const DEFAULT_FIREBASE_MEASUREMENT_ID = 'G-HEDD2B0T9H';

function toInt(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function split(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
  } catch (_) {
    return raw.replace(/\/+$/, '').replace(/\/[^/]*$/g, '');
  }
}

function normalizeBaseUrl(value, fallback = '') {
  const origin = normalizeOrigin(value || fallback);
  return origin || fallback;
}

function uniqueOrigins(values = []) {
  const list = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeOrigin(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }
  return list;
}

const publicBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL, DEFAULT_PUBLIC_BASE_URL);
const canonicalOrigin = normalizeBaseUrl(process.env.CANONICAL_ORIGIN, publicBaseUrl || DEFAULT_PUBLIC_BASE_URL);
const publicBackendOrigin = normalizeBaseUrl(process.env.PUBLIC_BACKEND_ORIGIN, DEFAULT_BACKEND_ORIGIN);
const publicApiBase = normalizeBaseUrl(process.env.PUBLIC_API_BASE, publicBackendOrigin || DEFAULT_BACKEND_ORIGIN);
const allowedOrigins = uniqueOrigins([
  DEFAULT_PUBLIC_BASE_URL,
  DEFAULT_WWW_BASE_URL,
  DEFAULT_BACKEND_ORIGIN,
  publicBaseUrl,
  canonicalOrigin,
  publicBackendOrigin,
  publicApiBase,
  ...split(process.env.ALLOWED_ORIGINS)
]);

const env = {
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  publicBaseUrl,
  canonicalOrigin,
  publicBackendOrigin,
  publicApiBase,
  allowedOrigins,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.PUBLIC_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_STORAGE_BUCKET,
    serviceAccount: process.env.FIREBASE_KEY || '',
    publicConfig: {
      apiKey: process.env.PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || '',
      authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID,
      storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || DEFAULT_FIREBASE_APP_ID,
      measurementId: process.env.PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_MEASUREMENT_ID
    }
  },
  adminEmails: split(process.env.ADMIN_EMAILS).map((email) => email.toLowerCase()),
  adminUids: split(process.env.ADMIN_UIDS).map((uid) => String(uid).trim()),
  runtimeLog: {
    max: toInt(process.env.RUNTIME_LOG_MAX, 3000, { min: 100, max: 5000 }),
    retentionHours: toInt(process.env.RUNTIME_LOG_RETENTION_HOURS, 168, { min: 1, max: 168 }),
    duplicateWindowMs: toInt(process.env.RUNTIME_LOG_DUPLICATE_WINDOW_MS, 60000, { min: 5000, max: 600000 })
  },
  security: {
    adminHealthSurfaceEnabled: process.env.ADMIN_HEALTH_SURFACE_ENABLED === '1',
    cspReportOnly: process.env.SECURITY_CSP_REPORT_ONLY !== '0',
    cspStrict: process.env.SECURITY_CSP_STRICT === '1'
  },
  redis: {
    url: process.env.REDIS_URL || '',
    requiredInProduction: process.env.REDIS_REQUIRED_IN_PRODUCTION !== '0'
  },
  session: {
    secretSource: process.env.SESSION_SECRET || process.env.ADMIN_PANEL_SECOND_FACTOR_HASH_HEX || process.env.FIREBASE_KEY || '',
    ttlMs: toInt(process.env.SESSION_TTL_MS, 7 * 86400000, { min: 3600000, max: 7 * 86400000 })
  },
  ttl: {
    matchQueueMs: toInt(process.env.MATCH_QUEUE_TTL_MS, 120000, { min: 30000, max: 900000 }),
    socketConnectionMs: toInt(process.env.SOCKET_CONNECTION_TTL_MS, 180000, { min: 30000, max: 900000 }),
    notificationReceiptMs: 30 * 86400000,
    idempotencyLockMs: toInt(process.env.REDIS_IDEMPOTENCY_LOCK_TTL_MS, 24 * 3600000, { min: 60000, max: 7 * 86400000 }),
    crashRoundStateMs: toInt(process.env.REDIS_CRASH_ROUND_TTL_MS, 3600000, { min: 60000, max: 24 * 3600000 }),
    bettingRoomStateMs: toInt(process.env.REDIS_BET_ROOM_TTL_MS, 2 * 3600000, { min: 60000, max: 24 * 3600000 })
  }
};

function publicRuntimeConfig() {
  const firebaseReady = !!(
    env.firebase.publicConfig.apiKey
    && env.firebase.publicConfig.authDomain
    && env.firebase.publicConfig.projectId
    && env.firebase.publicConfig.appId
  );
  return {
    apiBase: env.publicApiBase,
    canonicalOrigin: env.canonicalOrigin,
    publicBaseUrl: env.publicBaseUrl,
    expectedFirebaseProjectId: env.firebase.publicConfig.projectId,
    firebase: env.firebase.publicConfig,
    firebaseReady,
    source: 'render-env'
  };
}

function safeStartupReport() {
  const missing = [];
  const warnings = [];
  if (!env.firebase.serviceAccount) warnings.push('FIREBASE_KEY_MISSING_ADMIN_DISABLED');
  if (!env.firebase.publicConfig.apiKey) warnings.push('PUBLIC_FIREBASE_API_KEY_MISSING');
  if (env.redis.requiredInProduction && env.nodeEnv === 'production' && !env.redis.url) warnings.push('REDIS_URL_MISSING_CRITICAL_RUNTIME_DISABLED');
  if (!env.adminEmails.length && !env.adminUids.length) warnings.push('ADMIN_ALLOWLIST_MISSING');
  if (!env.session.secretSource) warnings.push('SESSION_SECRET_MISSING_USER_SESSION_FALLBACK_DISABLED');
  if (!env.allowedOrigins.includes(DEFAULT_PUBLIC_BASE_URL)) missing.push('ALLOWED_ORIGIN_PLAYMATRIX_MISSING');
  if (!env.allowedOrigins.includes(DEFAULT_WWW_BASE_URL)) missing.push('ALLOWED_ORIGIN_WWW_MISSING');
  if (!env.allowedOrigins.includes(DEFAULT_BACKEND_ORIGIN)) missing.push('ALLOWED_ORIGIN_RENDER_MISSING');
  return {
    nodeEnv: env.nodeEnv,
    publicBaseUrl: env.publicBaseUrl,
    canonicalOrigin: env.canonicalOrigin,
    publicBackendOrigin: env.publicBackendOrigin,
    publicApiBase: env.publicApiBase,
    allowedOrigins: env.allowedOrigins,
    firebaseProjectId: env.firebase.projectId,
    runtimeLog: env.runtimeLog,
    redisConfigured: !!env.redis.url,
    missing,
    warnings
  };
}

env.normalizeOrigin = normalizeOrigin;
env.publicRuntimeConfig = publicRuntimeConfig;
env.safeStartupReport = safeStartupReport;

module.exports = Object.freeze(env);
