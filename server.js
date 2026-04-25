'use strict';

const { loadEnvFiles, validateRuntimeEnv } = require('./utils/env');
loadEnvFiles({ cwd: __dirname });

const express = require('express');
const helmet = require('helmet');
const http = require('http');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');

const { PORT, ALLOWED_ORIGINS } = require('./config/constants');
const { apiLimiter, authLimiter } = require('./middlewares/rateLimiters');
const { requestContext, writeLine, serializeError, logCaughtError } = require('./utils/logger');
const { applyCorsHeaders, buildSocketCors } = require('./utils/corsPolicy');
const { captureError, captureClientError } = require('./utils/errorMonitor');
const { getPublicRuntimeConfig } = require('./utils/publicRuntime');

const envValidation = validateRuntimeEnv(process.env);
if (!envValidation.ok) {
  console.error('❌ Geçersiz ortam değişkenleri:', envValidation.errors);
  throw new Error(`ENV_VALIDATION_FAILED: ${envValidation.errors.join(' | ')}`);
}
if (envValidation.warnings.length) {
  const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const message = isProd ? '⚠️ Üretim ortamı güvenlik uyarıları:' : '⚠️ Ortam doğrulama uyarıları:';
  console.warn(message, envValidation.warnings);
}

const { auth, getFirebaseStatus } = require('./config/firebase');
const { resolveOptionalAuthUser } = require('./middlewares/auth.middleware');
const { resolveAdminContext, hasEveryPermission } = require('./middlewares/admin.middleware');
const { getFeatureFlagsDocument } = require('./utils/featureFlagStore');

const profileRoutes = require('./routes/profile.routes');
const socialRoutes = require('./routes/social.routes');
const supportRoutes = require('./routes/support.routes');
const adminRoutes = require('./routes/admin.routes');
const liveRoutes = require('./routes/live.routes');
const crashRoutes = require('./routes/crash.routes');
const chessRoutes = require('./routes/chess.routes');
const pistiRoutes = require('./routes/pisti.routes');
const authRoutes = require('./routes/auth.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const chatRoutes = require('./routes/chat.routes');
const socialCenterRoutes = require('./routes/socialcenter.routes');
const classicRoutes = require('./routes/classic.routes');

const initSockets = require('./sockets');
const { initCrashEngine } = require('./engines/crashEngine');
const { initCrons } = require('./crons/tasks');

process.on('uncaughtException', (error) => {
  writeLine('error', 'uncaught_exception', {
    error: serializeError(error)
  });
  captureError(error, { scope: 'process', event: 'uncaughtException' }).catch(() => null);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  writeLine('error', 'unhandled_rejection', {
    error: serializeError(err)
  });
  captureError(err, { scope: 'process', event: 'unhandledRejection' }).catch(() => null);
});

const app = express();
const httpServer = http.createServer(app);

const MAINTENANCE_PUBLIC_PATH = '/Bakım/index.html';
const MAINTENANCE_REDIRECT_PATH = '/Bak%C4%B1m/index.html';

async function enforceMaintenanceMode(req, res, next) {
  try {
    const pathname = String(req.path || req.originalUrl || '').toLowerCase();
    const flags = await getFeatureFlagsDocument().catch((error) => { logCaughtError('maintenance.flags', error, { requestId: req.requestId || null, route: req.originalUrl || req.url || '' }); return null; });
    if (!flags) return next();
    const isCrash = pathname.includes('crash');
    const isPisti = pathname.includes('pisti');
    const isChess = pathname.includes('satranc') || pathname.includes('chess');
    const isClassic = pathname.includes('patternmaster') || pathname.includes('snakepro') || pathname.includes('spacepro');
    const blocked = !!flags.maintenanceMode
      || (isCrash && !!flags.crashMaintenance)
      || (isPisti && !!flags.pistiMaintenance)
      || (isChess && !!flags.chessMaintenance)
      || (isClassic && !!flags.classicGamesMaintenance);
    if (!blocked) return next();
    return res.redirect(302, MAINTENANCE_REDIRECT_PATH);
  } catch (error) {
    logCaughtError('maintenance.enforce', error, { requestId: req.requestId || null, route: req.originalUrl || req.url || '', uid: req.user?.uid || null });
    return next();
  }
}


function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return !!fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function buildHelmetCsp() {
  const strictCsp = envFlag('SECURITY_CSP_STRICT', false);
  const reportOnly = envFlag('SECURITY_CSP_REPORT_ONLY', false);
  const allowedOrigins = Array.isArray(ALLOWED_ORIGINS)
    ? ALLOWED_ORIGINS.filter((origin) => /^https?:\/\//i.test(String(origin || '').trim()))
    : [];
  const publicBackendOrigin = String(process.env.PUBLIC_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '');
  const publicApiBase = String(process.env.PUBLIC_API_BASE || '').trim().replace(/\/+$/, '');
  const derivedOrigins = [publicBackendOrigin];
  if (publicApiBase) {
    try {
      derivedOrigins.push(new URL(publicApiBase).origin);
    } catch (error) {
      logCaughtError('csp.derived_origin_parse', error, { value: publicApiBase });
    }
  }
  const connectOrigins = Array.from(new Set([...allowedOrigins, ...derivedOrigins].filter(Boolean)));

  const scriptSrc = ["'self'", 'https://www.gstatic.com', 'https://www.googleapis.com', 'https://cdnjs.cloudflare.com', ...connectOrigins];
  const styleSrc = ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'];
  const styleSrcAttr = strictCsp ? ["'none'"] : ["'unsafe-inline'"];
  if (!strictCsp) {
    scriptSrc.splice(1, 0, "'unsafe-inline'");
    styleSrc.splice(1, 0, "'unsafe-inline'");
  }

  return {
    useDefaults: true,
    reportOnly,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc,
      scriptSrcAttr: ["'none'"],
      styleSrc,
      styleSrcAttr,
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
      manifestSrc: ["'self'"],
      mediaSrc: ["'self'", 'data:', 'blob:'],
      frameSrc: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://encrypted-tbn0.gstatic.com', 'https://playmatrix.com.tr', 'https://www.playmatrix.com.tr', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com', 'https://firebasestorage.googleapis.com', 'https://*.firebasestorage.app', 'https://deckofcardsapi.com', 'https://images.unsplash.com', 'https://images.chesscomfiles.com', 'https://upload.wikimedia.org', 'https://www.shutterstock.com'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://firestore.googleapis.com', 'https://firebaseinstallations.googleapis.com', 'https://*.firebasedatabase.app', 'https://*.firebaseio.com', ...connectOrigins],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  };
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestContext);

app.use(helmet({
  contentSecurityPolicy: buildHelmetCsp(),
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  hsts: false
}));

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use((req, res, next) => {
  const result = applyCorsHeaders(req, res);
  if (result?.preflight) return;
  if (result?.ok) return next();
  res.locals.errorLogged = true;
  writeLine('error', 'http_cors_blocked', {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl || req.url || '',
    origin: req.headers.origin || null
  });
  return res.status(403).json({ ok: false, error: 'CORS engellendi.', requestId: req.requestId || null });
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression'] || req.headers.range) return false;
    if (req.path.startsWith('/sfx')) return false;
    return compression.filter(req, res);
  },
  threshold: 1024
}));

function firstExistingPath(candidates = [], scope = 'path.first_existing') {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (error) {
      logCaughtError(scope, error, { candidate });
    }
  }
  return null;
}

