const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const env = require('./server/config/env');
const { corsOptions } = require('./server/config/cors');
const firebase = require('./server/config/firebaseAdmin');
const { apiLimiter, requireAuth, requireAdmin } = require('./server/core/security');
const { routeData } = require('./server/core/smartDataRouter');
const { runtimeStore } = require('./server/core/runtimeStore');
const { runSafeFirestoreCleanup } = require('./server/core/firestoreCleanupService');
const { addAdminLog, sanitizeRuntimeLogPayload } = require('./server/admin/adminRuntimeLogStore');
const createClientErrorsRouter = require('./server/routes/client-errors.routes');
const { listRecentActivities } = require('./server/core/recentActivityService');

function safeErrorMessage(error, fallback = 'SERVER_ERROR') {
  return String(error?.message || error || fallback)
    .replace(/[A-Za-z0-9+/=]{80,}/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/(apiKey|token|secret|password|privateKey|serviceAccount)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 400);
}

function safeErrorFingerprint(error, code = 'SERVER_ERROR') {
  const source = String(error?.stack || error?.message || error || code).slice(0, 4000);
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function reportProcessFailure(code, error) {
  const message = safeErrorMessage(error, code);
  const fingerprint = safeErrorFingerprint(error, code);
  addAdminLog('process.failure', {
    level: 'critical',
    source: 'server',
    category: 'process',
    code,
    message,
    safeContext: { fingerprint }
  });
  console.error('[process:failure]', JSON.stringify({ code, message, fingerprint }));
}
process.on('unhandledRejection', (reason) => reportProcessFailure('UNHANDLED_REJECTION', reason));
process.on('uncaughtException', (error) => reportProcessFailure('UNCAUGHT_EXCEPTION', error));

const fb = firebase.initFirebaseAdmin();
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin(origin, callback) { const allowed = !origin || env.allowedOrigins.includes(env.normalizeOrigin(origin)); callback(null, allowed); }, credentials: true } });

app.disable('x-powered-by');

function buildContentSecurityPolicy() {
  const backendOrigin = env.publicBackendOrigin || 'https://emirhan-siye.onrender.com';
  const apiBase = env.publicApiBase || backendOrigin;
  const connectSrc = [
    "'self'",
    env.publicBaseUrl,
    env.canonicalOrigin,
    backendOrigin,
    apiBase,
    backendOrigin.replace(/^https:/i, 'wss:'),
    apiBase.replace(/^https:/i, 'wss:')
  ].filter(Boolean);
  return {
    useDefaults: true,
    reportOnly: env.security.cspReportOnly && !env.security.cspStrict,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'self'"],
      "form-action": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      "img-src": ["'self'", 'data:', 'blob:', env.publicBaseUrl, env.canonicalOrigin].filter(Boolean),
      "font-src": ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      "connect-src": Array.from(new Set(connectSrc)),
      "media-src": ["'self'"],
      "worker-src": ["'self'", 'blob:'],
      "manifest-src": ["'self'"]
    }
  };
}

app.use(helmet({
  contentSecurityPolicy: env.security.cspReportOnly || env.security.cspStrict ? buildContentSecurityPolicy() : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'sameorigin' }
}));
app.use(compression());

