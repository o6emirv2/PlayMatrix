(function () {
  'use strict';

  window.playCrashSfx = window.playCrashSfx || function playCrashSfxFallback() {};

  function $(id) { return document.getElementById(id); }
  function gameName() {
    const path = decodeURIComponent(location.pathname || '').toLowerCase();
    if (path.includes('crash')) return 'Crash';
    if (path.includes('satranc') || path.includes('satranç')) return 'Satranç';
    if (path.includes('pisti') || path.includes('pişti')) return 'Pişti';
    return 'Online oyun';
  }
  function setProgress(value) {
    const fill = $('loaderFill');
    const pct = $('loaderPct');
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    if (fill) fill.style.width = `${safe}%`;
    if (pct) pct.textContent = `${Math.round(safe)}%`;
  }
  function showLoginHomeHint() {
    try {
      sessionStorage.setItem('pm_open_login_after_home', '1');
    } catch (_) {}
  }

  function showActions() {
    const enter = $('btnEnterGame');
    const retry = $('btnRetryBoot');
    if (enter) {
      enter.style.display = 'inline-flex';
      enter.textContent = 'ANASAYFAYA DÖN';
      enter.onclick = function () { showLoginHomeHint(); window.location.href = '/'; };
    }
    if (retry) {
      retry.style.display = 'inline-flex';
      retry.onclick = function () { window.location.reload(); };
    }
  }
  function guardStuckIntro() {
    const intro = $('studioIntro');
    if (!intro || intro.style.display === 'none' || intro.dataset.bootCompleted === '1') return;
    const status = $('loaderStatus');
    const message = String(status?.textContent || '').trim();
    if (/hazır|açılıyor|lobi|oyun/i.test(message) && !/kurulamadı|yüklenemedi|doğrulanamadı/i.test(message)) return;
    setProgress(34);
    if (status) status.textContent = `${gameName()} için giriş veya canlı bağlantı doğrulanamadı. Ana sayfadan giriş yapıp tekrar deneyin.`;
    showActions();
    try {
      if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
        window.__PM_REPORT_CLIENT_ERROR__('online.boot.guard', new Error('ONLINE_GAME_BOOT_STUCK'), { source: 'online-boot-guard', game: gameName() });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(guardStuckIntro, 9000), { once: true });
  } else {
    window.setTimeout(guardStuckIntro, 9000);
  }
})();

import { initPlayMatrixOnlineCore } from "/public/pm-online-core.js?v=pm-20260603-professional-fix2";

const core = await initPlayMatrixOnlineCore();
const auth = core.auth;
const onAuthStateChanged = core.onAuthStateChanged;
const getIdToken = core.getIdToken;
const signOut = core.signOut;
window.__PM_RUNTIME = window.__PM_RUNTIME || {};
window.__PM_RUNTIME.auth = auth;
window.__PM_RUNTIME.signOut = signOut;
window.__PM_RUNTIME.getIdToken = async (forceRefresh = false) => core.getIdToken(forceRefresh);
const API_URL = core.getApiBaseSync();
window.__PM_RUNTIME.apiBase = API_URL;
window.__PLAYMATRIX_API_URL__ = API_URL;

const getApiBase = () => core.getApiBaseSync();
async function ensureApiBaseReady() { return core.ensureApiBaseReady(); }
async function ensureSocketClientReady() { return core.ensureSocketClientReady(); }


function reportPistiClientError(scope = 'pisti.client', error = null, context = {}) {
  try {
    const status = Number(context.status || error?.status || 0) || 0;
    const message = String(error?.message || error || '');
    const endpoint = String(context.endpoint || '').toLowerCase();
    if (status > 0 && status < 500) return;
    if (/load failed|failed to fetch|network|timeout|request_timeout|zaman aşımı/i.test(message) && /\/api\/(pisti-online|games\/pisti)\/(lobby|state|ping|profile)/i.test(endpoint)) return;
    if (/promise\.rejection|window\.error/i.test(scope) && !/typeerror|referenceerror|syntaxerror|rangeerror|is not a function|cannot read|undefined is not/i.test(message)) return;
    const payload = {
      game: 'pisti',
      scope,
      source: 'games/pisti/script.js',
      message: String(error?.message || error || 'Pişti frontend hatası').slice(0, 400),
      endpoint: context.endpoint || '',
      status: context.status || error?.status || 0,
      path: location.pathname,
      severity: context.severity || 'warning'
    };
    navigator.sendBeacon?.('/api/client/error', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
      || fetch('/api/client/error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => null);
  } catch (_) {}
}


function escapeHTML(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonAttr(value) {
  return escapeHTML(JSON.stringify(value));
}

function normalizeCardAssetCode(card = '') {
  return String(card || '').split('#')[0];
}

const PISTI_CARD_ASSET_BASE = '/public/assets/card/';
const PISTI_CARD_BACK_ASSET = '/public/assets/card/card-back.png';
const PISTI_CARD_SUIT_PREFIX = Object.freeze({ S: 'Maca', H: 'Kupa', D: 'Karo', C: 'Sinek' });
const PISTI_CARD_RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const PISTI_CARD_CODES = Object.freeze(Object.keys(PISTI_CARD_SUIT_PREFIX).flatMap((suit) => PISTI_CARD_RANKS.map((rank) => `${rank}${suit}`)));
const pistiCardPreloadCache = new Map();
const pistiLoadedCardAssets = new Set();
let pistiCardPreloadStarted = false;

function preloadPistiImage(src = '', priority = 'auto') {
  const safeSrc = String(src || '').trim();
  if (!safeSrc) return Promise.resolve(false);
  if (pistiCardPreloadCache.has(safeSrc)) return pistiCardPreloadCache.get(safeSrc);
  const promise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      try { img.fetchPriority = priority; } catch (_) {}
      img.onload = () => { pistiLoadedCardAssets.add(safeSrc); resolve(true); };
      img.onerror = () => resolve(false);
      img.src = safeSrc;
      if (img.complete && img.naturalWidth > 0) {
        pistiLoadedCardAssets.add(safeSrc);
        resolve(true);
      }
    } catch (_) {
      resolve(false);
    }
  });
  pistiCardPreloadCache.set(safeSrc, promise);
  return promise;
}

function preloadPistiCardAssets(options = {}) {
  const priorityCodes = Array.isArray(options.priorityCodes) ? options.priorityCodes.map((c) => normalizeCardAssetCode(c).toUpperCase()).filter(Boolean) : [];
  const orderedCodes = [...new Set([...priorityCodes, ...PISTI_CARD_CODES])];
  const paths = orderedCodes.map(getPistiCardAssetPath).filter(Boolean);
  const limit = Math.max(2, Math.min(8, Math.trunc(Number(options.limit || 5) || 5)));
  let index = 0;
  let active = 0;
  let done = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (done >= paths.length) { resolve(true); return; }
      while (active < limit && index < paths.length) {
        const path = paths[index++];
        active += 1;
        preloadPistiImage(path, index <= priorityCodes.length ? 'high' : 'low')
          .finally(() => { active -= 1; done += 1; next(); });
      }
    };
    next();
  });
}

function schedulePistiCardPreload(priorityCodes = []) {
  if (pistiCardPreloadStarted) return;
  pistiCardPreloadStarted = true;
  preloadPistiImage(PISTI_CARD_BACK_ASSET, 'high').catch(() => null);
  preloadPistiCardAssets({ priorityCodes, limit: 12 }).catch(() => null);
}

function getPistiCardAssetName(card = '') {
  const code = normalizeCardAssetCode(card).toUpperCase();
  if (!code || code === 'BACK') return '';
  const suitCode = code.slice(-1);
  const rank = code.slice(0, -1);
  const prefix = PISTI_CARD_SUIT_PREFIX[suitCode];
  if (!prefix || !rank) return '';
  return `${prefix}${rank}.png`;
}

function getPistiCardAssetPath(card = '') {
  const fileName = getPistiCardAssetName(card);
  return fileName ? `${PISTI_CARD_ASSET_BASE}${fileName}` : '';
}


function ensureRealtimeShell() {
  window.__PM_REALTIME_SHELL__ = window.__PM_REALTIME_SHELL__ || { ready: true, page: document.body?.dataset?.game || 'game' };
  return window.__PM_REALTIME_SHELL__;
}


function showRealtimeToast(title = 'PlayMatrix', message = '', tone = 'info', options = {}) {
  try {
    if (window.__PM_TOAST__ && typeof window.__PM_TOAST__.show === 'function') {
      window.__PM_TOAST__.show({ title, message, tone, ...options });
      return;
    }
    if (typeof window.showToast === 'function') {
      window.showToast(title, message, tone);
      return;
    }
    const detail = [title, message].filter(Boolean).join(' — ');
    if (tone === 'error') console.error(detail); else console.info(detail);
  } catch (_) {}
}


const PISTI_SFX_ASSET_PATHS = Object.freeze({
  play: '/public/assets/sfx/pisti/card-play.wav',
  capture: '/public/assets/sfx/pisti/card-capture.wav',
  pisti: '/public/assets/sfx/pisti/pisti.wav',
  deal: '/public/assets/sfx/pisti/deal.wav',
  win: '/public/assets/sfx/pisti/win.wav',
  loss: '/public/assets/sfx/pisti/loss.wav'
});
const pistiAudioAssetCache = Object.create(null);
let pistiAudioCtx = null;
let pistiAudioUnlocked = false;

function getPistiAudioContext() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!pistiAudioCtx) pistiAudioCtx = new Ctx();
    return pistiAudioCtx;
  } catch (_) {
    return null;
  }
}

function unlockPistiAudio() {
  const ctx = getPistiAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => null);
    pistiAudioUnlocked = true;
  } catch (_) {}
}

function getPistiAudioAsset(key = '') {
  const path = PISTI_SFX_ASSET_PATHS[key];
  if (!path || typeof Audio !== 'function') return null;
  if (!pistiAudioAssetCache[key]) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = key === 'pisti' ? 0.82 : key === 'win' ? 0.78 : 0.68;
    pistiAudioAssetCache[key] = audio;
  }
  return pistiAudioAssetCache[key];
}

function preloadPistiSfxAssets() {
  Object.keys(PISTI_SFX_ASSET_PATHS).forEach((key) => {
    try { getPistiAudioAsset(key)?.load?.(); } catch (_) {}
  });
}

function primePistiAudioAssets() {
  Object.keys(PISTI_SFX_ASSET_PATHS).forEach((key) => {
    try { getPistiAudioAsset(key)?.load?.(); } catch (_) {}
  });
}

function playSfx(name = '') {
  try {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    unlockPistiAudio();
    const store = window.__PM_GAME_SFX__ || window.__PM_SFX__ || {};
    const audio = store[key] || getPistiAudioAsset(key);
    if (audio && typeof audio.play === 'function') {
      audio.currentTime = 0;
      audio.play().catch((error) => {
        reportPistiClientError('pisti.audio.asset', error || 'PISTI_AUDIO_PLAY_FAILED', { endpoint: PISTI_SFX_ASSET_PATHS[key] || '', severity: 'warning' });
      });
    }
  } catch (_) {}
}

['pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
  window.addEventListener(eventName, () => { unlockPistiAudio(); primePistiAudioAssets(); }, { passive: true, once: true });
});



function getSafeWebStorage(name = 'localStorage') {
  try {
    const storage = window[name];
    if (!storage) return null;
    const probeKey = `__pm_storage_probe_${name}`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch (_) {
    return null;
  }
}

function getSafeStorageList() {
  return [getSafeWebStorage('sessionStorage'), getSafeWebStorage('localStorage')].filter(Boolean);
}

function getPendingAutoJoinRoom(gameKey = '') {
  const key = String(gameKey || '').trim().toLowerCase();
  const keys = [
    `pm_pending_auto_join_${key}`,
    `pm_pending_autojoin_${key}`,
    `pendingAutoJoin_${key}`,
    `active${key === 'chess' ? 'Chess' : key === 'pisti' ? 'Pisti' : ''}Room`
  ].filter(Boolean);
  for (const storage of getSafeStorageList()) {
    if (!storage) continue;
    for (const k of keys) {
      try {
        const value = String(storage.getItem(k) || '').trim();
        if (value) return value;
      } catch (_) {}
    }
  }
  return '';
}

function clearPendingAutoJoin(gameKey = '', roomId = '') {
  const key = String(gameKey || '').trim().toLowerCase();
  const room = String(roomId || '').trim();
  const keys = [
    `pm_pending_auto_join_${key}`,
    `pm_pending_autojoin_${key}`,
    `pendingAutoJoin_${key}`
  ];
  if (key === 'chess') keys.push('activeChessRoom');
  if (key === 'pisti') keys.push('activePistiRoom');
  for (const storage of getSafeStorageList()) {
    if (!storage) continue;
    for (const k of keys) {
      try {
        const current = String(storage.getItem(k) || '').trim();
        if (!room || !current || current === room) storage.removeItem(k);
      } catch (_) {}
    }
  }
}

function safeGetPendingAutoJoinRoom(gameKey = '', legacyKey = '') {
  try {
    const direct = (typeof getPendingAutoJoinRoom === 'function' ? getPendingAutoJoinRoom(gameKey) : '');
    if (direct) return direct;
  } catch (error) {
    console.warn('[PlayMatrix:Pisti] pending auto join storage skipped', error);
  }
  try {
    const local = getSafeWebStorage('localStorage');
    return String(local?.getItem(legacyKey) || '').trim();
  } catch (_) {
    return '';
  }
}

const elStudioIntro = document.getElementById('studioIntro');
const elLoaderFill = document.getElementById('loaderFill');
const elLoaderStatus = document.getElementById('loaderStatus');
const elBtnEnterGame = document.getElementById('btnEnterGame');
const elBtnRetryBoot = document.getElementById('btnRetryBoot');
const elLobbyNotice = document.getElementById('lobbyNotice');
const elGameNotice = document.getElementById('gameNotice');
let bootPromise = null;
let bootCompleted = false;
let bootActionMode = 'retry';
let socketAvailableForGame = false;
let userUid = '';
let socket = null;
let currentRoomId = '';
let currentRoomState = null;
let lobbyInterval = 0;
let pingInterval = 0;
let gameSyncInterval = null;
let lastSyncHash = '';
let lastEventTs = 0;
let isAnimatingCapture = false;
let captureAnimationTimer = 0;
let lastDealtHandKey = '';
let isProcessing = false;
let selectedJoinRoomId = '';
let lastResultSummaryKey = '';
let roomClosedNoticeShown = false;
let fetchedRooms = [];
let lobbyErrorUntil = 0;
let pistiSocketNoticeTimer = 0;
let pistiSocketNoticeFailures = 0;

function setActivePistiRoom(roomId = '') {
  const id = String(roomId || '').trim();
  if (!id) return;
  const local = getSafeWebStorage('localStorage');
  const session = getSafeWebStorage('sessionStorage');
  for (const storage of [local, session].filter(Boolean)) {
    try { storage.setItem('activePistiRoom', id); } catch (_) {}
  }
}

function clearActivePistiRoom(roomId = '') {
  const id = String(roomId || '').trim();
  for (const storage of getSafeStorageList()) {
    try {
      const current = String(storage.getItem('activePistiRoom') || '').trim();
      if (!id || !current || current === id) storage.removeItem('activePistiRoom');
    } catch (_) {}
  }
}


function showPistiToolsMessage(title = 'Pişti', message = '', tone = 'info', actionLabel = '', actionHandler = null) {
  const text = pistiUserMessage(message || '', '').trim();
  if (!text) return;
  let host = document.getElementById('pistiToolsToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'pistiToolsToastHost';
    host.className = 'pisti-tools-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const item = document.createElement('article');
  item.className = `pisti-tools-toast is-${tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'info'}`;
  const body = document.createElement('div');
  body.className = 'pisti-tools-toast__body';
  const head = document.createElement('strong');
  head.textContent = String(title || 'Pişti');
  const desc = document.createElement('span');
  desc.textContent = text;
  body.append(head, desc);
  item.appendChild(body);
  if (actionLabel && typeof actionHandler === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'pisti-tools-toast__action';
    action.textContent = pistiUserMessage(actionLabel, 'Tekrar Dene');
    action.addEventListener('click', actionHandler);
    item.appendChild(action);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pisti-tools-toast__close';
  close.setAttribute('aria-label', 'Bildirimi kapat');
  close.textContent = '×';
  close.addEventListener('click', () => item.remove());
  item.appendChild(close);
  host.replaceChildren(item);
  window.setTimeout(() => item.remove(), tone === 'error' ? 7200 : 4600);
}

function renderRuntimeNotice(target, message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
  if (!target) return;
  const text = pistiUserMessage(message || '', '').trim();
  if (!text) {
    target.className = 'runtime-notice';
    target.replaceChildren();
    return;
  }
  target.className = 'runtime-notice';
  target.replaceChildren();
  showPistiToolsMessage('Pişti', text, tone, actionLabel, actionHandler);
}

function clearRuntimeNotices() {
  renderRuntimeNotice(elLobbyNotice);
  renderRuntimeNotice(elGameNotice);
}

function showLobbyNotice(message, tone = 'warning', actionLabel = '', actionHandler = null) {
  renderRuntimeNotice(elLobbyNotice, message, tone, actionLabel, actionHandler);
}

function showGameNotice(message, tone = 'warning', actionLabel = '', actionHandler = null) {
  renderRuntimeNotice(elGameNotice, message, tone, actionLabel, actionHandler);
}

function clearPistiSocketNotice() {
  pistiSocketNoticeFailures = 0;
  clearTimeout(pistiSocketNoticeTimer);
  pistiSocketNoticeTimer = 0;
}

function schedulePistiSocketNotice({ lobbyMessage = '', gameMessage = '', tone = 'warning', actionLabel = 'Tekrar Dene' } = {}) {
  pistiSocketNoticeFailures += 1;
  const failureCount = pistiSocketNoticeFailures;
  clearTimeout(pistiSocketNoticeTimer);
  pistiSocketNoticeTimer = setTimeout(() => {
    if (socket?.connected || failureCount < 2) return;
    if (lobbyMessage) showLobbyNotice(lobbyMessage, tone, actionLabel, () => ensureGameplaySocket(false).catch(() => null));
    if (currentRoomId && gameMessage) showGameNotice(gameMessage, tone, actionLabel, () => ensureGameplaySocket(true).catch(() => null));
  }, 4200);
}

function getApiErrorCode(error = null) {
  return String(error?.error || error?.code || error?.data?.error || error?.body?.error || error?.message || error || '').toUpperCase();
}


function pistiUserMessage(value = '', fallback = 'Pişti işlemi şu anda tamamlanamadı. Lütfen tekrar dene.') {
  try {
    if (window.PMUserMessages?.normalize) return window.PMUserMessages.normalize(value, fallback);
    if (typeof window.PMSanitizeUserMessage === 'function') return window.PMSanitizeUserMessage(value, fallback);
  } catch (_) {}
  const raw = String(value || '').trim();
  if (!raw || /render\s*memory|\brender\b|firebase|sunucu|server|backend|endpoint|socket|http[_\s-]*\d{3}|internal\s*error|permission\s*denied|unauthorized|undefined|null|exception|stack\s*trace|request\s*failed/i.test(raw)) return fallback;
  return raw.length > 180 ? fallback : raw;
}

function isRoomNotFoundError(error = null) {
  return Number(error?.status || error?.statusCode || 0) === 404 || getApiErrorCode(error).includes('ROOM_NOT_FOUND');
}

function isRoomClosedError(error = null) {
  return Number(error?.status || error?.statusCode || 0) === 410 || getApiErrorCode(error).includes('ROOM_CLOSED');
}

function notifyRoomClosedByServer(error = null) {
  if (roomClosedNoticeShown) return;
  roomClosedNoticeShown = true;
  const closedRoomId = currentRoomId || '';
  const fallback = 'Masa süresi dolduğu veya 5 dakika boyunca gerçek oyun hareketi olmadığı için kapatıldı.';
  const message = String(error?.message || error?.data?.message || error?.body?.message || fallback).trim() || fallback;
  clearActivePistiRoom(closedRoomId);
  currentRoomId = '';
  currentRoomState = null;
  stopGameSyncPolling();
  clearInterval(pingInterval);
  showPlainMatrixModal('MASA KAPATILDI', message, 'info', true);
  reportPistiClientError('pisti.room.closed', error || new Error('ROOM_CLOSED'), { endpoint: '/api/pisti-online/state/:roomId', severity: 'warning', status: error?.status || 410 });
}

function setDisplay(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.display = value;
}

function setModalActive(id, active = true) {
  const el = document.getElementById(id);
  if (!el) return;
  const isActive = !!active;
  el.hidden = !isActive;
  el.classList.toggle('active', isActive);
  el.classList.toggle('show', isActive);
  el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  document.documentElement.classList.toggle('pm-pisti-modal-open', !!document.querySelector('.modal-overlay.show'));
}

function openRules() { setModalActive('rulesModal', true); }
function closeRules() { setModalActive('rulesModal', false); }
function openCreateModal() { updateCreateModeUI(); setModalActive('createModal', true); }
function clearCreatePrivateFields() {
  const pass = document.getElementById('roomPassInput');
  if (pass) pass.value = '';
}
function closeCreateModal() {
  setModalActive('createModal', false);
  clearCreatePrivateFields();
}
function closeExitConfirm() { setModalActive('exitConfirmModal', false); }
function promptExitGame() {
  if (!currentRoomId) { window.location.href = '/'; return; }
  const title = document.getElementById('exitConfirmTitle');
  const text = document.getElementById('exitConfirmText');
  const mode = normalizePistiMode(currentRoomState?.mode || '');
  const waiting = currentRoomState?.status === 'waiting';
  const isBot = pistiModeIsBot(mode) || currentRoomState?.isBotMode;
  const isFree = currentRoomState?.isFreeMode || mode.startsWith('free-');
  if (title) title.textContent = waiting ? 'MASADAN AYRIL' : 'OYUNDAN ÇIK';
  if (text) {
    if (waiting) text.textContent = 'Bekleme aşamasında ayrılırsanız masa kapatılır veya yeriniz boşaltılır; varsa giriş ücretiniz güvenli şekilde iade edilir.';
    else if (isBot) text.textContent = 'Botlu eğlence modundan çıkarsanız oyun kapanır. Bu modda bahis, MC ve XP yoktur.';
    else if (isFree) text.textContent = 'Bahissiz masadan çıkarsanız hükmen kaybedersiniz. Bu modda giriş ücreti yoktur; ödül yalnızca oyunu tamamlayıp kazanana işlenir.';
    else text.textContent = 'Bahisli oyundan çıkarsanız hükmen kaybedersiniz ve masadaki giriş ücretiniz kazanana/takıma aktarılır.';
  }
  setModalActive('exitConfirmModal', true);
}
function clearJoinPrivateFields() {
  const pass = document.getElementById('joinRoomPassInput');
  const room = document.getElementById('joinRoomIdInput');
  if (pass) pass.value = '';
  if (room) room.value = '';
  selectedJoinRoomId = '';
}
function closeJoinPrivateModal() {
  setModalActive('joinPrivateModal', false);
  clearJoinPrivateFields();
}
function promptJoinRoom(id, isPrivate = false) {
  const roomId = String(id || '').trim();
  if (!roomId) return;
  if (isPrivate) {
    selectedJoinRoomId = roomId;
    const input = document.getElementById('joinRoomIdInput');
    if (input) input.value = roomId;
    setModalActive('joinPrivateModal', true);
    document.getElementById('joinRoomPassInput')?.focus?.();
    return;
  }
  window.joinRoom(roomId).catch(() => null);
}
function submitJoinPrivate() {
  const id = document.getElementById('joinRoomIdInput')?.value || '';
  const password = document.getElementById('joinRoomPassInput')?.value || '';
  closeJoinPrivateModal();
  window.joinRoom(id, password).catch(() => null);
}
function switchCreateTab(tab = 'open') {
  const next = tab === 'private' ? 'private' : 'open';
  const tabOpen = document.getElementById('tabOpen');
  const tabPrivate = document.getElementById('tabPrivate');
  tabOpen?.classList.toggle('active', next === 'open');
  tabPrivate?.classList.toggle('active', next === 'private');
  const current = document.getElementById('currentTabValue');
  if (current) current.value = next;
  setDisplay('privateFields', next === 'private' ? 'block' : 'none');
  const action = document.getElementById('btnCreateAction');
  if (action) action.textContent = next === 'private' ? 'ÖZEL MASA KUR' : 'MASAYA OTUR';
}

function selectBetChip(value) {
  const allowed = [1000, 3000, 5000, 10000, 25000, 50000, 1000000];
  const bet = allowed.includes(Number(value)) ? Number(value) : 1000;
  const input = document.getElementById('roomBetInput');
  const label = document.getElementById('chipSelectedLabel');
  if (input) input.value = String(bet);
  if (label) label.textContent = bet >= 1000 ? `${Math.trunc(bet / 1000)}K` : String(bet);
  document.querySelectorAll('.chip-btn').forEach((button) => {
    button.classList.toggle('selected', Number(button.dataset.bet || 0) === bet);
    button.setAttribute('aria-pressed', Number(button.dataset.bet || 0) === bet ? 'true' : 'false');
  });
}

const PISTI_ALLOWED_MODES = Object.freeze(['bot-2-52','bot-2-104','free-2-52','free-reward-2-52','bet-2-52','bet-2-104','bet-4-52','bet-4-104']);
const PISTI_MODE_LABELS = Object.freeze({
  'bot-2-52': 'Bota Karşı 52',
  'bot-2-104': 'Bota Karşı 104',
  'free-2-52': 'Bahissiz 2 Kişi Ödüllü',
  'free-reward-2-52': 'Bahissiz 2 Kişi Ödüllü',
  'bet-2-52': 'Bahisli 2/52',
  'bet-2-104': 'Bahisli 2/104',
  'bet-4-52': 'Bahisli 4/52',
  'bet-4-104': 'Bahisli 4/104'
});

function normalizePistiMode(mode = '') {
  const value = String(mode || 'bet-2-52').trim().toLowerCase();
  const aliases = {
    '2-52': 'bet-2-52',
    '2-104': 'bet-2-104',
    '4-104': 'bet-4-104',
    'free-reward': 'free-reward-2-52',
    'bot': 'bot-2-52'
  };
  const normalized = aliases[value] || value;
  return PISTI_ALLOWED_MODES.includes(normalized) ? normalized : 'bet-2-52';
}

function pistiModeRequiresBet(mode = '') {
  return normalizePistiMode(mode).startsWith('bet-');
}

function pistiModeIsBot(mode = '') {
  return normalizePistiMode(mode).startsWith('bot-');
}

function syncModeCards(mode = '') {
  const normalized = normalizePistiMode(mode || document.getElementById('roomModeSelect')?.value || 'bet-2-52');
  document.querySelectorAll('.mode-card[data-pisti-mode]').forEach((card) => {
    const active = normalizePistiMode(card.dataset.pistiMode || '') === normalized;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function selectPistiMode(mode = '') {
  const normalized = normalizePistiMode(mode || 'bet-2-52');
  const select = document.getElementById('roomModeSelect');
  if (select) select.value = normalized;
  updateCreateModeUI();
}

function updateCreateModeUI() {
  const mode = normalizePistiMode(document.getElementById('roomModeSelect')?.value || 'bet-2-52');
  const requiresBet = pistiModeRequiresBet(mode);
  const chipBox = document.getElementById('chipSelectedBox');
  const chipGrid = document.getElementById('chipGrid');
  const note = document.getElementById('pistiModeNote');
  syncModeCards(mode);
  document.body?.classList?.toggle('pm-pisti-mode-no-bet', !requiresBet);
  if (chipBox) { chipBox.hidden = !requiresBet; chipBox.setAttribute('aria-hidden', requiresBet ? 'false' : 'true'); }
  if (chipGrid) { chipGrid.hidden = !requiresBet; chipGrid.setAttribute('aria-hidden', requiresBet ? 'false' : 'true'); }
  if (!requiresBet) {
    const input = document.getElementById('roomBetInput');
    if (input) input.value = '0';
  } else {
    const input = document.getElementById('roomBetInput');
    if (input && Number(input.value || 0) <= 0) input.value = '1000';
  }
  if (note) {
    if (pistiModeIsBot(mode)) note.textContent = `${PISTI_MODE_LABELS[mode] || 'Bota Karşı'} eğlence modudur; bahis, MC ödülü, XP ve level ilerlemesi yoktur.`;
    else if (mode === 'free-2-52' || mode === 'free-reward-2-52') note.textContent = 'Bahissiz 2 Kişi Ödüllü modunda giriş ücreti yoktur; kazanana günlük limit dahilinde 5.000 MC verilir, XP verilmez.';
    else note.textContent = 'Bahisli masalarda yetersiz MC varsa oda kesinlikle kurulmaz; tam havuz kazanana veya takıma aktarılır.';
  }
}

function showPlainMatrixModal(title, message, tone = 'info', autoLobby = false) {
  const titleEl = document.getElementById('matrixModalTitle');
  const descEl = document.getElementById('matrixModalDesc');
  const modal = document.getElementById('matrixModal');
  if (titleEl) titleEl.textContent = pistiUserMessage(title || 'Bilgi', 'Bilgi');
  if (descEl) {
    descEl.replaceChildren();
    pistiUserMessage(message || '', 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.').split(/<br\s*\/?\s*>/i).forEach((part, index) => {
      if (index) descEl.appendChild(document.createElement('br'));
      const span = document.createElement('span');
      span.textContent = part.replace(/<[^>]*>/g, '');
      if (tone === 'success') span.className = 'pm-pisti-message-success';
      else if (tone === 'error') span.className = 'pm-pisti-message-error';
      else if (tone === 'info') span.className = 'pm-pisti-message-info';
      descEl.appendChild(span);
    });
  }
  if (modal) {
    modal.dataset.tone = tone;
    setModalActive('matrixModal', true);
  }
  if (autoLobby) {
    const closeBtn = document.getElementById('matrixModalCloseBtn');
    if (closeBtn) closeBtn.dataset.pmAutoLobby = 'true';
  }
}
const showMatrixModal = showPlainMatrixModal;
function translatePistiErrorMessage(error = '') {
  const raw = String(error?.message || error?.error || error || '').trim();
  const code = raw.toUpperCase();
  if (code.includes('INSUFFICIENT_BALANCE') || code.includes('BALANCE_INSUFFICIENT')) return 'BAKİYENİZ YETERSİZ';
  if (code.includes('ROOM_NOT_FOUND')) return 'Masa bulunamadı veya kapandı.';
  if (code.includes('ROOM_CLOSED')) return 'Masa kapandı.';
  if (code.includes('ROOM_FULL')) return 'Masa dolu.';
  if (code.includes('INVALID_BET')) return 'Bahis tutarı geçersiz.';
  if (code.includes('NOT_YOUR_TURN')) return 'Sıra sizde değil.';
  if (code.includes('STATE_VERSION_MISMATCH')) return 'Oyun senkronu yenilendi. Lütfen tekrar deneyin.';
  if (code.includes('AUTH') || code.includes('TOKEN')) return 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.';
  return pistiUserMessage(raw, 'Pişti bağlantısı şu anda yenilenemedi. Lütfen tekrar dene.');
}
function showPistiErrorModal(title = 'Reddedildi', error = '') {
  lobbyErrorUntil = Date.now() + 6000;
  const list = document.getElementById('roomList');
  if (!currentRoomId && list) list.innerHTML = '<div class="pm-pisti-empty pm-pisti-empty--error">İşlem şu anda tamamlanamadı. Tekrar deneyin.</div>';
  showMatrixModal(title, translatePistiErrorMessage(error), 'error');
}
function playResultSfx(summary = {}) {
  const outcome = String(summary?.outcome || '').toLowerCase();
  if (outcome === 'win') playSfx('win');
  else if (outcome === 'loss' || outcome === 'abandoned') playSfx('loss');
}

function showGameResultSummary(summary = {}, fallbackTitle = 'Oyun Sonucu', fallbackMessage = '', tone = 'info') {
  const key = [summary?.gameType || 'pisti', summary?.resultCode || '', summary?.settledAt || '', summary?.outcome || ''].join(':');
  if (key && key === lastResultSummaryKey) return;
  lastResultSummaryKey = key;
  const title = summary?.title || fallbackTitle;
  const message = summary?.message || fallbackMessage || 'Oyun sonucu işlendi.';
  const resultTone = summary?.outcome === 'win' ? 'success' : summary?.outcome === 'loss' || summary?.outcome === 'abandoned' ? 'error' : tone;
  showPlainMatrixModal(title, message, resultTone, true);
}
function closeMatrixGameModal() {
  const btn = document.getElementById('matrixModalCloseBtn');
  const shouldLobby = btn?.dataset.pmAutoLobby === 'true';
  if (btn) delete btn.dataset.pmAutoLobby;
  setModalActive('matrixModal', false);
  if (shouldLobby) resetToLobby();
}

Object.assign(window, {
  openRules,
  closeRules,
  openCreateModal,
  closeCreateModal,
  closeExitConfirm,
  promptExitGame,
  closeJoinPrivateModal,
  submitJoinPrivate,
  switchCreateTab,
  selectBetChip,
  updateCreateModeUI,
  promptJoinRoom,
  closeMatrixGameModal
});


function setBootBusyState(isBusy) {
  if (elBtnEnterGame) elBtnEnterGame.disabled = !!isBusy;
  if (elBtnRetryBoot) elBtnRetryBoot.disabled = !!isBusy;
}

function setBootProgress(value) {
  if (!elLoaderFill) return;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  elLoaderFill.style.width = pct + '%';
}

function setBootStatus(message, tone = 'info') {
  if (!elLoaderStatus) return;
  elLoaderStatus.textContent = message;
  elLoaderStatus.classList.remove('is-error', 'is-warning');
  if (tone === 'error') elLoaderStatus.classList.add('is-error');
  if (tone === 'warning') elLoaderStatus.classList.add('is-warning');
}

function setBootActions({ showEnter = false, showRetry = false, enterLabel = 'LOBİYE GEÇİŞ YAP', actionMode = 'continue' } = {}) {
  bootActionMode = actionMode;
  if (elBtnEnterGame) {
    elBtnEnterGame.textContent = enterLabel;
    elBtnEnterGame.style.display = showEnter ? 'inline-flex' : 'none';
  }
  if (elBtnRetryBoot) elBtnRetryBoot.style.display = showRetry ? 'inline-flex' : 'none';
}

function dismissIntro() {
  if (!elStudioIntro) return;
  elStudioIntro.style.opacity = '0';
  setTimeout(() => { elStudioIntro.style.display = 'none'; }, 260);
}

function withTimeout(promise, ms, code = 'TIMEOUT') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { const err = new Error(code); err.code = code; reject(err); }, ms);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
  });
}

function waitForAuthReady(timeoutMs = 15000) {
  return core.waitForAuthReady(timeoutMs);
}

async function resolveBootUser(timeoutMs = 15000) {
  try {
    return await waitForAuthReady(timeoutMs);
  } catch (error) {
    const profile = await core.requestWithAuth('/api/me', { method: 'GET', timeoutMs: 6500, retries: 0, allowSessionFallback: true }).catch(() => null);
    const uid = String(profile?.user?.uid || profile?.uid || profile?.profile?.uid || '').trim();
    if (uid) return { uid, sessionFallback: true };
    throw error;
  }
}

async function waitForSocketReady(sock, timeoutMs = 4500) {
  return core.waitForSocketReady(sock, timeoutMs);
}

async function ensureGameplaySocket(required = false) {
  try {
    const sock = await initSocket();
    await waitForSocketReady(sock, 4500);
    socketAvailableForGame = true;
    return true;
  } catch (error) {
    socketAvailableForGame = false;
    try { if (socket && !socket.connected) socket.disconnect(); } catch (_) {}
    socket = null;
    if (required) throw error;
    return false;
  }
}

async function bootPistiApp(force = false) {
  if (bootCompleted && !force) return true;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    setBootBusyState(true);
    clearRuntimeNotices();
    setBootProgress(8);
    setBootStatus('Oturum doğrulanıyor...');
    setBootActions({ showEnter: false, showRetry: false });
    const user = await resolveBootUser(15000);
    userUid = user.uid;
    setBootProgress(28);
    setBootStatus('Profil hazırlanıyor...');
    await withTimeout(fetchProfile(), 7000, 'PROFILE_TIMEOUT').catch((error) => {
      showLobbyNotice('Profil verisi şu an tam alınamadı. Lobi temel modda açılacak.', 'warning', 'Tekrar Dene', () => fetchProfile().catch(() => null));
      return null;
    });
    try { if (typeof ensureRealtimeShell === 'function') ensureRealtimeShell(); } catch (error) { console.warn('[PlayMatrix:Pisti] realtime shell skipped', error); }
    setBootProgress(50);
    setBootStatus('Gerçek zamanlı bağlantı kuruluyor...');
    const socketReady = await ensureGameplaySocket(false);
    setBootProgress(socketReady ? 70 : 62);
    setBootStatus(socketReady ? 'Lobi verileri senkronize ediliyor...' : 'Bağlantı sınırlı modda açılıyor. Oyun sırasında tekrar denenecek.', socketReady ? 'info' : 'warning');
    const preferredRoom = safeGetPendingAutoJoinRoom('pisti', 'activePistiRoom');
    let restored = false;
    if (preferredRoom) {
      setBootProgress(84);
      setBootStatus('Önceki masa kontrol ediliyor...');
      restored = await withTimeout(restorePistiSession(preferredRoom, true), 6000, 'RESTORE_TIMEOUT').catch(() => false);
    }
    if (!restored) startLobby();
    bootCompleted = true;
    setBootProgress(100);
    setBootStatus(socketReady ? 'Bağlantı hazır. Lobi açılıyor...' : 'Lobi hazır. Oyun başlatılırken bağlantı tekrar denenecek.', socketReady ? 'info' : 'warning');
    setBootActions({ showEnter: true, showRetry: !socketReady, enterLabel: 'LOBİYE GEÇİŞ YAP', actionMode: 'continue' });
    setTimeout(dismissIntro, 260);
    return true;
  })().catch((error) => {
    const code = error?.code || error?.message || 'BOOT_ERROR';
    if (['AUTH_TIMEOUT','NO_USER','FIREBASE_UNAVAILABLE','PUBLIC_RUNTIME_CONFIG_UNAVAILABLE','PUBLIC_FIREBASE_CONFIG_MISSING','FIREBASE_IMPORT_FAILED','FIREBASE_SDK_TIMEOUT'].includes(code)) {
      setBootProgress(18);
      setBootStatus('Oturum doğrulanamadı. Önce giriş yapıp tekrar deneyin.', 'error');
      setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ANASAYFAYA DÖN', actionMode: 'home' });
    } else {
      console.warn('[PlayMatrix:Pisti] boot degraded to lobby', error);
      try { startLobby(); } catch (_) {}
      bootCompleted = true;
      setBootProgress(100);
      setBootStatus('Lobi temel modda açılıyor. Bağlantı arka planda yeniden denenecek.', 'warning');
      setBootActions({ showEnter: true, showRetry: true, enterLabel: 'LOBİYE GEÇİŞ YAP', actionMode: 'continue' });
      setTimeout(dismissIntro, 260);
      return true;
    }
    bootCompleted = false;
    throw error;
  }).finally(() => {
    setBootBusyState(false);
    bootPromise = null;
  });
  return bootPromise;
}

