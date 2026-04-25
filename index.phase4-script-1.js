(function () {
  'use strict';
  document.documentElement.classList.add('pm-js', 'pm-early-boot');
  document.documentElement.style.setProperty('touch-action', 'manipulation');
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!window.location.hash) window.scrollTo(0, 0);
  } catch (_) {}
})();