app.use((req, res, next) => {
  const inbound = String(req.headers['x-request-id'] || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
  req.requestId = inbound || `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.use('/api', cors(corsOptions));
app.options('/api/*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

function normalizeMaintenanceGames(data = {}) {
  const src = data && typeof data === 'object' && data.games && typeof data.games === 'object' ? data.games : data;
  const keys = ['general', 'system', 'crash', 'chess', 'pisti', 'classic', 'pattern-master', 'space-pro', 'snake-pro', 'market', 'wheel', 'promo'];
  const out = {};
  keys.forEach((key) => { out[key] = !!src?.[key]; });
  return out;
}
function maintenanceGamesRaw() {
  const stored = runtimeStore.temporary.get('admin:maintenance');
  return normalizeMaintenanceGames(stored?.games || stored || {});
}
let maintenanceReadPromise = null;
let maintenanceReadAt = 0;
async function getMaintenanceGames({ force = false } = {}) {
  const cached = maintenanceGamesRaw();
  const hasCacheSnapshot = maintenanceReadAt > 0 && cached && typeof cached === 'object';
  const cacheAge = Date.now() - Number(maintenanceReadAt || 0);
  if (!force && hasCacheSnapshot && cacheAge < 2500) return cached;
  const db = fb?.db;
  if (!db) return cached;
  if (!force && maintenanceReadPromise) return maintenanceReadPromise;
  maintenanceReadPromise = db.collection('gameConfig').doc('maintenance').get()
    .then((snap) => {
      maintenanceReadAt = Date.now();
      if (!snap.exists) {
        const empty = normalizeMaintenanceGames({});
        runtimeStore.temporary.set('admin:maintenance', { games: empty, at: maintenanceReadAt, actor: { source: 'empty-firestore' } }, 30 * 86400000);
        return empty;
      }
      const data = snap.data() || {};
      const games = normalizeMaintenanceGames(data.games && typeof data.games === 'object' ? data.games : data);
      runtimeStore.temporary.set('admin:maintenance', { games, at: Number(data.at || maintenanceReadAt), actor: data.actor || { source: 'request-hydrate' } }, 30 * 86400000);
      return games;
    })
    .catch((error) => {
      maintenanceReadAt = Date.now();
      console.warn('[maintenance:read:failed]', error?.message || error);
      return cached;
    })
    .finally(() => { maintenanceReadPromise = null; });
  return maintenanceReadPromise;
}
function normalizeGameSlugForMaintenance(value = '') {
  const raw = String(value || '').toLowerCase().replace(/\.html(?:$|[?#])/i, '').replace(/\/$/, '');
  if (/chess|satranc|satranç/.test(raw)) return 'chess';
  if (/crash/.test(raw)) return 'crash';
  if (/pisti|pişti/.test(raw)) return 'pisti';
  if (/snake/.test(raw)) return 'snake-pro';
  if (/space/.test(raw)) return 'space-pro';
  if (/pattern/.test(raw)) return 'pattern-master';
  return '';
}
function isMaintenanceBlockedFromGames(games = {}, gameKey = '') {
  const key = normalizeGameSlugForMaintenance(gameKey) || String(gameKey || '').toLowerCase();
  const classicKeys = new Set(['pattern-master', 'space-pro', 'snake-pro']);
  return !!games.general || !!games.system || !!games[key] || (!!games.classic && classicKeys.has(key));
}
function isMaintenanceBlockedRaw(gameKey = '') {
  return isMaintenanceBlockedFromGames(maintenanceGamesRaw(), gameKey);
}
async function isMaintenanceBlockedAsync(gameKey = '', options = {}) {
  const games = await getMaintenanceGames(options);
  return isMaintenanceBlockedFromGames(games, gameKey);
}
async function maintenanceRedirectMiddleware(req, res, next) {
  try {
    const pathValue = String(req.path || req.originalUrl || '').toLowerCase();
    const gameKey = normalizeGameSlugForMaintenance(pathValue);
    if (!gameKey) return next();
    const isGamePage = /^\/games\//i.test(pathValue) || /^\/(crash|chess|satranc|satranç|pisti|pişti|snake|snake-pro|space|space-pro|pattern-master|patternmaster)(?:\/|\.html|$)/i.test(pathValue) || /online%20oyunlar|online oyunlar/i.test(pathValue);
    if (!isGamePage) return next();
    if (await isMaintenanceBlockedAsync(gameKey)) return res.redirect(302, `/?pm_maintenance=${encodeURIComponent(gameKey)}`);
    return next();
  } catch (error) {
    console.warn('[maintenance:redirect:failed]', error?.message || error);
    return next();
  }
}
app.use(maintenanceRedirectMiddleware);

function resolveGameScopeFromPath(value = '') {
  const pathValue = String(value || '').toLowerCase();
  if (pathValue.includes('/chess') || pathValue.includes('/satranc') || pathValue.includes('/satranç')) return 'chess';
  if (pathValue.includes('/crash')) return 'crash';
  if (pathValue.includes('/pisti') || pathValue.includes('/pişti')) return 'pisti';
  if (pathValue.includes('/snake-pro') || pathValue.includes('/snake')) return 'snake-pro';
  if (pathValue.includes('/space-pro') || pathValue.includes('/space')) return 'space-pro';
  if (pathValue.includes('/pattern-master') || pathValue.includes('/patternmaster')) return 'pattern-master';
  if (pathValue.includes('/admin')) return 'admin';
  if (pathValue.includes('/market')) return 'market';
  if (pathValue.includes('/wheel') || pathValue.includes('/promo') || pathValue.includes('/bonus') || pathValue.includes('/profile') || pathValue.includes('/leaderboard') || pathValue.includes('/user-stats') || pathValue === '/' || pathValue.includes('/index.html')) return 'home';
  return 'system';
}

function areaLabel(scope) {
  return scope === 'home' ? 'AnaSayfa'
    : scope === 'chess' ? 'Satranç'
      : scope === 'crash' ? 'Crash'
        : scope === 'pisti' ? 'Pişti'
          : scope === 'snake-pro' ? 'Snake Pro'
            : scope === 'space-pro' ? 'Space Pro'
              : scope === 'pattern-master' ? 'Pattern Master'
                : scope === 'admin' ? 'Admin Paneli'
                  : scope === 'market' ? 'Market'
                    : 'Sistem';
}

function expectedStatus(statusCode = 0) {
  const status = Number(statusCode || 0);
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 422 || status === 429;
}

function apiGameFromUrl(value = '') {
  const url = String(value || '').toLowerCase();
  if (/\/api\/(?:games\/)?crash(?:[/?#]|$)/.test(url)) return 'crash';
  if (/\/api\/(?:games\/)?chess(?:[/?#]|$)/.test(url)) return 'chess';
  if (/\/api\/(?:games\/)?(?:pisti|pisti-online)(?:[/?#]|$)/.test(url)) return 'pisti';
  if (/\/api\/games\/(?:snake|snake-pro)(?:[/?#]|$)/.test(url)) return 'snake-pro';
  if (/\/api\/games\/(?:space|space-pro)(?:[/?#]|$)/.test(url)) return 'space-pro';
  if (/\/api\/games\/pattern-master(?:[/?#]|$)/.test(url)) return 'pattern-master';
  return '';
}

function isExpectedGameApiStatus(url = '', statusCode = 0) {
  const status = Number(statusCode || 0);
  const pathValue = String(url || '').toLowerCase();
  const gameKey = apiGameFromUrl(pathValue);
  if (!gameKey) return false;
  if (status === 503 && isMaintenanceBlockedRaw(gameKey)) return true;
  if (status === 401 || status === 403) return true;
  if (status === 404 && /\/api\/(?:games\/)?(?:chess|pisti|pisti-online)\/(?:state|room|table)/.test(pathValue)) return true;
  if (status === 409 && /\/api\/(?:games\/)?chess\/(?:create|join|draw|move|resign|leave|extend|ping)/.test(pathValue)) return true;
  if (status === 409 && /\/api\/(?:games\/)?(?:crash)\/(?:bet|cashout|resume|profile)/.test(pathValue)) return true;
  if (status === 409 && /\/api\/(?:games\/)?(?:pisti|pisti-online)\//.test(pathValue)) return true;
  return false;
}

function safeApiIssueCode(value = '') {
  return String(value || '').replace(/[^A-Z0-9_:-]/gi, '').toUpperCase().slice(0, 80);
}

function capturedResponseCode(res) {
  const payload = res?.locals?.pmResponsePayload || {};
  return safeApiIssueCode(payload.error || payload.code || payload.reason || '');
}

function marketPurchaseIssueCopy(code = '', statusCode = 0) {
  const status = Number(statusCode || 0);
  const key = safeApiIssueCode(code);
  const map = {
    INSUFFICIENT_BALANCE: {
      reason: 'Kullanıcının MC bakiyesi bu ürün için yeterli değil.',
      solution: 'Kullanıcı bakiyesi veya ürün fiyatı kontrol edilmeli.',
      severity: 'info',
      scope: 'market.expected'
    },
    EMAIL_VERIFICATION_REQUIRED: {
      reason: 'Kullanıcı market işlemi için gerekli e-posta doğrulamasını tamamlamamış.',
      solution: 'Kullanıcı e-posta adresini doğruladıktan sonra satın alma tekrar denenmeli.',
      severity: 'info',
      scope: 'market.expected'
    },
    ITEM_COMING_SOON: {
      reason: 'Satın alınmak istenen kategori şu anda satışa açık değil.',
      solution: 'Market ürün kategorisi ve aktif satış standardı kontrol edilmeli.',
      severity: 'warning',
      scope: 'market.config'
    },
    ITEM_UNAVAILABLE: {
      reason: 'Market ürünü satış koşullarını sağlamıyor. Aktiflik, görünürlük, stok veya fiyat bilgisi eksik olabilir.',
      solution: 'Admin Market panelinde ürünün aktif, görünür, stoklu ve fiyatlı olduğundan emin olunmalı.',
      severity: 'warning',
      scope: 'market.config'
    },
    ITEM_NOT_FOUND: {
      reason: 'Market ürünü katalogda bulunamadı veya ürün ID eşleşmedi.',
      solution: 'Ürün ID, Firestore marketItems kaydı ve statik katalog eşleşmesi kontrol edilmeli.',
      severity: 'warning',
      scope: 'market.config'
    },
    MARKET_OFFLINE: {
      reason: 'Market şu anda admin tarafından çevrim dışı bırakılmış.',
      solution: 'Market açıksa durum kaydı ve bakım modu kontrol edilmeli.',
      severity: 'info',
      scope: 'market.expected'
    },
    MARKET_FRAME_PATH_NOT_FOUND: {
      reason: 'Market çerçeve yolu bulunamadı veya geçerli asset listesiyle eşleşmedi.',
      solution: 'Çerçeve yolu /public/assets/market/frames/market-1.png formatında kontrol edilmeli.',
      severity: 'warning',
      scope: 'market.config'
    }
  };
  if (map[key]) return { code: key, area: 'Market', game: 'market', title: 'Market işlemi tamamlanamadı.', ...map[key] };
  if (status >= 400) {
    return {
      code: key || 'MARKET_REQUEST_REJECTED',
      area: 'Market',
      game: 'market',
      scope: 'market.warning',
      severity: 'warning',
      title: 'Market işlemi tamamlanamadı.',
      reason: 'Market isteği güvenli kontrol tarafından reddedildi.',
      solution: 'Ürün durumu, e-posta doğrulaması, stok ve kullanıcı bakiyesi kontrol edilmeli.'
    };
  }
  return null;
}

function classifyApiIssue(req, res, statusCode) {
  const status = Number(statusCode || 0);
  const pathValue = String(req.originalUrl || req.url || '');
  const responseCode = capturedResponseCode(res);
  if (/^\/api\/market\/(purchase|equip)(?:[/?#]|$)/i.test(pathValue)) {
    const marketCopy = marketPurchaseIssueCopy(responseCode, status);
    if (marketCopy) return marketCopy;
  }
  const scope = resolveGameScopeFromPath(pathValue);
  return {
    code: status >= 500 ? 'SERVER_ROUTE_ERROR' : (responseCode || 'UNEXPECTED_API_STATUS'),
    scope: status >= 500 ? 'api.error' : 'api.warning',
    area: areaLabel(scope),
    game: scope,
    severity: status >= 500 ? 'error' : 'warning',
    title: status >= 500 ? 'İşlem tamamlanamadı.' : 'İşlem başlatılamadı.',
    reason: status >= 500 ? 'İşlem sunucu tarafında tamamlanamadı.' : 'İstek güvenli şekilde tamamlanamadı.',
    solution: status >= 500 ? 'İlgili işlem güvenli hata detayıyla kontrol edilmeli.' : 'Oturum, yetki ve işlem adımları kontrol edilip tekrar denenmeli.'
  };
}

function shouldRecordApiIssue(req, statusCode) {
  const status = Number(statusCode || 0);
  if (status < 400) return false;
  const url = String(req.originalUrl || req.url || '');
  if (/\/api\/client-errors?$/i.test(url)) return false;
  if (/^\/api\/me(?:[/?#]|$)/i.test(url) && (status === 401 || status === 403)) return false;
  if (/\/api\/auth\/admin\/(matrix\/(identity|status|step-email|step-password|step-name|logout)|bootstrap)(?:[/?#]|$)/i.test(url) && status >= 400 && status < 500) return false;
  if (isExpectedGameApiStatus(url, status)) return false;
  return true;
}

function safePath(req) {
  return String(req.originalUrl || req.url || '').slice(0, 240);
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !res.locals.pmResponsePayload) {
      res.locals.pmResponsePayload = {
        ok: body.ok === true,
        error: safeApiIssueCode(body.error || body.code || ''),
        code: safeApiIssueCode(body.code || body.error || ''),
        message: String(body.message || '').slice(0, 240)
      };
    }
    return originalJson(body);
  };
  res.on('finish', () => {
    if (res.locals.pmServerExceptionLogged && Number(res.statusCode || 0) >= 500) return;
    if (!shouldRecordApiIssue(req, res.statusCode)) return;
    const status = Number(res.statusCode || 0);
    const copy = classifyApiIssue(req, res, status);
    const row = {
      id: `api_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      scope: copy.scope || (status >= 500 ? 'api.error' : 'api.warning'),
      area: copy.area || areaLabel(copy.game || resolveGameScopeFromPath(req.originalUrl || req.url)),
      game: copy.game || resolveGameScopeFromPath(req.originalUrl || req.url),
      method: req.method,
      path: safePath(req),
      status,
      ms: Date.now() - startedAt,
      requestId: req.requestId,
      code: copy.code || (status >= 500 ? 'SERVER_ROUTE_ERROR' : 'UNEXPECTED_API_STATUS'),
      message: `${req.method} ${safePath(req)} ${status}${copy.code ? ` ${copy.code}` : ''}`,
      error: `${req.method} ${safePath(req)} ${status}${copy.code ? ` ${copy.code}` : ''}`,
      reason: copy.reason || (status >= 500 ? 'İşlem sunucu tarafında tamamlanamadı.' : 'İstek güvenli şekilde tamamlanamadı.'),
      solution: copy.solution || (status >= 500 ? 'İlgili işlem güvenli hata detayıyla kontrol edilmeli.' : 'Oturum, yetki ve işlem adımları kontrol edilip tekrar denenmeli.'),
      title: copy.title || (status >= 500 ? 'İşlem tamamlanamadı.' : 'İşlem başlatılamadı.'),
      createdAt: Date.now(),
      severity: copy.severity || (status >= 500 ? 'error' : 'warning')
    };
    runtimeStore.errors.set(row.id, row, env.runtimeLog.retentionHours * 60 * 60 * 1000);
    addAdminLog('api.issue', { ...row, level: row.severity, source: row.area, category: row.scope, code: row.code });
    const log = status >= 500 ? console.error : console.warn;
    log(status >= 500 ? '[api:error]' : '[api:warning]', JSON.stringify({ method: row.method, path: row.path, status: row.status, code: row.code, ms: row.ms, requestId: row.requestId, game: row.game }));
  });
  next();
});