elBtnEnterGame?.addEventListener('click', () => {
  if (bootActionMode === 'home') { window.location.href = '/'; return; }
  if (bootCompleted) { dismissIntro(); return; }
  bootPistiApp(true).catch(() => null);
});

elBtnRetryBoot?.addEventListener('click', () => { bootPistiApp(true).catch(() => null); });


    function resolveAccountLevel(profile = {}) {
      const value = Number(profile?.accountLevel ?? profile?.progression?.accountLevel ?? profile?.level ?? 1);
      return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
    }

    function resolveAccountLevelProgress(profile = {}) {
      const value = Number(profile?.progression?.accountLevelProgressPct ?? profile?.accountLevelProgressPct ?? 0);
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    }


    async function fetchAPI(endpoint, method='GET', body=null, attempt = 0) {
      const headers = {};
      return core.requestWithAuth(endpoint, { method, body, headers, timeoutMs: 8000, retries: attempt === 0 ? 1 : 0, allowSessionFallback: true });
}

async function initSocket() {
    if (socket?.connected) return socket;
    socket = await core.createAuthedSocket(socket, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 6, timeout: 6000 });
    if (socket.__pmPistiSocketBound) return socket;
    socket.__pmPistiSocketBound = true;

    socket.on('connect', () => { socketAvailableForGame = true; clearPistiSocketNotice(); showLobbyNotice(''); showGameNotice(''); });
    socket.on('connect_error', () => { socketAvailableForGame = false; schedulePistiSocketNotice({ lobbyMessage: 'Gerçek zamanlı bağlantı yenileniyor. Lobi HTTP yedeğiyle çalışmaya devam edecek.', gameMessage: 'Canlı bağlantı yenileniyor. Oyun durumu güvenli yedek akışla kontrol ediliyor.', tone: 'warning' }); });
    socket.on('disconnect', () => { socketAvailableForGame = false; schedulePistiSocketNotice({ lobbyMessage: 'Bağlantı geçici olarak yenileniyor. Oyun başlatılırken yeniden denenecek.', gameMessage: 'Bağlantı yenileniyor. Senkron tamamlanana kadar oyun durumu güvenli şekilde kontrol ediliyor.', tone: 'warning' }); });

    socket.on('pisti:update', async (payload) => {
        const room = payload?.room || payload;
        if (room && room.id === currentRoomId) {
            syncUI(room);
            return;
        }
        if (payload?.id === currentRoomId) {
            try {
                const res = await fetchAPI(`/api/pisti-online/state/${currentRoomId}`);
                if (res && res.room) syncUI(res.room);
            } catch (error) {
                if (isRoomClosedError(error) || isRoomNotFoundError(error)) notifyRoomClosedByServer(error);
            }
        }
    });
    socket.on('pisti:lobby', (payload) => {
        if (currentRoomId) return;
        if (Array.isArray(payload?.rooms)) {
            fetchedRooms = payload.rooms;
            showLobbyNotice('');
            renderRoomListLocally();
        }
    });

    const subscribePistiLobby = () => {
        if (!socket?.connected) return;
        socket.emit('pisti:lobby:subscribe', {}, (ack) => {
            if (ack?.ok === false) {
                showLobbyNotice('Lobi canlı yayını için oturum doğrulaması gerekiyor. HTTP lobi yedeği kullanılacak.', 'warning');
                return;
            }
            if (Array.isArray(ack?.rooms) && !currentRoomId) {
                fetchedRooms = ack.rooms;
                renderRoomListLocally();
            }
        });
    };

    socket.on('connect', () => {
        try { socket.emit('presence:update', { status: 'IN_GAME', activity: 'Pişti Oynuyor', gameType: 'pisti' }); } catch (_) {}
        subscribePistiLobby();
    });
    if (socket.connected) {
        try { socket.emit('presence:update', { status: 'IN_GAME', activity: 'Pişti Oynuyor', gameType: 'pisti' }); } catch (_) {}
        subscribePistiLobby();
    }

    return socket;
}

