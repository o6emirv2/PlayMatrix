const PM_MATRIX_SECURITY_KEY = 'pm_admin_matrix_key';

export function preventUserInterference() {
  const passiveBlock = (event) => event.preventDefault();
  ['contextmenu', 'selectstart', 'dragstart', 'dblclick', 'gesturestart'].forEach((name) => {
    document.addEventListener(name, passiveBlock, { passive: false });
  });
  document.addEventListener('touchstart', (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const hasMeta = event.ctrlKey || event.metaKey;
    const devtoolsCombo = hasMeta && event.shiftKey && ['i', 'j', 'c'].includes(key);
    const blockedCombo = hasMeta && ['c', 'x', 'u', 's', 'p'].includes(key);
    if (key === 'f12' || devtoolsCombo || blockedCombo) event.preventDefault();
  }, { passive: false });
}

export function initMatrixRain(canvas, options = {}) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};
  let raf = 0;
  let width = 0;
  let height = 0;
  let columns = [];
  const chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&@*+-=<>/\\';
  const fontSize = options.fontSize || 15;
  const palette = options.palette || ['rgba(44,255,130,.85)', 'rgba(255,64,64,.58)', 'rgba(165,255,208,.35)'];

  function resize() {
    width = canvas.width = Math.floor(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2));
    height = canvas.height = Math.floor(window.innerHeight * Math.min(window.devicePixelRatio || 1, 2));
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const count = Math.ceil(width / fontSize / 1.15);
    columns = Array.from({ length: count }, () => ({
      y: Math.random() * height,
      speed: 0.85 + Math.random() * 1.4,
      color: palette[Math.floor(Math.random() * palette.length)]
    }));
  }

  function frame() {
    ctx.fillStyle = 'rgba(1,7,16,.12)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'top';
    columns.forEach((column, index) => {
      const x = index * fontSize * 1.15;
      const glyph = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillStyle = column.color;
      ctx.fillText(glyph, x, column.y);
      column.y += fontSize * column.speed;
      if (column.y > height + fontSize * 6) {
        column.y = -fontSize * (4 + Math.random() * 10);
        column.speed = 0.85 + Math.random() * 1.4;
        column.color = palette[Math.floor(Math.random() * palette.length)];
      }
    });
    raf = requestAnimationFrame(frame);
  }

  resize();
  frame();
  window.addEventListener('resize', resize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

export function setSecurityKey(value = '') {
  sessionStorage.setItem(PM_MATRIX_SECURITY_KEY, String(value || ''));
}

export function getSecurityKey() {
  return sessionStorage.getItem(PM_MATRIX_SECURITY_KEY) || '';
}

export function clearSecurityKey() {
  sessionStorage.removeItem(PM_MATRIX_SECURITY_KEY);
}



function buildAdminRequestUrl(path = '', baseOverride = '') {
  const raw = String(path || '').trim();
  if (!raw) return String(baseOverride || window.location.origin || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
  const base = String(baseOverride || '').trim().replace(/\/+$/, '');
  if (base) return `${base}${cleanPath}`;
  if (window.__PM_API__?.buildUrl) return window.__PM_API__.buildUrl(cleanPath);
  try {
    return new URL(cleanPath, window.location.origin).toString();
  } catch (_) {
    return cleanPath;
  }
}

export function resolveAdminUrl(target = './index.html') {
  try {
    return new URL(String(target || './index.html'), window.location.href).toString();
  } catch (_) {
    return String(target || './index.html');
  }
}

export async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const key = getSecurityKey();
  if (typeof window.__PM_API__?.ensureApiBase === 'function') {
    try { await window.__PM_API__.ensureApiBase(); } catch (_) {}
  }
  if (key) headers.set('x-admin-client-key', key);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const retryableStatuses = new Set([404, 405, 408, 429, 502, 503, 504]);
  const candidates = Array.isArray(window.__PM_API__?.getCandidates?.())
    ? window.__PM_API__.getCandidates()
    : [window.location.origin];
  const timeoutMs = Number(options.timeoutMs || 12000);
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const base = String(candidates[index] || '').trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(buildAdminRequestUrl(path, base), {
        credentials: 'include',
        cache: 'no-store',
        ...options,
        headers,
        signal: controller.signal
      });
      window.clearTimeout(timer);
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (response.ok && payload?.ok !== false) {
        if (base && window.__PM_API__?.setApiBase) window.__PM_API__.setApiBase(base);
        return payload;
      }
      const error = new Error(payload?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      lastError = error;
      if (!retryableStatuses.has(response.status) || index >= candidates.length - 1) throw error;
    } catch (error) {
      window.clearTimeout(timer);
      if (error?.name === 'AbortError') {
        error = new Error('Yönetici isteği zaman aşımına uğradı.');
        error.status = 408;
      }
      lastError = error;
      if (index >= candidates.length - 1) throw error;
    }
  }
  throw lastError || new Error('Admin isteği başarısız oldu.');
}

export function money(value = 0) {
  return new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
}

export function formatWhen(value = 0) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(Number(value))); } catch (_) { return '—'; }
}
