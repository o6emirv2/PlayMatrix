(() => {
  'use strict';

  function parseArgs(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function resolveAction(name) {
    const parts = String(name || '').split('.').filter(Boolean);
    let ctx = window;
    for (const part of parts) {
      if (!ctx || typeof ctx !== 'object' && typeof ctx !== 'function') return null;
      ctx = ctx[part];
    }
    return typeof ctx === 'function' ? ctx : null;
  }

  function runAction(target, event) {
    if (!target) return;
    const clickId = target.dataset.pmClickId;
    if (clickId) {
      const node = document.getElementById(clickId);
      if (node && typeof node.click === 'function') {
        event.preventDefault();
        node.click();
      }
      return;
    }
    const fn = resolveAction(target.dataset.pmAction || '');
    if (!fn) return;
    event.preventDefault();
    fn(...parseArgs(target.dataset.pmArgs || '[]'));
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-pm-action]:not([data-pm-action-event]),[data-pm-click-id]');
    if (target) runAction(target, event);
  }, { passive: false });

  document.addEventListener('input', (event) => {
    const target = event.target.closest('[data-pm-action][data-pm-action-event="input"]');
    if (target) runAction(target, event);
  }, { passive: false });
})();
