import { initPlayMatrixOnlineCore } from "../public/pm-online-core.js";

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

function renderRuntimeNotice(target, message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
  if (!target) return;
  const text = String(message || '').trim();
  if (!text) {
    target.className = 'runtime-notice';
    target.replaceChildren();
    return;
  }
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
    btn.textContent = actionLabel;
    btn.addEventListener('click', actionHandler);
    target.appendChild(btn);
  }
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


function setDisplay(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.display = value;
}

function setModalActive(id, active = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('active', !!active);
  el.setAttribute('aria-hidden', active ? 'false' : 'true');
}

function openRules() { setModalActive('rulesModal', true); }
function closeRules() { setModalActive('rulesModal', false); }
function openCreateModal() { setModalActive('createModal', true); }
function closeCreateModal() { setModalActive('createModal', false); }
function closeExitConfirm() { setModalActive('exitConfirmModal', false); }
function promptExitGame() { setModalActive('exitConfirmModal', true); }
function closeJoinPrivateModal() { setModalActive('joinPrivateModal', false); }
function promptJoinRoom(id, isPrivate = false) {
  const roomId = String(id || '').trim();
  if (!roomId) return;
  if (isPrivate) {
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
function showPlainMatrixModal(title, message, tone = 'info', autoLobby = false) {
  const titleEl = document.getElementById('matrixModalTitle');
  const descEl = document.getElementById('matrixModalDesc');
  const modal = document.getElementById('matrixModal');
  if (titleEl) titleEl.textContent = String(title || 'Bilgi');
  if (descEl) {
    descEl.replaceChildren();
    String(message || '').split(/<br\s*\/?\s*>/i).forEach((part, index) => {
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
  promptJoinRoom
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
    const user = await waitForAuthReady(15000);
    userUid = user.uid;
    setBootProgress(28);
    setBootStatus('Profil hazırlanıyor...');
    await withTimeout(fetchProfile(), 7000, 'PROFILE_TIMEOUT').catch((error) => {
      showLobbyNotice('Profil verisi şu an tam alınamadı. Lobi temel modda açılacak.', 'warning', 'Tekrar Dene', () => fetchProfile().catch(() => null));
      return null;
    });
    if (typeof ensureRealtimeShell === 'function') ensureRealtimeShell();
    setBootProgress(50);
    setBootStatus('Gerçek zamanlı bağlantı kuruluyor...');
    const socketReady = await ensureGameplaySocket(false);
    setBootProgress(socketReady ? 70 : 62);
    setBootStatus(socketReady ? 'Lobi verileri senkronize ediliyor...' : 'Bağlantı sınırlı modda açılıyor. Oyun sırasında tekrar denenecek.', socketReady ? 'info' : 'warning');
    if (typeof hydrateFriendCounts === 'function') {
      await withTimeout(Promise.resolve(hydrateFriendCounts(true)).catch(() => null), 4000, 'FRIEND_COUNTS_TIMEOUT').catch(() => null);
    }
    const preferredRoom = (typeof getPendingAutoJoinRoom === 'function' ? getPendingAutoJoinRoom('pisti') : '') || String(localStorage.getItem('activePistiRoom') || '').trim();
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
    if (code === 'AUTH_TIMEOUT' || code === 'NO_USER') {
      setBootProgress(18);
      setBootStatus('Oturum doğrulanamadı. Önce giriş yapıp tekrar deneyin.', 'error');
      setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ANASAYFAYA DÖN', actionMode: 'home' });
    } else {
      setBootProgress(35);
      setBootStatus('Bağlantı kurulamadı. Tekrar deneyebilirsiniz.', 'error');
      setBootActions({ showEnter: false, showRetry: true });
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
  return core.requestWithAuth(endpoint, { method, body, timeoutMs: 8000, retries: attempt === 0 ? 1 : 0 });
}

async function initSocket() {
    if (socket?.connected) return socket;
    socket = await core.createAuthedSocket(socket, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 6, timeout: 6000 });

    socket.on('connect', () => { showLobbyNotice('Canlı bağlantı kuruldu. Lobi eşitlemesi sürüyor.', 'warning'); setTimeout(() => showLobbyNotice(''), 1800); showGameNotice(''); });
    socket.on('connect_error', () => { showLobbyNotice('Gerçek zamanlı bağlantı kurulamadı. Lobi sınırlı modda açık kalacak.', 'warning', 'Tekrar Dene', () => ensureGameplaySocket(false).catch(() => null)); showGameNotice('Canlı bağlantı kurulamadı. Oyuna girmeden önce tekrar deneyin.', 'error', 'Tekrar Dene', () => ensureGameplaySocket(true).catch(() => null)); });
    socket.on('disconnect', () => { socketAvailableForGame = false; showLobbyNotice('Bağlantı geçici olarak koptu. Oyun başlatılırken yeniden denenecek.', 'warning', 'Tekrar Dene', () => ensureGameplaySocket(false).catch(() => null)); if (currentRoomId) showGameNotice('Bağlantı koptu. Senkron yeniden kurulana kadar bekleyin.', 'warning'); });

    socket.on('pisti:update', async (payload) => {
        if(payload && payload.id === currentRoomId) {
            if (payload.sender === userUid) return;
            setTimeout(async () => {
                try {
                    const res = await fetchAPI(`/api/pisti-online/state/${currentRoomId}`);
                    if (res && res.room) syncUI(res.room);
                } catch (e) {}
            }, Math.random() * 150);
        }
    });

    socket.on('chat:direct_receive', (payload) => {
        showRealtimeToast(payload?.username || 'Yeni özel mesaj', payload?.message || 'Bir özel mesaj aldın.', 'info', { iconClass: 'fa-envelope' });
    });
    socket.on('friends:updated', () => { hydrateFriendCounts(false).catch(() => null); });
    socket.on('friends:request_received', () => {
        showRealtimeToast('Arkadaşlık isteği', 'Yeni bir arkadaşlık isteği geldi.', 'info', { iconClass: 'fa-user-plus' });
        hydrateFriendCounts(false).catch(() => null);
    });
    socket.on('friends:request_result', (payload) => {
        showRealtimeToast('Arkadaşlık güncellendi', payload?.accepted ? 'Gönderdiğin istek kabul edildi.' : 'Gönderdiğin istek reddedildi.', payload?.accepted ? 'success' : 'info', { iconClass: payload?.accepted ? 'fa-user-check' : 'fa-user-xmark' });
        hydrateFriendCounts(false).catch(() => null);
    });
    socket.on('friends:request_auto_accepted', () => {
        showRealtimeToast('Arkadaş eklendi', 'Karşılıklı istek bulundu ve arkadaşlık anında kuruldu.', 'success', { iconClass: 'fa-user-group' });
        hydrateFriendCounts(false).catch(() => null);
    });
    socket.on('game:invite_receive', (payload) => {
        showRealtimeToast('Oyun daveti', `${payload?.hostName || 'Arkadaşın'} seni ${payload?.gameName || 'oyuna'} çağırıyor.`, 'info', { iconClass: 'fa-gamepad', duration: 4200 });
        showRealtimeInviteModal(payload);
    });
    socket.on('game:invite_error', (payload) => {
        showRealtimeToast('Davet hatası', payload?.message || 'Davet işlenemedi.', 'error');
    });
    socket.on('game:invite_success', (payload) => {
        handleHostInviteAcceptedRedirect(payload).catch(() => null);
    });
    socket.on('game:invite_response', (payload) => {
        const accepted = payload?.response === 'accepted';
        const guestName = payload?.guestName || 'Arkadaşın';
        showRealtimeToast(accepted ? 'Davet kabul edildi' : 'Davet reddedildi', accepted ? `${guestName} daveti kabul etti.` : `${guestName} daveti şu an kabul etmedi.`, accepted ? 'success' : 'info', { iconClass: accepted ? 'fa-circle-check' : 'fa-circle-minus' });
        if (accepted) handleHostInviteAcceptedRedirect(payload).catch(() => null);
    });

    const setMyPresence = () => {
        socket.emit('social:set_presence', { status: 'IN_GAME', activity: 'Pişti Oynuyor', gameType: 'pisti' });
    };

    if (socket.connected) setMyPresence();
    socket.on('connect', setMyPresence);

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
    localStorage.removeItem('activePistiRoom');
    return false;
}

async function initApp(){ 
    userUid=auth.currentUser.uid; 
    fetchProfile(); 
    ensureRealtimeShell();
    await initSocket(); 
    hydrateFriendCounts(true).catch(() => null);
    
    const preferredRoom = getPendingAutoJoinRoom('pisti') || String(localStorage.getItem('activePistiRoom') || '').trim();
    if (preferredRoom && await restorePistiSession(preferredRoom, true)) return;
    
    startLobby(); 
}

async function fetchProfile(){ 
    const res = await fetchAPI('/api/me'); 
    if(!(res && res.ok)) throw new Error('PROFILE_LOAD_FAILED');

    const balanceEl = document.getElementById("uiBalance");
    if (balanceEl) balanceEl.innerText = Math.floor(Number(res.balance) || 0).toLocaleString('tr-TR');

    const profile = (res && typeof res.user === 'object' && res.user) ? res.user : {};
    const accountLevel = Math.max(1, Number(profile.accountLevel) || 1);
    const accountProgress = Math.max(0, Math.min(100, Number(profile?.progression?.accountLevelProgressPct) || 0));

    const levelBarEl = document.getElementById('uiAccountLevelBar');
    const levelPctEl = document.getElementById('uiAccountLevelPct');
    const levelBadgeEl = document.getElementById('uiAccountLevelBadge');

    if (levelBarEl) levelBarEl.style.width = accountProgress + '%';
    if (levelPctEl) levelPctEl.innerText = accountProgress.toFixed(1) + '%';
    if (levelBadgeEl) levelBadgeEl.innerText = accountLevel;
    return { balance: Number(res.balance) || 0, accountLevel, accountProgress };
}

function stopGameSyncPolling(){
  clearInterval(gameSyncInterval);
  gameSyncInterval = null;
}

function startGameSyncPolling(){
  stopGameSyncPolling();
  gameSyncInterval = setInterval(async () => {
    if (!currentRoomId || document.hidden) return;
    try {
      const res = await fetchAPI(`/api/pisti-online/state/${currentRoomId}`);
      if (res && res.room) syncUI(res.room);
      showGameNotice(socketAvailableForGame ? '' : 'Canlı bağlantı arka planda tekrar deneniyor. Oyun durumu HTTP ile güncelleniyor.', 'warning', 'Tekrar Dene', () => ensureGameplaySocket(false).catch(() => null));
    } catch (error) {
      showGameNotice('Oyun durumu alınamadı. Yeniden deneniyor.', 'warning', 'Lobiye Dön', () => resetToLobby());
    }
  }, socketAvailableForGame ? 4000 : 2200);
}

function resetToLobby(){ 
  if(socket && currentRoomId) socket.emit('pisti:leave', currentRoomId);
  clearInterval(lobbyInterval); clearInterval(pingInterval); stopGameSyncPolling(); 
  currentRoomId=null; lastSyncHash=''; lastEventTs=0; isAnimatingCapture=false;
  localStorage.removeItem('activePistiRoom');
  showGameNotice('');
  
  document.getElementById("gameArea").style.display="none"; 
  document.getElementById("lobbyArea").style.display="flex"; 
  
  fetchProfile(); startLobby(); 
}

function startLobby(){ clearInterval(lobbyInterval); fetchLobby(true).catch(() => null); lobbyInterval = setInterval(() => { fetchLobby(false).catch(() => null); }, 3500); }

async function fetchLobby(initial = false){
  if(currentRoomId || document.hidden) return;
  try {
    const res = await fetchAPI('/api/pisti-online/lobby');
    fetchedRooms = Array.isArray(res?.rooms) ? res.rooms : [];
    showLobbyNotice('');
    renderRoomListLocally();
  } catch(error) {
    if (initial || !fetchedRooms.length) {
      const list = document.getElementById('roomList');
      if (list) list.innerHTML = `<div class="pm-pisti-empty">Lobi verisi alınamadı.</div>`;
    }
    showLobbyNotice('Lobi verileri yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.', 'error', 'Tekrar Dene', () => fetchLobby(true).catch(() => null));
    throw error;
  }
}

window.renderRoomListLocally = () => {
  const query = document.getElementById("lobbySearch").value.trim().toLowerCase();
  const list = document.getElementById("roomList");
  let filtered = fetchedRooms;
  if (query) { filtered = fetchedRooms.filter(r => r.roomName.toLowerCase().includes(query) || r.hostName.toLowerCase().includes(query)); }
  
  if(filtered.length===0){ list.innerHTML=`<div class="pm-pisti-empty">Masa bulunamadı.</div>`; return; }
  let html = '';
  filtered.forEach(r => {
    const isFull = r.currentPlayers >= r.maxPlayers || r.status === 'playing';
    const lockIcon = r.isPrivate ? '<i class="fa-solid fa-lock pm-pisti-lock-icon"></i>' : '';
    let btn = isFull ? `<button class="btn-join btn-disabled">DOLU</button>` : `<button class="btn-join" data-room-id="${escapeHTML(r.id)}" data-room-private="${r.isPrivate ? 'true' : 'false'}">KATIL</button>`;
    html += `
    <div class="room-card">
        <div class="room-card-top">
            <span class="room-host">${lockIcon}${escapeHTML(r.roomName)}</span>
            <span class="room-mode">${escapeHTML(r.mode)}</span>
        </div>
        <div class="room-footer">
            <div class="room-info-text">
                <span>Bahis: <strong><span class="pm-pisti-bet-value">${Number(r.bet).toLocaleString('tr-TR')}</span> MC</strong></span>
                <span>Kapasite: <strong>${escapeHTML(r.currentPlayers)} / ${escapeHTML(r.maxPlayers)}</strong> (Kurucu: ${escapeHTML(r.hostName)})</span>
            </div>
            ${btn}
        </div>
    </div>`;
  });
  list.innerHTML = html;
};

window.submitCreateRoomAction = async () => {
  if (isProcessing) return; isProcessing = true;
  closeCreateModal();
  const tab = document.getElementById('currentTabValue').value;
  const mode = document.getElementById('roomModeSelect').value;
  const bet = parseInt(document.getElementById('roomBetInput').value);

  if (tab === 'open') {
      try{ const res = await fetchAPI('/api/pisti-online/play-open', 'POST', {mode, bet}); if(res.ok) await enterGame(res.room.id); else throw new Error(res.error); } catch(e){ showMatrixModal("Reddedildi", e.message, "error"); } finally { isProcessing = false; }
  } else {
      const roomName = document.getElementById('roomNameInput').value;
      const password = document.getElementById('roomPassInput').value;
      if(roomName.length < 5) { showMatrixModal("Hata", "Oda adı min 5 karakter.", "error"); isProcessing = false; return; }
      if(password.length < 5) { showMatrixModal("Hata", "Şifre min 5 hane.", "error"); isProcessing = false; return; }
      try{ const res = await fetchAPI('/api/pisti-online/create-private', 'POST', {mode, bet, roomName, password}); if(res.ok) await enterGame(res.room.id); else throw new Error(res.error); } catch(e){ showMatrixModal("Reddedildi", e.message, "error"); } finally { isProcessing = false; }
  }
};

window.joinRoom = async (id, password='') => { 
  if (isProcessing) return; isProcessing = true;
  try{ const res=await fetchAPI('/api/pisti-online/join','POST',{roomId:id, password}); if(res.ok) await enterGame(id); else throw new Error(res.error); }catch(e){showMatrixModal("Reddedildi",e.message,"error");} finally { isProcessing = false; } 
};

window.handleTopBarExit = async () => { 
  closeExitConfirm();
  if(currentRoomId) { try { await fetchAPI('/api/pisti-online/leave','POST',{roomId:currentRoomId}); } catch(e){} finally { resetToLobby(); } } else { window.location.href='/'; }
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
  localStorage.setItem('activePistiRoom', id);
  clearPendingAutoJoin('pisti', id);
  
  document.getElementById("lobbyArea").style.display="none"; 
  document.getElementById("gameArea").style.display="flex";
  showLobbyNotice('');
  showGameNotice(socketReady ? 'Oyun verisi hazırlanıyor...' : 'Gerçek zamanlı bağlantı olmadan açılıyor. Oyun verisi HTTP ile eşitlenecek.', socketReady ? 'warning' : 'warning', socketReady ? '' : 'Tekrar Dene', socketReady ? null : () => ensureGameplaySocket(false).catch(() => null));
  
  lastSyncHash = ''; lastEventTs = 0; isAnimatingCapture = false;
  
  if(socketReady && socket) socket.emit('pisti:join', id);
  fetchAPI(`/api/pisti-online/state/${id}`).then(res => { if(res&&res.room) syncUI(res.room); }).catch(() => null);
  startGameSyncPolling();
  
  pingInterval = setInterval(async () => {
      if (!currentRoomId) return;
      try {
        const pingRes = await fetchAPI('/api/pisti-online/ping', 'POST', { roomId: currentRoomId });
        if (pingRes && pingRes.room && (pingRes.room.status === 'finished' || pingRes.room.status === 'abandoned')) syncUI(pingRes.room);
        else if (socketAvailableForGame) showGameNotice('');
      } catch (_) {
        showGameNotice('Oyun senkronu gecikti. Bağlantı tekrar deneniyor.', 'warning', 'Lobiye Dön', () => resetToLobby());
      }
  }, 10000); 
  return true;
}

function getCardHTML(c){ return c==='BACK' ? `<img src="https://deckofcardsapi.com/static/img/back.png">` : `<img src="https://deckofcardsapi.com/static/img/${escapeHTML(c.split('|')[0])}.png">`; }

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
      extraClass: `pm-game-avatar-shell ${wrapperClass}`,
      imageClass,
      wrapperClass: 'pm-avatar',
      sizeTag: wrapperClass === 'pm-game-avatar-shell--mini' ? 'mini' : 'main',
      alt: 'avatar'
    });
  }
  const frameIndex = resolveFrameIndex(selectedFrame);
  const safeAvatar = escapeHTML(avatarUrl || (window.PMAvatar?.FALLBACK_AVATAR || 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E'));
  const frameHtml = frameIndex > 0
    ? `<img src="/Cerceve/frame-${frameIndex}.png" class="pm-game-frame frame-${frameIndex}" alt="" aria-hidden="true" data-fallback="/Çerçeve/frame-${frameIndex}.png">`
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
  let tHTML = '';
  const allCards = Array.isArray(cardsArr) ? [...cardsArr] : [];
  if (extraCard) allCards.push(extraCard);

  allCards.forEach((card, index) => {
    const isHidden = card === 'BACK';
    const layout = getTableCardLayout(index, allCards.length, isHidden);
    const animClass = (extraCard && index === allCards.length - 1) ? 'drop-anim' : '';
    tHTML += `<div class="table-card ${animClass}" data-tx="${layout.tx}" data-ty="${layout.ty}" data-rot="${layout.rot}" data-z="${index + 1}">${getCardHTML(card)}</div>`;
  });

  document.getElementById('tableCardsArea').innerHTML = tHTML;
  applyTableCardStyles(document.getElementById('tableCardsArea'));
}


const getOppCardsHTML = (handLen) => {
    let html = '<div class="opp-hand">';
    for(let i=0; i<handLen; i++) html += '<div class="small-card-back"></div>';
    html += '</div>';
    return html;
};

function renderGameTopBar(r) {
    const poolRaw = r.bet * r.players.length;
    const poolRake = poolRaw * 0.95;
    const pool = Math.floor(poolRake).toLocaleString('tr-TR');

    const me = r.players.find(p => p.uid === userUid) || r.players[0];
    const others = r.players.filter(p => p.uid !== userUid);
    const opp = others.length > 0 ? others[0] : me;

    const isMyTurn = r.turn === r.players.findIndex(x => x.uid === userUid);

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
          <span>HAVUZ</span>
          <b>${pool} <span class="pm-pisti-pool-unit">MC</span></b>
          <span class="gts-pool-note">%5 Kasa Kesintisi</span>
      </div>`;

    if (others.length === 1) {
        const isOppTurn = r.turn === r.players.findIndex(x => x.uid === opp.uid);
        const oppCardCount = Number(opp.opponentCardCount || 0);
        const oppCardsHTML = getOppCardsHTML(oppCardCount);
        html += `
        <div class="gts-player right">
          ${buildFramedAvatarHTML(opp.avatar, opp.selectedFrame, `gts-avatar ${isOppTurn ? 'active' : ''}`)}
          <div class="gts-info">
             <div class="gts-row-top has-cards">
                 <span class="gts-name">${escapeHTML(opp.username)}</span>
                 ${oppCardsHTML}
             </div>
             <span class="gts-score">Skor: ${Number(opp.score || 0)}</span>
          </div>
        </div>`;
    } else if (others.length > 1) {
        const oppsHTML = others.map(o => {
            const isTurn = r.turn === r.players.findIndex(x => x.uid === o.uid);
            return `
              <div class="gts-opp-row ${isTurn ? 'active' : ''}">
                <span class="gts-opp-meta">(${Number(o.opponentCardCount || 0)} KART)</span>
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
  if(r.status === 'finished' || r.status === 'abandoned'){ 
      if(socket && currentRoomId) socket.emit('pisti:leave', currentRoomId);
      
      if (r.status === 'abandoned') { 
          showMatrixModal('Oyun İptal', 'Tüm oyuncular bağlantıyı kaybettiği için masa kapatıldı.<br>Bahisler iade edildi.', 'info', true); 
          return; 
      }

      if (r.finishReason === 'disconnect' && r.winner && r.winner.includes(userUid)) {
          playSfx('win');
          showMatrixModal('HÜKMEN GALİP', "Rakip bağlantısı koptu.<br>Masa sizin hanenize yazıldı ve maç getirisi bakiyenize işlendi.", 'success', true);
          return;
      }
      
      if(r.winner && r.winner.includes(userUid)){ 
          playSfx('win'); 
          if(r.winner.length > 1) {
              showMatrixModal("BERABERE!","Oyun berabere bitti. Havuz paylaşıldı.","info",true); 
          } else {
              showMatrixModal("TEBRİKLER!","MASAYI KAZANDINIZ!<br>Ödül bakiyenize eklendi.","success",true); 
          }
      } 
      else { showMatrixModal("MASAYI KAYBETTİNİZ","Şansınızı tekrar deneyin.","error",true); }
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

          setTimeout(() => {
              isAnimatingCapture = false;
              renderTableCards(r.tableCards);
          }, 1200);
      } else {
          if (!isMe) { playSfx('play'); }
      }
  }

  const me = r.players.find(p=>p.uid===userUid);

  const newStateHash = r.updatedAt + "_" + r.turn + "_" + r.tableCards.length + "_" + r.deckCount + "_" + (me ? me.hand.join(',') : '');
  if (lastSyncHash === newStateHash) return;
  lastSyncHash = newStateHash;
  
  let currentHandCount = me ? me.hand.length : 0;
  let previousHandCount = window.lastHandCount || 0;
  if (currentHandCount > 0 && previousHandCount === 0) { playSfx('deal'); }
  window.lastHandCount = currentHandCount;

  const isMyTurn = r.players[r.turn].uid === userUid;
  const stTxt = document.getElementById("gameStatusTxt");
  stTxt.innerText = r.status==='waiting' ? "RAKİPLER BEKLENİYOR..." : (isMyTurn ? "SIRA SİZDE" : "RAKİBİN HAMLESİ BEKLENİYOR...");
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
          me.hand.forEach((c,idx)=>{ 
              myH += `<div class="card-3d deal-anim" id="cardEl_${idx}" data-card-index="${idx}" data-token="${escapeHTML(c)}">${getCardHTML(c)}</div>`; 
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
  if (cardEl) { cardEl.style.display = 'none'; } 

  const zIdx = currentRoomState.tableCards.length;
  appendTableCardElement(token, { tx: 0, ty: 0, rot: 0, z: zIdx, animClass: 'drop-anim' });

  let fallbackTimeout = setTimeout(() => { 
      isProcessing = false; 
      syncUI(currentRoomState);
  }, 3500); 

  try {
    const playRes = await fetchAPI('/api/pisti-online/play', 'POST', { roomId: currentRoomId, cardIndex: actualIndex, cardToken: token });
    isProcessing = false; 
    clearTimeout(fallbackTimeout); 
    
    if (playRes && playRes.ok && playRes.room) {
        syncUI(playRes.room); 
    } else {
        syncUI(currentRoomState);
    }
  } catch(e) { 
      isProcessing = false; 
      clearTimeout(fallbackTimeout); 
      syncUI(currentRoomState);
  }
};

onAuthStateChanged(auth, u => {
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
  setBootProgress(4);
  setBootStatus('Kaynaklar hazırlanıyor...');
  setBootActions({ showEnter: false, showRetry: false });
  setTimeout(() => { if (!bootCompleted && !bootPromise) bootPistiApp(false).catch(() => null); }, 120);
});