const startupReport = env.safeStartupReport();
if (startupReport.missing.length) {
  addAdminLog('env.startup.warning', {
    level: 'error',
    source: 'server',
    category: 'env',
    code: 'ENV_REQUIRED_VALUE_MISSING',
    message: 'Zorunlu Render ENV kontrolü tamamlanamadı.',
    safeContext: startupReport
  });
  console.error('[env:startup:error]', JSON.stringify({ missing: startupReport.missing }));
} else if (startupReport.warnings.length && (process.env.RENDER_ENV_WARNING_LOGS === '1' || process.env.RENDER_VERBOSE_ENV === '1')) {
  addAdminLog('env.startup.info', {
    level: 'info',
    source: 'server',
    category: 'env',
    code: 'ENV_OPTIONAL_CHECK_NOTICE',
    message: 'Render ENV opsiyonel kontrol notu üretildi.',
    safeContext: startupReport
  });
  if (process.env.RENDER_VERBOSE_ENV === '1') console.warn('[env:startup:notice]', JSON.stringify({ warnings: startupReport.warnings }));
}
app.use('/api', apiLimiter);
const staticOptions = Object.freeze({
  extensions: ['html'],
  maxAge: env.nodeEnv === 'production' ? '15m' : 0,
  redirect: false,
  dotfiles: 'ignore',
  fallthrough: true,
  setHeaders(res, filePath) {
    const lower = String(filePath || '').toLowerCase();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (lower.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, max-age=0');
    else if (/\.(?:js|css)$/i.test(lower)) res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  }
});
function sendRootFile(fileName) {
  return (_req, res) => res.sendFile(path.join(__dirname, fileName));
}
app.get(['/', '/index.html'], sendRootFile('index.html'));
app.get('/style.css', sendRootFile('style.css'));
app.get('/script.js', sendRootFile('script.js'));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/admin', express.static(path.join(__dirname, 'admin'), staticOptions));
app.use('/games', express.static(path.join(__dirname, 'games'), staticOptions));

function publicHealthPayload() { return { ok: true }; }
function adminHealthPayload() { return { ok:true, service:'playmatrix', env:env.nodeEnv, firebaseEnabled: !!fb.enabled, redisConfigured: !!env.redis?.url, runtimeLog: env.runtimeLog, time:Date.now() }; }
app.get('/health', (_req,res)=>res.json(publicHealthPayload()));
app.get('/api/health', (_req,res)=>res.json(publicHealthPayload()));
app.get('/api/v1/health', (_req,res)=>res.json(publicHealthPayload()));
app.get('/healthz', (_req,res)=>res.json(publicHealthPayload()));
app.get('/api/healthz', (_req,res)=>res.json(publicHealthPayload()));
app.get('/api/v1/admin/health', requireAuth, requireAdmin, (_req,res)=>res.json({ ok: true, data: adminHealthPayload(), message: '', code: 'SUCCESS' }));
function normalizeApiCode(value, ok = false) {
  const raw = String(value || (ok ? 'SUCCESS' : 'UNKNOWN_ERROR')).trim();
  return raw ? raw.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 80) : (ok ? 'SUCCESS' : 'UNKNOWN_ERROR');
}
function standardApiV1Response(_req, res, next) {
  const json = res.json.bind(res);
  res.json = (payload = {}) => {
    if (!payload || typeof payload !== 'object' || Buffer.isBuffer(payload)) return json(payload);
    const hasStandard = Object.prototype.hasOwnProperty.call(payload, 'ok') && Object.prototype.hasOwnProperty.call(payload, 'data') && Object.prototype.hasOwnProperty.call(payload, 'code');
    if (hasStandard) return json(payload);
    const ok = payload.ok !== false;
    const code = normalizeApiCode(payload.code || payload.error || payload.reason || payload.discarded, ok);
    const data = ok ? (payload.data !== undefined ? payload.data : payload) : (payload.data !== undefined ? payload.data : null);
    return json({ ok, data, message: '', code });
  };
  next();
}

