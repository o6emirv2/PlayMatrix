'use strict';

const { cleanStr } = require('./helpers');
const { normalizeUrlBase, PUBLIC_RUNTIME_ENV_KEYS, SECRET_ENV_KEY_PATTERN } = require('./env');

function normalizeBase(value = '') {
  return normalizeUrlBase(value);
}

function truthy(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function readPublicFirebaseConfig() {
  const projectId = cleanStr(process.env.PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '', 200);
  const authDomain = cleanStr(process.env.PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ''), 240);
  const storageBucket = cleanStr(process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : ''), 240);
  const config = {
    apiKey: cleanStr(process.env.PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || '', 240),
    authDomain,
    projectId,
    storageBucket,
    databaseURL: cleanStr(process.env.PUBLIC_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL || '', 300),
    messagingSenderId: cleanStr(process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '', 200),
    appId: cleanStr(process.env.PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '', 240),
    measurementId: cleanStr(process.env.PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || '', 200)
  };
  return Object.freeze(config);
}

function hasUsablePublicFirebaseConfig(config = readPublicFirebaseConfig()) {
  return !!(config.apiKey && config.projectId && config.appId && config.authDomain);
}

function assertPublicRuntimeConfigSafe(runtime = {}) {
  const forbiddenKeys = [];
  const visit = (value, path = []) => {
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, nested]) => {
      const joined = [...path, key].join('.');
      if (SECRET_ENV_KEY_PATTERN.test(key) && key !== 'apiKey') forbiddenKeys.push(joined);
      if (nested && typeof nested === 'object') visit(nested, [...path, key]);
    });
  };
  visit(runtime);
  if (forbiddenKeys.length) {
    const error = new Error(`Public runtime config secret benzeri anahtar içeriyor: ${forbiddenKeys.join(', ')}`);
    error.code = 'PUBLIC_RUNTIME_SECRET_LEAK_GUARD';
    throw error;
  }
  return true;
}

function getPublicRuntimeConfig() {
  const firebase = readPublicFirebaseConfig();
  const apiBase = normalizeBase(process.env.PUBLIC_API_BASE || process.env.PUBLIC_BACKEND_ORIGIN || process.env.PUBLIC_BASE_URL || '');
  const publicBaseUrl = normalizeBase(process.env.PUBLIC_BASE_URL || process.env.CANONICAL_ORIGIN || '');
  const nodeEnv = cleanStr(process.env.NODE_ENV || 'development', 64).toLowerCase() || 'development';
  const healthSurfaceEnabled = nodeEnv !== 'production' || truthy(process.env.ADMIN_HEALTH_SURFACE_ENABLED);
  const runtime = {
    version: 3,
    environment: nodeEnv,
    apiBase,
    publicBaseUrl,
    firebase: hasUsablePublicFirebaseConfig(firebase) ? firebase : null,
    firebaseReady: hasUsablePublicFirebaseConfig(firebase),
    admin: {
      healthSurfaceEnabled
    }
  };
  assertPublicRuntimeConfigSafe(runtime);
  return runtime;
}

module.exports = {
  PUBLIC_RUNTIME_ENV_KEYS,
  readPublicFirebaseConfig,
  hasUsablePublicFirebaseConfig,
  assertPublicRuntimeConfigSafe,
  getPublicRuntimeConfig
};
