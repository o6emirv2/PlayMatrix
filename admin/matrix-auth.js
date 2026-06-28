import { preventUserInterference, initMatrixRain, setSecurityKey, getSecurityKey, clearSecurityKey, adminFetch, resolveAdminUrl } from './matrix-core.js';

preventUserInterference();
initMatrixRain(document.getElementById('matrixCanvas'), { fontSize: 14 });

const HOME_URL = 'https://playmatrix.com.tr/';
const DASHBOARD_URL = resolveAdminUrl('./admin.html');
const ADMIN_DENY_LOCK_KEY = 'pm_admin_gate_denied_until';
const STEP_LOCK_PREFIX = 'pm_admin_gate_step_lock_';
const ADMIN_DENY_LOCK_MS = 5 * 60 * 1000;
const STEP_LOCK_MS = 30 * 1000;

const state = {
  step: 1,
  ticket: '',
  timer: 0,
  busy: false,
  redirecting: false,
  detectedEmail: '',
  detectedToken: '',
  detectionSource: '',
  bootstrapTried: false,
  stepLockTimers: new Map()
};

const refs = {
  progress: document.getElementById('stepProgress'),
  steps: Array.from(document.querySelectorAll('.gate-step')),
  email: document.getElementById('adminEmail'),
  password: document.getElementById('adminPassword'),
  name: document.getElementById('adminName'),
  emailStatus: document.getElementById('emailStatus'),
  passwordStatus: document.getElementById('passwordStatus'),
  nameStatus: document.getElementById('nameStatus'),
  retryEmail: document.getElementById('retryEmail'),
  retryPassword: document.getElementById('retryPassword'),
  retryName: document.getElementById('retryName')
};

function now() { return Date.now(); }
function stepLockKey(step) { return `${STEP_LOCK_PREFIX}${Number(step) || 1}`; }
function safeSetLocal(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} }
function safeGetLocal(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
function safeRemoveLocal(key) { try { localStorage.removeItem(key); } catch (_) {} }

function setStatus(key, text, kind = '') {
  const el = refs[key];
  if (!el) return;
  el.textContent = text || '';
  el.className = `status${kind ? ` is-${kind}` : ''}`;
}

function controlsForStep(step) {
  if (Number(step) === 1) return [refs.email, refs.retryEmail];
  if (Number(step) === 2) return [refs.password, refs.retryPassword];
  if (Number(step) === 3) return [refs.name, refs.retryName];
  return [];
}

function disableStep(step, disabled = true) {
  controlsForStep(step).forEach((node) => {
    if (!node) return;
    node.disabled = !!disabled;
    node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  });
  if (Number(step) === 1 && refs.email) refs.email.readOnly = true;
}

function remainingStepLock(step) {
  const until = Number(safeGetLocal(stepLockKey(step)) || 0) || 0;
  return Math.max(0, until - now());
}

function statusKeyForStep(step) {
  if (Number(step) === 1) return 'emailStatus';
  if (Number(step) === 2) return 'passwordStatus';
  if (Number(step) === 3) return 'nameStatus';
  return 'emailStatus';
}

function applyStepLockCountdown(step, message = 'Tekrar denemeden önce kısa süre beklemelisin.') {
  const ms = remainingStepLock(step);
  const statusKey = statusKeyForStep(step);
  if (ms <= 0) {
    safeRemoveLocal(stepLockKey(step));
    disableStep(step, false);
    if (Number(step) === 1 && refs.email) refs.email.readOnly = true;
    setStatus(statusKey, 'Tekrar deneyebilirsin.', 'info');
    return false;
  }
  disableStep(step, true);
  const seconds = Math.ceil(ms / 1000);
  setStatus(statusKey, `${message} Kalan süre: ${seconds} sn`, 'error');
  window.clearTimeout(state.stepLockTimers.get(step));
  state.stepLockTimers.set(step, window.setTimeout(() => applyStepLockCountdown(step, message), 500));
  return true;
}

function lockStep(step, message = 'Tekrar denemeden önce kısa süre beklemelisin.') {
  safeSetLocal(stepLockKey(step), now() + STEP_LOCK_MS);
  applyStepLockCountdown(step, message);
}

function activateStep(step) {
  state.step = step;
  if (refs.progress) refs.progress.dataset.step = String(step);
  refs.steps.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === step));
  if (applyStepLockCountdown(step)) return;
  disableStep(step, false);
  if (Number(step) === 1 && refs.email) refs.email.readOnly = true;
  window.setTimeout(() => {
    if (step === 2) refs.password?.focus();
    if (step === 3) refs.name?.focus();
  }, 120);
}

function debounceRun(fn, wait = 140) {
  clearTimeout(state.timer);
  state.timer = window.setTimeout(fn, wait);
}

function getAuthBridge() {
  return window.PM_ADMIN_AUTH || null;
}