app.use('/api', async (req, res, next) => {
  try {
    const pathValue = String(req.originalUrl || req.url || '').toLowerCase();
    if (pathValue.includes('/admin') || pathValue.includes('/healthz') || pathValue.includes('/client-errors')) return next();
    const games = await getMaintenanceGames();
    if (games.general || games.system) return res.status(503).json({ ok:false, error:'SYSTEM_MAINTENANCE', message:'Sistem geçici bakımda.' });
    return next();
  } catch (error) {
    console.warn('[maintenance:system-check:failed]', error?.message || error);
    return next();
  }
});
app.use(['/api/market','/api/marketplace','/api/v1/market','/api/v1/marketplace'], maintenanceFor('market'));
app.use(['/api/wheel','/api/v1/wheel'], maintenanceFor('wheel'));
app.use(['/api/promo','/api/v1/promo'], maintenanceFor('promo'));

const apiRouters = [
  require('./server/routes/auth.routes'),
  require('./server/routes/user.routes'),
  require('./server/routes/admin.routes'),
  require('./server/routes/economy.routes'),
  require('./server/routes/notification.routes'),
  require('./server/routes/email.routes'),
  require('./server/routes/market.routes'),
  require('./server/routes/wheel.routes'),
  require('./server/routes/promo.routes'),
  require('./server/routes/compat.routes')
];
apiRouters.forEach((router) => app.use('/api', router));
app.use('/api/v1', standardApiV1Response);
apiRouters.forEach((router) => app.use('/api/v1', router));

function maintenanceSnapshot() {
  return maintenanceGamesRaw();
}
function isMaintenanceBlocked(gameKey) {
  return isMaintenanceBlockedRaw(gameKey);
}
function maintenanceFor(gameKey) {
  return async (req, res, next) => {
    try {
      if (String(req.path || req.originalUrl || '').toLowerCase().startsWith('/admin')) return next();
      if (/^\/admin(?:\/|$)/.test(String(req.path || ''))) return next();
      if (await isMaintenanceBlockedAsync(gameKey)) return res.status(503).json({ ok:false, error:'GAME_MAINTENANCE', game:gameKey, message:'Bu alan geçici bakımda.' });
      return next();
    } catch (error) {
      console.warn('[maintenance:route-check:failed]', gameKey, error?.message || error);
      return next();
    }
  };
}

