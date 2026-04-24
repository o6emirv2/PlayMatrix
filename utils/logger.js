'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nowMs, cleanStr } = require('./helpers');

const IS_PRODUCTION = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const LOG_LEVEL = String(process.env.LOG_LEVEL || (IS_PRODUCTION ? 'error' : 'info')).trim().toLowerCase();
const LEVEL_WEIGHT = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, fatal: 50 });

function shouldEmit(level = 'info') {
  const current = LEVEL_WEIGHT[cleanStr(level || 'info', 16).toLowerCase()] || LEVEL_WEIGHT.info;
  const threshold = LEVEL_WEIGHT[LOG_LEVEL] || LEVEL_WEIGHT.info;
  return current >= threshold;
}

const LOG_DIR = path.join(__dirname, '..', 'logs');
const APP_LOG_PATH = path.join(LOG_DIR, 'app.log');

const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|authorization|cookie|session|apikey|api_key|private|credential|firebase_private_key)/i;
const SENSITIVE_VALUE_PATTERN = /(Bearer\s+[A-Za-z0-9._~+\/-]+=*|AIza[0-9A-Za-z_\-]{20,}|-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----)/g;

function redactSensitiveValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return cleanStr(value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]'), 5000);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactSensitiveValue(item));
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).slice(0, 80).forEach(([key, nestedValue]) => {
      const safeKey = cleanStr(key || '', 80);
      if (!safeKey) return;
      out[safeKey] = SENSITIVE_KEY_PATTERN.test(safeKey) ? '[REDACTED]' : redactSensitiveValue(nestedValue);
    });
    return out;
  }
  return cleanStr(String(value), 500);
}

function sanitizeLogMeta(meta = {}) {
  return redactSensitiveValue(meta && typeof meta === 'object' ? meta : {});
}

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: cleanStr(error.name || 'Error', 80),
    message: redactSensitiveValue(error.message || 'Bilinmeyen hata'),
    stack: typeof error.stack === 'string' ? redactSensitiveValue(error.stack).slice(0, 5000) : ''
  };
}

function writeLine(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level: cleanStr(level || 'info', 16).toLowerCase(),
    message: cleanStr(message || '', 500),
    ...sanitizeLogMeta(meta)
  };

  const line = JSON.stringify(entry);
  if (shouldEmit(entry.level)) {
    if (entry.level === 'error' || entry.level === 'fatal') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.log(line);
  }

  try {
    ensureLogDir();
    fs.appendFileSync(APP_LOG_PATH, `${line}\n`, 'utf8');
  } catch (_) {}

  return entry;
}

function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = String(requestId);
  res.setHeader('X-Request-Id', req.requestId);
  const startedAt = nowMs();

  res.on('finish', () => {
    const statusCode = Number(res.statusCode || 0);
    if (statusCode < 400) return;
    if (res.locals && res.locals.errorLogged) return;
    writeLine('error', 'http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      durationMs: Math.max(0, nowMs() - startedAt),
      ip: req.ip || req.socket?.remoteAddress || '',
      uid: req.user?.uid || null
    });
  });

  next();
}

function logCaughtError(scope = 'unknown', error, meta = {}, level = 'warn') {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown caught error'));
  return writeLine(level, 'caught_error', {
    scope: cleanStr(scope || 'unknown', 160),
    error: serializeError(err),
    ...sanitizeLogMeta(meta)
  });
}

async function recordAuditLog({ actorUid = '', actorEmail = '', action = '', targetType = '', targetId = '', status = 'success', metadata = {} } = {}) {
  try {
    const { db, admin } = require('../config/firebase');
    const payload = {
      actorUid: cleanStr(actorUid, 160),
      actorEmail: cleanStr(actorEmail, 200),
      action: cleanStr(action, 120),
      targetType: cleanStr(targetType, 80),
      targetId: cleanStr(targetId, 220),
      status: cleanStr(status, 24) || 'success',
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      createdAt: nowMs(),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('audit_logs').add(payload);
    return true;
  } catch (error) {
    writeLine('warn', 'audit_log_failed', { error: serializeError(error) });
    return false;
  }
}

module.exports = {
  APP_LOG_PATH,
  serializeError,
  writeLine,
  requestContext,
  recordAuditLog,
  logCaughtError,
  redactSensitiveValue,
  sanitizeLogMeta,
  shouldEmit,
  LOG_LEVEL
};