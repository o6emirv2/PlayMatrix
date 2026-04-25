(function normalizePistiRoute() {
  'use strict';
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  if (location.search || location.hash) return;
  const path = String(location.pathname || '').toLowerCase();
  const canonical = '/pisti';
  const aliases = new Set(['/pisti.html', '/onlinepisti.html', '/online-games/pisti', '/online%20oyunlar/pisti.html', '/online oyunlar/pisti.html']);
  if (path !== canonical && aliases.has(path)) window.history.replaceState(null, '', canonical);
})();
