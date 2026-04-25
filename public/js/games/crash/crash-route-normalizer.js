(function normalizeCrashRoute() {
  'use strict';
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  if (location.search || location.hash) return;
  const path = String(location.pathname || '').toLowerCase();
  const canonical = '/crash';
  const aliases = new Set(['/crash.html', '/online-games/crash', '/online%20oyunlar/crash.html', '/online oyunlar/crash.html']);
  if (path !== canonical && aliases.has(path)) window.history.replaceState(null, '', canonical);
})();
