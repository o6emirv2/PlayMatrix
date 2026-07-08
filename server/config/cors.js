const env = require('./env');
const { addAdminLog } = require('../admin/adminRuntimeLogStore');

const blockedCache = new Map();
const BLOCK_LOG_WINDOW_MS = 60_000;

function isOriginAllowed(origin) {
  const normalized = env.normalizeOrigin(origin);
  return !!normalized && env.allowedOrigins.includes(normalized);
}

function logBlockedOrigin(origin, path) {
  const normalized = env.normalizeOrigin(origin) || String(origin || 'unknown');
  const key = `${normalized}:${String(path || '').slice(0, 120)}`;
  const now = Date.now();
  const previous = blockedCache.get(key) || 0;
  if (now - previous < BLOCK_LOG_WINDOW_MS) return;
  blockedCache.set(key, now);
  addAdminLog('cors.blocked', {
    level: 'warning',
    source: 'server',
    category: 'cors',
    code: 'CORS_ORIGIN_NOT_ALLOWED',
    message: 'CORS origin reddedildi.',
    safeContext: { origin: normalized, path: String(path || '').slice(0, 180), allowedOrigins: env.allowedOrigins }
  });
  console.warn('[cors:blocked]', JSON.stringify({ origin: normalized, path: String(path || '').slice(0, 180) }));
}

function corsOptions(req, callback) {
  const origin = req.header('Origin');
  if (!origin) return callback(null, { origin: true, credentials: true });
  const allowed = isOriginAllowed(origin);
  if (!allowed) logBlockedOrigin(origin, req.originalUrl || req.url);
  return callback(null, {
    origin: allowed,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Session-Token', 'X-PlayMatrix-Session-Id', 'X-PlayMatrix-Client', 'X-PlayMatrix-User', 'X-Admin-Uid', 'X-Admin-Email', 'X-Admin-Client-Key', 'X-Admin-Reauth', 'X-Admin-Second-Factor', 'x-request-id', 'x-session-token', 'x-playmatrix-session-id', 'x-playmatrix-client', 'x-playmatrix-user', 'x-admin-uid', 'x-admin-email', 'x-admin-client-key', 'x-admin-reauth', 'x-admin-second-factor'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400
  });
}

module.exports = { corsOptions, isOriginAllowed };