async function restorePistiSession(roomId, suppressError = false) {
    const safeRoomId = String(roomId || '').trim();
    if (!safeRoomId) return false;

    try {
        const snapshot = await fetchAPI(`/api/pisti-online/state/${safeRoomId}`);
        const room = snapshot?.room;
        const amIHere = !!room && Array.isArray(room.players) && room.players.some(p => p.uid === userUid);
        if (room && amIHere && (room.status === 'waiting' || room.status === 'playing')) {
            await enterGame(safeRoomId);
            clearPendingAutoJoin('pisti', safeRoomId);
            return true;
        }
    } catch (_) {}

    try {
        const joined = await fetchAPI('/api/pisti-online/join', 'POST', { roomId: safeRoomId });
        if (joined?.room) {
            await enterGame(safeRoomId);
            clearPendingAutoJoin('pisti', safeRoomId);
            return true;
        }
    } catch (error) {
        if (!suppressError) showRealtimeToast('Odaya girilemedi', error.message || 'Pişti masasına bağlanılamadı.', 'error');
    }

    clearPendingAutoJoin('pisti', safeRoomId);
    clearActivePistiRoom(safeRoomId)
    return false;
}

async function initApp(){ 
    userUid = auth.currentUser?.uid || userUid;
    if (!userUid) { const user = await resolveBootUser(6500); userUid = user.uid; }
    fetchProfile(); 
    ensureRealtimeShell();
    await initSocket(); 
    
    const preferredRoom = safeGetPendingAutoJoinRoom('pisti', 'activePistiRoom');
    if (preferredRoom && await restorePistiSession(preferredRoom, true)) return;
    
    startLobby(); 
}

