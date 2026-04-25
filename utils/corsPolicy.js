'use strict';

const { ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS } = require('../config/constants');
const { cleanStr } = require('./helpers');

function isProductionRuntime() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function splitOrigins(value = '') {
  return String(value || '')
    .split(',')
    .map((origin) => String(origin || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function buildExactAllowedOrigins() {
  const configured = splitOrigins(process.env.ALLOWED_ORIGINS || '');
  const defaults = Array.isArray(DEFAULT_ALLOWED_ORIGINS) ? DEFAULT_ALLOWED_ORIGINS : [];
  const constants = Array.isArray(ALLOWED_ORIGINS) ? ALLOWED_ORIGINS : [];

  // Production private/admin CORS must be controlled only by explicit ALLOWED_ORIGINS.
  // Default/preview hosts are development conveniences and must not widen production access.
  const source = isProductionRuntime() ? configured : [...defaults, ...constants, ...configured];
  return Array.from(new Set(source.map((value) => String(value || '').trim().replace(/\/+$/, '')).filter(Boolean)));
}

const EXACT_ALLOWED = buildExactAllowedOrigins();

const PUBLIC_ROUTE_PATTERNS = [
  /^\/healthz(?:\/|$)?/i,
  /^\/api\/healthz(?:\/|$)?/i,
  /^\/api\/leaderboard(?:\/|$)?/i,
  /^\/api\/public\/runtime-config(?:\/|$)?/i,
  /^\/api\/music-tiles\/bootstrap(?:\/|$)?/i
];

const ADMIN_ROUTE_PATTERNS = [
  /^\/admin(?:\/|$)?/i,
  /^\/public\/admin(?:\/|$)?/i,
  /^\/api\/auth\/admin(?:\/|$)?/i,
  /^\/api\/admin(?:\/|$)?/i,
  /^\/ops(?:\/|$)?/i
];

function parseOrigin(origin = '') {
  const value = String(origin || '').trim();
  if (!value) return null;
  try {
    return new URL(value);
  } catch (_) {
    return null;
  }
}

function isTrustedPreviewHost(hostname = '') {
  if (isProductionRuntime()) return false;
  const safeHost = String(hostname || '').trim().toLowerCase();
  return /(^|\.)netlify\.app$/i.test(safeHost)
    || /(^|\.)onrender\.com$/i.test(safeHost)
    || /(^|\.)playmatrix\.com\.tr$/i.test(safeHost)
    || /^localhost$/i.test(safeHost)
    || /^127\.0\.0\.1$/i.test(safeHost);
}

function isOriginAllowedForPrivate(origin = '') {
  if (!origin) return true;
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  const normalized = parsed.origin;
  if (EXACT_ALLOWED.includes('*')) return true;
  if (EXACT_ALLOWED.includes(normalized)) return true;
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  return isTrustedPreviewHost(parsed.hostname);
}

function getCorsScope(req) {
  const path = String(req.path || req.originalUrl || req.url || '').split('?')[0];
  if (PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(path))) return 'public';
  if (ADMIN_ROUTE_PATTERNS.some((pattern) => pattern.test(path))) return 'admin';
  return 'private';
}

function applyCorsHeaders(req, res) {
  const origin = cleanStr(req.headers.origin || '', 300);
  const scope = getCorsScope(req);
  const allowPrivate = isOriginAllowedForPrivate(origin);
  const allowRequest = scope === 'public' ? true : allowPrivate;
  if (!allowRequest) return { ok: false, origin, scope };

  const allowOriginValue = scope === 'public' ? (origin || '*') : origin;
  if (allowOriginValue) res.setHeader('Access-Control-Allow-Origin', allowOriginValue);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck, x-firebase-appcheck, X-Request-Id, X-Session-Token, x-session-token, X-Admin-Client-Key, x-admin-client-key');
  if (scope !== 'public') res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return { ok: true, origin, scope, preflight: true };
  }
  return { ok: true, origin, scope, preflight: false };
}

function buildSocketCors(origin = '') {
  return isOriginAllowedForPrivate(origin);
}

module.exports = {
  getCorsScope,
  isOriginAllowedForPrivate,
  applyCorsHeaders,
  buildSocketCors
};
