import { loadFirebaseWebConfig } from '../../firebase-runtime.js';
import { HOME_GAMES, installGameRouteNormalizer, loadHomeMaintenanceState, isGameInMaintenance } from './game-catalog.js';
import { AVATAR_CATEGORIES, DEFAULT_AVATAR, AVATAR_FALLBACK, normalizeAvatarUrl } from '../../data/avatar-catalog.js';
import { createAvatarPicker } from '../profile/avatar-picker.js';
import { createFramePicker } from '../profile/frame-picker.js';
import { getModalMeta, modalDescription, modalIcon, modalLoadingText, modalTitle } from './modal/modal-registry.js';
import { normalizeUserFacingMessage, USER_MESSAGES } from './tools/message-map.js';

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeText = (value = '') => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
const safeMultilineText = (value = '') => String(value ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();
const RESERVED_USERNAMES = new Set(['admin','administrator','support','moderator','system','playmatrix','root','owner','official','staff','yonetici','yönetici','destek','sistem']);
const USERNAME_RULE_MESSAGE = 'Kullanıcı adı 5-20 karakter olmalı; harf, sayı, nokta (.), alt çizgi (_) ve tire (-) kullanılabilir.';
const PERSON_NAME_RULE_MESSAGE = 'İsim ve soyisim ayrı ayrı 3-50 karakter olmalı ve yalnızca Türkçe harflerden oluşmalı.';
const normalizeUsernameInput = (value = '') => safeText(value).replace(/\s+/g, '').slice(0, 20);
function usernameValidationState(value = '') {
  const raw = normalizeUsernameInput(value);
  if (raw.length < 5 || raw.length > 20) return { ok: false, message: USERNAME_RULE_MESSAGE };
  if (!/^[\p{L}\p{N}._-]+$/u.test(raw)) return { ok: false, message: USERNAME_RULE_MESSAGE };
  if (RESERVED_USERNAMES.has(raw.toLocaleLowerCase('tr-TR'))) return { ok: false, message: 'Bu kullanıcı adı sistem tarafından ayrılmıştır. Lütfen farklı bir kullanıcı adı seç.' };
  return { ok: true, username: raw, message: '' };
}
function isValidUsernameInput(value = '') { return usernameValidationState(value).ok; }
function isValidPersonNameInput(value = '') {
  const raw = safeText(value);
  return raw.length >= 3 && raw.length <= 50 && /^[\p{L}]{3,50}$/u.test(raw);
}
const money = (value = 0) => Math.max(0, Math.trunc(toNumber(value, 0))).toLocaleString('tr-TR');
const percent = (value = 0) => `${clamp(toNumber(value, 0), 0, 100).toFixed(1).replace('.0', '')}%`;
const fallbackAvatar = AVATAR_FALLBACK || DEFAULT_AVATAR || '';
const HOME_ASSET_VERSION = 'pmv2-final-home-ui-v20';
const HOME_GAME_IMAGE_FALLBACK = '/public/assets/images/logo.png';
function versionedPublicAsset(path = '') {
  const raw = safeText(path);
  if (!raw) return '';
  if (!raw.startsWith('/public/assets/')) return raw;
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}v=${encodeURIComponent(HOME_ASSET_VERSION)}`;
}
function gameImageUrl(game = {}) {
  const key = safeText(game.key || game.name).toLowerCase();
  const fixed = { crash:'/public/assets/home/games/crash.jpg', satranc:'/public/assets/home/games/chess.jpg', chess:'/public/assets/home/games/chess.jpg', pisti:'/public/assets/home/games/pisti.jpg', patternmaster:'/public/assets/home/games/pattern-master.jpg', pattern:'/public/assets/home/games/pattern-master.jpg', spacepro:'/public/assets/home/games/space-pro.jpg', space:'/public/assets/home/games/space-pro.jpg', snakepro:'/public/assets/home/games/snake-pro.jpg', snake:'/public/assets/home/games/snake-pro.jpg' };
  return versionedPublicAsset(fixed[key] || game.image || '');
}
function splitFullName(value = '') {
  const raw = safeText(value);
  if (!raw) return { firstName: '', lastName: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') || '' };
}
function joinName(firstName = '', lastName = '') {
  return [safeText(firstName), safeText(lastName)].filter(Boolean).join(' ').trim();
}
function isEmailVerifiedProfile(profile = currentProfile || {}) {
  return !!(profile?.emailVerified || profile?.emailVerifiedOverride || profile?.emailVerificationOverride || profile?.emailVerifiedByAdmin || auth?.currentUser?.emailVerified);
}
function requireVerifiedEmailForReward(area = 'ödül') {
  if (isEmailVerifiedProfile()) return true;
  const message = area === 'promo'
    ? 'Promo ödüllerinden yararlanmak için e-postanı doğrulaman gerekiyor.'
    : area === 'wheel'
      ? 'Çark ödüllerinden yararlanmak için e-postanı doğrulaman gerekiyor.'
      : 'Ödül alabilmek için önce e-posta adresini doğrulamalısın.';
  showToast('E-posta doğrulaması gerekli', message, 'warning');
  return false;
}

const PM_AUTH_REQUIRED_UID_KEY = 'pm_auth_required_uid';
function clearAuthRequiredLock() {
  try { sessionStorage.removeItem(PM_AUTH_REQUIRED_UID_KEY); } catch (_) {}
  try { localStorage.removeItem(PM_AUTH_REQUIRED_UID_KEY); } catch (_) {}
}
function isAuthProblem(payload = {}, status = 0) {
  const code = String(payload.code || payload.error || '').toUpperCase();
  if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') return 'auth';
  return '';
}

function markApiError(error, { path = '', status = 0, payload = {}, authProblem = '' } = {}) {
  error.status = status;
  error.payload = payload;
  error.endpoint = path;
  error.authProblem = authProblem;
  const code = String(payload?.error || payload?.code || error.message || '').toUpperCase();
  error.expectedAuthFlow = ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) || !!authProblem;
  return error;
}
function isExpectedSessionError(error = {}) {
  const code = String(error?.payload?.error || error?.payload?.code || error?.message || '').toUpperCase();
  return !!error?.expectedAuthFlow || ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code);
}
function setButtonBusy(button, busy, busyText = '') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleText) button.dataset.idleText = button.textContent || '';
    button.dataset.busy = 'true';
    button.disabled = true;
    if (busyText) button.textContent = busyText;
  } else {
    const idle = button.dataset.idleText || button.textContent || '';
    delete button.dataset.busy;
    button.disabled = false;
    if (idle) button.textContent = idle;
    delete button.dataset.idleText;
  }
}

function sleep(ms = 0) { return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0))); }


let initializeApp = null;
let getAuth = null;
let firebaseSetPersistence = null;
let firebaseLocalPersistence = null;
let firebaseSessionPersistence = null;
let onAuthStateChanged = null;
let signInWithEmailAndPassword = null;
let createUserWithEmailAndPassword = null;
let sendEmailVerification = null;
let sendPasswordResetEmail = null;
let signOutFirebase = null;
let firebaseGetIdToken = null;
let firebaseReload = null;
let firebaseReauthenticateWithCredential = null;
let firebaseEmailAuthProvider = null;
let firebaseUpdatePassword = null;
let firebaseUpdateProfile = null;
let firebaseApp = null;
let auth = { currentUser: null };
let firebaseReady = false;
let bootPromise = null;
let uiBooted = false;
let currentProfile = null;
let currentAuthMode = 'login';
let activeSheet = '';
let sheetReturnTarget = null;
let pmLockedScrollY = 0;
let pmBodyScrollLocked = false;
let pmBodyScrollTouchHandler = null;
let leaderboardPayload = null;
let leaderboardTab = 'level';
const LEADERBOARD_LIMIT = 20;
const HOME_LIVE_REFRESH_MS = 15 * 1000;
const LEADERBOARD_CACHE_MS = HOME_LIVE_REFRESH_MS;
let leaderboardLoadedAt = 0;
let leaderboardLoading = false;
let homeWinnersPayload = [];
let homeWinnersLoadedAt = 0;
let homeWinnersLoading = false;
const HOME_WINNERS_CACHE_MS = HOME_LIVE_REFRESH_MS;
let homeLiveRefreshTimer = 0;
let homeLiveRefreshPromise = null;
let homeLiveRefreshLifecycleBound = false;
let homeLiveRefreshLastAt = 0;
let notificationsLoaded = false;
let accountMemoryLoaded = false;
let gameFilter = 'all';
let gameSearch = '';
let avatarPicker = null;
let framePicker = null;
const DEFAULT_WHEEL_PRIZES = Object.freeze([1000000, 5000, 10000, 15000, 20000, 25000, 45000, 65000, 90000, 120000, 250000, 500000]);
let currentWheelPrizes = [...DEFAULT_WHEEL_PRIZES];
let heroCarouselIndex = 0;
let heroCarouselTimer = null;
let accountMemoryPayload = { transactions: [], games: [] };
let notificationPayload = { system: [], personal: [] };
let notificationSocket = null;
let notificationSocketScriptPromise = null;
let notificationFallbackTimer = 0;
let notificationSocketConnected = false;
let activeNotificationTab = 'system';
let activeHistoryCategory = 'transactions';

const SHEET_COPY = Object.freeze({
  login: [modalTitle('login'), modalDescription('login')],
  register: [modalTitle('register'), modalDescription('register')],
  auth: [modalTitle('login'), modalDescription('login')],
  forgot: [modalTitle('forgot'), modalDescription('forgot')],
  profile: [modalTitle('profile'), modalDescription('profile')],
  email: [modalTitle('email'), modalDescription('email')],
  password: [modalTitle('password'), modalDescription('password')],
  wheel: [modalTitle('wheel'), modalDescription('wheel')],
  promo: [modalTitle('promo'), modalDescription('promo')],
  market: [modalTitle('market'), modalDescription('market')],
  notifications: [modalTitle('notifications'), modalDescription('notifications')],
  stats: [modalTitle('stats'), modalDescription('stats')]
});

const SHEET_ICON = Object.freeze({
  login: modalIcon('login'),
  register: modalIcon('register'),
  auth: modalIcon('login'),
  forgot: modalIcon('forgot'),
  profile: modalIcon('profile'),
  email: modalIcon('email'),
  password: modalIcon('password'),
  wheel: modalIcon('wheel'),
  promo: modalIcon('promo'),
  market: modalIcon('market'),
  notifications: modalIcon('notifications'),
  stats: modalIcon('stats')
});

const PRELOAD_REQUIRED_SHEETS = new Set(['profile', 'email', 'password', 'wheel', 'promo', 'market', 'notifications']);
const PRELOAD_TEXT = Object.freeze({
  profile: modalLoadingText('profile'),
  email: modalLoadingText('email'),
  password: modalLoadingText('password'),
  wheel: modalLoadingText('wheel'),
  promo: modalLoadingText('promo'),
  market: modalLoadingText('market'),
  notifications: modalLoadingText('notifications'),
  avatar: modalLoadingText('avatar'),
  frame: modalLoadingText('frame'),
  stats: modalLoadingText('stats')
});
function initMainDesignSystem() {
  const root = document.documentElement;
  root.dataset.pmDesign = 'main';
  document.body?.setAttribute('data-design', 'main');
}

function report(scope, error, extra = {}) {
  try {
    const text = `${scope || ''} ${error?.name || ''} ${error?.message || error || ''}`.toLowerCase();
    const status = Number(error?.status || extra?.status || 0);
    const expectedNetwork = /aborterror|signal is aborted|fetch is aborted|load failed|network_error|failed to fetch|network-request-failed/.test(text);
    if (expectedNetwork && (scope === 'home.profile.load' || scope === 'home.market.load' || scope === 'home.leaderboard.load' || scope === 'home.wheel.recent')) return;
    if (status >= 400 && status < 500 && isExpectedSessionError(error)) return;
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, { source: 'home-runtime', category: 'home', ...extra });
    }
  } catch (_) {}
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = String(value ?? '');
}

function setValue(id, value) {
  const node = $(id);
  if (node) node.value = String(value ?? '');
}

function helpToastTitle(id = '') {
  const map = {
    authHelp: 'Hesap erişimi',
    forgotHelp: 'Şifre sıfırlama',
    wheelHelp: 'Günlük Çark',
    promoHelp: 'Promosyon Kodu',
    emailChangeHelp: 'E-posta Güvenliği',
    passwordChangeHelp: 'Şifre Değiştir',
    usernameHelp: 'Hesabım'
  };
  return map[id] || 'PlayMatrix';
}

function setHelp(id, message = '', tone = '') {
  const node = $(id);
  const cleanMessage = String(message ?? '').trim();
  const normalizedTone = String(tone || '').toLowerCase();
  const isToastOnly = ['error', 'success', 'warning', 'warn'].includes(normalizedTone);
  if (node) {
    node.textContent = isToastOnly ? '' : cleanMessage;
    node.classList.toggle('is-error', false);
    node.classList.toggle('is-success', false);
    node.classList.toggle('is-warning', false);
    node.classList.toggle('is-toast-routed', isToastOnly);
  }
  if (cleanMessage && isToastOnly) showToast(helpToastTitle(id), cleanMessage, normalizedTone === 'warn' ? 'warning' : normalizedTone);
}

function modalLoadingMarkup(text = 'Yükleniyor...') {
  const label = safeText(text || 'Veriler hazırlanıyor, lütfen bekleyin.');
  return `<div class="pm-modal-loading" role="status" aria-live="polite"><span class="pm-loading-orb" aria-hidden="true"><i></i></span><span class="pm-modal-loading-copy"><strong>Yükleniyor...</strong><span>${label}</span></span></div>`;
}
function setLoadingHTML(id, text = 'Yükleniyor...') {
  const node = $(id);
  if (node) node.innerHTML = modalLoadingMarkup(text);
}

function showSheetLoader(name = '', text = 'Yükleniyor...') {
  const safeName = String(name || '');
  const section = document.querySelector(`.sheet-section[data-sheet="${CSS.escape(safeName)}"]`);
  const shell = $('sheetShell');
  if (!section) return null;
  let overlay = section.querySelector(':scope > .pm-sheet-loader-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'pm-sheet-loader-overlay';
    section.appendChild(overlay);
  }
  overlay.innerHTML = modalLoadingMarkup(text);
  overlay.hidden = false;
  section.classList.add('pm-sheet-is-loading');
  shell?.classList.add('is-loading-only');
  shell?.setAttribute('data-loading-sheet', safeName);
  return overlay;
}
function hideSheetLoader(name = '') {
  const safeName = String(name || '');
  const section = document.querySelector(`.sheet-section[data-sheet="${CSS.escape(safeName)}"]`);
  const shell = $('sheetShell');
  if (!section) return;
  const overlay = section.querySelector(':scope > .pm-sheet-loader-overlay');
  if (overlay) overlay.hidden = true;
  section.classList.remove('pm-sheet-is-loading');
  if (!document.querySelector('.sheet-section.pm-sheet-is-loading')) {
    shell?.classList.remove('is-loading-only');
    shell?.removeAttribute('data-loading-sheet');
  }
}
function briefSheetLoader(name = '', text = 'Yükleniyor...', delay = 220) {
  showSheetLoader(name, text);
  window.setTimeout(() => hideSheetLoader(name), Math.max(180, Number(delay) || 220));
}

function setSheetIcon(name = '') {
  const icon = $('sheetIcon');
  if (!icon) return;
  const key = name === 'auth' ? (currentAuthMode === 'register' ? 'register' : 'login') : name;
  const safeIcon = SHEET_ICON[key] || modalIcon(key) || 'fa-layer-group';
  icon.innerHTML = `<i class="fa-solid ${safeIcon}" aria-hidden="true"></i>`;
}


function syncAuthHeader() {
  if (activeSheet !== 'auth') return;
  const key = currentAuthMode === 'register' ? 'register' : 'login';
  const meta = getModalMeta(key) || {};
  const shell = $('sheetShell');
  if (shell) {
    shell.dataset.modalKey = key;
    shell.dataset.modalSize = meta.size || (key === 'register' ? 'md' : 'sm');
  }
  setText('sheetTitle', meta.title || (currentAuthMode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'));
  setText('sheetSubtitle', meta.description || (currentAuthMode === 'register' ? 'Yeni hesabını oluştur.' : 'Hesabına güvenli şekilde giriş yap.'));
  setSheetIcon(key);
}

function showModalGateLoader(text = 'Yükleniyor...') {
  let overlay = $('pmModalGateLoader');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pmModalGateLoader';
    overlay.className = 'pm-modal-gate-loader';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = modalLoadingMarkup(text);
  overlay.hidden = false;
  window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
  return overlay;
}

function hideModalGateLoader() {
  const overlay = $('pmModalGateLoader');
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  window.setTimeout(() => { if (!overlay.classList.contains('is-visible')) overlay.hidden = true; }, 180);
}

async function preloadSheetData(name = '') {
  if (name === 'profile') {
    setAccountTab('profile');
    await Promise.all([loadProfile(), loadAccountMemory({ force: false })]);
    return;
  }
  if (name === 'email') { await loadProfile().catch((error) => report('home.email.preload', error)); syncEmailModalMode(); return; }
  if (name === 'password') { await loadProfile().catch((error) => report('home.password.preload', error)); return; }
  if (name === 'wheel') { setLoadingHTML('wheelPrizeList', PRELOAD_TEXT.wheel); await loadWheelConfig(); return; }
  if (name === 'market') { await loadMarket({ force: true }); return; }
  if (name === 'notifications') { setLoadingHTML('notificationList', PRELOAD_TEXT.notifications); await loadNotifications({ force: true }); await ensureNotificationRealtime().catch((error) => report('home.notifications.realtime.preload', error)); return; }
  if (name === 'promo') { await sleep(160); return; }
}

async function openSheetAfterPreload(name, title = '', subtitle = '') {
  const copy = SHEET_COPY[name] || [modalTitle(name), modalDescription(name)];
  const text = PRELOAD_TEXT[name] || modalLoadingText(name) || `${copy[0]} hazırlanıyor.`;
  showModalGateLoader(text);
  let ready = true;
  try {
    await preloadSheetData(name);
  } catch (error) {
    ready = false;
    report(`home.${name}.preload`, error);
    showToast(copy[0], userErrorText(error, `${copy[0]} şu anda yüklenemedi. Lütfen tekrar dene.`), 'error');
  } finally {
    hideModalGateLoader();
  }
  if (!ready) return null;
  return openSheet(name, title, subtitle, { skipPreload: true });
}

function userErrorText(error, fallback = 'İşlem tamamlanamadı.') {
  const code = String(error?.payload?.error || error?.code || error?.message || '').trim();
  const map = {
    AUTH_REQUIRED: 'Devam etmek için giriş yapman gerekiyor.',
    AUTH_INVALID: 'Devam etmek için giriş yapman gerekiyor.',
    USER_NOT_FOUND: 'Kullanıcı bulunamadı.',
    IDENTIFIER_REQUIRED: 'E-posta veya kullanıcı adı gerekli.',
    CODE_REQUIRED: 'Promo kodu gerekli.',
    CODE_INVALID: 'Doğrulama kodu hatalı veya süresi dolmuş.',
    EMAIL_INVALID: 'E-posta adresi geçersiz.',
    EMAIL_REQUIRED: 'E-posta adresi gerekli.',
    EMAIL_VERIFICATION_REQUIRED: 'Çark ve promo ödüllerinden yararlanmak için e-posta adresini doğrulaman gerekiyor.',
    EMAIL_CHANGE_LINK_SENT: 'E-posta güncelleme bağlantısı gönderildi.',
    EMAIL_CHANGE_LINK_FAILED: 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.',
    EMAIL_VERIFY_LINK_FAILED: 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.',
    EMAIL_LINK_DELIVERY_FAILED: 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.',
    EMAIL_TOO_MANY_ATTEMPTS: 'Çok fazla e-posta denemesi yapıldı. Bir süre sonra tekrar dene.',
    EMAIL_SAME_AS_CURRENT: 'Yeni e-posta mevcut e-posta adresinle aynı olamaz.',
    EMAIL_ALREADY_IN_USE: 'Bu e-posta başka bir hesapta kullanılıyor.',
    EMAIL_CONTINUE_URL_NOT_ALLOWED: 'E-posta bağlantısı alan adı ayarı nedeniyle gönderilemedi. Lütfen daha sonra tekrar dene.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Çok fazla e-posta denemesi yapıldı. Bir süre sonra tekrar dene.',
    EMAIL_VERIFY_LINK_SENT: 'E-posta doğrulama bağlantısı gönderildi.',
    USERNAME_CHANGE_LIMIT_REACHED: 'Kullanıcı adı değiştirme hakkın doldu.',
    USERNAME_TAKEN: 'Bu kullanıcı adı kullanılıyor.',
    INVALID_USERNAME: USERNAME_RULE_MESSAGE,
    INVALID_PERSON_NAME: PERSON_NAME_RULE_MESSAGE,
    USERNAME_CHECK_FAILED: 'Kullanıcı adı şu anda kontrol edilemedi. Lütfen tekrar dene.',
    PROMO_NOT_FOUND: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
    PROMO_INACTIVE: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
    PROMO_EXPIRED: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
    PROMO_LIMIT_REACHED: 'Bu promo kodunun kullanım limiti dolmuş.',
    PROMO_ALREADY_CLAIMED: 'Bu promo kodunu daha önce kullandın.',
    WHEEL_ALREADY_SPUN: 'Günlük çark hakkı kullanılmış.',
    WHEEL_ALREADY_CLAIMED_TODAY: 'Günlük çark hakkını bugün kullandın. Yarın 00:00’da tekrar gel.',
    INSUFFICIENT_BALANCE: 'Bakiye yetersiz.',
    MARKET_OFFLINE: 'Market şu anda çevrim dışı.',
    MARKET_ITEM_UNAVAILABLE: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
    ITEM_UNAVAILABLE: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
    ITEM_NOT_FOUND: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
    ADMIN_CONFIRM_REQUIRED: 'Bu kritik işlem için güvenlik doğrulaması gerekiyor.',
    firebase: 'İşlem tamamlanamadı.',
    'auth/invalid-credential': 'E-posta veya şifre hatalı.',
    'auth/user-not-found': 'Kullanıcı bulunamadı.',
    'auth/wrong-password': 'Şifre hatalı.',
    'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalıdır.',
    'auth/invalid-email': 'E-posta formatı geçersiz.',
    'auth/network-request-failed': 'Ağ bağlantısı kurulamadı.',
    'auth/requires-recent-login': 'Güvenlik için tekrar giriş yapıp işlemi yeniden dene.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.'
  };
  if (map[code]) return map[code];
  const mapped = normalizeUserFacingMessage(code, fallback);
  if (mapped && mapped !== fallback) return mapped;
  if (/^\d+$/.test(code)) return fallback;
  if (map[code.toUpperCase?.()]) return map[code.toUpperCase()];
  if (code.startsWith('auth/')) return map[code] || 'Hesap işlemi şu anda tamamlanamadı. Lütfen tekrar dene.';
  return normalizeUserFacingMessage(code, fallback);
}

function toastIconForTone(tone = 'info') {
  const normalized = String(tone || 'info').toLowerCase();
  const map = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-triangle-exclamation',
    warning: 'fa-solid fa-circle-exclamation',
    warn: 'fa-solid fa-circle-exclamation',
    info: 'fa-solid fa-circle-info',
    reward: 'fa-solid fa-gift',
    security: 'fa-solid fa-lock',
    market: 'fa-solid fa-store',
    loading: 'fa-solid fa-circle-notch',
    notification: 'fa-solid fa-bell',
    personal: 'fa-solid fa-bell',
    system: 'fa-solid fa-bullhorn',
    important: 'fa-solid fa-star',
    'level-up': 'fa-solid fa-ranking-star'
  };
  return map[normalized] || map.info;
}

function normalizeToastPayload(title = '', message = '', tone = 'info') {
  const rawTitle = safeText(title);
  const rawMessage = safeText(message);
  const combined = `${rawTitle} ${rawMessage}`.toLocaleLowerCase('tr-TR');
  const has = (needle) => combined.includes(String(needle).toLocaleLowerCase('tr-TR'));

  if (has('bildirim') && (has('okundu') || has('tamamı okundu'))) return { title: '', message: 'Bildirimler okundu.', tone: 'success' };
  if (has('bildirim') && (has('silindi') || has('temizlendi') || has('tamamı silindi'))) return { title: '', message: 'Bildirimler temizlendi.', tone: 'success' };
  if (has('market') && has('çevrim dışı')) return { title: '', message: 'Market şu anda çevrim dışı.', tone: 'warning' };

  const categoryOnlyTitles = new Set(['Bildirimler', 'Günlük Çark', 'Promo', 'Market', 'Hesabım', 'Avatar', 'Çerçeve', 'E-posta', 'Giriş Yap', 'Hesap erişimi', 'Kayıt', 'Kayıt Ol', 'Güvenli Çıkış']);
  const hasMessage = !!rawMessage;
  let nextTone = tone || 'info';
  const normalizedTone = String(nextTone).toLowerCase();
  const isFailure = ['error', 'warning', 'warn'].includes(normalizedTone);
  const canInferTone = normalizedTone === 'info' || normalizedTone === '';
  if (!isFailure && canInferTone && (has('mc') || has('ödül') || has('odul') || has('kazandı') || has('kazancin') || has('çark') || has('wheel'))) nextTone = 'reward';
  if (!isFailure && canInferTone && (has('şifre') || has('sifre') || has('e-posta') || has('eposta') || has('doğrulama') || has('güvenlik') || has('guvenlik'))) nextTone = 'security';
  if (!isFailure && canInferTone && has('market')) nextTone = 'market';
  return {
    title: hasMessage && categoryOnlyTitles.has(rawTitle) ? '' : rawTitle,
    message: hasMessage ? rawMessage : (rawTitle || 'İşlem tamamlandı.'),
    tone: nextTone
  };
}

let lastToastKey = '';
let lastToastAt = 0;

const PM_TOOL_NOTIFICATION_SOUND_SRC = '/public/assets/sounds/bildirimses.wav';
let pmToolNotificationAudio = null;
let pmToolNotificationSoundUnlocked = false;
const SOUND_ALLOWED_TYPES = new Set(['reward', 'important', 'system', 'system-announcement', 'level-up']);
const TOOLS_SOUND_COOLDOWN_MS = 2500;
let lastToolNotificationSoundAt = 0;

function getToolNotificationAudio() {
  if (pmToolNotificationAudio) return pmToolNotificationAudio;
  try {
    pmToolNotificationAudio = new Audio(PM_TOOL_NOTIFICATION_SOUND_SRC);
    pmToolNotificationAudio.preload = 'auto';
    pmToolNotificationAudio.volume = 0.78;
  } catch (_) {
    pmToolNotificationAudio = null;
  }
  return pmToolNotificationAudio;
}

function unlockToolNotificationSound() {
  const audio = getToolNotificationAudio();
  if (!audio || pmToolNotificationSoundUnlocked) return;
  pmToolNotificationSoundUnlocked = true;
  try {
    audio.load?.();
  } catch (_) {}
}

function shouldPlayToolNotificationSound(tone = 'info', context = {}) {
  const normalized = String(tone || 'info').toLowerCase();
  const text = `${context.title || ''} ${context.message || ''}`.toLocaleLowerCase('tr-TR');
  if (context.silent === true) return false;
  if (SOUND_ALLOWED_TYPES.has(normalized)) return true;
  if (normalized === 'security') return /güvenlik|guvenlik|şifre|sifre|e-posta|eposta|doğrulama|dogrulama|kritik/.test(text) && !/giriş yapıldı|oturum açıldı|hos geldin|hoş geldin/.test(text);
  return !!context.important;
}

function playToolNotificationSound(tone = 'info', context = {}) {
  if (!shouldPlayToolNotificationSound(tone, context)) return;
  const nowMs = Date.now();
  if (nowMs - lastToolNotificationSoundAt < TOOLS_SOUND_COOLDOWN_MS) return;
  lastToolNotificationSoundAt = nowMs;
  const audio = getToolNotificationAudio();
  if (!audio) return;
  try {
    const normalized = String(tone || 'info').toLowerCase();
    audio.volume = normalized === 'reward' ? 0.88 : normalized === 'system' || normalized === 'notification' ? 0.80 : 0.74;
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
  } catch (_) {}
}

function installToolNotificationSoundUnlock() {
  const unlock = () => unlockToolNotificationSound();
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((eventName) => {
    document.addEventListener(eventName, unlock, { once: true, passive: true });
  });
}

function showToast(title, message = '', tone = 'info') {
  const stack = $('toastStack');
  if (!stack) return;
  const normalized = normalizeToastPayload(title, message, tone);
  const safeTone = normalized.tone || 'info';
  const isPositiveTone = ['success', 'reward', 'market', 'security', 'level-up', 'notification', 'personal', 'system', 'important'].includes(String(safeTone).toLowerCase());
  let cleanTitle = isPositiveTone ? safeText(normalized.title || '') : normalizeUserFacingMessage(normalized.title, '');
  let mainMessage = isPositiveTone ? safeText(normalized.message || 'İşlem tamamlandı.') : normalizeUserFacingMessage(normalized.message || 'İşlem tamamlandı.', 'İşlem tamamlandı.');
  const combined = `${cleanTitle} ${mainMessage}`.toLocaleLowerCase('tr-TR');
  const titleLooksLikeFailure = /tamamlanamadı|başarısız|hata|geçersiz|bulunamadı|yüklenemedi|doğrulanamadı|failed|error/.test(String(cleanTitle || '').toLocaleLowerCase('tr-TR'));
  const messageLooksLikeSuccess = /başarıyla|tamamlandı|giriş yapıldı|oturum açıldı|oluşturuldu|kaydedildi|gönderildi|hoş geldin|çıkış yapıldı/.test(String(mainMessage || '').toLocaleLowerCase('tr-TR'));
  const looksLikeFailure = /tamamlanamadı|başarısız|hata|geçersiz|bulunamadı|yüklenemedi|doğrulanamadı|failed|error/.test(combined);
  const looksLikeSuccess = /başarıyla|tamamlandı|giriş yapıldı|oturum açıldı|oluşturuldu|kaydedildi|gönderildi|hoş geldin|çıkış yapıldı/.test(combined);
  if (messageLooksLikeSuccess && titleLooksLikeFailure) cleanTitle = '';
  if (String(safeTone).toLowerCase() === 'success' && looksLikeFailure && !looksLikeSuccess) {
    cleanTitle = 'İşlem tamamlanamadı';
    mainMessage = normalizeUserFacingMessage(mainMessage, 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
  }
  if (String(safeTone).toLowerCase() !== 'success' && looksLikeSuccess && !looksLikeFailure) {
    mainMessage = safeText(mainMessage);
  }
  const toastKey = `${safeTone}|${cleanTitle}|${mainMessage}`;
  const nowMs = Date.now();
  if (toastKey === lastToastKey && nowMs - lastToastAt < 4000) return;
  lastToastKey = toastKey;
  lastToastAt = nowMs;

  while (stack.children.length >= 3) stack.firstElementChild?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast pm-toast';
  toast.dataset.tone = safeTone;
  toast.setAttribute('role', safeTone === 'error' ? 'alert' : 'status');

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<i class="${toastIconForTone(safeTone)}"></i>`;

  const copy = document.createElement('span');
  copy.className = 'toast-copy';
  if (cleanTitle) {
    const strong = document.createElement('strong');
    strong.textContent = cleanTitle;
    copy.appendChild(strong);
  }
  const span = document.createElement('span');
  span.textContent = mainMessage;
  copy.appendChild(span);

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Bildirimi kapat');
  close.innerHTML = '<i class="fa-solid fa-xmark"></i>';

  const removeToast = () => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  };
  close.addEventListener('click', removeToast);

  toast.append(icon, copy, close);
  stack.appendChild(toast);
  playToolNotificationSound(safeTone, { title: cleanTitle, message: mainMessage });
  window.requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(removeToast, safeTone === 'error' ? 5600 : 4200);
}

