import { bootHomeApplication } from '/public/js/home/app.js?v=pm-v14-render-dob-games-admin';
import { HOME_GAME_ROUTES } from '/public/js/home/game-catalog.js?v=pm-v14-render-dob-games-admin';

window.__PLAYMATRIX_ROUTES__ = HOME_GAME_ROUTES;
const PLAYMATRIX_BACKEND_ORIGIN = 'https://emirhan-siye.onrender.com';
window.__PM_RUNTIME = window.__PM_RUNTIME || {};
if (!window.__PM_RUNTIME.apiBase || window.__PM_RUNTIME.apiBase === window.location.origin) {
  window.__PM_RUNTIME.apiBase = PLAYMATRIX_BACKEND_ORIGIN;
}
if (!window.__PLAYMATRIX_API_URL__ || window.__PLAYMATRIX_API_URL__ === window.location.origin) {
  window.__PLAYMATRIX_API_URL__ = PLAYMATRIX_BACKEND_ORIGIN;
}
window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_URL__;

function reportHomeIssue(scope, error, extra = {}) {
  try {
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, { source: 'script.js', game: 'home', ...extra });
    }
  } catch (_) {}
}

bootHomeApplication().catch((error) => {
  console.error('[PlayMatrix] Home boot failed', error);
  reportHomeIssue('home.boot', error, { type: 'boot', severity: 'error', path: location.pathname });
});
