'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ENV_FILES = Object.freeze([
  '.env',
  '.env.env',
  'env.env'
]);

let loaded = false;

function parseEnvLine(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex <= 0) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = trimmed.slice(eqIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFiles(options = {}) {
  if (loaded && options.force !== true) return false;
  const cwd = options.cwd || process.cwd();
  const files = Array.isArray(options.files) && options.files.length ? options.files : DEFAULT_ENV_FILES;
  let applied = false;

  files.forEach((fileName) => {
    const absPath = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
    try {
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return;
      const content = fs.readFileSync(absPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const parsed = parseEnvLine(line);
        if (!parsed) return;
        if (process.env[parsed.key] === undefined) {
          process.env[parsed.key] = parsed.value;
          applied = true;
        }
      });
    } catch (_) {}
  });

  loaded = true;
  return applied;
}

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTruthyFlag(value = '') {
  return ['1', 'true', 'yes', 'on', 'production'].includes(String(value || '').trim().toLowerCase());
}

function isProductionEnv(env = process.env) {
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function isPlaceholderValue(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return true;
  const lowered = raw.toLowerCase();
  return /^(changeme|change_me|todo|placeholder|example|your_|your-.+|service_account_json_base64|firebase_key_base64|base64|your_service_account_json_base64)$/i.test(raw)
    || /^<.+>$/.test(raw)
    || /^\*+$/.test(raw)
    || raw.includes('********')
    || /service_account_json_base64/i.test(raw)
    || /firebase_key_base64/i.test(raw)
    || /buraya|benim|gizli|gizl[iı]|tek_sat[iı]r|yazs[iı]n|eklemedim|secret|redacted/.test(lowered);
}

function hasValue(env = process.env, key = '') {
  const value = String(env[key] || '').trim();
  if (!value) return false;
  return !isPlaceholderValue(value);
}

function hasAnyValue(env = process.env, keys = []) {
  return keys.some((key) => hasValue(env, key));
}

function normalizeUrlBase(value = '') {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    const cleanPath = String(parsed.pathname || '').replace(/\/+$/, '');
    if (cleanPath.toLowerCase() === '/api') {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return raw.replace(/\/api$/i, '');
  }
}

function normalizeUrlOrigin(value = '') {
  const raw = normalizeUrlBase(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
  } catch (_) {
    return '';
  }
}

function firstValidOrigin(env = process.env, keys = []) {
  for (const key of keys) {
    const origin = normalizeUrlOrigin(env[key] || '');
    if (origin) return origin;
  }
  return '';
}

function firstAllowedOrigin(env = process.env) {
  const origins = parseCsv(env.ALLOWED_ORIGINS || '');
  const normalized = origins.map((origin) => normalizeUrlOrigin(origin)).filter(Boolean);
  const productionSafe = normalized.find((origin) => /^https:\/\//i.test(origin) && !/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|$)/i.test(origin));
  return productionSafe || normalized[0] || '';
}

function normalizeRuntimeEnv(env = process.env) {
  const publicBase = firstValidOrigin(env, [
    'PUBLIC_BASE_URL',
    'CANONICAL_ORIGIN',
    'PUBLIC_CANONICAL_ORIGIN',
    'PUBLIC_SITE_ORIGIN',
    'PUBLIC_FRONTEND_ORIGIN',
    'FRONTEND_ORIGIN',
    'APP_ORIGIN'
  ]);
  const backendOrigin = firstValidOrigin(env, [
    'PUBLIC_BACKEND_ORIGIN',
    'BACKEND_ORIGIN',
    'RENDER_EXTERNAL_URL'
  ]);
  const apiOrigin = firstValidOrigin(env, [
    'PUBLIC_API_BASE',
    'API_BASE_URL',
    'API_BASE'
  ]);
  const allowedOrigin = firstAllowedOrigin(env);

  if (!hasValue(env, 'PUBLIC_BASE_URL')) {
    env.PUBLIC_BASE_URL = publicBase || allowedOrigin || backendOrigin || apiOrigin || '';
  } else {
    env.PUBLIC_BASE_URL = normalizeUrlOrigin(env.PUBLIC_BASE_URL) || String(env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  }

  if (!hasValue(env, 'PUBLIC_BACKEND_ORIGIN')) {
    env.PUBLIC_BACKEND_ORIGIN = backendOrigin || apiOrigin || publicBase || allowedOrigin || '';
  } else {
    env.PUBLIC_BACKEND_ORIGIN = normalizeUrlOrigin(env.PUBLIC_BACKEND_ORIGIN) || String(env.PUBLIC_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '');
  }

  if (hasValue(env, 'PUBLIC_API_BASE')) {
    env.PUBLIC_API_BASE = normalizeUrlBase(env.PUBLIC_API_BASE);
  } else if (hasValue(env, 'PUBLIC_BACKEND_ORIGIN')) {
    env.PUBLIC_API_BASE = normalizeUrlBase(env.PUBLIC_BACKEND_ORIGIN);
  }

  return env;
}

function looksLikeRawFirebaseKey(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /"private_key"\s*:/i.test(raw)
    || /-----BEGIN [^-]+ PRIVATE KEY-----/i.test(raw)
    || /"client_email"\s*:\s*"[^"@]+@[^"@]+\.iam\.gserviceaccount\.com"/i.test(raw);
}

function validateOriginForProduction(origin = '') {
  if (!origin || origin === '*') return 'Üretimde ALLOWED_ORIGINS joker/boş bırakılamaz.';
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (_) {
    return `Geçersiz ALLOWED_ORIGINS girdisi: ${origin}`;
  }
  if (parsed.protocol !== 'https:') return `Üretimde ALLOWED_ORIGINS HTTPS olmalı: ${origin}`;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname)) {
    return `Üretimde localhost/loopback origin yasak: ${origin}`;
  }
  return '';
}

function validateRuntimeEnv(env = process.env) {
  normalizeRuntimeEnv(env);
  const warnings = [];
  const errors = [];
  const production = isProductionEnv(env);

  const adminUids = parseCsv(env.ADMIN_UIDS || env.ADMIN_UID || env.PRIMARY_ADMIN_UID || '');
  const adminEmails = parseCsv(env.ADMIN_EMAILS || env.ADMIN_EMAIL || env.PRIMARY_ADMIN_EMAIL || '');
  const allowedOrigins = parseCsv(env.ALLOWED_ORIGINS || '');

  if (!adminUids.length) (production ? errors : warnings).push('ADMIN_UIDS tanımlı değil.');
  if (!adminEmails.length) (production ? errors : warnings).push('ADMIN_EMAILS tanımlı değil.');
  if (adminUids.length && adminEmails.length && adminUids.length !== adminEmails.length) {
    warnings.push('ADMIN_UIDS ve ADMIN_EMAILS adetleri farklı; eşleşmeler ilk değer üzerinden yapılacak.');
  }

  if (!allowedOrigins.length) {
    (production ? errors : warnings).push('ALLOWED_ORIGINS tanımlı değil; varsayılan geliştirme originleri kullanılabilir.');
  }

  allowedOrigins.forEach((origin) => {
    if (!production) {
      try {
        if (origin !== '*') new URL(origin);
      } catch (_) {
        errors.push(`Geçersiz ALLOWED_ORIGINS girdisi: ${origin}`);
      }
      return;
    }
    const productionOriginError = validateOriginForProduction(origin);
    if (productionOriginError) errors.push(productionOriginError);
  });

  ['LOBBY_CHAT_RETENTION_DAYS', 'DIRECT_CHAT_RETENTION_DAYS'].forEach((key) => {
    if (env[key] === undefined || env[key] === '') return;
    const numeric = Number(env[key]);
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > 365) {
      errors.push(`${key} 1 ile 365 arasında sayı olmalı.`);
    }
  });

  const hasPreferredFirebaseCredential = hasAnyValue(env, ['FIREBASE_KEY_BASE64', 'FIREBASE_KEY_PATH']);
  const hasSplitFirebaseCredential = hasAnyValue(env, ['FIREBASE_PRIVATE_KEY', 'FIREBASE_PRIVATE_KEY_BASE64', 'GOOGLE_PRIVATE_KEY'])
    && hasAnyValue(env, ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_CLIENT_EMAIL']);
  const hasLegacyRawFirebaseKey = hasValue(env, 'FIREBASE_KEY');
  if (production && !hasPreferredFirebaseCredential && !hasSplitFirebaseCredential && !hasLegacyRawFirebaseKey) {
    errors.push('Üretimde Firebase Admin credential eksik/geçersiz: FIREBASE_KEY_BASE64, FIREBASE_KEY_PATH veya split FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL kullan. Production memory-store fallback kapalıdır; servis geçerli Admin credential olmadan başlatılmaz.');
  }
  if (production && hasLegacyRawFirebaseKey) {
    warnings.push('Legacy raw FIREBASE_KEY üretimde algılandı; deploy kırılmaması için desteklenir, fakat FIREBASE_KEY_BASE64 veya FIREBASE_KEY_PATH standardına taşınmalıdır.');
  }
  if (looksLikeRawFirebaseKey(env.FIREBASE_KEY || '')) {
    warnings.push('FIREBASE_KEY içinde raw service-account/private_key içeriği algılandı; base64 veya secret-file kullan.');
  }
  if (env.FIREBASE_KEY_BASE64 && !hasValue(env, 'FIREBASE_KEY_BASE64')) {
    (production ? errors : warnings).push('FIREBASE_KEY_BASE64 placeholder/geçersiz değer gibi görünüyor; gerçek service-account JSON base64 değeriyle değiştir.');
  }

  const missingPublicFirebase = [
    ['PUBLIC_FIREBASE_API_KEY', 'FIREBASE_WEB_API_KEY', 'FIREBASE_API_KEY'],
    ['PUBLIC_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'],
    ['PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
    ['PUBLIC_FIREBASE_APP_ID', 'FIREBASE_APP_ID']
  ].filter((aliases) => !hasAnyValue(env, aliases)).map((aliases) => aliases[0]);
  if (missingPublicFirebase.length) {
    (production ? errors : warnings).push(`Public Firebase web config eksik: ${missingPublicFirebase.join(', ')}`);
  }

  const secondFactorHashReady = hasValue(env, 'ADMIN_PANEL_SECOND_FACTOR_HASH_HEX') && hasValue(env, 'ADMIN_PANEL_SECOND_FACTOR_SALT_HEX');
  const rawSecondFactorReady = hasValue(env, 'ADMIN_PANEL_SECOND_FACTOR');
  if (production && !secondFactorHashReady) {
    errors.push('Üretimde ADMIN_PANEL_SECOND_FACTOR_HASH_HEX ve ADMIN_PANEL_SECOND_FACTOR_SALT_HEX zorunludur.');
  }
  if (production && rawSecondFactorReady) {
    errors.push('Üretimde ADMIN_PANEL_SECOND_FACTOR raw değer olarak tutulamaz; hash+salt kullanılmalı.');
  }

  if (production && !hasValue(env, 'PUBLIC_BASE_URL')) {
    errors.push('Üretimde PUBLIC_BASE_URL zorunludur.');
  }
  if (production && hasValue(env, 'PUBLIC_BASE_URL')) {
    const originError = validateOriginForProduction(String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''));
    if (originError) errors.push(`PUBLIC_BASE_URL geçersiz: ${originError}`);
  }
  if (production && hasValue(env, 'PUBLIC_BACKEND_ORIGIN')) {
    const originError = validateOriginForProduction(String(env.PUBLIC_BACKEND_ORIGIN || '').replace(/\/+$/, ''));
    if (originError) errors.push(`PUBLIC_BACKEND_ORIGIN geçersiz: ${originError}`);
  }

  if (production && !isTruthyFlag(env.SECURITY_CSP_STRICT)) {
    warnings.push('SECURITY_CSP_STRICT=1 henüz aktif değil; inline script/style temizliği tamamlanınca aktif edilmeli.');
  }

  return { ok: errors.length === 0, warnings, errors };
}

module.exports = {
  DEFAULT_ENV_FILES,
  loadEnvFiles,
  parseEnvLine,
  parseCsv,
  isTruthyFlag,
  isProductionEnv,
  looksLikeRawFirebaseKey,
  normalizeUrlBase,
  normalizeUrlOrigin,
  normalizeRuntimeEnv,
  validateRuntimeEnv
};