function cleanupBodyScrollLock(options = {}) {
  const body = document.body;
  const html = document.documentElement;
  if (!body || !html) return;
  const restoreY = Number.isFinite(Number(options.restoreY)) ? Number(options.restoreY) : pmLockedScrollY;
  if (pmBodyScrollTouchHandler) document.removeEventListener('touchmove', pmBodyScrollTouchHandler, { capture: true });
  pmBodyScrollTouchHandler = null;
  pmBodyScrollLocked = false;
  body.classList.remove('pm-body-scroll-locked', 'pm-sheet-open', 'pm-modal-open', 'pm-any-modal-open');
  html.classList.remove('pm-body-scroll-locked');
  ['position', 'top', 'left', 'right', 'width', 'height', 'overflow', 'overscrollBehavior', 'touchAction'].forEach((prop) => { body.style[prop] = ''; });
  ['overflow', 'overscrollBehavior', 'touchAction', 'height'].forEach((prop) => { html.style[prop] = ''; });
  window.setTimeout(() => {
    try { window.scrollTo(0, Math.max(0, restoreY || 0)); } catch (_) {}
  }, options.defer ? 40 : 0);
}

function hasOpenMatrixModal() {
  return !!document.querySelector('.ps-modal.active,.ps-modal.is-open,.pm-market-confirm-modal.active,.pm-market-confirm-modal.is-open');
}

function lockBody(locked) {
  const body = document.body;
  const html = document.documentElement;
  if (!body || !html) return;
  const shouldLock = !!locked;
  body.classList.toggle('pm-sheet-open', shouldLock && !!activeSheet);
  body.classList.toggle('pm-modal-open', shouldLock && !activeSheet);
  body.classList.toggle('pm-any-modal-open', shouldLock);
  html.classList.toggle('pm-body-scroll-locked', shouldLock);
  if (shouldLock && !pmBodyScrollLocked) {
    pmLockedScrollY = window.scrollY || window.pageYOffset || 0;
    pmBodyScrollLocked = true;
    body.classList.add('pm-body-scroll-locked');
    body.style.position = 'fixed';
    body.style.top = `-${pmLockedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    pmBodyScrollTouchHandler = (event) => {
      const target = event.target;
      const scrollable = target && target.closest && target.closest('.sheet-content,.ps-modal-body,.avatar-picker-scroll,.frame-picker-scroll,.pm-market-confirm-body,[data-scroll-lock-allow="true"]');
      if (!scrollable) event.preventDefault();
    };
    document.addEventListener('touchmove', pmBodyScrollTouchHandler, { passive: false, capture: true });
  } else if (!shouldLock) {
    if (activeSheet || hasOpenMatrixModal()) return;
    cleanupBodyScrollLock({ defer: true });
  }
}

function openMatrixModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.add('active', 'is-open');
  modal.setAttribute('aria-hidden', 'false');
  lockBody(true);
}

function closeMatrixModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.remove('active', 'is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (!hasOpenMatrixModal() && !activeSheet) cleanupBodyScrollLock({ defer: true });
}

function showInfo(title, message, tone = 'info') {
  // Kullanıcı bilgilendirmeleri modal içine yazılmaz; tamamı global tools/toast mesaj sistemiyle gösterilir.
  showToast(normalizeUserFacingMessage(title || 'PlayMatrix', 'PlayMatrix'), normalizeUserFacingMessage(message || 'İşlem tamamlandı.', 'İşlem tamamlandı.'), tone || 'info');
}


const MARKET_FRAME_ASSET_COUNT = 32;
function resolveMarketFramePath(value = '', fallback = '') {
  const raw = safeText(value || fallback || '').replace(/\\/g, '/');
  if (!raw) return '';
  const direct = raw.match(/^\/?public\/assets\/market\/frames\/market[-_]?0*(\d{1,3})\.(png|webp|jpg|jpeg|svg)$/i);
  const idMatch = direct || raw.match(/market(?:[-_]?frame)?[-_]?0*(\d{1,3})(?:\D|$)/i) || raw.match(/(?:^|[-_])0*(\d{1,3})(?:\.(?:png|webp|jpg|jpeg|svg))?$/i);
  const frameNo = idMatch ? Math.trunc(Number(idMatch[1]) || 0) : 0;
  if (frameNo >= 1 && frameNo <= MARKET_FRAME_ASSET_COUNT) return `/public/assets/market/frames/market-${frameNo}.png`;
  return '';
}
function resolveProfileMarketFramePath(user = {}) {
  const slot = user.cosmeticSlots && typeof user.cosmeticSlots === 'object' ? user.cosmeticSlots.frame : null;
  const marketFrameId = safeText(user.marketFrameId || user.marketEquipped?.frame || user.equippedMarket?.frame || user.marketEquipped?.frames || user.equippedMarket?.frames || (slot?.source === 'market' ? slot?.itemId : '') || '');
  if (!marketFrameId) return '';
  return resolveMarketFramePath(user.marketFrameUrl || user.frameUrl || user.marketEquipped?.frameUrl || user.equippedMarket?.frameUrl || '', marketFrameId);
}
function resolveProfileBalance(user = {}, raw = {}) {
  const sources = [
    user.balance,
    user.mc,
    user.mcBalance,
    user.balanceMc,
    user.mc_balance,
    user.money,
    user.wallet?.balance,
    user.wallet?.mc,
    user.wallet?.mcBalance,
    user.wallet?.balanceMc,
    user.economy?.balance,
    user.economy?.mc,
    user.economy?.mcBalance,
    user.economy?.balanceMc,
    user.statistics?.balance,
    user.statistics?.mc,
    user.stats?.balance,
    user.stats?.mc,
    raw.balance,
    raw.mc,
    raw.mcBalance,
    raw.balanceMc,
    raw.user?.balance,
    raw.user?.mc,
    raw.user?.mcBalance,
    raw.user?.balanceMc,
    raw.profile?.balance,
    raw.profile?.mc,
    raw.profile?.mcBalance,
    raw.profile?.balanceMc,
    raw.wallet?.balance,
    raw.wallet?.mc,
    raw.economy?.balance,
    raw.economy?.mc
  ];
  const numbers = sources.map((item) => toNumber(item, NaN)).filter((n) => Number.isFinite(n));
  const positive = numbers.find((n) => n > 0);
  const selected = positive !== undefined ? positive : (numbers.length ? numbers[0] : 0);
  return Math.max(0, Math.trunc(selected));
}
function compactHeaderMc(value = 0) {
  const n = Math.max(0, Math.trunc(toNumber(value, 0)));
  const full = money(n);
  const fullVisibleLimit = 50000000000000; // 50.000.000.000.000 MC üst bar standardı.
  if (n <= fullVisibleLimit) return { full, compact: full, mode: 'full' };
  const trim = (num) => {
    const rounded = Math.round(num * 10) / 10;
    return String(rounded).replace(/\.0$/, '').replace('.', ',');
  };
  if (n >= 1000000000000000) return { full, compact: `${trim(n / 1000000000000000)}O`, mode: 'compact' };
  if (n >= 1000000000000) return { full, compact: `${trim(n / 1000000000000)}T`, mode: 'compact' };
  if (n >= 1000000000) return { full, compact: `${trim(n / 1000000000)}B`, mode: 'compact' };
  if (n >= 1000000) return { full, compact: `${trim(n / 1000000)}M`, mode: 'compact' };
  if (n >= 1000) return { full, compact: `${trim(n / 1000)}K`, mode: 'compact' };
  return { full, compact: String(n), mode: 'full' };
}

const MOBILE_NAV_GUEST = Object.freeze([
  { label: 'Oyunlar', icon: 'fa-gamepad', link: '#games' },
  { label: 'Liderlik', icon: 'fa-ranking-star', link: '#leaderboard' },
  { label: 'Giriş Yap', icon: 'fa-right-to-bracket', action: 'login', center: true },
  { label: 'Kazananlar', icon: 'fa-trophy', link: '#homeRecentWinners' },
  { label: 'Promosyon', icon: 'fa-ticket', action: 'heroPromo' }
]);
const MOBILE_NAV_AUTH = Object.freeze([
  { label: 'Oyunlar', icon: 'fa-gamepad', link: '#games' },
  { label: 'Liderlik', icon: 'fa-ranking-star', link: '#leaderboard' },
  { label: 'Rastgele', icon: 'fa-shuffle', action: 'randomGame', center: true },
  { label: 'Çark', icon: 'fa-dharmachakra', action: 'wheel' },
  { label: 'Promo', icon: 'fa-ticket', action: 'promo' }
]);
function createMobileNavButton(item = {}) {
  const button = document.createElement('button');
  button.className = `mobile-tab${item.center ? ' mobile-tab--center' : ''}`;
  button.type = 'button';
  button.dataset.mobileAction = item.action || '';
  button.dataset.mobileLink = item.link || '';
  button.innerHTML = `<i class="fa-solid ${item.icon || 'fa-circle'}" aria-hidden="true"></i><span>${safeText(item.label || 'Menü')}</span>`;
  return button;
}
function syncMobileNavigation() {
  const nav = $('mobileBottomNav') || document.querySelector('.mobile-nav--final');
  if (!nav) return;
  const signed = !!auth.currentUser || document.body.classList.contains('is-authenticated');
  const nextState = signed ? 'auth' : 'guest';
  if (nav.dataset.mobileNavState === nextState && nav.children.length === 5) return;
  nav.dataset.mobileNavState = nextState;
  const spec = signed ? MOBILE_NAV_AUTH : MOBILE_NAV_GUEST;
  nav.replaceChildren(...spec.map(createMobileNavButton));
  const center = nav.querySelector('.mobile-tab--center');
  if (center) center.classList.add('is-active');
}
function randomActiveGame() {
  const games = HOME_GAMES.filter((game) => game && game.url && game.access !== 'disabled');
  if (!games.length) return null;
  return games[Math.floor(Math.random() * games.length)] || games[0];
}
function handleMobileNavButton(button) {
  if (!button) return;
  const link = button.dataset.mobileLink || '';
  const action = button.dataset.mobileAction || '';
  $$('.mobile-nav--final .mobile-tab').forEach((tab) => tab.classList.toggle('is-active', tab === button));
  if (link) { scrollToHomeTarget(link); return; }
  if (action === 'login') { setAuthMode('login'); openSheet('auth'); return; }
  if (action === 'heroPromo') { scrollToHomeTarget('#homeHeroSection'); return; }
  if (action === 'profile') { ensureAuthThen('Profil') && openSheet('profile'); return; }
  if (action === 'wheel') { openWheelIfAvailable(); return; }
  if (action === 'promo') { openPromoIfAvailable(); return; }
  if (action === 'randomGame') {
    const game = randomActiveGame();
    if (game) openGame(game);
  }
}

function mountAvatar(host, { avatar = '', frame = 0, frameUrl = '', marketFrameId = '', frameKey = '', variant = '', size = 52, extraClass = '', topbar = false, useCurrentProfile = false } = {}) {
  const node = typeof host === 'string' ? $(host) : host;
  if (!node) return;
  const fallbackProfile = useCurrentProfile ? currentProfile : null;
  const safeAvatar = normalizeAvatarUrl(avatar || fallbackProfile?.avatar || fallbackAvatar, fallbackAvatar);
  const selectedMarketFrameId = safeText(marketFrameId || fallbackProfile?.marketFrameId || fallbackProfile?.marketEquipped?.frame || fallbackProfile?.equippedMarket?.frame || fallbackProfile?.marketEquipped?.frames || fallbackProfile?.equippedMarket?.frames || '');
  const rawFrameUrl = frameUrl || fallbackProfile?.marketFrameUrl || fallbackProfile?.frameUrl || '';
  const selectedFrameUrl = selectedMarketFrameId ? resolveMarketFramePath(rawFrameUrl, selectedMarketFrameId) : (/\/public\/assets\/market\/frames\//i.test(String(rawFrameUrl || '')) ? resolveMarketFramePath(rawFrameUrl, '') : '');
  const selectedFrame = selectedFrameUrl ? 0 : Math.max(0, Math.trunc(toNumber(frame ?? fallbackProfile?.selectedFrame, 0)));
  const renderVariant = variant || (topbar ? 'homeTopbar' : selectedFrameUrl ? 'marketCard' : 'accountProfileCard');
  try {
    if (window.PMAvatar && typeof window.PMAvatar.mount === 'function') {
      window.PMAvatar.mount(node, {
        avatarUrl: safeAvatar,
        level: selectedFrame,
        exactFrameIndex: selectedFrame > 0 && window.PMAvatar.getFrameAssetIndex ? window.PMAvatar.getFrameAssetIndex(selectedFrame) : 0,
        frameUrl: selectedFrameUrl,
        frameType: selectedFrameUrl ? 'market' : 'level',
        frameId: selectedFrameUrl ? selectedMarketFrameId : (selectedFrame > 0 && window.PMAvatar.getFrameAssetIndex ? `frame-${window.PMAvatar.getFrameAssetIndex(selectedFrame)}` : ''),
        marketFrameId: selectedMarketFrameId,
        frameKey: frameKey || (selectedFrameUrl && selectedMarketFrameId ? `market:${selectedMarketFrameId}` : (selectedFrame > 0 && window.PMAvatar.getFrameAssetIndex ? `level:frame-${window.PMAvatar.getFrameAssetIndex(selectedFrame)}` : 'none')),
        variant: renderVariant,
        sizePx: size,
        extraClass,
        wrapperClass: 'pm-avatar',
        imageClass: 'pm-avatar-img'
      });
      return;
    }
  } catch (error) {
    report('home.avatar.mount', error);
  }
  node.replaceChildren();
  const img = document.createElement('img');
  img.src = safeAvatar;
  img.alt = '';
  img.draggable = false;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
  node.appendChild(img);
}


function hasNameEffect(profile = {}) {
  return !!safeText(profile.nameEffectId || profile.nameEffectClass || profile.marketEquipped?.nameEffect || profile.equippedMarket?.nameEffect || profile.marketEquipped?.['animated-name-effects'] || profile.equippedMarket?.['animated-name-effects'] || '');
}
function hasStatsTheme(profile = {}) {
  return !!safeText(profile.statsCardThemeId || profile.statsCardThemeClass || profile.marketEquipped?.statTheme || profile.equippedMarket?.statTheme || profile.marketEquipped?.['stats-card-themes'] || profile.equippedMarket?.['stats-card-themes'] || '');
}
function hasProfileBadge(profile = {}) {
  return !!safeText(profile.profileBadgeId || profile.profileBadgeUrl || profile.profileBadgeClass || profile.marketEquipped?.badge || profile.equippedMarket?.badge || profile.marketEquipped?.badges || profile.equippedMarket?.badges || '');
}
function applyNameEffectToNode(node, profile = {}) {
  const el = typeof node === 'string' ? $(node) : node;
  if (!el) return;
  const active = hasNameEffect(profile);
  el.classList.toggle('pm-name-effect-active', active);
  el.dataset.pmNameEffect = active ? 'true' : 'false';
}
function applyStatsThemeToNode(node, profile = {}) {
  const el = typeof node === 'string' ? $(node) : node;
  if (!el) return;
  const active = hasStatsTheme(profile);
  el.classList.toggle('pm-market-stat-theme-matrix-gold', active);
  el.dataset.pmStatsTheme = active ? 'true' : 'false';
}
function createProfileBadgeNode(profile = {}, size = 'sm', extraClass = '') {
  if (!hasProfileBadge(profile)) return null;
  const badge = document.createElement('span');
  badge.className = `pm-profile-market-badge pm-profile-market-badge--${size} ${extraClass}`.trim();
  badge.setAttribute('aria-hidden', 'true');
  badge.dataset.pmSingleBadge = 'true';
  const url = safeText(profile.profileBadgeUrl || '');
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.draggable = false;
    badge.appendChild(img);
  } else {
    badge.innerHTML = '<i class="fa-solid fa-certificate"></i>';
  }
  return badge;
}
function mountProfileBadge(target, profile = {}, size = 'sm') {
  const host = typeof target === 'string' ? $(target) : target;
  if (!host) return;
  host.querySelectorAll('.pm-profile-market-badge').forEach((node) => node.remove());
  host.classList.remove('has-market-badge');
  const badge = createProfileBadgeNode(profile, size);
  if (!badge) return;
  host.classList.add('has-market-badge');
  host.appendChild(badge);
}
function mountInlineProfileBadge(target, profile = {}, size = 'xs') {
  const name = typeof target === 'string' ? $(target) : target;
  if (!name) return;
  const parent = name.parentElement;
  const old = parent ? Array.from(parent.querySelectorAll(':scope > .pm-inline-market-badge')).filter((node) => node.dataset.forName === (name.id || name.dataset.pmUserName || name.textContent || 'name')) : [];
  old.forEach((node) => node.remove());
  if (!hasProfileBadge(profile) || !parent) return;
  const badge = createProfileBadgeNode(profile, size, 'pm-inline-market-badge');
  if (!badge) return;
  badge.dataset.forName = name.id || name.dataset.pmUserName || name.textContent || 'name';
  name.insertAdjacentElement('afterend', badge);
}
function clearProfileBadges(target) {
  const host = typeof target === 'string' ? $(target) : target;
  if (!host) return;
  host.querySelectorAll('.pm-profile-market-badge,.pm-inline-market-badge').forEach((node) => node.remove());
  host.classList.remove('has-market-badge');
}

function applyProfileMarketVisuals(profile = currentProfile || blankProfile()) {
  ['headerUsername','ddUsername','heroProfileName','profileSheetName'].forEach((id) => {
    applyNameEffectToNode(id, profile);
    mountInlineProfileBadge(id, profile, id === 'headerUsername' || id === 'ddUsername' ? 'xs' : 'sm');
  });
  ['profileStatsCard','accountMemoryPanel'].forEach((id) => applyStatsThemeToNode(id, profile));
  ['topbarAvatarShell','heroProfileAvatarShell','profileSheetAvatarShell','appearancePreviewShell'].forEach(clearProfileBadges);
}

function normalizeProfile(raw = {}) {
  const user = raw.user || raw.profile || raw.data || raw || {};
  const progression = user.progression || {};
  const accountLevel = Math.max(1, Math.trunc(toNumber(user.accountLevel ?? user.level ?? progression.level, 1)));
  const progressPercent = clamp(toNumber(user.progressPercent ?? user.accountLevelProgressPct ?? progression.progressPercent, 0), 0, 100);
  const nameParts = splitFullName(user.fullName || user.name || '');
  const firstName = safeText(user.firstName || user.givenName || nameParts.firstName);
  const lastName = safeText(user.lastName || user.familyName || nameParts.lastName);
  const email = safeText(user.email || auth.currentUser?.email || '');
  const rawUsername = safeText(user.username || user.displayName || auth.currentUser?.displayName || '');
  const username = rawUsername && !rawUsername.includes('@') ? rawUsername : 'Oyuncu';
  const fullName = safeText(user.fullName || user.name || joinName(firstName, lastName));
  const usernameChangeLimit = Math.max(0, Math.trunc(toNumber(user.usernameChangeLimit ?? 3, 3)));
  const usernameChangesUsed = Math.max(0, Math.trunc(toNumber(user.usernameChangesUsed ?? user.usernameChangeCount ?? 0, 0)));
  const frameSlot = user.cosmeticSlots && typeof user.cosmeticSlots === 'object' ? user.cosmeticSlots.frame : null;
  const avatarSlot = user.cosmeticSlots && typeof user.cosmeticSlots === 'object' ? user.cosmeticSlots.avatar : null;
  const marketAvatarUrl = safeText(user.marketAvatarUrl || user.selectedAvatar || user.marketEquipped?.avatarUrl || user.equippedMarket?.avatarUrl || '');
  const marketFrameId = safeText(user.marketFrameId || user.marketEquipped?.frame || user.equippedMarket?.frame || user.marketEquipped?.frames || user.equippedMarket?.frames || (frameSlot?.source === 'market' ? frameSlot?.itemId : '') || '');
  const marketFrameUrl = marketFrameId ? resolveProfileMarketFramePath(user) : '';
  const activeAvatar = avatarSlot?.source === 'market' && marketAvatarUrl ? marketAvatarUrl : (user.avatar || user.photoURL || marketAvatarUrl || fallbackAvatar);
  return {
    uid: safeText(user.uid || auth.currentUser?.uid || ''),
    email,
    dateOfBirth: safeText(user.dateOfBirth || ''),
    age: Math.max(0, Math.trunc(toNumber(user.age || ageFromDateOfBirth(user.dateOfBirth || ''), 0))),
    ageVerified: !!(user.ageVerified && user.dateOfBirth) || (!!user.dateOfBirth && ageFromDateOfBirth(user.dateOfBirth) >= 16),
    ageLocked: !!user.ageLocked,
    firstName,
    lastName,
    fullName,
    username,
    avatar: normalizeAvatarUrl(activeAvatar, fallbackAvatar),
    marketAvatarUrl,
    selectedAvatar: safeText(user.selectedAvatar || ''),
    selectedFrame: marketFrameUrl ? 0 : Math.max(0, Math.trunc(toNumber(user.selectedFrame ?? user.frame, 0))),
    marketFrameUrl,
    frameUrl: marketFrameUrl,
    marketFrameId,
    profileBackgroundUrl: safeText(user.profileBackgroundUrl || ''),
    profileBadgeId: safeText(user.profileBadgeId || user.marketEquipped?.badge || user.equippedMarket?.badge || ''),
    profileBadgeUrl: safeText(user.profileBadgeUrl || ''),
    nameEffectId: safeText(user.nameEffectId || user.marketEquipped?.nameEffect || user.equippedMarket?.nameEffect || ''),
    nameEffectClass: safeText(user.nameEffectClass || ''),
    statsCardThemeId: safeText(user.statsCardThemeId || user.marketEquipped?.statTheme || user.equippedMarket?.statTheme || ''),
    statsCardThemeUrl: safeText(user.statsCardThemeUrl || ''),
    gameTableThemeId: safeText(user.gameTableThemeId || ''),
    gameTableThemeUrl: safeText(user.gameTableThemeUrl || ''),
    marketEquipped: user.marketEquipped && typeof user.marketEquipped === 'object' ? { ...user.marketEquipped } : {},
    equippedMarket: user.equippedMarket && typeof user.equippedMarket === 'object' ? { ...user.equippedMarket } : {},
    balance: resolveProfileBalance(user, raw),
    accountXp: Math.max(0, Math.trunc(toNumber(user.accountXp ?? user.xp ?? progression.xp, 0))),
    accountLevel,
    progressPercent,
    xpToNextLevel: Math.max(0, Math.trunc(toNumber(user.xpToNextLevel ?? progression.xpToNextLevel, 0))),
    monthlyActiveScore: Math.max(0, Math.trunc(toNumber(user.monthlyActiveScore ?? user.monthlyActivity ?? 0, 0))),
    totalGames: Math.max(0, Math.trunc(toNumber(user.totalGames ?? user.gamesPlayed ?? 0, 0))),
    wins: Math.max(0, Math.trunc(toNumber(user.wins ?? user.winCount ?? 0, 0))),
    losses: Math.max(0, Math.trunc(toNumber(user.losses ?? user.lossCount ?? 0, 0))),
    draws: Math.max(0, Math.trunc(toNumber(user.draws ?? user.drawCount ?? 0, 0))),
    createdAt: toNumber(user.createdAt ?? user.registeredAt ?? user.signupAt ?? 0, 0),
    lastActiveAt: toNumber(user.lastActiveAt ?? user.lastSeen ?? user.lastLogin ?? user.updatedAt ?? 0, 0),
    lifetimeMcUsed: Math.max(0, Math.trunc(toNumber(user.lifetimeMcUsed ?? user.totalMcUsed ?? user.totalMcSpent ?? user.mcUsed ?? user.mcSpent ?? 0, 0))),
    winRate: Math.max(0, Math.min(100, toNumber(user.winRate ?? user.winRatePct ?? 0, 0))),
    crashWinRate: Math.max(0, Math.min(100, toNumber(user.crashWinRate ?? user.crashWinRatePct ?? 0, 0))),
    chessWinRate: Math.max(0, Math.min(100, toNumber(user.chessWinRate ?? user.chessWinRatePct ?? 0, 0))),
    pistiWinRate: Math.max(0, Math.min(100, toNumber(user.pistiWinRate ?? user.pistiWinRatePct ?? 0, 0))),
    snakeBestScore: Math.max(0, Math.trunc(toNumber(user.snakeBestScore ?? user.snakeHighScore ?? 0, 0))),
    spaceBestScore: Math.max(0, Math.trunc(toNumber(user.spaceBestScore ?? user.spaceHighScore ?? 0, 0))),
    patternBestScore: Math.max(0, Math.trunc(toNumber(user.patternBestScore ?? user.patternHighScore ?? 0, 0))),
    patternBestLevel: Math.max(0, Math.trunc(toNumber(user.patternBestLevel ?? user.patternHighestLevel ?? 0, 0))),
    patternBestCombo: Math.max(0, Math.trunc(toNumber(user.patternBestCombo ?? user.patternMaxCombo ?? 0, 0))),
    leaderboardRank: Math.max(0, Math.trunc(toNumber(user.leaderboardRank ?? user.rank, 0))),
    nextLevelXp: Math.max(0, Math.trunc(toNumber(user.nextLevelXp ?? progression.nextLevelXp, 0))),
    currentLevelStartXp: Math.max(0, Math.trunc(toNumber(user.currentLevelStartXp ?? progression.currentLevelStartXp, 0))),
    emailVerified: !!(user.emailVerified ?? user.email_verified ?? user.emailVerifiedOverride ?? user.emailVerificationOverride ?? auth.currentUser?.emailVerified),
    emailVerifiedOverride: !!(user.emailVerifiedOverride || user.emailVerificationOverride || user.emailVerifiedByAdmin),
    usernameChangeLimit,
    usernameChangesUsed,
    usernameChangesLeft: Math.max(0, usernameChangeLimit - usernameChangesUsed)
  };
}

function blankProfile() {
  return normalizeProfile({ username: 'Oturum Kapalı', avatar: fallbackAvatar, accountLevel: 1, balance: 0, progressPercent: 0 });
}

const FIREBASE_SDK_CANDIDATES = Object.freeze([
  Object.freeze({ version: '10.12.2', app: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', auth: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', compatApp: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', compatAuth: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js' }),
  Object.freeze({ version: '10.12.5', app: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js', auth: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js', compatApp: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js', compatAuth: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js' }),
  Object.freeze({ version: '10.13.2', app: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js', auth: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js', compatApp: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js', compatAuth: 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js' })
]);

function withTimeout(promise, timeoutMs, label = 'ASYNC_TIMEOUT') {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(label)), Math.max(1500, Number(timeoutMs) || 6500));
    })
  ]).finally(() => window.clearTimeout(timer));
}

function loadClassicScriptOnce(src, timeoutMs = 7500) {
  return new Promise((resolve, reject) => {
    const normalized = String(src || '').trim();
    if (!normalized) { reject(new Error('SCRIPT_SRC_MISSING')); return; }
    const existing = document.querySelector(`script[data-pm-sdk-src="${normalized}"]`);
    if (existing?.dataset.loaded === 'true') { resolve(existing); return; }
    if (existing) {
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', () => reject(new Error(`SCRIPT_LOAD_FAILED:${normalized}`)), { once: true });
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
      reject(new Error(`SCRIPT_TIMEOUT:${normalized}`));
    }, Math.max(2500, Number(timeoutMs) || 7500));
    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      script.dataset.loaded = 'true';
      resolve(script);
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      reject(new Error(`SCRIPT_LOAD_FAILED:${normalized}`));
    }, { once: true });
    document.head.appendChild(script);
  });
}

async function importHesapModuleSdk(timeoutMs = 7500) {
  let lastError = null;
  for (const candidate of FIREBASE_SDK_CANDIDATES) {
    try {
      const [appModule, authModule] = await withTimeout(Promise.all([
        import(/* @vite-ignore */ candidate.app),
        import(/* @vite-ignore */ candidate.auth)
      ]), timeoutMs, `FIREBASE_MODULE_TIMEOUT:${candidate.version}`);
      if (!appModule?.initializeApp || !authModule?.getAuth) throw new Error(`FIREBASE_MODULE_CONTRACT:${candidate.version}`);
      return { appModule, authModule, mode: 'module', version: candidate.version };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('FIREBASE_MODULE_IMPORT_FAILED');
}

async function importHesapCompatSdk(timeoutMs = 8500) {
  let lastError = null;
  for (const candidate of FIREBASE_SDK_CANDIDATES) {
    try {
      await loadClassicScriptOnce(candidate.compatApp, timeoutMs);
      await loadClassicScriptOnce(candidate.compatAuth, timeoutMs);
      const firebase = window.firebase;
      if (!firebase?.initializeApp || !firebase?.auth) throw new Error(`FIREBASE_COMPAT_CONTRACT:${candidate.version}`);
      const appModule = {
        initializeApp(config) {
          return firebase.apps?.length ? firebase.apps[0] : firebase.initializeApp(config);
        }
      };
      const authModule = {
        getAuth(app) { return firebase.auth(app); },
        onAuthStateChanged(authRef, next, error) { return authRef.onAuthStateChanged(next, error); },
        setPersistence(authRef, persistence) { return authRef.setPersistence(persistence); },
        browserLocalPersistence: firebase.auth.Auth.Persistence.LOCAL,
        browserSessionPersistence: firebase.auth.Auth.Persistence.SESSION,
        signInWithEmailAndPassword(authRef, email, password) { return authRef.signInWithEmailAndPassword(email, password); },
        createUserWithEmailAndPassword(authRef, email, password) { return authRef.createUserWithEmailAndPassword(email, password); },
        sendEmailVerification(user) { return user.sendEmailVerification(); },
        sendPasswordResetEmail(authRef, email) { return authRef.sendPasswordResetEmail(email); },
        signOut(authRef) { return authRef.signOut(); },
        getIdToken(user, force) { return user.getIdToken(!!force); },
        reload(user) { return user.reload(); },
        updatePassword(user, password) { return user.updatePassword(password); },
        reauthenticateWithCredential(user, credential) { return user.reauthenticateWithCredential(credential); },
        EmailAuthProvider: firebase.auth.EmailAuthProvider
      };
      return { appModule, authModule, mode: 'compat', version: candidate.version };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('FIREBASE_COMPAT_LOAD_FAILED');
}

async function importHesapSdk(timeoutMs = 7500) {
  try {
    return await importHesapModuleSdk(timeoutMs);
  } catch (moduleError) {
    try {
      return await importHesapCompatSdk(timeoutMs + 1000);
    } catch (compatError) {
      compatError.moduleError = moduleError;
      throw compatError;
    }
  }
}

async function bootFirebase(options = {}) {
  if (firebaseReady) return true;
  if (bootPromise) return bootPromise;
  const shouldReport = options.reportOnError !== false;
  bootPromise = (async () => {
    try {
      const config = await loadFirebaseWebConfig({ required: false, scope: 'home', timeoutMs: 4200 });
      if (!config) return false;
      const { appModule, authModule, mode, version } = await importHesapSdk(options.timeoutMs || 7500);
      initializeApp = appModule.initializeApp;
      getAuth = authModule.getAuth;
      firebaseSetPersistence = authModule.setPersistence || null;
      firebaseLocalPersistence = authModule.browserLocalPersistence || authModule.indexedDBLocalPersistence || null;
      firebaseSessionPersistence = authModule.browserSessionPersistence || null;
      onAuthStateChanged = authModule.onAuthStateChanged;
      signInWithEmailAndPassword = authModule.signInWithEmailAndPassword;
      createUserWithEmailAndPassword = authModule.createUserWithEmailAndPassword;
      sendEmailVerification = authModule.sendEmailVerification;
      sendPasswordResetEmail = authModule.sendPasswordResetEmail;
      signOutFirebase = authModule.signOut;
      firebaseGetIdToken = authModule.getIdToken;
      firebaseReload = authModule.reload;
      firebaseReauthenticateWithCredential = authModule.reauthenticateWithCredential;
      firebaseEmailAuthProvider = authModule.EmailAuthProvider;
      firebaseUpdatePassword = authModule.updatePassword;
      firebaseUpdateProfile = authModule.updateProfile;
      firebaseApp = initializeApp(config);
      auth = getAuth(firebaseApp);
      await applyStoredFirebaseAuthPersistence().catch((error) => report('home.auth.persistence.restore', error, { severity: 'warning' }));
      const rememberedLogin = rememberFlagFromStoredPersistence();
      const rememberInput = document.getElementById('loginRememberMe');
      if (rememberInput) rememberInput.checked = rememberedLogin;
      window.__PM_RUNTIME = window.__PM_RUNTIME || {};
      window.__PM_RUNTIME.auth = auth;
      window.__PM_RUNTIME.firebaseSdkMode = mode;
      window.__PM_RUNTIME.firebaseSdkVersion = version;
      firebaseReady = true;
      return true;
    } catch (error) {
      firebaseReady = false;
      if (shouldReport) {
        report('home.firebase.boot', error, {
          reason: 'SDK modül yüklemesi ve compat yedek yükleme akışı başarısız oldu.',
          solution: 'CDN erişimi, domain izinleri ve PUBLIC_FIREBASE_* Render ENV değerleri kontrol edilmeli.'
        });
      }
      return false;
    } finally {
      bootPromise = null;
    }
  })();
  return bootPromise;
}

async function getToken(force = false) {
  await bootFirebase({ reportOnError: true });
  if (!auth.currentUser || !firebaseGetIdToken) throw new Error('AUTH_REQUIRED');
  return firebaseGetIdToken(auth.currentUser, force);
}

let backendSessionSyncPromise = null;
async function syncBackendSession(forceToken = false, rememberOverride = null) {
  if (!auth?.currentUser) return null;
  if (backendSessionSyncPromise && !forceToken) return backendSessionSyncPromise;
  backendSessionSyncPromise = (async () => {
    const token = await getToken(!!forceToken);
    const api = window.__PM_API__;
    if (api?.ensureApiBase) await api.ensureApiBase();
    const url = api?.buildUrl ? api.buildUrl('/api/auth/session') : '/api/auth/session';
    const remember = typeof rememberOverride === 'boolean' ? rememberOverride : rememberFlagFromStoredPersistence();
    const response = await fetch(url, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-PlayMatrix-Client': 'home-session' },
      body: JSON.stringify({ remember, persistence: remember ? 'local' : 'session' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw markApiError(new Error('SESSION_SYNC_FAILED'), { path:'/api/auth/session', status:response.status, payload });
    return payload.data || payload;
  })().finally(() => { backendSessionSyncPromise = null; });
  return backendSessionSyncPromise;
}
async function clearBackendSession() {
  try {
    const api = window.__PM_API__;
    if (api?.ensureApiBase) await api.ensureApiBase();
    const url = api?.buildUrl ? api.buildUrl('/api/auth/session') : '/api/auth/session';
    await fetch(url, { method:'DELETE', credentials:'include', cache:'no-store', headers:{ Accept:'application/json', 'X-PlayMatrix-Client':'home-session' } });
  } catch (_) {}
}

async function apiFetch(path, options = {}, needsAuth = true, sessionRetry = true) {
  const api = window.__PM_API__;
  if (api?.ensureApiBase) await api.ensureApiBase();
  const url = api?.buildUrl ? api.buildUrl(path) : `${String(window.__PLAYMATRIX_API_URL__ || '').replace(/\/+$/, '')}${path}`;
  const { timeoutMs = 9000, signal, headers: optionHeaders, ...fetchOptions } = options || {};
  const headers = new Headers(optionHeaders || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (needsAuth) headers.set('Authorization', `Bearer ${await getToken(!!options.forceAuthToken)}`);
  if (!headers.has('X-PlayMatrix-Client')) headers.set('X-PlayMatrix-Client', 'home');
  if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', window.__PM_API__?.requestId?.('home') || `home_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(2500, Number(timeoutMs) || 9000));
  let response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...fetchOptions,
      headers,
      signal: signal || controller.signal,
      body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } finally {
    window.clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  const authProblem = isAuthProblem(payload, response.status);
  if (!response.ok || payload?.ok === false) {
    throw markApiError(new Error(payload?.error || `HTTP_${response.status}`), { path, status: response.status, payload, authProblem });
  }
  return payload;
}