function hydrateMaintenanceFromFirestore() {
  return getMaintenanceGames({ force: true })
    .then((games) => {
      if (Object.keys(games).some((key) => !!games[key])) {
        console.warn('[maintenance:active]', JSON.stringify({ games: Object.keys(games).filter((key) => !!games[key]) }));
      }
      return games;
    })
    .catch((error) => {
      console.warn('[maintenance:hydrate:failed]', error?.message || error);
      return {};
    });
}
const startupMaintenanceReady = hydrateMaintenanceFromFirestore();

const crashGame = require('./server/games/crash');
const chessGame = require('./server/games/chess');
const pistiGame = require('./server/games/pisti');
app.use(['/api/games/crash','/api/crash','/api/v1/games/crash','/api/v1/crash'], maintenanceFor('crash'), crashGame.router);
app.use(['/api/games/chess','/api/chess','/api/v1/games/chess','/api/v1/chess'], maintenanceFor('chess'), chessGame.router);
app.use(['/api/games/pisti','/api/pisti-online','/api/v1/games/pisti','/api/v1/pisti-online'], maintenanceFor('pisti'), pistiGame.router);
app.use(['/api/games/snake-pro','/api/games/snake','/api/v1/games/snake-pro','/api/v1/games/snake'], maintenanceFor('snake-pro'), require('./server/games/snake-pro').router);
app.use(['/api/games/space-pro','/api/games/space','/api/v1/games/space-pro','/api/v1/games/space'], maintenanceFor('space-pro'), require('./server/games/space-pro').router);
app.use(['/api/games/pattern-master','/api/v1/games/pattern-master'], maintenanceFor('pattern-master'), require('./server/games/pattern-master').router);

function sanitizeClientStack(value = '') {
  return String(value || '')
    .split('\n')
    .slice(0, 6)
    .map((line) => line.replace(/https?:\/\/[^\s)]+/g, '[url]').replace(/[A-Za-z0-9+/=]{80,}/g, '[redacted]'))
    .join('\n')
    .slice(0, 900);
}

function sanitizeClientText(value = '', max = 500) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/(apiKey|token|secret|password|privateKey|serviceAccount)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, max);
}

function normalizeClientErrorPayload(raw = {}, req) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const pathValue = body.path || req.headers.referer || '';
  const safe = {
    game: sanitizeClientText(body.game || '', 60),
    scope: sanitizeClientText(body.scope || body.type || 'client.error', 120),
    category: sanitizeClientText(body.category || body.type || '', 120),
    code: sanitizeClientText(body.code || '', 80),
    message: sanitizeClientText(body.message || body.error || 'Frontend hata kaydı', 400),
    error: sanitizeClientText(body.error || body.message || 'Frontend hata kaydı', 400),
    path: sanitizeClientText(pathValue, 240),
    source: sanitizeClientText(body.source || body.module || 'client', 180),
    endpoint: sanitizeClientText(body.endpoint || '', 180),
    line: sanitizeClientText(body.line || '', 30),
    status: Number(body.status || 0) || 0,
    severity: sanitizeClientText(body.severity || 'error', 24),
    reason: sanitizeClientText(body.reason || '', 400),
    solution: sanitizeClientText(body.solution || '', 400),
    userAgent: sanitizeClientText(req.headers['user-agent'] || body.userAgent || '', 220),
    sanitizedStack: sanitizeClientStack(body.sanitizedStack || body.stack || ''),
    at: Date.now()
  };
  return safe;
}

