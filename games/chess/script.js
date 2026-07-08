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

window.__PLAYMATRIX_ROUTE_NORMALIZER_DISABLED__ = true;
import { initPlayMatrixOnlineCore } from "/public/pm-online-core.js?v=pm-v14-auth-live-data-fix";

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
    function escapeHTML(value = '') { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\'/g, '&#39;'); }


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


const ChessAudio = (() => {
  let ctx = null;
  let unlocked = false;
  const presets = { move:[520,0.045,'sine',0.055], capture:[360,0.07,'triangle',0.075], check:[760,0.08,'square',0.055], win:[880,0.10,'sine',0.07], end:[180,0.12,'sawtooth',0.05], start:[620,0.08,'sine',0.045], error:[140,0.10,'square',0.04] };
  function getCtx(){ const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!ctx) ctx = new AC(); return ctx; }
  async function unlock(){ try { const c = getCtx(); if (!c) return false; if (c.state === 'suspended') await c.resume(); unlocked = true; return true; } catch (_) { return false; } }
  function play(name='move'){ try { const c = getCtx(); if (!c) return; if (c.state === 'suspended') c.resume().catch(()=>null); const [freq,duration,type,gainValue] = presets[String(name||'move').toLowerCase()] || presets.move; const t = c.currentTime; const osc = c.createOscillator(); const gain = c.createGain(); osc.type = type; osc.frequency.setValueAtTime(freq, t); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration); osc.connect(gain).connect(c.destination); osc.start(t); osc.stop(t + duration + 0.02); } catch (_) {} }
  return { unlock, play, get unlocked(){ return unlocked; } };
})();
function installChessAudioUnlock(){ const unlock = () => ChessAudio.unlock().catch(()=>null); window.addEventListener('pointerdown', unlock, { once:true, passive:true }); window.addEventListener('touchstart', unlock, { once:true, passive:true }); window.addEventListener('click', unlock, { once:true, passive:true }); }
function playSfx(name = '') { ChessAudio.play(name || 'move'); }
installChessAudioUnlock();

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
    console.warn('[PlayMatrix:Chess] pending auto join storage skipped', error);
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
    const elLoaderPct = document.getElementById('loaderPct');
    const elLoaderStatus = document.getElementById('loaderStatus');
    const elBtnEnterGame = document.getElementById('btnEnterGame');
    const elBtnRetryBoot = document.getElementById('btnRetryBoot');
    const elLobbyNotice = document.getElementById('lobbyNotice');
    const elGameNotice = document.getElementById('gameNotice');
    let bootPromise = null;
    let bootCompleted = false;
    let bootActionMode = 'retry';
    let userUid = '';
    let currentRoomId = '';
    let pollingInterval = 0;
    let pingInterval = 0;
    let myColor = 'w';
    let selectedSq = null;
    let validMovesForSelected = [];
    let lastFen = '';
    let lastStatus = '';
    let lastMoveCount = 0;
    let socketListenersWired = false;
    let isProcessingMove = false;
    let currentRoomState = null;
    let lastResultSummaryKey = '';
    let lastChessProfileNoticeAt = 0;
    let lastChessLobbyNoticeAt = 0;
    const CLIENT_INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const MIN_DRAW_OFFER_MOVES = 20;
    function createMiniChessClient() {
      let state = parseClientFen(CLIENT_INITIAL_FEN);
      function parseClientFen(fen = CLIENT_INITIAL_FEN) {
        const parts = String(fen || CLIENT_INITIAL_FEN).split(/\s+/);
        const rows = (parts[0] || CLIENT_INITIAL_FEN.split(' ')[0]).split('/');
        const board = Array.from({ length: 8 }, () => Array(8).fill(null));
        for (let r = 0; r < 8; r += 1) {
          let c = 0;
          for (const ch of rows[r] || '8') {
            if (/\d/.test(ch)) c += Number(ch);
            else if ('prnbqkPRNBQK'.includes(ch) && c < 8) board[r][c++] = ch;
          }
        }
        return { board, turn: parts[1] === 'b' ? 'b' : 'w' };
      }
      const filesLocal = 'abcdefgh';
      const toPos = (sq) => ({ row: 8 - Number(sq[1]), col: filesLocal.indexOf(sq[0]) });
      const toSq = (row, col) => `${filesLocal[col]}${8 - row}`;
      const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
      const colorOfPiece = (p) => p === p.toUpperCase() ? 'w' : 'b';
      const pieceObj = (p) => p ? { type: p.toLowerCase(), color: colorOfPiece(p) } : null;
      function push(moves, fr, fc, tr, tc) {
        if (!inB(tr, tc)) return;
        const p = state.board[fr][fc];
        const t = state.board[tr][tc];
        if (t && colorOfPiece(t) === colorOfPiece(p)) return;
        moves.push({ from: toSq(fr, fc), to: toSq(tr, tc), captured: t || '' });
      }
      return {
        load(fen) { state = parseClientFen(fen); return true; },
        board() { return state.board.map(row => row.map(pieceObj)); },
        get(sq) { const { row, col } = toPos(sq); return inB(row, col) ? pieceObj(state.board[row][col]) : null; },
        turn() { return state.turn; },
        in_check() { return false; },
        moves({ square } = {}) {
          const { row: r, col: c } = toPos(square || 'a1');
          if (!inB(r, c)) return [];
          const p = state.board[r][c];
          if (!p) return [];
          const moves = [];
          const color = colorOfPiece(p);
          const type = p.toLowerCase();
          if (type === 'p') {
            const dir = color === 'w' ? -1 : 1;
            if (inB(r + dir, c) && !state.board[r + dir][c]) push(moves, r, c, r + dir, c);
            for (const dc of [-1, 1]) if (inB(r + dir, c + dc) && state.board[r + dir][c + dc] && colorOfPiece(state.board[r + dir][c + dc]) !== color) push(moves, r, c, r + dir, c + dc);
          } else if (type === 'n') {
            [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => push(moves,r,c,r+dr,c+dc));
          } else if (type === 'k') {
            for (let dr=-1; dr<=1; dr+=1) for (let dc=-1; dc<=1; dc+=1) if (dr||dc) push(moves,r,c,r+dr,c+dc);
          } else {
            const dirs = type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
            for (const [dr,dc] of dirs) { let tr=r+dr, tc=c+dc; while(inB(tr,tc)){ const target=state.board[tr][tc]; if(!target) push(moves,r,c,tr,tc); else { if(colorOfPiece(target)!==color) push(moves,r,c,tr,tc); break; } tr+=dr; tc+=dc; } }
          }
          return moves;
        },
        move({ from, to, promotion = 'q' } = {}) {
          const a = toPos(from), b = toPos(to);
          if (!inB(a.row,a.col) || !inB(b.row,b.col)) return null;
          const p = state.board[a.row][a.col];
          if (!p) return null;
          const captured = state.board[b.row][b.col] || '';
          state.board[a.row][a.col] = null;
          state.board[b.row][b.col] = (p.toLowerCase() === 'p' && (b.row === 0 || b.row === 7)) ? (colorOfPiece(p) === 'w' ? promotion.toUpperCase() : promotion.toLowerCase()) : p;
          state.turn = state.turn === 'w' ? 'b' : 'w';
          return { from, to, captured };
        }
      };
    }
    const gameLogic = window.Chess ? new Chess() : createMiniChessClient();
    let lobbySearchQuery = '';
    let chessSocket = null;
    const avatarRenderCache = new Map();
    let extensionPromptKey = '';
    let boardLayoutColor = '';
    let boardClickBound = false;
    const PIECE_UNICODE = Object.freeze({ K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' });
    const PIECE_IMGS = Object.freeze(Object.fromEntries(Object.entries(PIECE_UNICODE).map(([key, glyph]) => {
      const fg = key === key.toUpperCase() ? '#f8fafc' : '#0f172a';
      const stroke = key === key.toUpperCase() ? '#64748b' : '#e5e7eb';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="transparent"/><text x="64" y="91" text-anchor="middle" font-size="86" font-family="Georgia,serif" font-weight="700" fill="${fg}" stroke="${stroke}" stroke-width="3">${glyph}</text></svg>`;
      return [key, `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`];
    })));

    function normalizePlayer(player = {}) {
      if (!player || typeof player !== 'object') return { username: 'Bekleniyor...', name: 'Bekleniyor...', color: '', avatar: '', selectedFrame: 0, isMe: false, uid: '' };
      return {
        ...player,
        username: player.username || player.name || player.displayName || 'Oyuncu',
        name: player.name || player.username || player.displayName || 'Oyuncu',
        avatar: player.avatar || '',
        selectedFrame: Number(player.selectedFrame || 0) || 0,
        frameUrl: player.frameUrl || '',
        isMe: !!player.isMe || (!!player.uid && player.uid === userUid),
        uid: player.uid || ''
      };
    }

    function getRoomPlayers(room = {}) {
      const players = Array.isArray(room.players) ? room.players.map(normalizePlayer) : [];
      const host = normalizePlayer(typeof room.host === 'object' ? room.host : { username: room.host || room.hostName || 'Bilinmeyen', color: 'w', uid: room.hostUid || '' });
      const guest = room.guest ? normalizePlayer(typeof room.guest === 'object' ? room.guest : { username: room.guest || room.guestName || 'Bekleniyor...', color: 'b', uid: room.guestUid || '' }) : normalizePlayer(players.find(p => p.color === 'b') || { username: 'Bekleniyor...', color: 'b' });
      return { players, host: players.find(p => p.color === 'w') || host, guest: players.find(p => p.color === 'b') || guest };
    }

    function applyProgressionFromPayload(payload = {}) {
      const profile = payload.user || payload.profile || payload;
      const progression = profile?.progression || payload.progression || {};
      const accountLevel = Math.max(1, Number(progression.accountLevel ?? profile.accountLevel ?? profile.level ?? 1) || 1);
      const progress = Math.max(0, Math.min(100, Number(progression.progressPercent ?? progression.accountLevelProgressPct ?? profile.accountLevelProgressPct ?? 0) || 0));
      const levelBarEl = document.getElementById('uiAccountLevelBar');
      const levelPctEl = document.getElementById('uiAccountLevelPct');
      const levelBadgeEl = document.getElementById('uiAccountLevelBadge');
      if (levelBarEl) { levelBarEl.style.width = progress + '%'; levelBarEl.classList.add('pm-level-pulse'); setTimeout(() => levelBarEl.classList.remove('pm-level-pulse'), 800); }
      if (levelPctEl) levelPctEl.innerText = progress.toFixed(1) + '%';
      if (levelBadgeEl) levelBadgeEl.innerText = accountLevel;
    }

    function applyTopbarAvatar(profile = {}) {
      const host = document.getElementById('uiAccountAvatarHost');
      if (!host) return;
      const signature = JSON.stringify({ avatar: profile.avatar || '' });
      if (host.dataset.pmAvatarSig === signature && host.childElementCount) return;
      host.dataset.pmAvatarSig = signature;
      try {
        if (window.PMAvatar && typeof window.PMAvatar.renderAvatarNode === 'function') {
          const img = document.createElement('img'); img.className = 'pm-game-topbar-avatar-fallback'; img.alt = 'Hesap avatarı'; img.src = profile.avatar || DEFAULT_AVATAR; host.replaceChildren(img);
          return;
        }
      } catch (_) {}
      const img = document.createElement('img');
      img.className = 'pm-game-topbar-avatar-fallback';
      img.alt = 'Hesap avatarı';
      img.src = profile.avatar || DEFAULT_AVATAR;
      host.replaceChildren(img);
    }


    function chessUserMessage(value = '', fallback = 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.') {
      try {
        if (window.PMUserMessages && typeof window.PMUserMessages.normalize === 'function') return window.PMUserMessages.normalize(value, fallback);
        if (typeof window.PMSanitizeUserMessage === 'function') return window.PMSanitizeUserMessage(value, fallback);
      } catch (_) {}
      const raw = String(value || '').trim();
      return raw || fallback;
    }

    function renderRuntimeNotice(target, message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
      if (!target) return;
      const text = chessUserMessage(message || '', '').trim();
      if (!text) { target.className = 'runtime-notice'; target.replaceChildren(); return; }
      target.className = `runtime-notice show ${tone === 'error' ? 'is-error' : tone === 'warning' ? 'is-warning' : ''}`.trim();
      target.replaceChildren();
      const textNode = document.createElement('div');
      textNode.className = 'runtime-notice__text';
      textNode.textContent = text;
      target.appendChild(textNode);
      if (actionLabel && typeof actionHandler === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'runtime-notice__action';
        btn.textContent = chessUserMessage(actionLabel, 'Tekrar Dene');
        btn.addEventListener('click', actionHandler);
        target.appendChild(btn);
      }
    }

    function showLobbyNotice(message, tone = 'warning', actionLabel = '', actionHandler = null) { renderRuntimeNotice(elLobbyNotice, message, tone, actionLabel, actionHandler); }
    function showGameNotice(message, tone = 'warning', actionLabel = '', actionHandler = null) { renderRuntimeNotice(elGameNotice, message, tone, actionLabel, actionHandler); }


function setModalActive(id, active = true) {
  const el = document.getElementById(id);
  if (!el) return;
  const isActive = !!active;
  el.hidden = !isActive;
  el.classList.toggle('active', isActive);
  el.classList.toggle('show', isActive);
  el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
}
function closeConfirmModal() { setModalActive('confirmModal', false); }
function showHowToPlay() {
  showMatrixModal('Nasıl Oynanır', 'Oda kur veya hızlı katıl. Taşına tıkla, sonra hedef kareyi seç. Şah-mat, teslim veya bağlantı kopması maç sonucunu belirler.', 'info');
}
function showMatrixModal(title, message, tone = 'info', autoLobby = false) {
  const titleEl = document.getElementById('matrixModalTitle');
  const descEl = document.getElementById('matrixModalDesc');
  const modal = document.getElementById('matrixModal');
  const closeBtn = document.getElementById('matrixModalCloseBtn');
  if (titleEl) titleEl.textContent = chessUserMessage(title || 'Bilgi', 'Bilgi');
  if (descEl) descEl.textContent = chessUserMessage(message || '', 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
  if (modal) {
    modal.dataset.tone = tone;
    setModalActive('matrixModal', true);
  }
  if (closeBtn) closeBtn.dataset.pmAutoLobby = autoLobby ? 'true' : 'false';
}
function showGameResultSummary(summary = {}, fallbackTitle = 'Oyun Sonucu', fallbackMessage = '', tone = 'info') {
  const key = [summary?.gameType || 'chess', summary?.resultCode || '', summary?.settledAt || '', summary?.outcome || ''].join(':');
  if (key && key === lastResultSummaryKey) return;
  lastResultSummaryKey = key;
  const title = summary?.title || fallbackTitle;
  const message = summary?.message || fallbackMessage || 'Oyun sonucu işlendi.';
  const resultTone = summary?.outcome === 'win' ? 'success' : summary?.outcome === 'loss' || summary?.outcome === 'abandoned' ? 'error' : tone;
  showMatrixModal(title, message, resultTone, true);
}

function closeMatrixModal() {
  const closeBtn = document.getElementById('matrixModalCloseBtn');
  const shouldLobby = closeBtn?.dataset.pmAutoLobby === 'true';
  setModalActive('matrixModal', false);
  if (shouldLobby) resetToLobby();
}
function showConfirmModal(title, message, onConfirm, onCancel = null, options = {}) {
  const titleEl = document.getElementById('confirmModalTitle');
  const descEl = document.getElementById('confirmModalDesc');
  const yesBtn = document.getElementById('confirmYesBtn');
  const noBtn = document.querySelector('#confirmModal .btn-no');
  if (titleEl) titleEl.textContent = String(title || 'Onay');
  if (descEl) descEl.textContent = String(message || 'İşlemi onaylıyor musun?');
  if (yesBtn) {
    yesBtn.textContent = options.yesText || 'EVET';
    yesBtn.onclick = async () => {
      yesBtn.disabled = true;
      try { if (typeof onConfirm === 'function') await onConfirm(); }
      finally { yesBtn.disabled = false; closeConfirmModal(); }
    };
  }
  if (noBtn) {
    noBtn.textContent = options.noText || 'HAYIR';
    noBtn.onclick = async () => {
      noBtn.disabled = true;
      try { if (typeof onCancel === 'function') await onCancel(); }
      finally { noBtn.disabled = false; closeConfirmModal(); }
    };
  }
  setModalActive('confirmModal', true);
}
function resetToLobby() {
  clearInterval(pollingInterval);
  stopGamePing();
  try { chessSocket?.emit?.('chess:join', ''); } catch (_) {}
  currentRoomId = '';
  currentRoomState = null;
  selectedSq = null;
  validMovesForSelected = [];
  lastFen = '';
  lastStatus = '';
  lastMoveCount = 0;
  try { localStorage.removeItem('activeChessRoom'); } catch (_) {}
  const lobby = document.getElementById('lobbyArea');
  const game = document.getElementById('gameArea');
  if (lobby) lobby.style.display = '';
  if (game) game.style.display = 'none';
  startLobbyPolling();
}
async function handleChessExit(event){
  try { event?.preventDefault?.(); } catch (_) {}
  if (currentRoomId) {
    if (isProcessingMove) return;
    isProcessingMove = true;
    const roomId = currentRoomId;
    showGameNotice('Oda kapatılıyor ve rakibe bildiriliyor...', 'warning');
    try {
      const res = await fetchAPI('/api/chess/leave', 'POST', { roomId, reason: 'player-exit' });
      if (res?.room) syncBoardUI(res.room);
      resetToLobby();
      showLobbyNotice('Oda kapatıldı. Rakibe bildirim gönderildi.', 'info');
    } catch (error) {
      showGameNotice('Oda kapatılamadı. Bağlantını kontrol edip tekrar dene.', 'error', 'Tekrar Dene', () => handleChessExit());
    } finally {
      isProcessingMove = false;
    }
    return;
  }
  window.location.href = 'https://playmatrix.com.tr/';
}
Object.assign(window, { closeConfirmModal, showConfirmModal, closeMatrixModal, showHowToPlay, showMatrixModal, resetToLobby, handleChessExit });

    function clearRuntimeNotices() { showLobbyNotice(''); showGameNotice(''); }
    function setBootBusyState(isBusy) { if (elBtnEnterGame) elBtnEnterGame.disabled = !!isBusy; if (elBtnRetryBoot) elBtnRetryBoot.disabled = !!isBusy; }

    function setBootProgress(value) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      if (elLoaderFill) elLoaderFill.style.width = pct + '%';
      if (elLoaderPct) elLoaderPct.textContent = `${Math.round(pct)}%`;
    }

    function setBootStatus(message, tone = 'info') {
      if (!elLoaderStatus) return;
      elLoaderStatus.textContent = message;
      elLoaderStatus.classList.remove('is-error', 'is-warning');
      if (tone === 'error') elLoaderStatus.classList.add('is-error');
      if (tone === 'warning') elLoaderStatus.classList.add('is-warning');
    }

    function setBootActions({ showEnter = false, showRetry = false, enterLabel = 'SİSTEME BAĞLAN', actionMode = 'continue' } = {}) {
      bootActionMode = actionMode;
      if (elBtnEnterGame) {
        elBtnEnterGame.textContent = enterLabel;
        elBtnEnterGame.style.display = showEnter ? 'block' : 'none';
      }
      if (elBtnRetryBoot) elBtnRetryBoot.style.display = showRetry ? 'block' : 'none';
    }

    function dismissIntro() {
      if (!elStudioIntro) return;
      elStudioIntro.style.opacity = '0';
      setTimeout(() => { elStudioIntro.style.display = 'none'; }, 280);
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

    async function preparePollingSync() {
      await ensureApiBaseReady();
      return true;
    }

    async function bootChessApp(force = false) {
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
        await withTimeout(fetchBalance(), 7000, 'PROFILE_TIMEOUT');
        setBootProgress(48);
        setBootStatus('Lobi arayüzü hazırlanıyor...');
        wireLobbySearchUI();
        wireRoomModeUI();
        try { if (typeof ensureRealtimeShell === 'function') ensureRealtimeShell(); } catch (error) { console.warn('[PlayMatrix:Chess] realtime shell skipped', error); }
        setBootProgress(66);
        setBootStatus('Lobi ve oyun verileri HTTP eşitleme modunda hazırlanıyor...');
        await withTimeout(Promise.resolve(preparePollingSync()).catch(() => null), 1200, 'SYNC_TIMEOUT').catch(() => null);
        ensureChessSocket().catch(() => null);
        const preferredRoom = safeGetPendingAutoJoinRoom('chess', 'activeChessRoom');
        let restored = false;
        if (preferredRoom) {
          setBootProgress(82);
          setBootStatus('Önceki oyun kontrol ediliyor...');
          restored = await withTimeout(restoreChessSession(preferredRoom, true), 6000, 'RESTORE_TIMEOUT').catch(() => false);
        }
        if (!restored) startLobbyPolling();
        bootCompleted = true;
        setBootProgress(100);
        setBootStatus('Bağlantı hazır. Arena açılıyor...');
        setBootActions({ showEnter: true, showRetry: false, enterLabel: 'ARENAYA GİR', actionMode: 'continue' });
        setTimeout(dismissIntro, 280);
        return true;
      })().catch((error) => {
        const code = error?.code || error?.message || 'BOOT_ERROR';
        if (['AUTH_TIMEOUT','NO_USER','FIREBASE_UNAVAILABLE','PUBLIC_RUNTIME_CONFIG_UNAVAILABLE','PUBLIC_FIREBASE_CONFIG_MISSING','FIREBASE_IMPORT_FAILED','FIREBASE_SDK_TIMEOUT'].includes(code)) {
          setBootProgress(18);
          setBootStatus('Oturum doğrulanamadı. Önce giriş yapıp tekrar deneyin.', 'error');
          setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ANASAYFAYA DÖN', actionMode: 'home' });
        } else {
          console.warn('[PlayMatrix:Chess] boot degraded to lobby', error);
          try { startLobbyPolling(); } catch (_) {}
          bootCompleted = true;
          setBootProgress(100);
          setBootStatus('Arena temel modda açılıyor. Bağlantı arka planda yeniden denenecek.', 'warning');
          setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ARENAYA GİR', actionMode: 'continue' });
          setTimeout(dismissIntro, 280);
          return true;
        }
        bootCompleted = false;
        throw error;
      }).finally(() => { setBootBusyState(false); bootPromise = null; });
      return bootPromise;
    }

    elBtnEnterGame?.addEventListener('click', () => {
      if (bootActionMode === 'home') { window.location.href = '/'; return; }
      if (bootCompleted) { dismissIntro(); return; }
      bootChessApp(true).catch(() => null);
    });

    elBtnRetryBoot?.addEventListener('click', () => { bootChessApp(true).catch(() => null); });


    function resolveAccountLevel(profile = {}) {
      const value = Number(profile?.accountLevel ?? profile?.progression?.accountLevel ?? profile?.level ?? 1);
      return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
    }

    function resolveAccountLevelProgress(profile = {}) {
      const value = Number(profile?.progression?.accountLevelProgressPct ?? profile?.accountLevelProgressPct ?? 0);
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    }

    const CHESS_EXPECTED_CLIENT_ERRORS = new Set(['STATE_VERSION_MISMATCH','ROOM_NOT_FOUND','ROOM_CLOSED','ROOM_FINISHED','NOT_YOUR_TURN','ROOM_NOT_PLAYING','DRAW_DISABLED_FOR_BOT','NOT_IN_ROOM','GAME_MAINTENANCE','SYSTEM_MAINTENANCE']);
    const chessIssueDedupe = new Map();
    function shouldReportChessIssue(scope, payload = {}) {
      const message = String(payload.message || payload.error || '').trim();
      const upper = message.toUpperCase();
      const status = Number(payload.status || payload?.error?.status || 0) || 0;
      if (status > 0 && status < 500) return false;
      if (CHESS_EXPECTED_CLIENT_ERRORS.has(upper)) return false;
      const lowScope = String(scope || '').toLowerCase();
      const source = String(payload.source || '').toLowerCase();
      const endpoint = String(payload.endpoint || source || scope || '').toLowerCase();
      if (/data-pm-action|client-action|ui-action/.test(`${lowScope} ${upper}`.toLowerCase())) return false;
      if (/load failed|failed to fetch|network|timeout|zaman aşımı|request_timeout/i.test(message) && /api\.(get|post).*\/api\/chess\/(profile|lobby|state|ping|join|create|draw)|\/api\/chess\/(profile|lobby|state|ping|join|create|draw)/i.test(endpoint)) return false;
      if (/promise\.rejection|window\.error/.test(lowScope) && !/typeerror|referenceerror|syntaxerror|rangeerror|is not a function|cannot read|undefined is not/i.test(message)) return false;
      if (source && !source.includes('/games/chess') && !source.includes('satranc') && !source.includes('/api/chess')) return false;
      const key = `${scope}:${upper}:${source}:${payload.line || ''}:${status}`;
      const last = chessIssueDedupe.get(key) || 0;
      if (Date.now() - last < 10 * 60 * 1000) return false;
      chessIssueDedupe.set(key, Date.now());
      return true;
    }
    function reportChessClientIssue(scope, payload = {}) {
      try {
        if (!shouldReportChessIssue(scope, payload)) return;
        const body = { game:'chess', scope:String(scope||'frontend'), type:'chess-client', message:String(payload.message || payload.error || scope || 'Satranç istemci olayı').slice(0,500), path: location.pathname, source: payload.source || 'games/chess/script.js', line: payload.line || null, stack: String(payload.stack || '').slice(0,1200), roomId: currentRoomId || '', stateVersion: currentRoomState?.stateVersion || 0, at: Date.now() };
        fetch(`${getApiBase()}/api/client/error`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body), keepalive:true }).catch(()=>null);
      } catch (_) {}
    }
    // Global PlayMatrix runtime reporter handles window/promise errors; Satranç route-specific API errors are reported through fetchAPI only.
    function chessApiCandidates() {
      const list = [];
      const push = (value) => {
        const base = String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
        if (!base || list.includes(base)) return;
        list.push(base);
      };
      try { window.__PM_API__?.getCandidates?.().forEach(push); } catch (_) {}
      push(getApiBase());
      push(window.__PLAYMATRIX_API_URL__);
      push(window.__PM_STATIC_RUNTIME_CONFIG__?.apiBase);
      push(location.origin);
      return list;
    }
    async function directFetchAPI(endpoint, method = 'GET', body = null) {
      let token = '';
      try { token = await getIdToken(true); } catch (_) { try { token = await getIdToken(false); } catch (_) {} }
      let lastError = null;
      for (const base of chessApiCandidates()) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        try {
          const headers = { Accept: 'application/json', 'x-playmatrix-client': 'web' };
          if (token) headers.Authorization = `Bearer ${token}`;
          if (body != null) headers['Content-Type'] = 'application/json';
          const response = await fetch(`${base}${endpoint}`, { method, credentials: 'include', cache: 'no-store', headers, body: body == null ? undefined : JSON.stringify(body), signal: controller.signal });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            const err = new Error(payload?.message || payload?.error || `HTTP_${response.status}`);
            const rawCode = String(payload?.code || payload?.error || '').toUpperCase();
            err.code = rawCode;
            err.rawCode = rawCode;
            err.userMessage = payload?.message || '';
            err.status = response.status;
            err.payload = payload;
            throw err;
          }
          try { window.__PM_API__?.setApiBase?.(base); } catch (_) {}
          return payload;
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError || new Error('İşlem şu anda yüklenemedi.');
    }
    async function fetchAPI(endpoint, method = 'GET', body = null, attempt = 0) {
      try { return await core.requestWithAuth(endpoint, { method, body, timeoutMs: 9000, retries: attempt === 0 ? 1 : 0 }); }
      catch (error) {
        const message = String(error?.message || error || '');
        if (/load failed|failed to fetch|network|timeout|zaman aşımı|request_timeout/i.test(message) || !error?.status) {
          try { return await directFetchAPI(endpoint, method, body); } catch (fallbackError) { error = fallbackError; }
        }
        const code = String(error?.payload?.error || error?.error || error?.message || '').toUpperCase();
        if (Number(error?.status || 0) === 503 || code === 'GAME_MAINTENANCE' || code === 'SYSTEM_MAINTENANCE') {
          window.location.replace('/?pm_maintenance=chess');
          return new Promise(() => {});
        }
        if (![401,403,404,409,503].includes(Number(error?.status || 0))) {
          reportChessClientIssue(`api.${method}.${endpoint}`, { message:error.message, status:Number(error?.status || 0) || 0, endpoint, method, body, source:`/api/chess${String(endpoint).startsWith('/api/chess') ? '' : endpoint}` });
        }
        throw error;
      }
    }

    async function restoreChessSession(roomId, suppressError = false) {
      const safeRoomId = String(roomId || '').trim();
      if (!safeRoomId) return false;

      try {
        const snapshot = await fetchAPI(`/api/chess/state/${encodeURIComponent(safeRoomId)}?t=${Date.now()}`);
        const room = snapshot?.room;
        const amIPlayer = !!room && (room.host?.uid === userUid || room.guest?.uid === userUid);
        if (room && amIPlayer && (room.status === 'waiting' || room.status === 'playing')) {
          enterGame(room);
          clearPendingAutoJoin('chess', safeRoomId);
          return true;
        }
      } catch (_) {}

      try {
        const joined = await fetchAPI('/api/chess/join', 'POST', { roomId: safeRoomId });
        if (joined?.room) {
          enterGame(joined.room);
          clearPendingAutoJoin('chess', safeRoomId);
          return true;
        }
      } catch (error) {
        if (!suppressError) showRealtimeToast('Odaya girilemedi', error.message || 'Satranç odasına bağlanılamadı.', 'error');
      }

      clearPendingAutoJoin('chess', safeRoomId);
      try { localStorage.removeItem('activeChessRoom'); } catch (_) {}
      return false;
    }

    async function initApp() {
      userUid = auth.currentUser?.uid || userUid;
      if (!userUid) { const user = await resolveBootUser(6500); userUid = user.uid; }
      fetchBalance();
      wireLobbySearchUI();
      wireRoomModeUI();
      ensureRealtimeShell();
      await preparePollingSync();

      const preferredRoom = safeGetPendingAutoJoinRoom('chess', 'activeChessRoom');
      if (preferredRoom && await restoreChessSession(preferredRoom, true)) return;

      startLobbyPolling();
    }

    function wireLobbySearchUI(){
      const inp = document.getElementById("roomSearch");
      const btn = document.getElementById("clearSearchBtn");
      if(!inp || !btn) return;

      inp.addEventListener("input", () => {
        lobbySearchQuery = (inp.value || "").trim().toLowerCase();
        fetchLobby(); 
      });

      btn.addEventListener("click", () => {
        inp.value = "";
        lobbySearchQuery = "";
        inp.blur();
        fetchLobby();
      });
    }

    async function fetchBalance() {
      try {
        const res = await fetchAPI('/api/chess/profile?t=' + Date.now());
        if (!(res && res.ok)) return;
        const profile = (res && typeof res.user === 'object' && res.user) ? res.user : {};
        try { window.__PM_GAME_ACCOUNT_SYNC__?.apply?.({ ok: true, user: profile }); } catch (_) {}
        const balanceEl = document.getElementById("ui-balance") || document.getElementById("uiBalance");
        if (balanceEl) balanceEl.innerText = Number(profile.balance || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        applyProgressionFromPayload(profile);
        applyTopbarAvatar(profile);
        if (!currentRoomId && res?.activeRoom && (res.activeRoom.status === 'waiting' || res.activeRoom.status === 'playing')) {
          enterGame(res.activeRoom);
        }
      } catch(e){
        const now = Date.now();
        if (now - lastChessProfileNoticeAt > 30000) {
          lastChessProfileNoticeAt = now;
          showLobbyNotice('Profil bilgileri yenilenemedi. Sistem arka planda tekrar deneyecek.', 'warning');
        }
      }
    }

    function startLobbyPolling() {
      clearInterval(pollingInterval);
      fetchLobby(true).catch(() => null);
      pollingInterval = setInterval(() => { if (!document.hidden && !chessSocket?.connected) fetchLobby(false).catch(() => null); }, 8000);
    }

    function roomMatchesSearch(r){
      if(!lobbySearchQuery) return true;
      const { host, guest } = getRoomPlayers(r);
      const hostName = (host.username || host.name || '').toString().toLowerCase();
      const guestName = (guest.username || guest.name || '').toString().toLowerCase();
      return hostName.includes(lobbySearchQuery) || guestName.includes(lobbySearchQuery);
    }

    function createLobbyEmpty(message = '', tone = '') {
      const empty = document.createElement('article');
      empty.className = `pm-chess-empty-card${tone ? ` ${tone}` : ''}`;
      const icon = document.createElement('div');
      icon.className = 'pm-chess-empty-icon';
      icon.innerHTML = '<i class="fa-solid fa-chess-knight"></i>';
      const title = document.createElement('strong');
      title.textContent = tone === 'pm-chess-empty-error' ? 'Arena bağlantısı yenileniyor' : 'Yeni rakip seni bekliyor';
      const copy = document.createElement('span');
      copy.textContent = message || 'Şu an açık masa yok. İlk odayı sen kur, rakibini bekle ve liderlik yarışında avantajı ele geçir.';
      const actions = document.createElement('div');
      actions.className = 'pm-chess-empty-actions';
      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'btn-join pm-chess-empty-cta';
      create.textContent = 'ODA KUR';
      create.addEventListener('click', () => window.createRoom?.());
      actions.appendChild(create);
      empty.append(icon, title, copy, actions);
      return empty;
    }

    function createRoomStatus(statusClass, iconClass, text) {
      const status = document.createElement('span');
      status.className = statusClass;
      const icon = document.createElement('i');
      icon.className = iconClass;
      status.append(icon, document.createTextNode(` ${text}`));
      return status;
    }

    function createRoomCard(r) {
      const { host, guest } = getRoomPlayers(r);
      const isMe = !!host.isMe;
      const p1 = host.username || host.name || 'Bilinmeyen';
      const p2 = !guest || guest.username === 'Bekleniyor...' ? '?' : (guest.username || guest.name || 'Bilinmeyen');
      const betLabel = Number(r.bet || 0) > 0 ? `${Number(r.bet).toLocaleString('tr-TR')} MC` : 'Bahissiz';
      const modeLabel = r.mode === 'bot' ? 'Bot' : r.mode === 'bet' ? 'Bahisli' : r.mode === 'private' ? 'Özel' : 'Bahissiz';
      const card = document.createElement('div');
      card.className = 'room-card';
      const vs = document.createElement('div');
      vs.className = 'room-vs-area';
      const hostEl = document.createElement('div');
      hostEl.className = 'player-name';
      hostEl.textContent = p1;
      const badge = document.createElement('div');
      badge.className = 'vs-badge';
      badge.textContent = 'VS';
      const guestEl = document.createElement('div');
      guestEl.className = 'player-name';
      guestEl.textContent = p2;
      vs.append(hostEl, badge, guestEl);

      const meta = document.createElement('div');
      meta.className = 'room-meta';
      const mode = document.createElement('span');
      mode.textContent = modeLabel;
      const bet = document.createElement('span');
      bet.textContent = betLabel;
      meta.append(mode, bet);

      const footer = document.createElement('div');
      footer.className = 'room-footer';
      const statusWrap = document.createElement('div');
      statusWrap.className = 'room-status';
      const button = document.createElement('button');
      button.className = 'btn-join';
      button.type = 'button';
      if (r.mode === 'bot' || r.joinDisabledReason === 'BOT_ROOM_NOT_JOINABLE') {
        statusWrap.appendChild(createRoomStatus('pm-chess-status-playing', 'fa-solid fa-robot', 'Bot Oyunu • Katılım Kapalı'));
        button.classList.add('btn-disabled');
        button.disabled = true;
        button.textContent = 'BOT ODASI';
      } else if (r.status === 'waiting') {
        statusWrap.appendChild(createRoomStatus('pm-chess-status-waiting', 'fa-solid fa-clock', 'Rakip Bekleniyor'));
        if (isMe) {
          button.classList.add('btn-disabled');
          button.disabled = true;
          button.textContent = 'SENİN ODAN';
        } else {
          button.dataset.roomId = String(r.id || '');
          button.textContent = 'KATIL';
          button.addEventListener('click', () => window.joinRoom(button.dataset.roomId));
        }
      } else {
        statusWrap.appendChild(createRoomStatus('pm-chess-status-playing', 'fa-solid fa-fire', 'Maç Devam Ediyor'));
        button.classList.add('btn-disabled');
        button.disabled = true;
        button.textContent = 'DOLU';
      }
      footer.append(statusWrap, button);
      card.append(vs, meta, footer);
      return card;
    }

    async function fetchLobby(initial = false) {
      if (currentRoomId) return;
      try {
        const res = await fetchAPI('/api/chess/lobby?t=' + Date.now());
        const list = document.getElementById('roomList');
        if (!list) return;
        list.replaceChildren();
        const rooms = Array.isArray(res?.rooms) ? res.rooms : [];
        showLobbyNotice('');

        if (!rooms.length) {
          list.replaceChildren(createLobbyEmpty('Rakip bekleyen açık masa yok. İlk hamleyi sen başlat; oda kur ve yeni rakibini lobide karşıla.'));
          return;
        }

        const filtered = rooms.filter(roomMatchesSearch);
        if (!filtered.length) {
          list.replaceChildren(createLobbyEmpty('Bu aramaya uygun masa bulunamadı. Aramayı temizleyip yeni bir oda kurarak rekabeti başlatabilirsin.'));
          return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((room) => fragment.appendChild(createRoomCard(room)));
        list.replaceChildren(fragment);
      } catch(error) {
        if (initial) {
          const list = document.getElementById('roomList');
          if (list) list.replaceChildren(createLobbyEmpty('Satranç lobisi şu anda yenilenemedi. Bağlantını kontrol edip tekrar dene.', 'pm-chess-empty-error'));
        }
        const now = Date.now();
        if (initial || now - lastChessLobbyNoticeAt > 30000) {
          lastChessLobbyNoticeAt = now;
          showLobbyNotice(translateError(error), 'warning', 'Tekrar Dene', () => fetchLobby(true).catch(() => null));
        }
        return;
      }
    }

    function updateRoomModeUI() {
      const modeEl = document.getElementById('chessRoomMode');
      const betField = document.querySelector('.chess-bet-field');
      const createBtn = document.querySelector('[data-pm-action="createRoom"]');
      const quickBtn = document.querySelector('[data-pm-action="joinRoom"]');
      const mode = String(modeEl?.value || 'free');
      if (betField) betField.hidden = mode !== 'bet';
      if (createBtn) createBtn.textContent = mode === 'bot' ? 'BOTLA OYNA' : 'ODA KUR';
      if (quickBtn) quickBtn.textContent = mode === 'bot' ? 'BOT OYUNU BAŞLAT' : 'HIZLI KATIL';
    }
    function wireRoomModeUI() {
      const modeEl = document.getElementById('chessRoomMode');
      if (!modeEl || modeEl.dataset.pmWired === '1') return;
      modeEl.dataset.pmWired = '1';
      modeEl.addEventListener('change', updateRoomModeUI);
      updateRoomModeUI();
    }

    function readRoomOptions() {
      const modeEl = document.getElementById('chessRoomMode');
      const betEl = document.getElementById('chessBetAmount');
      const mode = String(modeEl?.value || 'free');
      const bet = mode === 'bet' ? Math.max(1000, Math.min(1000000, Math.trunc(Number(betEl?.value || 1000) || 1000))) : 0;
      return { mode, bet };
    }

    window.createRoom = async () => {
      try {
        const opts = readRoomOptions();
        const res = await fetchAPI('/api/chess/create', 'POST', opts);
        try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {}
        await fetchBalance().catch(() => null);
        enterGame(res.room);
        if (res?.existing) showGameNotice('Zaten aktif bir Satranç odanız var. Seçtiğiniz yeni mod yerine mevcut odanıza yönlendirildiniz.', 'info');
      }
      catch(e) {
        const room = e?.payload?.room;
        if (room && (room.status === 'waiting' || room.status === 'playing')) return enterGame(room);
        showMatrixModal("Hata", translateError(e), "error");
      }
    };

    window.joinRoom = async (id) => {
      try {
        const opts = id ? { roomId: id } : readRoomOptions();
        const res = await fetchAPI('/api/chess/join', 'POST', opts);
        try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {}
        await fetchBalance().catch(() => null);
        enterGame(res.room);
        if (res?.existing) showGameNotice('Zaten aktif bir Satranç odanız var. Seçtiğiniz yeni mod yerine mevcut odanıza yönlendirildiniz.', 'info');
      }
      catch(e) {
        const room = e?.payload?.room;
        if (room && (room.status === 'waiting' || room.status === 'playing')) return enterGame(room);
        showMatrixModal("Hata", translateError(e), "error");
      }
    };

    function translateError(error = '') {
      const payload = error && typeof error === 'object' ? (error.payload || error.data || error.body || {}) : {};
      const raw = String(error?.rawCode || payload.error || payload.code || error?.error || error?.code || error?.message || error || '').toUpperCase();
      const status = Number(error?.status || error?.statusCode || payload.status || 0) || 0;
      const map = {
        ROOM_FULL: 'Oda dolu. Başka bir oda seçebilir veya yeni oda kurabilirsin.',
        ROOM_NOT_FOUND: 'Oda bulunamadı. Yeni oda kurabilir veya lobiyi yenileyebilirsin.',
        NOT_YOUR_TURN: 'Sıra sende değil.',
        ILLEGAL_MOVE: 'Bu hamle satranç kurallarına göre geçersiz.',
        INVALID_MOVE_FORMAT: 'Hamle formatı geçersiz. Taşını ve hedef kareyi tekrar seç.',
        INSUFFICIENT_BALANCE: 'Bakiyen bu masa için yeterli değil.',
        BET_MIN_1000_MC: 'Bahisli Satranç için minimum bahis 1.000 MC.',
        BET_MAX_1000000_MC: 'Bahisli Satranç için maksimum bahis 1.000.000 MC.',
        ALREADY_IN_ACTIVE_CHESS_ROOM: 'Zaten aktif bir Satranç odan var. Mevcut odana yönlendiriliyorsun.',
        DRAW_DISABLED_FOR_BOT: 'Bot oyununda beraberlik teklifi yoktur.',
        ROOM_CLOSED: 'Oda kapandı. Yeni oda kurabilirsin.',
        EXTENSION_REJECTED: 'Süre uzatma reddedildi. Oda sonucu işleniyor.',
        STATE_VERSION_MISMATCH:'Oyun verisi yenilendi. Lütfen hamleni tekrar seç.',
        AUTH_REQUIRED:'Devam etmek için giriş yapman gerekiyor.',
        AUTH_INVALID:'Oturumun yenilenemedi. Lütfen tekrar giriş yap.',
        DATE_OF_BIRTH_REQUIRED:'Devam etmek için Hesabım bölümünden doğum tarihini eklemen gerekiyor.',
        AGE_REQUIRED:'Devam etmek için Hesabım bölümünden doğum tarihini eklemen gerekiyor.',
        AGE_RESTRICTED:'Bu oyun yalnızca 16 yaş ve üzeri kullanıcılar içindir.',
        ACCOUNT_LOCKED:'Hesabın geçici olarak kilitli. Destek ekibiyle iletişime geç.',
        SOCKET_TIMEOUT:'Bağlantı gecikti. Hamle tekrar deneniyor.',
        SOCKET_OFFLINE:'Canlı bağlantı yenileniyor. Lütfen birkaç saniye bekle.',
        BOT_ROOM_NOT_JOINABLE:'Bot odasına başka oyuncu katılamaz.',
        ROOM_NOT_PLAYING:'Oda aktif oyun durumunda değil.',
        NOT_IN_ROOM:'Bu odada oyuncu değilsin.',
        GAME_MAINTENANCE:'Satranç şu anda bakımda. Lütfen daha sonra tekrar dene.',
        EMAIL_VERIFICATION_REQUIRED:'Ödüllü işlemler için e-posta adresini doğrulaman gerekiyor.',
        DAILY_LIMIT_REACHED:'Bugünkü ücretsiz oyun hakkını kullandın. Yarın tekrar oynayabilirsin.'
      };
      for (const [key, message] of Object.entries(map)) if (raw.includes(key)) return message;
      if (status === 401) return 'Devam etmek için giriş yapman gerekiyor.';
      if (status === 403) return 'Bu işlem için hesabın uygun değil. Hesap bilgilerini kontrol et.';
      if (status === 404) return 'Oda bulunamadı. Yeni oda kurabilir veya lobiyi yenileyebilirsin.';
      if (status === 409) return 'Oda durumu değişti. Lütfen lobiyi yenileyip tekrar dene.';
      if (/TIMEOUT|NETWORK|LOAD FAILED|FAILED TO FETCH/i.test(raw)) return 'Bağlantı yenileniyor. Lütfen birkaç saniye sonra tekrar dene.';
      return chessUserMessage(raw, 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.');
    }

    async function ensureChessSocket() {
      try {
        if (chessSocket && chessSocket.connected) return chessSocket;
        chessSocket = await core.createAuthedSocket(chessSocket, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 6, timeout: 6000 });
        if (socketListenersWired) return chessSocket;
        socketListenersWired = true;
        chessSocket.on('connect', () => {
          try { chessSocket.emit('chess:lobby:subscribe'); } catch (_) {}
          try { chessSocket.emit('chess:subscribe-user', null, () => {}); } catch (_) {}
          try { if (currentRoomId) chessSocket.emit('chess:join', currentRoomId, () => {}); } catch (_) {}
        });
        chessSocket.on('chess:lobby', () => { if (!currentRoomId) fetchLobby(false).catch(() => null); });
        chessSocket.on('chess:room', (room) => { if (room?.id && room.id === currentRoomId) { syncBoardUI(room); showGameNotice(''); } });
        return chessSocket;
      } catch (_) { return null; }
    }
    function socketAck(event, payload, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        if (!chessSocket || !chessSocket.connected) return reject(new Error('SOCKET_OFFLINE'));
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('SOCKET_TIMEOUT')); } }, timeoutMs);
        try {
          chessSocket.emit(event, payload, (response) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (!response?.ok) reject(new Error(response?.error || 'SOCKET_REJECTED'));
            else resolve(response);
          });
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    }
    async function sendChessMove(payload) {
      await ensureChessSocket().catch(() => null);
      if (chessSocket?.connected) return socketAck('chess:move', payload, 4500).catch(() => fetchAPI('/api/chess/move', 'POST', payload));
      return fetchAPI('/api/chess/move', 'POST', payload);
    }
    async function sendExtensionDecision(accept) {
      const payload = { roomId: currentRoomId, accept: !!accept };
      await ensureChessSocket().catch(() => null);
      if (chessSocket?.connected) return socketAck('chess:extend', payload, 4500).catch(() => fetchAPI('/api/chess/extend', 'POST', payload));
      return fetchAPI('/api/chess/extend', 'POST', payload);
    }

    function stopGamePing() {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    }

    function startGamePing() {
      stopGamePing();
      pingInterval = setInterval(async () => {
        if (!currentRoomId) return;
        try {
          const res = await fetchAPI('/api/chess/ping', 'POST', { roomId: currentRoomId });
          if (res && res.room && res.room.status === 'abandoned') {
            clearInterval(pollingInterval);
            stopGamePing();
            showMatrixModal("OYUN İPTAL", res.room.message, "error", true);
          }
        } catch(e) {}
      }, 15000);
    }

    function enterGame(roomData) {
      clearInterval(pollingInterval);
      currentRoomId = roomData.id;
      isProcessingMove = false;
      localStorage.setItem('activeChessRoom', String(roomData.id || ''));
      clearPendingAutoJoin('chess', roomData.id);
      ensureChessSocket().then((sock) => { try { sock?.emit?.('chess:join', roomData.id); } catch (_) {} }).catch(() => null);
      document.getElementById("lobbyArea").style.display = "none";
      document.getElementById("gameArea").style.display = "flex";
      showLobbyNotice('');
      showGameNotice('Oyun verisi hazırlanıyor...', 'warning');

      const roomPlayers = getRoomPlayers(roomData);
      const mePlayer = roomPlayers.players.find(p => p.isMe || p.uid === userUid) || roomPlayers.host;
      myColor = mePlayer.color === 'b' ? 'b' : 'w';

      document.getElementById("myColorBox").style.background = myColor === 'w' ? '#fff' : '#000';
      document.getElementById("oppColorBox").style.background = myColor === 'w' ? '#000' : '#fff';

      playSfx('start');
      syncBoardUI(roomData);
      showGameNotice('');
      pollingInterval = setInterval(() => { if (!chessSocket?.connected) pollGameState(); }, 9000);
      startGamePing();
    }

    async function pollGameState() {
      if (!currentRoomId || isProcessingMove) return;
      try {
        const res = await fetchAPI(`/api/chess/state/${currentRoomId}?t=${Date.now()}`);
        if(res.room.status === 'abandoned') {
          clearInterval(pollingInterval);
          stopGamePing();
          showMatrixModal("OYUN İPTAL", "Rakip odadan ayrıldı.", "error", true);
          return;
        }
        syncBoardUI(res.room);
        showGameNotice('');
      } catch(e) {
        if (e.message === "Oda bulunamadı.") {
          clearInterval(pollingInterval);
          stopGamePing();
          showMatrixModal("BİLGİ", "Oda kapandı veya oyun sona erdi.", "info", true);
        } else {
          showGameNotice('Oyun durumu güncellenemedi. Tekrar deneniyor.', 'warning', 'Lobiye Dön', () => { try { localStorage.removeItem('activeChessRoom'); } catch (_) {} window.location.reload(); });
        }
      }
    }


    const INLINE_DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
    const DEFAULT_AVATAR = window.PMAvatar?.FALLBACK_AVATAR || INLINE_DEFAULT_AVATAR;

    function resolveFrameIndex(rawLevel) {
      if (window.PMAvatar && typeof window.PMAvatar.getFrameAssetIndex === 'function') {
        return window.PMAvatar.getFrameAssetIndex(rawLevel);
      }
      const lvl = Math.max(0, Math.min(100, Math.floor(Number(rawLevel) || 0)));
      if (lvl <= 0) return 0;
      return lvl;
    }

    function applyFramedAvatar(avatarId, frameId, avatarUrl, selectedFrameLevel, explicitFrameUrl = '') {
      const host = document.getElementById(`${avatarId}Host`) || document.getElementById(avatarId)?.parentElement;
      if (!host) return;
      const safeAvatar = avatarUrl || DEFAULT_AVATAR;
      const frameLevel = Math.max(0, Math.min(100, Math.trunc(Number(selectedFrameLevel || 0) || 0)));
      const explicitIndexMatch = String(explicitFrameUrl || '').match(/frame-(\d+)\.png/i);
      const explicitIndexRaw = explicitIndexMatch ? Math.trunc(Number(explicitIndexMatch[1]) || 0) : 0;
      const exactFrameIndex = explicitIndexRaw > 0
        ? (explicitIndexRaw <= 100 ? explicitIndexRaw : resolveFrameIndex(explicitIndexRaw))
        : null;
      const resolvedFrameIndex = exactFrameIndex || resolveFrameIndex(frameLevel);
      const signature = JSON.stringify({ avatar: safeAvatar, frameLevel, frame: resolvedFrameIndex });
      if (avatarRenderCache.get(avatarId) === signature && host.childElementCount) return;
      avatarRenderCache.set(avatarId, signature);
      if (window.PMAvatar && typeof window.PMAvatar.createNode === 'function') {
        try {
          const node = window.PMAvatar.createNode({
            avatarUrl: safeAvatar,
            level: frameLevel,
            exactFrameIndex,
            sizePx: 64,
            extraClass: 'pm-game-avatar-shell',
            imageClass: 'p-avatar',
            wrapperClass: 'pm-avatar',
            variant: avatarId === 'playerAvatar' || avatarId === 'opponentAvatar' ? 'chessGameCard' : 'chessTopbar',
            sizeTag: avatarId === 'playerAvatar' || avatarId === 'opponentAvatar' ? 'chessGameCard' : 'chessTopbar',
            alt: 'Oyuncu avatarı'
          });
          host.replaceChildren(node);
          return;
        } catch (_) {}
      }
      const wrap = document.createElement('div');
      wrap.className = 'pm-avatar pm-game-avatar-shell';
      const img = document.createElement('img');
      img.className = 'p-avatar';
      img.alt = 'Oyuncu avatarı';
      img.src = safeAvatar;
      wrap.appendChild(img);
      if (resolvedFrameIndex > 0) {
        const frame = document.createElement('img');
        frame.className = `pm-frame-image pm-avatar-shell__frame pm-game-frame frame-${resolvedFrameIndex}`;
        frame.alt = '';
        frame.setAttribute('aria-hidden', 'true');
        frame.src = exactFrameIndex && explicitFrameUrl ? explicitFrameUrl : `/public/assets/frames/frame-${resolvedFrameIndex}.png`;
        wrap.appendChild(frame);
      }
      host.replaceChildren(wrap);
    }

    function maybeShowExtensionPrompt(r) {
      const prompt = r?.extensionPrompt;
      if (!prompt?.active || prompt.myResponse) return;
      const key = `${r.id}:${prompt.promptAt || 0}`;
      if (extensionPromptKey === key) return;
      extensionPromptKey = key;
      showConfirmModal('Süre Uzatma', prompt.message || '60 dakika doldu. Oyuna devam edilsin mi?', async () => {
        const res = await sendExtensionDecision(true);
        if (res?.room) syncBoardUI(res.room);
      }, async () => {
        const res = await sendExtensionDecision(false);
        if (res?.room) syncBoardUI(res.room);
        else resetToLobby();
      }, { yesText: 'DEVAM ET', noText: 'BİTİR' });
    }
    function syncBoardUI(r) {
      if (!r) return;
      currentRoomState = r;
      if (r.status === 'playing') showGameNotice('');
      const { players, host, guest } = getRoomPlayers(r);
      const me = players.find(p => p.isMe || p.uid === userUid) || (myColor === 'w' ? host : guest);
      const opp = players.find(p => p.color && p.color !== myColor) || (myColor === 'w' ? guest : host);

      const myNameEl = document.getElementById("myName");
      const oppNameEl = document.getElementById("oppName");
      if (myNameEl && myNameEl.textContent !== (me.username || me.name || 'Sen')) myNameEl.textContent = me.username || me.name || 'Sen';
      applyFramedAvatar("myAvatar", "myAvatarFrame", me.avatar, me.selectedFrame, me.frameUrl);
      const myPlate = document.getElementById("myPlate");
      if (myPlate) myPlate.className = (r.turn === myColor && r.status === 'playing') ? "player-plate active" : "player-plate";

      if (oppNameEl && oppNameEl.textContent !== (opp.username || opp.name || 'Bekleniyor...')) oppNameEl.textContent = opp.username || opp.name || 'Bekleniyor...';
      applyFramedAvatar("oppAvatar", "oppAvatarFrame", opp.avatar, opp.selectedFrame, opp.frameUrl);
      const oppPlate = document.getElementById("oppPlate");
      if (oppPlate) oppPlate.className = (r.turn !== myColor && r.status === 'playing') ? "player-plate active" : "player-plate";

      const drawBtn = document.getElementById('drawBtn');
      if (drawBtn) {
        const moveCount = Array.isArray(r.moves) ? r.moves.length : 0;
        const drawMinMoves = Math.max(20, Number(r.drawMinMoves || MIN_DRAW_OFFER_MOVES) || MIN_DRAW_OFFER_MOVES);
        const drawAvailable = moveCount >= drawMinMoves;
        const hideDraw = r.mode === 'bot' || r.status !== 'playing' || !drawAvailable;
        drawBtn.hidden = hideDraw;
        drawBtn.style.display = hideDraw ? 'none' : '';
        drawBtn.disabled = hideDraw;
        drawBtn.title = drawAvailable ? '' : `Beraberlik teklifi ${drawMinMoves}. hamleden sonra açılır.`;
        drawBtn.textContent = drawAvailable ? (r.drawOfferBy === 'opponent' ? 'BERABERLİĞİ KABUL ET' : r.drawOfferBy === 'me' ? 'TEKLİF GÖNDERİLDİ' : 'BERABERLİK TEKLİF ET') : `BERABERLİK ${Math.max(0, drawMinMoves - moveCount)} HAMLE SONRA`;
      }
      maybeShowExtensionPrompt(r);
      if (r.lifecycle?.notice === 'extension-accepted') showGameNotice('Oda süresi iki oyuncu onayıyla 30 dakika uzatıldı.', 'info');
      if (r.lifecycle?.notice === 'extension-pending' && r.extensionPrompt?.active) showGameNotice('60 dakika doldu. Devam kararı bekleniyor.', 'warning');

      const statusTxt = document.getElementById("gameStatusTxt");
      if (!statusTxt) return;
      if (r.status === 'waiting') {
        statusTxt.innerText = "RAKİP BEKLENİYOR...";
        statusTxt.style.color = "rgba(148,163,184,.95)";
      } else if (r.status === 'playing') {
        const myTurn = r.turn === myColor;
        const checkText = r.check ? ' • ŞAH' : '';
        const drawText = r.drawOfferBy === 'opponent' ? ' • BERABERLİK TEKLİFİ VAR' : r.drawOfferBy === 'me' ? ' • BERABERLİK TEKLİFİ GÖNDERİLDİ' : '';
        const botThinking = r.mode === 'bot' && !myTurn && Number(r.botThinkingUntil || 0) > Date.now();
        statusTxt.innerText = botThinking ? 'PLAYMATRIX DÜŞÜNÜYOR...' : (myTurn ? "SIRA SENDE" : "SIRA RAKİPTE") + checkText + drawText;
        statusTxt.style.color = myTurn ? "#00ffa3" : "#f1c40f";
      } else if (r.status === 'finished') {
        clearInterval(pollingInterval);
        stopGamePing();
        statusTxt.innerText = "OYUN BİTTİ";
        statusTxt.style.color = "#ff3b30";
        try { if (r.resultSummary?.progression) applyProgressionFromPayload({ progression: r.resultSummary.progression }); } catch (_) {}
        if (r.resultSummary) {
          if (r.resultSummary.outcome === 'win') playSfx('win');
          else if (r.resultSummary.outcome === 'loss') playSfx('end');
          showGameResultSummary(r.resultSummary, 'Satranç Sonucu', 'Oyun sonucu işlendi.', 'info');
          fetchBalance().catch(() => null);
        } else {
          const draw = r.winner === 'draw' || r.winnerColor === 'draw';
          const iWon = r.winnerColor === myColor;
          if (draw) showGameResultSummary({ gameType: 'chess', resultCode: 'draw', settledAt: Date.now(), outcome: 'draw', title: 'BERABERE', message: 'Oyun berabere bitti.' }, 'BERABERE', 'Oyun berabere bitti.', 'info');
          else if (iWon) { playSfx('win'); showGameResultSummary({ gameType: 'chess', resultCode: 'win', settledAt: Date.now(), outcome: 'win', title: 'KAZANDIN!', message: 'Galibiyet ve ödül işlemleri işlendi.' }, 'KAZANDIN!', 'Galibiyet ve ödül işlemleri işlendi.', 'success'); }
          else { playSfx('end'); showGameResultSummary({ gameType: 'chess', resultCode: 'loss', settledAt: Date.now(), outcome: 'loss', title: 'KAYBETTİN', message: 'Rakip kazandı veya sen teslim oldun.' }, 'KAYBETTİN', 'Rakip kazandı veya sen teslim oldun.', 'error'); }
        }
        try { localStorage.removeItem('activeChessRoom'); } catch (_) {}
        return;
      }

      const boardNeedsRender = !document.getElementById('chessboard') || document.getElementById('chessboard').children.length !== 64;
      if (r.fen && (r.fen !== lastFen || r.status !== lastStatus || boardNeedsRender)) {
        const ok = gameLogic.load(r.fen);
        if (!ok) console.warn('[PlayMatrix:Chess] invalid FEN', r.fen);
        drawBoard();
        const moveCount = Array.isArray(r.moves) ? r.moves.length : 0;
        if (moveCount > lastMoveCount || (lastFen !== "" && r.fen !== lastFen)) {
          const lastMove = Array.isArray(r.moves) ? r.moves[r.moves.length - 1] : null;
          if (gameLogic.in_check && gameLogic.in_check()) playSfx('check');
          else if (lastMove?.flags === 'capture') playSfx('capture');
          else playSfx('move');
        }
        lastMoveCount = moveCount;
        lastFen = r.fen;
        lastStatus = r.status;
      }
    }

    function ensureBoardShell(boardEl) {
      if (!boardEl) return [];
      if (!boardClickBound) {
        boardEl.addEventListener('click', (event) => {
          const square = event.target?.closest?.('.sq[data-sq]');
          if (square && boardEl.contains(square)) handleSquareClick(square.dataset.sq);
        });
        boardClickBound = true;
      }
      const needsRebuild = boardLayoutColor !== myColor || boardEl.children.length !== 64;
      if (!needsRebuild) return Array.from(boardEl.children);
      boardEl.replaceChildren();
      boardLayoutColor = myColor;
      const fragment = document.createDocumentFragment();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sqDiv = document.createElement('div');
          const rank = myColor === 'w' ? 8 - r : r + 1;
          const fileStr = 'abcdefgh';
          const file = myColor === 'w' ? fileStr[c] : fileStr[7 - c];
          sqDiv.dataset.sq = file + rank;
          fragment.appendChild(sqDiv);
        }
      }
      boardEl.appendChild(fragment);
      return Array.from(boardEl.children);
    }

    function drawBoard() {
      const boardEl = document.getElementById("chessboard");
      if (!boardEl) return;
      let board = gameLogic.board();
      if (myColor === 'b') {
        board = board.slice().reverse();
        board = board.map(row => row.slice().reverse());
      }
      const squares = ensureBoardShell(boardEl);
      const lastMove = Array.isArray(currentRoomState?.moves) ? currentRoomState.moves[currentRoomState.moves.length - 1] : null;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sqDiv = squares[(r * 8) + c];
          if (!sqDiv) continue;
          const sqName = sqDiv.dataset.sq;
          sqDiv.className = `sq ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
          if (selectedSq === sqName) sqDiv.classList.add('highlight');
          if (lastMove && (lastMove.from === sqName || lastMove.to === sqName)) sqDiv.classList.add('last-move');
          const isMoveObj = validMovesForSelected.find(m => m.to === sqName);
          if (isMoveObj) {
            if (board[r][c] !== null) sqDiv.classList.add('valid-capture');
            else sqDiv.classList.add('valid-move');
          }
          const piece = board[r][c];
          const char = piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()) : '';
          if (sqDiv.dataset.piece === char && sqDiv.childElementCount <= (char ? 1 : 0)) continue;
          sqDiv.dataset.piece = char;
          sqDiv.replaceChildren();
          if (char) {
            const img = document.createElement("img");
            img.src = PIECE_IMGS[char];
            img.alt = PIECE_UNICODE[char] || char;
            img.className = "piece";
            sqDiv.appendChild(img);
          }
        }
      }
    }

    async function handleSquareClick(sq) {
      if (isProcessingMove || currentRoomState?.status !== 'playing' || gameLogic.turn() !== myColor) return;

      const moveObj = validMovesForSelected.find(m => m.to === sq);
      if (selectedSq && moveObj) {
        isProcessingMove = true;
        const status = document.getElementById("gameStatusTxt");
        if (status) status.innerText = "HAMLE İLETİLİYOR...";
        const payload = { roomId: currentRoomId, from: moveObj.from, to: moveObj.to, promotion: 'q', expectedStateVersion: currentRoomState?.stateVersion || 0, clientMoveId: `${currentRoomId}:${currentRoomState?.stateVersion || 0}:${moveObj.from}-${moveObj.to}` };
        selectedSq = null;
        validMovesForSelected = [];
        drawBoard();
        try {
          const res = await sendChessMove(payload);
          try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {}
          if (res?.room) syncBoardUI(res.room);
        } catch(e) {
          if (String(e.message || '').toUpperCase() === 'STATE_VERSION_MISMATCH') {
            showGameNotice('Hamle senkronu yenilendi. Lütfen hamleni tekrar seç.', 'warning');
            await pollGameState().catch(() => null);
          } else {
            showMatrixModal("Hata", translateError(e), "error");
            playSfx('error');
          }
          if (lastFen) gameLogic.load(lastFen);
          drawBoard();
        } finally {
          isProcessingMove = false;
        }
        return;
      }

      const pieceObj = gameLogic.get(sq);
      if (pieceObj && pieceObj.color === myColor) {
        selectedSq = sq;
        validMovesForSelected = gameLogic.moves({ square: sq, verbose: true });
        drawBoard();
      } else {
        selectedSq = null;
        validMovesForSelected = [];
        drawBoard();
      }
    }

    window.resignGame = () => {
      if (!currentRoomId) return;
      showConfirmModal("Teslim Ol", "Teslim olmak istediğine emin misin? Bahisli oyunda rakibe galibiyet işlenir.", async () => {
        try {
          const res = await fetchAPI('/api/chess/resign', 'POST', { roomId: currentRoomId });
          try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {}
          if (res?.room) syncBoardUI(res.room);
          await fetchBalance().catch(() => null);
        } catch(e) { showMatrixModal('Hata', translateError(e.message), 'error'); }
      });
    };

    window.offerDraw = async () => {
      if (!currentRoomId) return;
      if (currentRoomState?.mode === 'bot') { showGameNotice('Bot oyununda beraberlik teklifi yoktur.', 'warning'); return; }
      const moveCount = Array.isArray(currentRoomState?.moves) ? currentRoomState.moves.length : 0;
      const drawMinMoves = Math.max(20, Number(currentRoomState?.drawMinMoves || MIN_DRAW_OFFER_MOVES) || MIN_DRAW_OFFER_MOVES);
      if (moveCount < drawMinMoves) { showGameNotice(`Beraberlik teklifi için en az ${drawMinMoves} hamle gerekir.`, 'warning'); return; }
      try {
        const res = await fetchAPI('/api/chess/draw', 'POST', { roomId: currentRoomId });
        if (res?.room) syncBoardUI(res.room);
        if (res?.offered) showGameNotice('Beraberlik teklifi rakibe gönderildi.', 'info');
      } catch(e) { showMatrixModal('Hata', translateError(e.message), 'error'); }
    };

    window.addEventListener('beforeunload', () => {
    });

    document.getElementById('matrixModalCloseBtn')?.addEventListener('click', closeMatrixModal);
    document.getElementById('chessExitBtn')?.addEventListener('click', handleChessExit);
    document.querySelector('#confirmModal .btn-no')?.addEventListener('click', closeConfirmModal);

    onAuthStateChanged(user => {
      if (!user) {
        bootCompleted = false;
        setBootProgress(10);
        setBootStatus('Oturum doğrulanıyor...');
        setBootActions({ showEnter: false, showRetry: false });
        return;
      }
      if (!bootCompleted && !bootPromise) bootChessApp(false).catch(() => null);
    });

    window.addEventListener('load', () => {
      setBootProgress(4);
      setBootStatus('Kaynaklar hazırlanıyor...');
      setBootActions({ showEnter: false, showRetry: false });
      setTimeout(() => { if (!bootCompleted && !bootPromise) bootChessApp(false).catch(() => null); }, 120);
    });