async function loadProfile() {
  if (!auth.currentUser) {
    currentProfile = blankProfile();
    renderProfile();
    return currentProfile;
  }
  try {
    const payload = await apiFetch('/api/me', {}, true);
    currentProfile = normalizeProfile(payload);
  } catch (error) {
    if (!isExpectedSessionError(error)) report('home.profile.load', error, { endpoint: error.endpoint || '/api/me', status: error.status || 0 });
    currentProfile = normalizeProfile({ uid: auth.currentUser.uid, email: auth.currentUser.email, username: auth.currentUser.displayName || 'Oyuncu', emailVerified: auth.currentUser.emailVerified });
  }
  renderProfile();
  return currentProfile;
}

function setProfileMetaChips(profile = blankProfile()) {
  const node = $('profileSheetMeta');
  if (!node) return;
  const displayIdentity = joinName(profile.firstName, profile.lastName) || profile.fullName || 'İsim soyisim tamamlanmalı';
  const chips = [
    displayIdentity,
    `Bakiye: ${money(profile.balance)} MC`,
    `Seviye ${profile.accountLevel}`
  ].filter(Boolean);
  node.replaceChildren(...chips.map((text) => {
    const chip = document.createElement('span');
    chip.className = 'profile-meta-chip';
    chip.textContent = text;
    return chip;
  }));
}

function renderProfile() {
  const p = currentProfile || blankProfile();
  const signed = !!auth.currentUser;
  document.body.classList.toggle('is-authenticated', signed);
  syncMobileNavigation();
  const notificationOpen = $('notificationOpenBtn');
  if (notificationOpen) {
    notificationOpen.classList.toggle('is-visible', signed);
    notificationOpen.hidden = !signed;
    notificationOpen.setAttribute('aria-hidden', signed ? 'false' : 'true');
  }
  const headerMc = compactHeaderMc(p.balance);
  setText('headerBalance', headerMc.compact);
  const headerBalanceShell = document.querySelector('.pm-topbar-balance');
  if (headerBalanceShell) {
    headerBalanceShell.title = `${headerMc.full} MC`;
    headerBalanceShell.setAttribute('aria-label', `MC bakiyesi: ${headerMc.full} MC`);
    headerBalanceShell.dataset.fullBalance = `${headerMc.full} MC`;
    headerBalanceShell.dataset.balanceMode = headerMc.mode;
  }
  document.body.classList.toggle('pm-balance-compact', headerMc.mode === 'compact');
  const headerBalanceNode = $('headerBalance');
  if (headerBalanceNode) {
    headerBalanceNode.title = `${headerMc.full} MC`;
    headerBalanceNode.dataset.fullBalance = `${headerMc.full} MC`;
    headerBalanceNode.dataset.balanceMode = headerMc.mode;
  }
  setText('headerUsername', p.username || 'Oyuncu');
  setText('headerRankText', `Hesap Seviyesi ${p.accountLevel}`);
  setText('ddUsername', p.username || 'Oyuncu');
  setText('ddEmail', p.email || 'E-posta bilgisi yok');
  setText('ddLevel', p.accountLevel);
  setText('ddPct', percent(p.progressPercent));
  setText('ddNext', p.xpToNextLevel ? `${money(p.xpToNextLevel)} XP sonra yeni seviye.` : 'Seviye verisi güncel.');
  const ddBar = $('ddBar'); if (ddBar) ddBar.style.width = percent(p.progressPercent);
  setText('heroProfileName', signed ? p.username : 'Oturum Kapalı');
  setText('heroProfileMeta', signed ? `Bakiye: ${money(p.balance)} MC · ${p.emailVerified ? 'E-posta doğrulandı' : 'E-posta doğrulaması bekleniyor'} · Seviye ${p.accountLevel}` : 'Giriş yaparak bakiye, seviye ve profil bilgilerini görüntüle.');
  setText('heroProgressText', percent(p.progressPercent));
  const hp = $('heroProgressFill'); if (hp) hp.style.width = percent(p.progressPercent);
  setText('ui-account-level', p.accountLevel);
  setText('ui-monthly-activity', p.monthlyActiveScore);
  setText('profileSheetName', p.username || 'Oyuncu');
  setProfileMetaChips(p);
  setText('profileProgressText', percent(p.progressPercent));
  const pp = $('profileProgressFill'); if (pp) pp.style.width = percent(p.progressPercent);
  const firstLocked = !!safeText(p.firstName || '') && !!safeText(p.lastName || '');
  setValue('profileFirstName', p.firstName || splitFullName(p.fullName).firstName || '');
  setValue('profileLastName', p.lastName || splitFullName(p.fullName).lastName || '');
  ['profileFirstName','profileLastName'].forEach((id) => {
    const input = $(id);
    if (input) {
      input.readOnly = firstLocked;
      input.disabled = firstLocked;
      input.classList.toggle('is-locked', firstLocked);
    }
  });
  setText('fullNameLockHelp', firstLocked ? 'İsim ve soyisim ilk kayıt sonrası sabitlenir.' : 'İsim ve soyisim zorunludur; kaydedildikten sonra değiştirilemez.');
  setValue('profileUsername', p.username || '');
  setValue('profileEmail', p.email || '');
  const emailInput = $('profileEmail'); if (emailInput) { emailInput.readOnly = true; emailInput.disabled = true; emailInput.classList.add('is-locked'); }
  setDobFields('profile', p.dateOfBirth || '');
  lockDobFields('profile', !!p.dateOfBirth);
  syncDobSummary('profile');
  setText('profileDobHelp', p.dateOfBirth ? `Doğum tarihi kayıtlı: ${String(p.dateOfBirth).slice(8,10)}.${String(p.dateOfBirth).slice(5,7)}.${String(p.dateOfBirth).slice(0,4)} · Yaş: ${p.age || ageFromDateOfBirth(p.dateOfBirth)}` : 'Eski hesaplarda doğum tarihi eklenene kadar oyun, market, çark ve promo kilitlenir.');
  setValue('emailCurrentValue', p.email || '');
  setText('accountEmailSecurityText', p.emailVerified ? 'E-posta doğrulandı. E-posta değiştirme akışını güvenli bağlantıyla başlatabilirsin.' : 'E-posta doğrulanmadı. Ödül ve güvenlik işlemleri için doğrulama bağlantısı gönder.');
  setText('profileUsernameQuota', `Kullanıcı adı değişim hakkı: ${Math.max(0, p.usernameChangesLeft ?? 0)}/${Math.max(0, p.usernameChangeLimit ?? 3)}`);
  const usernameInput = $('profileUsername');
  if (usernameInput) {
    const lockedUsername = Math.max(0, p.usernameChangesLeft ?? 0) <= 0 && !!safeText(p.username);
    usernameInput.disabled = lockedUsername;
    usernameInput.readOnly = lockedUsername;
    usernameInput.classList.toggle('is-locked', lockedUsername);
  }
  const emailSecurityBtn = $('openEmailChangeBtnSecurity');
  if (emailSecurityBtn) emailSecurityBtn.textContent = p.emailVerified ? 'E-posta Değiştir' : 'Doğrulama Bağlantısı Gönder';
  mountAvatar('topbarAvatarShell', { avatar: p.avatar, frame: 0, frameUrl: '', marketFrameId: '', variant: 'homeTopbar', size: 40, topbar: true, extraClass: 'pm-avatar--home-topbar', useCurrentProfile: false });
  mountAvatar('heroProfileAvatarShell', { avatar: p.avatar, frame: p.selectedFrame, frameUrl: p.marketFrameUrl, marketFrameId: p.marketFrameId, variant: 'accountProfileCard', size: 78, extraClass: 'pm-avatar--profile' });
  mountAvatar('profileSheetAvatarShell', { avatar: p.avatar, frame: p.selectedFrame, frameUrl: p.marketFrameUrl, marketFrameId: p.marketFrameId, variant: 'accountModal', size: 68, extraClass: 'pm-avatar--profile' });
  mountAvatar('appearancePreviewShell', { avatar: p.avatar, frame: p.selectedFrame, frameUrl: p.marketFrameUrl, marketFrameId: p.marketFrameId, variant: 'accountProfileCard', size: 78, extraClass: 'pm-avatar--profile' });
  applyProfileMarketVisuals(p);
  framePicker?.updateActiveSelection?.();
  renderGames();
}

function displayDateTime(value) {
  const n = Number(value || 0);
  if (!n) return 'Kayıt yok';
  try { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(n)); } catch (_) { return new Date(n).toLocaleString('tr-TR'); }
}

function statItems(profile = currentProfile || blankProfile()) {
  const totalGames = Math.max(0, Math.trunc(toNumber(profile.totalGames, 0)));
  const wins = Math.max(0, Math.trunc(toNumber(profile.wins, 0)));
  const losses = Math.max(0, Math.trunc(toNumber(profile.losses, 0)));
  const draws = Math.max(0, Math.trunc(toNumber(profile.draws, 0)));
  const success = totalGames > 0 ? Math.round((wins / totalGames) * 1000) / 10 : Math.max(0, Math.min(100, toNumber(profile.winRate, 0)));
  const verified = !!profile.emailVerified;
  return {
    account: [
      { label: 'Seviye + İlerleme', value: `Seviye ${profile.accountLevel || 1} · ${percent(profile.progressPercent)}`, hint: 'Animasyonlu hesap ilerleme oranı', icon: 'fa-layer-group', tone: 'blue' },
      { label: 'XP', value: money(profile.accountXp), hint: 'Toplam deneyim puanı', icon: 'fa-star', tone: 'gold' },
      { label: 'Sonraki Seviye', value: profile.xpToNextLevel ? `${money(profile.xpToNextLevel)} XP` : 'Maksimum', hint: 'Bir sonraki seviyeye kalan XP', icon: 'fa-arrow-trend-up', tone: 'violet' },
      { label: 'Aylık Aktiflik', value: money(profile.monthlyActiveScore), hint: 'Aylık ödül sıralaması puanı', icon: 'fa-bolt', tone: 'orange' },
      { label: 'Kullanılan Toplam MC', value: `${money(profile.lifetimeMcUsed)} MC`, hint: 'Kayıttan beri kullanılan toplam MC', icon: 'fa-coins', tone: 'cyan' },
      { label: 'Hesap Açılma Tarihi', value: displayDateTime(profile.createdAt), hint: 'Profilin oluşturulduğu tarih', icon: 'fa-calendar-plus', tone: 'blue' },
      { label: 'Son Aktiflik', value: displayDateTime(profile.lastActiveAt), hint: 'Son görülen tarih ve saat', icon: 'fa-clock-rotate-left', tone: 'violet' },
      { label: 'Doğrulama', value: verified ? '✓ Doğrulandı' : '✕ Bekliyor', hint: verified ? 'E-posta doğrulanmış' : 'Ödüller için doğrulama gerekli', icon: verified ? 'fa-circle-check' : 'fa-circle-xmark', tone: verified ? 'green' : 'orange' }
    ],
    performance: [
      { label: 'Toplam Oyun', value: money(totalGames), hint: 'Kayıtlı oyun sayısı', icon: 'fa-gamepad', tone: 'blue' },
      { label: 'Galibiyet', value: money(wins), hint: 'Toplam kazanılan maç', icon: 'fa-trophy', tone: 'gold' },
      { label: 'Mağlubiyet', value: money(losses), hint: 'Toplam kaybedilen maç', icon: 'fa-shield-halved', tone: 'red' },
      { label: 'Beraberlik', value: money(draws), hint: 'Beraber biten maçlar', icon: 'fa-handshake', tone: 'cyan' },
      { label: 'Başarı Oranı', value: `%${success}`, hint: 'Galibiyet / toplam oyun', icon: 'fa-percent', tone: 'green' },
      { label: 'Crash Kazanç Oranı', value: `%${toNumber(profile.crashWinRate, 0).toFixed(1).replace('.0','')}`, hint: 'Crash sonucu başarı yüzdesi', icon: 'fa-chart-line', tone: 'orange' },
      { label: 'Satranç Kazanç Oranı', value: `%${toNumber(profile.chessWinRate, 0).toFixed(1).replace('.0','')}`, hint: 'Satranç maç başarısı', icon: 'fa-chess-knight', tone: 'violet' },
      { label: 'Pişti Kazanç Oranı', value: `%${toNumber(profile.pistiWinRate, 0).toFixed(1).replace('.0','')}`, hint: 'Pişti maç başarısı', icon: 'fa-diamond', tone: 'cyan' },
      { label: 'Snake Pro En Yüksek Skor', value: money(profile.snakeBestScore), hint: 'Güvenli kayıtlı rekor', icon: 'fa-worm', tone: 'green' },
      { label: 'Space Pro En Yüksek Skor', value: money(profile.spaceBestScore), hint: 'Güvenli kayıtlı rekor', icon: 'fa-rocket', tone: 'blue' },
      { label: 'Pattern Master En Yüksek Skor', value: money(profile.patternBestScore), hint: `Level ${money(profile.patternBestLevel)} · Kombo ${money(profile.patternBestCombo)}`, icon: 'fa-grip', tone: 'gold' }
    ]
  };
}

function createStatCard(item, className = 'stat-card stat-card--pro') {
  const card = document.createElement('article');
  card.className = `${className} stat-tone-${item.tone || 'blue'}`;
  const iconWrap = document.createElement('span');
  iconWrap.className = 'stat-card-icon';
  const icon = document.createElement('i');
  icon.className = `fa-solid ${item.icon || 'fa-chart-line'}`;
  iconWrap.appendChild(icon);
  const copy = document.createElement('span');
  copy.className = 'stat-card-copy';
  const label = document.createElement('span');
  label.className = 'stat-card-label';
  label.textContent = item.label;
  const value = document.createElement('b');
  value.className = 'stat-card-value';
  value.textContent = String(item.value ?? '—');
  const hint = document.createElement('small');
  hint.className = 'stat-card-hint';
  hint.textContent = item.hint || '';
  copy.append(label, value, hint);
  card.append(iconWrap, copy);
  return card;
}

function buildStatsSection(title, icon, items, className = 'stat-card stat-card--pro') {
  const section = document.createElement('section');
  section.className = 'stats-pro-section';
  const head = document.createElement('div');
  head.className = 'stats-pro-section-head';
  const badge = document.createElement('span');
  badge.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  head.append(badge, strong);
  const grid = document.createElement('div');
  grid.className = 'stats-pro-section-grid';
  items.forEach((item) => grid.appendChild(createStatCard(item, className)));
  section.append(head, grid);
  return section;
}

function renderStatsDashboard(host, profile = currentProfile || blankProfile()) {
  if (!host) return;
  const items = statItems(profile);
  const shell = document.createElement('div');
  shell.className = 'stats-pro-dashboard stats-pro-dashboard--v2';

  const identity = document.createElement('section');
  identity.className = 'stats-pro-identity-card';
  const avatarHost = document.createElement('span');
  avatarHost.className = 'stats-pro-identity-avatar pm-avatar-host';
  const identityCopy = document.createElement('div');
  identityCopy.className = 'stats-pro-identity-copy';
  const username = document.createElement('strong');
  username.textContent = profile.username || 'Oyuncu';
  applyNameEffectToNode(username, profile);
  const subtitle = document.createElement('span');
  subtitle.textContent = `${profile.emailVerified ? '✓ Doğrulanmış hesap' : '✕ Doğrulama bekliyor'} · Seviye ${profile.accountLevel || 1}`;
  identityCopy.append(username, subtitle);
  identity.append(avatarHost, identityCopy);

  const progressBox = document.createElement('section');
  progressBox.className = 'stats-pro-progress-card';
  const progressTop = document.createElement('div');
  const p = Math.max(0, Math.min(100, toNumber(profile.progressPercent, 0)));
  progressTop.innerHTML = `<span>Seviye ilerleme</span><b>${percent(p)}</b>`;
  const track = document.createElement('div');
  track.className = 'stats-progress-track';
  const fill = document.createElement('span');
  fill.className = 'stats-progress-fill';
  fill.style.setProperty('--pm-progress-target', percent(p));
  fill.style.width = percent(p);
  track.appendChild(fill);
  progressBox.append(progressTop, track);

  shell.append(
    identity,
    progressBox,
    buildStatsSection('HESAP BİLGİSİ', 'fa-id-card', items.account),
    buildStatsSection('OYUN PERFORMANSI', 'fa-gamepad', items.performance)
  );
  host.replaceChildren(shell);
  mountAvatar(avatarHost, { avatar: profile.avatar, frame: profile.selectedFrame, frameUrl: profile.marketFrameUrl, marketFrameId: profile.marketFrameId, variant: 'accountProfileCard', size: 112, extraClass: 'pm-avatar--stats-pro' });
}

function formatDateTimeTR(value) {
  const n = Number(value || 0);
  if (!n) return 'Zaman bilgisi yok';
  try { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(n)); } catch (_) { return new Date(n).toLocaleString('tr-TR'); }
}

function msUntilLocalMidnight() {
  const nowDate = new Date();
  const next = new Date(nowDate);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - nowDate.getTime());
}

function formatCountdown(ms = 0) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h} saat ${m} dakika`;
}

let wheelSpinAudio = null;
let wheelSpinSoundActive = false;
let wheelSpinSoundStopTimer = 0;

function getWheelSpinAudio() {
  if (wheelSpinAudio) return wheelSpinAudio;
  const embedded = $('wheelSpinSound');
  wheelSpinAudio = embedded instanceof HTMLAudioElement ? embedded : new Audio('/public/assets/sfx/wheelspin/wheelspin.wav');
  wheelSpinAudio.preload = 'auto';
  wheelSpinAudio.loop = false;
  wheelSpinAudio.volume = 0.72;
  return wheelSpinAudio;
}

function stopWheelSpinSound() {
  wheelSpinSoundActive = false;
  if (wheelSpinSoundStopTimer) {
    window.clearTimeout(wheelSpinSoundStopTimer);
    wheelSpinSoundStopTimer = 0;
  }
  try {
    const audio = getWheelSpinAudio();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.62;
  } catch (_) {}
}

function primeWheelSpinSound() {
  try {
    const audio = getWheelSpinAudio();
    audio.volume = 0;
    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') promise.catch(() => null);
    window.setTimeout(() => {
      if (!wheelSpinSoundActive) {
        try { audio.pause(); audio.currentTime = 0; audio.volume = 0.72; } catch (_) {}
      }
    }, 50);
  } catch (_) {}
}

function startWheelSpinSound() {
  try {
    const audio = getWheelSpinAudio();
    wheelSpinSoundActive = true;
    if (wheelSpinSoundStopTimer) window.clearTimeout(wheelSpinSoundStopTimer);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.72;
    audio.loop = false;
    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') promise.catch(() => null);
  } catch (_) {}
}

function scheduleWheelSpinSoundStop(delay = 0) {
  if (wheelSpinSoundStopTimer) window.clearTimeout(wheelSpinSoundStopTimer);
  wheelSpinSoundStopTimer = window.setTimeout(stopWheelSpinSound, Math.max(0, delay));
}

function setWheelButtonDefault() {
  const button = $('spinWheelBtn');
  if (!button) return;
  button.innerHTML = '<i class="fa-solid fa-rotate"></i> ÇARKI ÇEVİR';
  button.classList.remove('is-locked');
  button.disabled = false;
  button.setAttribute('aria-busy', 'false');
}

function setWheelButtonLocked(extraRights = 0) {
  const button = $('spinWheelBtn');
  if (!button) return;
  const rights = Math.max(0, Math.trunc(Number(extraRights || 0)));
  button.dataset.extraRights = String(rights);
  button.setAttribute('aria-busy', 'false');
  if (rights > 0) {
    button.disabled = false;
    button.classList.remove('is-locked');
    button.innerHTML = `<i class="fa-solid fa-ticket"></i> +1 HAKKINI KULLAN <span class="wheel-extra-count">${rights}</span>`;
    return;
  }
  button.disabled = true;
  button.classList.add('is-locked');
  button.innerHTML = `<span class="wheel-locked-copy"><span>Bugünkü hakkını kullandın. Yeni hak 00:00'da yenilenir.</span><strong>KALAN SÜRE: ${formatCountdown(msUntilLocalMidnight())}</strong></span>`;
}

function setWheelButtonBusy(text = 'ÇARK DÖNÜYOR') {
  const button = $('spinWheelBtn');
  if (!button) return;
  button.disabled = true;
  button.classList.remove('is-locked');
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> ${safeText(text)}`;
}

function setWheelLockedState(locked = false, message = '', extraRights = 0) {
  if (locked) {
    setWheelButtonLocked(extraRights);
  } else {
    setWheelButtonDefault();
  }
  const help = $('wheelHelp');
  if (help && message) setHelp('wheelHelp', message, locked && Number(extraRights || 0) <= 0 ? 'success' : '');
}

function dailyWheelLockedMessage() {
  return `Bugünkü hakkını kullandın. Yeni hak 00:00'da yenilenir. KALAN SÜRE: ${formatCountdown(msUntilLocalMidnight())}.`;
}

function accountHistoryKind(item = {}, hostId = '') {
  const text = [item.result, item.status, item.type, item.source, item.category, item.title, item.message, item.detail, item.reason]
    .map((value) => safeText(value).toLocaleLowerCase('tr-TR'))
    .join(' ');
  if (hostId === 'accountGameHistoryList') {
    if (/kazand|win|winner|başar|basar/.test(text)) return { tone: 'win', icon: 'fa-trophy', label: 'Kazandınız.' };
    if (/kaybet|loss|lose|lost|mağlub|maglub/.test(text)) return { tone: 'loss', icon: 'fa-triangle-exclamation', label: 'Kaybettiniz.' };
    if (/draw|beraber|iade|refund/.test(text)) return { tone: 'draw', icon: 'fa-handshake', label: 'Beraberlik / iade.' };
    return { tone: 'game', icon: 'fa-gamepad', label: safeText(item.message || item.detail || 'Oyun sonucu kaydedildi.') };
  }
  if (/şifre|sifre|password|güvenlik|guvenlik/.test(text)) return { tone: 'security', icon: 'fa-key', label: safeText(item.message || item.detail || 'Güvenlik işlemi kaydedildi.') };
  if (/email|e-posta|posta/.test(text)) return { tone: 'security', icon: 'fa-envelope-circle-check', label: safeText(item.message || item.detail || 'E-posta işlemi kaydedildi.') };
  if (/promo|promosyon|kod/.test(text)) return { tone: 'reward', icon: 'fa-ticket', label: safeText(item.message || item.detail || 'Promo işlemi kaydedildi.') };
  if (/çark|cark|wheel/.test(text)) return { tone: 'reward', icon: 'fa-dharmachakra', label: safeText(item.message || item.detail || 'Çark ödülü kaydedildi.') };
  if (/market|satın|satin|ürün|urun/.test(text)) return { tone: 'market', icon: 'fa-store', label: safeText(item.message || item.detail || 'Market işlemi kaydedildi.') };
  if (/profil|avatar|çerçeve|cerceve|frame/.test(text)) return { tone: 'profile', icon: 'fa-user-gear', label: safeText(item.message || item.detail || 'Profil güncellemesi kaydedildi.') };
  return { tone: 'info', icon: 'fa-circle-info', label: safeText(item.message || item.detail || 'İşlem kaydedildi.') };
}

function accountHistoryTitle(item = {}, hostId = '') {
  if (hostId === 'accountGameHistoryList') return safeText(item.gameName || item.game || item.title || item.type || 'Oyun');
  return safeText(item.title || item.type || item.source || 'İşlem');
}

function accountHistoryAmount(item = {}, hostId = '') {
  const score = Math.max(0, Math.trunc(toNumber(item.score ?? item.points ?? 0, 0)));
  const xp = Math.max(0, Math.trunc(toNumber(item.xp ?? item.xpAmount ?? 0, 0)));
  const amount = Number(item.amount ?? item.reward ?? item.win ?? item.loss ?? item.value ?? 0);
  if (Number.isFinite(amount) && amount !== 0) return `${money(Math.abs(amount))} MC`;
  if (xp > 0) return `${money(xp)} XP`;
  if (score > 0) return `${money(score)} Skor`;
  return hostId === 'accountGameHistoryList' ? 'Sonuç kaydı' : 'İşlem kaydı';
}

function renderAccountHistoryList(hostId, items = [], emptyText = 'Sonuç bulunamadı.') {
  const host = $(hostId);
  if (!host) return;
  const rows = Array.isArray(items) ? items.slice(0, 30) : [];
  host.classList.toggle('account-history-list--games', hostId === 'accountGameHistoryList');
  host.classList.toggle('account-history-list--transactions', hostId !== 'accountGameHistoryList');
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty-state account-empty-state--pro';
    empty.innerHTML = `<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><strong>Henüz kayıt yok.</strong><span>${safeText(emptyText || 'Bu alanda gösterilecek kayıt bulunmuyor.')}</span>`;
    host.replaceChildren(empty);
    return;
  }
  host.replaceChildren(...rows.map((item) => {
    const kind = accountHistoryKind(item, hostId);
    const row = document.createElement('article');
    row.className = `account-memory-row account-memory-row--pro account-memory-row--${kind.tone}`;
    const icon = document.createElement('span');
    icon.className = 'account-memory-icon';
    icon.innerHTML = `<i class="fa-solid ${safeText(item.icon || kind.icon || 'fa-circle-info')}"></i>`;
    const copy = document.createElement('div');
    copy.className = 'account-memory-copy';
    const title = document.createElement('strong');
    title.textContent = accountHistoryTitle(item, hostId);
    const meta = document.createElement('small');
    meta.textContent = kind.label;
    copy.append(title, meta);
    const side = document.createElement('span');
    side.className = 'account-memory-side';
    const b = document.createElement('b');
    b.textContent = accountHistoryAmount(item, hostId);
    side.appendChild(b);
    const time = document.createElement('time');
    time.textContent = notificationTimeLabel(item.at || item.createdAt || item.lastSeenAt || item.settledAt || Date.now()) || formatDateTimeTR(item.at || item.createdAt || item.lastSeenAt);
    side.appendChild(time);
    row.append(icon, copy, side);
    return row;
  }));
}

const ACCOUNT_GAME_HISTORY_KEYS = Object.freeze(['crash', 'chess', 'satranc', 'satranç', 'pisti', 'pişti', 'pattern', 'pattern-master', 'snake', 'snake-pro', 'space', 'space-pro']);
const ACCOUNT_NON_GAME_HISTORY_RE = /çark|wheel|promo|promosyon|market|profil|avatar|çerçeve|frame|bakiye|ödül|odul|email|e-posta|şifre|sifre/i;
const ACCOUNT_TRANSACTION_HISTORY_RE = /çark|wheel|promo|promosyon|market|satın alma|satin alma|iade|profil|avatar|çerçeve|frame|rozet|istatistik|tema|isim efekti|bakiye|ödül|odul|email|e-posta|şifre|sifre|hesap/i;

function isRealGameHistoryItem(item = {}) {
  const raw = [item.game, item.gameKey, item.mode, item.type, item.category, item.title, item.message, item.detail]
    .map((value) => safeText(value).toLowerCase())
    .filter(Boolean);
  const combined = raw.join(' ');
  if (!combined) return false;
  if (ACCOUNT_NON_GAME_HISTORY_RE.test(combined)) return false;
  return ACCOUNT_GAME_HISTORY_KEYS.some((key) => combined.includes(key));
}

function filterRealGameHistory(items = []) {
  return Array.isArray(items) ? items.filter(isRealGameHistoryItem).slice(0, 30) : [];
}

