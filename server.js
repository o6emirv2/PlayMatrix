'use strict';

const { loadEnvFiles, validateRuntimeEnv } = require('./utils/env');
loadEnvFiles({ cwd: __dirname });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');

const { auth } = require('./config/firebase');
const { PORT, ALLOWED_ORIGINS } = require('./config/constants');
const { apiLimiter, authLimiter } = require('./middlewares/rateLimiters');
const { requestContext, writeLine, serializeError } = require('./utils/logger');
const { captureError } = require('./utils/errorMonitor');

const envValidation = validateRuntimeEnv(process.env);

const profileRoutes = require('./routes/profile.routes');
const socialRoutes = require('./routes/social.routes');
const supportRoutes = require('./routes/support.routes');
const adminRoutes = require('./routes/admin.routes');
const liveRoutes = require('./routes/live.routes');
const blackjackRoutes = require('./routes/blackjack.routes');
const crashRoutes = require('./routes/crash.routes');
const minesRoutes = require('./routes/mines.routes');
const chessRoutes = require('./routes/chess.routes');
const pistiRoutes = require('./routes/pisti.routes');
const authRoutes = require('./routes/auth.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const chatRoutes = require('./routes/chat.routes');
const partyRoutes = require('./routes/party.routes');
const socialCenterRoutes = require('./routes/socialcenter.routes');

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

if (!envValidation.ok) {
  console.error('❌ Geçersiz ortam değişkenleri:', envValidation.errors);
  throw new Error(`ENV_VALIDATION_FAILED: ${envValidation.errors.join(' | ')}`);
}
if (envValidation.warnings.length) {
  console.warn('⚠️ Ortam doğrulama uyarıları:', envValidation.warnings);
}

const app = express();
const httpServer = http.createServer(app);


function buildHelmetCsp() {
  const allowedOrigins = Array.isArray(ALLOWED_ORIGINS)
    ? ALLOWED_ORIGINS.filter((origin) => /^https?:\/\//i.test(String(origin || '').trim()))
    : [];
  const publicBackendOrigin = String(process.env.PUBLIC_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '');
  const publicApiBase = String(process.env.PUBLIC_API_BASE || '').trim().replace(/\/+$/, '');
  const derivedOrigins = [publicBackendOrigin];
  if (publicApiBase) {
    try {
      derivedOrigins.push(new URL(publicApiBase).origin);
    } catch (_) {}
  }
  const connectOrigins = Array.from(new Set([...allowedOrigins, ...derivedOrigins].filter(Boolean)));

  return {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://www.googleapis.com', ...connectOrigins],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://encrypted-tbn0.gstatic.com', 'https://playmatrix.com.tr', 'https://www.playmatrix.com.tr', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com', 'https://firebasestorage.googleapis.com', 'https://*.firebasestorage.app'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://firestore.googleapis.com', ...connectOrigins],
      workerSrc: ["'self'", 'blob:'],
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

const isOriginAllowed = (origin) => {
  // Origin header is absent on health checks, HEAD probes, some same-origin navigations,
  // server-to-server requests, and certain platform checks. CORS should validate explicit
  // cross-origin browser requests, not block originless probes.
  if (!origin) return true;
  if (!Array.isArray(ALLOWED_ORIGINS) || ALLOWED_ORIGINS.length === 0) return true;
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return ALLOWED_ORIGINS.includes(origin);
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) return cb(null, true);
    return cb(new Error('CORS BLOCKED'));
  },
  credentials: true,
  optionsSuccessStatus: 204,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Firebase-AppCheck',
    'x-firebase-appcheck',
    'X-Request-Id'
  ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression'] || req.headers.range) return false;
    if (req.path.startsWith('/sfx') || req.path.startsWith('/casino/sfx')) return false;
    return compression.filter(req, res);
  },
  threshold: 1024
}));

function firstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
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
  } catch (_) {
    return null;
  }
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
      res.setHeader('Cache-Control', `public, max-age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
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
  } catch (_) {}
}

[
  'style.css',
  'script.js',
  'site.webmanifest',
  'logo.png',
  'favicon.ico',
  'apple-touch-icon.png'
].forEach((fileName) => {
  const resolved = firstExistingPath([
    path.join(__dirname, fileName),
    path.join(__dirname, 'public', fileName)
  ]);

  if (resolved) {
    mountFileAlias(`/${fileName}`, resolved);
  }
});

const safeStaticDirs = Array.from(new Set([
  path.join(__dirname, 'assets'),
  path.join(__dirname, 'public'),
  path.join(__dirname, 'img'),
  path.join(__dirname, 'Casino'),
  path.join(__dirname, 'Online Oyunlar'),
  path.join(__dirname, 'Klasik Oyunlar')
].filter((dir) => {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch (_) {
    return false;
  }
})));

safeStaticDirs.forEach((dir) => {
  const baseName = path.basename(dir);

  if (baseName === 'public') {
    app.use(express.static(dir, { maxAge: '7d', index: false }));
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

mountGameHtmlAliases(
  'index.html',
  firstExistingPath([path.join(__dirname, 'index.html')]),
  ['/', '/index.html']
);

mountGameHtmlAliases(
  'Satranc.html',
  firstExistingPath([
    path.join(__dirname, 'Satranc.html'),
    path.join(__dirname, 'Online Oyunlar', 'Satranc.html')
  ]),
  ['/Online Oyunlar/Satranc.html', '/Satranc.html', '/online-games/chess', '/satranc']
);

mountGameHtmlAliases(
  'Pisti.html',
  firstExistingPath([
    path.join(__dirname, 'OnlinePisti.html'),
    path.join(__dirname, 'Pisti.html'),
    path.join(__dirname, 'Online Oyunlar', 'OnlinePisti.html'),
    path.join(__dirname, 'Online Oyunlar', 'Pisti.html')
  ]),
  ['/Online Oyunlar/Pisti.html', '/Pisti.html', '/OnlinePisti.html', '/online-games/pisti', '/pisti']
);

mountGameHtmlAliases(
  'Crash.html',
  firstExistingPath([
    path.join(__dirname, 'Crash.html'),
    path.join(__dirname, 'Casino', 'Crash.html'),
    path.join(__dirname, 'Online Oyunlar', 'Crash.html')
  ]),
  ['/Crash.html', '/crash', '/online-games/crash']
);

mountGameHtmlAliases(
  'Mines.html',
  firstExistingPath([
    path.join(__dirname, 'Mines.html'),
    path.join(__dirname, 'Casino', 'Mines.html')
  ]),
  ['/Mines.html', '/mines']
);

mountGameHtmlAliases(
  'BlackJack.html',
  firstExistingPath([
    path.join(__dirname, 'BlackJack.html'),
    path.join(__dirname, 'Casino', 'BlackJack.html')
  ]),
  ['/BlackJack.html', '/casino/blackjack', '/blackjack']
);

mountGameHtmlAliases(
  'admin.html',
  firstExistingPath([path.join(__dirname, 'public', 'admin', 'index.html')]),
  ['/admin', '/admin/index.html']
);

mountGameHtmlAliases(
  'health-dashboard.html',
  firstExistingPath([path.join(__dirname, 'public', 'admin', 'health.html')]),
  ['/ops/health', '/health-dashboard']
);

function sendHealth(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'PlayMatrix API',
    uptimeSec: Math.round(process.uptime())
  });
}

app.get('/healthz', sendHealth);
app.get('/api/healthz', sendHealth);

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
app.use('/api', partyRoutes);
app.use('/api', socialCenterRoutes);

app.use('/api/bj', blackjackRoutes);
app.use('/api/crash', crashRoutes);
app.use('/api/mines', minesRoutes);
app.use('/api/chess', chessRoutes);
app.use('/api/pisti', pistiRoutes);
app.use('/api/pisti-online', (req, res, next) => {
  req.url = `/online${req.url}`;
  return pistiRoutes(req, res, next);
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
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
  res.status(404).json({
    ok: false,
    error: 'Kaynak bulunamadı.',
    requestId: req.requestId || null
  });
});

app.use((error, req, res, _next) => {
  const message = String(error?.message || '');
  const isCorsBlocked = message === 'CORS BLOCKED';
  const statusCode = Number(error?.statusCode || error?.status || 0) || (isCorsBlocked ? 403 : 500);

  writeLine('error', 'http_error', {
    requestId: req.requestId || null,
    error: serializeError(error)
  });
  captureError(error, { scope: 'http', path: req.originalUrl || req.url || '', requestId: req.requestId || '' }).catch(() => null);

  res.status(statusCode).json({
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
