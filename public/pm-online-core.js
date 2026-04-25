import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, getIdToken, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { loadFirebaseWebConfig } from "./firebase-runtime.js";

export const PLAYMATRIX_FIREBASE_CONFIG = null;

function normalizeBase(value) {
  return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

function buildError(message, code, extra = {}) {
  const error = new Error(message || 'REQUEST_FAILED');
  error.code = code || 'REQUEST_FAILED';
  Object.assign(error, extra || {});
  return error;
}

export async function initPlayMatrixOnlineCore(firebaseConfig = PLAYMATRIX_FIREBASE_CONFIG) {
  if (window.__PM_ONLINE_CORE__) return window.__PM_ONLINE_CORE__;

  const resolvedFirebaseConfig = firebaseConfig || await loadFirebaseWebConfig({ required: true, scope: "app" });
  const app = getApps().length ? getApp() : initializeApp(resolvedFirebaseConfig);
  const auth = getAuth(app);
  const runtime = window.__PM_RUNTIME = window.__PM_RUNTIME || {};

  const core = {
    app,
    auth,
    onAuthStateChanged: (handler) => onAuthStateChanged(auth, handler),
    getIdToken: async (forceRefresh = false) => {
      if (!auth.currentUser) throw buildError('Oturum bulunamadı.', 'NO_USER');
      return getIdToken(auth.currentUser, forceRefresh);
    },
    signOut: () => signOut(auth),
    getApiBaseSync() {
      const base = window.__PM_API__?.getApiBaseSync
        ? window.__PM_API__.getApiBaseSync()
        : normalizeBase(runtime.apiBase || window.__PLAYMATRIX_API_URL__ || document.querySelector('meta[name="playmatrix-api-url"]')?.content || window.location.origin);
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
      if (auth.currentUser) return auth.currentUser;
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          unsub();
          reject(buildError('Oturum doğrulanamadı.', 'AUTH_TIMEOUT'));
        }, timeoutMs);
        const unsub = onAuthStateChanged(auth, (user) => {
          if (!user || settled) return;
          settled = true;
          clearTimeout(timer);
          unsub();
          resolve(user);
        });
      });
    },
    async ensureSocketClientReady() {
      if (typeof window.io === 'function') return window.io;
      if (window.__PM_API__?.loadSocketClientScript) {
        await window.__PM_API__.loadSocketClientScript();
      }
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
          clearTimeout(timer);
          cleanup();
          handler(payload);
        };
        const onConnect = () => finish(resolve, sock);
        const onError = (error) => finish(reject, error instanceof Error ? error : buildError(error?.message || 'Gerçek zamanlı bağlantı kurulamadı.', error?.code || 'SOCKET_CONNECT_ERROR'));
        const timer = setTimeout(() => finish(reject, buildError('Gerçek zamanlı bağlantı zaman aşımına uğradı.', 'SOCKET_TIMEOUT')), timeoutMs);
        sock.on('connect', onConnect);
        sock.on('connect_error', onError);
      });
    },
    async requestWithAuth(endpoint, { method = 'GET', body = null, timeoutMs = 8000, retries = 1, headers = {}, credentials = 'include' } = {}) {
      await core.waitForAuthReady();
      const base = await core.ensureApiBaseReady();
      const attemptRequest = async (attempt = 0, refresh = false) => {
        const token = await core.getIdToken(refresh);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(`${base}${endpoint}`, {
            method,
            credentials,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...headers
            },
            body: body == null ? undefined : JSON.stringify(body),
            signal: controller.signal
          });
          const payload = await response.json().catch(() => ({ ok: false, error: 'Geçersiz sunucu yanıtı.' }));
          if ((response.status === 401 || response.status === 403) && attempt < retries) {
            return attemptRequest(attempt + 1, true);
          }
          if (!response.ok || payload?.ok === false) {
            throw buildError(payload?.error || 'Sunucu isteği başarısız.', payload?.code || `HTTP_${response.status}`, { status: response.status, payload });
          }
          return payload;
        } catch (error) {
          const normalized = error?.name === 'AbortError' ? buildError('İstek zaman aşımına uğradı.', 'REQUEST_TIMEOUT') : error;
          const retryable = attempt < retries && (normalized?.code === 'REQUEST_TIMEOUT' || normalized?.message === 'Failed to fetch' || /^HTTP_(408|429|5\d\d)$/.test(String(normalized?.code || '')));
          if (retryable) return attemptRequest(attempt + 1, false);
          throw normalized;
        } finally {
          clearTimeout(timer);
        }
      };
      return attemptRequest(0, false);
    },
    async createAuthedSocket(existingSocket = null, { authPayload = {}, transports = ['websocket', 'polling'], reconnection = true, reconnectionAttempts = 6, timeout = 6000, extraOptions = {} } = {}) {
      const base = await core.ensureApiBaseReady();
      const ioFactory = await core.ensureSocketClientReady();
      const token = await core.getIdToken(true).catch(() => core.getIdToken(false));
      if (existingSocket) {
        try { existingSocket.removeAllListeners?.(); } catch (_) {}
        try { existingSocket.disconnect?.(); } catch (_) {}
      }
      return ioFactory(base, {
        auth: { token, ...authPayload },
        transports,
        reconnection,
        reconnectionAttempts,
        timeout,
        ...extraOptions
      });
    }
  };

  runtime.auth = auth;
  runtime.signOut = core.signOut;
  runtime.getIdToken = core.getIdToken;
  runtime.apiBase = core.getApiBaseSync();
  window.__PLAYMATRIX_API_URL__ = runtime.apiBase;
  window.__PM_ONLINE_CORE__ = core;
  return core;
}
