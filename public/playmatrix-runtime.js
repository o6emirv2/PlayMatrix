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
    observation: {
      queue: [],
      flushTimer: 0,
      sentAt: 0,
      installed: false,
      sessionId: Math.random().toString(36).slice(2),
      cls: 0,
      frameSamplerId: 0,
      lastFrameAt: 0,
      lastZoomScale: 1
    }
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

  const DEFAULT_REMOTE_API = '';

  function getApiBase() {
    const bridge = getBridge();
    const metaBase = document.querySelector('meta[name="playmatrix-api-url"]')?.content || '';
    return String(bridge?.apiBase || window.__PLAYMATRIX_API_URL__ || window.location.origin || metaBase || DEFAULT_REMOTE_API || '').replace(/\/+$/, '');
  }

  function buildRuntimeApiUrl(pathname = '') {
    const apiBase = String(getApiBase() || '').replace(/\/+$/, '');
    const cleanPath = String(pathname || '').startsWith('/') ? String(pathname || '') : `/${String(pathname || '')}`;
    if (!apiBase) return cleanPath;
    if (/\/api$/i.test(apiBase) && /^\/api\//i.test(cleanPath)) {
      return `${apiBase}${cleanPath.replace(/^\/api/i, '')}`;
    }
    return `${apiBase}${cleanPath}`;
  }

  function safeJsonParse(text, fallback = {}) {
    try { return JSON.parse(text); } catch (_) { return fallback; }
  }

  function getViewportSnapshot() {
    const vv = window.visualViewport;
    return {
      width: Math.round(vv?.width || window.innerWidth || 0),
      height: Math.round(vv?.height || window.innerHeight || 0),
      scale: Number(Number(vv?.scale || 1).toFixed(3)),
      offsetTop: Math.round(vv?.offsetTop || 0),
      offsetLeft: Math.round(vv?.offsetLeft || 0)
    };
  }

  function getObservationEnvelope() {
    return {
      page: location.pathname,
      pathname: location.pathname,
      route: location.pathname,
      pageLabel: getPageLabel(),
      visibilityState: document.visibilityState || 'visible',
      networkState: navigator.onLine === false ? 'offline' : 'online',
      releaseId: document.documentElement?.dataset?.pmReleaseId || '',
      appVersion: document.documentElement?.dataset?.pmVersion || '',
      sessionId: bridgeState.observation.sessionId,
      viewport: getViewportSnapshot(),
      context: {
        title: document.title || ''
      }
    };
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
    const response = await fetch(buildRuntimeApiUrl(path), options);
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


  function enforceViewportLock() {
    let meta = document.querySelector('meta[name="viewport"]');
    const content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    if (String(meta.getAttribute('content') || '').trim() !== content) {
      meta.setAttribute('content', content);
    }
  }

  function queueObservation(event) {
    if (!event || typeof event !== 'object') return;
    const row = Object.assign({ createdAt: Date.now() }, event);
    bridgeState.observation.queue.push(row);
    if (bridgeState.observation.queue.length >= 4) {
      flushObservations('threshold').catch(() => null);
      return;
    }
    if (!bridgeState.observation.flushTimer) {
      bridgeState.observation.flushTimer = window.setTimeout(() => {
        bridgeState.observation.flushTimer = 0;
        flushObservations('timer').catch(() => null);
      }, 15000);
    }
  }

  async function flushObservations(reason = 'manual') {
    const observation = bridgeState.observation;
    if (!observation.queue.length) return false;
    const now = Date.now();
    if (reason !== 'visibility' && reason !== 'pagehide' && (now - observation.sentAt) < 2000) return false;
    const events = observation.queue.splice(0, 12);
    observation.sentAt = now;
    const payload = Object.assign(getObservationEnvelope(), { reason, events });
    const url = buildRuntimeApiUrl('/api/live/observe/client');
    const token = await getToken().catch(() => '');
    const body = JSON.stringify(payload);

    if ((reason === 'visibility' || reason === 'pagehide') && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return true;
      } catch (_) {}
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: reason === 'pagehide',
      body
    }).then(async (response) => {
      if (response.ok) return true;
      const text = await response.text().catch(() => '');
      throw new Error((safeJsonParse(text, {}).error || `HTTP_${response.status}`));
    }).catch(() => {
      observation.queue = events.concat(observation.queue).slice(0, 30);
      return false;
    });
    return true;
  }

  function installPerformanceObservers() {
    if (typeof PerformanceObserver !== 'function') return;

    try {
      const layoutObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const value = Number(entry?.value || 0);
          if (!value) return;
          bridgeState.observation.cls = Number((bridgeState.observation.cls + value).toFixed(4));
          if (value >= 0.02) {
            const firstSource = Array.isArray(entry.sources) && entry.sources[0] ? entry.sources[0] : null;
            queueObservation({
              type: 'layout_shift',
              severity: value >= 0.08 ? 'error' : 'warn',
              message: `Layout shift ${value.toFixed(4)}`,
              shiftScore: value,
              selector: firstSource?.node?.id ? `#${firstSource.node.id}` : (firstSource?.node?.className ? String(firstSource.node.className).split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join('') : '')
            });
          }
        });
      });
      layoutObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}

    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const duration = Number(entry?.duration || 0);
          if (duration < 180) return;
          queueObservation({
            type: 'long_task',
            severity: duration >= 900 ? 'error' : 'warn',
            message: `Long task ${Math.round(duration)} ms`,
            longTaskMs: duration,
            durationMs: duration
          });
        });
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  }

  function sampleFrameStalls() {
    const observation = bridgeState.observation;
    const step = (ts) => {
      if (!observation.installed) return;
      if (observation.lastFrameAt) {
        const gap = ts - observation.lastFrameAt;
        if (gap >= 220) {
          queueObservation({
            type: 'frame_stall',
            severity: gap >= 900 ? 'error' : 'warn',
            message: `Frame stall ${Math.round(gap)} ms`,
            frameGapMs: gap,
            durationMs: gap
          });
        }
      }
      observation.lastFrameAt = ts;
      observation.frameSamplerId = window.requestAnimationFrame(step);
    };
    observation.frameSamplerId = window.requestAnimationFrame(step);
  }

  function installViewportObserver() {
    const reportZoom = () => {
      const viewport = getViewportSnapshot();
      const currentScale = Number(viewport.scale || 1);
      if (currentScale > 1.01 && Math.abs(currentScale - bridgeState.observation.lastZoomScale) >= 0.02) {
        queueObservation({
          type: 'viewport_zoom',
          severity: currentScale >= 1.15 ? 'error' : 'warn',
          message: `Viewport zoom ${currentScale.toFixed(2)}x`,
          zoomScale: currentScale,
          viewport
        });
      }
      bridgeState.observation.lastZoomScale = currentScale;
    };

    window.visualViewport?.addEventListener('resize', reportZoom, { passive: true });
    window.visualViewport?.addEventListener('scroll', reportZoom, { passive: true });
    window.addEventListener('resize', reportZoom, { passive: true });
    window.addEventListener('orientationchange', reportZoom, { passive: true });
  }

  function installGlobalErrorHooks() {
    window.addEventListener('error', (event) => {
      const target = event?.target;
      if (target && target !== window) {
        queueObservation({
          type: 'resource_error',
          severity: 'error',
          message: `${target.tagName || 'resource'} yüklenemedi`,
          source: target.currentSrc || target.src || target.href || ''
        });
        return;
      }
      queueObservation({
        type: 'js_error',
        severity: 'error',
        name: event?.error?.name || 'Error',
        message: event?.message || event?.error?.message || 'Unhandled error',
        source: event?.filename || '',
        line: Number(event?.lineno || 0),
        column: Number(event?.colno || 0)
      });
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      queueObservation({
        type: 'promise_rejection',
        severity: 'error',
        name: reason?.name || 'UnhandledRejection',
        message: reason?.message || String(reason || 'Promise rejection')
      });
    });
  }

  function installObservationBridge() {
    if (bridgeState.observation.installed) return;
    bridgeState.observation.installed = true;
    enforceViewportLock();
    installGlobalErrorHooks();
    installPerformanceObservers();
    installViewportObserver();
    sampleFrameStalls();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushObservations('visibility').catch(() => null);
    }, { passive: true });
    window.addEventListener('pagehide', () => { flushObservations('pagehide').catch(() => null); }, { passive: true });
    window.addEventListener('offline', () => queueObservation({ type: 'network', severity: 'warn', message: 'Ağ bağlantısı koptu.', networkState: 'offline' }), { passive: true });
    window.addEventListener('online', () => queueObservation({ type: 'network', severity: 'info', message: 'Ağ bağlantısı geri geldi.', networkState: 'online' }), { passive: true });

    window.PlayMatrixLiveObserve = window.PlayMatrixLiveObserve || {
      capture(event) { queueObservation(event); },
      flush(reason) { return flushObservations(reason || 'manual'); },
      getSnapshot() {
        return {
          pending: bridgeState.observation.queue.slice(0, 20),
          cls: bridgeState.observation.cls,
          viewport: getViewportSnapshot(),
          sessionId: bridgeState.observation.sessionId
        };
      }
    };
  }


  function ensureGameLifecycleDock() {
    let dock = document.getElementById('pm-game-runtime-dock');
    if (dock) return dock;
    dock = document.createElement('div');
    dock.id = 'pm-game-runtime-dock';
    dock.style.position = 'fixed';
    dock.style.left = 'max(12px, env(safe-area-inset-left))';
    dock.style.bottom = 'max(12px, calc(env(safe-area-inset-bottom) + 12px))';
    dock.style.zIndex = '999998';
    dock.style.display = 'none';
    dock.style.maxWidth = 'min(92vw, 360px)';
    dock.style.pointerEvents = 'auto';
    dock.innerHTML = '<div id="pm-game-runtime-card" style="border-radius:18px;padding:14px 14px 12px;background:linear-gradient(180deg,rgba(8,14,24,.96),rgba(4,8,14,.92));border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 48px rgba(0,0,0,.34);backdrop-filter:blur(14px);color:#fff;"><div id="pm-game-runtime-title" style="font-weight:800;font-size:14px;letter-spacing:.2px;margin-bottom:4px;">Bağlantı izleniyor</div><div id="pm-game-runtime-body" style="font-size:12.5px;line-height:1.5;opacity:.92;margin-bottom:10px;"></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="pm-game-runtime-resume" type="button" style="display:none;border:0;border-radius:12px;padding:10px 12px;font-weight:700;background:#d4af37;color:#111;cursor:pointer;">Oyuna Dön</button><button id="pm-game-runtime-refresh" type="button" style="display:none;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;font-weight:700;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;">Tekrar Dene</button></div></div>';
    document.body.appendChild(dock);
    dock.querySelector('#pm-game-runtime-refresh').addEventListener('click', () => window.location.reload());
    dock.querySelector('#pm-game-runtime-resume').addEventListener('click', () => {
      const href = dock.dataset.resumeHref || '';
      if (href) window.location.href = href;
    });
    return dock;
  }

  function getGameLifecycleSnapshot() {
    try {
      if (window.PlayMatrixGameRuntime && typeof window.PlayMatrixGameRuntime.getSnapshot === 'function') {
        return window.PlayMatrixGameRuntime.getSnapshot() || null;
      }
    } catch (_) {}
    try {
      if (window.__PM_GAME_RUNTIME__ && typeof window.__PM_GAME_RUNTIME__ === 'object') {
        return window.__PM_GAME_RUNTIME__;
      }
    } catch (_) {}
    return null;
  }

  function renderGameLifecycleDock() {
    const dock = ensureGameLifecycleDock();
    const card = dock.querySelector('#pm-game-runtime-card');
    const titleEl = dock.querySelector('#pm-game-runtime-title');
    const bodyEl = dock.querySelector('#pm-game-runtime-body');
    const resumeBtn = dock.querySelector('#pm-game-runtime-resume');
    const refreshBtn = dock.querySelector('#pm-game-runtime-refresh');
    const snapshot = getGameLifecycleSnapshot();
    if (!snapshot || (!snapshot.currentRoomId && !snapshot.sessionActive && !snapshot.noticeText && navigator.onLine && snapshot.connectionState !== 'reconnecting' && snapshot.connectionState !== 'error' && snapshot.connectionState !== 'offline')) {
      dock.style.display = 'none';
      dock.dataset.resumeHref = '';
      return;
    }

    const now = Date.now();
    const thresholdMs = Math.max(8000, Number(snapshot.antiStallThresholdMs || 15000));
    const lastSyncAt = Number(snapshot.lastSyncAt || 0);
    const stallActive = !!snapshot.currentRoomId && lastSyncAt > 0 && (now - lastSyncAt) >= thresholdMs;
    const offline = !navigator.onLine || snapshot.connectionState === 'offline';
    const reconnecting = snapshot.connectionState === 'reconnecting' || snapshot.connectionState === 'error' || snapshot.connectionState === 'connecting';
    const showResume = !!snapshot.resumeHref && (!!snapshot.currentRoomId || !!snapshot.sessionActive || reconnecting || stallActive);

    let title = 'Oturum korunuyor';
    let body = snapshot.noticeText || 'Oyun oturumun izleniyor.';
    if (offline) {
      title = 'Bağlantı yok';
      body = 'İnternet bağlantısı kesildi. Oturum korunuyor; bağlantı gelince yeniden denenir.';
    } else if (reconnecting) {
      title = 'Yeniden bağlanılıyor';
      body = snapshot.noticeText || 'Bağlantı kısa süreli koptu. Oturum korunuyor ve yeniden bağlanma deneniyor.';
    } else if (stallActive) {
      const waited = Math.max(1, Math.round((now - lastSyncAt) / 1000));
      title = 'Oturum beklemede';
      body = `Son canlı veri ${waited} sn önce geldi. Anti-stall koruması aktif; durum yeniden yoklanıyor.`;
    }

    titleEl.textContent = title;
    bodyEl.textContent = body;
    card.style.borderColor = offline ? 'rgba(255,107,107,.36)' : reconnecting ? 'rgba(212,175,55,.34)' : 'rgba(0,255,163,.28)';
    dock.style.display = 'block';
    dock.dataset.resumeHref = showResume ? String(snapshot.resumeHref || '') : '';
    resumeBtn.style.display = showResume ? 'inline-flex' : 'none';
    resumeBtn.textContent = snapshot.resumeLabel || 'Oyuna Dön';
    refreshBtn.style.display = reconnecting || stallActive || offline ? 'inline-flex' : 'none';
  }

  function bindGameLifecycle() {
    window.PlayMatrixGameRuntime = window.PlayMatrixGameRuntime || {
      provider: null,
      registerProvider(fn) { this.provider = fn; renderGameLifecycleDock(); },
      getSnapshot() {
        if (typeof this.provider === 'function') return this.provider() || null;
        return window.__PM_GAME_RUNTIME__ || null;
      },
      notifyChange() { renderGameLifecycleDock(); },
      markSync() {
        if (window.__PM_GAME_RUNTIME__ && typeof window.__PM_GAME_RUNTIME__ === 'object') {
          window.__PM_GAME_RUNTIME__.lastSyncAt = Date.now();
        }
        renderGameLifecycleDock();
      },
      clear() {
        window.__PM_GAME_RUNTIME__ = null;
        renderGameLifecycleDock();
      },
      bootstrapSpectatorMode(gameType) { return bootstrapSpectatorMode(gameType); }
    };
    window.addEventListener('online', renderGameLifecycleDock, { passive: true });
    window.addEventListener('offline', renderGameLifecycleDock, { passive: true });
    window.setInterval(renderGameLifecycleDock, 1000);
    window.dispatchEvent(new CustomEvent('pm-runtime-ready'));
  }


