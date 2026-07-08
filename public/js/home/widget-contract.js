import './home-core.js?v=pm-v13-live-refresh-session-speed';

export function getHomeRuntime() {
  return window.PlayMatrixHome || null;
}

export async function callHomeRuntime(method, ...args) {
  const runtime = getHomeRuntime();
  if (!runtime || typeof runtime[method] !== 'function') return null;
  return await runtime[method](...args);
}

export function reportHomeModuleIssue(scope, error, extra = {}) {
  try {
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, {
        source: 'home-module',
        module: extra.module || 'home',
        ...extra
      });
    }
  } catch (_) {}
}
