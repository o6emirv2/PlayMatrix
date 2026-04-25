(() => {
  'use strict';

  const root = document.documentElement;
  const interactiveSelector = 'button, a, input, textarea, select, label, [role="button"], .btn, .ghost-btn, .pill-btn, .mobile-tab, .drop-item, .filter-chip, .lb-tab-btn, .modal-close, .back-btn';
  const gamePathPattern = /(?:Online\s*Oyunlar|Klasik\s*Oyunlar|online-games|classic-games|crash|pisti|satranc|chess|snake|space|pattern)/i;
  let lastTouchEnd = 0;
  let viewportRaf = 0;

  function isInteractive(target) {
    return !!target?.closest?.(interactiveSelector);
  }

  function getViewportHeight() {
    if (window.visualViewport?.height) return Math.round(window.visualViewport.height);
    return Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  }

  function setViewportVarsNow() {
    const height = getViewportHeight();
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    root.style.setProperty('--pm-vh', `${height * 0.01}px`);
    root.style.setProperty('--app-height', `${height}px`);
    root.style.setProperty('--pm-vw', `${width}px`);
  }

  function scheduleViewportVars() {
    if (viewportRaf) return;
    viewportRaf = window.requestAnimationFrame(() => {
      viewportRaf = 0;
      setViewportVarsNow();
    });
  }

  function detectPageKind() {
    const path = `${location.pathname || ''} ${document.title || ''}`;
    if (document.body?.classList.contains('matrix-auth-body') || document.querySelector('.admin-shell,.gate-shell')) return 'admin';
    if (gamePathPattern.test(path) || document.querySelector('.console,#lobbyArea,#gameArea,.game-root,.intro-shell')) return 'game';
    return 'home';
  }

  function decorateShell() {
    root.classList.add('pm-js');
    const body = document.body;
    if (!body) return;
    body.classList.add('pm-shell-ready');
    if (window.matchMedia?.('(pointer: coarse)').matches) body.classList.add('pm-touch');

    const pageKind = detectPageKind();
    body.dataset.pmPageKind = pageKind;
    body.classList.toggle('pm-game-page', pageKind === 'game');
    body.classList.toggle('pm-admin-page', pageKind === 'admin');

    document.querySelectorAll('.top-bar, .top-bar-full').forEach((bar) => {
      bar.classList.add('pm-game-topbar');
    });

    document.querySelectorAll('.modal-overlay, .ps-modal, .sheet-shell').forEach((modal) => {
      modal.classList.add('pm-shell-modal');
      if (!modal.hasAttribute('aria-hidden')) {
        const visible = modal.classList.contains('active') || modal.classList.contains('is-active') || modal.classList.contains('is-open');
        modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
    });

    document.querySelectorAll('.sheet-content, .ps-list-container, .ps-chat-stream, #lobbyArea, #gameArea, .dropdown').forEach((node) => {
      node.classList.add('pm-safe-scroll');
    });
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

  function bindModalStateObserver() {
    if (!('MutationObserver' in window)) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof Element)) continue;
        if (!target.matches('.modal-overlay, .ps-modal, .sheet-shell')) continue;
        const visible = target.classList.contains('active') || target.classList.contains('is-active') || target.classList.contains('is-open');
        target.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
    });
    document.querySelectorAll('.modal-overlay, .ps-modal, .sheet-shell').forEach((modal) => {
      observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function boot() {
    setViewportVarsNow();
    decorateShell();
    bindModalStateObserver();
  }

  window.addEventListener('resize', scheduleViewportVars, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(scheduleViewportVars, 90), { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleViewportVars, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewportVars, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  bindTouchStability();
})();
