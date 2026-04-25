(function normalizePatternMasterRoute() {
  'use strict';
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  if (location.search || location.hash) return;
  const path = String(location.pathname || '').toLowerCase();
  const canonical = '/classic-games/pattern-master';
  const aliases = new Set(['/patternmaster.html', '/pattern-master', '/classic-games/patternmaster', '/klasik%20oyunlar/patternmaster.html', '/klasik oyunlar/patternmaster.html']);
  if (path !== canonical && aliases.has(path)) window.history.replaceState(null, '', canonical);
})();
