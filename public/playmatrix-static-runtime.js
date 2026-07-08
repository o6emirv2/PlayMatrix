(function () {
  'use strict';

  
  const PUBLIC_API_BASE = 'https://emirhan-siye.onrender.com';
  const PUBLIC_BASE_URL = 'https://playmatrix.com.tr';
  const EXPECTED_FIREBASE_PROJECT_ID = 'playmatrixpro-b18b7';
  const PUBLIC_FIREBASE_CONFIG = null;

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }


  const PM_USER_MESSAGE_MAP = Object.freeze({
    AUTH_REQUIRED: 'Devam etmek için giriş yapman gerekiyor.',
    AUTH_INVALID: 'Devam etmek için giriş yapman gerekiyor.',
    SESSION_REQUIRED: 'Devam etmek için giriş yapman gerekiyor.',
    SESSION_INVALID: 'Oturumun yenilendi. Lütfen tekrar giriş yap.',
    EMAIL_VERIFICATION_REQUIRED: 'Bu işlem için e-posta adresini doğrulaman gerekiyor.',
    AGE_REQUIRED: 'Devam etmek için doğum tarihini eklemen gerekiyor.',
    AGE_RESTRICTED: 'Devam edebilmek için 16 yaşından büyük olmalısınız.',
    DATE_OF_BIRTH_REQUIRED: 'Doğum tarihi alanını eksiksiz seçmelisiniz.',
    ACCOUNT_LOCKED: 'Hesabın şu anda kilitli. Destek ile iletişime geçebilirsin.',
    ACCOUNT_BANNED: 'Hesabınla oyunlara erişim kısıtlandı.',
    ACCOUNT_DELETION_PENDING: 'Hesap silme talebin aktif. Devam etmek için talebi iptal edebilirsin.',
    MARKET_CLOSED: 'Market şu anda çevrim dışı.',
    PROMO_CLOSED: 'Promo sistemi şu anda kapalı.',
    WHEEL_CLOSED: 'Çark şu anda kapalı.',
    REDIS_UNAVAILABLE: 'Sistem şu anda güvenli işlem moduna geçemedi. Lütfen biraz sonra tekrar dene.',
    ECONOMY_LOCKED: 'Ekonomi işlemi şu anda güvenli şekilde tamamlanamadı. Lütfen tekrar dene.',
    GAME_STATE_UNAVAILABLE: 'Oyun durumu şu anda yüklenemedi. Lütfen tekrar dene.',
    CRASH_ROUND_UNAVAILABLE: 'Crash tur durumu şu anda yüklenemedi. Lütfen tekrar dene.',
    MATCHMAKING_COOLDOWN: 'Eşleşme için kısa bir süre beklemen gerekiyor.',
    PAYLOAD_TOO_LARGE: 'Gönderilen oyun verisi çok büyük. Lütfen oyunu yeniden başlat.',
    ANTI_CHEAT_REJECTED: 'Skorun doğrulanırken bir sorun oluştu. Lütfen oyunu tekrar başlat.',
    IDEMPOTENCY_REPLAY: 'Bu işlem daha önce işlendi.',
    CASHOUT_ALREADY_PROCESSED: 'Bu çıkış işlemi daha önce tamamlandı.',
    INSUFFICIENT_BALANCE: 'Bakiyen bu işlem için yeterli değil.',
    NETWORK_ERROR: 'Bağlantı kurulamadı. Lütfen internet bağlantını kontrol edip tekrar dene.',
    REQUEST_TIMEOUT: 'İstek zaman aşımına uğradı. Lütfen tekrar dene.',
    LOAD_FAILED: 'İçerik şu anda yüklenemedi. Lütfen tekrar dene.',
    MARKET_OFFLINE: 'Market şu anda çevrim dışı. Lütfen daha sonra tekrar dene.',
    MARKET_LOAD_FAILED: 'Market şu anda yüklenemedi. Lütfen tekrar dene.',
    ITEM_UNAVAILABLE: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
    ITEM_NOT_FOUND: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
    PROMO_NOT_FOUND: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
    PROMO_INACTIVE: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
    PROMO_EXPIRED: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
    PROMO_LIMIT_REACHED: 'Bu promo kodunun kullanım limiti dolmuş.',
    PROMO_ALREADY_CLAIMED: 'Bu promo kodunu daha önce kullandın.',
    WHEEL_ALREADY_SPUN: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
    WHEEL_ALREADY_CLAIMED_TODAY: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
    ROOM_NOT_FOUND: 'Oda bulunamadı. Lütfen lobiye dönüp tekrar dene.',
    ROOM_CLOSED: 'Oda kapandı. Lütfen lobiye dön.',
    RUN_NOT_FOUND: 'Oyun oturumu yenilendi. Lütfen oyunu tekrar başlat.',
    RUN_TOKEN_INVALID: 'Oyun oturumu doğrulanamadı. Lütfen oyunu tekrar başlat.',
    RUN_TOKEN_REQUIRED: 'Oyun oturumu doğrulanamadı. Lütfen oyunu tekrar başlat.',
    INTERNAL_ERROR: 'İşlem şu anda tamamlanamadı. Lütfen biraz sonra tekrar dene.',
    PERMISSION_DENIED: 'Bu işlemi yapmak için yetkin bulunmuyor.'
  });

  const PM_FORBIDDEN_USER_WORDS = /render\s*memory|\brender\b|firebase|sunucu|server|backend|endpoint|socket|http[_\s-]*\d{3}|api\s*failed|internal\s*error|permission\s*denied|unauthorized|validation\s*failed|undefined|null\s*reference|\bnull\b|exception|stack\s*trace|token\s*expired|config\s*error|collection\s*not\s*found|document\s*write\s*failed|request\s*failed/i;

  function normalizePlayMatrixUserMessage(value, fallback) {
    const safeFallback = String(fallback || 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
    const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    const upper = raw.toUpperCase();
    if (PM_USER_MESSAGE_MAP[raw]) return PM_USER_MESSAGE_MAP[raw];
    if (PM_USER_MESSAGE_MAP[upper]) return PM_USER_MESSAGE_MAP[upper];
    if (/auth\/invalid-credential|auth\/wrong-password/i.test(raw)) return 'E-posta veya şifre hatalı.';
    if (/auth\/email-already-in-use/i.test(raw)) return 'Bu e-posta başka bir hesapta kullanılıyor.';
    if (/auth\/invalid-email/i.test(raw)) return 'E-posta adresi geçersiz.';
    if (/auth\/network-request-failed|failed\s*to\s*fetch|network|load\s*failed/i.test(raw)) return PM_USER_MESSAGE_MAP.NETWORK_ERROR;
    if (/too[-_\s]*many|rate/i.test(raw)) return 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.';
    if (!raw || PM_FORBIDDEN_USER_WORDS.test(raw) || /^HTTP[_\s-]*\d{3}$/i.test(raw) || /^[A-Z0-9_./:-]{4,}$/.test(raw)) return safeFallback;
    return raw.length > 180 ? safeFallback : raw;
  }

  window.PMUserMessages = Object.freeze({
    normalize: normalizePlayMatrixUserMessage,
    map: PM_USER_MESSAGE_MAP
  });
  window.PMSanitizeUserMessage = normalizePlayMatrixUserMessage;

  const apiBase = normalizeBase(PUBLIC_API_BASE);
  const runtime = Object.freeze({
    version: 11,
    environment: 'production',
    publicBaseUrl: normalizeBase(PUBLIC_BASE_URL),
    apiBase,
    expectedFirebaseProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    firebase: PUBLIC_FIREBASE_CONFIG,
    firebaseReady: !!PUBLIC_FIREBASE_CONFIG,
    source: 'static-public-firebase-render-contract'
  });

  window.__PM_STATIC_RUNTIME_CONFIG__ = runtime;
  window.__PM_RUNTIME = Object.assign({}, runtime, window.__PM_RUNTIME || {});
  if (!window.__PM_RUNTIME.apiBase || normalizeBase(window.__PM_RUNTIME.apiBase) === normalizeBase(window.location.origin)) {
    window.__PM_RUNTIME.apiBase = apiBase;
  }
  window.__PM_RUNTIME.expectedFirebaseProjectId = EXPECTED_FIREBASE_PROJECT_ID;
  window.__PM_RUNTIME.firebase = PUBLIC_FIREBASE_CONFIG;
  window.__PM_RUNTIME.firebaseReady = !!PUBLIC_FIREBASE_CONFIG;
  window.__PLAYMATRIX_API_URL__ = normalizeBase(window.__PM_RUNTIME.apiBase || window.__PLAYMATRIX_API_URL__ || apiBase);

  const reportedClientErrors = new Map();

  function sanitizeClientStack(stack) {
    const raw = String(stack || '');
    if (!raw) return '';
    return raw
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
      .replace(/(token|secret|password|privateKey|serviceAccount|apiKey)(["'\s:=]+)([^,;\s]+)/gi, '$1$2[redacted]')
      .split('\n')
      .slice(0, 6)
      .join('\n')
      .slice(0, 900);
  }

  function sanitizeClientMessage(message) {
    return String(message || '')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
      .replace(/(token|secret|password|privateKey|serviceAccount|apiKey)(["'\s:=]+)([^,;\s]+)/gi, '$1$2[redacted]')
      .slice(0, 300);
  }

  function shouldSendClientError(type, payload) {
    try {
      const key = [type, payload?.scope || '', payload?.message || '', payload?.source || '', payload?.line || ''].join('|').slice(0, 360);
      const now = Date.now();
      const previous = reportedClientErrors.get(key) || 0;
      if (now - previous < 2500) return false;
      reportedClientErrors.set(key, now);
      if (reportedClientErrors.size > 80) {
        const cutoff = now - 30000;
        for (const [entryKey, at] of reportedClientErrors) if (at < cutoff) reportedClientErrors.delete(entryKey);
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function reportClientRuntimeError(type, payload) {
    try {
      const normalizedPayload = Object.assign({ game: 'home', type, path: location.pathname, href: location.href, at: Date.now() }, payload || {});
      normalizedPayload.message = sanitizeClientMessage(normalizedPayload.message || normalizedPayload.error || '');
      if (normalizedPayload.stack) normalizedPayload.stack = sanitizeClientStack(normalizedPayload.stack);
      normalizedPayload.sanitizedStack = sanitizeClientStack(normalizedPayload.sanitizedStack || normalizedPayload.stack || '');
      if (!shouldSendClientError(type, normalizedPayload)) return;
      const body = JSON.stringify(normalizedPayload);
      const endpoint = `${normalizeBase(window.__PLAYMATRIX_API_URL__ || apiBase)}/api/client/error`;
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      }
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  window.__PM_REPORT_CLIENT_ERROR__ = function reportPlayMatrixClientError(scope, error, extra) {
    const err = error || {};
    reportClientRuntimeError(scope || 'client.error', Object.assign({
      scope: scope || 'client.error',
      message: sanitizeClientMessage(err.message || String(err || '')),
      stack: sanitizeClientStack(err.stack || ''),
      sanitizedStack: sanitizeClientStack(err.stack || ''),
      source: 'home',
      severity: 'error'
    }, extra || {}));
  };

  if (window.__PM_GLOBAL_ERROR_LISTENERS__ !== 'installed') {
    window.__PM_GLOBAL_ERROR_LISTENERS__ = 'installed';
    window.addEventListener('error', function (event) {
      reportClientRuntimeError('window.error', { scope: 'home.window_error', message: event.message, source: event.filename, line: event.lineno, column: event.colno });
    });
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason || {};
      reportClientRuntimeError('unhandledrejection', { scope: 'home.promise_rejection', message: sanitizeClientMessage(reason.message || String(reason || '')), stack: sanitizeClientStack(reason.stack || ''), sanitizedStack: sanitizeClientStack(reason.stack || ''), source: 'promise' });
    });
  }


  function parseActionArgs(raw) {
    if (!raw) return [];
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [parsed]; } catch (_) { return []; }
  }

  function installActionDelegation() {
    if (document.documentElement.dataset.pmActionDelegation === '1') return;
    document.documentElement.dataset.pmActionDelegation = '1';
    const run = function (target, event) {
      const action = String(target?.dataset?.pmAction || '').trim();
      if (!action) return;
      const fn = action.split('.').reduce((obj, key) => obj && obj[key], window);
      if (typeof fn !== 'function') return;
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(fn.apply(window, parseActionArgs(target.dataset.pmArgs || '[]'))).catch(function (error) {
        reportClientRuntimeError('data-pm-action', { action, message: error?.message || String(error || '') });
      });
    };
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest && event.target.closest('[data-pm-action]');
      if (!target || target.dataset.pmActionEvent === 'input') return;
      run(target, event);
    }, true);
    document.addEventListener('input', function (event) {
      const target = event.target && event.target.closest && event.target.closest('[data-pm-action][data-pm-action-event="input"]');
      if (!target) return;
      run(target, event);
    }, true);
  }



  function setFallbackAuthMode(mode) {
    try {
      const current = mode === 'register' ? 'register' : 'login';
      document.querySelectorAll('#authSegment [data-auth-mode]').forEach(function (button) {
        button.classList.toggle('is-active', button.dataset.authMode === current);
      });
      ['authFirstNameGroup','authLastNameGroup','authUsernameGroup','authPasswordRepeatGroup'].forEach(function (id) {
        const group = document.getElementById(id);
        if (group) group.classList.toggle('hidden', current !== 'register');
      });
      const emailLabel = document.querySelector('label[for="authEmail"]');
      const emailInput = document.getElementById('authEmail');
      if (emailLabel) emailLabel.textContent = current === 'register' ? 'E-posta' : 'E-posta veya Kullanıcı Adı';
      if (emailInput) {
        emailInput.placeholder = current === 'register' ? 'E-posta' : 'E-posta veya kullanıcı adı';
        emailInput.type = current === 'register' ? 'email' : 'text';
      }
      const submit = document.getElementById('authSubmitBtn');
      if (submit) submit.textContent = current === 'register' ? 'Kayıt Ol' : 'Giriş Yap';
    } catch (_) {}
  }

  function fallbackOpenSheet(name) {
    try {
      const shell = document.getElementById('sheetShell');
      if (!shell) return;
      const title = document.getElementById('sheetTitle');
      const sub = document.getElementById('sheetSubtitle');
      const copy = name === 'forgot'
        ? ['Şifre sıfırlama', 'E-posta adresine sıfırlama bağlantısı gönder.']
        : ['Hesap erişimi', 'Giriş yap veya yeni hesap oluştur.'];
      if (title) title.textContent = copy[0];
      if (sub) sub.textContent = copy[1];
      document.querySelectorAll('.sheet-section').forEach(function (section) {
        section.classList.toggle('is-active', section.dataset.sheet === name);
      });
      shell.classList.add('is-open');
      shell.setAttribute('aria-hidden', 'false');
      document.body.classList.add('pm-sheet-open');
      window.setTimeout(function () {
        const target = document.getElementById(name === 'forgot' ? 'forgotEmail' : 'authEmail');
        try { target && target.focus && target.focus({ preventScroll: true }); } catch (_) {}
      }, 50);
    } catch (_) {}
  }

  function fallbackCloseSheet() {
    try {
      const shell = document.getElementById('sheetShell');
      if (shell) {
        shell.classList.remove('is-open', 'is-bottom-email', 'is-wide-profile');
        shell.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('pm-sheet-open');
    } catch (_) {}
  }

  function installSheetFallbackControls() {
    if (document.documentElement.dataset.pmSheetFallback === '1') return;
    document.documentElement.dataset.pmSheetFallback = '1';
    document.addEventListener('click', function (event) {
      const target = event.target;
      const closeHit = target && target.closest && target.closest('#sheetClose');
      const backdropHit = target && target.id === 'sheetBackdrop';
      const loginHit = target && target.closest && target.closest('#loginBtn');
      const registerHit = target && target.closest && target.closest('#registerBtn');
      const forgotHit = target && target.closest && target.closest('#forgotPasswordBtn');
      const authModeHit = target && target.closest && target.closest('#authSegment [data-auth-mode]');
      if (closeHit || backdropHit) { fallbackCloseSheet(); return; }
      if (loginHit && typeof window.openSheet !== 'function') { setFallbackAuthMode('login'); fallbackOpenSheet('auth'); return; }
      if (registerHit && typeof window.openSheet !== 'function') { setFallbackAuthMode('register'); fallbackOpenSheet('auth'); return; }
      if (forgotHit && typeof window.openSheet !== 'function') { fallbackOpenSheet('forgot'); return; }
      if (authModeHit && typeof window.setAuthMode !== 'function') { setFallbackAuthMode(authModeHit.dataset.authMode); }
    }, true);
  }
  function installSmoothMobileScroll() {
    document.documentElement.style.webkitOverflowScrolling = 'touch';
    document.documentElement.style.overscrollBehaviorY = 'auto';
    document.body.style.webkitOverflowScrolling = 'touch';
    document.addEventListener('touchmove', function () {}, { passive: true });
    document.addEventListener('wheel', function () {}, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { installActionDelegation(); installSheetFallbackControls(); installSmoothMobileScroll(); }, { once: true });
  } else {
    installActionDelegation();
    installSheetFallbackControls();
    installSmoothMobileScroll();
  }

})();