function isAccountTransactionHistoryItem(item = {}) {
  if (!item || typeof item !== 'object') return false;
  if (isRealGameHistoryItem(item)) return false;
  const combined = [item.type, item.source, item.category, item.title, item.message, item.detail, item.reason]
    .map((value) => safeText(value).toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (!combined) return Number(item.amount || 0) !== 0;
  return ACCOUNT_TRANSACTION_HISTORY_RE.test(combined) || Number(item.amount || 0) !== 0;
}

function filterAccountTransactionHistory(items = []) {
  return Array.isArray(items) ? items.filter(isAccountTransactionHistoryItem).slice(0, 30) : [];
}

function renderAccountMemory(payload = accountMemoryPayload) {
  accountMemoryPayload = payload || accountMemoryPayload;
  const merged = [
    ...(Array.isArray(accountMemoryPayload.transactions) ? accountMemoryPayload.transactions : []),
    ...(Array.isArray(accountMemoryPayload.games) ? accountMemoryPayload.games : [])
  ];
  const transactions = filterAccountTransactionHistory(merged);
  const games = filterRealGameHistory(merged);
  renderAccountHistoryList('accountTransactionList', transactions, 'İşlem geçmişi kaydı henüz yok.');
  renderAccountHistoryList('accountGameHistoryList', games, 'Oyun geçmişi kaydı henüz yok.');
}

async function loadAccountMemory(options = {}) {
  const force = !!options.force;
  if (!auth.currentUser) {
    accountMemoryLoaded = false;
    accountMemoryPayload = { transactions: [], games: [] };
    renderAccountMemory(accountMemoryPayload);
    return accountMemoryPayload;
  }
  if (accountMemoryLoaded && !force) {
    renderAccountMemory(accountMemoryPayload);
    return accountMemoryPayload;
  }
  try {
    const [memoryResult, matchesResult] = await Promise.allSettled([
      apiFetch('/api/account/memory', {}, true),
      apiFetch('/api/matches/history', {}, true)
    ]);
    if (memoryResult.status === 'rejected') throw memoryResult.reason;
    const payload = memoryResult.value || {};
    const matchesPayload = matchesResult.status === 'fulfilled' ? (matchesResult.value || {}) : {};
    accountMemoryPayload = {
      transactions: Array.isArray(payload?.transactions) ? payload.transactions : Array.isArray(payload?.items) ? payload.items : [],
      games: [
        ...(Array.isArray(payload?.games) ? payload.games : []),
        ...(Array.isArray(matchesPayload?.items) ? matchesPayload.items : Array.isArray(matchesPayload?.games) ? matchesPayload.games : [])
      ]
    };
    accountMemoryLoaded = true;
    renderAccountMemory(accountMemoryPayload);
    return accountMemoryPayload;
  } catch (error) {
    accountMemoryLoaded = false;
    report('home.account.memory', error);
    accountMemoryPayload = { transactions: [], games: [] };
    renderAccountMemory(accountMemoryPayload);
    return accountMemoryPayload;
  }
}

function setHistoryCategory(category = 'transactions') {
  const allowed = ['transactions', 'games'];
  const safeCategory = allowed.includes(safeText(category)) ? safeText(category) : 'transactions';
  activeHistoryCategory = safeCategory;
  $$('#historyCategoryTabs [data-history-category]').forEach((button) => button.classList.toggle('is-active', button.dataset.historyCategory === safeCategory));
  $$('.history-category-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.historyPanel === safeCategory));
}

function setAccountTab(tab = 'profile') {
  const allowed = ['profile', 'security', 'history'];
  const safeTab = allowed.includes(safeText(tab)) ? safeText(tab) : 'profile';
  $$('#accountHubTabs [data-account-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.accountTab === safeTab));
  $$('.account-hub-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.accountPanel === safeTab));
  if (safeTab === 'history') {
    setHistoryCategory(activeHistoryCategory || 'transactions');
    loadAccountMemory().catch((error) => report('home.account.memory.tab', error));
  }
}


function notificationDateLabel(value) {
  const date = new Date(toNumber(value, Date.now()));
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function notificationTimeLabel(value) {
  const date = new Date(toNumber(value, Date.now()));
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function notificationImage(item = {}) {
  const raw = safeText(item.image || item.imageUrl || item.banner || '');
  if (raw && (/^https?:\/\//i.test(raw) || raw.startsWith('/'))) return raw;
  return '';
}

function notificationActionText(item = {}) {
  return safeText(item.actionText || item.cta || item.buttonText || 'Göster');
}

function isExactAdminNotification(item = {}) {
  const src = safeText(item.source || item.origin || '');
  const msg = String(item.message || item.body || '');
  return src === 'admin-panel' || /\n/.test(msg);
}
function appendExactNotificationMessage(target, value = '') {
  if (!target) return;
  const text = safeMultilineText(value || 'Bildirim');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (index) target.appendChild(document.createElement('br'));
    target.appendChild(document.createTextNode(line || ''));
  });
}

function updateNotificationMenuButton() {
  const menuButton = $('notificationMenuBtn');
  const label = activeNotificationTab === 'personal' ? 'Kişisel bildirim işlemleri' : 'Sistem bildirim işlemleri';
  menuButton?.setAttribute('aria-label', label);
}

function renderNotifications() {
  const personal = Array.isArray(notificationPayload.personal) ? notificationPayload.personal : [];
  const system = Array.isArray(notificationPayload.system) ? notificationPayload.system : [];
  const unreadPersonal = personal.filter((item) => !item.read).length;
  const unreadSystem = system.filter((item) => !item.read).length;
  setText('personalNotificationCount', unreadPersonal);
  setText('systemNotificationCount', unreadSystem);
  const unreadTotal = unreadPersonal + unreadSystem;
  const topCount = $('notificationCount');
  if (topCount) { topCount.hidden = unreadTotal <= 0; topCount.textContent = String(Math.min(99, unreadTotal)); }
  updateNotificationMenuButton();
  $$('#notificationTabs [data-notification-tab]').forEach((button) => {
    const active = button.dataset.notificationTab === activeNotificationTab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const host = $('notificationList');
  if (!host) return;
  const rows = (activeNotificationTab === 'personal' ? personal : system)
    .slice()
    .sort((a, b) => toNumber(b.at || b.createdAt, 0) - toNumber(a.at || a.createdAt, 0))
    .slice(0, 20);
  const hasNotifications = rows.length > 0;
  const hasUnread = rows.some((item) => !item.read);
  const hasRead = rows.some((item) => !!item.read);
  const markAllButton = $('markNotificationsReadBtn');
  const clearAllButton = $('clearNotificationsBtn');
  const clearReadButton = $('clearReadNotificationsBtn');
  if (markAllButton) {
    markAllButton.disabled = !hasUnread;
    markAllButton.classList.toggle('is-disabled', !hasUnread);
    markAllButton.setAttribute('aria-disabled', !hasUnread ? 'true' : 'false');
  }
  if (clearAllButton) {
    clearAllButton.disabled = !hasNotifications;
    clearAllButton.classList.toggle('is-disabled', !hasNotifications);
    clearAllButton.setAttribute('aria-disabled', !hasNotifications ? 'true' : 'false');
  }
  if (clearReadButton) {
    clearReadButton.disabled = !hasRead;
    clearReadButton.classList.toggle('is-disabled', !hasRead);
    clearReadButton.setAttribute('aria-disabled', !hasRead ? 'true' : 'false');
  }
  if (!rows.length) {
    host.innerHTML = '<div class="account-empty-state account-empty-state--pro notification-empty"><i class="fa-regular fa-bell" aria-hidden="true"></i><strong>Henüz bildirimin yok.</strong><span>Bu sekmede gösterilecek bildirim bulunmuyor.</span></div>';
    return;
  }
  const nodes = [];
  let lastDate = '';
  rows.forEach((item) => {
    const stamp = item.at || item.createdAt || Date.now();
    const dateLabel = notificationDateLabel(stamp);
    if (dateLabel && dateLabel !== lastDate) {
      lastDate = dateLabel;
      const dateNode = document.createElement('div');
      dateNode.className = 'notification-date-label';
      dateNode.textContent = dateLabel;
      nodes.push(dateNode);
    }
    const row = document.createElement('article');
    row.className = `notification-row notification-card-pro notification-row--${safeText(item.type || activeNotificationTab)}${item.read ? ' is-read' : ''}`;
    row.dataset.notificationId = safeText(item.id || item.key || '');

    const head = document.createElement('div');
    head.className = 'notification-card-head';
    const time = document.createElement('span');
    time.className = 'notification-time-dot';
    time.innerHTML = `<i></i><time>${notificationTimeLabel(stamp)}</time>`;
    const actions = document.createElement('span');
    actions.className = 'notification-card-actions';
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'notification-mini-action';
    mark.setAttribute('aria-label', 'Okundu olarak işaretle');
    mark.innerHTML = '<i class="fa-solid fa-check-double"></i>';
    mark.disabled = !!item.read;
    mark.addEventListener('click', () => markNotificationRead(item.id || item.key || '', activeNotificationTab));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'notification-mini-action notification-delete-btn';
    del.setAttribute('aria-label', 'Bildirimi sil');
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener('click', () => deleteNotification(item.id || item.key || '', activeNotificationTab));
    actions.append(mark, del);
    head.append(time, actions);

    const title = document.createElement('strong');
    title.className = 'notification-card-title';
    title.textContent = safeText(item.title || (activeNotificationTab === 'personal' ? 'Kişisel Bildirim' : 'Sistem Bildirimi'));

    const imgSrc = notificationImage(item);
    let imageNode = null;
    if (imgSrc) {
      imageNode = document.createElement('img');
      imageNode.className = 'notification-card-image';
      imageNode.src = imgSrc;
      imageNode.alt = '';
      imageNode.loading = 'lazy';
      imageNode.decoding = 'async';
      imageNode.draggable = false;
    }

    const exactAdminMessage = isExactAdminNotification(item);
    if (exactAdminMessage) row.classList.add('is-expanded', 'is-admin-exact');

    const message = document.createElement('p');
    message.className = 'notification-card-message';
    appendExactNotificationMessage(message, item.message || item.body || 'Bildirim');

    const target = safeText(item.href || item.url || item.actionUrl || '');
    const shouldShowCta = !!target && (target.startsWith('/') || /^https?:\/\//i.test(target));
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'notification-card-cta';
    cta.textContent = notificationActionText(item);
    cta.addEventListener('click', () => { location.href = target; });

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'notification-card-more';
    more.innerHTML = 'Göster <i class="fa-solid fa-chevron-down"></i>';
    more.addEventListener('click', () => row.classList.toggle('is-expanded'));
    const shouldShowMore = !exactAdminMessage && safeMultilineText(item.message || item.body || '').length > 180;

    row.append(head, title);
    if (imageNode) row.appendChild(imageNode);
    row.append(message);
    if (shouldShowCta) row.appendChild(cta);
    if (shouldShowMore) row.appendChild(more);
    nodes.push(row);
  });
  host.replaceChildren(...nodes);
}

async function markNotificationRead(id, tab = activeNotificationTab) {
  if (!id || !auth.currentUser) return;
  try {
    await apiFetch('/api/notifications/memory/read', { method: 'POST', body: { id, tab } }, true);
    await loadNotifications({ force: true });
  } catch (error) {
    report('home.notifications.read', error);
    showToast(userErrorText(error, 'Bildirim okundu yapılamadı.'), '', 'error');
  }
}

async function deleteNotification(id, tab = activeNotificationTab) {
  if (!id || !auth.currentUser) return;
  try {
    await apiFetch('/api/notifications/delete', { method: 'POST', body: { id, tab } }, true);
    await loadNotifications({ force: true });
    showToast('Bildirim silindi.', '', 'success');
  } catch (error) {
    report('home.notifications.delete', error);
    showToast(userErrorText(error, 'Bildirim silinemedi.'), '', 'error');
  }
}

async function markNotificationsRead(tab = activeNotificationTab) {
  if (!auth.currentUser) return;
  const normalizedTab = tab === 'personal' ? 'personal' : 'system';
  const list = Array.isArray(notificationPayload[normalizedTab]) ? notificationPayload[normalizedTab] : [];
  if (!list.some((item) => !item.read)) { renderNotifications(); return; }
  try {
    await apiFetch('/api/notifications/memory/read-all', { method: 'POST', body: { tab: normalizedTab } }, true);
    const list = Array.isArray(notificationPayload[normalizedTab]) ? notificationPayload[normalizedTab] : [];
    notificationPayload = { ...notificationPayload, [normalizedTab]: list.map((item) => ({ ...item, read: true, readAt: Date.now() })) };
    renderNotifications();
    await loadNotifications({ force: true });
    showToast(normalizedTab === 'personal' ? 'Kişisel bildirimler okundu.' : 'Sistem bildirimleri okundu.', '', 'success');
  } catch (error) {
    report('home.notifications.readAll', error);
    showToast(userErrorText(error, 'Bildirimler okundu yapılamadı.'), '', 'error');
  }
}

async function clearNotifications(tab = activeNotificationTab) {
  if (!auth.currentUser) return;
  const normalizedTab = tab === 'personal' ? 'personal' : 'system';
  const list = Array.isArray(notificationPayload[normalizedTab]) ? notificationPayload[normalizedTab] : [];
  if (!list.length) { renderNotifications(); return; }
  try {
    await apiFetch('/api/notifications/memory/clear', { method: 'POST', body: { tab: normalizedTab } }, true);
    notificationPayload = { ...notificationPayload, [normalizedTab]: [] };
    renderNotifications();
    await loadNotifications({ force: true });
    showToast(normalizedTab === 'personal' ? 'Kişisel bildirimler temizlendi.' : 'Sistem bildirimleri temizlendi.', '', 'success');
  } catch (error) {
    report('home.notifications.clear', error);
    showToast(userErrorText(error, 'Bildirimler temizlenemedi.'), '', 'error');
  }
}

async function clearReadNotifications(tab = activeNotificationTab) {
  if (!auth.currentUser) return;
  const normalizedTab = tab === 'personal' ? 'personal' : 'system';
  const list = Array.isArray(notificationPayload[normalizedTab]) ? notificationPayload[normalizedTab] : [];
  const readItems = list.filter((item) => !!item.read && safeText(item.id || item.key || ''));
  if (!readItems.length) {
    renderNotifications();
    showToast('Bildirimler', 'Temizlenecek okunmuş bildirim yok.', 'info');
    return;
  }
  try {
    await Promise.allSettled(readItems.map((item) => apiFetch('/api/notifications/delete', { method: 'POST', body: { id: item.id || item.key, tab: normalizedTab } }, true)));
    const readIdSet = new Set(readItems.map((item) => safeText(item.id || item.key || '')));
    notificationPayload = { ...notificationPayload, [normalizedTab]: list.filter((item) => !readIdSet.has(safeText(item.id || item.key || ''))) };
    renderNotifications();
    await loadNotifications({ force: true });
    showToast('Bildirimler', 'Okunmuş bildirimler temizlendi.', 'success');
  } catch (error) {
    report('home.notifications.clearRead', error);
    showToast(userErrorText(error, 'Okunmuş bildirimler temizlenemedi.'), '', 'error');
  }
}

async function loadNotifications(options = {}) {
  const force = !!options.force;
  try {
    if (!auth.currentUser) {
      notificationsLoaded = false;
      notificationPayload = { system: [], personal: [] };
      renderNotifications();
      return notificationPayload;
    }
    if (notificationsLoaded && !force) {
      renderNotifications();
      return notificationPayload;
    }
    const payload = await apiFetch('/api/notifications/memory', {}, true);
    notificationPayload = {
      system: Array.isArray(payload?.system) ? filterSystemNotificationList(payload.system).slice(0, 20) : [],
      personal: Array.isArray(payload?.personal) ? filterPersonalNotificationList(payload.personal).slice(0, 20) : []
    };
    notificationsLoaded = true;
    renderNotifications();
    return notificationPayload;
  } catch (error) {
    notificationsLoaded = false;
    report('home.notifications.load', error);
    notificationPayload = { system: [], personal: [] };
    renderNotifications();
    return notificationPayload;
  }
}

function stopNotificationRealtime() {
  if (notificationFallbackTimer) {
    window.clearInterval(notificationFallbackTimer);
    notificationFallbackTimer = 0;
  }
  try { notificationSocket?.disconnect?.(); } catch (_) {}
  notificationSocket = null;
  notificationSocketConnected = false;
}

function startNotificationFallback() {
  if (notificationFallbackTimer || !auth.currentUser) return;
  notificationFallbackTimer = window.setInterval(() => {
    if (!auth.currentUser || document.hidden || notificationSocketConnected) return;
    loadNotifications({ force: true, source: 'fallback-60s' }).catch((error) => report('home.notifications.fallback', error));
  }, 60000);
}

function getSocketBaseUrl() {
  const api = window.__PM_API__;
  const runtimeBase = safeText(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || window.__PM_STATIC_RUNTIME_CONFIG__?.apiBase || '');
  if (api?.buildUrl) {
    try {
      return new URL(api.buildUrl('/socket.io/socket.io.js')).origin;
    } catch (_) {}
  }
  try {
    if (runtimeBase) return new URL(runtimeBase, window.location.origin).origin;
  } catch (_) {}
  return window.location.origin;
}

async function ensureSocketIoClient() {
  if (window.io) return window.io;
  if (notificationSocketScriptPromise) return notificationSocketScriptPromise;
  notificationSocketScriptPromise = new Promise((resolve) => {
    const candidates = Array.from(new Set([
      `${getSocketBaseUrl()}/socket.io/socket.io.js`,
      `${window.location.origin}/socket.io/socket.io.js`
    ].filter(Boolean)));
    let index = 0;
    const tryNext = () => {
      if (window.io) { resolve(window.io); return; }
      const src = candidates[index++];
      if (!src) { resolve(null); return; }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.io || null);
      script.onerror = () => {
        try { script.remove(); } catch (_) {}
        tryNext();
      };
      document.head.appendChild(script);
    };
    tryNext();
  });
  return notificationSocketScriptPromise;
}


function notificationRevealAt(item = {}) {
  return Math.max(0, Math.trunc(toNumber(item.revealAt || item.deliveryAfter || item.deliverAt || 0, 0)));
}

function isNotificationRevealReady(item = {}) {
  const revealAt = notificationRevealAt(item);
  return !revealAt || revealAt <= Date.now();
}

function isWheelRewardNotificationItem(item = {}) {
  const text = `${item.type || ''} ${item.source || ''} ${item.title || ''} ${item.message || item.body || ''}`.toLocaleLowerCase('tr-TR');
  return /çark|cark|wheel|çark hediyesi|cark hediyesi|günlük çark|gunluk cark/.test(text);
}

let wheelRewardRevealUntil = 0;
let lastWheelRewardToastKey = '';
let lastWheelRewardToastAt = 0;

function wheelRewardToastKey(item = {}) {
  const id = safeText(item.id || item.notificationId || item.key || '');
  if (id) return id;
  return `${safeText(item.title || 'Çark Hediyesi')}|${safeText(item.message || item.body || item.text || '')}|${safeText(item.amount || item.reward || '')}`;
}

function showWheelRewardToast(item = {}) {
  const key = wheelRewardToastKey(item);
  const nowMs = Date.now();
  if (key && (key === lastWheelRewardToastKey || nowMs - lastWheelRewardToastAt < 6500)) return;
  lastWheelRewardToastKey = key;
  lastWheelRewardToastAt = nowMs;
  const amount = Math.max(0, Math.trunc(toNumber(item.amount || item.reward || item.prize || 0, 0)));
  const title = safeText(item.title || 'Çark Hediyesi');
  const message = safeText(item.message || item.body || item.text || (amount ? `${money(amount)} MC çark hediyesi hesabına tanımlandı.` : 'Çark hediyen hesabına tanımlandı.'));
  showToast(title, message, 'reward');
}

function scheduleWheelRewardToast(item = {}) {
  const revealAt = Math.max(notificationRevealAt(item), wheelRewardRevealUntil);
  const delay = Math.max(0, revealAt - Date.now());
  if (delay > 0) {
    window.setTimeout(() => showWheelRewardToast(item), delay + 80);
    return;
  }
  showWheelRewardToast(item);
}

function isAllowedPersonalNotificationItem(item = {}) {
  const type = safeText(item.type || '').toLocaleLowerCase('tr-TR');
  const source = safeText(item.source || '').toLocaleLowerCase('tr-TR');
  const title = safeText(item.title || '').toLocaleLowerCase('tr-TR');
  const message = safeText(item.message || item.body || '').toLocaleLowerCase('tr-TR');
  const text = `${type} ${source} ${title} ${message}`;
  const isAdminPersonal = source.startsWith('admin') || type === 'personal' || type === 'direct' || type === 'user' || item.scope === 'personal';
  const allowed = isAdminPersonal
    || source === 'wheel' || type === 'wheel' || /çark hediyesi|cark hediyesi|günlük çark|gunluk cark|wheel/.test(text)
    || source === 'promo' || type === 'promo' || /promosyon kodu|promo kod/.test(text)
    || source === 'account' || type === 'account' || /hesap bilgileri güncellendi|hesap bilgileri guncellendi|profil bilgilerin/.test(text);
  return allowed && (isAdminPersonal || !/market|satın alma|satin alma|store|iade/.test(text));
}

function filterPersonalNotificationList(list = []) {
  return (Array.isArray(list) ? list : []).filter(isNotificationRevealReady).filter(isAllowedPersonalNotificationItem);
}

function filterSystemNotificationList(list = []) {
  return (Array.isArray(list) ? list : []).filter((item) => {
    const source = safeText(item.source || '').toLowerCase();
    const type = safeText(item.type || '').toLowerCase();
    return type === 'system' || source.startsWith('admin');
  });
}

function notificationToastTone(item = {}) {
  const text = `${item.type || ''} ${item.source || ''} ${item.title || ''} ${item.message || ''}`.toLocaleLowerCase('tr-TR');
  if (/çark|cark|wheel|promo|promosyon|mc|ödül|odul|hediye/.test(text)) return 'reward';
  if (/hesap|profil|profile|avatar|çerçeve|cerceve|frame|e-posta|eposta|email|şifre|sifre|password|güvenlik|guvenlik/.test(text)) return 'notification';
  return 'notification';
}

function showIncomingPersonalNotificationToast(item = {}) {
  if (!isAllowedPersonalNotificationItem(item)) return;
  if (isWheelRewardNotificationItem(item)) {
    scheduleWheelRewardToast(item);
    return;
  }
  const revealAt = notificationRevealAt(item);
  if (revealAt && revealAt > Date.now()) {
    window.setTimeout(() => showIncomingPersonalNotificationToast({ ...item, revealAt: 0, deliveryAfter: 0 }), revealAt - Date.now() + 80);
    return;
  }
  const title = safeText(item.title || 'Kişisel Bildirim');
  const message = safeText(item.message || item.body || item.text || 'Hesabınla ilgili yeni bir bildirim var.');
  showToast(title, message, notificationToastTone(item));
}

function applyNotificationSocketPayload(payload = {}) {
  const tab = payload.tab === 'personal' ? 'personal' : payload.tab === 'system' ? 'system' : '';
  const item = payload.item || payload.notification || payload.row || null;
  const bucket = payload.notifications || payload.payload || payload;
  if (Array.isArray(bucket.system) || Array.isArray(bucket.personal)) {
    const previousPersonalIds = new Set((notificationPayload.personal || []).map((entry) => safeText(entry.id || entry.notificationId || entry.key || '')));
    const nextPersonal = Array.isArray(bucket.personal) ? filterPersonalNotificationList(bucket.personal).slice(0, 20) : notificationPayload.personal;
    notificationPayload = {
      system: Array.isArray(bucket.system) ? filterSystemNotificationList(bucket.system).slice(0, 20) : notificationPayload.system,
      personal: nextPersonal
    };
    notificationsLoaded = true;
    renderNotifications();
    const freshPersonal = (nextPersonal || []).find((entry) => {
      const id = safeText(entry.id || entry.notificationId || entry.key || '');
      return id && !previousPersonalIds.has(id) && !entry.read;
    });
    if (freshPersonal) showIncomingPersonalNotificationToast(freshPersonal);
    return;
  }
  if (item && tab) {
    if (tab === 'personal' && !isAllowedPersonalNotificationItem(item)) return;
    const revealAt = notificationRevealAt(item);
    if (revealAt && revealAt > Date.now()) {
      if (tab === 'personal' && isWheelRewardNotificationItem(item)) scheduleWheelRewardToast(item);
      window.setTimeout(() => applyNotificationSocketPayload({ tab, item: { ...item, revealAt: 0, deliveryAfter: 0 } }), revealAt - Date.now() + 80);
      return;
    }
    const list = Array.isArray(notificationPayload[tab]) ? notificationPayload[tab] : [];
    const id = safeText(item.id || item.notificationId || item.key || '');
    const next = id ? list.filter((entry) => safeText(entry.id || entry.notificationId || entry.key || '') !== id) : list.slice();
    notificationPayload = { ...notificationPayload, [tab]: [item, ...next].slice(0, 20) };
    notificationsLoaded = true;
    renderNotifications();
    if (tab === 'personal') showIncomingPersonalNotificationToast(item);
    return;
  }
  loadNotifications({ force: true, source: 'socket' }).catch((error) => report('home.notifications.socket.refresh', error));
}

async function ensureNotificationRealtime() {
  if (!auth.currentUser) { stopNotificationRealtime(); return; }
  startNotificationFallback();
  if (notificationSocket && notificationSocketConnected) return;
  try {
    const ioClient = await ensureSocketIoClient();
    if (!ioClient || !auth.currentUser || !firebaseGetIdToken) return;
    const token = await firebaseGetIdToken(auth.currentUser, false);
    try { notificationSocket?.disconnect?.(); } catch (_) {}
    notificationSocket = ioClient(getSocketBaseUrl(), { auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 60000, withCredentials: true });
    const refresh = (payload) => applyNotificationSocketPayload(payload || {});
    ['notification:new','notifications:update','notifications:changed','pm:notification','notify:personal','notify:system'].forEach((eventName) => notificationSocket.on(eventName, refresh));
    const refreshHomeActivity = (payload) => applyHomeRecentActivityPayload(payload || {});
    ['home:recent-activity','home:recentActivities','home:activity:new'].forEach((eventName) => notificationSocket.on(eventName, refreshHomeActivity));
    notificationSocket.on('connect', () => {
      notificationSocketConnected = true;
      if (notificationFallbackTimer) {
        window.clearInterval(notificationFallbackTimer);
        notificationFallbackTimer = 0;
      }
      loadNotifications({ force: true, source: 'socket-connect' }).catch(() => null);
    });
    notificationSocket.on('disconnect', () => { notificationSocketConnected = false; startNotificationFallback(); });
    notificationSocket.on('connect_error', (error) => { notificationSocketConnected = false; startNotificationFallback(); report('home.notifications.socket', error); });
  } catch (error) {
    notificationSocketConnected = false;
    startNotificationFallback();
    /* socket client yoksa 60 sn fallback polling sessiz devam eder */
  }
}

function clearInactiveAuthSubmitState(mode = currentAuthMode) {
  const inactiveButton = mode === 'register' ? $('authLoginSubmitBtn') : $('authRegisterSubmitBtn');
  if (inactiveButton) {
    inactiveButton.dataset.busy = 'false';
    inactiveButton.disabled = false;
  }
}

function setAuthMode(mode = 'login') {
  currentAuthMode = mode === 'register' ? 'register' : 'login';
  $$('#authSegment [data-auth-mode]').forEach((button) => {
    const active = button.dataset.authMode === currentAuthMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  $$('[data-auth-panel]').forEach((panel) => {
    const active = panel.dataset.authPanel === currentAuthMode;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
  const loginPanel = $('authLoginPanel');
  const registerPanel = $('authRegisterPanel');
  if (loginPanel) loginPanel.setAttribute('aria-hidden', currentAuthMode === 'login' ? 'false' : 'true');
  if (registerPanel) registerPanel.setAttribute('aria-hidden', currentAuthMode === 'register' ? 'false' : 'true');
  clearInactiveAuthSubmitState(currentAuthMode);
  syncAuthHeader();
  setHelp('authHelp', '');
}

function readStoredAuthPersistenceMode() {
  try { if (localStorage.getItem('pm_login_persistence') === 'local') return 'local'; } catch (_) {}
  try { if (sessionStorage.getItem('pm_login_persistence') === 'session') return 'session'; } catch (_) {}
  return 'session';
}

function rememberFlagFromStoredPersistence() {
  return readStoredAuthPersistenceMode() === 'local';
}

async function setFirebaseAuthPersistenceMode(mode = 'session', { persistChoice = false } = {}) {
  if (!auth || typeof firebaseSetPersistence !== 'function') return false;
  const safeMode = mode === 'local' ? 'local' : 'session';
  const persistence = safeMode === 'local' ? firebaseLocalPersistence : firebaseSessionPersistence;
  if (!persistence) return false;
  await firebaseSetPersistence(auth, persistence);
  if (persistChoice) {
    try {
      if (safeMode === 'local') {
        localStorage.setItem('pm_login_persistence', 'local');
        sessionStorage.removeItem('pm_login_persistence');
      } else {
        sessionStorage.setItem('pm_login_persistence', 'session');
        localStorage.removeItem('pm_login_persistence');
      }
    } catch (_) {}
  }
  return true;
}

async function applyStoredFirebaseAuthPersistence() {
  const mode = readStoredAuthPersistenceMode();
  if (!mode) return false;
  return setFirebaseAuthPersistenceMode(mode, { persistChoice: false });
}

async function applyFirebaseAuthPersistence(remember = false) {
  return setFirebaseAuthPersistenceMode(remember ? 'local' : 'session', { persistChoice: true });
}

function authToastError(title = 'Hesap erişimi', message = '') {
  const clean = userErrorText({ message }, message || 'Bilgileri kontrol edip tekrar dene.');
  const safeTitle = safeText(title || '').toLocaleLowerCase('tr-TR').includes('kayıt') ? 'Kayıt ol' : 'Hesap erişimi';
  setHelp('authHelp', clean, 'error');
  showToast(safeTitle, clean, 'error');
}


function populateDateOfBirthSelects(prefix = 'register') {
  const day = $(`${prefix}BirthDay`);
  const month = $(`${prefix}BirthMonth`);
  const year = $(`${prefix}BirthYear`);
  if (!day || !month || !year) return;
  const current = {
    day: String(day.value || ''),
    month: String(month.value || ''),
    year: String(year.value || '')
  };
  const fill = (select, placeholder, items) => {
    if (!select) return;
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = String(item.value);
      opt.textContent = String(item.label);
      fragment.appendChild(opt);
    });
    select.appendChild(fragment);
  };
  fill(day, 'Gün', Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1).padStart(2, '0') })));
  fill(month, 'Ay', ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'].map((label, index) => ({ value: index + 1, label })));
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 120;
  const years = [];
  for (let y = currentYear; y >= minYear; y -= 1) years.push({ value: y, label: y });
  fill(year, 'Yıl', years);
  if (current.day) day.value = current.day;
  if (current.month) month.value = current.month;
  if (current.year) year.value = current.year;
  day.dataset.pmDobReady = month.dataset.pmDobReady = year.dataset.pmDobReady = 'true';
}
function pad2(value) { return String(value).padStart(2, '0'); }
function buildDateOfBirth(day, month, year) {
  const d = Math.trunc(Number(day) || 0);
  const m = Math.trunc(Number(month) || 0);
  const y = Math.trunc(Number(year) || 0);
  if (!d || !m || !y) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function ageFromDateOfBirth(value = '') {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const now = new Date();
  let age = now.getUTCFullYear() - Number(m[1]);
  const monthDelta = (now.getUTCMonth() + 1) - Number(m[2]);
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < Number(m[3]))) age -= 1;
  return Math.max(0, age);
}
function readDobFields(prefix = 'register') {
  if (window.PMDobPicker?.getValue) return window.PMDobPicker.getValue(prefix);
  const birthDay = safeText($(`${prefix}BirthDay`)?.value || '');
  const birthMonth = safeText($(`${prefix}BirthMonth`)?.value || '');
  const birthYear = safeText($(`${prefix}BirthYear`)?.value || '');
  const dateOfBirth = buildDateOfBirth(birthDay, birthMonth, birthYear);
  const age = ageFromDateOfBirth(dateOfBirth);
  return { birthDay, birthMonth, birthYear, dateOfBirth, age, ageVerified: !!dateOfBirth && age >= 16 };
}
function setDobFields(prefix = 'profile', value = '') {
  if (window.PMDobPicker?.setValue) { window.PMDobPicker.setValue(prefix, value); return; }
  populateDateOfBirthSelects(prefix);
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  setValue(`${prefix}BirthYear`, m ? String(Number(m[1])) : '');
  setValue(`${prefix}BirthMonth`, m ? String(Number(m[2])) : '');
  setValue(`${prefix}BirthDay`, m ? String(Number(m[3])) : '');
}
function lockDobFields(prefix = 'profile', locked = false) {
  if (window.PMDobPicker?.lock) { window.PMDobPicker.lock(prefix, locked); return; }
  [`${prefix}BirthDay`, `${prefix}BirthMonth`, `${prefix}BirthYear`].forEach((id) => {
    const node = $(id); if (node) node.disabled = !!locked;
  });
  const openBtn = $(`${prefix}DobOpenBtn`); if (openBtn) openBtn.disabled = !!locked;
}
function formatDobDisplay(dateOfBirth = '') {
  if (window.PMDobPicker?.formatDisplay) return window.PMDobPicker.formatDisplay(dateOfBirth);
  const m = String(dateOfBirth || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
function syncDobSummary(prefix = 'register') {
  if (window.PMDobPicker?.sync) { window.PMDobPicker.sync(prefix); return readDobFields(prefix); }
  return readDobFields(prefix);
}
function openDobPopup(target = 'register') {
  if (target === 'profile' && safeText(currentProfile?.dateOfBirth || '')) {
    const formatted = formatDobDisplay(currentProfile.dateOfBirth);
    setHelp('profileDobHelp', `Doğum tarihin kayıtlıdır: ${formatted}. Bu bilgi yalnızca admin tarafından değiştirilebilir.`, 'success');
    showToast('Doğum tarihi', 'Doğum tarihin kayıtlı. Güvenlik nedeniyle tekrar değiştirilemez.', 'info');
    return;
  }
  window.PMDobPicker?.open?.(target);
}
function closeDobPopup() { window.PMDobPicker?.close?.(); }
function applyDobPopupSelection() { window.PMDobPicker?.apply?.(); }
function bindDobPopupControls() { window.PMDobPicker?.init?.(); }
function setupDateOfBirthFields() {
  populateDateOfBirthSelects('register');
  populateDateOfBirthSelects('profile');
  window.PMDobPicker?.init?.();
  syncDobSummary('register');
  syncDobSummary('profile');
}

function readAuthValues(mode = currentAuthMode) {
  const safeMode = mode === 'register' ? 'register' : 'login';
  if (safeMode === 'register') {
    return {
      mode: 'register',
      firstName: safeText($('registerFirstName')?.value || ''),
      lastName: safeText($('registerLastName')?.value || ''),
      username: normalizeUsernameInput($('registerUsername')?.value || ''),
      email: safeText($('registerEmail')?.value || '').toLowerCase(),
      password: $('registerPassword')?.value || '',
      repeatPassword: $('registerPasswordRepeat')?.value || '',
      ...readDobFields('register'),
      termsAccepted: !!$('registerTermsAccepted')?.checked,
      kvkkAccepted: !!$('registerKvkkAccepted')?.checked,
      mcNoticeAccepted: !!$('registerMcNoticeAccepted')?.checked
    };
  }
  return {
    mode: 'login',
    identifier: safeText($('loginIdentifier')?.value || ''),
    password: $('loginPassword')?.value || '',
    remember: !!$('loginRememberMe')?.checked
  };
}

function ensureAuthThen(label = 'Bu işlem') {
  if (auth.currentUser) return true;
  setAuthMode('login');
  openSheet('auth', 'Giriş Yap', `${label} için önce hesabına giriş yapmalısın.`);
  return false;
}

function requestProfileSecurityReturn() {
  sheetReturnTarget = { sheet: 'profile', tab: 'security' };
}

function returnToProfileSecuritySheet() {
  sheetReturnTarget = null;
  openSheet('profile', '', '', { skipPreload: true, restoreNested: true });
  setAccountTab('security');
  // Modal kapatma click event'i MouseEvent ile geldiğinde ana Hesabım modalının kapanmasını engeller.
  // Profil içeriği async yenilense bile güvenlik sekmesi görünür kalır.
  window.setTimeout(() => setAccountTab('security'), 0);
  window.setTimeout(() => setAccountTab('security'), 180);
  window.setTimeout(() => setAccountTab('security'), 520);
}

function openSheet(name, title = '', subtitle = '', options = {}) {
  const shell = $('sheetShell');
  if (!shell) return;
  if (name !== 'profile' || !options.restoreNested) {
    if (!['email', 'password'].includes(name)) sheetReturnTarget = null;
  }
  toggleDropdown(false);
  if (!options.skipPreload && PRELOAD_REQUIRED_SHEETS.has(name)) {
    openSheetAfterPreload(name, title, subtitle);
    return;
  }
  activeSheet = name;
  const modalKey = name === 'auth' ? (currentAuthMode === 'register' ? 'register' : 'login') : name;
  const meta = getModalMeta(modalKey) || getModalMeta(name) || {};
  shell.dataset.modalKey = modalKey;
  shell.dataset.modalSize = meta.size || (name === 'market' ? 'xl' : name === 'profile' || name === 'wheel' ? 'lg' : name === 'auth' ? (modalKey === 'register' ? 'md' : 'sm') : 'md');
  const copy = SHEET_COPY[modalKey] || SHEET_COPY[name] || [meta.title || 'Panel', meta.description || 'İçerik hazırlanıyor.'];
  setText('sheetTitle', title || copy[0]);
  setText('sheetSubtitle', subtitle || copy[1]);
  setSheetIcon(modalKey);
  if (name === 'auth') syncAuthHeader();
  $$('.sheet-section').forEach((section) => section.classList.toggle('is-active', section.dataset.sheet === name));
  const sheetClassMap = { auth: 'is-auth-sheet', forgot: 'is-auth-sheet', profile: 'is-profile-sheet', email: 'is-security-sheet', password: 'is-security-sheet', wheel: 'is-wheel-sheet', market: 'is-market-sheet', notifications: 'is-notification-sheet', promo: 'is-promo-sheet' };
  ['is-auth-sheet','is-profile-sheet','is-security-sheet','is-wheel-sheet','is-market-sheet','is-notification-sheet','is-promo-sheet','is-picker-sheet'].forEach((className) => shell.classList.remove(className));
  if (sheetClassMap[name]) shell.classList.add(sheetClassMap[name]);
  shell.classList.toggle('is-bottom-email', name === 'email');
  shell.classList.toggle('is-wide-profile', name === 'profile' || name === 'wheel' || name === 'market');
  shell.classList.add('is-open');
  shell.setAttribute('aria-hidden', 'false');
  lockBody(true);
  window.setTimeout(() => {
    const target = name === 'auth' ? (currentAuthMode === 'register' ? $('registerFirstName') : $('loginIdentifier')) : name === 'forgot' ? $('forgotEmail') : null;
    try { target?.focus?.({ preventScroll: true }); } catch (_) {}
  }, 60);

  if (!options.skipPreload) {
    if (name === 'wheel') { showSheetLoader('wheel', PRELOAD_TEXT.wheel); setLoadingHTML('wheelPrizeList', PRELOAD_TEXT.wheel); loadWheelConfig().catch((error) => report('home.wheel.config', error)).finally(() => hideSheetLoader('wheel')); }
    if (name === 'market') { showSheetLoader('market', PRELOAD_TEXT.market); loadMarket({ force: true }).catch((error) => report('home.market.load', error)).finally(() => hideSheetLoader('market')); }
    if (name === 'profile') { showSheetLoader('profile', PRELOAD_TEXT.profile); setAccountTab('profile'); loadProfile().catch((error) => report('home.profile.open', error)).finally(() => hideSheetLoader('profile')); }
    if (name === 'notifications') { showSheetLoader('notifications', PRELOAD_TEXT.notifications); setLoadingHTML('notificationList', PRELOAD_TEXT.notifications); loadNotifications({ force: true }).catch((error) => report('home.notifications.open', error)).finally(() => hideSheetLoader('notifications')); }
    if (name === 'email') { syncEmailModalMode(); briefSheetLoader('email', PRELOAD_TEXT.email, 260); }
    if (name === 'password') briefSheetLoader('password', PRELOAD_TEXT.password, 220);
    if (name === 'promo') briefSheetLoader('promo', PRELOAD_TEXT.promo, 160);
    if (name === 'forgot') briefSheetLoader('forgot', 'Şifre Sıfırlama Yükleniyor...', 160);
  }
}

function closeSheet(force = false) {
  const forced = force === true;
  const shell = $('sheetShell');
  if (!shell) return;
  if (!forced && sheetReturnTarget?.sheet === 'profile' && ['email', 'password'].includes(activeSheet)) {
    returnToProfileSecuritySheet();
    return;
  }
  sheetReturnTarget = null;
  shell.classList.remove('is-open', 'is-bottom-email', 'is-wide-profile', 'is-wheel-sheet', 'is-auth-sheet', 'is-profile-sheet', 'is-security-sheet', 'is-market-sheet', 'is-notification-sheet', 'is-promo-sheet', 'is-picker-sheet', 'is-loading-only');
  shell.setAttribute('aria-hidden', 'true');
  shell.removeAttribute('data-modal-key');
  shell.removeAttribute('data-modal-size');
  activeSheet = '';
  lockBody(false);
}

function toggleDropdown(force) {
  const topUser = $('topUser');
  const trigger = $('profileTrigger');
  const dropdown = $('userDropdown');
  if (!topUser || !trigger || !dropdown) return false;
  const signed = !!auth.currentUser || document.body.classList.contains('is-authenticated');
  if (!signed) {
    topUser.classList.remove('is-open', 'pm-dropdown-open');
    document.body.classList.remove('pm-dropdown-active');
    trigger.setAttribute('aria-expanded', 'false');
    dropdown.setAttribute('aria-hidden', 'true');
    dropdown.style.setProperty('--pm-dropdown-shift-x', '0px');
    return false;
  }
  const next = typeof force === 'boolean' ? force : !topUser.classList.contains('pm-dropdown-open');
  topUser.classList.toggle('is-open', next);
  topUser.classList.toggle('pm-dropdown-open', next);
  document.body.classList.toggle('pm-dropdown-active', next);
  trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
  dropdown.setAttribute('aria-hidden', next ? 'false' : 'true');
  if (next) {
    dropdown.style.setProperty('--pm-dropdown-shift-x', '0px');
    window.requestAnimationFrame(() => {
      const rect = dropdown.getBoundingClientRect();
      const overflowRight = Math.max(0, rect.right - window.innerWidth + 10);
      const overflowLeft = Math.max(0, 10 - rect.left);
      const shift = overflowRight ? -overflowRight : overflowLeft ? overflowLeft : 0;
      dropdown.style.setProperty('--pm-dropdown-shift-x', `${shift}px`);
      try { dropdown.focus({ preventScroll: true }); } catch (_) {}
    });
  }
  return next;
}

function rebuildProfileDropdownController() {
  const topUser = $('topUser');
  let trigger = $('profileTrigger');
  let dropdown = $('userDropdown');
  if (!topUser || !trigger || !dropdown || topUser.dataset.dropdownController === 'v20-rebuilt') return;

  const freshTrigger = trigger.cloneNode(true);
  trigger.replaceWith(freshTrigger);
  trigger = freshTrigger;

  const freshDropdown = dropdown.cloneNode(true);
  dropdown.replaceWith(freshDropdown);
  dropdown = freshDropdown;

  topUser.dataset.dropdownController = 'v20-rebuilt';
  topUser.classList.remove('is-open', 'pm-dropdown-open');
  dropdown.setAttribute('aria-hidden', 'true');
  dropdown.setAttribute('tabindex', '-1');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('data-pm-dropdown-trigger', 'true');

  let lastPointerToggleAt = 0;
  const toggleFromUserAction = (event) => {
    event.preventDefault();
    event.stopPropagation();
    lastPointerToggleAt = Date.now();
    toggleDropdown();
  };

  trigger.addEventListener('pointerup', toggleFromUserAction, { passive: false });
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() - lastPointerToggleAt < 650) return;
    toggleDropdown();
  }, { passive: false });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    toggleDropdown();
  });

  dropdown.addEventListener('pointerdown', (event) => event.stopPropagation(), { passive: true });
  dropdown.addEventListener('click', (event) => event.stopPropagation());

  document.addEventListener('pointerdown', (event) => {
    if (!topUser.contains(event.target)) toggleDropdown(false);
  }, { capture: true, passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleDropdown(false);
  });
  window.addEventListener('resize', () => toggleDropdown(false), { passive: true });
  window.addEventListener('scroll', () => { if (topUser.classList.contains('pm-dropdown-open')) toggleDropdown(false); }, { passive: true });
}

function renderGames() {
  const grid = $('gamesGrid');
  const empty = $('gamesEmpty');
  if (!grid) return;
  const query = gameSearch.toLowerCase();
  const games = HOME_GAMES.filter((game) => {
    const matchesFilter = gameFilter === 'all' || game.category === gameFilter;
    const haystack = `${game.name} ${game.desc} ${game.tags?.join(' ')} ${game.keywords || ''}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
  grid.replaceChildren(...games.map((game) => createGameCard(game)));
  empty?.classList.toggle('is-visible', games.length === 0);
  setText('metricGamesCount', HOME_GAMES.length);
}

function winnerTypeMeta(source = '') {
  const key = safeText(source).toLocaleLowerCase('tr-TR');
  if (/promo|promosyon|code|kod/.test(key)) return { type: 'promo', badge: 'Promo', icon: 'fa-ticket', title: 'Promo Kodu' };
  if (/wheel|çark|cark|spin/.test(key)) return { type: 'wheel', badge: 'Çark', icon: 'fa-dharmachakra', title: 'Günlük Çark' };
  if (/market|store|mağaza|magaza|purchase|satın|satin/.test(key)) return { type: 'market', badge: 'Market', icon: 'fa-store', title: 'Market İşlemi' };
  if (/level|seviye|xp/.test(key)) return { type: 'level', badge: 'Seviye', icon: 'fa-star', title: 'Seviye Gelişimi' };
  if (/crash|chess|satranç|satranc|pisti|pişti|pattern|space|snake|game|oyun|win|kazanç|kazanc/.test(key)) return { type: 'game', badge: 'Oyun', icon: 'fa-trophy', title: 'Oyun Kazancı' };
  return { type: 'activity', badge: 'Canlı', icon: 'fa-bolt', title: 'Canlı Akış' };
}

function maskActivityUsername(value = '') {
  const raw = safeText(value || 'Oyuncu').replace(/^@+/, '');
  if (!raw || raw.toLocaleLowerCase('tr-TR') === 'oyuncu') return '@oy***cu';
  if (raw.includes('*')) return raw.startsWith('@') ? raw : `@${raw}`;
  if (raw.length <= 3) return `@${raw[0] || 'o'}***`;
  return `@${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

function isProfileOnlyActivity(item = {}) {
  const key = safeText([
    item.source, item.type, item.eventType, item.category, item.action,
    item.title, item.message, item.body, item.description, item.code
  ].filter(Boolean).join(' ')).toLocaleLowerCase('tr-TR');
  if (!key) return false;
  const isProfileChange = /(profile|profil|avatar|frame|çerçeve|cerceve|account|hesap|appearance|settings|ayar)/.test(key);
  const isRewardOrGame = /(promo|promosyon|wheel|çark|cark|market|store|purchase|satın|satin|crash|chess|satranç|satranc|pisti|pişti|pattern|space|snake|game|oyun|win|winner|kazanç|kazanc|reward|ödül|odul|xp|level|seviye|mc)/.test(key);
  return isProfileChange && !isRewardOrGame;
}

function normalizeWinnerAmountLabel(item = {}, amount = 0) {
  const xp = Math.max(0, Math.trunc(toNumber(item.xp ?? item.xpAmount ?? 0, 0)));
  const rewardText = safeText(item.rewardLabel || item.rewardSummary || item.rewardText || item.prizeText || '');
  if (rewardText) return rewardText;
  if (amount > 0) return `${money(amount)} MC`;
  if (xp > 0) return `${money(xp)} XP`;
  return 'İşlem tamamlandı';
}

function safeWinnerBadge(value = '', fallback = 'Canlı') {
  const raw = safeText(value || fallback || 'Canlı');
  if (!raw || /render\s*memory|firebase|sunucu|backend|server|endpoint|socket|http\s*\d{3}|internal|exception/i.test(raw)) return fallback;
  return raw.slice(0, 32);
}

function normalizeHomeWinnerItem(item = {}, index = 0) {
  const amount = Math.max(0, Math.trunc(toNumber(item.amount ?? item.reward ?? item.value ?? item.win ?? item.mc ?? 0, 0)));
  const source = safeText(item.source || item.type || item.eventType || item.category || '');
  const meta = winnerTypeMeta(source || item.title || item.gameName || item.action);
  const gameName = safeText(item.gameName || item.game || item.title || item.label || '');
  const username = maskActivityUsername(item.maskedUsername || item.usernameMasked || item.username || item.displayName || item.user || 'Oyuncu');
  const title = safeText(item.title || (meta.type === 'game' && gameName ? gameName : meta.title) || `Kayıt ${index + 1}`) || `Kayıt ${index + 1}`;
  const image = safeText(item.thumbnail || item.image || item.cover || item.gameImage || item.asset || '/public/assets/images/logo.png') || '/public/assets/images/logo.png';
  const at = Math.max(0, Math.trunc(toNumber(item.at || item.createdAt || item.time || item.timestamp || item.claimedAt || item.settledAt || Date.now(), Date.now())));
  const timeLabel = notificationTimeLabel(at) || 'Şimdi';
  const rewardLabel = normalizeWinnerAmountLabel(item, amount);
  const action = safeText(item.action || item.message || item.body || item.description || '');
  let detail = meta.type === 'promo' ? `${username} promo kazancı aldı${rewardLabel ? `: ${rewardLabel}` : ''}.` : action;
  if (!detail) {
    if (meta.type === 'promo') detail = `${username} promo kazancı aldı${rewardLabel ? `: ${rewardLabel}` : ''}.`;
    else if (meta.type === 'wheel') detail = `${username} çarktan ${rewardLabel} kazandı.`;
    else if (meta.type === 'game') detail = `${username} ${gameName || 'oyun'} içinde ${rewardLabel} kazandı.`;
    else if (meta.type === 'market') detail = `${username} marketten ${rewardLabel} işlemi yaptı.`;
    else if (meta.type === 'level') detail = `${username} seviye ve XP gelişimi kazandı.`;
    else detail = `${username} yeni bir aktivite gerçekleştirdi.`;
  }
  const badge = safeWinnerBadge(item.badge || meta.badge || 'Canlı', meta.badge || 'Canlı');
  return { title, username, amount, image, badge, detail, timeLabel, type: meta.type, icon: meta.icon, rewardLabel };
}

function renderHomeRecentWinners(items = []) {
  const host = $('homeWinnersList');
  if (!host) return;
  const winners = Array.isArray(items) ? items.filter((item) => !isProfileOnlyActivity(item)).map(normalizeHomeWinnerItem).slice(0, 12) : [];
  if (!winners.length) {
    host.innerHTML = '<div class="winners-empty-final"><i class="fa-solid fa-gem"></i><strong>Henüz kazanan kaydı yok.</strong><span>Oyun kazancı, promo kullanımı ve çark ödülleri geldiğinde bu alanda canlı olarak görünecek.</span></div>';
    return;
  }
  host.replaceChildren(...winners.map((winner) => {
    const row = document.createElement('article');
    row.className = `home-winners-item home-winners-item--${winner.type}`;
    row.style.setProperty('--winner-index', String(winners.indexOf(winner)));

    const rank = document.createElement('span');
    rank.className = 'home-winners-rank';
    rank.textContent = String(winners.indexOf(winner) + 1);

    const thumb = document.createElement('div');
    thumb.className = 'home-winners-thumb';
    const img = document.createElement('img');
    img.src = winner.image;
    img.alt = `${winner.title} görseli`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => { if (img.src !== '/public/assets/images/logo.png') img.src = '/public/assets/images/logo.png'; }, { once: true });
    const icon = document.createElement('span');
    icon.className = 'home-winners-type-icon';
    icon.innerHTML = `<i class="fa-solid ${winner.icon}"></i>`;
    thumb.append(img, icon);

    const copy = document.createElement('div');
    copy.className = 'home-winners-copy';
    const top = document.createElement('span');
    top.className = 'home-winners-topline';
    const title = document.createElement('strong');
    title.textContent = winner.title;
    const time = document.createElement('em');
    time.textContent = winner.timeLabel;
    top.append(title, time);
    const detail = document.createElement('span');
    detail.className = 'home-winners-detail';
    detail.textContent = winner.detail;
    const user = document.createElement('span');
    user.className = 'home-winners-user';
    user.textContent = winner.username;
    const amount = document.createElement('b');
    amount.textContent = winner.rewardLabel;
    copy.append(top, detail, user, amount);

    const badge = document.createElement('span');
    badge.className = 'home-winners-badge';
    badge.textContent = winner.badge || 'Canlı';

    row.append(rank, thumb, copy, badge);
    return row;
  }));
}

function applyHomeRecentActivityPayload(payload = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.activities) ? payload.activities : [];
  const single = payload?.item || payload?.activity || payload?.winner || null;
  const incoming = (single ? [single, ...items] : items).filter((item) => !isProfileOnlyActivity(item));
  if (!incoming.length) return;
  const existing = Array.isArray(homeWinnersPayload) ? homeWinnersPayload : [];
  const next = [];
  const seen = new Set();
  [...incoming, ...existing].forEach((item) => {
    const key = safeText(item?.id || `${item?.source || item?.type || 'activity'}:${item?.username || item?.user || ''}:${item?.amount || item?.xp || ''}:${item?.at || item?.createdAt || ''}`);
    if (seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });
  homeWinnersPayload = next.slice(0, 20);
  homeWinnersLoadedAt = Date.now();
  renderHomeRecentWinners(homeWinnersPayload);
}

async function loadHomeRecentWinners({ force = false } = {}) {
  const host = $('homeWinnersList');
  if (!host) return homeWinnersPayload;
  if (homeWinnersLoading) return homeWinnersPayload;
  const nowTs = Date.now();
  if (!force && homeWinnersPayload.length && (nowTs - homeWinnersLoadedAt) < HOME_WINNERS_CACHE_MS) {
    renderHomeRecentWinners(homeWinnersPayload);
    return homeWinnersPayload;
  }
  homeWinnersLoading = true;
  const endpoint = '/api/home/recent-activities?limit=5';
  const softFallbackTimer = window.setTimeout(() => {
    if (!homeWinnersLoading) return;
    host.innerHTML = '<div class="winners-empty-final"><i class="fa-solid fa-trophy"></i><strong>Kazanan akışı bekleniyor.</strong><span>Yeni oyun kazancı, promo veya çark ödülü geldiğinde burada görünecek.</span></div>';
  }, 900);
  host.innerHTML = '<div class="loader-card"><i class="fa-solid fa-spinner fa-spin"></i> Kazanan verileri hazırlanıyor.</div>';
  let payload = null;
  let lastError = null;
  try {
    payload = await apiFetch(endpoint, { timeoutMs: 1200 }, false, false);
  } catch (error) {
    lastError = error;
    payload = { items: [] };
  }
  if (lastError && !/load failed|failed to fetch|network|abort|timeout/i.test(String(lastError?.message || lastError || ''))) {
    report('home.recentWinners.load', lastError, { endpoint, status: lastError?.status || 0 });
  }
  window.clearTimeout(softFallbackTimer);
  homeWinnersLoading = false;
  homeWinnersPayload = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.activities) ? payload.activities : Array.isArray(payload?.winners) ? payload.winners : [];
  homeWinnersLoadedAt = Date.now();
  renderHomeRecentWinners(homeWinnersPayload);
  return homeWinnersPayload;
}

function isHomeLiveRefreshAllowed() {
  const path = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const isHomePath = path === '/' || /\/index\.html$/i.test(path);
  return isHomePath && !document.hidden && document.visibilityState !== 'hidden';
}

async function refreshHomeLivePanels(reason = 'interval') {
  if (!isHomeLiveRefreshAllowed()) return null;
  if (homeLiveRefreshPromise) return homeLiveRefreshPromise;
  homeLiveRefreshPromise = Promise.allSettled([
    loadLeaderboard({ force: true, reason }),
    loadHomeRecentWinners({ force: true, reason })
  ]).finally(() => {
    homeLiveRefreshLastAt = Date.now();
    homeLiveRefreshPromise = null;
  });
  return homeLiveRefreshPromise;
}

function stopHomeLiveRefresh() {
  if (homeLiveRefreshTimer) window.clearInterval(homeLiveRefreshTimer);
  homeLiveRefreshTimer = 0;
}

function startHomeLiveRefresh({ immediate = false, reason = 'start' } = {}) {
  stopHomeLiveRefresh();
  if (!isHomeLiveRefreshAllowed()) return;
  if (immediate) refreshHomeLivePanels(reason).catch((error) => report('home.liveRefresh.immediate', error));
  homeLiveRefreshTimer = window.setInterval(() => {
    if (!isHomeLiveRefreshAllowed()) {
      stopHomeLiveRefresh();
      return;
    }
    refreshHomeLivePanels('interval-15s').catch((error) => report('home.liveRefresh.interval', error));
  }, HOME_LIVE_REFRESH_MS);
}

function bindHomeLiveRefreshLifecycle() {
  if (homeLiveRefreshLifecycleBound) return;
  homeLiveRefreshLifecycleBound = true;
  const resume = (reason) => {
    startHomeLiveRefresh({ immediate: true, reason });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopHomeLiveRefresh();
    else resume('visibility-return');
  }, { passive: true });
  window.addEventListener('pageshow', () => resume('pageshow-return'), { passive: true });
  window.addEventListener('focus', () => {
    if (Date.now() - homeLiveRefreshLastAt >= HOME_LIVE_REFRESH_MS) resume('window-focus');
  }, { passive: true });
  window.addEventListener('pagehide', stopHomeLiveRefresh, { passive: true });
}

function gameRgb(game) {
  const raw = String(game.color || '').replace(/[^0-9,]/g, '');
  return raw || '69,162,255';
}

function createGameCard(game) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'game-card game-card--final game-card--clean';
  card.style.setProperty('--game-rgb', gameRgb(game));
  card.setAttribute('aria-label', `${game.name} oyununu aç`);
  card.dataset.access = game.access || '';
  card.dataset.requiresAuth = game.access === 'auth' ? 'true' : 'false';
  card.dataset.href = game.url || '/';
  card.dataset.gameName = game.name || '';

  const media = document.createElement('div');
  media.className = 'game-card-media';

  const image = document.createElement('img');
  image.className = 'game-card-image';
  image.src = gameImageUrl(game);
  image.alt = `${game.name} oyun kartı görseli`;
  image.dataset.fallback = versionedPublicAsset(HOME_GAME_IMAGE_FALLBACK);
  image.addEventListener('error', () => {
    if (image.dataset.fallbackApplied === 'true') { image.hidden = true; media.classList.add('game-card-media--image-missing'); return; }
    image.dataset.fallbackApplied = 'true';
    image.src = image.dataset.fallback || HOME_GAME_IMAGE_FALLBACK;
    media.classList.add('game-card-media--fallback');
  }, { once: false });
  image.loading = 'lazy';
  image.decoding = 'async';
  image.draggable = false;

  const glow = document.createElement('span');
  glow.className = 'game-card-animated-border';
  glow.setAttribute('aria-hidden', 'true');

  const overlay = document.createElement('div');
  overlay.className = 'game-card-overlay game-card-overlay--clean';

  const topLeft = document.createElement('span');
  topLeft.className = 'game-card-logo-pill';
  topLeft.innerHTML = '<img src="/public/assets/images/logo.png" alt="" aria-hidden="true" /><b>PLAY</b>';

  const topBadge = document.createElement('span');
  topBadge.className = 'game-card-top-badge';
  topBadge.innerHTML = `<i class="fa-solid ${game.category === 'online' ? 'fa-bolt' : 'fa-star'}"></i><span>${safeText(game.badge || (game.category === 'online' ? 'Canlı' : 'Klasik'))}</span>`;

  const bottom = document.createElement('div');
  bottom.className = 'game-card-bottomline';

  const cta = document.createElement('span');
  cta.className = 'game-card-cta game-card-cta--overlay';
  cta.innerHTML = '<span>Oyuna Gir</span><i class="fa-solid fa-arrow-right"></i>';

  const activity = document.createElement('span');
  activity.className = 'game-card-active-count';
  const count = Math.max(0, Math.trunc(toNumber(game.onlineCount ?? game.players ?? game.activeUsers ?? 0, 0)));
  activity.innerHTML = `<i class="fa-solid fa-user-group" aria-hidden="true"></i><span>${count ? money(count) : 'Aktif'}</span>`;

  bottom.append(cta, activity);
  overlay.append(topLeft, topBadge, bottom);
  media.append(image, overlay);
  card.append(glow, media);
  card.addEventListener('click', () => openGame(game));
  return card;
}

async function openGame(game) {
  const statusText = String(game?.status || game?.state || '').trim().toLocaleLowerCase('tr-TR');
  const maintenanceMessage = 'Bu oyun şu an bakımda. Daha sonra tekrar deneyin.';
  const explicitMaintenanceState = ['bakım', 'bakim', 'maintenance', 'maintenance_active'].includes(statusText);
  if (game?.maintenance === true || game?.disabled === true || game?.access === 'disabled' || explicitMaintenanceState) {
    showToast(game?.name || 'Oyun', maintenanceMessage, 'warning');
    return;
  }
  try {
    await loadHomeMaintenanceState({ force: true });
    if (isGameInMaintenance(game?.url || game?.key || game?.name || '')) {
      showToast(game?.name || 'Oyun', maintenanceMessage, 'warning');
      return;
    }
  } catch (_) {
    showToast('Bağlantı kontrolü', 'Oyun durumu doğrulanamadı. Lütfen tekrar deneyin.', 'warning');
    return;
  }
  if (game.access === 'auth' && !ensureAuthThen(game.name)) return;
  window.location.assign(game.url || '/');
}

function updateHeroCarousel(nextIndex = 0) {
  const track = $('homeHeroTrack');
  const slides = $$('.home-hero-slide', track || document);
  const dots = $$('#homeHeroDots [data-hero-dot]');
  if (!track || !slides.length) return;
  heroCarouselIndex = ((Number(nextIndex) || 0) + slides.length) % slides.length;
  track.style.transform = `translate3d(-${heroCarouselIndex * 100}%, 0, 0)`;
  slides.forEach((slide, index) => slide.classList.toggle('is-active', index === heroCarouselIndex));
  dots.forEach((dot, index) => dot.classList.toggle('is-active', index === heroCarouselIndex));
}

function restartHeroCarousel() {
  if (heroCarouselTimer) window.clearInterval(heroCarouselTimer);
  heroCarouselTimer = window.setInterval(() => updateHeroCarousel(heroCarouselIndex + 1), 5200);
}

function initHeroCarousel() {
  const carousel = $('homeHeroCarousel');
  const track = $('homeHeroTrack');
  if (!carousel || !track) return;
  $$('#homeHeroDots [data-hero-dot]').forEach((dot) => {
    dot.addEventListener('click', () => {
      updateHeroCarousel(toNumber(dot.dataset.heroDot, 0));
      restartHeroCarousel();
    });
  });
  $('homeHeroPrev')?.addEventListener('click', () => {
    updateHeroCarousel(heroCarouselIndex - 1);
    restartHeroCarousel();
  });
  $('homeHeroNext')?.addEventListener('click', () => {
    updateHeroCarousel(heroCarouselIndex + 1);
    restartHeroCarousel();
  });
  carousel.addEventListener('mouseenter', () => {
    if (heroCarouselTimer) window.clearInterval(heroCarouselTimer);
  });
  carousel.addEventListener('mouseleave', restartHeroCarousel);
  carousel.addEventListener('touchstart', () => {
    if (heroCarouselTimer) window.clearInterval(heroCarouselTimer);
  }, { passive: true });
  carousel.addEventListener('touchend', restartHeroCarousel, { passive: true });
  updateHeroCarousel(0);
  restartHeroCarousel();
}

function fallbackLeaderboardPayload() {
  return {
    ok: true,
    offlineFallback: true,
    generatedAt: Date.now(),
    tabs: {
      level: { label: 'Hesap Seviyesi', metricKey: 'accountXp', items: [] },
      activity: { label: 'Aylık Aktiflik', metricKey: 'monthlyActiveScore', items: [] }
    }
  };
}

async function loadLeaderboard(options = {}) {
  const force = !!options.force;
  const area = $('leaderboardListArea');
  const nowTs = Date.now();
  if (leaderboardLoading) return leaderboardPayload;
  if (!force && leaderboardPayload && (nowTs - leaderboardLoadedAt) < LEADERBOARD_CACHE_MS) {
    renderLeaderboard();
    return leaderboardPayload;
  }
  leaderboardLoading = true;
  let fallbackRendered = false;
  const softFallbackTimer = window.setTimeout(() => {
    if (!leaderboardLoading || !area) return;
    fallbackRendered = true;
    area.innerHTML = '<div class="pm-leaderboard-empty"><i class="fa-solid fa-ranking-star"></i><strong>Liderlik verisi hazırlanıyor.</strong><span>Veri gecikirse Yenile butonuyla tekrar deneyebilirsin.</span></div>';
  }, 1000);
  if (area) area.innerHTML = '<div class="loader-card"><i class="fa-solid fa-spinner fa-spin"></i> Liderlik verileri hazırlanıyor.</div>';
  try {
    leaderboardPayload = await apiFetch('/api/leaderboard?limit=10', { timeoutMs: 2600 }, false);
    leaderboardLoadedAt = Date.now();
  } catch (error) {
    leaderboardPayload = fallbackLeaderboardPayload();
    leaderboardLoadedAt = Date.now();
    if (!/load failed|failed to fetch|network|abort|timeout/i.test(String(error?.message || error || ''))) {
      report('home.leaderboard.load', error, {
        reason: 'Liderlik API cevabı beklenen JSON sözleşmesini döndürmedi.',
        solution: '/api/leaderboard route çıktısı ve Render API sağlığı kontrol edilmeli.'
      });
    }
  } finally {
    window.clearTimeout(softFallbackTimer);
    leaderboardLoading = false;
  }
  renderLeaderboard();
  return leaderboardPayload;
}

function normalizeLeaderboardItem(item = {}, index = 0) {
  const profile = normalizeProfile(item.user || item.profile || item);
  const frameSlot = item.cosmeticSlots && typeof item.cosmeticSlots === 'object' ? item.cosmeticSlots.frame : null;
  const marketFrameId = safeText(item.marketFrameId || profile.marketFrameId || item.marketEquipped?.frame || item.equippedMarket?.frame || item.marketEquipped?.frames || item.equippedMarket?.frames || (frameSlot?.source === 'market' ? frameSlot?.itemId : '') || '');
  const marketFrameUrl = marketFrameId ? (resolveProfileMarketFramePath(item) || resolveProfileMarketFramePath(profile) || resolveMarketFramePath(item.marketFrameUrl || profile.marketFrameUrl || item.frameUrl || profile.frameUrl || '', marketFrameId)) : '';
  return {
    uid: safeText(item.uid || profile.uid || `rank-${index}`),
    username: safeText(item.username || profile.username || `Oyuncu ${index + 1}`),
    avatar: normalizeAvatarUrl(item.avatar || profile.avatar, fallbackAvatar),
    selectedFrame: marketFrameUrl ? 0 : Math.max(0, Math.trunc(toNumber(item.selectedFrame ?? item.frame ?? profile.selectedFrame, 0))),
    marketFrameUrl,
    marketFrameId,
    profileBadgeId: safeText(item.profileBadgeId || profile.profileBadgeId || item.marketEquipped?.badge || item.equippedMarket?.badge || item.marketEquipped?.badges || item.equippedMarket?.badges || ''),
    profileBadgeUrl: safeText(item.profileBadgeUrl || profile.profileBadgeUrl || ''),
    profileBadgeClass: safeText(item.profileBadgeClass || profile.profileBadgeClass || ''),
    nameEffectId: safeText(item.nameEffectId || profile.nameEffectId || item.marketEquipped?.nameEffect || item.equippedMarket?.nameEffect || item.marketEquipped?.['animated-name-effects'] || item.equippedMarket?.['animated-name-effects'] || ''),
    nameEffectClass: safeText(item.nameEffectClass || profile.nameEffectClass || ''),
    statsCardThemeId: safeText(item.statsCardThemeId || profile.statsCardThemeId || item.marketEquipped?.statTheme || item.equippedMarket?.statTheme || item.marketEquipped?.['stats-card-themes'] || item.equippedMarket?.['stats-card-themes'] || ''),
    statsCardThemeClass: safeText(item.statsCardThemeClass || profile.statsCardThemeClass || ''),
    rank: Math.max(1, Math.trunc(toNumber(item.rank, index + 1))),
    level: Math.max(1, Math.trunc(toNumber(item.accountLevel ?? item.level ?? profile.accountLevel, 1))),
    activity: Math.max(0, Math.trunc(toNumber(item.monthlyActiveScore ?? item.activity ?? profile.monthlyActiveScore, 0))),
    xp: Math.max(0, Math.trunc(toNumber(item.accountXp ?? item.xp ?? profile.accountXp, 0)))
  };
}

function makeLeaderboardCard(item, index, mode = 'row') {
  const row = document.createElement('button');
  row.type = 'button';
  const topClass = index < 3 ? ` is-rank-${index + 1}` : '';
  row.className = `pm-leaderboard-row pm-leaderboard-row--${mode}${topClass}`;
  row.classList.toggle('pm-market-stat-theme-matrix-gold', hasStatsTheme(item));
  row.dataset.pmStatsTheme = hasStatsTheme(item) ? 'true' : 'false';
  row.setAttribute('aria-label', `${item.username} oyuncu detayını aç`);

  const rank = document.createElement('span');
  rank.className = 'pm-leaderboard-rank';
  rank.textContent = String(item.rank || index + 1);

  const avatarWrap = document.createElement('span');
  avatarWrap.className = 'pm-leaderboard-avatar-wrap';
  const avatar = document.createElement('span');
  avatar.className = 'pm-leaderboard-avatar pm-avatar-host';
  avatarWrap.appendChild(avatar);

  const copy = document.createElement('span');
  copy.className = 'pm-leaderboard-copy';
  const nameLine = document.createElement('span');
  nameLine.className = 'pm-leaderboard-name-line';
  const name = document.createElement('strong');
  name.textContent = item.username;
  applyNameEffectToNode(name, item);
  nameLine.appendChild(name);
  const inlineBadge = createProfileBadgeNode(item, index === 0 ? 'sm' : 'xs', 'pm-inline-market-badge');
  if (inlineBadge) nameLine.appendChild(inlineBadge);
  const meta = document.createElement('small');
  meta.textContent = leaderboardTab === 'activity'
    ? `Seviye ${item.level} · ${money(item.xp)} XP`
    : `Aktiflik ${money(item.activity)} · ${money(item.xp)} XP`;
  copy.append(nameLine, meta);

  const score = document.createElement('span');
  score.className = 'pm-leaderboard-score';
  const scoreValue = leaderboardTab === 'activity' ? money(item.activity) : `Lv ${item.level}`;
  score.innerHTML = `<i class="fa-solid fa-coins"></i><b>${scoreValue}</b>`;

  if (mode === 'podium') {
    const crown = document.createElement('span');
    crown.className = 'pm-leaderboard-crown';
    crown.innerHTML = '<i class="fa-solid fa-crown"></i>';
    row.append(crown, rank, avatarWrap, copy, score);
    mountAvatar(avatar, { avatar: item.avatar, frame: item.selectedFrame, frameUrl: item.marketFrameUrl, marketFrameId: item.marketFrameId, variant: 'leaderboard', size: index === 0 ? 78 : 64 });
    clearProfileBadges(avatar);
  } else {
    row.append(rank, avatarWrap, copy, score);
    mountAvatar(avatar, { avatar: item.avatar, frame: item.selectedFrame, frameUrl: item.marketFrameUrl, marketFrameId: item.marketFrameId, variant: 'leaderboard', size: 46 });
    clearProfileBadges(avatar);
  }
  row.addEventListener('click', () => showPlayerStats(item.uid, item));
  return row;
}

function renderLeaderboard() {
  const area = $('leaderboardListArea');
  if (!area) return;
  $$('#leaderboardTabs [data-lb-tab]').forEach((button) => {
    const active = button.dataset.lbTab === leaderboardTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const raw = leaderboardPayload?.tabs?.[leaderboardTab]?.items || [];
  const items = raw.map(normalizeLeaderboardItem).slice(0, LEADERBOARD_LIMIT);
  if (!items.length) {
    area.innerHTML = '<div class="pm-leaderboard-empty"><i class="fa-solid fa-ranking-star"></i><strong>Henüz liderlik verisi yok.</strong><span>Gerçek oyuncu verileri oluştuğunda sıralama burada görünecek.</span></div>';
    return;
  }

  const board = document.createElement('section');
  board.className = 'pm-leaderboard-board';

  const title = document.createElement('div');
  title.className = 'pm-leaderboard-title';
  title.innerHTML = '<span></span><b>LEADERBOARD</b><span></span>';

  const podium = document.createElement('div');
  podium.className = 'pm-leaderboard-podium pm-leaderboard-podium--snow';
  items.slice(0, 3).forEach((item, index) => podium.appendChild(makeLeaderboardCard(item, index, 'podium')));

  const list = document.createElement('div');
  list.className = 'pm-leaderboard-list pm-leaderboard-list--top10';
  items.slice(3, 10).forEach((item, offset) => list.appendChild(makeLeaderboardCard(item, offset + 3, 'list')));

  board.append(title, podium);
  if (items.length > 3) board.appendChild(list);
  area.replaceChildren(board);
}

async function showPlayerStats(uid, seed = null) {
  if (!auth.currentUser) {
    setAuthMode('login');
    openSheet('auth', 'Giriş gerekli', 'Liderlik oyuncu istatistiklerini görüntülemek için önce hesabına giriş yapmalısın.');
    return;
  }
  const content = $('playerStatsContent');
  if (!content) return;
  const render = (profile, message = '') => {
    const p = normalizeProfile(profile || seed || {});
    content.replaceChildren();
    const header = document.createElement('div');
    header.className = 'ps-modal-header player-detail-header pm-modal-head';
    const headIcon = document.createElement('span');
    headIcon.className = 'pm-modal-head-icon';
    headIcon.setAttribute('aria-hidden', 'true');
    headIcon.innerHTML = '<i class="fa-solid fa-chart-simple"></i>';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'pm-modal-head-copy';
    const title = document.createElement('div');
    title.className = 'ps-modal-title';
    title.id = 'playerStatsTitle';
    title.textContent = p.username || 'Oyuncu Detayı';
    const subtitle = document.createElement('div');
    subtitle.className = 'sheet-subtitle';
    subtitle.textContent = 'Seviye, aktivite ve performans özetini görüntüle.';
    titleWrap.append(title, subtitle);
    const close = document.createElement('button');
    close.className = 'ps-modal-close pm-modal-close';
    close.type = 'button';
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    close.addEventListener('click', () => closeMatrixModal('playerStatsModal'));
    header.append(headIcon, titleWrap, close);

    const body = document.createElement('div');
    body.className = 'ps-modal-body player-detail-body';
    const hero = document.createElement('section');
    hero.className = 'player-detail-hero';
    const av = document.createElement('span');
    av.className = 'player-detail-avatar pm-avatar-host';
    const copy = document.createElement('div');
    const nameLine = document.createElement('span');
    nameLine.className = 'pm-leaderboard-name-line player-detail-name-line';
    const name = document.createElement('strong');
    name.textContent = p.username || 'Oyuncu';
    applyNameEffectToNode(name, p);
    nameLine.appendChild(name);
    const detailBadge = createProfileBadgeNode(p, 'sm', 'pm-inline-market-badge');
    if (detailBadge) nameLine.appendChild(detailBadge);
    const meta = document.createElement('span');
    meta.textContent = `Seviye ${p.accountLevel} · Aktiflik ${money(p.monthlyActiveScore)} · ${p.emailVerified ? 'Doğrulanmış hesap' : 'Doğrulama bekliyor'}`;
    copy.append(nameLine, meta);
    hero.append(av, copy);

    const grid = document.createElement('div');
    grid.className = 'player-detail-grid';
    renderStatsDashboard(grid, p);
    if (message) {
      const note = document.createElement('div');
      note.className = 'field-help is-error player-detail-note';
      note.textContent = message;
      body.appendChild(note);
    }
    body.appendChild(grid);
    content.append(header, body);
  };
  showModalGateLoader(PRELOAD_TEXT.stats);
  try {
    if (!uid) {
      render(seed || { username: 'Oyuncu' });
    } else {
      const payload = await apiFetch(`/api/user-stats/${encodeURIComponent(uid)}`, {}, true);
      render(payload.data || payload.user || payload.profile || payload);
    }
  } catch (error) {
    report('home.player.stats', error);
    showToast('İstatistikler', userErrorText(error, 'Oyuncu verisi şu anda yüklenemedi.'), 'error');
    render(seed || { username: 'Oyuncu' });
  } finally {
    hideModalGateLoader();
  }
  openMatrixModal('playerStatsModal');
}

function wheelPoint(cx, cy, radius, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function wheelArcPath(cx, cy, radiusOuter, radiusInner, startAngle, endAngle) {
  const startOuter = wheelPoint(cx, cy, radiusOuter, endAngle);
  const endOuter = wheelPoint(cx, cy, radiusOuter, startAngle);
  const startInner = wheelPoint(cx, cy, radiusInner, startAngle);
  const endInner = wheelPoint(cx, cy, radiusInner, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${startOuter.x.toFixed(2)} ${startOuter.y.toFixed(2)}`,
    `A ${radiusOuter} ${radiusOuter} 0 ${largeArc} 0 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)}`,
    `L ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)}`,
    `A ${radiusInner} ${radiusInner} 0 ${largeArc} 1 ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)}`,
    'Z'
  ].join(' ');
}

function compactMc(value = 0) {
  const n = Math.max(0, Math.trunc(toNumber(value, 0)));
  if (n >= 1000000) return `${Math.round(n / 100000) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}


function normalizeWheelRewardAmount(reward) {
  if (typeof reward === 'number' || typeof reward === 'string') return Math.max(0, Math.trunc(toNumber(reward, 0)));
  return Math.max(0, Math.trunc(toNumber(reward?.amount ?? reward?.mc ?? reward?.value ?? reward?.reward ?? 0, 0)));
}

function normalizeWheelRewards(rewards = []) {
  const source = Array.isArray(rewards) ? rewards : [];
  const prizes = source.slice(0, 12).map(normalizeWheelRewardAmount).filter(Boolean);
  return prizes.length >= 3 ? prizes : [...DEFAULT_WHEEL_PRIZES];
}

function renderWheelRewards(rewards = []) {
  const disk = $('wheelDisk');
  const segmentRoot = $('wheelSegments');
  if (!disk || !segmentRoot) return;
  const prizes = normalizeWheelRewards(rewards);
  currentWheelPrizes = [...prizes];
  const palette = ['#1677ff', '#6d5cff', '#12c988', '#ffd25e', '#ff4d93', '#46dfff', '#a46dff', '#ff8a3d', '#22d3ee', '#f97316', '#1677ff', '#6d5cff'];
  const angle = 360 / prizes.length;
  const fragment = document.createDocumentFragment();
  try {
    prizes.forEach((amount, index) => {
      const start = index * angle;
      const end = start + angle;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'wheel-svg-segment');
      group.dataset.index = String(index);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', wheelArcPath(210, 210, 176, 78, start, end));
      path.setAttribute('fill', palette[index % palette.length]);
      path.setAttribute('stroke', 'rgba(255,255,255,.76)');
      path.setAttribute('stroke-width', '2');
      group.appendChild(path);

      const center = start + angle / 2;
      const labelPoint = wheelPoint(210, 210, 126, center);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'wheel-svg-prize');
      label.setAttribute('x', labelPoint.x.toFixed(2));
      label.setAttribute('y', labelPoint.y.toFixed(2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('transform', `rotate(${center} ${labelPoint.x.toFixed(2)} ${labelPoint.y.toFixed(2)})`);
      const first = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      first.setAttribute('x', labelPoint.x.toFixed(2));
      first.setAttribute('dy', '-0.12em');
      first.textContent = compactMc(amount);
      const second = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      second.setAttribute('x', labelPoint.x.toFixed(2));
      second.setAttribute('dy', '1.15em');
      second.textContent = 'MC';
      label.append(first, second);
      group.appendChild(label);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const dotPoint = wheelPoint(210, 210, 184, center);
      dot.setAttribute('class', 'wheel-svg-dot');
      dot.setAttribute('cx', dotPoint.x.toFixed(2));
      dot.setAttribute('cy', dotPoint.y.toFixed(2));
      dot.setAttribute('r', '4.2');
      group.appendChild(dot);
      fragment.appendChild(group);
    });
    if (!fragment.childNodes.length) throw new Error('wheel_segments_empty');
    segmentRoot.replaceChildren(fragment);
    disk.dataset.segmentCount = String(prizes.length);
    disk.classList.add('wheel-disk--svg-ready');
  } catch (error) {
    report('home.wheel.render', error);
    currentWheelPrizes = [...DEFAULT_WHEEL_PRIZES];
    disk.dataset.segmentCount = String(DEFAULT_WHEEL_PRIZES.length);
    disk.classList.remove('wheel-disk--svg-ready');
  }
}

function renderRecentWheelWinners(items = []) {
  const host = $('wheelRecentWinners');
  if (!host) return;
  const winners = Array.isArray(items) ? items.slice(0, 3) : [];
  if (!winners.length) {
    const empty = document.createElement('span');
    empty.className = 'wheel-winner-empty';
    empty.textContent = 'Henüz kazanan kaydı yok.';
    host.replaceChildren(empty);
    return;
  }
  host.replaceChildren(...winners.map((winner, index) => {
    const item = document.createElement('span');
    item.className = 'wheel-winner-chip wheel-winner-chip--pro';
    const medal = document.createElement('i');
    medal.className = 'fa-solid fa-trophy';
    const copy = document.createElement('span');
    copy.className = 'wheel-winner-copy';
    const user = document.createElement('b');
    user.textContent = safeText(winner.username || winner.displayName || 'Oyuncu');
    const amount = document.createElement('strong');
    amount.textContent = normalizeWinnerAmountLabel(winner, Math.max(0, Math.trunc(toNumber(winner.amount ?? winner.reward ?? 0, 0))));
    copy.append(user, amount);
    const order = document.createElement('small');
    order.textContent = `#${index + 1}`;
    item.append(medal, copy, order);
    return item;
  }));
}

async function loadRecentWheelWinners() {
  try {
    const payload = await apiFetch('/api/wheel/recent-winners', {}, false);
    renderRecentWheelWinners(payload.items || payload.winners || []);
  } catch (error) {
    report('home.wheel.recent', error);
    renderRecentWheelWinners([]);
  }
}

async function loadWheelConfig() {
  renderWheelRewards(DEFAULT_WHEEL_PRIZES);
  setWheelLockedState(false);
  try {
    const payload = await apiFetch('/api/wheel/config', {}, false);
    const rewards = Array.isArray(payload.rewards) ? payload.rewards : [];
    renderWheelRewards(rewards);
    renderRecentWheelWinners(payload.recentWinners || []);
    await loadRecentWheelWinners();
    if (auth.currentUser) {
      const status = await apiFetch('/api/wheel/status', {}, true).catch(() => null);
      setWheelLockedState(!!status?.claimed, status?.claimed ? (Number(status?.extraRights || 0) > 0 ? `Ek çark hakkın var. +1 hakkını kullanabilirsin.` : dailyWheelLockedMessage()) : '', Number(status?.extraRights || 0));
    } else {
      setWheelLockedState(false, '');
    }
  } catch (error) {
    report('home.wheel.config', error);
    renderWheelRewards(DEFAULT_WHEEL_PRIZES);
    await loadRecentWheelWinners();
    setWheelLockedState(false, '');
  }
}

async function spinWheel() {
  if (!ensureAuthThen('Günlük çark')) return;
  if (!requireVerifiedEmailForReward('wheel')) {
    setHelp('wheelHelp', 'Çark ödüllerinden yararlanmak için e-postanı doğrulaman gerekiyor.', 'error');
    return;
  }
  const disk = $('wheelDisk');
  const button = $('spinWheelBtn');
  if (button?.dataset.busy === '1') return;
  if (button) { button.dataset.busy = '1'; setWheelButtonBusy('SONUÇ HAZIRLANIYOR'); }
  primeWheelSpinSound();
  try {
    const payload = await apiFetch('/api/wheel/spin', { method: 'POST', body: { username: safeText(currentProfile?.username || currentProfile?.displayName || auth.currentUser?.displayName || '') } }, true);
    const amount = payload.amount || payload.reward?.amount || payload.reward || 0;
    const rewardIndexFromPayload = payload.index ?? payload.reward?.index ?? payload.rewardIndex;
    const segmentCount = Math.max(1, currentWheelPrizes.length || Number(disk?.dataset.segmentCount || 8) || 8);
    const amountIndex = currentWheelPrizes.findIndex((prize) => Number(prize?.amount ?? prize?.mc ?? prize?.value ?? prize) === Number(amount));
    const index = clamp(Math.trunc(toNumber(rewardIndexFromPayload, amountIndex >= 0 ? amountIndex : 0)), 0, segmentCount - 1);
    const segmentAngle = 360 / segmentCount;
    const previousSpin = Number(disk?.dataset.spin || 0) || 0;
    const previousNormalized = ((previousSpin % 360) + 360) % 360;
    const desiredNormalized = (360 - ((index + 0.5) * segmentAngle)) % 360;
    const delta = (desiredNormalized - previousNormalized + 360) % 360;
    const target = previousSpin + 2160 + delta;
    if (disk) {
      disk.classList.remove('is-spinning');
      disk.style.setProperty('--spin', `${previousSpin}deg`);
      window.requestAnimationFrame(() => {
        disk.classList.add('is-spinning');
        startWheelSpinSound();
        disk.style.setProperty('--spin', `${target}deg`);
        disk.dataset.spin = String(target);
        if (button) setWheelButtonBusy('ÇARK DÖNÜYOR');
      });
    }
    const finishDelay = Math.max(4150, Math.trunc(toNumber(payload.revealDelayMs, 4300)));
    wheelRewardRevealUntil = Date.now() + finishDelay;
    scheduleWheelSpinSoundStop(finishDelay);
    const settledRecentWinners = Array.isArray(payload.recentWinners) ? payload.recentWinners : [];
    window.setTimeout(() => {
      stopWheelSpinSound();
      setHelp('wheelHelp', amount ? `${money(amount)} MC hesabına tanımlandı.` : 'Çark sonucu işlendi.', '');
      showWheelRewardToast({ id: payload.notificationId || `wheel:${payload.day || ''}:${amount}`, title: 'Çark Hediyesi', message: amount ? `${money(amount)} MC çark hediyesi hesabına tanımlandı.` : 'Çark hediyen hesabına tanımlandı.', amount });
      if (settledRecentWinners.length) renderRecentWheelWinners(settledRecentWinners);
      else loadRecentWheelWinners().catch(() => null);
    }, finishDelay);
    if (Number(payload?.wheelRightsGranted || 0) > 0) await loadWheelConfig().catch(() => null);
    if (notificationsLoaded) await loadNotifications({ force: true }).catch(() => null);
    if (accountMemoryLoaded) await loadAccountMemory({ force: true }).catch(() => null);
    await loadProfile();
    window.setTimeout(() => {
      const extraRights = Number(payload.extraRights || 0);
      setWheelLockedState(true, extraRights > 0 ? `Ek çark hakkın var. +1 hakkını kullanabilirsin.` : dailyWheelLockedMessage(), extraRights);
    }, finishDelay + 400);
  } catch (error) {
    stopWheelSpinSound();
    const code = String(error?.payload?.error || error?.message || '');
    if (code === 'WHEEL_ALREADY_CLAIMED_TODAY' || code === 'WHEEL_ALREADY_SPUN') {
      setWheelLockedState(true, dailyWheelLockedMessage());
      showToast('Bugünkü çark hakkını kullandın. Yarın 00:00’da tekrar gel.', '', 'info');
    } else {
      const text = userErrorText(error, 'Çark çevrilemedi.');
      setHelp('wheelHelp', text, '');
      showToast('Günlük Çark', text, 'error');
    }
  } finally {
    window.setTimeout(() => {
      stopWheelSpinSound();
      disk?.classList.remove('is-spinning');
      if (button) {
        button.dataset.busy = '0';
        const knownExtraRights = Number(currentProfile?.extraWheelRights || currentProfile?.wheelExtraRights || currentProfile?.wheelRights || 0) || Number(button?.dataset.extraRights || 0) || 0;
        if (knownExtraRights > 0) setWheelLockedState(true, 'Ekstra çark hakkın hazır.', knownExtraRights);
        else if (!button.classList.contains('is-locked')) setWheelButtonDefault();
      }
    }, 4550);
  }
}


async function claimPromo() {
  if (!ensureAuthThen('Promosyon kodu')) return;
  if (!requireVerifiedEmailForReward('promo')) {
    setHelp('promoHelp', 'Promo ödüllerinden yararlanmak için e-postanı doğrulaman gerekiyor.', 'error');
    return;
  }
  const button = $('promoSubmitBtn');
  const input = $('promoCode');
  if (button?.dataset.busy === 'true') return;
  const code = safeText(input?.value || '').toUpperCase();
  if (!code) { setHelp('promoHelp', 'Promo kodu gir.', 'error'); return; }
  let success = false;
  setButtonBusy(button, true, 'KONTROL EDİLİYOR');
  setHelp('promoHelp', 'Kod güvenli doğrulamasıyla kontrol ediliyor.');
  try {
    const payload = await apiFetch('/api/promo/claim', { method: 'POST', body: { code } }, true);
    if (payload?.alreadyClaimed || payload?.duplicate) throw markApiError(new Error('PROMO_ALREADY_CLAIMED'), { path: '/api/promo/claim', status: 409, payload: { error: 'PROMO_ALREADY_CLAIMED' } });
    const amount = payload.amount || 0;
    const xp = payload.xp || 0;
    const rewardSummary = safeText(payload.rewardSummary || [amount ? `${money(amount)} MC` : '', xp ? `${money(xp)} XP` : '', payload.marketGranted?.length ? 'market ürünü' : ''].filter(Boolean).join(' + '));
    setHelp('promoHelp', rewardSummary ? `${rewardSummary} tanımlandı.` : 'Promo kodu aktif edildi.', '');
    showToast('Promosyon Kodu', rewardSummary ? `${rewardSummary} hesabına eklendi.` : 'Promo kodun başarıyla kullanıldı.', 'reward');
    if (input) input.value = '';
    if (button) { button.dataset.promoSuccess = 'true'; button.textContent = 'KOD KULLANILDI'; button.disabled = true; }
    success = true;
    if (Number(payload?.wheelRightsGranted || 0) > 0) await loadWheelConfig().catch(() => null);
    if (notificationsLoaded) await loadNotifications({ force: true }).catch(() => null);
    if (accountMemoryLoaded) await loadAccountMemory({ force: true }).catch(() => null);
    await loadProfile();
  } catch (error) {
    const text = userErrorText(error, 'Kod aktif edilemedi.');
    setHelp('promoHelp', text, 'error');
    showToast('Promosyon Kodu', text, String(error?.payload?.error || error?.message || '') === 'PROMO_ALREADY_CLAIMED' ? 'warning' : 'error');
  } finally {
    if (!success) setButtonBusy(button, false);
  }
}


const MARKET_CATEGORIES = Object.freeze([
  ['all', 'Tümü', 'fa-solid fa-layer-group'],
  ['frame', 'Çerçeve', 'fa-regular fa-gem'],
  ['badge', 'Rozet', 'fa-solid fa-shield-halved'],
  ['stat_theme', 'İstatistik Teması', 'fa-solid fa-chart-column'],
  ['name_effect', 'Animasyonlu İsim Efekti', 'fa-solid fa-wand-magic-sparkles']
]);
let selectedMarketCategory = 'all';
let selectedMarketSort = 'category';
let selectedMarketView = 'all';
function canonicalMarketCategory(category = '') {
  const raw = safeText(category || 'frame').toLowerCase();
  const map = { frames:'frame', frame:'frame', badges:'badge', badge:'badge', 'stats-card-themes':'stat_theme', 'stats-card-theme':'stat_theme', stat_theme:'stat_theme', 'animated-name-effects':'name_effect', 'animated-name-effect':'name_effect', name_effect:'name_effect', all:'all' };
  return map[raw] || raw;
}
function isAllowedMarketCategory(category = '') { return MARKET_CATEGORIES.some(([key]) => key === canonicalMarketCategory(category)); }
function marketCategoryLabel(category = '') {
  const entry = MARKET_CATEGORIES.find(([key]) => key === canonicalMarketCategory(category));
  return entry ? entry[1] : 'Market Ürünü';
}
function marketCategoryIcon(category = '') {
  const entry = MARKET_CATEGORIES.find(([key]) => key === canonicalMarketCategory(category));
  return entry ? entry[2] : 'fa-solid fa-gem';
}
function isMarketCategoryAvailable(items = [], category = 'all') {
  const key = canonicalMarketCategory(category);
  const source = Array.isArray(items) ? items : [];
  if (key === 'all') return source.some((item) => item.visible !== false && item.active !== false && item.enabled !== false && (item.stockOk !== false || item.owned || item.equipped));
  return source.some((item) => canonicalMarketCategory(item.category) === key && item.visible !== false && item.active !== false && item.enabled !== false && (item.stockOk !== false || item.owned || item.equipped));
}

function renderMarketCategoryTabs(items = []) {
  const host = $('marketCategoryTabs');
  if (!host) return;
  const allowed = new Set(MARKET_CATEGORIES.map(([key]) => key));
  if (!allowed.has(selectedMarketCategory)) selectedMarketCategory = 'all';
  if (selectedMarketCategory !== 'all' && !isMarketCategoryAvailable(items, selectedMarketCategory)) selectedMarketCategory = 'all';
  host.replaceChildren(...MARKET_CATEGORIES.map(([key, label, icon]) => {
    const hasItems = isMarketCategoryAvailable(items, key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `market-category-tab${selectedMarketCategory === key ? ' is-active' : ''}${hasItems ? '' : ' is-disabled'}`;
    button.dataset.marketCategoryFilter = key;
    button.dataset.marketHasItems = hasItems ? 'true' : 'false';
    button.disabled = !hasItems;
    button.setAttribute('aria-disabled', hasItems ? 'false' : 'true');
    button.setAttribute('aria-label', hasItems ? label : `${label} yakında`);
    button.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${label}</span>${hasItems ? '' : '<small>Yakında</small>'}`;
    if (hasItems) {
      button.addEventListener('click', () => {
        selectedMarketCategory = key;
        loadMarket({ force: true, localOnly: true });
      });
    }
    return button;
  }));
}

function marketCategoryOrder(category = '') {
  const key = canonicalMarketCategory(category);
  const index = MARKET_CATEGORIES.findIndex(([entry]) => entry === key);
  return index < 0 ? 99 : index;
}

function marketQualityWeight(item = {}) {
  const text = `${safeText(item.quality || '')} ${safeText(item.rarity || '')} ${safeText(item.name || item.title || '')}`.toLowerCase();
  if (/ultra|legend|efsane|myth|premium plus|premium\+/.test(text)) return 5;
  if (/premium|epic|özel|rare|nadir/.test(text)) return 4;
  if (/gold|altın|pro/.test(text)) return 3;
  if (/silver|gümüş|basic|standart/.test(text)) return 2;
  return 1;
}

function sortMarketItemsForUser(items = []) {
  const list = [...(items || [])];
  const byBaseOrder = (a, b) => {
    const categoryDiff = marketCategoryOrder(a.category) - marketCategoryOrder(b.category);
    if (categoryDiff) return categoryDiff;
    const priceDiff = toNumber(a.price, 0) - toNumber(b.price, 0);
    if (priceDiff) return priceDiff;
    return safeText(a.name || a.title || a.id).localeCompare(safeText(b.name || b.title || b.id), 'tr');
  };
  if (selectedMarketSort === 'priceAsc') return list.sort((a, b) => (toNumber(a.price, 0) - toNumber(b.price, 0)) || byBaseOrder(a, b));
  if (selectedMarketSort === 'priceDesc') return list.sort((a, b) => (toNumber(b.price, 0) - toNumber(a.price, 0)) || byBaseOrder(a, b));
  if (selectedMarketSort === 'owned') return list.sort((a, b) => Number(!!b.owned || !!b.equipped) - Number(!!a.owned || !!a.equipped) || byBaseOrder(a, b));
  if (selectedMarketSort === 'quality') return list.sort((a, b) => {
    const qualityDiff = marketQualityWeight(b) - marketQualityWeight(a);
    if (qualityDiff) return qualityDiff;
    const priceDiff = toNumber(b.price, 0) - toNumber(a.price, 0);
    if (priceDiff) return priceDiff;
    return marketCategoryOrder(a.category) - marketCategoryOrder(b.category) || safeText(a.name || a.title || a.id).localeCompare(safeText(b.name || b.title || b.id), 'tr');
  });
  return list.sort(byBaseOrder);
}

function isMarketItemPurchasable(item = {}) {
  return !!item.active && item.enabled !== false && item.visible !== false && item.price > 0 && item.stockOk !== false;
}
function filterMarketItemsForUser(items = []) {
  const source = Array.isArray(items) ? items : [];
  return source.filter((item) => {
    if (selectedMarketCategory !== 'all' && canonicalMarketCategory(item.category) !== selectedMarketCategory) return false;
    if (selectedMarketView === 'owned') return !!item.owned || !!item.equipped;
    if (selectedMarketView === 'available') return isMarketItemPurchasable(item) && !item.owned && !item.equipped;
    if (selectedMarketView === 'stock') return item.stockOk !== false || !!item.owned || !!item.equipped;
    return !!item.owned || !!item.equipped || isMarketItemPurchasable(item);
  });
}

function marketStockText(item = {}) {
  if (item.unlimitedStock === true || item.stockUnlimited === true || item.stock === null || item.stock === undefined) return 'Sınırsız stok';
  const stock = Math.max(0, Math.trunc(toNumber(item.stock, 0)));
  return stock > 0 ? `Stok ${stock}` : 'Stokta yok';
}

function normalizeMarketItem(item = {}) {
  const id = safeText(item.id || item.key || '');
  const category = canonicalMarketCategory(item.category || item.type || 'frame');
  const price = Math.max(0, Math.trunc(toNumber(item.price, 0)));
  const unlimitedStock = item.unlimitedStock === true || item.stockUnlimited === true;
  const stockValue = item.stock === null || item.stock === undefined ? null : Math.max(0, Math.trunc(toNumber(item.stock, 0)));
  const stockOk = unlimitedStock || stockValue === null || stockValue > 0;
  const owned = !!item.owned;
  const equipped = !!item.equipped;
  const visible = item.visible !== false;
  const enabled = item.enabled !== false && item.active !== false;
  const active = visible && enabled && (price > 0 || owned || equipped);
  return { ...item, id, key: id, category, price, active, enabled, visible, owned, equipped, usable: !!item.usable || owned || equipped, stockOk, unlimitedStock };
}

function marketButtonLabel(item = {}) {
  if (item.equipped) return 'Kullanımdan Çıkar';
  if (item.owned) return 'Kullan';
  if (!item.stockOk) return 'Stokta Yok';
  if (!item.active || item.enabled === false) return 'Kapalı';
  return 'Satın Al';
}

function updateMarketButton(button, item = {}) {
  if (!button) return;
  button.textContent = marketButtonLabel(item);
  const emailLocked = !(currentProfile?.emailVerified === true || currentProfile?.emailVerifiedOverride === true || currentProfile?.emailVerificationOverride === true);
  if (emailLocked && !item.equipped) button.textContent = 'E-posta Doğrula';
  const actionAllowed = !!item.owned || !!item.equipped || isMarketItemPurchasable(item);
  button.disabled = !actionAllowed || button.dataset.busy === 'true' || emailLocked;
  button.classList.toggle('is-equipped', !!item.equipped);
  button.classList.toggle('is-owned', !!item.owned && !item.equipped);
  button.classList.toggle('is-sold-out', item.stockOk === false && !item.owned && !item.equipped);
}

function applyMarketCardState(card, item = {}) {
  if (!card) return;
  card.classList.toggle('is-owned', !!item.owned);
  card.classList.toggle('is-equipped', !!item.equipped);
  card.dataset.marketOwned = item.owned ? 'true' : 'false';
  card.dataset.marketEquipped = item.equipped ? 'true' : 'false';
  const badge = card.querySelector('[data-market-badge="true"]');
  if (badge) badge.textContent = item.equipped ? 'Kullanımda' : item.owned ? 'Sahip Olundu' : marketCategoryLabel(item.category);
  const stock = card.querySelector('[data-market-stock="true"]');
  if (stock) stock.innerHTML = `<i class="fa-solid fa-box"></i>${marketStockText(item)}`;
  updateMarketButton(card.querySelector('[data-market-action="true"]'), item);
}

function renderMarketError(host, error) {
  if (!host) return;
  const authIssue = isExpectedSessionError(error);
  const status = Number(error?.status || error?.payload?.status || 0);
  const card = document.createElement('div');
  card.className = 'market-empty-state market-empty-state--error';
  const icon = document.createElement('span');
  icon.className = 'market-empty-icon';
  icon.innerHTML = '<i class="fa-solid fa-store-slash"></i>';
  const title = document.createElement('strong');
  title.textContent = authIssue ? 'Giriş gerekiyor' : 'Market ürünleri şu anda yüklenemedi';
  const text = document.createElement('span');
  text.textContent = authIssue
    ? 'Marketi kullanmak için giriş yapman gerekiyor.'
    : (status === 503 ? 'Market şu anda çevrim dışı.' : 'Bağlantı geçici olarak kurulamadı. Birkaç saniye sonra tekrar deneyebilirsin.');
  const actions = document.createElement('div');
  actions.className = 'market-error-actions';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'ghost-btn';
  retry.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Tekrar Dene';
  retry.addEventListener('click', () => loadMarket({ force: true }));
  actions.appendChild(retry);
  if (authIssue) {
    const login = document.createElement('button');
    login.type = 'button';
    login.className = 'btn btn-primary';
    login.textContent = 'Giriş Yap';
    login.addEventListener('click', () => openSheet('auth'));
    actions.appendChild(login);
  }
  card.append(icon, title, text, actions);
  host.replaceChildren(card);
}

function renderMarketEmpty(host) {
  if (!host) return;
  const card = document.createElement('div');
  card.className = 'market-empty-state market-empty-state--empty';
  const icon = document.createElement('span');
  icon.className = 'market-empty-icon';
  icon.innerHTML = '<i class="fa-solid fa-store"></i>';
  const title = document.createElement('strong');
  title.textContent = 'Market ürünleri hazırlanıyor';
  const text = document.createElement('span');
  text.textContent = 'Şu anda listelenecek aktif ürün bulunmuyor. Biraz sonra tekrar deneyebilirsin.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'ghost-btn';
  retry.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Tekrar Dene';
  retry.addEventListener('click', () => loadMarket({ force: true }));
  card.append(icon, title, text, retry);
  host.replaceChildren(card);
}

function marketPreviewIcon(category = '') {
  const cat = safeText(category);
  if (cat === 'name_effect') return '<b class="market-name-effect-preview pm-market-name-effect-neon-flow">PlayMatrix</b>';
  if (cat === 'badge') return '<span class="market-badge-preview pm-market-badge-premium-prism"><i class="fa-solid fa-star"></i></span>';
  if (cat === 'stat_theme') return '<span class="market-stat-theme-preview pm-market-stat-theme-matrix-gold"><b>XP</b><small>12.450</small></span>';
  return `<i class="${marketCategoryIcon(cat)}"></i>`;
}

function buildMarketCard(rawItem = {}) {
  const item = normalizeMarketItem(rawItem);
  const row = document.createElement('article');
  row.className = `market-item market-item--pro market-item--${item.category.replace(/[^a-z0-9_-]/gi, '')}`;
  row.dataset.marketItemId = item.id;
  row.dataset.marketCategory = item.category;

  const preview = document.createElement('div');
  preview.className = 'market-item-preview';
  const image = item.category === 'frame' ? (resolveMarketFramePath(item.frameUrl || item.image || item.preview || item.asset || '', item.id || item.frameIndex || '') || safeText(item.image || item.preview || item.asset || '')) : safeText(item.image || item.preview || item.asset || '');
  const isGeneratedPreview = /\/public\/assets\/market\/generated\//.test(image);
  if (item.category === 'frame' && image && !isGeneratedPreview) {
    preview.classList.add('market-frame-preview');
    const shell = document.createElement('span');
    shell.className = 'market-frame-preview-shell';
    mountAvatar(shell, { avatar: currentProfile?.avatar || fallbackAvatar, frame: 0, frameUrl: image, marketFrameId: item.id, variant: 'marketCard', size: 98, extraClass: 'market-preview-avatar pm-avatar--market-card' });
    preview.appendChild(shell);
  } else {
    preview.dataset.previewKind = item.category || 'market';
    preview.innerHTML = marketPreviewIcon(item.category);
  }

  const copy = document.createElement('div');
  copy.className = 'market-item-copy';
  const badge = document.createElement('span');
  badge.className = 'market-item-badge';
  badge.dataset.marketBadge = 'true';
  const title = document.createElement('strong');
  title.textContent = safeText(item.name || item.title || 'Market Ürünü');
  const desc = document.createElement('small');
  desc.textContent = safeText(item.description || item.rarity || 'PlayMatrix premium görünüm ürünü.');
  const meta = document.createElement('div');
  meta.className = 'market-item-meta';
  meta.innerHTML = `<span><i class="fa-solid fa-coins"></i>${money(item.price)} MC</span><span data-market-stock="true"><i class="fa-solid fa-box"></i>${marketStockText(item)}</span>`;
  copy.append(badge, title, desc, meta);

  const button = document.createElement('button');
  button.className = 'ghost-btn market-buy-btn';
  button.type = 'button';
  button.dataset.marketAction = 'true';
  button.addEventListener('click', () => handleMarketAction(item.id));
  row.append(preview, copy, button);
  applyMarketCardState(row, item);
  return row;
}

async function openMarketIfAvailable() {
  if (!ensureAuthThen('Market')) return;
  showModalGateLoader(PRELOAD_TEXT.market || 'Market durumu kontrol ediliyor.');
  try {
    const status = await apiFetch('/api/market/status', { timeoutMs: 3200 }, true, true);
    if (status?.enabled === false || status?.status?.enabled === false) {
      showToast('Market', 'Market şu an kullanımı kapalı. Daha sonra tekrar deneyin.', 'warning');
      return;
    }
  } catch (error) {
    report('home.market.status', error);
    showToast('Market', userErrorText(error, 'Market şu an kullanımı kapalı. Daha sonra tekrar deneyin.'), 'warning');
    return;
  } finally {
    hideModalGateLoader();
  }
  await openSheetAfterPreload('market');
}

async function openWheelIfAvailable() {
  if (!ensureAuthThen('Günlük çark')) return;
  showModalGateLoader('Günlük Çark durumu kontrol ediliyor.');
  try {
    const status = await apiFetch('/api/wheel/status', { timeoutMs: 3200 }, true, true);
    if (status?.enabled === false || status?.active === false) {
      showToast('Günlük Çark', 'Günlük Çark şu an kullanımı kapalı. Daha sonra tekrar deneyin.', 'warning');
      return;
    }
  } catch (error) {
    report('home.wheel.status', error);
    showToast('Günlük Çark', userErrorText(error, 'Günlük Çark şu an kullanımı kapalı. Daha sonra tekrar deneyin.'), 'warning');
    return;
  } finally { hideModalGateLoader(); }
  await openSheetAfterPreload('wheel');
}

async function openPromoIfAvailable() {
  if (!ensureAuthThen('Promosyon kodu')) return;
  showModalGateLoader('Promosyon Kodu durumu kontrol ediliyor.');
  try {
    const status = await apiFetch('/api/promo/status', { timeoutMs: 3200 }, true, true);
    if (status?.enabled === false || status?.active === false) {
      showToast('Promosyon Kodu', 'Promosyon Kodu şu an kullanımı kapalı. Daha sonra tekrar deneyin.', 'warning');
      return;
    }
  } catch (error) {
    report('home.promo.status', error);
    showToast('Promosyon Kodu', userErrorText(error, 'Promosyon Kodu şu an kullanımı kapalı. Daha sonra tekrar deneyin.'), 'warning');
    return;
  } finally { hideModalGateLoader(); }
  await openSheetAfterPreload('promo');
}

async function loadMarket({ force = false } = {}) {
  const host = $('marketItems');
  if (!host) return;
  host.classList.add('market-items--pro');
  if (force || !host.dataset.marketLoaded) host.innerHTML = `<div class="pm-market-loading-wrap">${modalLoadingMarkup('Market Yükleniyor...')}</div>`;
  let lastError = null;
  if (window.__PM_MARKET_ITEMS_CACHE__ && arguments[0]?.localOnly) {
    const cachedAll = sortMarketItemsForUser(window.__PM_MARKET_ITEMS_CACHE__);
    const cachedItems = filterMarketItemsForUser(cachedAll);
    renderMarketCategoryTabs(cachedAll);
    if (cachedItems.length) host.replaceChildren(...cachedItems.map(buildMarketCard));
    else renderMarketEmpty(host);
    return;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await apiFetch('/api/market/items', {
        timeoutMs: attempt === 0 ? 2800 : 3000,
        forceAuthToken: attempt > 0
      }, true, true);
      if (payload.enabled === false) {
        host.replaceChildren();
        const offlineError = markApiError(new Error('MARKET_OFFLINE'), { path: '/api/market/items', status: 503, payload: { error: 'MARKET_OFFLINE', message: payload.message || 'Market şu anda çevrim dışı.' } });
        if (activeSheet === 'market') closeSheet(true);
        throw offlineError;
      }
      const allItems = Array.isArray(payload.items) ? payload.items.map(normalizeMarketItem).filter((item) => item.visible !== false && isAllowedMarketCategory(item.category) && (item.owned || item.equipped || isMarketItemPurchasable(item))) : [];
      const sortedItems = sortMarketItemsForUser(allItems);
      window.__PM_MARKET_ITEMS_CACHE__ = sortedItems;
      renderMarketCategoryTabs(sortedItems);
      const items = filterMarketItemsForUser(sortedItems);
      host.dataset.marketLoaded = 'true';
      if (!items.length) {
        renderMarketEmpty(host);
        return;
      }
      host.replaceChildren(...items.map(buildMarketCard));
      return;
    } catch (error) {
      lastError = error;
      const code = String(error?.payload?.error || error?.message || '').toUpperCase();
      if (code === 'MARKET_OFFLINE') {
        if (activeSheet === 'market') closeSheet(true);
        host.replaceChildren();
        throw error;
      }
      if (isExpectedSessionError(error)) break;
      if (attempt < 1) await sleep(160);
    }
  }
  if (!isExpectedSessionError(lastError)) report('home.market.load', lastError, { endpoint: lastError?.endpoint || '/api/market/items', status: lastError?.status || 0 });
  renderMarketError(host, lastError || new Error('MARKET_LOAD_FAILED'));
}


function ensureMarketConfirmModal() {
  let modal = $('marketConfirmModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'marketConfirmModal';
  modal.className = 'ps-modal pm-market-confirm-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="ps-modal-content pm-market-confirm-content" role="dialog" aria-modal="true" aria-labelledby="marketConfirmTitle">
      <div class="ps-modal-header pm-modal-head">
        <span class="pm-modal-head-icon" aria-hidden="true"><i class="fa-solid fa-store"></i></span>
        <div class="pm-modal-head-copy">
          <div class="ps-modal-title" id="marketConfirmTitle">Satın Alma Onayı</div>
          <div class="sheet-subtitle">Ürünü satın almadan önce bilgileri kontrol et.</div>
        </div>
        <button class="ps-modal-close pm-modal-close" type="button" data-market-confirm="cancel" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ps-modal-body pm-market-confirm-body">
        <div class="pm-market-confirm-card">
          <span class="pm-market-confirm-icon"><i class="fa-solid fa-coins"></i></span>
          <div><strong data-market-confirm-name>Market ürünü</strong><span data-market-confirm-price>0 MC</span></div>
        </div>
        <p class="pm-market-confirm-note">Satın alma işlemi MC bakiyenden güvenli şekilde düşülür. Onayladıktan sonra ürün envanterine eklenir.</p>
      </div>
      <div class="pm-market-confirm-actions">
        <button class="ghost-btn" type="button" data-market-confirm="cancel">Vazgeç</button>
        <button class="btn btn-primary" type="button" data-market-confirm="accept">Satın Al</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function confirmMarketPurchase(item = {}) {
  const modal = ensureMarketConfirmModal();
  const name = modal.querySelector('[data-market-confirm-name]');
  const price = modal.querySelector('[data-market-confirm-price]');
  if (name) name.textContent = safeText(item.name || item.title || 'Market ürünü');
  if (price) price.textContent = `${money(item.price || 0)} MC`;
  openMatrixModal('marketConfirmModal');
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      modal.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      closeMatrixModal('marketConfirmModal');
      resolve(value);
    };
    const onClick = (event) => {
      const action = event.target?.closest?.('[data-market-confirm]')?.dataset?.marketConfirm;
      if (action === 'accept') finish(true);
      if (action === 'cancel' || event.target === modal) finish(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') finish(false); };
    modal.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
}

async function handleMarketAction(itemId) {
  if (!ensureAuthThen('Market')) return;
  if (!(currentProfile?.emailVerified === true || currentProfile?.emailVerifiedOverride === true || currentProfile?.emailVerificationOverride === true)) { showToast('Market', 'Market işlemleri için e-posta adresini doğrulaman gerekiyor.', 'warning'); return; }
  const id = safeText(itemId);
  if (!id) return;
  const card = document.querySelector(`[data-market-item-id="${CSS.escape(id)}"]`);
  const button = card?.querySelector('[data-market-action="true"]');
  if (button?.dataset.busy === 'true') return;
  const owned = card?.dataset.marketOwned === 'true';
  const equipped = card?.dataset.marketEquipped === 'true';
  const cachedItem = normalizeMarketItem((window.__PM_MARKET_ITEMS_CACHE__ || []).find((item) => safeText(item.id) === id) || { id, name: card?.querySelector('.market-item-copy strong')?.textContent || 'Market ürünü', price: 0, active: false });
  if (!owned && !equipped && !isMarketItemPurchasable(cachedItem)) {
    showToast('Market', 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.', 'warning');
    await loadMarket({ force: true }).catch(() => null);
    return;
  }
  if (!owned && !equipped) {
    const accepted = await confirmMarketPurchase(cachedItem);
    if (!accepted) return;
  }
  const clearBusy = () => {
    if (!button) return;
    delete button.dataset.busy;
    delete button.dataset.idleText;
    button.disabled = false;
  };
  setButtonBusy(button, true, owned ? 'KULLANILIYOR' : 'SATIN ALINIYOR');
  try {
    const endpoint = equipped ? '/api/market/unequip' : owned ? '/api/market/equip' : '/api/market/purchase';
    const payload = await apiFetch(endpoint, { method: 'POST', body: { itemId: id, category: card?.dataset.marketCategory || '' } }, true);
    clearBusy();
    const updatedItems = Array.isArray(payload.items) ? payload.items.map(normalizeMarketItem) : [];
    if (updatedItems.length) {
      updatedItems.forEach((item) => {
        const target = document.querySelector(`[data-market-item-id="${CSS.escape(item.id)}"]`);
        if (target) applyMarketCardState(target, item);
      });
    } else if (payload.item) {
      applyMarketCardState(card, normalizeMarketItem(payload.item));
    }
    if (payload.profilePatch && typeof payload.profilePatch === 'object') {
      currentProfile = normalizeProfile({ ...(currentProfile || {}), ...payload.profilePatch });
      renderProfile();
    }
    showToast('Market', payload.unequipped ? 'Ürün kullanımdan çıkarıldı.' : owned ? 'Ürün kullanıma alındı.' : 'Satın alma onaylandı.', 'success');
    await loadProfile();
  } catch (error) {
    clearBusy();
    showToast('Market', userErrorText(error, 'Market işlemi tamamlanamadı.'), 'error');
    if (card) applyMarketCardState(card, normalizeMarketItem({ ...(cachedItem || {}), id, active: owned, owned }));
  }
}

async function purchaseMarketItem(itemId) {
  return handleMarketAction(itemId);
}

async function copyValue(id, helpId) {
  const value = $(id)?.value || '';
  if (!value) { setHelp(helpId, 'Önce bağlantı üret.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(value);
    setHelp(helpId, 'Kopyalandı.', 'success');
  } catch (_) {
    setHelp(helpId, 'Kopyalama izni alınamadı.', 'error');
  }
}

async function saveProfile() {
  if (!ensureAuthThen('Profil')) return;
  const existingFirst = safeText(currentProfile?.firstName || '');
  const existingLast = safeText(currentProfile?.lastName || '');
  const firstName = existingFirst || safeText($('profileFirstName')?.value || '');
  const lastName = existingLast || safeText($('profileLastName')?.value || '');
  const username = normalizeUsernameInput($('profileUsername')?.value || '');
  if (!firstName || !lastName || !username) { setHelp('usernameHelp', 'İsim, soyisim ve kullanıcı adı zorunludur.', 'error'); return; }
  const usernameState = usernameValidationState(username);
  if (!usernameState.ok) { setHelp('usernameHelp', usernameState.message, 'error'); return; }
  if (!isValidPersonNameInput(firstName) || !isValidPersonNameInput(lastName)) { setHelp('usernameHelp', PERSON_NAME_RULE_MESSAGE, 'error'); return; }
  const usernameChanged = safeText(currentProfile?.username || '') && username !== safeText(currentProfile?.username || '');
  if (usernameChanged && Math.max(0, Number(currentProfile?.usernameChangesLeft ?? 0)) <= 0) {
    setHelp('usernameHelp', 'Kullanıcı adı değiştirme hakkın doldu.', 'error');
    return;
  }
  setHelp('usernameHelp', 'Profil güncelleniyor.');
  try {
    const body = { username, avatar: currentProfile?.avatar || fallbackAvatar, selectedFrame: currentProfile?.selectedFrame || 0 };
    if (!existingFirst) body.firstName = firstName;
    if (!existingLast) body.lastName = lastName;
    if (!safeText(currentProfile?.fullName || '')) body.fullName = joinName(firstName, lastName);
    if (!safeText(currentProfile?.dateOfBirth || '')) {
      const dob = readDobFields('profile');
      if (!dob.dateOfBirth) { setHelp('profileDobHelp', 'Doğum tarihi alanını eksiksiz seçmelisiniz.', 'error'); return; }
      if (!dob.ageVerified) { setHelp('profileDobHelp', 'Devam edebilmek için 16 yaşından büyük olmalısınız.', 'error'); return; }
      Object.assign(body, { dateOfBirth: dob.dateOfBirth, birthDay: dob.birthDay, birthMonth: dob.birthMonth, birthYear: dob.birthYear });
    }
    const payload = await apiFetch('/api/profile/update', { method: 'POST', body }, true);
    currentProfile = normalizeProfile(payload.user || payload.profile || payload);
    if (currentProfile?.dateOfBirth) {
      setDobFields('profile', currentProfile.dateOfBirth);
      lockDobFields('profile', true);
    }
    renderProfile();
    if (currentProfile?.dateOfBirth) setHelp('profileDobHelp', `Doğum tarihi kayıtlı: ${formatDobDisplay(currentProfile.dateOfBirth)} · Yaş: ${currentProfile.age || ageFromDateOfBirth(currentProfile.dateOfBirth)}. Bu bilgi yalnızca admin tarafından değiştirilebilir.`, 'success');
    setHelp('usernameHelp', 'Profil kaydedildi.', 'success');
    showToast('Hesabım', 'Profil güncellendi.', 'success');
  } catch (error) {
    setHelp('usernameHelp', userErrorText(error, 'Profil kaydedilemedi.'), 'error');
  }
}

const PASSWORD_RULE_MESSAGE = 'Şifre en az 6 karakter olmalıdır.';
function passwordRuleState(value = '') {
  const raw = String(value || '');
  return { ok: raw.length >= 6 && raw.length <= 72 && raw.trim() === raw };
}

function clearPasswordForm() {
  ['currentPasswordInput', 'newPasswordInput', 'newPasswordRepeatInput'].forEach((id) => { const node = $(id); if (node) node.value = ''; });
  setHelp('passwordChangeHelp', '');
}

function openPasswordDrawer(returnToSecurity = false) {
  if (!isEmailVerifiedProfile()) {
    showToast('E-posta doğrulaması gerekli', 'Şifre değiştirmek için e-posta doğrulaması gerekli.', 'warning');
    return;
  }
  if (returnToSecurity) requestProfileSecurityReturn();
  clearPasswordForm();
  openSheet('password');
}

async function handlePasswordChange() {
  if (!ensureAuthThen('Şifre değiştirme')) return;
  if (!isEmailVerifiedProfile()) {
    setHelp('passwordChangeHelp', '');
    showToast('E-posta doğrulaması gerekli', 'Şifre değiştirmek için e-posta doğrulaması gerekli.', 'warning');
    return;
  }
  const currentPassword = $('currentPasswordInput')?.value || '';
  const newPassword = $('newPasswordInput')?.value || '';
  const repeatPassword = $('newPasswordRepeatInput')?.value || '';
  if (!currentPassword || !newPassword || !repeatPassword) { setHelp('passwordChangeHelp', 'Tüm şifre alanlarını doldur.', 'error'); return; }
  if (!passwordRuleState(newPassword).ok) { setHelp('passwordChangeHelp', PASSWORD_RULE_MESSAGE, 'error'); return; }
  if (newPassword !== repeatPassword) { setHelp('passwordChangeHelp', 'Yeni şifreler eşleşmiyor.', 'error'); return; }
  const button = $('confirmPasswordChangeBtn');
  setButtonBusy(button, true, 'GÜNCELLENİYOR');
  setHelp('passwordChangeHelp', 'Şifre güncelleniyor.');
  try {
    const ready = await bootFirebase({ reportOnError: true });
    if (!ready || !auth.currentUser || !firebaseUpdatePassword) throw new Error('AUTH_REQUIRED');
    const email = safeText(auth.currentUser.email || currentProfile?.email || '');
    if (email && firebaseEmailAuthProvider?.credential && firebaseReauthenticateWithCredential) {
      const credential = firebaseEmailAuthProvider.credential(email, currentPassword);
      await firebaseReauthenticateWithCredential(auth.currentUser, credential);
    }
    await firebaseUpdatePassword(auth.currentUser, newPassword);
    clearPasswordForm();
    setHelp('passwordChangeHelp', '');
    showToast('Şifren güncellendi.', '', 'success');
  } catch (error) {
    const msg = userErrorText(error, 'Şifre güncellenemedi.');
    setHelp('passwordChangeHelp', '');
    showToast(msg, '', 'error');
  } finally {
    setButtonBusy(button, false);
  }
}



function syncEmailModalMode() {
  const verified = isEmailVerifiedProfile();
  const current = currentProfile?.email || auth.currentUser?.email || '';
  setValue('emailCurrentValue', current);
  const shell = document.querySelector('.email-change-shell');
  const newEmailGroup = document.getElementById('newEmailInput')?.closest('.field-group');
  const verifyBtn = $('confirmEmailChangeBtn');
  const changeBtn = $('requestEmailLinkBtn');
  const title = document.querySelector('.email-change-hero h4');
  const desc = document.querySelector('.email-change-hero p');
  shell?.classList.toggle('is-email-verified', verified);
  shell?.classList.toggle('is-email-unverified', !verified);
  if (title) title.textContent = verified ? 'E-posta Güvenliği' : 'E-posta Doğrulama';
  if (desc) desc.textContent = verified
    ? 'E-posta adresin doğrulanmış. İstersen yeni e-posta adresine güncelleme bağlantısı gönderebilirsin.'
    : 'E-posta adresini doğrulayarak çark ve promo ödüllerini güvenli şekilde kullanabilirsin.';
  if (newEmailGroup) newEmailGroup.hidden = !verified;
  if (verifyBtn) {
    verifyBtn.hidden = verified;
    verifyBtn.textContent = 'Doğrulama Bağlantısı Gönder';
  }
  if (changeBtn) {
    changeBtn.hidden = !verified;
    changeBtn.textContent = 'Güncelleme Bağlantısı Gönder';
  }
  setHelp('emailChangeHelp', verified
    ? 'Yeni e-posta adresini gir. Doğrulama bağlantısı yeni adresine gönderilecek. Bağlantıyı onayladıktan sonra e-posta adresin otomatik olarak güncellenecek. Spam kutusunu da kontrol etmeyi unutma.'
    : 'Doğrulama bağlantısı mevcut e-posta adresine gönderilir. Spam kutusunu da kontrol etmeyi unutma.');
}

async function refreshProfileAfterEmailAction() {
  try { await firebaseReload?.(auth.currentUser); } catch (_) {}
  try { if (auth.currentUser && firebaseGetIdToken) await firebaseGetIdToken(auth.currentUser, true); } catch (_) {}
  try { await loadProfile(); } catch (error) { report('home.email.profile.refresh', error); }
  try { renderProfile(); } catch (_) {}
  syncEmailModalMode();
}

async function requestEmailChangeLink() {
  if (!ensureAuthThen('E-posta güncelleme')) return;
  syncEmailModalMode();
  if (!isEmailVerifiedProfile()) {
    setHelp('emailChangeHelp', '');
    showToast('E-posta doğrulaması gerekli', 'E-posta güncellemeden önce mevcut e-postanı doğrula.', 'warning');
    return;
  }
  const email = safeText($('newEmailInput')?.value || '').toLowerCase();
  const current = safeText(currentProfile?.email || auth.currentUser?.email || '').toLowerCase();
  if (!email || !email.includes('@')) { setHelp('emailChangeHelp', ''); showToast('E-posta', 'Geçerli yeni e-posta adresi gir.', 'error'); return; }
  if (email === current) { setHelp('emailChangeHelp', ''); showToast('E-posta', 'Yeni e-posta mevcut e-posta adresinle aynı olamaz.', 'error'); return; }
  const button = $('requestEmailLinkBtn');
  setHelp('emailChangeHelp', 'Güncelleme bağlantısı gönderiliyor.');
  setButtonBusy(button, true, 'BAĞLANTI GÖNDERİLİYOR');
  try {
    await apiFetch('/api/email/change-link', { method: 'POST', body: { email } }, true);
    setHelp('emailChangeHelp', '');
    showToast('E-posta', 'Doğrulama bağlantısı yeni e-posta adresine gönderildi. Spam kutusunu da kontrol etmeyi unutma.', 'success');
    await refreshProfileAfterEmailAction();
  } catch (error) {
    setHelp('emailChangeHelp', '');
    showToast('E-posta', userErrorText(error, 'Güncelleme bağlantısı gönderilemedi.'), 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

async function confirmEmailChange() {
  if (!ensureAuthThen('E-posta doğrulama')) return;
  syncEmailModalMode();
  if (isEmailVerifiedProfile()) {
    const msg = 'E-postan zaten doğrulanmış. Güvenlik sekmesinden e-postanı güncelleyebilirsin.';
    setHelp('emailChangeHelp', '');
    showToast('E-posta doğrulandı', msg, 'info');
    return;
  }
  const button = $('confirmEmailChangeBtn');
  setHelp('emailChangeHelp', 'Doğrulama bağlantısı gönderiliyor.');
  setButtonBusy(button, true, 'DOĞRULAMA GÖNDERİLİYOR');
  try {
    const payload = await apiFetch('/api/email/send-verification', { method: 'POST', body: {} }, true);
    if (payload?.alreadyVerified) {
      setHelp('emailChangeHelp', '');
      showToast('E-posta doğrulandı', 'E-postan zaten doğrulanmış.', 'info');
    } else {
      setHelp('emailChangeHelp', '');
      showToast('E-posta', 'Doğrulama bağlantısı gönderildi.', 'success');
    }
    await refreshProfileAfterEmailAction();
  } catch (error) {
    setHelp('emailChangeHelp', '');
    showToast('E-posta', userErrorText(error, 'Doğrulama bağlantısı gönderilemedi.'), 'error');
  } finally {
    setButtonBusy(button, false);
  }
}



async function handleAuthSubmit(mode = currentAuthMode) {
  const safeMode = mode === 'register' ? 'register' : 'login';
  currentAuthMode = safeMode;
  setAuthMode(safeMode);
  const submitBtn = safeMode === 'register' ? $('authRegisterSubmitBtn') : $('authLoginSubmitBtn');
  if (submitBtn?.dataset.busy === 'true') return;
  const values = readAuthValues(safeMode);
  $('sheetShell')?.setAttribute('data-auth-active-form', safeMode);

  if (safeMode === 'login') {
    if (!values.identifier || !values.password) {
      authToastError('Giriş Yap', 'E-posta/kullanıcı adı ve şifre gerekli.');
      return;
    }
  } else {
    if (!values.firstName || !values.lastName || !values.username || !values.email || !values.password || !values.repeatPassword) {
      authToastError('Kayıt Ol', 'İsim, soyisim, kullanıcı adı, e-posta, şifre ve şifre tekrarı zorunludur.');
      return;
    }
    if (!values.email.includes('@')) { authToastError('Kayıt Ol', 'Geçerli e-posta adresi gir.'); return; }
    const usernameState = usernameValidationState(values.username);
    if (!usernameState.ok) { authToastError('Kayıt Ol', usernameState.message); return; }
    if (!isValidPersonNameInput(values.firstName) || !isValidPersonNameInput(values.lastName)) { authToastError('Kayıt Ol', PERSON_NAME_RULE_MESSAGE); return; }
    if (!passwordRuleState(values.password).ok) { authToastError('Kayıt Ol', PASSWORD_RULE_MESSAGE); return; }
    if (values.password !== values.repeatPassword) { authToastError('Kayıt Ol', 'Şifre ve şifre tekrarı eşleşmiyor.'); return; }
    if (!values.dateOfBirth) { authToastError('Kayıt Ol', 'Doğum tarihi alanını eksiksiz seçmelisiniz.'); return; }
    if (!values.ageVerified) { authToastError('Kayıt Ol', 'Devam edebilmek için 16 yaşından büyük olmalısınız.'); return; }
    if (!values.termsAccepted) { authToastError('Kayıt Ol', 'Devam etmek için kullanım şartlarını kabul etmelisin.'); return; }
    if (!values.kvkkAccepted) { authToastError('Kayıt Ol', 'Devam etmek için KVKK ve Gizlilik metnini kabul etmelisin.'); return; }
    if (!values.mcNoticeAccepted) { authToastError('Kayıt Ol', 'MC’nin gerçek para karşılığı olmayan sanal puan olduğunu kabul etmelisin.'); return; }
  }

  setButtonBusy(submitBtn, true, safeMode === 'register' ? 'HESAP OLUŞTURULUYOR' : 'OTURUM AÇILIYOR');
  setHelp('authHelp', '');
  try {
    clearAuthRequiredLock();
    const ready = await bootFirebase({ reportOnError: true });
    if (!ready) throw new Error('hazır değil.');
    const rememberLogin = safeMode === 'login' ? !!values.remember : true;
    await applyFirebaseAuthPersistence(rememberLogin);
    let credential;
    if (safeMode === 'register') {
      const registerUsernameState = usernameValidationState(values.username);
      if (!registerUsernameState.ok) throw new Error(registerUsernameState.message);
      if (!isValidPersonNameInput(values.firstName) || !isValidPersonNameInput(values.lastName)) throw new Error(PERSON_NAME_RULE_MESSAGE);
      if (!passwordRuleState(values.password).ok) throw new Error(PASSWORD_RULE_MESSAGE);
      let usernameCheck = await apiFetch(`/api/auth/check-username?username=${encodeURIComponent(values.username)}`, {}, false).catch(() => null);
      if (!usernameCheck || usernameCheck.ok === false) usernameCheck = await apiFetch(`/api/check-username?username=${encodeURIComponent(values.username)}`, {}, false).catch(() => null);
      if (!usernameCheck || usernameCheck.ok === false) throw new Error('USERNAME_CHECK_FAILED');
      if (usernameCheck?.available === false) throw new Error(usernameCheck?.message || 'Bu kullanıcı adı kullanılıyor veya geçersiz.');
      credential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      try { await firebaseUpdateProfile?.(credential.user, { displayName: values.username }); } catch (_) {}
      try { await sendEmailVerification(credential.user); } catch (_) {}
      currentProfile = normalizeProfile({ uid: credential.user.uid, email: credential.user.email, username: values.username, firstName: values.firstName, lastName: values.lastName, fullName: joinName(values.firstName, values.lastName), avatar: fallbackAvatar, dateOfBirth: values.dateOfBirth, ageVerified: true });
      await syncBackendSession(true, rememberLogin);
      try {
        await apiFetch('/api/profile/update', { method: 'POST', body: { firstName: values.firstName, lastName: values.lastName, fullName: joinName(values.firstName, values.lastName), username: values.username, avatar: fallbackAvatar, selectedFrame: 0, dateOfBirth: values.dateOfBirth, birthDay: values.birthDay, birthMonth: values.birthMonth, birthYear: values.birthYear, acceptedTerms: true, acceptedKvkk: true, acceptedMcVirtualPoints: true } }, true);
        showToast('Kayıt tamamlandı', 'Hesabın oluşturuldu. E-posta doğrulama bağlantısını kontrol et.', 'success');
      } catch (profileError) {
        report('home.auth.register.profile.update', profileError);
        showToast('Kayıt tamamlandı', 'Hesabın oluşturuldu. Profil bilgileri şu anda kaydedilemedi; Hesabım ekranından bilgilerini kontrol et.', 'warning');
      }
    } else {
      let email = values.identifier;
      if (!email.includes('@')) {
        const resolved = await apiFetch('/api/auth/resolve-login', { method: 'POST', body: { identifier: values.identifier } }, false);
        email = resolved.email;
      }
      credential = await signInWithEmailAndPassword(auth, email, values.password);
      await syncBackendSession(true, rememberLogin);
      showToast('Hesap erişimi', 'Giriş yapıldı. Hoş geldin.', 'success');
    }
    await loadProfile();
    closeSheet(true);
  } catch (error) {
    authToastError(safeMode === 'register' ? 'Kayıt Ol' : 'Hesap erişimi', userErrorText(error, safeMode === 'register' ? 'Kayıt işlemi tamamlanamadı. Bilgileri kontrol edip tekrar dene.' : 'Giriş işlemi tamamlanamadı. Bilgileri kontrol edip tekrar dene.'));
  } finally {
    setButtonBusy(submitBtn, false);
  }
}


async function handleForgotPassword() {
  const button = $('forgotSubmitBtn') || document.querySelector('[data-forgot-submit]');
  if (button?.dataset.busy === 'true') return;
  const email = safeText($('forgotEmail')?.value || $('loginIdentifier')?.value || $('registerEmail')?.value || '');
  if (!email || !email.includes('@')) { showToast('Şifremi Unuttum', 'Geçerli e-posta gir.', 'error'); return; }
  setButtonBusy(button, true, 'GÖNDERİLİYOR');
  setHelp('forgotHelp', 'Sıfırlama bağlantısı hazırlanıyor.');
  try {
    const ready = await bootFirebase({ reportOnError: true });
    if (!ready) throw new Error('hazır değil.');
    await sendPasswordResetEmail(auth, email);
    showToast('Şifremi Unuttum', 'Sıfırlama bağlantısı e-posta adresine gönderildi. Spam kutusunu da kontrol et.', 'success');
  } catch (error) {
    const forgotMessage = userErrorText(error, 'Sıfırlama bağlantısı gönderilemedi.');
    showToast('Şifremi Unuttum', forgotMessage, 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

async function logout() {
  toggleDropdown(false);
  clearAuthRequiredLock();
  await clearBackendSession();
  try { if (firebaseReady && signOutFirebase) await signOutFirebase(auth); } catch (error) { report('home.logout.firebase', error); }
  currentProfile = blankProfile();
  renderProfile();
  renderNotifications();
  renderAccountMemory({ transactions: [], games: [] });
  showToast('Güvenli Çıkış', 'Çıkış yapıldı.', 'info');
}


function setActiveRailItem(activeButton = null) {
  $$('#homeQuickRail [data-rail-target], #homeQuickRail [data-rail-action]').forEach((button) => {
    const active = button === activeButton;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function scrollToHomeTarget(selector = '') {
  const target = selector ? document.querySelector(selector) : null;
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindHomeQuickRail() {
  $$('#homeQuickRail .pm-home-rail-item').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.railAction || '';
      const target = button.dataset.railTarget || '';
      setActiveRailItem(button);
      if (target) { scrollToHomeTarget(target); return; }
      if (action === 'promo') { openPromoIfAvailable(); return; }
      if (action === 'wheel') { openWheelIfAvailable(); return; }
      if (action === 'market') { openMarketIfAvailable(); }
    });
  });
  const railTargets = [
    ['#home', document.querySelector('#home')],
    ['#leaderboard', document.querySelector('#leaderboard')],
    ['#homeRecentWinners', document.querySelector('#homeRecentWinners')]
  ].filter(([, node]) => !!node);
  if ('IntersectionObserver' in window && railTargets.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const selector = railTargets.find(([, node]) => node === visible.target)?.[0];
      const button = selector ? document.querySelector(`#homeQuickRail [data-rail-target="${selector}"]`) : null;
      if (button) setActiveRailItem(button);
    }, { threshold: [0.28, 0.45, 0.6], rootMargin: '-18% 0px -58% 0px' });
    railTargets.forEach(([, node]) => observer.observe(node));
  }
}


function setupPasswordVisibilityToggles() {
  $$('[data-password-toggle]').forEach((button) => {
    if (button.dataset.pmToggleBound === 'true') return;
    button.dataset.pmToggleBound = 'true';
    const targetId = button.dataset.passwordToggle || '';
    const input = targetId ? $(targetId) : null;
    if (!input) return;
    const icon = button.querySelector('i');
    const sync = (visible) => {
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
      button.setAttribute('aria-label', visible ? 'Şifreyi gizle' : 'Şifreyi göster');
      if (icon) {
        icon.classList.toggle('fa-eye', !visible);
        icon.classList.toggle('fa-eye-slash', visible);
      }
    };
    sync(false);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = input.type === 'password';
      sync(next);
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus?.(); }
    });
  });
}

