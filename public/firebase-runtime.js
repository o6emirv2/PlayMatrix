const PM_PUBLIC_RUNTIME_ENDPOINT = '/api/public/runtime-config';
const PM_PUBLIC_RUNTIME_CACHE_KEY = 'pm_public_runtime_cache_v1';

let runtimeCache = null;
let runtimePromise = null;

function fetchWithTimeout(resource, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 3500));
  return fetch(resource, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timer));
}

function cloneObject(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function normalizeBase(value = '') {
  return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

function normalizeEndpoint(value = '') {
  const raw = normalizeBase(value);
  if (!raw) return '';
  if (/\/api\/public\/runtime-config$/i.test(raw)) return raw;
  if (/\/api$/i.test(raw)) return `${raw}/public/runtime-config`;
  return `${raw}${PM_PUBLIC_RUNTIME_ENDPOINT}`;
}

function pushUnique(list, value) {
  const normalized = normalizeEndpoint(value);
  if (normalized && !list.includes(normalized)) list.push(normalized);
}

function readMetaContent(name) {
  try {
    return document.querySelector(`meta[name="${name}"]`)?.content || '';
  } catch (_) {
    return '';
  }
}

function hasUsableFirebaseConfig(config = null) {
  return !!(config && typeof config === 'object' && config.apiKey && config.authDomain && config.projectId && config.appId);
}

function sanitizeFirebaseConfig(config = null) {
  if (!hasUsableFirebaseConfig(config)) return null;
  const clean = {
    apiKey: String(config.apiKey || '').trim(),
    authDomain: String(config.authDomain || '').trim(),
    projectId: String(config.projectId || '').trim(),
    storageBucket: String(config.storageBucket || '').trim(),
    messagingSenderId: String(config.messagingSenderId || '').trim(),
    appId: String(config.appId || '').trim(),
    measurementId: String(config.measurementId || '').trim()
  };
  const databaseURL = String(config.databaseURL || '').trim();
  if (databaseURL) clean.databaseURL = databaseURL;
  return hasUsableFirebaseConfig(clean) ? clean : null;
}

function readStaticRuntimeConfig() {
  const source = window.__PM_STATIC_RUNTIME_CONFIG__ && typeof window.__PM_STATIC_RUNTIME_CONFIG__ === 'object'
    ? window.__PM_STATIC_RUNTIME_CONFIG__
    : null;
  if (!source) return null;
  const firebase = sanitizeFirebaseConfig(source.firebase || null);
  const apiBase = normalizeBase(source.apiBase || window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || readMetaContent('playmatrix-api-url') || '');
  if (!apiBase && !firebase) return null;
  return {
    ...cloneObject(source),
    apiBase,
    firebase,
    firebaseReady: !!firebase,
    source: source.source || 'static-runtime-fallback'
  };
}

function getEndpointCandidates() {
  const list = [];
  pushUnique(list, readStaticRuntimeConfig()?.apiBase);
  pushUnique(list, window.__PM_RUNTIME?.apiBase);
  pushUnique(list, window.__PLAYMATRIX_API_URL__);
  pushUnique(list, readMetaContent('playmatrix-api-url'));

  try {
    if (window.__PM_API__?.getCandidates) {
      window.__PM_API__.getCandidates().forEach((candidate) => pushUnique(list, candidate));
    }
  } catch (_) {}

  pushUnique(list, window.location.origin);
  return list;
}

function normalizeRuntime(payload = {}) {
  const runtime = payload?.runtime && typeof payload.runtime === 'object' ? payload.runtime : payload;
  const staticRuntime = readStaticRuntimeConfig();
  const firebase = sanitizeFirebaseConfig(runtime?.firebase || null) || sanitizeFirebaseConfig(staticRuntime?.firebase || null);
  const apiBase = normalizeBase(runtime?.apiBase || staticRuntime?.apiBase || window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || readMetaContent('playmatrix-api-url') || window.location.origin);
  return {
    ...cloneObject(staticRuntime || {}),
    ...cloneObject(runtime || {}),
    apiBase,
    firebase,
    firebaseReady: !!firebase
  };
}

function readStoredRuntime() {
  try {
    const raw = window.localStorage?.getItem(PM_PUBLIC_RUNTIME_CACHE_KEY) || '';
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const storedAt = Number(parsed?.storedAt || 0);
    if (!storedAt || Date.now() - storedAt > 24 * 60 * 60 * 1000) return null;
    const runtime = normalizeRuntime(parsed.runtime || {});
    return runtime.firebaseReady ? runtime : null;
  } catch (_) {
    return null;
  }
}

function persistRuntime(runtime = null) {
  if (!runtime?.firebaseReady) return;
  try {
    window.localStorage?.setItem(PM_PUBLIC_RUNTIME_CACHE_KEY, JSON.stringify({ storedAt: Date.now(), runtime }));
  } catch (_) {}
}

function applyRuntime(runtime = {}) {
  const normalized = normalizeRuntime(runtime);
  if (normalized.apiBase) {
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.apiBase = normalized.apiBase;
    window.__PLAYMATRIX_API_URL__ = normalized.apiBase;
  }
  if (normalized.firebase) {
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.firebase = normalized.firebase;
    window.__PM_RUNTIME.firebaseReady = true;
  }
  return normalized;
}

async function requestRuntime(endpoint, timeoutMs) {
  const response = await fetchWithTimeout(endpoint, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  }, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `PUBLIC_RUNTIME_HTTP_${response.status}`);
  }
  return applyRuntime(payload);
}