function normalizedName(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function findDirByNormalizedName(baseDir, expectedName) {
  try {
    const target = normalizedName(expectedName);
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const match = entries.find((entry) => entry.isDirectory() && normalizedName(entry.name) === target);
    return match ? path.join(baseDir, match.name) : null;
  } catch (error) {
    logCaughtError('path.find_dir_normalized', error, { baseDir, expectedName });
    return null;
  }
}

function findMaintenanceDir(baseDir) {
  const direct = firstExistingPath([
    path.join(baseDir, 'Bakım'),
    path.join(baseDir, 'Bakim'),
    path.join(baseDir, 'bakim'),
    findDirByNormalizedName(baseDir, 'bakim')
  ], 'maintenance.direct_lookup');
  if (direct) return direct;

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const match = entries.find((entry) => entry.isDirectory() && normalizedName(entry.name).startsWith('bak'));
    return match ? path.join(baseDir, match.name) : null;
  } catch (error) {
    logCaughtError('maintenance.fuzzy_lookup', error, { baseDir });
    return null;
  }
}

function resolveMaintenanceFile() {
  const dir = findMaintenanceDir(__dirname);
  return firstExistingPath([
    path.join(dir || '', 'index.html'),
    path.join(__dirname, 'Bakım', 'index.html'),
    path.join(__dirname, 'Bakim', 'index.html')
  ], 'maintenance.file_lookup');
}

function setHtmlHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
}

function mountGameHtmlAliases(label, absPath, routes = []) {
  if (!absPath) {
    writeLine('warn', 'html_alias_missing', { label });
    return;
  }

  const sendHtml = (_req, res) => {
    setHtmlHeaders(res);
    return res.sendFile(absPath);
  };

  routes.filter(Boolean).forEach((routePath) => app.get(routePath, sendHtml));
  writeLine('info', 'html_alias_mounted', { label, routes });
}

