'use strict';

const { nowMs, cleanStr } = require('./helpers');

function resolveEndpoint(req) {
  return cleanStr(req?.originalUrl || req?.url || req?.path || '', 260) || '';
}

function buildResponseMeta(req, extras = {}) {
  return {
    requestId: cleanStr(req?.requestId || '', 120) || null,
    timestamp: nowMs(),
    endpoint: resolveEndpoint(req),
    phase: 'phase3_critical_api',
    ...((extras && typeof extras === 'object') ? extras : {})
  };
}

function sendApiSuccess(req, res, payload = {}, options = {}) {
  const statusCode = Number(options?.statusCode || 200) || 200;
  const meta = buildResponseMeta(req, options?.meta || {});
  return res.status(statusCode).json({
    ok: true,
    ...(payload && typeof payload === 'object' ? payload : {}),
    requestId: meta.requestId,
    timestamp: meta.timestamp,
    endpoint: meta.endpoint,
    meta
  });
}

function sendApiError(req, res, statusCode = 500, errorMessage = 'Beklenmeyen sunucu hatası.', options = {}) {
  const safeStatusCode = Number(statusCode) || 500;
  const meta = buildResponseMeta(req, options?.meta || {});
  const payload = {
    ok: false,
    error: cleanStr(errorMessage || 'Beklenmeyen sunucu hatası.', 240) || 'Beklenmeyen sunucu hatası.',
    code: cleanStr(options?.code || '', 80) || undefined,
    retryable: options?.retryable === true,
    requestId: meta.requestId,
    timestamp: meta.timestamp,
    endpoint: meta.endpoint,
    meta
  };
  if (options?.details !== undefined) payload.details = options.details;
  return res.status(safeStatusCode).json(payload);
}

module.exports = { buildResponseMeta, sendApiSuccess, sendApiError };
