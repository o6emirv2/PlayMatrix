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
    logoutInFlight: false
  };

  function getBridge() {
    return window.__PM_RUNTIME || null;
  }

  function getAuth() {
    return getBridge()?.auth || null;
  }

  function getCurrentUser() {
    return getAuth()?.currentUser || null;
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

  const DEFAULT_REMOTE_API = 'https://emirhan-siye.onrender.com';

  function getApiBase() {
    const bridge = getBridge();
    const metaBase = document.querySelector('meta[name="playmatrix-api-url"]')?.content || '';
    return String(bridge?.apiBase || window.__PLAYMATRIX_API_URL__ || metaBase || DEFAULT_REMOTE_API || '').replace(/\/+$/, '');
  }

  function getPageLabel() {
    const path = location.pathname.toLowerCase();
    if (path.includes('satranc') || path.includes('chess')) return 'Satranç';
    if (path.includes('/crash')) return 'Crash';
    if (path.includes('/mines')) return 'Mines';
    if (path.includes('blackjack')) return 'BlackJack';
    if (path.includes('/pisti')) return 'Pişti';
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
      stack.style.position = 'fixed';
      stack.style.right = '14px';
      stack.style.bottom = '14px';
      stack.style.zIndex = '999999';
      stack.style.display = 'grid';
      stack.style.gap = '10px';
      stack.style.maxWidth = 'min(92vw, 360px)';
      document.body.appendChild(stack);
    }

    const el = document.createElement('div');
    el.style.padding = '14px 16px';
    el.style.borderRadius = '16px';
    el.style.backdropFilter = 'blur(16px)';
    el.style.background = type === 'error'
      ? 'rgba(127, 29, 29, 0.92)'
      : type === 'success'
        ? 'rgba(6, 78, 59, 0.92)'
        : 'rgba(17, 24, 39, 0.92)';
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.color = '#fff';
    el.style.boxShadow = '0 18px 48px rgba(0,0,0,0.28)';
    el.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">${String(title || 'Bildirim')}</div><div style="font-size:13px;line-height:1.45;opacity:.92;">${String(message || '')}</div>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .18s ease, transform .18s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
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
      credentials: 'same-origin',
      cache: 'no-store'
    };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);
    const response = await fetch(`${apiBase}${path}`, options);
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
    if (!user) return false;
    const now = Date.now();
    const interactive = options?.interactive === true;
    const minGap = interactive ? 10000 : (document.visibilityState === 'visible' ? 45000 : 90000);
    if (!options?.force && (now - bridgeState.lastHeartbeatAt) < minGap) return false;
    bridgeState.lastHeartbeatAt = now;
    await fetchPrivate('/api/me/activity/heartbeat', 'POST', {
      status: document.visibilityState === 'visible' ? 'ACTIVE' : 'IDLE',
      activity: `${getPageLabel()} · ${reason}`,
      interactive
    });
    return true;
  }

  function stopHeartbeatLoop() {
    if (bridgeState.heartbeatTimer) {
      clearInterval(bridgeState.heartbeatTimer);
      bridgeState.heartbeatTimer = 0;
    }
  }

  function startHeartbeatLoop() {
    stopHeartbeatLoop();
    if (!getCurrentUser()) return;
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
        credentials: 'same-origin'
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
    if (getCurrentUser()) {
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