async function captureClientError(req, res) {
  const payload = normalizeClientErrorPayload(req.body || {}, req);
  const game = String(payload.game || resolveGameScopeFromPath(`${payload.path || ''} ${payload.source || ''} ${payload.scope || ''} ${payload.endpoint || ''}`)).toLowerCase();
  const sourceText = `${payload.path || ''} ${payload.source || ''} ${payload.scope || ''} ${payload.endpoint || ''}`.toLowerCase();
  const isKnownScope = game === 'chess' || game === 'crash' || game === 'home' || game === 'pisti' || game === 'snake-pro' || game === 'space-pro' || game === 'pattern-master' || game === 'admin' || sourceText.includes('/games/chess') || sourceText.includes('/api/chess') || sourceText.includes('/games/crash') || sourceText.includes('/api/crash') || sourceText.includes('/games/pisti') || sourceText.includes('/api/pisti') || sourceText.includes('pisti') || sourceText.includes('/public/js/games/crash/index.js') || sourceText.includes('crash-app') || sourceText.includes('satranc') || sourceText.includes('/api/wheel') || sourceText.includes('/api/promo') || sourceText.includes('/api/market') || sourceText.includes('/api/leaderboard') || sourceText.includes('/api/account') || sourceText.includes('/api/notifications') || sourceText.includes('home-core') || sourceText.includes('script.js') || sourceText.includes('/index.html') || sourceText.includes('anasayfa');
  if (!isKnownScope) return res.status(202).json({ ok:true, discarded:'unknown-scope' });
  const normalizedGame = game === 'crash' || sourceText.includes('crash') ? 'crash' : (game === 'chess' || sourceText.includes('chess') || sourceText.includes('satranc')) ? 'chess' : (game === 'pisti' || sourceText.includes('pisti') || sourceText.includes('pişti')) ? 'pisti' : (game === 'snake-pro' || sourceText.includes('snake')) ? 'snake-pro' : (game === 'space-pro' || sourceText.includes('space')) ? 'space-pro' : (game === 'pattern-master' || sourceText.includes('pattern')) ? 'pattern-master' : game === 'admin' ? 'admin' : 'home';
  const message = String(payload.message || payload.error || '').trim();
  const code = String(payload.code || message).toUpperCase();
  const scope = String(payload.scope || payload.category || 'client.error');
  const status = Number(payload.status || 0) || 0;
  const expectedCodes = new Set(['STATE_VERSION_MISMATCH','ROOM_NOT_FOUND','ROOM_CLOSED','CASHOUT_NOT_AVAILABLE','CASHOUT_TOO_LATE','BET_ALREADY_LOST','BET_REFUNDED','REFUND_IN_PROGRESS','AUTO_CASHOUT_MISSED','AUTH_REQUIRED','UNAUTHENTICATED','USER_CANCELLED']);
  const isExpectedHomeTransient = normalizedGame === 'home'
    && /home\.profile\.load|home\.market\.load|game\.topbar\.sync|public\/game-topbar-sync\.js/i.test(`${scope} ${sourceText}`)
    && /network_error|abort|aborted|auth\/network-request-failed/i.test(`${code} ${message}`);
  if (isExpectedHomeTransient && !status) {
    return res.status(202).json({ ok: true, discarded: 'expected-home-transient' });
  }
  const expectedFlow = expectedCodes.has(code) || (status >= 400 && status < 500);
  const endpointOrPath = String(payload.endpoint || payload.path || '');
  const endpointLower = endpointOrPath.toLowerCase();
  if ((status === 401 || status === 403) && /^\/api\/me(?:[/?#]|$)/i.test(endpointOrPath)) {
    return res.status(202).json({ ok: true, discarded: 'expected-session-check' });
  }
  const gameForEndpoint = apiGameFromUrl(endpointOrPath || sourceText);
  if (status === 503 && gameForEndpoint) {
    return res.status(202).json({ ok: true, discarded: 'maintenance-api-noise' });
  }
  if (isExpectedGameApiStatus(endpointOrPath || sourceText, status)) {
    return res.status(202).json({ ok: true, discarded: 'expected-game-flow' });
  }
  if (!status && gameForEndpoint && /load failed|failed to fetch|network|timeout|request_timeout|abort/i.test(`${code} ${message}`) && /\/(profile|lobby|state|ping|resume|poll|status)(?:[/?#]|$)/i.test(endpointOrPath || sourceText)) {
    return res.status(202).json({ ok: true, discarded: 'expected-game-network-poll' });
  }
  const lowValueText = `${message} ${scope} ${sourceText}`.toLowerCase();
  const hasActionableJsError = /typeerror|referenceerror|syntaxerror|rangeerror|securityerror|notallowed|undefined is not|is not a function|cannot read|failed to construct/i.test(lowValueText);
  if (!hasActionableJsError && (/window\.error|promise\.rejection|home\.promise_rejection|data-pm-action|classic\.start|classic\.submit|api\.(get|post)\.\/api\/(chess|crash|pisti)/i.test(lowValueText))) {
    return res.status(202).json({ ok: true, discarded: 'low-value-runtime-noise' });
  }
  if (/data-pm-action|home\.promise_rejection|classic\.start|classic\.submit/.test(lowValueText) && !hasActionableJsError) {
    return res.status(202).json({ ok: true, discarded: 'low-value-ui-noise' });
  }
  if (!status && (/^frontend hata kaydı$/i.test(message) || /window\.error|promise\.rejection/.test(lowValueText)) && !hasActionableJsError) {
    return res.status(202).json({ ok: true, discarded: 'low-value-client-noise' });
  }
  const dedupeKey = `clientIssue:${normalizedGame}:${scope}:${message.slice(0,120)}:${String(payload.source || payload.endpoint || '').slice(-100)}:${payload.line || ''}:${status}`;
  if (runtimeStore.temporary.get(dedupeKey)) return res.status(202).json({ ok:true, deduped:true });
  runtimeStore.temporary.set(dedupeKey, true, Math.max(Number(env.runtimeLog.duplicateWindowMs || 0) || 0, 10 * 60 * 1000));
  const row = {
    id:`client_${normalizedGame}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    game: normalizedGame,
    scope,
    category: payload.category || scope,
    code: payload.code || '',
    path: payload.path,
    source: payload.source,
    endpoint: payload.endpoint,
    line: payload.line,
    status,
    userAgent: payload.userAgent,
    sanitizedStack: payload.sanitizedStack,
    area: normalizedGame === 'chess' ? 'Satranç Frontend' : normalizedGame === 'crash' ? 'Crash Frontend' : normalizedGame === 'pisti' ? 'Pişti Frontend' : normalizedGame === 'snake-pro' ? 'Snake Pro Frontend' : normalizedGame === 'space-pro' ? 'Space Pro Frontend' : normalizedGame === 'pattern-master' ? 'Pattern Master Frontend' : normalizedGame === 'admin' ? 'Admin Frontend' : 'AnaSayfa Frontend',
    error: String(payload.message || payload.error || 'Frontend hata kaydı').slice(0, 400),
    reason: String(payload.reason || `Kaynak: ${String(payload.source || payload.endpoint || 'bilinmiyor').slice(0, 180)}${payload.line ? `:${payload.line}` : ''}`).slice(0, 400),
    solution: String(payload.solution || 'İlgili ekran ve işlem adımları güvenli hata detayıyla kontrol edilmeli.').slice(0, 400),
    createdAt: Date.now(),
    severity: payload.severity || 'error'
  };
  runtimeStore.errors.set(row.id, row, env.runtimeLog.retentionHours * 60 * 60 * 1000);
  const clientLogCode = normalizedGame === 'chess'
    ? 'CHESS_CLIENT_ERROR'
    : normalizedGame === 'crash'
      ? 'CRASH_CLIENT_ERROR'
      : normalizedGame === 'pisti'
        ? 'PISTI_CLIENT_ERROR'
        : normalizedGame === 'snake-pro'
          ? 'SNAKE_CLIENT_ERROR'
          : normalizedGame === 'space-pro'
            ? 'SPACE_CLIENT_ERROR'
            : normalizedGame === 'pattern-master'
              ? 'PATTERN_CLIENT_ERROR'
              : normalizedGame === 'admin'
                ? 'ADMIN_CLIENT_ERROR'
                : 'HOME_CLIENT_ERROR';
  addAdminLog('client.runtime.error', {
    ...row,
    level: row.severity,
    source: row.area,
    category: row.scope,
    code: clientLogCode,
    message: row.error,
    safeContext: sanitizeRuntimeLogPayload({
      game: row.game,
      scope: row.scope,
      path: row.path,
      source: row.source,
      line: row.line,
      endpoint: row.endpoint,
      status: row.status,
      sanitizedStack: row.sanitizedStack,
      userAgent: row.userAgent
    })
  });
  if (row.severity === 'error' || row.severity === 'critical') console.error('[client:runtime:error]', JSON.stringify({ game: row.game, scope: row.scope, message: row.error, path: String(row.path || '').slice(0, 180), source: String(row.source || '').slice(0, 180), line: row.line || null }));
  res.status(202).json({ ok:true, stored:'runtime' });
}

function renderMemoryRecentWinners(limit = 5) {
  const safeLimit = Math.max(1, Math.min(5, Math.trunc(Number(limit || 5))));
  const wheelRows = (runtimeStore.temporary.get('wheel:recentWinners') || []).map((item) => ({
    ...item,
    id: item.id || `wheel:${item.uid || 'user'}:${item.at || Date.now()}`,
    type: 'wheel',
    source: 'wheel',
    title: 'Günlük Çark Kazancı',
    game: 'wheel',
    gameName: 'Günlük Çark',
    badge: 'Canlı',
    memoryOnly: true
  }));
  const activityRows = listRecentActivities(100).map((item) => ({ ...item, memoryOnly: true }));
  const seen = new Set();
  return [...wheelRows, ...activityRows]
    .sort((a, b) => Number(b.at || b.createdAt || 0) - Number(a.at || a.createdAt || 0))
    .filter((item) => {
      const key = String(item.id || `${item.source || item.game}:${item.uid || ''}:${item.at || item.createdAt || ''}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, safeLimit);
}
app.get('/api/home/recent-winners', (req, res) => {
  res.json({ ok: true, memoryOnly: true, items: renderMemoryRecentWinners(req.query.limit || 5) });
});
app.get('/api/home/recent-activities', (req, res) => {
  res.json({ ok: true, memoryOnly: true, activities: renderMemoryRecentWinners(req.query.limit || 5) });
});

app.use('/api', createClientErrorsRouter(captureClientError));

const gamePages = Object.freeze({
  'crash': 'crash', 'chess': 'chess', 'satranc': 'chess', 'satranç': 'chess',
  'pisti': 'pisti', 'pişti': 'pisti', 'snake': 'snake-pro', 'snakepro': 'snake-pro', 'snake-pro': 'snake-pro',
  'space': 'space-pro', 'spacepro': 'space-pro', 'space-pro': 'space-pro', 'pattern-master': 'pattern-master',
  'patternmaster': 'pattern-master'
});
function sendGamePage(req, res, next) {
  const safeSlug = gamePages[String(req.params.slug || '').toLowerCase()] || '';
  if (!safeSlug) return next();
  if (isMaintenanceBlocked(safeSlug)) {
    return res.redirect(302, `/?pm_maintenance=${encodeURIComponent(safeSlug)}`);
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.sendFile(path.join(__dirname, 'games', safeSlug, 'index.html'));
}
app.get('/games/:slug', sendGamePage);
app.get('/games/:slug/', sendGamePage);
const legacyGameAliases = Object.freeze({
  '/Online Oyunlar/Crash.html': '/games/crash', '/Online Oyunlar/Crash': '/games/crash', '/Online%20Oyunlar/Crash.html': '/games/crash', '/Crash.html': '/games/crash', '/crash': '/games/crash',
  '/Online Oyunlar/Pisti.html': '/games/pisti', '/Online Oyunlar/Pisti': '/games/pisti', '/Online%20Oyunlar/Pisti.html': '/games/pisti', '/Pisti.html': '/games/pisti', '/pisti': '/games/pisti',
  '/Online Oyunlar/Satranc.html': '/games/chess', '/Online Oyunlar/Satranc': '/games/chess', '/Online%20Oyunlar/Satranc.html': '/games/chess', '/Satranc.html': '/games/chess', '/satranc': '/games/chess',
  '/Klasik Oyunlar/SnakePro.html': '/games/snake-pro', '/Klasik Oyunlar/SnakePro': '/games/snake-pro', '/Klasik%20Oyunlar/SnakePro.html': '/games/snake-pro', '/games/snake': '/games/snake-pro',
  '/Klasik Oyunlar/SpacePro.html': '/games/space-pro', '/Klasik Oyunlar/SpacePro': '/games/space-pro', '/Klasik%20Oyunlar/SpacePro.html': '/games/space-pro', '/games/space': '/games/space-pro',
  '/Klasik Oyunlar/PatternMaster.html': '/games/pattern-master', '/Klasik Oyunlar/PatternMaster': '/games/pattern-master', '/Klasik%20Oyunlar/PatternMaster.html': '/games/pattern-master'
});
for (const [from, to] of Object.entries(legacyGameAliases)) app.get(from, (_req, res) => res.redirect(302, to));


function sanitizeSocketText(value = '', max = 500) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
async function authenticateSocket(socket) {
  if (socket.data?.pmUid) return socket.data;
  const token = String(socket.handshake?.auth?.token || socket.handshake?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return socket.data || {};
  try {
    const latest = firebase.initFirebaseAdmin();
    if (!latest.auth) return socket.data || {};
    const decoded = await latest.auth.verifyIdToken(token);
    const uid = String(decoded.uid || '');
    if (!uid) {
      socket.emit('pm:auth_error', { ok:false, error:'AUTH_REQUIRED' });
      return socket.data || {};
    }
    socket.data.pmUid = uid;
    socket.data.pmEmail = String(decoded.email || '');
    if (socket.data.pmUid) socket.join(`user:${socket.data.pmUid}`);
  } catch (_error) {
    socket.emit('pm:auth_error', { ok:false, error:'BAD_TOKEN' });
  }
  return socket.data || {};
}

io.on('connection', socket => {
  runtimeStore.presence.set(socket.id, { socketId: socket.id, at: Date.now() });
  authenticateSocket(socket).catch(() => null);

  socket.on('presence:update', async data => {
    const ctx = await authenticateSocket(socket);
    const uid = String(ctx.pmUid || '').trim();
    if (!uid) return socket.emit('pm:auth_error', { ok:false, error:'AUTH_REQUIRED' });
    const row = { status: sanitizeSocketText(data?.status || 'online', 40), activity: sanitizeSocketText(data?.activity || '', 120), socketId: socket.id, uid, at: Date.now() };
    runtimeStore.presence.set(socket.id, row);
    socket.emit('presence:updated', { ok:true, at: row.at });
  });

  socket.on('game:matchmake_join', data => socket.emit('game:matchmake_joined', { ok:true, queued:false, gameType:data?.gameType || data?.game || 'unknown', message:'HTTP lobby active' }));
  socket.on('game:matchmake_leave', () => socket.emit('game:matchmake_left', { ok:true }));
  socket.on('matchmaking:join', data => socket.emit('matchmaking:status', { ok:true, queued:false, game:data?.game || 'unknown', message:'HTTP lobby active' }));
  socket.on('matchmaking:leave', () => socket.emit('matchmaking:left', { ok:true }));

  socket.on('client:error', async data => {
    const ctx = await authenticateSocket(socket);
    const uid = String(ctx.pmUid || '').trim();
    if (!uid) return socket.emit('pm:auth_error', { ok:false, error:'AUTH_REQUIRED' });
    const minuteKey = `socketClientErrorRate:${uid}:${Math.floor(Date.now() / 60000)}`;
    const currentCount = Number(runtimeStore.temporary.get(minuteKey) || 0);
    if (currentCount >= 20) return;
    runtimeStore.temporary.set(minuteKey, currentCount + 1, 70000);
    const safePayload = sanitizeRuntimeLogPayload({ ...(data || {}), socketId: socket.id, uid, source: data?.source || data?.page || 'client', category: data?.type || 'CLIENT_ERROR' });
    const message = String(safePayload.message || safePayload.error || 'Client runtime error').slice(0, 400);
    const duplicateKey = `socketClientErrorDup:${uid}:${String(safePayload.source || '').slice(0,120)}:${String(safePayload.category || '').slice(0,80)}:${message.slice(0,160)}`;
    if (runtimeStore.temporary.get(duplicateKey)) return;
    runtimeStore.temporary.set(duplicateKey, true, Math.max(Number(env.runtimeLog.duplicateWindowMs || 0) || 0, 60000));
    const id = `socket_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const row = { id, ...safePayload, at: Date.now(), message };
    runtimeStore.errors.set(id, row, env.runtimeLog.retentionHours * 60 * 60 * 1000);
    addAdminLog('client.error', { ...row, level: 'warning' });
    console.warn('[socket:client:error]', JSON.stringify({ uid, source: row.source, category: row.category, message: row.message }));
  });

  socket.on('disconnect', () => { runtimeStore.presence.delete(socket.id); });
});
if (typeof crashGame.installSocket === 'function') crashGame.installSocket(io);
chessGame.installSocket?.(io);
pistiGame.installSocket?.(io);

setInterval(()=>{ Object.values(runtimeStore).forEach(store => store.prune && store.prune()); }, 60_000).unref();

(async () => {
  try {
    const latest = firebase.initFirebaseAdmin();
    const dryRun = process.env.FIRESTORE_CLEANUP_DRY_RUN !== '0' || process.env.FIRESTORE_CLEANUP_ENABLED !== '1';
    const report = await runSafeFirestoreCleanup({ db: latest.db, dryRun, limit: 100 });
    if (Number(report?.patched || 0) > 0) console.warn('[firebase:cleanup:patched]', JSON.stringify({ patched: report.patched, legacyFields: Array.isArray(report.legacyFields) ? report.legacyFields.length : 0 }));
  } catch (error) {
    console.error('[firebase:cleanup:error]', { message: error.message });
  }
})();

function frontendAssetTypeFromPath(pathValue = '') {
  const lower = String(pathValue || '').toLowerCase();
  if (/\.html?(?:$|[?#])/.test(lower) || lower === '/' || lower.includes('/admin/')) return 'HTML';
  if (/\.css(?:$|[?#])/.test(lower)) return 'CSS';
  if (/\.m?js(?:$|[?#])/.test(lower)) return 'JS';
  if (/\.(?:png|jpe?g|webp|svg|gif|ico|avif|woff2?|ttf)(?:$|[?#])/.test(lower)) return 'ASSET';
  return '';
}

app.use((req, res) => {
  const fullPath = safePath(req);
  const assetType = frontendAssetTypeFromPath(fullPath);
  if (assetType) {
    const scope = resolveGameScopeFromPath(fullPath);
    const row = {
      id: `static_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      scope: `${assetType.toLowerCase()}.not_found`,
      game: scope,
      area: `${areaLabel(scope).replace('Backend', '').trim()} ${assetType}`.trim(),
      method: req.method,
      path: fullPath,
      status: 404,
      requestId: req.requestId || null,
      message: `${assetType} kaynağı bulunamadı: ${fullPath}`,
      error: `${req.method} ${fullPath} 404`,
      reason: 'İstenen statik kaynak ZIP içinde veya route eşleşmesinde bulunamadı.',
      solution: 'Dosya yolu, route alias, cache ve deploy içeriği kontrol edilmeli.',
      createdAt: Date.now(),
      severity: 'error'
    };
    runtimeStore.errors.set(row.id, row, env.runtimeLog.retentionHours * 60 * 60 * 1000);
    addAdminLog('static.asset.not_found', { ...row, level:'error', source:row.area, category:row.scope, code:`${assetType}_NOT_FOUND` });
  }
  res.status(404).json({ ok: false, error: 'NOT_FOUND', requestId: req.requestId || null });
});

app.use((err, req, res, next) => {
  const status = Number(err?.statusCode || err?.status || 500) || 500;
  const scope = resolveGameScopeFromPath(req.originalUrl || req.url);
  const publicError = status >= 500 ? 'INTERNAL_ERROR' : (err?.message || 'REQUEST_REJECTED');
  if (status >= 500) {
    res.locals.pmServerExceptionLogged = true;
    const row = {
      id: `server_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      scope: 'server.error',
      game: scope,
      area: areaLabel(scope),
      error: safeErrorMessage(err),
      message: safeErrorMessage(err),
      reason: 'Backend exception oluştu.',
      solution: 'Güvenli hata izi ve ilgili route/modül kontrol edilmeli.',
      fingerprint: safeErrorFingerprint(err, 'SERVER_ROUTE_ERROR'),
      path: safePath(req),
      method: req.method,
      status,
      requestId: req.requestId || null,
      createdAt: Date.now(),
      severity: 'error'
    };
    runtimeStore.errors.set(row.id, row, env.runtimeLog.retentionHours * 60 * 60 * 1000);
    addAdminLog('server.exception', { ...row, level: 'error', source: row.area, category: row.scope, code: 'SERVER_ROUTE_ERROR' });
    console.error('[server:error]', JSON.stringify({ message: row.message, fingerprint: row.fingerprint, path: row.path, method: row.method, game: row.game, requestId: row.requestId }));
  }
  res.status(status).json({ ok: false, error: publicError, requestId: req.requestId || null });
});

const port = Number(process.env.PORT || 3000);
async function startServer() {
  await startupMaintenanceReady.catch((error) => console.warn('[maintenance:startup:hydrate:failed]', error?.message || error));
  return server.listen(port, () => console.log(`[playmatrix] listening on ${port}`));
}
if (require.main === module) startServer();
module.exports = { app, server, io, startServer };
