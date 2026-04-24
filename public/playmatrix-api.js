(function () {
  'use strict';

  const DEV_FALLBACKS_BY_HOST = {
    'localhost': 'http://localhost:3000',
    '127.0.0.1': 'http://localhost:3000'
  };
  const PM_API_STORAGE_KEY = 'pm_api_base';
  const PM_API_TIMEOUT_MS = 2500;

  function fetchWithTimeout(resource, options = {}, timeoutMs = PM_API_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || PM_API_TIMEOUT_MS));
    return fetch(resource, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timer));
  }

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  function getHostFallback() {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    return normalizeBase(DEV_FALLBACKS_BY_HOST[host] || '');
  }

  function getMetaBase() {
    return normalizeBase(document.querySelector('meta[name="playmatrix-api-url"]')?.content || '');
  }

  function getRuntimeBase() {
    return normalizeBase(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || '');
  }

  function getStoredBase() {
    try {
      const fromSession = normalizeBase(window.sessionStorage?.getItem(PM_API_STORAGE_KEY) || '');
      if (fromSession) return fromSession;
    } catch (_) {}
    try {
      return normalizeBase(window.localStorage?.getItem(PM_API_STORAGE_KEY) || '');
    } catch (_) {
      return '';
    }
  }

  function persistBase(value) {
    const normalized = normalizeBase(value);
    if (!normalized) return;
    try { window.sessionStorage?.setItem(PM_API_STORAGE_KEY, normalized); } catch (_) {}
    try { window.localStorage?.setItem(PM_API_STORAGE_KEY, normalized); } catch (_) {}
  }

  function getCandidates() {
    const list = [];
    const push = (value) => {
      const normalized = normalizeBase(value);
      if (!normalized || list.includes(normalized)) return;
      list.push(normalized);
    };
    push(getRuntimeBase());
    push(getMetaBase());
    push(getStoredBase());
    push(getHostFallback());
    push(window.location.origin);
    return list;
  }

  function setApiBase(base) {
    const normalized = normalizeBase(base);
    if (!normalized) return normalizeBase(window.location.origin);
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.apiBase = normalized;
    window.__PLAYMATRIX_API_URL__ = normalized;
    persistBase(normalized);
    return normalized;
  }

  function getApiBaseSync() {
    const preferred = getRuntimeBase()
      || getMetaBase()
      || getStoredBase()
      || getHostFallback()
      || normalizeBase(window.location.origin);
    return setApiBase(preferred);
  }

  async function probeBase(base) {
    const normalized = normalizeBase(base);
    if (!normalized) return false;
    for (const probePath of ['/api/healthz', '/healthz']) {
      try {
        const response = await fetchWithTimeout(`${normalized}${probePath}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          cache: 'no-store'
        }, 1800);
        if (!response.ok) continue;
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) continue;
        const payload = await response.json().catch(() => null);
        if (payload && payload.ok === true) return true;
      } catch (_) {}
    }
    return false;
  }

  let ensurePromise = null;
  async function ensureApiBase() {
    if (ensurePromise) return ensurePromise;
    ensurePromise = (async () => {
      const candidates = getCandidates();
      for (const base of candidates) {
        if (await probeBase(base)) return setApiBase(base);
      }
      return setApiBase(candidates[0] || window.location.origin);
    })();
    try {
      return await ensurePromise;
    } finally {
      ensurePromise = null;
    }
  }

  function buildUrl(path) {
    const raw = String(path || '').trim();
    if (!raw) return getApiBaseSync();
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = getApiBaseSync();
    const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
    return `${base}${cleanPath}`;
  }

  async function fetchJson(path, options = {}) {
    await ensureApiBase();
    const response = await fetchWithTimeout(buildUrl(path), options, options.timeoutMs || PM_API_TIMEOUT_MS);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function getSocketClientCandidates() {
    return getCandidates().map((base) => `${base}/socket.io/socket.io.js`);
  }

  async function loadSocketClientScript() {
    const urls = getSocketClientCandidates();
    let lastError = null;
    for (const src of urls) {
      try {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector(`script[data-pm-socket-src="${src}"]`);
          if (existing && existing.dataset.loaded === 'true') {
            resolve();
            return;
          }
          if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', () => reject(new Error('SOCKET_SCRIPT_ERROR')), { once: true });
            return;
          }
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.defer = true;
          script.dataset.pmSocketSrc = src;
          script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
          }, { once: true });
          script.addEventListener('error', () => reject(new Error('SOCKET_SCRIPT_ERROR')), { once: true });
          document.head.appendChild(script);
        });
        if (window.io) return src;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('SOCKET_SCRIPT_ERROR');
  }

  window.__PM_API__ = {
    normalizeBase,
    getCandidates,
    getApiBaseSync,
    setApiBase,
    ensureApiBase,
    probeBase,
    buildUrl,
    fetchJson,
    fetchWithTimeout,
    getSocketClientCandidates,
    loadSocketClientScript
  };
})();
