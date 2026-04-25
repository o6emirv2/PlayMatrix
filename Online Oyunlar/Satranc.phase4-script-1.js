(function normalizeSatrancRoute() {
  'use strict';
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  if (location.search || location.hash) return;
  const path = String(location.pathname || '').toLowerCase();
  const canonical = '/satranc';
  const aliases = new Set(['/satranc.html', '/chess', '/online-games/chess', '/online-games/satranc', '/online%20oyunlar/satranc.html', '/online oyunlar/satranc.html']);
  if (path !== canonical && aliases.has(path)) window.history.replaceState(null, '', canonical);
})();
