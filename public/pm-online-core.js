import { loadFirebaseWebConfig } from "./firebase-runtime.js";

export const PLAYMATRIX_FIREBASE_CONFIG = null;

const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
const FIREBASE_AUTH_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const FIREBASE_SDK_TIMEOUT_MS = 9000;
const FIREBASE_SDK_CANDIDATES = Object.freeze([
  Object.freeze({ version: '10.12.2', app: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', auth: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', compatApp: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', compatAuth: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js' }),
  Object.freeze({ version: '10.12.5', app: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js', auth: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js', compatApp: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js', compatAuth: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js' }),
  Object.freeze({ version: '10.13.2', app: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js', auth: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js', compatApp: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js', compatAuth: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js' })
]);
const PM_AUTH_REQUIRED_UID_KEY = 'pm_auth_required_uid';
function currentUidFromCore(core) { return String(core?.auth?.currentUser?.uid || '').trim(); }
function clearAuthRequiredLock() {
  try { window.sessionStorage?.removeItem(PM_AUTH_REQUIRED_UID_KEY); } catch (_) {}
  try { window.localStorage?.removeItem(PM_AUTH_REQUIRED_UID_KEY); } catch (_) {}
}
function markAuthRequired(core) {
  const uid = currentUidFromCore(core);
  if (!uid) return;
  try { window.sessionStorage?.setItem(PM_AUTH_REQUIRED_UID_KEY, uid); } catch (_) {}
  try { window.localStorage?.setItem(PM_AUTH_REQUIRED_UID_KEY, uid); } catch (_) {}
}
function isAuthRequiredLocked(core) {
  const uid = currentUidFromCore(core);
  if (!uid) return false;
  try { if (window.sessionStorage?.getItem(PM_AUTH_REQUIRED_UID_KEY) === uid) return true; } catch (_) {}
  try { if (window.localStorage?.getItem(PM_AUTH_REQUIRED_UID_KEY) === uid) return true; } catch (_) {}
  return false;
}
let serverSessionCache = null;
let serverSessionPromise = null;
function readServerSessionToken() { return serverSessionCache?.user?.uid ? 'http-only-session' : ''; }
function writeServerSessionToken() { return readServerSessionToken(); }
function clearServerSessionToken() { serverSessionCache = null; return ''; }
async function fetchServerSession(core, { force = false } = {}) {
  if (!force && serverSessionCache?.user?.uid && Number(serverSessionCache.expiresAt || 0) > Date.now() + 30000) return serverSessionCache;
  if (!force && serverSessionPromise) return serverSessionPromise;
  serverSessionPromise = (async () => {
    const base = await core.ensureApiBaseReady();
    const response = await fetch(`${base}/api/auth/session`, { method:'GET', credentials:'include', cache:'no-store', headers:{ Accept:'application/json', 'x-playmatrix-client':'web-session' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) { serverSessionCache = null; return null; }
    const data = payload.data || payload;
    serverSessionCache = data?.user?.uid ? data : null;
    return serverSessionCache;
  })().finally(() => { serverSessionPromise = null; });
  return serverSessionPromise;
}
async function syncServerSession(core, { forceToken = false } = {}) {
  if (!core?.auth?.currentUser) return fetchServerSession(core).catch(() => null);
  const base = await core.ensureApiBaseReady();
  const idToken = await core.getIdToken(!!forceToken);
  const response = await fetch(`${base}/api/auth/session`, { method:'POST', credentials:'include', cache:'no-store', headers:{ Accept:'application/json', 'Content-Type':'application/json', Authorization:`Bearer ${idToken}`, 'x-playmatrix-client':'web-session' }, body:'{}' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw buildError('Oturum doğrulanamadı.', payload?.code || payload?.error || 'SESSION_SYNC_FAILED', { status:response.status, payload });
  const data = payload.data || payload;
  serverSessionCache = data?.user?.uid ? data : null;
  clearAuthRequiredLock();
  return serverSessionCache;
}
async function clearServerSession(core) {
  try {
    const base = await core.ensureApiBaseReady();
    await fetch(`${base}/api/auth/session`, { method:'DELETE', credentials:'include', cache:'no-store', headers:{ Accept:'application/json', 'x-playmatrix-client':'web-session' } });
  } catch (_) {}
  serverSessionCache = null;
}
function isAuthError(payload, status) {
  const code = String(payload?.code || payload?.error || '').toUpperCase();
  return (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') ? 'required' : '';
}
function notifyAuthRequired() {
  try { window.dispatchEvent(new CustomEvent('playmatrix:auth-required', { detail: { at: Date.now() } })); } catch (_) {}
}

let firebaseSdkPromise = null;

function normalizeBase(value) {
  return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

function isProductionHost() {
  return /(^|\.)playmatrix\.com\.tr$/i.test(String(window.location.hostname || '').trim());
}

function buildError(message, code, extra = {}) {
  const error = new Error(message || 'REQUEST_FAILED');
  error.code = code || 'REQUEST_FAILED';
  Object.assign(error, extra || {});
  return error;
}


function sanitizeOnlineUserMessage(value, fallback = 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.') {
  try {
    if (window.PMUserMessages?.normalize) return window.PMUserMessages.normalize(value, fallback);
    if (typeof window.PMSanitizeUserMessage === 'function') return window.PMSanitizeUserMessage(value, fallback);
  } catch (_) {}
  const raw = String(value || '').trim();
  if (!raw || /render\s*memory|\brender\b|firebase|sunucu|server|backend|endpoint|socket|http[_\s-]*\d{3}|api\s*failed|internal\s*error|permission\s*denied|unauthorized|undefined|null|exception|stack\s*trace|request\s*failed/i.test(raw)) return fallback;
  return raw.length > 180 ? fallback : raw;
}

function timeoutAfter(ms, code) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(buildError(code, code)), Math.max(1000, Number(ms) || 1000));
  });
}

function withTimeout(promise, ms, code) {
  return Promise.race([Promise.resolve(promise), timeoutAfter(ms, code)]);
}

async function requestWithSessionFallback(core, endpoint, { method = 'GET', body = null, timeoutMs = 8000, retries = 1, headers = {}, credentials = 'include', allowSessionFallback = true } = {}) {
  if (!allowSessionFallback) await core.waitForAuthReady();
  else {
    try { await core.waitForAuthReady(Math.min(3500, Math.max(1200, Number(timeoutMs) || 3500))); } catch (_) {}
  }

  const base = await core.ensureApiBaseReady();
  if (core?.auth?.currentUser) await syncServerSession(core).catch(() => null);
  else if (allowSessionFallback) await fetchServerSession(core).catch(() => null);
  let lastAuthError = null;
  const getOptionalToken = async (refresh = false) => {
    try {
      if (core?.auth?.currentUser && typeof core.getIdToken === 'function') return await core.getIdToken(!!refresh);
    } catch (error) {
      lastAuthError = error;
    }
    return '';
  };


  const attemptRequest = async (attempt = 0, refresh = false) => {
    const token = await getOptionalToken(refresh);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(1200, Number(timeoutMs) || 8000));
    try {
      const requestHeaders = { ...headers };
      if (body != null && !requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json';
      if (token) requestHeaders.Authorization = `Bearer ${token}`;
      requestHeaders['x-playmatrix-client'] = requestHeaders['x-playmatrix-client'] || 'web';
      const response = await fetch(`${base}${endpoint}`, {
        method,
        credentials,
        headers: requestHeaders,
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({ ok: false, error: 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.' }));
      const authProblem = isAuthError(payload, response.status);
      if (authProblem === 'required' && isAuthRequiredLocked(core)) {
        throw buildError('Devam etmek için giriş yapman gerekiyor.', 'AUTH_REQUIRED', { status: response.status, payload });
      }
      if ((response.status === 401 || response.status === 403) && token && attempt < retries) {
        await syncServerSession(core, { forceToken: true }).catch(() => null);
        return attemptRequest(attempt + 1, true);
      }
      if (!response.ok || payload?.ok === false) {
        const message = sanitizeOnlineUserMessage(payload?.error || (lastAuthError?.message && !token ? lastAuthError.message : 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.'));
        throw buildError(message, payload?.code || `HTTP_${response.status}`, { status: response.status, payload });
      }
      return payload;
    } catch (error) {
      const normalized = error?.name === 'AbortError' ? buildError('İstek zaman aşımına uğradı.', 'REQUEST_TIMEOUT') : error;
      const retryable = attempt < retries && (normalized?.code === 'REQUEST_TIMEOUT' || normalized?.message === 'Failed to fetch' || /^HTTP_(408|429|5\d\d)$/.test(String(normalized?.code || '')));
      if (retryable) return attemptRequest(attempt + 1, false);
      throw normalized;
    } finally {
      window.clearTimeout(timer);
    }
  };

  return attemptRequest(0, false);
}

function loadClassicScriptOnce(src, timeoutMs = FIREBASE_SDK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const normalized = String(src || '').trim();
    if (!normalized) { reject(buildError('SDK kaynağı eksik.', 'FIREBASE_SCRIPT_SRC_MISSING')); return; }
    const existing = document.querySelector(`script[data-pm-sdk-src="${normalized}"]`);
    if (existing?.dataset.loaded === 'true') { resolve(existing); return; }
    if (existing) {
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', () => reject(buildError('SDK yüklenemedi.', 'FIREBASE_SCRIPT_LOAD_FAILED')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = normalized;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.dataset.pmSdkSrc = normalized;
    const timer = window.setTimeout(() => {
      script.remove();
      reject(buildError('SDK zaman aşımına uğradı.', 'FIREBASE_SCRIPT_TIMEOUT'));
    }, Math.max(2500, Number(timeoutMs) || FIREBASE_SDK_TIMEOUT_MS));
    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      script.dataset.loaded = 'true';
      resolve(script);
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      script.remove();
      reject(buildError('SDK yüklenemedi.', 'FIREBASE_SCRIPT_LOAD_FAILED'));
    }, { once: true });
    document.head.appendChild(script);
  });
}

async function importModuleFirebaseSdk(timeoutMs = FIREBASE_SDK_TIMEOUT_MS) {
  let lastError = null;
  for (const candidate of FIREBASE_SDK_CANDIDATES) {
    try {
      const [appModule, authModule] = await withTimeout(Promise.all([
        import(/* @vite-ignore */ candidate.app),
        import(/* @vite-ignore */ candidate.auth)
      ]), timeoutMs, `FIREBASE_MODULE_TIMEOUT:${candidate.version}`);
      if (!appModule?.initializeApp || !authModule?.getAuth) throw buildError('SDK sözleşmesi doğrulanamadı.', 'FIREBASE_MODULE_CONTRACT');
      return { appModule, authModule, mode: 'module', version: candidate.version };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || buildError('SDK yüklenemedi.', 'FIREBASE_MODULE_IMPORT_FAILED');
}

async function importCompatFirebaseSdk(timeoutMs = FIREBASE_SDK_TIMEOUT_MS + 1500) {
  let lastError = null;
  for (const candidate of FIREBASE_SDK_CANDIDATES) {
    try {
      await loadClassicScriptOnce(candidate.compatApp, timeoutMs);
      await loadClassicScriptOnce(candidate.compatAuth, timeoutMs);
      const firebase = window.firebase;
      if (!firebase?.initializeApp || !firebase?.auth) throw buildError('SDK sözleşmesi doğrulanamadı.', 'FIREBASE_COMPAT_CONTRACT');
      const appModule = {
        getApps() { return firebase.apps || []; },
        getApp() { return firebase.apps?.[0] || firebase.app(); },
        initializeApp(config) { return firebase.apps?.length ? firebase.apps[0] : firebase.initializeApp(config); }
      };
      const authModule = {
        getAuth(app) { return firebase.auth(app); },
        onAuthStateChanged(authRef, next, error, completed) { return authRef.onAuthStateChanged(next, error, completed); },
        setPersistence(authRef, persistence) { return authRef.setPersistence(persistence); },
        browserLocalPersistence: firebase.auth.Auth.Persistence.LOCAL,
        indexedDBLocalPersistence: firebase.auth.Auth.Persistence.LOCAL,
        browserSessionPersistence: firebase.auth.Auth.Persistence.SESSION,
        signOut(authRef) { return authRef.signOut(); },
        getIdToken(user, force) { return user.getIdToken(!!force); }
      };
      return { appModule, authModule, mode: 'compat', version: candidate.version };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || buildError('SDK yüklenemedi.', 'FIREBASE_COMPAT_IMPORT_FAILED');
}

async function loadFirebaseSdk() {
  if (firebaseSdkPromise) return firebaseSdkPromise;
  firebaseSdkPromise = (async () => {
    try { return await importModuleFirebaseSdk(FIREBASE_SDK_TIMEOUT_MS); }
    catch (moduleError) {
      try { return await importCompatFirebaseSdk(FIREBASE_SDK_TIMEOUT_MS + 1500); }
      catch (compatError) {
        compatError.moduleError = moduleError;
        throw compatError;
      }
    }
  })();
  try {
    return await firebaseSdkPromise;
  } catch (error) {
    firebaseSdkPromise = null;
    throw buildError(sanitizeOnlineUserMessage(error?.message || 'Hesap erişimi şu anda hazırlanamadı. Lütfen tekrar dene.'), error?.code || 'ONLINE_CORE_IMPORT_FAILED', { cause: error });
  }
}

function normalizeAuthListenerArgs(maybeAuthOrHandler, maybeHandler, maybeError, maybeCompleted) {
  return {
    handler: typeof maybeAuthOrHandler === 'function' ? maybeAuthOrHandler : maybeHandler,
    errorHandler: typeof maybeAuthOrHandler === 'function' ? maybeHandler : maybeError,
    completedHandler: typeof maybeAuthOrHandler === 'function' ? maybeError : maybeCompleted
  };
}

function readStoredAuthPersistenceMode() {
  try { if (window.localStorage?.getItem('pm_login_persistence') === 'local') return 'local'; } catch (_) {}
  try { if (window.sessionStorage?.getItem('pm_login_persistence') === 'session') return 'session'; } catch (_) {}
  return 'local';
}

async function applyStoredAuthPersistence(authModule, auth) {
  const mode = readStoredAuthPersistenceMode();
  if (!mode || typeof authModule?.setPersistence !== 'function' || !auth) return false;
  const persistence = mode === 'local'
    ? (authModule.browserLocalPersistence || authModule.indexedDBLocalPersistence || null)
    : (authModule.browserSessionPersistence || null);
  if (!persistence) return false;
  await authModule.setPersistence(auth, persistence);
  return true;
}

function createUnavailableCore(runtime, setupError) {
  const auth = { currentUser: null, app: null, name: 'playmatrix-unavailable-auth' };
  const normalizedError = setupError?.code
    ? setupError
    : buildError(sanitizeOnlineUserMessage(setupError?.message || 'Hesap erişimi şu anda hazırlanamadı. Lütfen tekrar dene.'), 'FIREBASE_UNAVAILABLE', { cause: setupError });

  const core = {
    app: null,
    auth,
    degraded: true,
    setupError: normalizedError,
    onAuthStateChanged: (maybeAuthOrHandler, maybeHandler, maybeError, maybeCompleted) => {
      const { handler, completedHandler } = normalizeAuthListenerArgs(maybeAuthOrHandler, maybeHandler, maybeError, maybeCompleted);
      let active = true;
      window.setTimeout(() => {
        if (!active) return;
        try { if (typeof handler === 'function') handler(null); }
        finally { if (typeof completedHandler === 'function') completedHandler(); }
      }, 0);
      return () => { active = false; };
    },
    getIdToken: async () => { throw normalizedError; },
    signOut: async () => {},
    getApiBaseSync() {
      const base = window.__PM_API__?.getApiBaseSync
        ? window.__PM_API__.getApiBaseSync()
        : normalizeBase(runtime.apiBase || window.__PLAYMATRIX_API_URL__ || document.querySelector('meta[name="playmatrix-api-url"]')?.content || (!isProductionHost() ? window.location.origin : ''));
      runtime.apiBase = base;
      window.__PLAYMATRIX_API_URL__ = base;
      return base;
    },
    async ensureApiBaseReady() {
      const base = window.__PM_API__?.ensureApiBase
        ? await window.__PM_API__.ensureApiBase().catch(() => core.getApiBaseSync())
        : core.getApiBaseSync();
      const normalized = normalizeBase(base || core.getApiBaseSync());
      runtime.apiBase = normalized;
      window.__PLAYMATRIX_API_URL__ = normalized;
      return normalized;
    },
    async waitForAuthReady() { throw normalizedError; },
    async ensureSocketClientReady() {
      if (typeof window.io === 'function') return window.io;
      if (window.__PM_API__?.loadSocketClientScript) await window.__PM_API__.loadSocketClientScript();
      if (typeof window.io === 'function') return window.io;
      throw buildError('Socket istemcisi yüklenemedi.', 'SOCKET_SCRIPT_ERROR');
    },
    async waitForSocketReady() { throw normalizedError; },
    async requestWithAuth(endpoint, options = {}) { return requestWithSessionFallback(core, endpoint, options); },
    async createAuthedSocket() { throw normalizedError; }
  };

  core.readServerSessionToken = readServerSessionToken;
  core.writeServerSessionToken = writeServerSessionToken;
  core.clearServerSessionToken = clearServerSessionToken;
  core.fetchServerSession = (options = {}) => fetchServerSession(core, options);
  core.syncServerSession = (options = {}) => syncServerSession(core, options);
  core.clearServerSession = () => clearServerSession(core);
  runtime.auth = auth;
  runtime.signOut = core.signOut;
  runtime.getIdToken = core.getIdToken;
  runtime.apiBase = core.getApiBaseSync();
  runtime.firebaseBootError = normalizedError.code || normalizedError.message || 'FIREBASE_UNAVAILABLE';
  window.__PLAYMATRIX_API_URL__ = runtime.apiBase;
  window.__PM_ONLINE_CORE__ = core;
  try { window.dispatchEvent(new CustomEvent('pm:online-core-ready', { detail: { degraded: true } })); } catch (_) {}
  return core;
}

export async function initPlayMatrixOnlineCore(firebaseConfig = PLAYMATRIX_FIREBASE_CONFIG) {
  if (window.__PM_ONLINE_CORE__) return window.__PM_ONLINE_CORE__;

  const runtime = window.__PM_RUNTIME = window.__PM_RUNTIME || {};
  let resolvedFirebaseConfig = null;
  let sdk = null;

  try {
    resolvedFirebaseConfig = firebaseConfig || await loadFirebaseWebConfig({ required: true, scope: "app" });
    sdk = await loadFirebaseSdk();
  } catch (error) {
    return createUnavailableCore(runtime, error);
  }

  const { appModule, authModule, mode: firebaseSdkMode = 'module', version: firebaseSdkVersion = '' } = sdk;
  const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(resolvedFirebaseConfig);
  const auth = authModule.getAuth(app);
  await applyStoredAuthPersistence(authModule, auth).catch(() => false);

  const core = {
    app,
    auth,
    degraded: false,
    onAuthStateChanged: (maybeAuthOrHandler, maybeHandler, maybeError, maybeCompleted) => {
      const { handler, errorHandler, completedHandler } = normalizeAuthListenerArgs(maybeAuthOrHandler, maybeHandler, maybeError, maybeCompleted);
      if (typeof handler !== 'function') {
        console.warn('[PlayMatrix] onAuthStateChanged handler missing; listener skipped.');
        return () => {};
      }
      return authModule.onAuthStateChanged(auth, handler, errorHandler, completedHandler);
    },
    getIdToken: async (forceRefresh = false) => {
      if (!auth.currentUser) throw buildError('Oturum bulunamadı.', 'NO_USER');
      return authModule.getIdToken(auth.currentUser, forceRefresh);
    },
    signOut: () => authModule.signOut(auth),
    getApiBaseSync() {
      const base = window.__PM_API__?.getApiBaseSync
        ? window.__PM_API__.getApiBaseSync()
        : normalizeBase(runtime.apiBase || window.__PLAYMATRIX_API_URL__ || document.querySelector('meta[name="playmatrix-api-url"]')?.content || (!isProductionHost() ? window.location.origin : ''));
      runtime.apiBase = base;
      window.__PLAYMATRIX_API_URL__ = base;
      return base;
    },
    async ensureApiBaseReady() {
      const base = window.__PM_API__?.ensureApiBase
        ? await window.__PM_API__.ensureApiBase().catch(() => core.getApiBaseSync())
        : core.getApiBaseSync();
      const normalized = normalizeBase(base || core.getApiBaseSync());
      runtime.apiBase = normalized;
      window.__PLAYMATRIX_API_URL__ = normalized;
      return normalized;
    },
    async waitForAuthReady(timeoutMs = 15000) {
      if (auth.currentUser) { await syncServerSession(core).catch(() => null); return auth.currentUser; }
      const existingSession = await fetchServerSession(core).catch(() => null);
      if (existingSession?.user?.uid) return { ...existingSession.user, sessionFallback: true };
      return new Promise((resolve, reject) => {
        let settled = false;
        let initialAuthSettled = false;
        let unsub = () => {};
        const finish = (fn, payload) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          try { unsub(); } catch (_) {}
          fn(payload);
        };
        const timer = window.setTimeout(() => finish(reject, buildError('Oturum doğrulanamadı.', 'AUTH_TIMEOUT')), Math.max(1500, Number(timeoutMs) || 15000));
        unsub = authModule.onAuthStateChanged(auth, (user) => {
          initialAuthSettled = true;
          if (user) { syncServerSession(core).catch(() => null); return finish(resolve, user); }
          fetchServerSession(core).then((session) => {
            if (session?.user?.uid) finish(resolve, { ...session.user, sessionFallback:true });
            else finish(reject, buildError('Oturum bulunamadı.', 'NO_USER'));
          }).catch(() => finish(reject, buildError('Oturum bulunamadı.', 'NO_USER')));
        }, (error) => finish(reject, buildError(error?.message || 'Oturum dinleyicisi başlatılamadı.', error?.code || 'AUTH_LISTENER_FAILED', { cause: error })));
        window.setTimeout(() => {
          if (!settled && initialAuthSettled && !auth.currentUser) finish(reject, buildError('Oturum bulunamadı.', 'NO_USER'));
        }, 900);
      });
    },
    async ensureSocketClientReady() {
      if (typeof window.io === 'function') return window.io;
      if (window.__PM_API__?.loadSocketClientScript) await window.__PM_API__.loadSocketClientScript();
      if (typeof window.io === 'function') return window.io;
      throw buildError('Socket istemcisi yüklenemedi.', 'SOCKET_SCRIPT_ERROR');
    },
    async waitForSocketReady(sock, timeoutMs = 5000) {
      if (!sock) throw buildError('Gerçek zamanlı bağlantı başlatılamadı.', 'SOCKET_INIT_FAILED');
      if (sock.connected) return sock;
      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          sock.off('connect', onConnect);
          sock.off('connect_error', onError);
        };
        const finish = (handler, payload) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          cleanup();
          handler(payload);
        };
        const onConnect = () => finish(resolve, sock);
        const onError = (error) => finish(reject, error instanceof Error ? error : buildError(error?.message || 'Gerçek zamanlı bağlantı kurulamadı.', error?.code || 'SOCKET_CONNECT_ERROR'));
        const timer = window.setTimeout(() => finish(reject, buildError('Gerçek zamanlı bağlantı zaman aşımına uğradı.', 'SOCKET_TIMEOUT')), Math.max(1200, Number(timeoutMs) || 5000));
        sock.on('connect', onConnect);
        sock.on('connect_error', onError);
      });
    },
    async requestWithAuth(endpoint, options = {}) {
      return requestWithSessionFallback(core, endpoint, options);
    },
    async createAuthedSocket(existingSocket = null, { authPayload = {}, transports = ['websocket', 'polling'], reconnection = true, reconnectionAttempts = 6, timeout = 6000, extraOptions = {} } = {}) {
      const base = await core.ensureApiBaseReady();
      const ioFactory = await core.ensureSocketClientReady();
      const token = await core.getIdToken(true).catch(() => core.getIdToken(false).catch(() => ''));
      if (token) await syncServerSession(core).catch(() => null);
      else await fetchServerSession(core).catch(() => null);
      if (existingSocket) {
        try { existingSocket.removeAllListeners?.(); } catch (_) {}
        try { existingSocket.disconnect?.(); } catch (_) {}
      }
      return ioFactory(base, {
        auth: { ...(token ? { token } : {}), ...authPayload },
        withCredentials: true,
        transports,
        reconnection,
        reconnectionAttempts,
        timeout,
        ...extraOptions
      });
    }
  };

  core.readServerSessionToken = readServerSessionToken;
  core.writeServerSessionToken = writeServerSessionToken;
  core.clearServerSessionToken = clearServerSessionToken;
  core.fetchServerSession = (options = {}) => fetchServerSession(core, options);
  core.syncServerSession = (options = {}) => syncServerSession(core, options);
  core.clearServerSession = () => clearServerSession(core);
  runtime.auth = auth;
  runtime.signOut = core.signOut;
  runtime.getIdToken = core.getIdToken;
  runtime.apiBase = core.getApiBaseSync();
  runtime.firebaseBootError = '';
  runtime.firebaseSdkMode = firebaseSdkMode;
  runtime.firebaseSdkVersion = firebaseSdkVersion;
  window.__PLAYMATRIX_API_URL__ = runtime.apiBase;
  window.__PM_ONLINE_CORE__ = core;
  try {
    authModule.onAuthStateChanged(auth, (user) => {
      if (user) syncServerSession(core).catch(() => null);
      else fetchServerSession(core, { force:true }).catch(() => null);
    });
  } catch (_) {}
  try { window.dispatchEvent(new CustomEvent('pm:online-core-ready', { detail: { degraded: false } })); } catch (_) {}
  return core;
}
