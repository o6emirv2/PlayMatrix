'use strict';

const crypto = require('crypto');
const { db } = require('../config/firebase');
const { cleanStr, nowMs } = require('./helpers');
const { writeLine, serializeError } = require('./logger');

const colOpsErrors = () => db.collection('ops_errors');

function safeContext(context = {}) {
  if (!context || typeof context !== 'object') return {};
  const out = {};
  Object.entries(context).slice(0, 20).forEach(([key, value]) => {
    const safeKey = cleanStr(key || '', 60);
    if (!safeKey) return;
    if (typeof value === 'string') out[safeKey] = cleanStr(value, 500);
    else if (typeof value === 'number' || typeof value === 'boolean') out[safeKey] = value;
    else if (value && typeof value === 'object') {
      try {
        out[safeKey] = JSON.parse(JSON.stringify(value, (_k, v) => typeof v === 'string' ? cleanStr(v, 200) : v));
      } catch (_) {
        out[safeKey] = cleanStr(String(value), 200);
      }
    } else out[safeKey] = String(value);
  });
  return out;
}

async function captureError(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
  const payload = {
    id: crypto.randomUUID(),
    createdAt: nowMs(),
    message: cleanStr(err.message || 'Unknown error', 400),
    stack: cleanStr(err.stack || '', 5000),
    name: cleanStr(err.name || 'Error', 120),
    context: safeContext(context)
  };

  writeLine('error', 'ops_error_captured', {
    ...payload.context,
    error: serializeError(err)
  });

  try {
    await colOpsErrors().doc(payload.id).set(payload, { merge: true });
  } catch (_) {}
  return payload.id;
}

module.exports = { captureError };