async function getFirebaseSessionIdentity() {
  const bridge = getAuthBridge();
  if (!bridge?.waitForReady) return { email: '', token: '', source: '', error: '' };
  try {
    const ready = await bridge.waitForReady();
    if (ready?.error) return { email: '', token: '', source: '', error: String(ready.error?.message || ready.error || '') };
    const user = bridge.getCurrentUser?.();
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) return { email: '', token: '', source: '', error: '' };
    const token = await bridge.getFreshToken(false).catch(() => '');
    return { email, token: String(token || '').trim(), source: 'firebase_session', error: '' };
  } catch (error) {
    return { email: '', token: '', source: '', error: String(error?.message || error || '') };
  }
}

async function tryBootstrapAdminSession(_idToken = '') {
  // Dashboard access is intentionally not bootstrapped from Firebase alone.
  // The full 4-step matrix gate must complete before /admin/admin.html opens.
  return null;
}

function denyAndRedirect(message = 'Bu oturum yönetici yetkisine sahip değil. Ana sayfaya yönlendiriliyorsun.') {
  safeSetLocal(ADMIN_DENY_LOCK_KEY, now() + ADMIN_DENY_LOCK_MS);
  clearSecurityKey();
  setStatus('emailStatus', message, 'error');
  state.redirecting = true;
  disableStep(1, true);
  window.setTimeout(() => window.location.replace(HOME_URL), 900);
}

function checkDenyLock() {
  const until = Number(safeGetLocal(ADMIN_DENY_LOCK_KEY) || 0) || 0;
  if (until <= now()) {
    safeRemoveLocal(ADMIN_DENY_LOCK_KEY);
    return false;
  }
  const seconds = Math.ceil((until - now()) / 1000);
  setStatus('emailStatus', `Admin paneli erişimi geçici olarak kilitli. Kalan süre: ${seconds} sn`, 'error');
  disableStep(1, true);
  state.redirecting = true;
  window.setTimeout(() => window.location.replace(HOME_URL), 950);
  return true;
}

async function resolveAdminIdentity() {
  const firebaseSession = await getFirebaseSessionIdentity();
  try {
    const identity = await adminFetch('/api/auth/admin/matrix/identity', {
      headers: firebaseSession.token ? { Authorization: `Bearer ${firebaseSession.token}` } : undefined
    });
    const email = String(identity?.user?.email || firebaseSession.email || '').trim().toLowerCase();
    return {
      ok: !!identity?.ok,
      admin: !!identity?.admin,
      email,
      token: firebaseSession.token,
      source: firebaseSession.token ? 'aktif oturum' : 'sunucu oturumu',
      role: identity?.adminContext?.role || '',
      contextSource: identity?.adminContext?.source || '',
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      admin: false,
      email: firebaseSession.email || '',
      token: firebaseSession.token,
      source: firebaseSession.source || '',
      role: '',
      contextSource: '',
      error: String(error?.message || error || '')
    };
  }
}

async function maybeResumeExistingSession() {
  try {
    const status = await adminFetch('/api/auth/admin/matrix/status');
    if (status?.clientKey) setSecurityKey(status.clientKey);
    if (status?.authenticated) {
      setStatus('emailStatus', 'Mevcut yönetici oturumu bulundu. Panel açılıyor...', 'ok');
      activateStep(4);
      state.redirecting = true;
      window.setTimeout(() => window.location.replace(DASHBOARD_URL), 520);
      return true;
    }
  } catch (_) {}
  return false;
}

async function verifyEmail() {
  if (state.busy || state.step !== 1 || state.redirecting || remainingStepLock(1) > 0) return;
  const email = String(refs.email?.value || '').trim().toLowerCase();
  if (!email.includes('@')) return denyAndRedirect('Aktif oturumda yönetici e-postası algılanamadı. Ana sayfaya yönlendiriliyorsun.');
  state.busy = true;
  setStatus('emailStatus', 'Yönetici hesabı otomatik doğrulanıyor...');
  try {
    const headers = state.detectedToken ? { Authorization: `Bearer ${state.detectedToken}` } : undefined;
    const out = await adminFetch('/api/auth/admin/matrix/step-email', { method: 'POST', headers });
    state.ticket = out.ticket || '';
    const roleLabel = out?.admin?.role ? ` • Rol: ${String(out.admin.role).toUpperCase()}` : '';
    setStatus('emailStatus', `Yönetici hesabı algılandı ve doğrulandı${roleLabel}`, 'ok');
    window.setTimeout(() => activateStep(2), 180);
  } catch (error) {
    if (/admin|required|yetki|forbidden|unauthorized|admin_required/i.test(String(error?.message || ''))) {
      return denyAndRedirect('Bu oturum yönetici hesabı değil. Ana sayfaya yönlendiriliyorsun.');
    }
    lockStep(1, 'Yönetici hesabı doğrulanamadı.');
  } finally { state.busy = false; }
}