async function fetchProfile(){ 
    const res = await fetchAPI('/api/me'); 
    if(!(res && res.ok)) throw new Error('PROFILE_LOAD_FAILED');

    try { window.__PM_GAME_ACCOUNT_SYNC__?.apply?.(res); } catch (_) {}
    const profile = (res && typeof res.user === 'object' && res.user) ? res.user : {};
    const safeBalance = Number(res.balance ?? res.mc ?? res.mcBalance ?? profile.balance ?? profile.mc ?? profile.mcBalance ?? profile.wallet?.balance ?? 0) || 0;
    const balanceEl = document.getElementById("uiBalance") || document.getElementById("ui-balance");
    if (balanceEl) balanceEl.innerText = safeBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    try { window.__PM_GAME_ACCOUNT_SYNC__?.apply?.({ ...res, balance: safeBalance, user: { ...profile, balance: safeBalance } }); } catch (_) {}

    const accountLevel = Math.max(1, Number(profile.accountLevel ?? profile.level ?? profile.progression?.level) || 1);
    const accountProgress = Math.max(0, Math.min(100, Number(profile?.progression?.accountLevelProgressPct ?? profile?.progression?.progressPercent ?? profile?.progressPercent) || 0));

    const levelBarEl = document.getElementById('uiAccountLevelBar');
    const levelPctEl = document.getElementById('uiAccountLevelPct');
    const levelBadgeEl = document.getElementById('uiAccountLevelBadge');

    if (levelBarEl) levelBarEl.style.width = accountProgress + '%';
    if (levelPctEl) levelPctEl.innerText = accountProgress.toFixed(1) + '%';
    if (levelBadgeEl) levelBadgeEl.innerText = accountLevel;
    return { balance: safeBalance, accountLevel, accountProgress };
}

function stopGameSyncPolling(){
  clearInterval(gameSyncInterval);
  gameSyncInterval = null;
}

function startGameSyncPolling(){
  stopGameSyncPolling();
  gameSyncInterval = setInterval(async () => {
    if (!currentRoomId || document.hidden) return;
    if (socketAvailableForGame && socket?.connected) return;
    try {
      const res = await fetchAPI(`/api/pisti-online/state/${currentRoomId}`);
      if (res && res.room) {
        syncUI(res.room);
        return;
      }
      schedulePistiSocketNotice({ gameMessage: 'Canlı bağlantı arka planda tekrar deneniyor. Oyun durumu güvenli şekilde yenileniyor.', tone: 'warning' });
    } catch (error) {
      if (isRoomClosedError(error) || isRoomNotFoundError(error)) { notifyRoomClosedByServer(error); return; }
      schedulePistiSocketNotice({ gameMessage: 'Oyun durumu alınamadı. Yeniden deneniyor.', tone: 'warning', actionLabel: 'Tekrar Dene' });
    }
  }, 2200);
}

function resetToLobby(){ 
  const leavingRoomId = currentRoomId || '';
  if(socket && leavingRoomId) socket.emit('pisti:leave', leavingRoomId);
  clearInterval(lobbyInterval); clearInterval(pingInterval); stopGameSyncPolling(); 
  currentRoomId=null; lastSyncHash=''; lastEventTs=0; isAnimatingCapture=false; roomClosedNoticeShown=false;
  clearActivePistiRoom(leavingRoomId)
  showGameNotice('');
  
  document.getElementById("gameArea").style.display="none"; 
  document.getElementById("lobbyArea").style.display="flex"; 
  
  fetchProfile(); startLobby(); 
}

function startLobby(){ clearInterval(lobbyInterval); fetchLobby(true).catch(() => null); lobbyInterval = setInterval(() => { fetchLobby(false).catch(() => null); }, 3500); }

async function fetchLobby(initial = false){
  if(currentRoomId || document.hidden) return;
  let lastError = null;
  const endpoint = '/api/pisti-online/lobby';
  try {
    const res = await fetchAPI(endpoint);
    fetchedRooms = Array.isArray(res?.rooms) ? res.rooms : [];
    lobbyErrorUntil = 0;
    showLobbyNotice('');
    renderRoomListLocally();
    return;
  } catch(error) {
    lastError = error;
    reportPistiClientError('pisti.lobby.fetch', error, { endpoint, severity: 'warning', status: error?.status || 0 });
  }
  if (initial || !fetchedRooms.length) {
    const list = document.getElementById('roomList');
    if (list) list.innerHTML = `<div class="pm-pisti-empty">Lobi verisi alınamadı.</div>`;
  }
  if (initial) showLobbyNotice('Pişti lobisi şu anda yenilenemedi. Sistem arka planda tekrar deneyecek.', 'warning', 'Tekrar Dene', () => fetchLobby(true).catch(() => null));
  return;
}

window.renderRoomListLocally = () => {
  const query = (document.getElementById("lobbySearch")?.value || '').trim().toLowerCase();
  const list = document.getElementById("roomList");
  if (!list) return;
  let filtered = Array.isArray(fetchedRooms) ? fetchedRooms : [];
  if (query) {
    filtered = filtered.filter((r) => String(r.roomName || '').toLowerCase().includes(query) || String(r.hostName || '').toLowerCase().includes(query));
  }

  if(filtered.length===0){
    const recentError = Date.now() < Number(lobbyErrorUntil || 0);
    list.innerHTML = recentError ? `<div class="pm-pisti-empty pm-pisti-empty--error">İşlem şu anda tamamlanamadı. Tekrar deneyin.</div>` : `<div class="pm-pisti-empty">Masa bulunamadı.</div>`;
    return;
  }
  let html = '';
  filtered.forEach(r => {
    const isFull = Number(r.currentPlayers || 0) >= Number(r.maxPlayers || 0) || r.status === 'playing';
    const isNoBetRoom = !!(r.isBotMode || r.isFreeMode || String(r.economyMode || '').toLowerCase() === 'bot' || String(r.economyMode || '').toLowerCase() === 'free');
    const lockIcon = r.isPrivate ? '<i class="fa-solid fa-lock pm-pisti-lock-icon" aria-hidden="true"></i>' : '';
    const actionArgs = safeJsonAttr([String(r.id || ''), !!r.isPrivate]);
    const btn = isFull
      ? `<button type="button" class="btn-join btn-disabled" disabled>DOLU</button>`
      : `<button type="button" class="btn-join" data-room-id="${escapeHTML(r.id)}" data-room-private="${r.isPrivate ? 'true' : 'false'}" data-pm-action="promptJoinRoom" data-pm-args="${actionArgs}">KATIL</button>`;
    const economyLine = isNoBetRoom
      ? `<span class="pm-pisti-no-bet-label"><strong>${r.isBotMode ? 'Botlu eğlence masası' : 'Bahissiz masa'}</strong> • Bahis alanı yok</span>`
      : `<span>Giriş: <strong><span class="pm-pisti-bet-value">${Number(r.bet || 0).toLocaleString('tr-TR')} MC</span></strong></span>`;
    const rewardLine = r.isBotMode
      ? 'Ödül Yok'
      : r.isRewardFree
        ? `Sabit Ödül: <strong>${Number(r.freeRewardMc || 0).toLocaleString('tr-TR')} MC</strong>`
        : r.isFreeMode
          ? 'Ödül Yok'
          : `Havuz: <strong>${Number(r.pot || (Number(r.bet || 0) * Number(r.currentPlayers || 0))).toLocaleString('tr-TR')} MC</strong>`;
    html += `
    <div class="room-card ${isNoBetRoom ? 'room-card--no-bet' : 'room-card--bet'}">
        <div class="room-card-top">
            <span class="room-host">${lockIcon}${escapeHTML(r.roomName || 'Pişti Masası')}</span>
            <span class="room-mode">${escapeHTML(r.modeLabel || r.mode || '')}</span>
        </div>
        <div class="room-footer">
            <div class="room-info-text">
                ${economyLine}
                <span>${rewardLine}</span>
                <span>Kapasite: <strong>${escapeHTML(r.currentPlayers)} / ${escapeHTML(r.maxPlayers)}</strong> (Kurucu: ${escapeHTML(r.hostName || 'Oyuncu')})</span>
            </div>
            ${btn}
        </div>
    </div>`;
  });
  list.innerHTML = html;
};

window.submitCreateRoomAction = async () => {
  if (isProcessing) return;
  isProcessing = true;
  const tab = document.getElementById('currentTabValue')?.value || 'open';
  const mode = normalizePistiMode(document.getElementById('roomModeSelect')?.value || 'bet-2-52');
  const bet = pistiModeRequiresBet(mode) ? Math.max(1000, Math.min(1000000, Math.trunc(Number(document.getElementById('roomBetInput')?.value || 1000) || 1000))) : 0;
  const roomName = document.getElementById('roomNameInput')?.value || '';
  const password = document.getElementById('roomPassInput')?.value || '';

  if (tab === 'private' && (pistiModeIsBot(mode) || mode.startsWith('free-'))) { showMatrixModal("Hata", "Botlu ve bahissiz Pişti özel masa olarak kurulamaz. Özel masa yalnızca bahisli gerçek oyunculu modlarda açılır.", "error"); isProcessing = false; return; }
  if (tab === 'private' && roomName.length < 5) { showMatrixModal("Hata", "Oda adı min 5 karakter.", "error"); isProcessing = false; return; }
  if (tab === 'private' && password.length < 5) { showMatrixModal("Hata", "Şifre min 5 hane.", "error"); isProcessing = false; return; }
  closeCreateModal();

  if (tab === 'open') {
      try{ const res = await fetchAPI('/api/pisti-online/play-open', 'POST', {mode, bet}); if(res.ok) { try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {} await enterGame(res.room.id); } else throw new Error(res.error); } catch(e){ showPistiErrorModal("Reddedildi", e); } finally { isProcessing = false; }
  } else {
      try{ const res = await fetchAPI('/api/pisti-online/create-private', 'POST', {mode, bet, roomName, password}); if(res.ok) { try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {} await enterGame(res.room.id); } else throw new Error(res.error); } catch(e){ showPistiErrorModal("Reddedildi", e); } finally { clearCreatePrivateFields(); isProcessing = false; }
  }
};

