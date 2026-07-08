(function () {
  'use strict';

  const PM_API_STORAGE_KEY = 'pm_api_base';
  const PM_API_TIMEOUT_MS = 2500;
  const RUNTIME_ENDPOINT_SUFFIX = '/api/public/runtime-config';

  function fetchWithTimeout(resource, options = {}, timeoutMs = PM_API_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || PM_API_TIMEOUT_MS));
    return fetch(resource, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timer));
  }

  function normalizeBase(value) {
    const raw = String(value || '').trim();
    if (!raw || /^(__|env:|runtime-config$)/i.test(raw)) return '';
    const withoutEndpoint = raw.replace(new RegExp(`${RUNTIME_ENDPOINT_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
    return withoutEndpoint.replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  function isProductionHost() {
    return /(^|\.)playmatrix\.com\.tr$/i.test(String(window.location.hostname || '').trim());
  }


  function getMetaBase() {
    return normalizeBase(document.querySelector('meta[name="playmatrix-api-url"]')?.content || '');
  }

  function getRuntimeBase() {
    return normalizeBase(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || '');
  }

  function getStaticRuntimeBase() {
    return normalizeBase(window.__PM_STATIC_RUNTIME_CONFIG__?.apiBase || '');
  }

  function isCurrentOriginOnly(base) {
    return normalizeBase(base) === normalizeBase(window.location.origin);
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

    // Custom PlayMatrix domain is served by the same production application.
    // Prefer same-origin so HttpOnly session cookies and Socket.IO work reliably on iOS.
    push(window.location.origin);
    push(getRuntimeBase());
    push(getStaticRuntimeBase());
    push(getMetaBase());
    push(getStoredBase());
    try { push(window.__PM_STATIC_RUNTIME_CONFIG__?.apiFallbackBase || ''); } catch (_) {}
    return list;
  }

  function setApiBase(base) {
    const normalized = normalizeBase(base);
    if (!normalized) return '';
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.apiBase = normalized;
    window.__PLAYMATRIX_API_URL__ = normalized;
    persistBase(normalized);
    return normalized;
  }

  function getApiBaseSync() {
    const sameOrigin = normalizeBase(window.location.origin);
    const preferred = sameOrigin
      || getRuntimeBase()
      || getStaticRuntimeBase()
      || getMetaBase()
      || getStoredBase();
    return setApiBase(preferred || (!isProductionHost() ? window.location.origin : ''));
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
  let lastResolvedBase = '';
  let lastResolvedAt = 0;
  const API_BASE_CACHE_MS = 60_000;
  async function ensureApiBase() {
    // On the PlayMatrix custom domain, same-origin is authoritative. Using the
    // raw Render hostname would make the HttpOnly session cookie third-party
    // on iOS/Safari and games would incorrectly report AUTH_REQUIRED.
    if (isProductionHost()) {
      const sameOrigin = setApiBase(window.location.origin);
      lastResolvedBase = sameOrigin;
      lastResolvedAt = Date.now();
      return sameOrigin;
    }
    const currentBase = getRuntimeBase() || getStaticRuntimeBase() || getMetaBase() || getStoredBase();
    const now = Date.now();
    if (lastResolvedBase && (now - lastResolvedAt) < API_BASE_CACHE_MS) return setApiBase(lastResolvedBase);
    if (currentBase && !isCurrentOriginOnly(currentBase)) {
      lastResolvedBase = setApiBase(currentBase);
      lastResolvedAt = now;
      return lastResolvedBase;
    }
    if (ensurePromise) return ensurePromise;
    ensurePromise = (async () => {
      const candidates = getCandidates();
      for (const base of candidates) {
        if (await probeBase(base)) {
          lastResolvedBase = setApiBase(base);
          lastResolvedAt = Date.now();
          return lastResolvedBase;
        }
      }
      const staticBase = getStaticRuntimeBase();
      if (staticBase && !isCurrentOriginOnly(staticBase)) {
        lastResolvedBase = setApiBase(staticBase);
        lastResolvedAt = Date.now();
        return lastResolvedBase;
      }
      const runtimeBase = getRuntimeBase();
      if (runtimeBase && !isCurrentOriginOnly(runtimeBase)) {
        lastResolvedBase = setApiBase(runtimeBase);
        lastResolvedAt = Date.now();
        return lastResolvedBase;
      }
      lastResolvedBase = setApiBase(candidates[0] || (!isProductionHost() ? window.location.origin : ''));
      lastResolvedAt = Date.now();
      return lastResolvedBase;
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
    if (!base) throw new Error('İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
    const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
    return `${base}${cleanPath}`;
  }

  function requestId(prefix = 'pm') {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}_${window.crypto.randomUUID()}`;
    } catch (_) {}
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function userFacingText(value, fallback = 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.') {
    try {
      if (window.PMUserMessages?.normalize) return window.PMUserMessages.normalize(value, fallback);
      if (typeof window.PMSanitizeUserMessage === 'function') return window.PMSanitizeUserMessage(value, fallback);
    } catch (_) {}
    const raw = String(value || '').trim();
    if (!raw || /render\s*memory|\brender\b|firebase|sunucu|server|backend|endpoint|socket|http[_\s-]*\d{3}|internal\s*error|permission\s*denied|unauthorized|undefined|null|exception|stack\s*trace|request\s*failed/i.test(raw)) return fallback;
    return raw.length > 180 ? fallback : raw;
  }


  function handleSessionProblem(payload = {}, status = 0) {
    const code = String(payload?.code || payload?.error || '').toUpperCase();
    if (status === 409 && code === 'AUTH_REQUIRED') {
      try { window.dispatchEvent(new CustomEvent('playmatrix:auth-required', { detail: { at: Date.now(), source: 'playmatrix-api' } })); } catch (_) {}
      return true;
    }
    if (code === 'SESSION_REQUIRED' || code === 'SESSION_INVALID') {
      try { window.dispatchEvent(new CustomEvent('playmatrix:session-required', { detail: { at: Date.now(), source: 'playmatrix-api', code } })); } catch (_) {}
    }
    return false;
  }

  async function fetchJson(path, options = {}) {
    await ensureApiBase();
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', requestId('api'));
    const response = await fetchWithTimeout(buildUrl(path), { ...options, headers }, options.timeoutMs || PM_API_TIMEOUT_MS);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      const wasReplaced = handleSessionProblem(payload, response.status);
      const message = typeof payload?.error === 'object'
        ? (payload.error.message || payload.error.code || `HTTP ${response.status}`)
        : (payload?.error || payload?.message || `HTTP ${response.status}`);
      const rawCode = typeof payload?.error === 'object'
        ? (payload.error.code || payload.error.error || payload.code || '')
        : (payload?.code || payload?.error || '');
      const friendlyMessage = wasReplaced ? 'Devam etmek için giriş yapman gerekiyor.' : userFacingText(message, 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
      const error = new Error(friendlyMessage);
      error.code = wasReplaced ? 'AUTH_REQUIRED' : String(rawCode || '').toUpperCase();
      error.rawCode = String(rawCode || '').toUpperCase();
      error.userMessage = friendlyMessage;
      error.status = response.status;
      error.payload = payload;
      error.requestId = response.headers.get('X-Request-Id') || payload?.requestId || headers.get('X-Request-Id');
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
    requestId,
    getSocketClientCandidates,
    loadSocketClientScript
  };
})();
