'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ENV_FILES = Object.freeze([
  '.env',
  '.env.env',
  'env.env'
]);

let loaded = false;

function parseEnvLine(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex <= 0) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = trimmed.slice(eqIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
  return { key, value };
}

function loadEnvFiles(options = {}) {
  if (loaded && options.force !== true) return false;
  const cwd = options.cwd || process.cwd();
  const files = Array.isArray(options.files) && options.files.length ? options.files : DEFAULT_ENV_FILES;
  let applied = false;

  files.forEach((fileName) => {
    const absPath = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
    try {
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return;
      const content = fs.readFileSync(absPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const parsed = parseEnvLine(line);
        if (!parsed) return;
        if (process.env[parsed.key] === undefined) {
          process.env[parsed.key] = parsed.value;
          applied = true;
        }
      });
    } catch (_) {}
  });

  loaded = true;
  return applied;
}


function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTruthyFlag(value = '') {
  return ['1', 'true', 'yes', 'on', 'production'].includes(String(value || '').trim().toLowerCase());
}

function validateRuntimeEnv(env = process.env) {
  const warnings = [];
  const errors = [];

  const adminUids = parseCsv(env.ADMIN_UIDS || env.ADMIN_UID || env.PRIMARY_ADMIN_UID || '');
  const adminEmails = parseCsv(env.ADMIN_EMAILS || env.ADMIN_EMAIL || env.PRIMARY_ADMIN_EMAIL || '');
  const allowedOrigins = parseCsv(env.ALLOWED_ORIGINS || '');

  if (!adminUids.length) warnings.push('ADMIN_UIDS tanımlı değil.');
  if (!adminEmails.length) warnings.push('ADMIN_EMAILS tanımlı değil.');
  if (adminUids.length && adminEmails.length && adminUids.length !== adminEmails.length) {
    warnings.push('ADMIN_UIDS ve ADMIN_EMAILS adetleri farklı; eşleşmeler ilk değer üzerinden yapılacak.');
  }

  allowedOrigins.forEach((origin) => {
    try {
      if (origin !== '*') new URL(origin);
    } catch (_) {
      errors.push(`Geçersiz ALLOWED_ORIGINS girdisi: ${origin}`);
    }
  });

  ['LOBBY_CHAT_RETENTION_DAYS', 'DIRECT_CHAT_RETENTION_DAYS'].forEach((key) => {
    if (env[key] === undefined || env[key] === '') return;
    const numeric = Number(env[key]);
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > 365) {
      errors.push(`${key} 1 ile 365 arasında sayı olmalı.`);
    }
  });

  if (isTruthyFlag(env.NODE_ENV) && (!adminUids.length || !adminEmails.length)) {
    warnings.push('Üretim ortamında admin tanımı eksik olabilir.');
  }

  return { ok: errors.length === 0, warnings, errors };
}

module.exports = {
  DEFAULT_ENV_FILES,
  loadEnvFiles,
  parseEnvLine,
  parseCsv,
  validateRuntimeEnv
};