window.joinRoom = async (id, password='') => { 
  if (isProcessing) return; isProcessing = true;
  try{ const res=await fetchAPI('/api/pisti-online/join','POST',{roomId:id, password}); if(res.ok) { try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {} await enterGame(id); } else throw new Error(res.error); }catch(e){showPistiErrorModal("Reddedildi",e);} finally { isProcessing = false; } 
};

window.handleTopBarExit = async () => {
  closeExitConfirm();
  if (!currentRoomId) {
    window.location.href = '/';
    return;
  }
  const leavingRoomId = currentRoomId;
  try {
    await fetchAPI('/api/pisti-online/leave', 'POST', { roomId: leavingRoomId });
    resetToLobby();
  } catch (error) {
    if (isRoomClosedError(error) || isRoomNotFoundError(error)) {
      notifyRoomClosedByServer(error);
      return;
    }
    reportPistiClientError('pisti.leave.failed', error, { endpoint: '/api/pisti-online/leave', severity: 'error', roomId: leavingRoomId });
    showGameNotice('Masadan çıkış isteği tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.', 'error', 'Tekrar Dene', () => window.handleTopBarExit());
    showMatrixModal('ÇIKIŞ TAMAMLANAMADI', 'Masadan çıkış isteği şu anda tamamlanamadı. Oda durumunu korumak için lobiye geçiş yapılmadı.', 'error');
  }
};

async function enterGame(id){
  let socketReady = false;
  try {
    socketReady = await ensureGameplaySocket(false);
  } catch (_) {
    socketReady = false;
  }
  clearInterval(lobbyInterval); 
  clearInterval(pingInterval);
  currentRoomId=id; 
  roomClosedNoticeShown=false;
  setActivePistiRoom(id);
  clearPendingAutoJoin('pisti', id);
  
  document.getElementById("lobbyArea").style.display="none"; 
  document.getElementById("gameArea").style.display="flex";
  showLobbyNotice('');
  showGameNotice(socketReady ? 'Oyun verisi hazırlanıyor...' : 'Canlı bağlantı hazırlanırken oyun verisi güvenli şekilde yenilenecek.', socketReady ? 'warning' : 'warning', socketReady ? '' : 'Tekrar Dene', socketReady ? null : () => ensureGameplaySocket(false).catch(() => null));
  
  lastSyncHash = ''; lastEventTs = 0; isAnimatingCapture = false;
  
  if (socketReady && socket) {
    socket.emit('pisti:join', id, (ack) => { if (ack?.room) syncUI(ack.room); });
  }
  fetchAPI(`/api/pisti-online/state/${id}`)
    .then(res => { if(res&&res.room) syncUI(res.room); })
    .catch((error) => {
      if (isRoomClosedError(error) || isRoomNotFoundError(error)) { notifyRoomClosedByServer(error); return; }
      reportPistiClientError('pisti.state.fetch', error, { endpoint: `/api/pisti-online/state/${id}`, severity: 'error' });
    });
  startGameSyncPolling();
  
  pingInterval = setInterval(async () => {
      if (!currentRoomId) return;
      try {
        const pingRes = await fetchAPI('/api/pisti-online/ping', 'POST', { roomId: currentRoomId });
        if (pingRes && pingRes.room && (pingRes.room.status === 'finished' || pingRes.room.status === 'abandoned')) syncUI(pingRes.room);
        else if (socketAvailableForGame) showGameNotice('');
      } catch (error) {
        if (isRoomClosedError(error) || isRoomNotFoundError(error)) { notifyRoomClosedByServer(error); return; }
        schedulePistiSocketNotice({ gameMessage: 'Oyun senkronu gecikti. Bağlantı tekrar deneniyor.', tone: 'warning', actionLabel: 'Tekrar Dene' });
      }
  }, 10000); 
  return true;
}

function getCardUnavailableHTML(code = '') {
  const label = normalizeCardAssetCode(code).toUpperCase() || 'KART';
  return `<div class="pm-card-unavailable" aria-label="Kart görseli yüklenemedi"><span>${escapeHTML(label)}</span></div>`;
}

function getCardHTML(c){
  const code = normalizeCardAssetCode(c).toUpperCase();
  const assetPath = code === 'BACK' ? PISTI_CARD_BACK_ASSET : getPistiCardAssetPath(code);
  const fallback = getCardUnavailableHTML(code);
  if (!assetPath) return fallback;
  const label = code === 'BACK' ? 'PlayMatrix kart arkası' : getPistiCardAssetName(code).replace(/\.png$/i, '');
  preloadPistiImage(assetPath, 'high').catch(() => null);
  const loadedClass = pistiLoadedCardAssets.has(assetPath) ? ' is-loaded' : '';
  return `<div class="pm-card-asset${loadedClass}" data-card-code="${escapeHTML(code)}">
    <img class="pm-card-image" src="${escapeHTML(assetPath)}" alt="${escapeHTML(label)}" draggable="false" loading="eager" decoding="async" fetchpriority="high" width="212" height="300">
    <div class="pm-card-asset-fallback" aria-hidden="true">${fallback}</div>
  </div>`;
}

window.addEventListener('load', (event) => {
  try {
    const target = event.target;
    if (!target?.classList?.contains('pm-card-image')) return;
    const src = target.getAttribute('src') || target.currentSrc || '';
    if (src) pistiLoadedCardAssets.add(src);
    target.closest('.pm-card-asset')?.classList?.add('is-loaded');
  } catch (_) {}
}, true);

window.addEventListener('error', (event) => {
  try {
    const target = event.target;
    if (!target?.classList?.contains('pm-card-image')) return;
    const host = target.closest('.pm-card-asset');
    host?.classList?.add('is-fallback');
    reportPistiClientError('pisti.card.asset', new Error('PISTI_CARD_ASSET_LOAD_FAILED'), { endpoint: target.getAttribute('src') || '', severity: 'warning' });
  } catch (_) {}
}, true);
window.addEventListener('error', (event) => {
  try {
    if (event?.target?.classList?.contains('pm-card-image')) return;
    reportPistiClientError('pisti.js.runtime', event?.error || event?.message || 'PISTI_JS_RUNTIME_ERROR', { severity: 'error' });
  } catch (_) {}
});
window.addEventListener('unhandledrejection', (event) => {
  try {
    reportPistiClientError('pisti.promise.rejection', event?.reason || 'PISTI_UNHANDLED_REJECTION', { severity: 'error' });
  } catch (_) {}
});

