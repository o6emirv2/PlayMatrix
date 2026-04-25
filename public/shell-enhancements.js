
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

  function decorateBody() {
    document.body?.classList.add('pm-phase5-ready');
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
    decorateBody();
  }

  window.addEventListener('resize', setViewportVars, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(setViewportVars, 90), { passive: true });
  document.addEventListener('DOMContentLoaded', boot, { once: true });
  bindTouchStability();
})();
