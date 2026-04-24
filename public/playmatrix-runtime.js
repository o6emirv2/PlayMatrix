(function () {
  'use strict';

  const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
  const HEARTBEAT_WHEN_ACTIVE_MS = 5 * 60 * 1000;
  const HEARTBEAT_WHEN_HIDDEN_MS = 10 * 60 * 1000;
  const NOTIFICATION_POLL_MS = 45 * 1000;
  const bridgeState = {
    idleTimer: 0,
    heartbeatTimer: 0,
    notificationTimer: 0,
    initialized: false,
    lastActivityAt: Date.now(),
    lastInteractiveAt: Date.now(),
    lastHeartbeatAt: 0,
    seenNotificationIds: new Set(),
    logoutInFlight: false,
    heartbeatBackoffMs: 0,
    nextHeartbeatAllowedAt: 0,
    authRecoveryPromise: null,
    lastSessionIssueAt: 0
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

  window.addEventListener('error', (event) => {
    reportClientRuntimeError('window.onerror', event.error || event.message || 'window error', {
      source: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientRuntimeError('window.onunhandledrejection', event.reason || 'unhandled promise rejection');
  });

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

  async function ensureServerSession(options = {}) {
    const bridge = getBridge();
    if (typeof bridge?.ensureServerSession === 'function') {
      return bridge.ensureServerSession(options);
    }
    return bootstrapServerSession(options);
  }

  async function getToken(forceRefresh = false) {
    const bridge = getBridge();
    const user = getCurrentUser();
    if (!user) throw new Error('NO_USER');
    if (typeof bridge?.getIdToken === 'function') {
      return await bridge.getIdToken(forceRefresh);
    }
    if (typeof user.getIdToken === 'function') {
      return await user.getIdToken(forceRefresh);
    }
    throw new Error('TOKEN_HELPER_MISSING');
  }

  async function signOutBridge() {
    const bridge = getBridge();
    const auth = getAuth();
    if (typeof bridge?.signOut === 'function' && auth) {
      return bridge.signOut(auth);
    }
    const user = getCurrentUser();
    if (user && typeof user.getIdToken === 'function') return Promise.resolve();
    return Promise.resolve();
  }

  let sessionBootstrapPromise = null;

  async function bootstrapServerSession(options = {}) {
    const user = getCurrentUser();
    if (!user) return null;
    const force = !!options.force;
    if (!force && sessionBootstrapPromise) return sessionBootstrapPromise;
    const run = async () => {
      try {
        const token = await getToken(!!options.forceRefresh);
        const apiBase = getApiBase();
        if (!apiBase) throw new Error('API_BASE_MISSING');
        const response = await fetch(`${apiBase}/api/auth/session/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({}),
          credentials: 'include',
          cache: 'no-store'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || 'SESSION_BOOTSTRAP_FAILED');
        }
        return payload;
      } finally {
        if (sessionBootstrapPromise === promiseRef) sessionBootstrapPromise = null;
      }
    };
    const promiseRef = run();
    sessionBootstrapPromise = promiseRef;
    return promiseRef;
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

  function getApiBase() {
    const bridge = getBridge();
    if (window.__PM_API__?.getApiBaseSync) {
      return window.__PM_API__.getApiBaseSync();
    }
    const metaBase = document.querySelector('meta[name="playmatrix-api-url"]')?.content || '';
    return normalizeBase(bridge?.apiBase || window.__PLAYMATRIX_API_URL__ || metaBase || window.location.origin || '');
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
    titleEl.textContent = String(title || 'Bildirim');
    const messageEl = document.createElement('div');
    messageEl.className = 'pm-runtime-toast__message';
    messageEl.textContent = String(message || '');
    el.append(titleEl, messageEl);
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  async function fetchPrivate(path, method = 'GET', body) {
    const token = await getToken();
    const apiBase = getApiBase();
    if (!apiBase) throw new Error('API_BASE_MISSING');
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      cache: 'no-store'
    };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);
    let response = await fetch(`${apiBase}${path}`, options);
    if (response.status === 401) {
      const refreshed = await getToken(true).catch(() => '');
      if (refreshed) {
        options.headers.Authorization = `Bearer ${refreshed}`;
        response = await fetch(`${apiBase}${path}`, options);
      }
    }
    if (response.status === 401 && path !== '/api/auth/session/create') {
      const recoveredContext = await recoverAuthContext({ allowSessionOnly: true }).catch(() => false);
      if (recoveredContext) {
        const recovered = await getToken(false).catch(() => '');
        if (recovered) {
          options.headers.Authorization = `Bearer ${recovered}`;
          response = await fetch(`${apiBase}${path}`, options);
        }
      }
    }
    if (response.status === 401) {
      const now = Date.now();
      if ((now - bridgeState.lastSessionIssueAt) > 5000) {
        bridgeState.lastSessionIssueAt = now;
        try { toast('Oturum kapatıldı', 'Oturum zaman aşımına uğradı.', 'info'); } catch (_) {}
      }
      try { await endServerSession(); } catch (_) {}
      try { await signOutBridge(); } catch (_) {}
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const err = new Error(payload?.error || 'REQUEST_FAILED');
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  function markActivity(reason = 'interaction', immediate = false, interactive = true) {
    const now = Date.now();
    bridgeState.lastActivityAt = now;
    if (interactive) bridgeState.lastInteractiveAt = now;
    scheduleIdleLogout();
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
      if ((Date.now() - bridgeState.lastInteractiveAt) >= IDLE_TIMEOUT_MS) return;
      const now = Date.now();
      const idleFor = now - bridgeState.lastInteractiveAt;
      if (idleFor >= IDLE_TIMEOUT_MS) return;
      const threshold = document.visibilityState === 'visible' ? HEARTBEAT_WHEN_ACTIVE_MS : HEARTBEAT_WHEN_HIDDEN_MS;
      if ((now - bridgeState.lastHeartbeatAt) >= threshold) {
        sendHeartbeat(document.visibilityState === 'visible' ? 'heartbeat' : 'background', { interactive: false }).catch(() => null);
      }
    }, 60000);
  }

  async function endServerSession() {
    const apiBase = getApiBase();
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/auth/session/logout`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include'
      });
    } catch (_) {}
  }

  async function forceIdleLogout() {
    if (bridgeState.logoutInFlight) return;
    bridgeState.logoutInFlight = true;
    stopHeartbeatLoop();
    try {
      toast('Oturum kapatıldı', '1 saat işlem yapılmadığı için güvenlik amaçlı çıkış yapıldı.', 'info');
      await endServerSession();
      await signOutBridge().catch(() => null);
    } finally {
      setTimeout(() => {
        location.replace('/');
      }, 250);
    }
  }

  function scheduleIdleLogout() {
    if (bridgeState.idleTimer) {
      clearTimeout(bridgeState.idleTimer);
      bridgeState.idleTimer = 0;
    }
    if (!getCurrentUser()) return;
    const idleFor = Date.now() - bridgeState.lastInteractiveAt;
    const remaining = Math.max(500, IDLE_TIMEOUT_MS - idleFor);
    bridgeState.idleTimer = window.setTimeout(() => {
      forceIdleLogout().catch(() => null);
    }, remaining);
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
        toast(item?.title || 'Yeni bildirim', item?.body || 'Yeni bir sistem bildirimi aldın.', item?.type === 'reward' ? 'success' : 'info');
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
    if (getCurrentUser() && isAuthReady()) {
      markActivity('session-sync', false);
      startHeartbeatLoop();
      startNotificationLoop();
    } else {
      stopHeartbeatLoop();
      stopNotificationLoop();
      if (bridgeState.idleTimer) {
        clearTimeout(bridgeState.idleTimer);
        bridgeState.idleTimer = 0;
      }
    }
  }

  function boot() {
    if (bridgeState.initialized) return;
    bridgeState.initialized = true;
    bindActivitySources();
    installTouchHardening();

    window.setInterval(() => {
      if (getBridge()) syncLoops();
    }, 3000);

    syncLoops();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
