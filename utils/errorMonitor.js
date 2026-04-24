'use strict';

const crypto = require('crypto');
const { db } = require('../config/firebase');
const { cleanStr, nowMs, safeNum } = require('./helpers');
const { serializeError, writeLine, redactSensitiveValue } = require('./logger');

const recentErrorCache = new Map();
const ERROR_DEDUP_WINDOW_MS = 5000;

const colOpsErrors = () => db.collection('ops_errors');

function safeContext(context = {}) {
  if (!context || typeof context !== 'object') return {};
  const out = {};
  Object.entries(context).slice(0, 30).forEach(([key, value]) => {
    const safeKey = cleanStr(key || '', 60);
    if (!safeKey) return;
    const redacted = redactSensitiveValue(value);
    if (typeof redacted === 'string') out[safeKey] = cleanStr(redacted, 700);
    else if (typeof redacted === 'number' || typeof redacted === 'boolean' || redacted === null) out[safeKey] = redacted;
    else if (redacted && typeof redacted === 'object') {
      try {
        out[safeKey] = JSON.parse(JSON.stringify(redacted, (_k, v) => typeof v === 'string' ? cleanStr(v, 250) : v));
      } catch (contextError) {
        out[safeKey] = cleanStr(String(redacted), 250);
      }
    } else out[safeKey] = cleanStr(String(redacted), 250);
  });
  return out;
}

function buildDedupKey(kind, err, safeCtx = {}) {
  return [
    kind,
    cleanStr(safeCtx.requestId || '', 120),
    cleanStr(safeCtx.path || safeCtx.browserPath || '', 240),
    cleanStr(err.name || 'Error', 120),
    cleanStr(err.message || 'Unknown error', 400)
  ].join('::');
}

function shouldDedupe(dedupKey) {
  const now = nowMs();
  const lastSeenAt = safeNum(recentErrorCache.get(dedupKey), 0);
  if (lastSeenAt > 0 && (now - lastSeenAt) < ERROR_DEDUP_WINDOW_MS) return true;
  recentErrorCache.set(dedupKey, now);
  return false;
}

async function writeOpsError(payload) {
  try {
    await colOpsErrors().doc(payload.id).set(payload, { merge: true });
  } catch (storeError) {
    writeLine('error', 'ops_error_store_failed', { error: serializeError(storeError), originalErrorId: payload.id, scope: payload.context?.scope || '' });
  }
}

async function captureError(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
  const safeCtx = safeContext(context);
  const dedupKey = buildDedupKey('server', err, safeCtx);
  if (shouldDedupe(dedupKey)) {
    return null;
  }

  const payload = {
    id: crypto.randomUUID(),
    createdAt: nowMs(),
    message: cleanStr(err.message || 'Unknown error', 400),
    stack: cleanStr(err.stack || '', 5000),
    name: cleanStr(err.name || 'Error', 120),
    context: safeCtx,
    error: serializeError(err)
  };

  writeLine('error', 'ops_error_captured', {
    requestId: safeCtx.requestId || null,
    uid: safeCtx.uid || null,
    route: safeCtx.route || safeCtx.path || null,
    scope: safeCtx.scope || 'server',
    error: serializeError(err)
  });
  await writeOpsError(payload);
  return payload.id;
}

async function captureClientError(body = {}, context = {}) {
  const message = cleanStr(body.message || body.error || 'Client error', 400);
  const err = new Error(message);
  err.name = cleanStr(body.name || 'ClientError', 120);
  if (body.stack) err.stack = cleanStr(body.stack || '', 5000);
  const safeCtx = safeContext({
    ...context,
    scope: body.scope || context.scope || 'client',
    browserPath: body.path || body.browserPath || context.browserPath || '',
    source: body.source || '',
    lineno: safeNum(body.lineno, 0),
    colno: safeNum(body.colno, 0),
    userAgent: body.userAgent || context.userAgent || '',
    visibilityState: body.visibilityState || '',
    href: body.href || ''
  });
  const dedupKey = buildDedupKey('client', err, safeCtx);
  if (shouldDedupe(dedupKey)) return null;
  const payload = {
    id: crypto.randomUUID(),
    kind: 'client',
    createdAt: nowMs(),
    message: cleanStr(err.message || 'Client error', 400),
    stack: cleanStr(err.stack || '', 5000),
    name: cleanStr(err.name || 'ClientError', 120),
    context: safeCtx,
    error: serializeError(err)
  };
  writeLine('error', 'client_error_captured', {
    requestId: safeCtx.requestId || null,
    uid: safeCtx.uid || null,
    route: safeCtx.route || safeCtx.browserPath || null,
    browserPath: safeCtx.browserPath || null,
    scope: safeCtx.scope || 'client',
    error: serializeError(err)
  });
  await writeOpsError(payload);
  return payload.id;
}

module.exports = { captureError, captureClientError, safeContext };