function setupRegisterTermsVisualState() {
  const input = $('registerTermsAccepted');
  if (!input || input.dataset.pmTermsBound === 'true') return;
  input.dataset.pmTermsBound = 'true';
  const label = input.closest('.pm-check-line');
  const sync = () => label?.classList.toggle('is-checked', !!input.checked);
  input.addEventListener('change', sync);
  sync();
}

function bindEvents() {
  setupPasswordVisibilityToggles();
  setupRegisterTermsVisualState();
  setupDateOfBirthFields();
  $('brandHome')?.addEventListener('click', () => location.hash = '#home');
  bindHomeQuickRail();
  $('loginBtn')?.addEventListener('click', () => { setAuthMode('login'); openSheet('auth'); });
  $('registerBtn')?.addEventListener('click', () => { setAuthMode('register'); openSheet('auth'); });
  rebuildProfileDropdownController();
  $('sheetBackdrop')?.addEventListener('click', () => closeSheet(false));
  $('sheetClose')?.addEventListener('click', () => closeSheet(false));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeSheet(false); $$('.ps-modal.active,.ps-modal.is-open').forEach((modal) => closeMatrixModal(modal.id)); } });
  $$('#authSegment [data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  $('authLoginSubmitBtn')?.addEventListener('click', (event) => { event.preventDefault(); handleAuthSubmit('login'); });
  $('authRegisterSubmitBtn')?.addEventListener('click', (event) => { event.preventDefault(); handleAuthSubmit('register'); });
  $('authLoginPanel')?.addEventListener('submit', (event) => { event.preventDefault(); handleAuthSubmit('login'); });
  $('authRegisterPanel')?.addEventListener('submit', (event) => { event.preventDefault(); handleAuthSubmit('register'); });
  $('forgotPasswordBtn')?.addEventListener('click', () => openSheet('forgot'));
  $('forgotPasswordInlineBtn')?.addEventListener('click', () => openSheet('forgot'));
  $('forgotSubmitBtn')?.addEventListener('click', handleForgotPassword);
  ['loginIdentifier', 'loginPassword'].forEach((id) => $(id)?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleAuthSubmit('login'); } }));
  ['registerEmail', 'registerPassword', 'registerPasswordRepeat', 'registerUsername', 'registerFirstName', 'registerLastName', 'registerBirthDay', 'registerBirthMonth', 'registerBirthYear'].forEach((id) => $(id)?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleAuthSubmit('register'); } }));
  ['registerBirthDay', 'registerBirthMonth', 'registerBirthYear'].forEach((id) => $(id)?.addEventListener('change', () => syncDobSummary('register')));
  ['profileBirthDay', 'profileBirthMonth', 'profileBirthYear'].forEach((id) => $(id)?.addEventListener('change', () => syncDobSummary('profile')));
  $('forgotEmail')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') handleForgotPassword(); });
  $('logoutDropdownBtn')?.addEventListener('click', logout);
  $('navProfileItem')?.addEventListener('click', () => { toggleDropdown(false); ensureAuthThen('Hesabım') && openSheet('profile'); });
  $('navWheelItem')?.addEventListener('click', () => { toggleDropdown(false); openWheelIfAvailable(); });
  $('navBonusItem')?.addEventListener('click', () => { toggleDropdown(false); openPromoIfAvailable(); });
  $('navMarketItem')?.addEventListener('click', () => { toggleDropdown(false); openMarketIfAvailable(); });
  $('navNotificationItem')?.addEventListener('click', () => { toggleDropdown(false); ensureAuthThen('Bildirimler') && openSheet('notifications'); });
  $('notificationOpenBtn')?.addEventListener('click', () => { ensureAuthThen('Bildirimler') && openSheet('notifications'); });
  const openEmailDrawer = (returnToSecurity = false) => {
    if (returnToSecurity) requestProfileSecurityReturn();
    setValue('emailCurrentValue', currentProfile?.email || auth.currentUser?.email || '');
    setValue('newEmailInput', '');
    setValue('emailLinkStateInput', '');
    syncEmailModalMode();
    openSheet('email');
  };
  $('openEmailChangeBtn')?.addEventListener('click', () => openEmailDrawer(false));
  $('openEmailChangeBtnSecurity')?.addEventListener('click', () => {
    if (!ensureAuthThen('E-posta güvenliği')) return;
    if (isEmailVerifiedProfile()) { openEmailDrawer(true); return; }
    confirmEmailChange();
  });
  $('openPasswordChangeBtn')?.addEventListener('click', () => openPasswordDrawer(activeSheet === 'profile'));
  $('confirmPasswordChangeBtn')?.addEventListener('click', handlePasswordChange);
  ['currentPasswordInput', 'newPasswordInput', 'newPasswordRepeatInput'].forEach((id) => $(id)?.addEventListener('keydown', (event) => { if (event.key === 'Enter') handlePasswordChange(); }));
  $('requestEmailLinkBtn')?.addEventListener('click', requestEmailChangeLink);
  $$('#accountHubTabs [data-account-tab]').forEach((button) => button.addEventListener('click', () => setAccountTab(button.dataset.accountTab || 'profile')));
  $$('#historyCategoryTabs [data-history-category]').forEach((button) => button.addEventListener('click', () => setHistoryCategory(button.dataset.historyCategory || 'transactions')));
  $$('#notificationTabs [data-notification-tab]').forEach((button) => button.addEventListener('click', () => { activeNotificationTab = button.dataset.notificationTab || 'system'; renderNotifications(); }));
  $('refreshNotificationsBtn')?.addEventListener('click', () => loadNotifications({ force: true }));
  $('notificationMenuBtn')?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); const shell = $('notificationMenu')?.closest('.notification-menu-shell'); const next = !shell?.classList.contains('is-open'); shell?.classList.toggle('is-open', next); $('notificationMenuBtn')?.setAttribute('aria-expanded', next ? 'true' : 'false'); });
  $('markNotificationsReadBtn')?.addEventListener('click', () => { $('notificationMenu')?.closest('.notification-menu-shell')?.classList.remove('is-open'); markNotificationsRead(activeNotificationTab); });
  $('clearNotificationsBtn')?.addEventListener('click', () => { $('notificationMenu')?.closest('.notification-menu-shell')?.classList.remove('is-open'); clearNotifications(activeNotificationTab); });
  $('clearReadNotificationsBtn')?.addEventListener('click', () => { $('notificationMenu')?.closest('.notification-menu-shell')?.classList.remove('is-open'); clearReadNotifications(activeNotificationTab); });
  $('notificationSettingsBtn')?.addEventListener('click', () => {
    $('notificationMenu')?.closest('.notification-menu-shell')?.classList.remove('is-open');
    $('notificationMenuBtn')?.setAttribute('aria-expanded', 'false');
    showToast('Bildirim Ayarları', 'Sistem ve kişisel bildirimlerin burada yönetilir. Ayrıntılı ayarlar yakında aktif olacak.', 'info');
  });
  document.addEventListener('click', (event) => {
    const shell = $('notificationMenu')?.closest('.notification-menu-shell');
    if (shell?.classList.contains('is-open') && !shell.contains(event.target)) {
      shell.classList.remove('is-open');
      $('notificationMenuBtn')?.setAttribute('aria-expanded', 'false');
    }
  }, true);
  $('confirmEmailChangeBtn')?.addEventListener('click', confirmEmailChange);
  $('saveProfileBtn')?.addEventListener('click', saveProfile);
  $('spinWheelBtn')?.addEventListener('click', spinWheel);
  $('promoSubmitBtn')?.addEventListener('click', claimPromo);
  $('marketSortSelect')?.addEventListener('change', (event) => {
    selectedMarketSort = safeText(event.target?.value || 'category') || 'category';
    loadMarket({ force: true, localOnly: true });
  });
  $('marketViewSelect')?.addEventListener('change', (event) => {
    selectedMarketView = safeText(event.target?.value || 'all') || 'all';
    loadMarket({ force: true, localOnly: true });
  });

  $$('.hero-shortcut').forEach((button) => button.addEventListener('click', () => {
    const targetGame = button.dataset.heroGame || '';
    const targetFilter = button.dataset.heroFilter || '';
    if (targetGame) {
      const game = HOME_GAMES.find((entry) => entry.key === targetGame || entry.name.toLowerCase() === targetGame.toLowerCase());
      if (game) { openGame(game); return; }
    }
    if (targetFilter) {
      gameFilter = targetFilter;
      $$('#filterRow [data-filter]').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.filter === targetFilter));
      renderGames();
    }
    $('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('gameSearch')?.addEventListener('input', (event) => { gameSearch = safeText(event.target.value); renderGames(); });
  $$('#filterRow [data-filter]').forEach((button) => button.addEventListener('click', () => { gameFilter = button.dataset.filter || 'all'; $$('#filterRow [data-filter]').forEach((b) => b.classList.toggle('is-active', b === button)); renderGames(); }));
  $$('#leaderboardTabs [data-lb-tab]').forEach((button) => button.addEventListener('click', () => { leaderboardTab = button.dataset.lbTab || 'level'; renderLeaderboard(); }));
  $('refreshLeaderboardBtn')?.addEventListener('click', () => loadLeaderboard({ force: true }));
  $('refreshHomeWinnersBtn')?.addEventListener('click', () => loadHomeRecentWinners({ force: true }));
  $$('[data-home-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.homeAction || '';
    if (action === 'wheel') { openWheelIfAvailable(); return; }
    if (action === 'promo') { openPromoIfAvailable(); return; }
    if (action === 'market') { openMarketIfAvailable(); return; }
    if (action === 'profile') { ensureAuthThen('Hesabım') && openSheet('profile'); }
  }));
  const mobileNav = $('mobileBottomNav') || document.querySelector('.mobile-nav--final');
  if (mobileNav && mobileNav.dataset.mobileController !== 'v21') {
    mobileNav.dataset.mobileController = 'v21';
    mobileNav.addEventListener('click', (event) => {
      const button = event.target?.closest?.('.mobile-tab');
      if (!button || !mobileNav.contains(button)) return;
      event.preventDefault();
      handleMobileNavButton(button);
    });
  }
  syncMobileNavigation();
  const soundToggle = $('soundToggle');
  if (soundToggle) {
    soundToggle.setAttribute('aria-disabled', 'true');
    soundToggle.title = 'PlayMatrix ödül ve kritik bildirim sesleri güvenlik standardı gereği kapatılamaz.';
    soundToggle.addEventListener('click', (event) => {
      event.preventDefault();
      document.body.classList.remove('pm-muted');
      $('soundIcon')?.classList.remove('fa-volume-xmark');
      $('soundIcon')?.classList.add('fa-volume-high');
      showToast('Bildirim Sesi', 'Ödül, kazanç, promo, çark ve kritik sistem bildirim sesleri kapatılamaz.', 'info');
    });
  }
  document.addEventListener('dblclick', (event) => {
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], .modal-card, .account-sheet')) return;
    if (event.target?.closest?.('[data-single-action], [data-home-action], .game-card, .wheel-card, .market-card, .promo-card, button[data-pm-critical="true"]')) event.preventDefault();
  }, { passive: false });
}