async function fetchRuntimeConfig(force = false, timeoutMs = 3500) {
  if (!force && runtimeCache) return cloneObject(runtimeCache);
  if (!force && runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const staticRuntime = readStaticRuntimeConfig();
    const endpoints = getEndpointCandidates();
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const runtime = await requestRuntime(endpoint, timeoutMs);
        runtimeCache = cloneObject(runtime);
        persistRuntime(runtimeCache);
        return cloneObject(runtimeCache);
      } catch (error) {
        lastError = error;
      }
    }

    if (staticRuntime?.firebaseReady) {
      runtimeCache = applyRuntime(staticRuntime);
      persistRuntime(runtimeCache);
      return cloneObject(runtimeCache);
    }

    if (!force) {
      const stored = readStoredRuntime();
      if (stored) {
        runtimeCache = applyRuntime(stored);
        return cloneObject(runtimeCache);
      }
    }

    throw lastError || new Error('PUBLIC_RUNTIME_CONFIG_UNAVAILABLE');
  })();

  try {
    return await runtimePromise;
  } finally {
    runtimePromise = null;
  }
}

export async function loadPublicRuntimeConfig(options = {}) {
  return fetchRuntimeConfig(!!options.force, options.timeoutMs);
}

export async function loadFirebaseWebConfig(options = {}) {
  let runtime = null;
  try {
    runtime = await loadPublicRuntimeConfig(options);
  } catch (error) {
    if (options.required === false) return sanitizeFirebaseConfig(readStaticRuntimeConfig()?.firebase || null);
    throw error;
  }
  const config = sanitizeFirebaseConfig(runtime?.firebase || null) || sanitizeFirebaseConfig(readStaticRuntimeConfig()?.firebase || null);
  if (config) return config;
  if (options.required === false) return null;
  throw new Error('PUBLIC_FIREBASE_CONFIG_MISSING');
}

export function getCachedPublicRuntimeConfig() {
  return cloneObject(runtimeCache || readStaticRuntimeConfig());
}

window.PM_PUBLIC_RUNTIME = window.PM_PUBLIC_RUNTIME || {
  loadPublicRuntimeConfig,
  loadFirebaseWebConfig,
  getCachedPublicRuntimeConfig
};
