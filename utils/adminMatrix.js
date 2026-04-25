'use strict';

const crypto = require('crypto');
const { cleanStr, nowMs, sha256Hex } = require('./helpers');

const ADMIN_GATE_TTL_MS = 7 * 60 * 1000;
const CLIENT_KEY_TTL_MS = 12 * 60 * 60 * 1000;

function firstCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => cleanStr(item || '', 200))
    .filter(Boolean)[0] || '';
}

function normalizeEmail(value = '') {
  return cleanStr(value || '', 200).trim().toLowerCase();
}

function sanitizeRoles(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [value])
    .map((item) => cleanStr(item || '', 48).toLowerCase())
    .filter(Boolean)));
}

function sanitizePermissions(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [value])
    .map((item) => cleanStr(item || '', 96).toLowerCase())
    .filter(Boolean)));
}

function sanitizeResolutionChain(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [value])
    .map((item) => cleanStr(item || '', 96))
    .filter(Boolean)));
}

function getPrimaryAdminIdentity() {
  return {
    uid: firstCsv(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || ''),
    email: normalizeEmail(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || '')
  };
}

function getMatrixSecret() {
  return [
    cleanStr(process.env.ADMIN_PANEL_SECOND_FACTOR_HASH_HEX || '', 256),
    cleanStr(process.env.ADMIN_PANEL_SECOND_FACTOR_SALT_HEX || '', 256),
    cleanStr(process.env.ADMIN_PANEL_THIRD_FACTOR_NAME || '', 256),
    cleanStr(process.env.ADMIN_UIDS || '', 512),
    cleanStr(process.env.ADMIN_EMAILS || '', 512),
    cleanStr(process.env.FIREBASE_PROJECT_ID || '', 128),
    'playmatrix_admin_matrix_v2'
  ].join('|');
}

function safeB64Encode(value = '') {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

function safeB64Decode(value = '') {
  try {
    return Buffer.from(String(value || ''), 'base64url').toString('utf8');
  } catch (_) {
    return '';
  }
}

function signPayload(payload = {}) {
  const json = JSON.stringify(payload);
  const body = safeB64Encode(json);
  const sig = crypto.createHmac('sha256', getMatrixSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedPayload(token = '') {
  const raw = String(token || '').trim();
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getMatrixSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(safeB64Decode(body));
  } catch (_) {
    return null;
  }
}

function issueStepTicket({ uid = '', email = '', role = '', roles = [], permissions = [], source = '', resolutionChain = [], stage = 1, prev = '' } = {}) {
  const safeStage = Math.max(1, Math.min(4, Number(stage) || 1));
  return signPayload({
    typ: 'pm_admin_step',
    v: 2,
    uid: cleanStr(uid || '', 160),
    email: normalizeEmail(email),
    role: cleanStr(role || '', 48).toLowerCase(),
    roles: sanitizeRoles(roles),
    permissions: sanitizePermissions(permissions),
    source: cleanStr(source || '', 96),
    resolutionChain: sanitizeResolutionChain(resolutionChain),
    stage: safeStage,
    prev: cleanStr(prev || '', 200),
    nonce: crypto.randomBytes(12).toString('hex'),
    issuedAt: nowMs(),
    expiresAt: nowMs() + ADMIN_GATE_TTL_MS
  });
}

function verifyStepTicket(ticket = '', expectedStage = 1) {
  const payload = verifySignedPayload(ticket);
  if (!payload || payload.typ !== 'pm_admin_step') return { ok: false, code: 'INVALID_STEP_TOKEN' };
  if ((Number(payload.stage) || 0) !== Number(expectedStage || 0)) return { ok: false, code: 'STEP_MISMATCH' };
  if ((Number(payload.expiresAt) || 0) < nowMs()) return { ok: false, code: 'STEP_EXPIRED' };
  return {
    ok: true,
    payload: {
      ...payload,
      uid: cleanStr(payload.uid || '', 160),
      email: normalizeEmail(payload.email || ''),
      role: cleanStr(payload.role || '', 48).toLowerCase(),
      roles: sanitizeRoles(payload.roles),
      permissions: sanitizePermissions(payload.permissions),
      source: cleanStr(payload.source || '', 96),
      resolutionChain: sanitizeResolutionChain(payload.resolutionChain)
    }
  };
}

function compareHexHex(a = '', b = '') {
  const left = cleanStr(String(a || ''), 512).toLowerCase();
  const right = cleanStr(String(b || ''), 512).toLowerCase();
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function candidateSecondFactorHashes(password = '', saltHex = '') {
  const pwd = Buffer.from(String(password || ''), 'utf8');
  const salt = /^[0-9a-f]+$/i.test(String(saltHex || '')) && String(saltHex || '').length % 2 === 0
    ? Buffer.from(String(saltHex || ''), 'hex')
    : Buffer.from(String(saltHex || ''), 'utf8');
  const saltText = String(saltHex || '');
  return Array.from(new Set([
    crypto.createHash('sha256').update(Buffer.concat([salt, pwd])).digest('hex'),
    crypto.createHash('sha256').update(Buffer.concat([pwd, salt])).digest('hex'),
    sha256Hex(`${saltText}${String(password || '')}`),
    sha256Hex(`${String(password || '')}${saltText}`),
    crypto.createHmac('sha256', salt).update(pwd).digest('hex')
  ]));
}

function verifySecondFactor(password = '') {
  const rawSecret = cleanStr(process.env.ADMIN_PANEL_SECOND_FACTOR || '', 240);
  if (rawSecret && String(password || '') === rawSecret) return true;
  const storedHash = cleanStr(process.env.ADMIN_PANEL_SECOND_FACTOR_HASH_HEX || '', 256).toLowerCase();
  const saltHex = cleanStr(process.env.ADMIN_PANEL_SECOND_FACTOR_SALT_HEX || '', 256);
  if (!storedHash) return false;
  return candidateSecondFactorHashes(password, saltHex).some((candidate) => compareHexHex(candidate, storedHash));
}

function verifyThirdFactor(name = '') {
  const expected = cleanStr(process.env.ADMIN_PANEL_THIRD_FACTOR_NAME || '', 240);
  if (!expected) return false;
  const safeInput = cleanStr(name || '', 240);
  if (!safeInput) return false;
  const a = Buffer.from(safeInput.normalize('NFKC'));
  const b = Buffer.from(expected.normalize('NFKC'));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function issueClientGateKey({ uid = '', email = '', sessionId = '' } = {}) {
  return signPayload({
    typ: 'pm_admin_client_key',
    v: 1,
    uid: cleanStr(uid || '', 160),
    email: normalizeEmail(email),
    sessionId: cleanStr(sessionId || '', 160),
    nonce: crypto.randomBytes(10).toString('hex'),
    issuedAt: nowMs(),
    expiresAt: nowMs() + CLIENT_KEY_TTL_MS
  });
}

function verifyClientGateKey(key = '') {
  const payload = verifySignedPayload(key);
  if (!payload || payload.typ !== 'pm_admin_client_key') return { ok: false, code: 'INVALID_CLIENT_KEY' };
  if ((Number(payload.expiresAt) || 0) < nowMs()) return { ok: false, code: 'CLIENT_KEY_EXPIRED' };
  return { ok: true, payload };
}

module.exports = {
  ADMIN_GATE_TTL_MS,
  CLIENT_KEY_TTL_MS,
  normalizeEmail,
  getPrimaryAdminIdentity,
  issueStepTicket,
  verifyStepTicket,
  verifySecondFactor,
  verifyThirdFactor,
  issueClientGateKey,
  verifyClientGateKey
};