function setupPickers() {
  avatarPicker = createAvatarPicker({
    categories: AVATAR_CATEGORIES,
    normalizeAvatarUrl,
    defaultAvatar: DEFAULT_AVATAR,
    fallbackAvatar,
    getSelectedAvatar: () => currentProfile?.avatar || fallbackAvatar,
    openModal: openMatrixModal,
    closeModal: closeMatrixModal,
    onSelect: async ({ src }) => {
      if (!ensureAuthThen('Avatar seçimi')) return;
      const previousProfile = { ...(currentProfile || blankProfile()) };
      const nextAvatar = normalizeAvatarUrl(src, fallbackAvatar);
      currentProfile = { ...(currentProfile || blankProfile()), avatar: nextAvatar, marketAvatarId: '', selectedAvatar: '' };
      renderProfile();
      try {
        const payload = await apiFetch('/api/user/avatar', { method: 'POST', body: { avatar: nextAvatar } }, true);
        currentProfile = { ...(currentProfile || blankProfile()), avatar: payload.avatar || payload.profile?.avatar || nextAvatar, marketAvatarId: '', selectedAvatar: '' };
        renderProfile();
        showToast('Avatar', 'Avatar seçimin kaydedildi.', 'success');
      } catch (error) {
        report('home.avatar.save', error);
        currentProfile = previousProfile;
        renderProfile();
        showToast('Avatar', userErrorText(error, 'Avatar seçimin şu anda kaydedilemedi. Lütfen tekrar dene.'), 'error');
      }
    }
  });
  framePicker = createFramePicker({
    documentRef: document,
    getCurrentAvatar: () => currentProfile?.avatar || fallbackAvatar,
    getSelectedFrame: () => currentProfile?.selectedFrame || 0,
    getCurrentLevel: () => currentProfile?.accountLevel || 1,
    openModal: openMatrixModal,
    closeModal: closeMatrixModal,
    onSelect: async (frameLevel) => {
      if (!ensureAuthThen('Çerçeve seçimi')) return;
      const payload = await apiFetch('/api/user/frame', { method: 'POST', body: { frame: frameLevel } }, true);
      currentProfile = { ...(currentProfile || blankProfile()), selectedFrame: payload.selectedFrame ?? frameLevel, marketFrameUrl: '', marketFrameId: '', frameUrl: '', marketEquipped: { ...(currentProfile?.marketEquipped || {}), frame: '' }, equippedMarket: { ...(currentProfile?.equippedMarket || {}), frame: '' } };
      renderProfile();
      showToast('Çerçeve', 'Çerçeve seçimi kaydedildi.', 'success');
    }
  });
  $('openAvatarPickerBtn')?.addEventListener('click', async () => {
    if (!ensureAuthThen('Avatar seçimi')) return;
    showModalGateLoader(PRELOAD_TEXT.avatar);
    let ready = true;
    try {
      await loadProfile().catch((error) => report('home.avatar.preload.profile', error));
      avatarPicker?.renderAvatarCategories({ force: true });
      await sleep(140);
    } catch (error) {
      ready = false;
      report('home.avatar.preload', error);
      showToast('Avatar Seç', userErrorText(error, USER_MESSAGES.AVATAR_SAVE_FAILED), 'error');
    } finally {
      hideModalGateLoader();
    }
    if (ready) avatarPicker?.openAvatarPicker();
  });
  $('openFramePickerBtn')?.addEventListener('click', async () => {
    if (!ensureAuthThen('Çerçeve seçimi')) return;
    showModalGateLoader(PRELOAD_TEXT.frame);
    let ready = true;
    try {
      await loadProfile().catch((error) => report('home.frame.preload.profile', error));
      framePicker?.renderFrameOptions();
      await sleep(140);
    } catch (error) {
      ready = false;
      report('home.frame.preload', error);
      showToast('Çerçeve Seç', userErrorText(error, USER_MESSAGES.FRAME_SAVE_FAILED), 'error');
    } finally {
      hideModalGateLoader();
    }
    if (ready) framePicker?.openFramePicker();
  });
}

