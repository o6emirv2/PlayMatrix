import { preventUserInterference, initMatrixRain, setSecurityKey, getSecurityKey, clearSecurityKey, adminFetch, resolveAdminUrl } from './matrix-core.js';

preventUserInterference();
initMatrixRain(document.getElementById('matrixCanvas'), { fontSize: 14 });

const state = {
  step: 1,
  ticket: '',
  timer: 0,
  busy: false,
  redirecting: false,
  detectedEmail: '',
  detectionSource: '',
  autoMode: true,
  bootstrapTried: false
};
const INDEX_URL = resolveAdminUrl('./index.html');
const DASHBOARD_URL = resolveAdminUrl('./admin.html');

const refs = {
  progress: document.getElementById('stepProgress'),
  steps: Array.from(document.querySelectorAll('.gate-step')),
  email: document.getElementById('adminEmail'),
  password: document.getElementById('adminPassword'),
  name: document.getElementById('adminName'),
  emailStatus: document.getElementById('emailStatus'),
  passwordStatus: document.getElementById('passwordStatus'),
  nameStatus: document.getElementById('nameStatus')
};

function activateStep(step) {
  state.step = step;
  refs.progress.dataset.step = String(step);
  refs.steps.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === step));
  window.setTimeout(() => {
    if (step === 1 && !state.autoMode) refs.email?.focus();
    if (step === 2) refs.password?.focus();
    if (step === 3) refs.name?.focus();
  }, 120);
}

function setStatus(key, text, kind = '') {
  const el = refs[key];
  if (!el) return;
  el.textContent = text || '';
  el.className = `status${kind ? ` is-${kind}` : ''}`;
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
    if (ready?.error) {
      return { email: '', token: '', source: '', error: String(ready.error?.message || ready.error || '') };
    }
    const user = bridge.getCurrentUser?.();
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) return { email: '', token: '', source: '', error: '' };
    const token = await bridge.getFreshToken(false).catch(() => '');
    return { email, token: String(token || '').trim(), source: 'firebase_session', error: '' };
  } catch (error) {
    return { email: '', token: '', source: '', error: String(error?.message || error || '') };
  }
}

async function tryBootstrapAdminSession(idToken = '') {
  const token = String(idToken || '').trim();
  if (!token || state.bootstrapTried) return null;
  state.bootstrapTried = true;
  try {
    return await adminFetch('/api/auth/admin/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (_) {
    return null;
  }
}

async function resolveAdminIdentity() {
  const firebaseSession = await getFirebaseSessionIdentity();
  if (firebaseSession.token) await tryBootstrapAdminSession(firebaseSession.token);

  const tryIdentity = async (token = '') => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return adminFetch('/api/auth/admin/matrix/identity', { headers });
  };

  try {
    const identity = await tryIdentity(firebaseSession.token);
    if (identity?.user?.email) {
      return {
        ok: !!identity?.ok,
        admin: !!identity?.admin,
        email: String(identity.user.email || '').trim().toLowerCase(),
        source: firebaseSession.token ? 'aktif oturum' : 'sunucu oturumu',
        role: identity?.adminContext?.role || '',
        contextSource: identity?.adminContext?.source || '',
        resolutionChain: Array.isArray(identity?.adminContext?.resolutionChain) ? identity.adminContext.resolutionChain : [],
        error: ''
      };
    }
  } catch (_) {}

  try {
    const session = await adminFetch('/api/auth/session/status');
    const email = String(session?.session?.email || '').trim().toLowerCase();
    if (session?.active && email) {
      return { ok: false, admin: false, email, source: 'uygulama oturumu', role: '', contextSource: '', resolutionChain: [], error: '' };
    }
  } catch (_) {}

  if (firebaseSession.email) {
    return { ok: false, admin: false, email: firebaseSession.email, source: 'firebase oturumu', role: '', contextSource: '', resolutionChain: [], error: firebaseSession.error || '' };
  }

  return { ok: false, admin: false, email: '', source: '', role: '', contextSource: '', resolutionChain: [], error: firebaseSession.error || '' };
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
  if (state.busy || state.step !== 1 || state.redirecting) return;
  const email = refs.email.value.trim().toLowerCase();
  if (!email.includes('@')) {
    return setStatus('emailStatus', 'Aktif oturumdan yönetici e-postası algılanamadı. Önce ana sayfada yönetici hesabıyla giriş yapın.', 'error');
  }
  state.busy = true;
  setStatus('emailStatus', 'Yönetici hesabı otomatik doğrulanıyor...');
  try {
    const out = await adminFetch('/api/auth/admin/matrix/step-email', { method: 'POST', body: JSON.stringify({ email }) });
    state.ticket = out.ticket || '';
    const roleLabel = out?.admin?.role ? ` • Rol: ${String(out.admin.role).toUpperCase()}` : '';
    setStatus('emailStatus', `Yönetici hesabı algılandı ve doğrulandı${roleLabel}`, 'ok');
    window.setTimeout(() => activateStep(2), 180);
  } catch (error) {
    const baseMessage = error.message || 'Yönetici hesabı doğrulanamadı.';
    setStatus('emailStatus', `${baseMessage} Yönetici hesabıyla açık oturumu doğrulayıp yeniden deneyin.`, 'error');
  } finally { state.busy = false; }
}

