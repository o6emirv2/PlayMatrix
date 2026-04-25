'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nowMs, cleanStr } = require('./helpers');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const APP_LOG_PATH = path.join(LOG_DIR, 'app.log');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: cleanStr(error.name || 'Error', 80),
    message: cleanStr(error.message || 'Bilinmeyen hata', 1000),
    stack: typeof error.stack === 'string' ? error.stack.slice(0, 5000) : ''
  };
}

function writeLine(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level: cleanStr(level || 'info', 16).toLowerCase(),
    message: cleanStr(message || '', 500),
    ...meta
  };

  const line = JSON.stringify(entry);
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);

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
    writeLine('info', 'http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Math.max(0, nowMs() - startedAt),
      ip: req.ip || req.socket?.remoteAddress || '',
      uid: req.user?.uid || null
    });
  });

  next();
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
  recordAuditLog
};