async function handleHomeAuthStateChange(user) {
  window.__PM_RUNTIME = { auth, user };
  notificationsLoaded = false;
  accountMemoryLoaded = false;
  notificationPayload = { system: [], personal: [] };
  accountMemoryPayload = { transactions: [], games: [] };
  if (user && firebaseReload) await firebaseReload(user).catch(() => null);
  if (user) await syncBackendSession(false).catch((error) => report('home.auth.session.sync', error, { severity:'warning' }));
  else await clearBackendSession();
  await loadProfile();
  renderNotifications();
  renderAccountMemory();
  if (user) {
    Promise.resolve(ensureNotificationRealtime()).catch((error) => report('home.notifications.realtime', error));
  } else {
    stopNotificationRealtime();
  }
}

async function watchAuth() {
  const ready = await bootFirebase({ reportOnError: false, timeoutMs: 6500 });
  if (!ready || !onAuthStateChanged) {
    currentProfile = blankProfile();
    renderProfile();
    return;
  }
  onAuthStateChanged(auth, (user) => {
    Promise.resolve(handleHomeAuthStateChange(user)).catch((error) => {
      report('home.auth.state.handler', error);
      currentProfile = blankProfile();
      renderProfile();
    });
  }, (error) => {
    report('home.auth.state', error);
    currentProfile = blankProfile();
    renderProfile();
  });
}

