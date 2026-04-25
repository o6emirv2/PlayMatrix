(function normalizeSnakeProRoute() {
  'use strict';
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  if (location.search || location.hash) return;
  const path = String(location.pathname || '').toLowerCase();
  const canonical = '/classic-games/snake-pro';
  const aliases = new Set(['/snakepro.html', '/snake-pro', '/classic-games/snakepro', '/klasik%20oyunlar/snakepro.html', '/klasik oyunlar/snakepro.html']);
  if (path !== canonical && aliases.has(path)) window.history.replaceState(null, '', canonical);
})();
