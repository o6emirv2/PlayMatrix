const PM_MATRIX_SECURITY_KEY = 'pm_admin_matrix_key';
const PM_ADMIN_BACKEND_FALLBACK = ['https://emirhan', '-siye.onrender.com'].join('');


function persistAdminAccessPayload(payload = {}) {
  if (payload?.clientKey) setSecurityKey(payload.clientKey);
}
function clearAdminAccessState() {}

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
  const normalized = String(value || '');
  sessionStorage.setItem(PM_MATRIX_SECURITY_KEY, normalized);
  try { localStorage.setItem(PM_MATRIX_SECURITY_KEY, normalized); } catch (_) {}
}

export function getSecurityKey() {
  const fromSession = sessionStorage.getItem(PM_MATRIX_SECURITY_KEY) || '';
  if (fromSession) return fromSession;
  try {
    const fromLocal = localStorage.getItem(PM_MATRIX_SECURITY_KEY) || '';
    if (fromLocal) sessionStorage.setItem(PM_MATRIX_SECURITY_KEY, fromLocal);
    return fromLocal;
  } catch (_) { return ''; }
}

export function clearSecurityKey() {
  sessionStorage.removeItem(PM_MATRIX_SECURITY_KEY);
  try { localStorage.removeItem(PM_MATRIX_SECURITY_KEY); } catch (_) {}
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

function adminErrorText(payloadOrError = {}, fallback = 'Admin isteği başarısız oldu.') {
  const code = String(payloadOrError?.error || payloadOrError?.code || payloadOrError?.message || '').trim();
  const map = {
    SESSION_INVALID: 'Yönetici oturumu doğrulanamadı. Lütfen tekrar giriş yapın.',
    SESSION_REQUIRED: 'Yönetici oturumu gerekli. Lütfen tekrar giriş yapın.',
    AUTH_REQUIRED: 'Bu işlem için yönetici girişi gerekli.',
    ADMIN_REQUIRED: 'Bu işlem için yönetici yetkisi gerekli.',
    ADMIN_REAUTH_REQUIRED: 'Kritik işlem için tekrar parola doğrulaması gerekiyor.',
    ADMIN_REAUTH_INVALID: 'Kritik işlem doğrulaması başarısız oldu.',
    MARKET_OFFLINE: 'Market şu anda çevrim dışı.',
    MARKET_FRAME_PATH_REQUIRED: 'Çerçeve yolu gerekli. Örnek: /public/assets/market/frames/market-1.png',
    MARKET_FRAME_PATH_NOT_FOUND: 'Çerçeve yolu bulunamadı. Örnek: /public/assets/market/frames/market-1.png',
    ITEM_ID_REQUIRED_OR_CATEGORY_DISABLED: 'Market ürünü kaydedilemedi. Lütfen ürün bilgilerini kontrol et.',
    MULTIPLE_USERS_MATCH: 'Birden fazla kullanıcı eşleşti. Lütfen listeden doğru kullanıcıyı seçin.',
    USER_NOT_FOUND: 'Kullanıcı bulunamadı.',
    GAME_MAINTENANCE: 'Bu alan şu anda bakımda. Daha sonra tekrar deneyin.',
    SYSTEM_MAINTENANCE: 'Sistem şu anda bakımda. Daha sonra tekrar deneyin.'
  };
  if (map[code]) return map[code];
  if (/^HTTP\s+\d+/i.test(code)) return fallback;
  return code && code.length < 120 ? code : fallback;
}


let __pmAdminReauthPromise = null;

function requestAdminReauth() {
  if (__pmAdminReauthPromise) return __pmAdminReauthPromise;
  __pmAdminReauthPromise = new Promise((resolve) => {
    const previous = document.querySelector('.pm-admin-reauth-overlay');
    if (previous) previous.remove();
    const overlay = document.createElement('div');
    overlay.className = 'pm-admin-reauth-overlay';
    overlay.dataset.pmTopLayer = 'true';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:22px',
      'background:rgba(0,8,14,.86)',
      'backdrop-filter:blur(18px)',
      '-webkit-backdrop-filter:blur(18px)',
      'box-sizing:border-box',
      'isolation:isolate',
      'pointer-events:auto',
      'touch-action:none'
    ].join(';');
    overlay.innerHTML = `
      <div class="pm-admin-reauth-card" role="dialog" aria-modal="true" aria-labelledby="pmAdminReauthTitle">
        <button class="pm-admin-reauth-close" type="button" aria-label="Kapat">×</button>
        <div class="pm-admin-reauth-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></div>
        <h2 id="pmAdminReauthTitle">Kritik işlem doğrulaması</h2>
        <p>Bu işlem güvenlik nedeniyle tekrar doğrulama ister. Mevcut admin hesabının Firebase şifresini gir.</p>
        <label class="pm-admin-reauth-field">
          <span>Admin Firebase hesap şifresi</span>
          <input type="password" autocomplete="current-password" inputmode="text" placeholder="Admin hesap şifresini yaz" />
        </label>
        <div class="pm-admin-reauth-status" aria-live="polite"></div>
        <div class="pm-admin-reauth-actions">
          <button class="pm-admin-reauth-cancel" type="button">Vazgeç</button>
          <button class="pm-admin-reauth-submit" type="button">Doğrula ve Devam Et</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body?.style?.overflow || '';
    const previousBodyTouchAction = body?.style?.touchAction || '';
    html.classList.add('pm-admin-reauth-lock');
    body?.classList?.add('pm-admin-reauth-lock');
    html.style.overflow = 'hidden';
    if (body) {
      body.style.overflow = 'hidden';
      body.style.touchAction = 'none';
    }
    const input = overlay.querySelector('input');
    const status = overlay.querySelector('.pm-admin-reauth-status');
    const cleanup = (value = '') => {
      overlay.remove();
      html.classList.remove('pm-admin-reauth-lock');
      body?.classList?.remove('pm-admin-reauth-lock');
      html.style.overflow = previousHtmlOverflow;
      if (body) {
        body.style.overflow = previousBodyOverflow;
        body.style.touchAction = previousBodyTouchAction;
      }
      __pmAdminReauthPromise = null;
      resolve(String(value || '').trim());
    };
    const showStatus = (message = '') => {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('is-visible', !!message);
    };
    const done = () => {
      const value = String(input?.value || '').trim();
      if (!value) {
        showStatus('Güvenlik kodunu yazıp tekrar dene.');
        input?.focus();
        return;
      }
      cleanup(value);
    };
    const cancel = () => cleanup('');
    const runAction = (target, event) => {
      const button = target?.closest?.('.pm-admin-reauth-close,.pm-admin-reauth-cancel,.pm-admin-reauth-submit');
      if (!button) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (button.classList.contains('pm-admin-reauth-submit')) done();
      else cancel();
      return true;
    };
    overlay.addEventListener('click', (event) => { runAction(event.target, event); }, false);
    overlay.addEventListener('pointerup', (event) => { runAction(event.target, event); }, false);
    overlay.addEventListener('touchend', (event) => { runAction(event.target, event); }, { passive: false });
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) event.preventDefault();
    }, { passive: false });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); done(); }
      if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    });
    window.setTimeout(() => input?.focus(), 80);
  });
  return __pmAdminReauthPromise;
}

function isSessionErrorPayload(payload = {}) {
  const code = String(payload?.error || payload?.code || '').trim().toUpperCase();
  return code === 'SESSION_INVALID' || code === 'SESSION_REQUIRED' || code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID';
}

async function fetchAdminOnce(url, options, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers,
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    return { response, payload };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function adminFetch(path, options = {}) {
  const baseHeaders = new Headers(options.headers || {});
  const key = getSecurityKey();
  if (!baseHeaders.has('Authorization') && window.PM_ADMIN_AUTH?.getFreshToken) {
    try {
      const token = await window.PM_ADMIN_AUTH.getFreshToken(!!options.forceAuthToken);
      if (token) baseHeaders.set('Authorization', `Bearer ${token}`);
    } catch (_) {}
  }

  if (options.body && !(options.body instanceof FormData) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) {
    try {
      const parsedBody = JSON.parse(String(options.body || '{}'));
      const targetPath = String(path || '');
      const isMatrixGatePath = /\/api\/auth\/admin\/(matrix\/(identity|status|step-email|step-password|step-name|logout)|bootstrap)(?:[/?#]|$)/i.test(targetPath)
        || /\/auth\/admin\/(matrix\/(identity|status|step-email|step-password|step-name|logout)|bootstrap)(?:[/?#]|$)/i.test(targetPath);
      const looksCritical = !isMatrixGatePath && (/\/(admin|api\/crash\/admin)\/(users|promos|promo|matrix|cleanup|wheel|avatar-frame|market|risk|risk-table|risk-limit|next-crash-point|future-rounds)/i.test(targetPath)
        || /\/api\/admin\//i.test(targetPath) || /\/matrix-siege\/admin\//i.test(targetPath));
      if (looksCritical && !parsedBody.adminPassword && !parsedBody.reauthPassword && !baseHeaders.has('x-admin-reauth')) {
        const reauth = await requestAdminReauth();
        if (reauth) {
          parsedBody.adminPassword = reauth;
          parsedBody.reauthPassword = reauth;
          options = { ...options, body: JSON.stringify(parsedBody) };
          baseHeaders.set('x-admin-reauth', reauth);
        }
      }
    } catch (_) {}
  }

  if (typeof window.__PM_API__?.ensureApiBase === 'function') {
    try { await window.__PM_API__.ensureApiBase(); } catch (_) {}
  }
  if (key) baseHeaders.set('x-admin-client-key', key);
  if (!baseHeaders.has('Content-Type') && options.body && !(options.body instanceof FormData)) baseHeaders.set('Content-Type', 'application/json');
  const retryableStatuses = new Set([404, 405, 408, 429, 502, 503, 504]);
  const rawCandidates = Array.isArray(window.__PM_API__?.getCandidates?.())
    ? window.__PM_API__.getCandidates()
    : [];
  const candidates = [];
  const pushCandidate = (value) => {
    const normalized = String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };
  pushCandidate(window.__PM_STATIC_RUNTIME_CONFIG__?.apiBase);
  pushCandidate(window.__PM_RUNTIME?.apiBase);
  pushCandidate(window.__PLAYMATRIX_API_URL__);
  pushCandidate(PM_ADMIN_BACKEND_FALLBACK);
  rawCandidates.forEach(pushCandidate);
  if (!/playmatrix\.com\.tr$/i.test(String(window.location.hostname || ''))) pushCandidate(window.location.origin);
  const timeoutMs = Number(options.timeoutMs || 12000);
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const base = String(candidates[index] || '').trim();
    const url = buildAdminRequestUrl(path, base);
    try {
      let headers = new Headers(baseHeaders);
      let { response, payload } = await fetchAdminOnce(url, options, headers, timeoutMs);
      if (response.ok && payload?.ok !== false) {
        if (base && window.__PM_API__?.setApiBase) window.__PM_API__.setApiBase(base);
        persistAdminAccessPayload(payload || {});
        if (/\/auth\/admin\/matrix\/logout$/i.test(String(path || ''))) clearAdminAccessState();
        return payload;
      }
      const error = new Error(adminErrorText(payload, `HTTP ${response.status}`));
      error.status = response.status;
      error.code = payload?.error || payload?.code || '';
      error.payload = payload;
      lastError = error;
      if (!retryableStatuses.has(response.status) || index >= candidates.length - 1) throw error;
    } catch (error) {
      if (error?.name === 'AbortError') {
        error = new Error('Yönetici isteği zaman aşımına uğradı.');
        error.status = 408;
      } else if (error?.payload) {
        error.message = adminErrorText(error.payload, error.message || 'Admin isteği başarısız oldu.');
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