async function boot() {
  if (uiBooted) return true;
  uiBooted = true;
  document.documentElement.classList.add('pm-js');
  document.body?.classList.add('pm-no-select');
  initMainDesignSystem();
  installToolNotificationSoundUnlock();
  bindEvents();
  setupPickers();
  initHeroCarousel();
  setAuthMode('login');
  try {
    const params = new URLSearchParams(window.location.search || '');
    const maintenanceGame = params.get('pm_maintenance') || '';
    if (maintenanceGame) {
      Promise.resolve(loadHomeMaintenanceState({ force: true })).then(() => {
        const route = `/games/${String(maintenanceGame).replace(/[^a-z0-9-]/gi, '')}`;
        if (isGameInMaintenance(route)) showToast('Bakım modu', 'Bu oyun şu an bakımda. Daha sonra tekrar deneyin.', 'warning');
      }).catch(() => null).finally(() => {
        const cleanUrl = `${window.location.pathname || '/'}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
      });
    }
  } catch (_) {}
  renderGames();
  installGameRouteNormalizer(document);
  currentProfile = blankProfile();
  renderProfile();
  renderNotifications();
  renderAccountMemory();
  renderWheelRewards(DEFAULT_WHEEL_PRIZES);
  setWheelLockedState(false);
  bindHomeLiveRefreshLifecycle();
  startHomeLiveRefresh({ immediate: true, reason: 'boot' });
  const leaderboardArea = $('leaderboardListArea');
  if (leaderboardArea && !leaderboardLoading && !leaderboardPayload) leaderboardArea.innerHTML = '<div class="pm-leaderboard-empty"><i class="fa-solid fa-ranking-star"></i><strong>Liderlik tablosu hazır.</strong><span>Sıralama düzenli olarak güncellenir. En güncel sonuçları görmek için Yenile butonunu kullanabilirsin.</span></div>';
  window.__PM_RUNTIME = { auth, user: auth.currentUser };
  watchAuth().catch((error) => report('home.auth.boot', error));
  return true;
}

window.openPlayMatrixSheet = openSheet;
window.openSheet = openSheet;
function installAndroidScrollRecovery() {
  const recover = () => {
    if (!activeSheet && !hasOpenMatrixModal()) cleanupBodyScrollLock({ defer: true });
  };
  window.addEventListener('pageshow', recover, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(recover, 260), { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.setTimeout(recover, 80); });
}
installAndroidScrollRecovery();

window.closeSheet = closeSheet;
window.setAuthMode = setAuthMode;

window.addEventListener('pageshow', () => { if (!activeSheet && !document.querySelector('.ps-modal.active,.ps-modal.is-open')) cleanupBodyScrollLock({ defer: true }); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !activeSheet && !document.querySelector('.ps-modal.active,.ps-modal.is-open')) cleanupBodyScrollLock({ defer: true }); });
window.closeMatrixModal = closeMatrixModal;
window.openMatrixModal = openMatrixModal;
window.showPlayMatrixInfo = showInfo;
window.closeAvatarPicker = () => avatarPicker?.closeAvatarPicker?.() || closeMatrixModal('avatarPickerModal');
window.closeFramePicker = () => framePicker?.closeFramePicker?.() || closeMatrixModal('framePickerModal');
window.showPlayerStats = showPlayerStats;
window.openPlayerProfile = showPlayerStats;
window.PlayMatrixHome = Object.freeze({ boot, openSheet, closeSheet, loadProfile, loadLeaderboard, loadMarket, loadWheelConfig, loadNotifications, loadAccountMemory });

if (document.readyState !== 'loading') boot().catch((error) => report('home.boot.auto', error));