async function autoDetectEmail(force = false) {
  if (state.busy || state.redirecting) return;
  state.ticket = '';
  state.autoMode = true;
  refs.email.readOnly = true;
  if (force) {
    state.bootstrapTried = false;
    clearSecurityKey();
  }
  setStatus('emailStatus', 'Aktif oturumdaki yönetici hesabı algılanıyor...');
  const identity = await resolveAdminIdentity();
  if (!identity.email) {
    refs.email.value = '';
    const runtimeMessage = identity.error ? ` (${identity.error})` : '';
    return setStatus('emailStatus', `Aktif oturumdan yönetici e-postası algılanamadı. Önce ana sayfada giriş yapın ve tekrar deneyin.${runtimeMessage}`, 'error');
  }
  state.detectedEmail = identity.email;
  state.detectionSource = identity.source || 'oturum';
  refs.email.value = identity.email;
  if (!identity.admin) {
    return setStatus('emailStatus', `Algılanan hesap: ${identity.email} (${state.detectionSource}). Bu hesap için yönetici yetkisi doğrulanamadı.`, 'error');
  }
  const roleLabel = identity.role ? ` • Rol: ${String(identity.role).toUpperCase()}` : '';
  const sourceLabel = identity.contextSource ? ` • Kaynak: ${identity.contextSource}` : '';
  setStatus('emailStatus', `Algılanan hesap: ${identity.email}${roleLabel}${sourceLabel}. Doğrulama başlatılıyor...`, 'ok');
  return verifyEmail();
}

async function verifyPassword() {
  if (state.busy || state.step !== 2 || !state.ticket || state.redirecting) return;
  const password = refs.password.value;
  if (!password || password.length < 3) return setStatus('passwordStatus', 'Güvenlik şifresi bekleniyor...');
  state.busy = true;
  setStatus('passwordStatus', 'İkinci güvenlik katmanı doğrulanıyor...');
  try {
    const out = await adminFetch('/api/auth/admin/matrix/step-password', { method: 'POST', body: JSON.stringify({ ticket: state.ticket, password }) });
    state.ticket = out.ticket || '';
    setStatus('passwordStatus', 'Şifre doğrulandı.', 'ok');
    window.setTimeout(() => activateStep(3), 180);
  } catch (error) {
    setStatus('passwordStatus', error.message || 'Şifre doğrulanamadı.', 'error');
  } finally { state.busy = false; }
}

async function verifyName() {
  if (state.busy || state.step !== 3 || !state.ticket || state.redirecting) return;
  const adminName = refs.name.value.trim();
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
    setStatus('nameStatus', error.message || 'Yönetici adı doğrulanamadı.', 'error');
  } finally { state.busy = false; }
}

refs.password?.addEventListener('input', () => debounceRun(verifyPassword, 120));
refs.name?.addEventListener('input', () => debounceRun(verifyName, 120));
document.getElementById('retryEmail')?.addEventListener('click', () => {
  state.ticket = '';
  refs.email.value = '';
  setStatus('emailStatus', '');
  activateStep(1);
  autoDetectEmail(true);
});
document.getElementById('retryPassword')?.addEventListener('click', () => { refs.password.value = ''; setStatus('passwordStatus', ''); activateStep(2); refs.password.focus(); });
document.getElementById('retryName')?.addEventListener('click', () => { refs.name.value = ''; setStatus('nameStatus', ''); activateStep(3); refs.name.focus(); });

activateStep(1);
(async () => {
  const resumed = await maybeResumeExistingSession();
  if (!resumed) await autoDetectEmail();
})();