async function fetchSpectatorSnapshot(gameType, roomId) {
  const safeGameType = String(gameType || '').trim();
  const safeRoomId = String(roomId || '').trim();
  if (!safeGameType || !safeRoomId) return null;
  try {
    const response = await fetch(`/api/spectator/snapshot?gameType=${encodeURIComponent(safeGameType)}&roomId=${encodeURIComponent(safeRoomId)}`, {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.ok ? (payload.snapshot || null) : null;
  } catch (_) {
    return null;
  }
}

function ensureSpectatorPanel() {
  let panel = document.getElementById('pm-spectator-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'pm-spectator-panel';
  panel.style.position = 'fixed';
  panel.style.top = 'max(12px, calc(env(safe-area-inset-top) + 12px))';
  panel.style.right = 'max(12px, env(safe-area-inset-right))';
  panel.style.zIndex = '999997';
  panel.style.maxWidth = 'min(86vw, 340px)';
  panel.style.display = 'none';
  panel.innerHTML = '<div style="border-radius:18px;padding:14px;background:linear-gradient(180deg,rgba(6,12,22,.96),rgba(8,18,30,.92));border:1px solid rgba(212,175,55,.24);box-shadow:0 18px 44px rgba(0,0,0,.34);backdrop-filter:blur(16px);color:#fff"><div id="pm-spectator-title" style="font-weight:800;font-size:14px;margin-bottom:4px;">İzleyici Modu</div><div id="pm-spectator-body" style="font-size:12.5px;line-height:1.5;opacity:.92"></div></div>';
  document.body.appendChild(panel);
  return panel;
}

async function bootstrapSpectatorMode(gameType) {
  const query = new URLSearchParams(window.location.search);
  const roomId = String(query.get('spectateRoom') || '').trim();
  if (!roomId) return;
  const panel = ensureSpectatorPanel();
  panel.style.display = 'block';
  panel.querySelector('#pm-spectator-title').textContent = 'İzleyici Modu';
  panel.querySelector('#pm-spectator-body').textContent = 'Canlı oda özeti yükleniyor...';
  const snapshot = await fetchSpectatorSnapshot(gameType, roomId);
  if (!snapshot) {
    panel.querySelector('#pm-spectator-body').textContent = 'Canlı izleme özeti bulunamadı. Oda kapanmış veya erişim dışı olabilir.';
    window.__PM_GAME_RUNTIME__ = Object.assign({}, window.__PM_GAME_RUNTIME__ || {}, { connectionState: 'connected', noticeText: 'İzleyici özeti bulunamadı.', currentRoomId: roomId, sessionActive: false, resumeHref: '', resumeLabel: '' });
    renderGameLifecycleDock();
    return;
  }
  const players = Array.isArray(snapshot.players) ? snapshot.players.map((item) => item?.username || 'Oyuncu').filter(Boolean).join(' · ') : '';
  panel.querySelector('#pm-spectator-title').textContent = `${snapshot.title || 'İzleyici Modu'} · ${snapshot.status || 'canlı'}`;
  panel.querySelector('#pm-spectator-body').textContent = players ? `${players} · ${snapshot.note || 'Oyun özeti hazır.'}` : (snapshot.note || 'Oyun özeti hazır.');
  window.__PM_GAME_RUNTIME__ = Object.assign({}, window.__PM_GAME_RUNTIME__ || {}, { currentRoomId: roomId, sessionActive: true, connectionState: 'connected', noticeText: `${snapshot.title || 'İzleyici modu'} aktif.`, resumeHref: '', resumeLabel: '' });
  renderGameLifecycleDock();
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
    installObservationBridge();
    bindGameLifecycle();

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