function mountFileAlias(routePath, filePath, maxAgeSeconds = 604800) {
  if (!routePath || !filePath) return;

  app.get(routePath, (_req, res, next) => {
    try {
      if (!fs.existsSync(filePath)) return next();
      const safeMaxAge = Math.max(0, Math.floor(maxAgeSeconds));
      res.setHeader('Cache-Control', safeMaxAge === 0 ? 'no-store, max-age=0' : `public, max-age=${safeMaxAge}`);
      return res.sendFile(filePath);
    } catch (error) {
      return next(error);
    }
  });
}

function mountStaticAlias(routePath, dirPath, options = {}) {
  try {
    if (!routePath || !dirPath || !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;

    app.use(routePath, express.static(dirPath, {
      maxAge: options.maxAge || '7d',
      fallthrough: true,
      index: false,
      extensions: options.extensions || false
    }));
  } catch (error) {
    logCaughtError('logger.ensure_dir_alias', error);
  }
}

[
  { fileName: 'style.css', maxAgeSeconds: 0 },
  { fileName: 'script.js', maxAgeSeconds: 0 },
  { fileName: 'site.webmanifest', maxAgeSeconds: 0 },
  { fileName: 'playmatrix-runtime.js', maxAgeSeconds: 0 },
  { fileName: 'avatar-frame.js', maxAgeSeconds: 0 },
  { fileName: 'avatar-frame.css', maxAgeSeconds: 0 },
  { fileName: 'shell-enhancements.js', maxAgeSeconds: 0 },
  { fileName: 'shell-enhancements.css', maxAgeSeconds: 0 },
  { fileName: 'logo.png', maxAgeSeconds: 604800 },
  { fileName: 'favicon.ico', maxAgeSeconds: 604800 },
  { fileName: 'apple-touch-icon.png', maxAgeSeconds: 604800 }
].forEach(({ fileName, maxAgeSeconds }) => {
  const resolved = firstExistingPath([
    path.join(__dirname, fileName),
    path.join(__dirname, 'public', fileName)
  ]);

  if (resolved) {
    mountFileAlias(`/${fileName}`, resolved, maxAgeSeconds);
  }
});

const safeStaticDirs = Array.from(new Set([
  path.join(__dirname, 'assets'),
  path.join(__dirname, 'public'),
  path.join(__dirname, 'img'),
  path.join(__dirname, 'Online Oyunlar'),
  path.join(__dirname, 'Klasik Oyunlar')
].filter((dir) => {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch (error) {
    logCaughtError('static.safe_dir_filter', error, { dir });
    return false;
  }
}))); 

safeStaticDirs.forEach((dir) => {
  const baseName = path.basename(dir);

  if (baseName === 'public') {
    const publicStaticOptions = { maxAge: '7d', index: false };
    app.use(express.static(dir, publicStaticOptions));
    app.use('/public', express.static(dir, publicStaticOptions));
  } else {
    app.use(`/${baseName}`, express.static(dir, { maxAge: '7d', index: false }));
  }
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

const frameRoot = firstExistingPath([
  path.join(__dirname, 'Cerceve'),
  path.join(__dirname, 'Çerçeve'),
  path.join(__dirname, 'Çerçeve'),
  findDirByNormalizedName(__dirname, 'cerceve')
]);

const frameDir = firstExistingPath([
  path.join(frameRoot || '', 'YENI'),
  path.join(frameRoot || '', 'YENİ'),
  path.join(frameRoot || '', 'Yeni'),
  frameRoot
]);

if (frameDir) {
  mountStaticAlias('/Cerceve', frameDir);
  mountStaticAlias('/Çerçeve', frameDir);
}

const MAINTENANCE_FILE = resolveMaintenanceFile();
if (MAINTENANCE_FILE) {
  mountGameHtmlAliases('Bakım/index.html', MAINTENANCE_FILE, [
    MAINTENANCE_PUBLIC_PATH,
    '/Bakim/index.html',
    '/bakim/index.html',
    '/maintenance/index.html'
  ]);
  app.get(['/Bakım', '/Bakim', '/bakim', '/maintenance'], (_req, res) => res.redirect(302, MAINTENANCE_REDIRECT_PATH));
} else {
  writeLine('warn', 'maintenance_file_missing', { expected: MAINTENANCE_PUBLIC_PATH });
}

mountGameHtmlAliases(
  'index.html',
  firstExistingPath([path.join(__dirname, 'index.html')]),
  ['/', '/index.html']
);

const gamePageRouteSets = [
  {
    label: 'Online Oyunlar/Satranc.html',
    file: firstExistingPath([
      path.join(__dirname, 'Satranc.html'),
      path.join(__dirname, 'Online Oyunlar', 'Satranc.html')
    ]),
    routes: ['/Online Oyunlar/Satranc', '/Online Oyunlar/Satranc.html', '/Satranc.html', '/online-games/chess', '/online-games/satranc', '/satranc', '/chess']
  },
  {
    label: 'Online Oyunlar/Pisti.html',
    file: firstExistingPath([
      path.join(__dirname, 'OnlinePisti.html'),
      path.join(__dirname, 'Pisti.html'),
      path.join(__dirname, 'Online Oyunlar', 'OnlinePisti.html'),
      path.join(__dirname, 'Online Oyunlar', 'Pisti.html')
    ]),
    routes: ['/Online Oyunlar/Pisti', '/Online Oyunlar/Pisti.html', '/Pisti.html', '/OnlinePisti.html', '/online-games/pisti', '/pisti']
  },
  {
    label: 'Online Oyunlar/Crash.html',
    file: firstExistingPath([
      path.join(__dirname, 'Crash.html'),
      path.join(__dirname, 'Online Oyunlar', 'Crash.html')
    ]),
    routes: ['/Online Oyunlar/Crash', '/Online Oyunlar/Crash.html', '/Crash.html', '/crash', '/online-games/crash']
  },
  {
    label: 'Klasik Oyunlar/PatternMaster.html',
    file: firstExistingPath([path.join(__dirname, 'Klasik Oyunlar', 'PatternMaster.html')]),
    routes: ['/Klasik Oyunlar/PatternMaster', '/Klasik Oyunlar/PatternMaster.html', '/classic-games/pattern-master', '/PatternMaster.html']
  },
  {
    label: 'Klasik Oyunlar/SpacePro.html',
    file: firstExistingPath([path.join(__dirname, 'Klasik Oyunlar', 'SpacePro.html')]),
    routes: ['/Klasik Oyunlar/SpacePro', '/Klasik Oyunlar/SpacePro.html', '/classic-games/space-pro', '/SpacePro.html']
  },
  {
    label: 'Klasik Oyunlar/SnakePro.html',
    file: firstExistingPath([path.join(__dirname, 'Klasik Oyunlar', 'SnakePro.html')]),
    routes: ['/Klasik Oyunlar/SnakePro', '/Klasik Oyunlar/SnakePro.html', '/classic-games/snake-pro', '/SnakePro.html']
  }
];

gamePageRouteSets.forEach(({ label, file, routes }) => {
  app.get(routes, enforceMaintenanceMode);
  mountGameHtmlAliases(label, file, routes);
});


mountGameHtmlAliases(
  'admin.html',
  firstExistingPath([path.join(__dirname, 'public', 'admin', 'index.html')]),
  ['/admin', '/admin/index.html', '/public/admin/index.html']
);

const ADMIN_DASHBOARD_PATH = firstExistingPath([path.join(__dirname, 'public', 'admin', 'admin.html')]);
const ADMIN_HEALTH_PATH = firstExistingPath([path.join(__dirname, 'public', 'admin', 'health.html')]);

async function sendGuardedAdminPage(req, res, next, filePath, requiredPermissions = []) {
  try {
    const optionalUser = await resolveOptionalAuthUser(req);
    if (!optionalUser?.uid) {
      return res.redirect(302, '/admin/index.html');
    }

    const adminContext = await resolveAdminContext({
      uid: optionalUser.uid,
      email: optionalUser.email || '',
      claims: optionalUser.claims || {}
    });

    if (!adminContext?.isAdmin || !hasEveryPermission(adminContext, requiredPermissions)) {
      return res.redirect(302, '/admin/index.html');
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(filePath);
  } catch (error) {
    logCaughtError('admin.guarded_page', error, { requestId: req.requestId || null, route: req.originalUrl || req.url || '' }, 'error');
    return next(error);
  }
}

if (ADMIN_DASHBOARD_PATH) {
  app.get(['/admin/admin.html', '/public/admin/admin.html'], (req, res, next) => sendGuardedAdminPage(req, res, next, ADMIN_DASHBOARD_PATH, ['admin.read', 'users.read']));
}

if (ADMIN_HEALTH_PATH) {
  app.get('/admin/health.html', (req, res, next) => sendGuardedAdminPage(req, res, next, ADMIN_HEALTH_PATH, ['system.read']));
  app.get(['/ops/health', '/health-dashboard', '/public/admin/health.html'], (req, res, next) => {
    if (!getPublicRuntimeConfig().admin?.healthSurfaceEnabled) {
      return res.redirect(302, '/admin/admin.html');
    }
    return sendGuardedAdminPage(req, res, next, ADMIN_HEALTH_PATH, ['system.read']);
  });
}

mountStaticAlias('/public/admin', path.join(__dirname, 'public', 'admin'));

function sendHealth(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'PlayMatrix API',
    uptimeSec: Math.round(process.uptime()),
    revision: String(process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || process.env.SOURCE_VERSION || '').trim() || null,
    environment: String(process.env.NODE_ENV || 'development').trim().toLowerCase() || 'development',
    firebase: getFirebaseStatus()
  });
}

app.get('/healthz', sendHealth);
app.get('/api/healthz', sendHealth);
app.get('/api/public/runtime-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.json({ ok: true, runtime: getPublicRuntimeConfig() });
});

app.post('/api/client-errors', async (req, res) => {
  const requestId = req.requestId || null;
  let uid = '';
  try {
    const optionalUser = await resolveOptionalAuthUser(req).catch((error) => {
      logCaughtError('client_errors.optional_auth', error, { requestId, route: req.originalUrl || req.url || '' });
      return null;
    });
    uid = optionalUser?.uid || '';
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = await captureClientError(body, {
      requestId,
      uid,
      route: req.originalUrl || req.url || '',
      method: req.method || '',
      ip: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      origin: req.headers.origin || ''
    });
    return res.status(202).json({ ok: true, id: id || null, requestId });
  } catch (error) {
    logCaughtError('client_errors.endpoint', error, { requestId, uid, route: req.originalUrl || req.url || '' }, 'error');
    return res.status(202).json({ ok: false, requestId });
  }
});

app.use('/api/me', (req, res, next) => {
  if (req.path === '/' || req.path === '') {
    req.url = '/';
    return profileRoutes(req, res, next);
  }
  return next();
});

app.use('/api', profileRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api', socialRoutes);
app.use('/api', supportRoutes);
app.use('/api', liveRoutes);
app.use('/api', adminRoutes);
app.use('/api', authRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', chatRoutes);
app.use('/api', socialCenterRoutes);
app.use('/api', classicRoutes);

app.use('/api/crash', crashRoutes);
app.use('/api/chess', chessRoutes);
app.use('/api/pisti', pistiRoutes);
app.use('/api/pisti-online', (req, res, next) => {
  req.url = `/online${req.url}`;
  return pistiRoutes(req, res, next);
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (buildSocketCors(origin)) return cb(null, true);
      return cb(new Error('CORS BLOCKED'));
    },
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

initSockets(io, auth);
initCrashEngine(io);
initCrons();

app.use((req, res) => {
  res.locals.errorLogged = true;
  writeLine('error', 'http_not_found', {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl || req.url || ''
  });
  return res.status(404).json({
    ok: false,
    error: 'Kaynak bulunamadı.',
    requestId: req.requestId || null
  });
});

app.use((error, req, res, _next) => {
  const message = String(error?.message || '');
  const isCorsBlocked = message === 'CORS BLOCKED';
  const statusCode = Number(error?.statusCode || error?.status || 0) || (isCorsBlocked ? 403 : 500);

  res.locals.errorLogged = true;
  writeLine('error', 'http_error', {
    requestId: req.requestId || null,
    uid: req.user?.uid || null,
    route: req.route?.path || null,
    method: req.method,
    path: req.originalUrl || req.url || '',
    statusCode,
    error: serializeError(error)
  });
  captureError(error, {
    scope: 'http',
    path: req.originalUrl || req.url || '',
    route: req.route?.path || '',
    method: req.method || '',
    uid: req.user?.uid || '',
    requestId: req.requestId || ''
  }).catch((captureErr) => logCaughtError('http.capture_error', captureErr, { requestId: req.requestId || null, route: req.originalUrl || req.url || '' }));

  if (res.headersSent) return;
  return res.status(statusCode).json({
    ok: false,
    error: isCorsBlocked ? 'CORS engellendi.' : 'Beklenmeyen sunucu hatası.',
    requestId: req.requestId || null
  });
});

const serverInstance = httpServer.listen(PORT, () => {
  writeLine('info', 'server_started', { port: PORT });
});

function shutdown(signal) {
  writeLine('warn', 'shutdown_requested', { signal });

  serverInstance.close(() => {
    writeLine('info', 'server_closed', { signal });
    process.exit(0);
  });

  setTimeout(() => {
    writeLine('error', 'shutdown_forced', { signal });
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, httpServer };
