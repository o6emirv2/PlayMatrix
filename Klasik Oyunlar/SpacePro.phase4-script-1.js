(function normalizeSpaceProRoute() {
  'use strict';
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  if (location.search || location.hash) return;
  const path = String(location.pathname || '').toLowerCase();
  const canonical = '/classic-games/space-pro';
  const aliases = new Set(['/spacepro.html', '/space-pro', '/classic-games/spacepro', '/klasik%20oyunlar/spacepro.html', '/klasik oyunlar/spacepro.html']);
  if (path !== canonical && aliases.has(path)) window.history.replaceState(null, '', canonical);
})();
