
(() => {
  const root = document.documentElement;
  const interactiveSelector = 'button, a, input, textarea, select, label, [role="button"], .btn, .ghost-btn, .pill-btn, .mobile-tab, .drop-item, .filter-chip, .lb-tab-btn';
  let lastTouchEnd = 0;

  function isInteractive(target) {
    return !!target?.closest?.(interactiveSelector);
  }

  function setViewportVars() {
    const height = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    root.style.setProperty('--pm-vh', `${height * 0.01}px`);
    root.style.setProperty('--app-height', `${height}px`);
  }

  function getIstanbulYearMonth() {
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: 'numeric'
    });
    const parts = formatter.formatToParts(new Date());
    const values = Object.create(null);
    for (const part of parts) {
      if (part.type !== 'literal') values[part.type] = part.value;
    }
    return {
      year: Number(values.year || new Date().getUTCFullYear()),
      month: Number(values.month || (new Date().getUTCMonth() + 1))
    };
  }

  function getNextSeasonResetLabel() {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const current = getIstanbulYearMonth();
    const nextMonth = current.month === 12 ? 1 : current.month + 1;
    const nextYear = current.month === 12 ? current.year + 1 : current.year;
    return `01 ${months[nextMonth - 1]} ${nextYear} 00:00`;
  }

  function getSeasonKeyLabel() {
    const current = getIstanbulYearMonth();
    return `${current.year}-${String(current.month).padStart(2, '0')}`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function refreshSystemBadges() {
    setText('seasonResetBadge', getNextSeasonResetLabel());
    setText('activityResetBadge', getNextSeasonResetLabel());
    setText('retentionBadge', 'Global 7 Gün · DM 14 Gün');
    setText('homeSyncNote', 'Sohbet politikası: Global mesajlar 7 gün, DM mesajları 14 gün saklanır.');
    setText('rewardFlowBadge', '50.000 + 100.000 + Davet');
    setText('seasonKeyBadge', `Sezon: ${getSeasonKeyLabel()}`);
  }

  function getRuntimeState() {
    window.__PM_RUNTIME_UI__ = window.__PM_RUNTIME_UI__ || { online: navigator.onLine !== false, requestId: '', lastError: '' };
    return window.__PM_RUNTIME_UI__;
  }

  function ensureRuntimeDock() {
    const state = getRuntimeState();
    let dock = document.getElementById('pmRuntimeDock');
    if (dock) return dock;
    dock = document.createElement('div');
    dock.id = 'pmRuntimeDock';
    dock.className = 'pm-runtime-dock';
    dock.innerHTML = `
      <div class="pm-runtime-pill" id="pmRuntimeNetwork">${state.online ? 'Çevrimiçi' : 'Çevrimdışı'}</div>
      <div class="pm-runtime-pill pm-runtime-pill--mono" id="pmRuntimeRequestId">RequestId: -</div>
      <button type="button" class="pm-runtime-pill pm-runtime-pill--button" id="pmRuntimeRetryBtn">Tekrar Dene</button>
    `;
    document.body?.appendChild(dock);
    dock.querySelector('#pmRuntimeRetryBtn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('playmatrix:retry-request', { detail: { source: 'runtime_dock' } }));
      if (typeof window.location?.reload === 'function') window.location.reload();
    });
    return dock;
  }

  function updateRuntimeDock() {
    const state = getRuntimeState();
    const dock = ensureRuntimeDock();
    const network = dock.querySelector('#pmRuntimeNetwork');
    const req = dock.querySelector('#pmRuntimeRequestId');
    if (network) {
      network.textContent = state.online ? 'Çevrimiçi' : 'Çevrimdışı';
      network.classList.toggle('is-offline', !state.online);
    }
    if (req) req.textContent = `RequestId: ${state.requestId || '-'}`;
  }

  function emitRuntimeToast(title, message, tone = 'info') {
    const stack = document.getElementById('toastStack');
    if (stack) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.dataset.tone = tone;
      toast.innerHTML = `<div class="toast-icon">!</div><div style="min-width:0"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
      stack.appendChild(toast);
      window.setTimeout(() => toast.remove(), 4200);
      return;
    }
    console[tone === 'error' ? 'error' : 'log'](`[PlayMatrix] ${title}: ${message}`);
  }

  function bindRuntimeSignals() {
    window.addEventListener('online', () => {
      const state = getRuntimeState();
      state.online = true;
      updateRuntimeDock();
      emitRuntimeToast('Bağlantı geri geldi', 'Sunucu bağlantısı yeniden kuruldu.', 'success');
    });
    window.addEventListener('offline', () => {
      const state = getRuntimeState();
      state.online = false;
      updateRuntimeDock();
      emitRuntimeToast('Bağlantı kesildi', 'Çevrimdışı moddasın. Bağlantı geri geldiğinde tekrar dene.', 'warn');
    });
    window.addEventListener('playmatrix:request-meta', (event) => {
      const state = getRuntimeState();
      state.requestId = String(event?.detail?.requestId || state.requestId || '').trim();
      updateRuntimeDock();
    });
    window.addEventListener('error', (event) => {
      const state = getRuntimeState();
      state.lastError = String(event?.message || 'Beklenmeyen hata');
      updateRuntimeDock();
      emitRuntimeToast('Arayüz hatası', state.lastError, 'error');
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason?.message || event?.reason || 'İşlenmeyen istek hatası';
      const state = getRuntimeState();
      state.lastError = String(reason);
      updateRuntimeDock();
      emitRuntimeToast('İstek hatası', state.lastError, 'error');
    });
    window.addEventListener('playmatrix:retry-request', () => updateRuntimeDock());
  }

  function resolvePageKind() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.includes('/admin')) return 'admin';
    if (path.includes('/online oyunlar/') || path.includes('/casino/') || path.includes('/klasik oyunlar/')) return 'game';
    return 'home';
  }

  function decorateBody() {
    const kind = resolvePageKind();
    document.body?.classList.add('pm-phase5-ready', 'pm-phase6-theme', 'pm-phase14-system');
    document.body?.setAttribute('data-pm-page-kind', kind);
    document.documentElement?.setAttribute('data-pm-page-kind', kind);
    document.body?.setAttribute('data-pm-design-system', 'phase14');
    document.documentElement?.setAttribute('data-pm-design-system', 'phase14');
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      document.body?.classList.add('pm-touch');
    }
  }

  function bindTouchStability() {
    document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (event) => {
      if (isInteractive(event.target)) event.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', (event) => {
      const now = Date.now();
      if (isInteractive(event.target) && (now - lastTouchEnd) < 320) event.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
  }

  function boot() {
    setViewportVars();
    refreshSystemBadges();
    decorateBody();
    updateRuntimeDock();
  }

  window.addEventListener('resize', setViewportVars, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(setViewportVars, 90), { passive: true });
  document.addEventListener('DOMContentLoaded', boot, { once: true });
  bindTouchStability();
  bindRuntimeSignals();
})();
