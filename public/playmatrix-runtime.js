(function () {
  'use strict';

  const HEARTBEAT_WHEN_ACTIVE_MS = 5 * 60 * 1000;
  const HEARTBEAT_WHEN_HIDDEN_MS = 10 * 60 * 1000;
  const NOTIFICATION_POLL_MS = 45 * 1000;
  const PM_AUTH_REQUIRED_UID_KEY = 'pm_auth_required_uid';
  function readServerSessionToken() { return ''; }
  function markAuthRequired() {
    const uid = currentBridgeUid();
    if (!uid) return;
    try { sessionStorage.setItem(PM_AUTH_REQUIRED_UID_KEY, uid); } catch (_) {}
    try { localStorage.setItem(PM_AUTH_REQUIRED_UID_KEY, uid); } catch (_) {}
  }
  function isAuthRequiredLocked() {
    const uid = currentBridgeUid();
    if (!uid) return false;
    try { if (sessionStorage.getItem(PM_AUTH_REQUIRED_UID_KEY) === uid) return true; } catch (_) {}
    try { if (localStorage.getItem(PM_AUTH_REQUIRED_UID_KEY) === uid) return true; } catch (_) {}
    return false;
  }
  function writeServerSessionToken() { return ''; }
  function clearServerSessionToken() { return ''; }
  function authProblem(payload = {}, status = 0) {
    const code = String(payload.code || payload.error || '').toUpperCase();
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') return 'required';
    return '';
  }

  const bridgeState = {
    heartbeatTimer: 0,
    notificationTimer: 0,
    initialized: false,
    lastActivityAt: Date.now(),
    lastHeartbeatAt: 0,
    seenNotificationIds: new Set(),
    heartbeatBackoffMs: 0,
    nextHeartbeatAllowedAt: 0,
    authRecoveryPromise: null,
    lastAuthIssueAt: 0,
    activeUid: '',
    serverSessionUid: '',
    lastServerSessionSyncAt: 0,
    serverSessionPromise: null
  };

  window.__PM_RUNTIME_SHARED_HEARTBEAT__ = true;

  const CLIENT_ERROR_MAX_PER_MINUTE = 12;
  const clientErrorWindow = { startedAt: Date.now(), count: 0 };

  function normalizeBase(value = '') {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  function cleanClientString(value, max = 1000) {
    return String(value || '').replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/g, '[REDACTED]').slice(0, max);
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

  function serializeClientRuntimeError(error) {
    if (error instanceof Error) {
      return {
        name: cleanClientString(error.name || 'Error', 120),
        message: cleanClientString(error.message || 'Bilinmeyen hata', 500),
        stack: cleanClientString(error.stack || '', 5000)
      };
    }
    if (error && typeof error === 'object') {
      return {
        name: cleanClientString(error.name || 'Error', 120),
        message: cleanClientString(error.message || JSON.stringify(error), 500),
        stack: cleanClientString(error.stack || '', 5000)
      };
    }
    return { name: 'Error', message: cleanClientString(error || 'Bilinmeyen hata', 500), stack: '' };
  }

  function canSendClientError() {
    const now = Date.now();
    if ((now - clientErrorWindow.startedAt) > 60000) {
      clientErrorWindow.startedAt = now;
      clientErrorWindow.count = 0;
    }
    clientErrorWindow.count += 1;
    return clientErrorWindow.count <= CLIENT_ERROR_MAX_PER_MINUTE;
  }

  async function reportClientRuntimeError(scope, error, extra = {}) {
    try {
      if (!canSendClientError()) return null;
      const apiBase = getApiBase();
      if (!apiBase) return null;
      const serialized = serializeClientRuntimeError(error);
      const payload = {
        ...serialized,
        scope: cleanClientString(scope || 'client', 120),
        path: location.pathname || '',
        href: location.href || '',
        source: cleanClientString(extra.source || '', 500),
        lineno: Number(extra.lineno || 0) || 0,
        colno: Number(extra.colno || 0) || 0,
        visibilityState: document.visibilityState || '',
        userAgent: navigator.userAgent || '',
        endpoint: cleanClientString(extra.endpoint || '', 500),
        status: Number(extra.status || 0) || 0,
        code: cleanClientString(extra.code || '', 120),
        ms: Number(extra.ms || 0) || 0,
        ts: Date.now()
      };
      const token = await getToken(false).catch(() => '');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${apiBase}/api/client-errors`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include',
        keepalive: true,
        cache: 'no-store'
      }).catch(() => null);
    } catch (_ignored) {
      return null;
    }
  }

  window.__PM_REPORT_CLIENT_ERROR__ = reportClientRuntimeError;
  window.PMReportRuntimeError = reportClientRuntimeError;
  window.PMLogError = reportClientRuntimeError;

  function installFetchErrorBridge() {
    if (window.__PM_FETCH_ERROR_BRIDGE__) return;
    window.__PM_FETCH_ERROR_BRIDGE__ = true;
    const nativeFetch = window.fetch;
    if (typeof nativeFetch !== 'function') return;
    window.fetch = async function pmObservedFetch(input, init) {
      const startedAt = Date.now();
      const urlText = typeof input === 'string' ? input : String(input?.url || '');
      const isClientErrorEndpoint = /\/api\/client-errors?|\/api\/client\/error/i.test(urlText);
      try {
        const response = await nativeFetch.apply(this, arguments);
        if (!isClientErrorEndpoint && response && response.status >= 400 && /\/api\//i.test(urlText)) {
          let errorCode = `HTTP_${response.status}`;
          try {
            const cloned = response.clone();
            const payload = await cloned.json().catch(() => null);
            if (payload && (payload.error || payload.code)) errorCode = String(payload.error || payload.code || errorCode);
          } catch (_ignored) {}
          reportClientRuntimeError(response.status >= 500 ? 'api.fetch.5xx' : 'api.fetch.4xx', new Error(errorCode), {
            source: urlText.slice(0, 500),
            status: response.status,
            endpoint: urlText.slice(0, 500),
            code: errorCode,
            ms: Date.now() - startedAt
          });
        }
        return response;
      } catch (error) {
        if (!isClientErrorEndpoint && /\/api\//i.test(urlText)) {
          reportClientRuntimeError('api.fetch.network', error, {
            source: urlText.slice(0, 500),
            endpoint: urlText.slice(0, 500),
            ms: Date.now() - startedAt
          });
        }
        throw error;
      }
    };
  }
  installFetchErrorBridge();

  if (window.__PM_RUNTIME_ERROR_LISTENERS__ !== 'installed') {
    window.__PM_RUNTIME_ERROR_LISTENERS__ = 'installed';
    if (window.__PM_GLOBAL_ERROR_LISTENERS__ !== 'installed') {
      window.addEventListener('error', (event) => {
        reportClientRuntimeError('window.onerror', event.error || event.message || 'window error', {
          source: event.filename || '',
          lineno: event.lineno || 0,
          colno: event.colno || 0
        });
      });
    }
    window.addEventListener('unhandledrejection', (event) => {
      reportClientRuntimeError('window.onunhandledrejection', event.reason || 'unhandled promise rejection');
    });
  }

  function getBridge() {
    return window.__PM_RUNTIME || null;
  }

  function getAuth() {
    return getBridge()?.auth || null;
  }

  function getCurrentUser() {
    return getAuth()?.currentUser || null;
  }

  function isAuthReady() {
    const bridge = getBridge();
    if (typeof bridge?.authReady === 'function') return !!bridge.authReady();
    return !!getCurrentUser();
  }

  function storedPersistenceMode() {
    try { if (window.localStorage?.getItem('pm_login_persistence') === 'local') return 'local'; } catch (_) {}
    try { if (window.sessionStorage?.getItem('pm_login_persistence') === 'session') return 'session'; } catch (_) {}
    return 'session';
  }

  async function ensureServerSession(options = {}) {
    const user = getCurrentUser();
    const uid = String(user?.uid || '').trim();
    if (!uid) return false;
    const now = Date.now();
    if (!options.force && bridgeState.serverSessionUid === uid && (now - bridgeState.lastServerSessionSyncAt) < 4 * 60 * 1000) return true;
    if (bridgeState.serverSessionPromise) return bridgeState.serverSessionPromise;
    bridgeState.serverSessionPromise = (async () => {
      const apiBase = getApiBase();
      if (!apiBase) return false;
      const idToken = await getToken(options.forceRefresh === true).catch(() => '');
      if (!idToken) return false;
      const response = await fetch(`${apiBase}/api/auth/session`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-PlayMatrix-Client': 'runtime-session' },
        body: JSON.stringify({ idToken, remember: storedPersistenceMode() === 'local' })
      });
      if (!response.ok) return false;
      bridgeState.serverSessionUid = uid;
      bridgeState.lastServerSessionSyncAt = Date.now();
      return true;
    })().finally(() => { bridgeState.serverSessionPromise = null; });
    return bridgeState.serverSessionPromise;
  }

  async function recoverAuthContext(options = {}) {
    if (bridgeState.authRecoveryPromise) return bridgeState.authRecoveryPromise;
    const run = async () => {
      const user = getCurrentUser();
      if (!user) return false;
      const refreshed = await getToken(true).catch(() => '');
      if (!refreshed && !options.allowSessionOnly) return false;
      await ensureServerSession({ force: true, forceRefresh: true }).catch(() => null);
      return true;
    };
    bridgeState.authRecoveryPromise = run().finally(() => {
      bridgeState.authRecoveryPromise = null;
    });
    return bridgeState.authRecoveryPromise;
  }

  function isProductionHost() {
    return /(^|\.)playmatrix\.com\.tr$/i.test(String(window.location.hostname || '').trim());
  }

  function getApiBase() {
    const bridge = getBridge();
    if (window.__PM_API__?.getApiBaseSync) {
      return window.__PM_API__.getApiBaseSync();
    }
    const metaBase = document.querySelector('meta[name="playmatrix-api-url"]')?.content || '';
    return normalizeBase(bridge?.apiBase || window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || metaBase || (!isProductionHost() ? window.location.origin : '') || '');
  }

  function getPageLabel() {
    const path = location.pathname.toLowerCase();
    if (path.includes('satranc') || path.includes('chess')) return 'Satranç';
    if (path.includes('/crash')) return 'Crash';
    return 'PlayMatrix';
  }

  function toast(title, message, type = 'info') {
    try {
      if (typeof window.pmRtToast === 'function') return window.pmRtToast(title, message, type);
      if (typeof window.showToast === 'function') return window.showToast(title, message, type);
      if (typeof window.toast === 'function') return window.toast(title, message, type);
    } catch (_) {}

    let stack = document.getElementById('pm-runtime-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'pm-runtime-toast-stack';
      stack.className = 'pm-runtime-toast-stack';
      document.body.appendChild(stack);
    }

    const el = document.createElement('div');
    el.className = `pm-runtime-toast pm-runtime-toast--${type === 'error' ? 'error' : type === 'success' ? 'success' : 'info'}`;
    const titleEl = document.createElement('div');
    titleEl.className = 'pm-runtime-toast__title';
    let safeTitle = userFacingText(title || 'Bildirim', 'Bildirim');
    const safeMessage = userFacingText(message || '', 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
    if (/tamamlanamadı|yüklenemedi|doğrulanamadı|failed|error/i.test(safeTitle) && /başarıyla|tamamlandı|giriş yapıldı|çıkış yapıldı|hoş geldin/i.test(safeMessage)) safeTitle = 'PlayMatrix';
    titleEl.textContent = safeTitle;
    const messageEl = document.createElement('div');
    messageEl.className = 'pm-runtime-toast__message';
    messageEl.textContent = safeMessage;
    el.append(titleEl, messageEl);
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  async function fetchPrivate(path, method = 'GET', body, authRetry = true) {
    const apiBase = getApiBase();
    if (!apiBase) throw new Error('API_BASE_MISSING');

    const execute = async (token = '') => {
      const headers = {
        'Content-Type': 'application/json',
        'X-PlayMatrix-Client': 'runtime'
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const options = {
        method,
        headers,
        credentials: 'include',
        cache: 'no-store'
      };
      if (body !== undefined && body !== null) options.body = JSON.stringify(body);
      const response = await fetch(`${apiBase}${path}`, options);
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    };

    let token = await getToken(false).catch(() => '');
    let result = await execute(token);

    if (result.response.status === 401 && authRetry && getCurrentUser()) {
      const refreshed = await getToken(true).catch(() => '');
      if (refreshed) {
        token = refreshed;
        result = await execute(refreshed);
      }
    }

    if (result.response.status === 401 && authRetry && getCurrentUser()) {
      const sessionReady = await ensureServerSession({ force: true, forceRefresh: true }).catch(() => false);
      if (sessionReady) result = await execute(token);
    }

    const { response, payload } = result;
    if (response.status === 401) {
      const now = Date.now();
      if ((now - bridgeState.lastAuthIssueAt) > 7000) {
        bridgeState.lastAuthIssueAt = now;
        try { toast('Oturum doğrulanıyor', 'Hesap bağlantısı yenileniyor. Lütfen işlemi tekrar dene.', 'info'); } catch (_) {}
      }
      try { window.dispatchEvent(new CustomEvent('playmatrix:session-required', { detail: { at: now, source: 'runtime', recoverable: true } })); } catch (_) {}
    }
    if (!response.ok || payload?.ok === false) {
      const code = String(payload?.code || payload?.error || '').toUpperCase();
      const fallback = response.status === 401
        ? 'Hesap bağlantısı şu anda doğrulanamadı. Lütfen işlemi tekrar dene.'
        : 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.';
      const err = new Error(userFacingText(payload?.error || code || 'REQUEST_FAILED', fallback));
      err.code = code || `HTTP_${response.status}`;
      err.status = response.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  function markActivity(reason = 'interaction', immediate = false, interactive = true) {
    const now = Date.now();
    bridgeState.lastActivityAt = now;
    if (immediate) sendHeartbeat(reason, { interactive }).catch(() => null);
  }

  async function sendHeartbeat(reason = 'active', options = {}) {
    const user = getCurrentUser();
    if (!user || !isAuthReady()) return false;
    const now = Date.now();
    const interactive = options?.interactive === true;
    const minGap = interactive ? 10000 : (document.visibilityState === 'visible' ? 45000 : 90000);
    if (!options?.force && (now - bridgeState.lastHeartbeatAt) < minGap) return false;
    if (!options?.force && now < bridgeState.nextHeartbeatAllowedAt) return false;
    bridgeState.lastHeartbeatAt = now;
    try {
      await fetchPrivate('/api/me/activity/heartbeat', 'POST', {
        status: document.visibilityState === 'visible' ? 'ACTIVE' : 'IDLE',
        activity: `${getPageLabel()} · ${reason}`,
        interactive,
        page: location.pathname,
        context: document.visibilityState === 'visible' ? 'foreground' : 'background'
      });
      bridgeState.heartbeatBackoffMs = 0;
      bridgeState.nextHeartbeatAllowedAt = 0;
      return true;
    } catch (error) {
      const current = Math.max(30000, bridgeState.heartbeatBackoffMs || 0);
      bridgeState.heartbeatBackoffMs = Math.min(current ? current * 2 : 30000, 5 * 60 * 1000);
      bridgeState.nextHeartbeatAllowedAt = Date.now() + bridgeState.heartbeatBackoffMs;
      throw error;
    }
  }

  function stopHeartbeatLoop() {
    if (bridgeState.heartbeatTimer) {
      clearInterval(bridgeState.heartbeatTimer);
      bridgeState.heartbeatTimer = 0;
    }
  }

  function startHeartbeatLoop() {
    stopHeartbeatLoop();
    if (!getCurrentUser() || !isAuthReady()) return;
    sendHeartbeat('boot', { interactive: true, force: true }).catch(() => null);
    bridgeState.heartbeatTimer = window.setInterval(() => {
      if (!getCurrentUser()) return;
      const now = Date.now();
      const threshold = document.visibilityState === 'visible' ? HEARTBEAT_WHEN_ACTIVE_MS : HEARTBEAT_WHEN_HIDDEN_MS;
      if ((now - bridgeState.lastHeartbeatAt) >= threshold) {
        sendHeartbeat(document.visibilityState === 'visible' ? 'heartbeat' : 'background', { interactive: false }).catch(() => null);
      }
    }, 60000);
  }

  async function endServerSession() {
    clearServerSessionToken();
    bridgeState.serverSessionUid = '';
    bridgeState.lastServerSessionSyncAt = 0;
    const apiBase = getApiBase();
    if (!apiBase) return false;
    try {
      await fetch(`${apiBase}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-PlayMatrix-Client': 'runtime-session' },
        body: '{}'
      });
      return true;
    } catch (_) { return false; }
  }


  async function pollNotifications() {
    if (!getCurrentUser()) return;
    try {
      const payload = await fetchPrivate('/api/notifications?limit=12');
      const items = Array.isArray(payload?.items) ? payload.items : [];
      for (const item of items.reverse()) {
        const id = String(item?.id || '').trim();
        if (!id || bridgeState.seenNotificationIds.has(id)) continue;
        bridgeState.seenNotificationIds.add(id);
        if (item?.read) continue;
        const source = String(item?.source || item?.data?.source || '').toLowerCase();
        const category = String(item?.category || '').toLowerCase();
        if (item?.type === 'reward' || category === 'economy' || /reward|promo|spin|activity_pass|wheel/.test(source)) continue;
        toast(userFacingText(item?.title || 'Yeni bildirim', 'Yeni bildirim'), userFacingText(item?.body || 'Yeni bir sistem bildirimi aldın.', 'Yeni bir sistem bildirimi aldın.'), 'info');
      }
      while (bridgeState.seenNotificationIds.size > 80) {
        const first = bridgeState.seenNotificationIds.values().next().value;
        bridgeState.seenNotificationIds.delete(first);
      }
    } catch (_) {}
  }

  function stopNotificationLoop() {
    if (bridgeState.notificationTimer) {
      clearInterval(bridgeState.notificationTimer);
      bridgeState.notificationTimer = 0;
    }
  }

  function startNotificationLoop() {
    stopNotificationLoop();
    if (!getCurrentUser()) return;
    pollNotifications().catch(() => null);
    bridgeState.notificationTimer = window.setInterval(() => {
      pollNotifications().catch(() => null);
    }, NOTIFICATION_POLL_MS);
  }

  function installTouchHardening() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
      const now = Date.now();
      if ((now - lastTouchEnd) <= 280) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  }

  function bindActivitySources() {
    const handler = () => markActivity('input', true, true);
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((eventName) => {
      document.addEventListener(eventName, handler, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        markActivity('visible', true, true);
      }
    }, { passive: true });

    window.addEventListener('focus', () => markActivity('focus', true, true), { passive: true });
    window.addEventListener('pageshow', () => markActivity('pageshow', true, true), { passive: true });
  }

  function syncLoops() {
    const uid = String(getCurrentUser()?.uid || '').trim();
    if (uid && isAuthReady()) {
      ensureServerSession().catch(() => false);
      if (bridgeState.activeUid === uid) return;
      bridgeState.activeUid = uid;
      markActivity('session-sync', false);
      startHeartbeatLoop();
      startNotificationLoop();
      return;
    }
    if (!bridgeState.activeUid) return;
    bridgeState.activeUid = '';
    bridgeState.serverSessionUid = '';
    bridgeState.lastServerSessionSyncAt = 0;
    stopHeartbeatLoop();
    stopNotificationLoop();
  }

  function boot() {
    if (bridgeState.initialized) return;
    bridgeState.initialized = true;
    bindActivitySources();
    installTouchHardening();

    window.setInterval(() => {
      if (getBridge()) syncLoops();
    }, 10000);

    syncLoops();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