async function autoDetectEmail(force = false) {
  if (state.busy || state.redirecting || checkDenyLock()) return;
  state.ticket = '';
  if (force) {
    state.bootstrapTried = false;
    state.detectedToken = '';
    clearSecurityKey();
  }
  if (refs.email) {
    refs.email.readOnly = true;
    refs.email.disabled = true;
    refs.email.placeholder = 'Oturumdan otomatik algılanıyor';
  }
  setStatus('emailStatus', 'Aktif oturumdaki yönetici hesabı algılanıyor...');
  const identity = await resolveAdminIdentity();
  if (!identity.email) return denyAndRedirect('Aktif oturumda yönetici hesabı algılanamadı. Ana sayfaya yönlendiriliyorsun.');
  state.detectedEmail = identity.email;
  state.detectedToken = identity.token || '';
  state.detectionSource = identity.source || 'oturum';
  refs.email.value = identity.email;
  if (!identity.admin) return denyAndRedirect('Algılanan oturum yönetici yetkisine sahip değil. Ana sayfaya yönlendiriliyorsun.');
  const roleLabel = identity.role ? ` • Rol: ${String(identity.role).toUpperCase()}` : '';
  const sourceLabel = identity.contextSource ? ` • Kaynak: ${identity.contextSource}` : '';
  setStatus('emailStatus', `Algılanan hesap: ${identity.email}${roleLabel}${sourceLabel}. Doğrulama başlatılıyor...`, 'ok');
  if (refs.email) refs.email.disabled = false;
  return verifyEmail();
}

async function verifyPassword() {
  if (state.busy || state.step !== 2 || !state.ticket || state.redirecting || remainingStepLock(2) > 0) return;
  const password = refs.password?.value || '';
  if (!password || password.length < 3) return setStatus('passwordStatus', 'Güvenlik şifresi bekleniyor...');
  state.busy = true;
  setStatus('passwordStatus', 'İkinci güvenlik katmanı doğrulanıyor...');
  try {
    const out = await adminFetch('/api/auth/admin/matrix/step-password', { method: 'POST', body: JSON.stringify({ ticket: state.ticket, password }) });
    state.ticket = out.ticket || '';
    setStatus('passwordStatus', 'Şifre doğrulandı.', 'ok');
    window.setTimeout(() => activateStep(3), 180);
  } catch (error) {
    refs.password.value = '';
    lockStep(2, 'Şifre doğrulanamadı.');
  } finally { state.busy = false; }
}

async function verifyName() {
  if (state.busy || state.step !== 3 || !state.ticket || state.redirecting || remainingStepLock(3) > 0) return;
  const adminName = refs.name?.value?.trim() || '';
  if (!adminName || adminName.length < 2) return setStatus('nameStatus', 'Yönetici adı bekleniyor...');
  state.busy = true;
  setStatus('nameStatus', 'Son güvenlik katmanı doğrulanıyor...');
  try {
    const out = await adminFetch('/api/auth/admin/matrix/step-name', { method: 'POST', body: JSON.stringify({ ticket: state.ticket, adminName }) });
    setSecurityKey(out.clientKey || '');
    setStatus('nameStatus', 'Güvenli yönetici oturumu başlatıldı. Panel açılıyor...', 'ok');
    state.redirecting = true;
    activateStep(4);
    window.setTimeout(() => window.location.replace(DASHBOARD_URL), 760);
  } catch (error) {
    refs.name.value = '';
    lockStep(3, 'Yönetici adı doğrulanamadı.');
  } finally { state.busy = false; }
}

refs.email?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && state.step === 1) {
    event.preventDefault();
    verifyEmail();
  }
});
refs.password?.addEventListener('input', () => debounceRun(verifyPassword, 160));
refs.name?.addEventListener('input', () => debounceRun(verifyName, 160));
refs.retryEmail?.addEventListener('click', () => {
  if (remainingStepLock(1) > 0) return applyStepLockCountdown(1);
  state.ticket = '';
  refs.email.value = '';
  setStatus('emailStatus', '');
  activateStep(1);
  autoDetectEmail(true);
});
refs.retryPassword?.addEventListener('click', () => {
  if (remainingStepLock(2) > 0) return applyStepLockCountdown(2);
  refs.password.value = '';
  setStatus('passwordStatus', '');
  activateStep(2);
  refs.password.focus();
});
refs.retryName?.addEventListener('click', () => {
  if (remainingStepLock(3) > 0) return applyStepLockCountdown(3);
  refs.name.value = '';
  setStatus('nameStatus', '');
  activateStep(3);
  refs.name.focus();
});

activateStep(1);
(async () => {
  if (checkDenyLock()) return;
  const resumed = await maybeResumeExistingSession();
  if (!resumed) await autoDetectEmail();
})();