function animateCardToTable(cardEl, token = '') {
  try {
    const source = cardEl?.getBoundingClientRect?.();
    const table = document.getElementById('tableCardsArea')?.getBoundingClientRect?.();
    if (!source || !table) return;
    const ghost = document.createElement('div');
    ghost.className = 'card-fly';
    ghost.innerHTML = getCardHTML(token);
    ghost.style.left = `${source.left}px`;
    ghost.style.top = `${source.top}px`;
    ghost.style.width = `${source.width}px`;
    ghost.style.height = `${source.height}px`;
    document.body.appendChild(ghost);
    const targetX = table.left + table.width / 2 - source.width / 2;
    const targetY = table.top + table.height / 2 - source.height / 2;
    const dx = targetX - source.left;
    const dy = targetY - source.top;
    const animation = ghost.animate([
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(.92) rotate(5deg)`, opacity: .92 }
    ], { duration: 360, easing: 'cubic-bezier(.18,.88,.22,1)', fill: 'forwards' });
    animation.onfinish = () => ghost.remove();
    animation.oncancel = () => ghost.remove();
  } catch (_) {}
}


function resolveFrameIndex(level) {
  if (window.PMAvatar && typeof window.PMAvatar.getFrameAssetIndex === 'function') {
    return window.PMAvatar.getFrameAssetIndex(level);
  }
  const lvl = Math.max(0, Math.min(100, Math.floor(Number(level) || 0)));
  if (lvl <= 0) return 0;
  if (lvl <= 15) return 1;
  if (lvl <= 30) return 2;
  if (lvl <= 40) return 3;
  if (lvl <= 50) return 4;
  if (lvl <= 60) return 5;
  if (lvl <= 80) return 6;
  if (lvl <= 85) return 7;
  if (lvl <= 90) return 8;
  return Math.min(18, Math.max(9, lvl - 82));
}

function buildFramedAvatarHTML(avatarUrl, selectedFrame, imageClass, wrapperClass = 'pm-game-avatar-shell--main') {
  if (window.PMAvatar && typeof window.PMAvatar.buildHTML === 'function') {
    return window.PMAvatar.buildHTML({
      avatarUrl,
      level: selectedFrame,
      sizePx: wrapperClass === 'pm-game-avatar-shell--mini' ? 18 : 44,
      variant: wrapperClass === 'pm-game-avatar-shell--mini' ? 'pistiScoreCard' : 'pistiTopbar',
      extraClass: `pm-game-avatar-shell ${wrapperClass}`,
      imageClass,
      wrapperClass: 'pm-avatar',
      sizeTag: wrapperClass === 'pm-game-avatar-shell--mini' ? 'pistiScoreCard' : 'pistiTopbar',
      alt: 'avatar'
    });
  }
  const frameIndex = resolveFrameIndex(selectedFrame);
  const safeAvatar = escapeHTML(avatarUrl || (window.PMAvatar?.FALLBACK_AVATAR || 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E'));
  const frameHtml = frameIndex > 0
    ? `<img src="/public/assets/frames/frame-${frameIndex}.png" class="pm-game-frame frame-${frameIndex}" alt="" aria-hidden="true" data-fallback="/public/assets/frames/frame-${frameIndex}.png">`
    : '';
  return `<div class="pm-game-avatar-shell ${wrapperClass}"><img src="${safeAvatar}" class="${imageClass}" alt="avatar">${frameHtml}</div>`;
}
function triggerPistiAnim(){ playSfx('pisti'); const el=document.getElementById("pistiAnim"); el.style.animation='none'; void el.offsetWidth; el.style.animation='flashPisti 1.5s ease-out forwards'; }

function getTableCardLayout(index, total, isHidden) {
  if (index === total - 1) return { tx: 0, ty: 0, rot: 0 };
  if (isHidden) return { tx: 0, ty: 0, rot: 0 };

  const spreadStart = Math.max(0, total - 6);
  const spreadIndex = Math.min(4, Math.max(0, index - spreadStart));
  const offsets = [
    { tx: -8, ty: -6, rot: -12 },
    { tx: -4, ty: -3, rot: -7 },
    { tx: 0, ty: 0, rot: -2 },
    { tx: 4, ty: 3, rot: 5 },
    { tx: 8, ty: 6, rot: 10 }
  ];

  return offsets[spreadIndex] || offsets[offsets.length - 1];
}


function applyTableCardStyles(root = document) {
  root.querySelectorAll('.table-card[data-tx]').forEach((el) => {
    const tx = Number(el.dataset.tx || 0);
    const ty = Number(el.dataset.ty || 0);
    const rot = Number(el.dataset.rot || 0);
    const z = Number(el.dataset.z || 1);
    el.style.transform = `translate(${tx}px,${ty}px) rotate(${rot}deg)`;
    el.style.zIndex = String(z);
  });
}

function appendTableCardElement(card, { tx = 0, ty = 0, rot = 0, z = 1, animClass = '' } = {}) {
  const host = document.getElementById('tableCardsArea');
  if (!host) return;
  const div = document.createElement('div');
  div.className = ['table-card', animClass].filter(Boolean).join(' ');
  div.dataset.tx = String(tx);
  div.dataset.ty = String(ty);
  div.dataset.rot = String(rot);
  div.dataset.z = String(z);
  div.innerHTML = getCardHTML(card);
  host.appendChild(div);
  applyTableCardStyles(div.parentElement || host);
}

function renderTableCards(cardsArr, extraCard = null) {
  const host = document.getElementById('tableCardsArea');
  if (!host) return;
  let tHTML = '';
  const allCards = (Array.isArray(cardsArr) ? [...cardsArr] : []).filter((card) => String(card || '').trim());
  if (extraCard) allCards.push(extraCard);

  allCards.forEach((card, index) => {
    const normalizedCard = String(card || '').trim();
    const isHidden = normalizeCardAssetCode(normalizedCard).toUpperCase() === 'BACK';
    const layout = getTableCardLayout(index, allCards.length, isHidden);
    const animClass = (extraCard && index === allCards.length - 1) ? 'drop-anim' : '';
    tHTML += `<div class="table-card ${animClass}" data-tx="${layout.tx}" data-ty="${layout.ty}" data-rot="${layout.rot}" data-z="${index + 1}" data-card-token="${escapeHTML(normalizedCard)}">${getCardHTML(normalizedCard)}</div>`;
  });

  host.innerHTML = tHTML;
  applyTableCardStyles(host);
}


const getOppCardsHTML = (handLen) => {
    let html = '<div class="opp-hand">';
    for(let i=0; i<handLen; i++) html += `<div class="small-card-back"><img src="${PISTI_CARD_BACK_ASSET}" alt="Kapalı kart" draggable="false" loading="eager" decoding="async"></div>`;
    html += '</div>';
    return html;
};

function getOpponentCardCountForStage(r = {}) {
  if (!Array.isArray(r.players)) return 0;
  const meIndex = r.players.findIndex((player) => player.uid === userUid);
  const opponent = r.players.find((player, index) => index !== meIndex && player && player.uid !== userUid);
  return Math.max(0, Math.trunc(Number(opponent?.opponentCardCount ?? opponent?.handCount ?? opponent?.cardCount ?? 0) || 0));
}

function renderOpponentHandStage(r = {}) {
  const host = document.getElementById('opponentHandStage');
  if (!host) return;
  if (!Array.isArray(r.players) || r.status !== 'playing') {
    host.innerHTML = '';
    host.classList.remove('is-visible');
    return;
  }
  const count = getOpponentCardCountForStage(r);
  if (!count) {
    host.innerHTML = '';
    host.classList.remove('is-visible');
    return;
  }
  const capped = Math.min(12, count);
  let html = '<div class="opponent-hand-stage__cards">';
  for (let i = 0; i < capped; i += 1) {
    html += `<div class="opponent-stage-card" style="--opp-i:${i};--opp-mid:${(capped - 1) / 2}"><img src="${PISTI_CARD_BACK_ASSET}" alt="Rakip kapalı kartı" draggable="false" loading="eager" decoding="async" fetchpriority="high"></div>`;
  }
  html += '</div>';
  host.innerHTML = html;
  host.classList.add('is-visible');
}

let lastDealSequenceKey = '';
let dealSequenceTimers = [];
function clearDealSequenceTimers() {
  dealSequenceTimers.forEach((timer) => window.clearTimeout(timer));
  dealSequenceTimers = [];
}

function runDealSequence(r = {}, me = null) {
  const key = `${r.id || currentRoomId || ''}:${r.stateVersion || 0}:${Array.isArray(me?.hand) ? me.hand.join('|') : ''}:${r.deckCount || 0}`;
  if (!r?.lastEvent || r.lastEvent.type !== 'deal' || key === lastDealSequenceKey) return;
  lastDealSequenceKey = key;
  clearDealSequenceTimers();
  const myCount = Array.isArray(me?.hand) ? me.hand.length : 0;
  const oppCount = getOpponentCardCountForStage(r);
  const totalTicks = Math.max(1, Math.min(16, myCount + Math.min(oppCount, 4)));
  const stepMs = 165;
  for (let i = 0; i < totalTicks; i += 1) {
    dealSequenceTimers.push(window.setTimeout(() => playSfx('deal'), i * stepMs));
  }
  document.getElementById('myCardsArea')?.classList.add('is-dealing');
  document.getElementById('opponentHandStage')?.classList.add('is-dealing');
  dealSequenceTimers.push(window.setTimeout(() => {
    document.getElementById('myCardsArea')?.classList.remove('is-dealing');
    document.getElementById('opponentHandStage')?.classList.remove('is-dealing');
  }, Math.max(420, totalTicks * stepMs + 180)));
}

function isTeamRoomState(r) {
    return !!(r?.teamMode && Number(r?.maxPlayers || 0) === 4 && Array.isArray(r?.players) && r.players.length === 4);
}

function teamNameFor(id) {
    return Number(id) === 0 ? 'A Takımı' : 'B Takımı';
}

function userWonRoom(r) {
    return Array.isArray(r?.winner) && r.winner.includes(userUid);
}

function isDrawRoomState(r) {
    if (typeof r?.isDraw === 'boolean') return r.isDraw;
    if (!Array.isArray(r?.winner)) return false;
    return isTeamRoomState(r) ? r.winner.length === 4 : r.winner.length > 1;
}

function fallbackResultSummary(r) {
    const draw = isDrawRoomState(r);
    const won = userWonRoom(r);
    if (r?.status === 'abandoned') {
        return { gameType: 'pisti', resultCode: 'abandoned', settledAt: Date.now(), outcome: 'abandoned', title: 'Oyun İptal', message: 'Masa kapatıldı. Uygunsa bahisler iade edildi.' };
    }
    if (draw) {
        return { gameType: 'pisti', resultCode: 'draw', settledAt: Date.now(), outcome: 'draw', title: 'BERABERE!', message: 'Oyun berabere bitti. Havuz paylaşıldı.' };
    }
    if (won) {
        const teamMode = isTeamRoomState(r);
        const teamId = Number(r?.viewerTeam ?? -1);
        return { gameType: 'pisti', resultCode: teamMode ? 'team_win' : 'win', settledAt: Date.now(), outcome: 'win', title: teamMode ? 'TAKIMINIZ KAZANDI!' : 'TEBRİKLER!', message: teamMode ? `${teamNameFor(teamId)} masayı kazandı. Ödül bakiyenize eklendi.` : 'MASAYI KAZANDINIZ! Ödül bakiyenize eklendi.' };
    }
    return { gameType: 'pisti', resultCode: isTeamRoomState(r) ? 'team_loss' : 'loss', settledAt: Date.now(), outcome: 'loss', title: isTeamRoomState(r) ? 'TAKIMINIZ KAYBETTİ' : 'MASAYI KAYBETTİNİZ', message: 'Şansınızı tekrar deneyin.' };
}

function renderGameTopBar(r) {
    const poolValue = r?.isBotMode ? 0 : r?.isRewardFree ? Number(r.freeRewardMc || 0) : r?.isFreeMode ? 0 : (Number.isFinite(Number(r.pot)) ? Number(r.pot) : Math.floor(Number(r.bet || 0) * Number(r.players?.length || 0)));
    const pool = Math.max(0, Math.trunc(poolValue)).toLocaleString('tr-TR');
    const poolTitle = r?.isBotMode ? 'EĞLENCE' : r?.isRewardFree ? 'ÖDÜL' : r?.isFreeMode ? 'EĞLENCE' : 'HAVUZ';

    const me = r.players.find(p => p.uid === userUid) || r.players[0];
    const others = r.players.filter(p => p.uid !== userUid);
    const opp = others.length > 0 ? others[0] : me;

    const isMyTurn = r.turn === r.players.findIndex(x => x.uid === userUid);
    const teamScores = Array.isArray(r.teamScores) ? r.teamScores : [];
    const teamScoreHtml = isTeamRoomState(r) && teamScores.length >= 2
      ? `<span class="gts-team-score">A: ${Number(teamScores[0] || 0)} • B: ${Number(teamScores[1] || 0)}</span>`
      : '';

    let html = `
      <div class="gts-player">
        ${buildFramedAvatarHTML(me.avatar, me.selectedFrame, `gts-avatar ${isMyTurn ? 'active' : ''}`)}
        <div class="gts-info">
          <div class="gts-row-top">
            <span class="gts-name">${escapeHTML(me.username)}</span>
          </div>
          <span class="gts-score">Skor: ${Number(me.score || 0)}</span>
        </div>
      </div>
      <div class="gts-pool">
          <span>${poolTitle}</span>
          <b>${r?.isBotMode || (r?.isFreeMode && !r?.isRewardFree) ? 'YOK' : r?.isRewardFree ? `${pool} <span class="pm-pisti-pool-unit">MC ÖDÜL</span>` : `${pool} <span class="pm-pisti-pool-unit">MC</span>`}</b>
          ${teamScoreHtml}
      </div>`;

    if (others.length === 1) {
        const isOppTurn = r.turn === r.players.findIndex(x => x.uid === opp.uid);
        const oppCardCount = Number(opp.opponentCardCount || 0);
        const oppCardsHTML = getOppCardsHTML(oppCardCount);
        html += `
        <div class="gts-player right">
          ${buildFramedAvatarHTML(opp.avatar, opp.selectedFrame, `gts-avatar ${isOppTurn ? 'active' : ''}`)}
          <div class="gts-info">
             <div class="gts-row-top">
                 <span class="gts-name">${escapeHTML(opp.username)}</span>
             </div>
             <span class="gts-score">Skor: ${Number(opp.score || 0)}</span>
          </div>
        </div>`;
    } else if (others.length > 1) {
        const oppsHTML = others.map(o => {
            const isTurn = r.turn === r.players.findIndex(x => x.uid === o.uid);
            return `
              <div class="gts-opp-row ${isTurn ? 'active' : ''}">
                <span class="gts-opp-meta">${isTeamRoomState(r) ? teamNameFor(Number(o.seat) === 0 || Number(o.seat) === 2 ? 0 : 1) : `(${Number(o.opponentCardCount || 0)} KART)`}</span>
                <span class="gts-opp-name">${escapeHTML(o.username)}</span>
                ${buildFramedAvatarHTML(o.avatar, o.selectedFrame, `gts-opp-avatar`, `pm-game-avatar-shell--mini`)}
              </div>`;
        }).join('');
        html += `
        <div class="gts-player right">
          <div class="gts-info">
            <div class="gts-opponents-list">${oppsHTML}</div>
          </div>
        </div>`;
    }

    document.getElementById("gameTopScoreBar").innerHTML = html;
}

function syncUI(r){
  if(!r) return; currentRoomState = r;
  if (r.status !== 'finished' && r.status !== 'abandoned') { clearPistiSocketNotice(); showGameNotice(''); }
  if(r.status === 'finished' || r.status === 'abandoned'){ 
      if(socket && currentRoomId) socket.emit('pisti:leave', currentRoomId);
      if (r.resultSummary) {
          playResultSfx(r.resultSummary);
          showGameResultSummary(r.resultSummary, 'Pişti Sonucu', 'Masa sonucu işlendi.', 'info');
          return;
      }
      
      const fallback = fallbackResultSummary(r);
      playResultSfx(fallback);
      showGameResultSummary(fallback, fallback.title, fallback.message, fallback.outcome === 'win' ? 'success' : fallback.outcome === 'loss' ? 'error' : 'info');
      return; 
  }
  
  if (r.lastEvent && r.lastEvent.ts > lastEventTs) {
      lastEventTs = r.lastEvent.ts;
      const isMe = r.lastEvent.uid === userUid;

      if (r.lastEvent.type === 'capture' || r.lastEvent.type === 'pisti') {
          isAnimatingCapture = true;
          renderTableCards(r.lastEvent.tableBefore || [], r.lastEvent.card);
          
          if (r.lastEvent.type === 'pisti') triggerPistiAnim();
          else playSfx('capture');

          const captureEventTs = r.lastEvent.ts;
          clearTimeout(captureAnimationTimer);
          captureAnimationTimer = setTimeout(() => {
              if (lastEventTs !== captureEventTs) return;
              isAnimatingCapture = false;
              renderTableCards(currentRoomState?.tableCards || r.tableCards);
          }, 900);
      } else {
          if (r.lastEvent.type !== 'deal' && !isMe) { playSfx('play'); }
      }
  }

  const me = r.players.find(p=>p.uid===userUid);
  renderOpponentHandStage(r);
  runDealSequence(r, me);

  const newStateHash = [r.stateVersion || 0, r.updatedAt || 0, r.turn, Array.isArray(r.tableCards) ? r.tableCards.join(',') : '', r.deckCount, me ? me.hand.join(',') : ''].join('_');
  const stateUnchanged = lastSyncHash === newStateHash;
  lastSyncHash = newStateHash;
  
  const currentHandKey = me ? me.hand.join('|') : '';
  lastDealtHandKey = currentHandKey;

  const isMyTurn = r.players?.[r.turn]?.uid === userUid;
  const stTxt = document.getElementById("gameStatusTxt");
  const teamStatus = isTeamRoomState(r) && Number(r.viewerTeam) >= 0 ? ` • ${teamNameFor(r.viewerTeam)}` : '';
  stTxt.innerText = r.status==='waiting' ? "RAKİPLER BEKLENİYOR..." : (isMyTurn ? `SIRA SİZDE${teamStatus}` : `RAKİBİN HAMLESİ BEKLENİYOR...${teamStatus}`);
  stTxt.style.color = isMyTurn ? "var(--green-neon)" : "var(--gold-base)";
  document.getElementById("deckCountInfo").innerText = `DESTE: ${r.deckCount}`;

  const myHandBox = document.getElementById("myHandAreaBox");
  if(r.status === 'playing') { if(!isMyTurn) myHandBox.classList.add('passive-hand'); else myHandBox.classList.remove('passive-hand'); }

  renderGameTopBar(r);

  if (!isAnimatingCapture) {
      renderTableCards(r.tableCards);
  }

  if(me){
      const cardsArea = document.getElementById("myCardsArea");
      const currentTokens = Array.from(cardsArea.children)
            .filter(el => el.style.display !== 'none')
            .map(el => el.getAttribute('data-token'))
            .filter(Boolean);
      
      const missingCards = me.hand.some(token => !currentTokens.includes(token));
      const countMismatch = currentTokens.length !== me.hand.length;

      if (missingCards || countMismatch) {
          let myH=''; 
          const dealClass = r.lastEvent?.type === 'deal' ? ' deal-sync-card' : '';
          me.hand.forEach((c,idx)=>{ 
              myH += `<div class="card-3d deal-anim${dealClass}" id="cardEl_${idx}" role="button" tabindex="0" data-card-index="${idx}" data-token="${escapeHTML(c)}" style="--deal-i:${idx}">${getCardHTML(c)}</div>`; 
          });
          cardsArea.innerHTML = myH; 
      } else {
          Array.from(cardsArea.children).forEach(el => {
              let token = el.getAttribute('data-token');
              if (!me.hand.includes(token)) { el.style.display = 'none'; }
          });
      }
  }
}


function emitPistiPlay(payload) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected || typeof socket.emit !== 'function') {
      reject(new Error('SOCKET_NOT_READY'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('SOCKET_PLAY_TIMEOUT')), 4500);
    socket.emit('pisti:play', payload, (ack) => {
      clearTimeout(timer);
      if (!ack || ack.ok === false) {
        const error = new Error(ack?.error || 'PISTI_PLAY_REJECTED');
        error.payload = ack;
        reject(error);
        return;
      }
      resolve(ack);
    });
  });
}

window.playCard = async (idx, token) => {
  if (isProcessing || !currentRoomState || currentRoomState.status !== 'playing') return;
  const myIndex = currentRoomState.players.findIndex(p => p.uid === userUid);
  if (myIndex < 0 || currentRoomState.turn !== myIndex) return;

  const myHand = Array.isArray(currentRoomState.players[myIndex].hand) ? currentRoomState.players[myIndex].hand : [];
  const actualIndex = myHand.indexOf(token);
  if (actualIndex < 0) return;

  isProcessing = true;
  playSfx('play');

  document.getElementById("myHandAreaBox").classList.add('passive-hand');
  const cardEl = document.getElementById(`cardEl_${idx}`);
  const optimisticTable = Array.isArray(currentRoomState.tableCards) ? [...currentRoomState.tableCards, token] : [token];
  renderTableCards(optimisticTable);
  animateCardToTable(cardEl, token);
  cardEl?.classList.add('is-pending');

  let fallbackTimeout = setTimeout(() => { 
      isProcessing = false; 
      cardEl?.classList.remove('is-pending');
      syncUI(currentRoomState);
  }, 4500); 

  try {
    const payload = { roomId: currentRoomId, cardIndex: actualIndex, cardToken: token, expectedStateVersion: currentRoomState?.stateVersion || 0, clientMoveId: `${currentRoomId}:${currentRoomState?.stateVersion || 0}:${token}` };
    let playRes = null;
    try {
      playRes = await emitPistiPlay(payload);
    } catch (_) {
      playRes = await fetchAPI('/api/pisti-online/play', 'POST', payload);
    }
    isProcessing = false; 
    clearTimeout(fallbackTimeout); 
    cardEl?.classList.remove('is-pending'); 
    
    if (playRes && playRes.ok && playRes.room) {
        syncUI(playRes.room); 
    } else {
        syncUI(currentRoomState);
    }
  } catch(e) { 
      isProcessing = false; 
      clearTimeout(fallbackTimeout); 
      cardEl?.classList.remove('is-pending');
      syncUI(currentRoomState);
  }
};

function handleCardActivation(target) {
  if (!target || target.classList.contains('is-disabled')) return;
  const idx = Number(target.dataset.cardIndex || -1);
  const token = target.dataset.token || '';
  window.playCard(idx, token);
}

document.addEventListener('dblclick', (event) => {
  if (event.target.closest('input, textarea, select')) return;
  event.preventDefault();
}, { passive: false });

document.addEventListener('contextmenu', (event) => {
  if (event.target.closest('input, textarea, select')) return;
  if (event.target.closest('#lobbyArea, #gameArea, .modal-overlay, .top-bar-full')) event.preventDefault();
}, { passive: false });

document.addEventListener('selectstart', (event) => {
  if (event.target.closest('input, textarea, select')) return;
  if (event.target.closest('#lobbyArea, #gameArea, .modal-overlay, .top-bar-full')) event.preventDefault();
}, { passive: false });

document.addEventListener('click', (event) => {
  const card = event.target.closest('.card-3d[data-token]');
  if (card) {
    event.preventDefault();
    handleCardActivation(card);
  }
  const chip = event.target.closest('.chip-btn[data-bet]');
  if (chip) {
    event.preventDefault();
    selectBetChip(chip.dataset.bet);
  }
  const modeCard = event.target.closest('.mode-card[data-pisti-mode]');
  if (modeCard) {
    event.preventDefault();
    selectPistiMode(modeCard.dataset.pistiMode || 'bet-2-52');
  }
}, { passive: false });

document.getElementById('roomModeSelect')?.addEventListener('change', updateCreateModeUI);
updateCreateModeUI();
schedulePistiCardPreload();
preloadPistiSfxAssets();

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest?.('.card-3d[data-token]');
  if (card) {
    event.preventDefault();
    handleCardActivation(card);
  }
}, { passive: false });

onAuthStateChanged(u => {
  if (!u) {
    bootCompleted = false;
    socketAvailableForGame = false;
    setBootProgress(10);
    setBootStatus('Oturum doğrulanıyor...');
    setBootActions({ showEnter: false, showRetry: false });
    return;
  }
  if (!bootCompleted && !bootPromise) bootPistiApp(false).catch(() => null);
});

window.addEventListener('load', () => {
  schedulePistiCardPreload();
  preloadPistiSfxAssets();
  setBootProgress(4);
  setBootStatus('Kaynaklar hazırlanıyor...');
  setBootActions({ showEnter: false, showRetry: false });
  setTimeout(() => { if (!bootCompleted && !bootPromise) bootPistiApp(false).catch(() => null); }, 120);
});

(() => {
  'use strict';

  function parseArgs(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function resolveAction(name) {
    const parts = String(name || '').split('.').filter(Boolean);
    let ctx = window;
    for (const part of parts) {
      if (!ctx || typeof ctx !== 'object' && typeof ctx !== 'function') return null;
      ctx = ctx[part];
    }
    return typeof ctx === 'function' ? ctx : null;
  }

  function runAction(target, event) {
    if (!target) return;
    const clickId = target.dataset.pmClickId;
    if (clickId) {
      const node = document.getElementById(clickId);
      if (node && typeof node.click === 'function') {
        event.preventDefault();
        node.click();
      }
      return;
    }
    const fn = resolveAction(target.dataset.pmAction || '');
    if (!fn) return;
    event.preventDefault();
    fn(...parseArgs(target.dataset.pmArgs || '[]'));
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-pm-action]:not([data-pm-action-event]),[data-pm-click-id]');
    if (target) runAction(target, event);
  }, { passive: false });

  document.addEventListener('input', (event) => {
    const target = event.target.closest('[data-pm-action][data-pm-action-event="input"]');
    if (target) runAction(target, event);
  }, { passive: false });
})();
