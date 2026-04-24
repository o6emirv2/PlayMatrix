import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getAuth, onAuthStateChanged, getIdToken, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
    import { loadFirebaseWebConfig } from "../public/firebase-runtime.js";

    const firebaseConfig = await loadFirebaseWebConfig({ required: true, scope: "classic" });

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.auth = auth;
    window.__PM_RUNTIME.signOut = signOut;
    window.__PM_RUNTIME.getIdToken = async (forceRefresh = false) => { if (!auth.currentUser) throw new Error('NO_USER'); return getIdToken(auth.currentUser, forceRefresh); };
    const API_URL = window.__PM_API__?.getApiBaseSync
  ? window.__PM_API__.getApiBaseSync()
  : String(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || document.querySelector('meta[name="playmatrix-api-url"]')?.content || window.location.origin || '').trim().replace(/\/+$/, '');
window.__PM_RUNTIME = window.__PM_RUNTIME || {};
window.__PM_RUNTIME.apiBase = API_URL;
window.__PLAYMATRIX_API_URL__ = API_URL;

    function resolveAccountLevel(profile = {}) {
      const value = Number(profile?.accountLevel ?? profile?.progression?.accountLevel ?? profile?.level ?? 1);
      return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
    }

    function resolveAccountLevelProgress(profile = {}) {
      const value = Number(profile?.progression?.accountLevelProgressPct ?? profile?.accountLevelProgressPct ?? 0);
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    }

    async function fetchAPI(endpoint, method = 'GET', body = null) {
        if (!auth.currentUser) return null;
        const token = await getIdToken(auth.currentUser);
        const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(`${API_URL}${endpoint}`, options);
        return await res.json();
    }


    const CLASSIC_GAME_TYPE = 'spacepro';
    const CLASSIC_LOGIN_URL = '/';
    const classicRestartBtn = document.getElementById('restartBtn');
    const classicGameOver = document.getElementById('gameOver');
    const classicFinalScoreEl = document.getElementById('finalScore');
    let classicRunId = '';
    let classicRunStartedAt = 0;
    let classicRunSubmitted = false;

    function createClassicRunId() {
      try {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      } catch (_) {}
      return `space_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function classicCanPlay() {
      return !!auth.currentUser;
    }

    function redirectClassicLogin() {
      window.location.href = CLASSIC_LOGIN_URL;
    }

    function beginClassicRun() {
      classicRunId = createClassicRunId();
      classicRunStartedAt = Date.now();
      classicRunSubmitted = false;
    }

    async function finishClassicRun(scoreValue = 0) {
      if (!classicCanPlay() || classicRunSubmitted) return null;
      classicRunSubmitted = true;
      try {
        const payload = await fetchAPI('/api/classic/submit', 'POST', {
          gameType: CLASSIC_GAME_TYPE,
          runId: classicRunId || createClassicRunId(),
          score: Math.max(0, Math.floor(Number(scoreValue) || 0)),
          startedAt: classicRunStartedAt || Date.now(),
          endedAt: Date.now()
        });
        if (payload?.ok) {
          updateBal();
          return payload;
        }
        throw new Error(payload?.error || 'Skor işlenemedi.');
      } catch (_) {
        classicRunSubmitted = false;
        return null;
      }
    }

    function applyClassicAccessState(user) {
      const guestHeader = document.getElementById('guestHeader');
      const levelHeader = document.getElementById('levelHeader');
      const mainWrapper = document.getElementById('mainWrapper');
      if (user) {
        if (guestHeader) guestHeader.style.display = 'none';
        if (levelHeader) levelHeader.style.display = 'flex';
        if (mainWrapper) mainWrapper.style.marginTop = 'calc(80px + env(safe-area-inset-top))';
        if (classicGameOver && !state.running) classicGameOver.style.display = 'none';
        if (!state.running) init();
        updateBal();
        return;
      }
      state.running = false;
      if (guestHeader) guestHeader.style.display = 'flex';
      if (levelHeader) levelHeader.style.display = 'none';
      if (mainWrapper) mainWrapper.style.marginTop = 'calc(60px + env(safe-area-inset-top))';
      if (classicGameOver) {
        classicGameOver.style.display = 'flex';
        const title = classicGameOver.querySelector('h1');
        if (title) title.textContent = 'GİRİŞ GEREKİYOR';
        if (classicFinalScoreEl) classicFinalScoreEl.textContent = 'Space Pro oynamak ve skorunu seviyene yazdırmak için giriş yap.';
      }
      if (classicRestartBtn) classicRestartBtn.textContent = 'GİRİŞ YAP';
    }

    if (classicRestartBtn) {
      ['pointerdown', 'click', 'touchstart'].forEach((eventName) => {
        classicRestartBtn.addEventListener(eventName, (event) => {
          if (classicCanPlay()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          redirectClassicLogin();
        }, true);
      });
    }

    window.__PM_CLASSIC__ = {
      canPlay: classicCanPlay,
      beginRun: beginClassicRun,
      finishRun: finishClassicRun,
      redirectToLogin: redirectClassicLogin
    };


    function updateBal() {
        fetchAPI('/api/me').then((d) => {
            if (!d) return;
            const balanceEl = document.getElementById('ui-balance');
            if (balanceEl) balanceEl.innerText = Math.floor(Number(d.balance) || 0).toLocaleString('tr-TR');

            const profile = (d && typeof d.user === 'object' && d.user) ? d.user : {};
            const accountLevel = resolveAccountLevel(profile);
            const accountProgress = resolveAccountLevelProgress(profile);

            const barEl = document.getElementById('uiAccountLevelBar');
            const pctEl = document.getElementById('uiAccountLevelPct');
            const badgeEl = document.getElementById('uiAccountLevelBadge');

            if (barEl) barEl.style.width = accountProgress + '%';
            if (pctEl) pctEl.innerText = accountProgress.toFixed(1) + '%';
            if (badgeEl) badgeEl.innerText = accountLevel;
        }).catch(() => {});
    }

    
const PM_REALTIME_PAGE_KEY = "spacepro";
let pmRealtimeSocket = null;
let pmRealtimeBootPromise = null;
const pmRealtimeMeta = { friendCounts: { incoming: 0, accepted: 0, outgoing: 0 } };

function pmRtEscape(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match] || match));
}

function pmRtNormalizeGameKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'chess' || raw.includes('sat')) return 'chess';
    return '';
}

function pmRtGameHref(gameKey, roomId) {
    const safeRoomId = encodeURIComponent(String(roomId || '').trim());
    return gameKey === 'chess'
        ? `/Online Oyunlar/Satranc.html?joinRoom=${safeRoomId}`
        : `/Online Oyunlar/Satranc.html?joinRoom=${safeRoomId}`;
}

function pmRtSetPendingJoin(gameKey, roomId) {
    sessionStorage.setItem('pm_auto_join_room', String(roomId || '').trim());
    sessionStorage.setItem('pm_auto_join_game', pmRtNormalizeGameKey(gameKey));
    sessionStorage.setItem('pm_auto_join_at', String(Date.now()));
}

function pmRtEnsureShell() {
    let styleEl = document.getElementById('pmGameRealtimeStyle');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'pmGameRealtimeStyle';
        styleEl.textContent = `
            .pmg-rt-stack{position:fixed;top:calc(env(safe-area-inset-top) + 86px);right:14px;display:flex;flex-direction:column;gap:12px;width:min(360px,calc(100vw - 24px));z-index:2147482500;pointer-events:none}
            .pmg-rt-toast{pointer-events:auto;position:relative;overflow:hidden;padding:14px 14px 13px 14px;border-radius:18px;background:linear-gradient(180deg,rgba(14,18,27,.96),rgba(8,12,18,.94));border:1px solid rgba(255,255,255,.09);box-shadow:0 20px 48px rgba(0,0,0,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transform:translate3d(0,-10px,0);opacity:0;transition:transform .22s cubic-bezier(.2,.9,.2,1),opacity .22s ease}
            .pmg-rt-toast.show{transform:translate3d(0,0,0);opacity:1}
            .pmg-rt-toast.is-success{border-color:rgba(0,255,163,.28)}
            .pmg-rt-toast.is-error{border-color:rgba(255,59,48,.34)}
            .pmg-rt-toast.is-info{border-color:rgba(212,175,55,.24)}
            .pmg-rt-head{display:flex;align-items:flex-start;gap:12px}
            .pmg-rt-icon{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.06);color:#d4af37;flex:0 0 auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
            .pmg-rt-toast.is-success .pmg-rt-icon{color:#00ffa3}
            .pmg-rt-toast.is-error .pmg-rt-icon{color:#ff6b6b}
            .pmg-rt-copy{min-width:0;flex:1}
            .pmg-rt-title{font-family:'Orbitron','Inter',sans-serif;font-size:12px;letter-spacing:1.1px;text-transform:uppercase;color:#f8fafc;margin-bottom:6px}
            .pmg-rt-msg{font-size:13px;line-height:1.5;color:rgba(229,231,235,.88);word-break:break-word}
            .pmg-rt-close{width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#cbd5e1;cursor:pointer;flex:0 0 auto;touch-action:manipulation}
            .pmg-rt-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
            .pmg-rt-btn{min-height:42px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#f8fafc;font-weight:800;cursor:pointer;touch-action:manipulation}
            .pmg-rt-btn.primary{background:linear-gradient(180deg,#ffe9a9,#d4af37);color:#111827;border-color:transparent}
            .pmg-rt-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,rgba(255,255,255,.02),rgba(212,175,55,.65),rgba(0,255,163,.6));transform-origin:left center;animation:pmRtToastProgress var(--pmg-toast-duration,5200ms) linear forwards}
            .pmg-rt-modal{position:fixed;inset:0;z-index:2147482600;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(3,7,12,.64);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
            .pmg-rt-modal.show{display:flex}
            .pmg-rt-card{width:min(420px,100%);border-radius:26px;background:linear-gradient(180deg,rgba(19,25,37,.98),rgba(10,14,22,.98));border:1px solid rgba(255,255,255,.1);box-shadow:0 28px 70px rgba(0,0,0,.52);padding:20px;transform:translateY(10px) scale(.985);opacity:0;transition:transform .22s cubic-bezier(.2,.9,.2,1),opacity .22s ease}
            .pmg-rt-modal.show .pmg-rt-card{transform:translateY(0) scale(1);opacity:1}
            .pmg-rt-badge{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.24);color:#d4af37;font-size:22px;margin-bottom:14px}
            .pmg-rt-card h3{margin:0 0 8px;font-family:'Orbitron','Inter',sans-serif;font-size:18px;letter-spacing:1px}
            .pmg-rt-card p{margin:0;color:rgba(226,232,240,.84);line-height:1.65;font-size:14px}
            @keyframes pmRtToastProgress{from{transform:scaleX(1)}to{transform:scaleX(0)}}
            @media (max-width:640px){.pmg-rt-stack{left:12px;right:12px;width:auto;top:calc(env(safe-area-inset-top) + 78px)}}
        `;
        document.head.appendChild(styleEl);
    }

    let stack = document.getElementById('pmGameRealtimeStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'pmGameRealtimeStack';
        stack.className = 'pmg-rt-stack';
        document.body.appendChild(stack);
    }

    let modal = document.getElementById('pmGameRealtimeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pmGameRealtimeModal';
        modal.className = 'pmg-rt-modal';
        modal.innerHTML = '<div class="pmg-rt-card"></div>';
        modal.addEventListener('click', (event) => {
            if (event.target === modal) pmRtCloseModal();
        });
        document.body.appendChild(modal);
    }

    return { stack, modal, card: modal.querySelector('.pmg-rt-card') };
}

function pmRtToast(title, message, tone = 'info', options = {}) {
    const { stack } = pmRtEnsureShell();
    const toast = document.createElement('div');
    toast.className = `pmg-rt-toast is-${tone}`;
    toast.style.setProperty('--pmg-toast-duration', `${Math.max(1800, Number(options.duration) || 5200)}ms`);
    toast.innerHTML = `
        <div class="pmg-rt-head">
            <div class="pmg-rt-icon"><i class="fa-solid ${options.iconClass || (tone === 'success' ? 'fa-circle-check' : tone === 'error' ? 'fa-triangle-exclamation' : 'fa-bell')}"></i></div>
            <div class="pmg-rt-copy">
                <div class="pmg-rt-title">${pmRtEscape(title || 'Bildirim')}</div>
                <div class="pmg-rt-msg">${pmRtEscape(message || '')}</div>
            </div>
            <button class="pmg-rt-close" type="button" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="pmg-rt-progress"></div>
    `;
    const remove = () => {
        toast.classList.remove('show');
        window.setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector('.pmg-rt-close').addEventListener('click', remove, { passive: true });
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(remove, Math.max(1800, Number(options.duration) || 5200));
    return toast;
}

function pmRtCloseModal() {
    const modal = document.getElementById('pmGameRealtimeModal');
    if (modal) modal.classList.remove('show');
}

function pmRtPrompt(opts = {}) {
    const { modal, card } = pmRtEnsureShell();
    return new Promise((resolve) => {
        const cleanup = (result) => {
            pmRtCloseModal();
            window.setTimeout(() => resolve(result), 120);
        };

        card.innerHTML = `
            <div class="pmg-rt-badge"><i class="fa-solid ${opts.iconClass || 'fa-bell'}"></i></div>
            <h3>${pmRtEscape(opts.title || 'Bildirim')}</h3>
            <p>${pmRtEscape(opts.message || '')}</p>
            <div class="pmg-rt-actions">
                <button class="pmg-rt-btn" type="button" data-action="cancel">${pmRtEscape(opts.cancelText || 'Vazgeç')}</button>
                <button class="pmg-rt-btn primary" type="button" data-action="confirm">${pmRtEscape(opts.confirmText || 'Tamam')}</button>
            </div>
        `;
        card.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false), { passive: true });
        card.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true), { passive: true });
        modal.classList.add('show');
    });
}

async function pmRtLoadSocketScript() {
    if (window.io) return;
    await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-pm-socket-loader="1"]');
        if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = `${API_URL}/socket.io/socket.io.js`;
        script.async = true;
        script.dataset.pmSocketLoader = '1';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Socket istemcisi yüklenemedi.'));
        document.head.appendChild(script);
    });
}

async function pmRtRequest(endpoint, method = 'GET', body = null) {
    let payload = null;

    if (typeof fetchAPI === 'function') {
        payload = await fetchAPI(endpoint, method, body);
    } else if (typeof api === 'function') {
        payload = await api(endpoint, method, body);
    } else {
        if (!auth.currentUser) throw new Error('Oturum bulunamadı.');
        const token = await getIdToken(auth.currentUser);
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(`${API_URL}${endpoint}`, options);
        payload = await res.json();
        if (!res.ok && (payload?.ok === false || payload?.error)) {
            throw new Error(payload?.error || 'Sunucu isteği başarısız.');
        }
    }

    if (!payload) throw new Error('Sunucu yanıt vermedi.');
    if (payload.ok === false) throw new Error(payload.error || 'İstek başarısız.');
    return payload;
}

async function pmRtRefreshFriendCounts(silent = true) {
    if (!auth.currentUser) return;
    try {
        const payload = await pmRtRequest('/api/friends/list');
        const counts = payload?.counts || {};
        const nextIncoming = Number(counts.incoming || 0);
        if (!silent && nextIncoming > Number(pmRealtimeMeta.friendCounts.incoming || 0)) {
            pmRtToast('Yeni arkadaşlık isteği', 'Sosyal merkezde bekleyen yeni bir istek oluştu.', 'info', { iconClass: 'fa-user-plus' });
        }
        pmRealtimeMeta.friendCounts = {
            incoming: nextIncoming,
            accepted: Number(counts.accepted || 0),
            outgoing: Number(counts.outgoing || 0)
        };
    } catch (_) {}
}

async function pmRtMaybeConfirmExit() {
    if (PM_REALTIME_PAGE_KEY !== 'crash') return true;
    try {
        const payload = await pmRtRequest('/api/crash/active-bets');
        if (!payload?.hasActiveBet) return true;
        return await pmRtPrompt({
            title: 'Aktif Crash Bahsi',
            message: payload.hasRiskyBet
                ? 'Şu an auto cashout tanımı olmayan aktif Crash bahsin var. Davete geçersen tur arka planda devam eder ve patlama riski sana ait olur. Yine de devam etmek istiyor musun?'
                : 'Şu an aktif bir Crash bahsin bulunuyor. Davete geçersen tur arka planda devam eder. Devam etmek istiyor musun?',
            confirmText: 'Yine de Geç',
            cancelText: 'Kal',
            iconClass: 'fa-bolt'
        });
    } catch (_) {
        return true;
    }
}

async function pmRtBeforeRedirect() {
    if (false) {
        try {
            if (typeof bjSocket !== 'undefined' && bjSocket) {
                bjSocket.emit('bj:leave');
                window.setTimeout(() => { try { bjSocket.close(); } catch (_) {} }, 60);
            }
        } catch (_) {}
    }
}

async function pmRtHandleInviteResponse(data, response) {
    try {
        if (!data?.inviteId) return;
        const gameKey = pmRtNormalizeGameKey(data.gameKey);
        const roomId = String(data.roomId || '').trim();
        if (!gameKey || !roomId) throw new Error('Davet verisi eksik.');

        if (response === 'accepted') {
            const canContinue = await pmRtMaybeConfirmExit();
            if (!canContinue) return;
            await pmRtRequest('/api/chess/join', 'POST', { roomId });
        }

        if (pmRealtimeSocket) {
            pmRealtimeSocket.emit('game:invite_response', {
                inviteId: data.inviteId,
                hostUid: data.hostUid,
                roomId,
                gameKey,
                response
            });
        }

        pmRtCloseModal();

        if (response === 'accepted') {
            await pmRtBeforeRedirect();
            pmRtSetPendingJoin(gameKey, roomId);
            pmRtToast('Oyuna geçiliyor', `${data.hostName || 'Arkadaşın'} ile satranç masasına bağlanıyorsun.`, 'success', { iconClass: 'fa-arrow-right' });
            window.setTimeout(() => window.location.replace(pmRtGameHref(gameKey, roomId)), 220);
        } else {
            pmRtToast('Davet kapatıldı', `${data.hostName || 'Arkadaşın'} için gönderilen davet reddedildi.`, 'info', { iconClass: 'fa-xmark' });
        }
    } catch (error) {
        pmRtToast('Davet başarısız', error?.message || 'Odaya katılım sağlanamadı.', 'error');
    }
}

function pmRtShowInviteModal(payload) {
    if (!payload?.inviteId) return;
    const { modal, card } = pmRtEnsureShell();
    card.innerHTML = `
        <div class="pmg-rt-badge"><i class="fa-solid fa-gamepad"></i></div>
        <h3>Canlı Oyun Daveti</h3>
        <p><strong>${pmRtEscape(payload.hostName || 'Arkadaşın')}</strong> seni <strong>${pmRtEscape(payload.gameName || 'oyuna')}</strong> çağırıyor. Kabul edersen lobiye uğramadan doğrudan oyun masasına geçeceksin.</p>
        <div class="pmg-rt-actions">
            <button class="pmg-rt-btn" type="button" data-action="decline">Reddet</button>
            <button class="pmg-rt-btn primary" type="button" data-action="accept">Kabul Et</button>
        </div>
    `;
    card.querySelector('[data-action="decline"]').addEventListener('click', () => pmRtHandleInviteResponse(payload, 'declined'), { passive: true });
    card.querySelector('[data-action="accept"]').addEventListener('click', () => pmRtHandleInviteResponse(payload, 'accepted'), { passive: true });
    modal.classList.add('show');
}

function pmRtBindSocketEvents(sock) {
    if (!sock || sock.__pmRealtimeBound) return sock;
    sock.__pmRealtimeBound = true;
    pmRealtimeSocket = sock;

    sock.on('chat:direct_receive', (payload) => {
        pmRtToast(payload?.username || 'Yeni özel mesaj', payload?.message || 'Bir özel mesaj aldın.', 'info', { iconClass: 'fa-envelope' });
    });

    sock.on('friends:updated', () => {
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('friends:request_received', () => {
        pmRtToast('Arkadaşlık isteği', 'Yeni bir arkadaşlık isteği geldi.', 'info', { iconClass: 'fa-user-plus' });
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('friends:request_result', (payload) => {
        pmRtToast(
            'Arkadaşlık güncellendi',
            payload?.accepted ? 'Gönderdiğin istek kabul edildi.' : 'Gönderdiğin istek reddedildi.',
            payload?.accepted ? 'success' : 'info',
            { iconClass: payload?.accepted ? 'fa-user-check' : 'fa-user-xmark' }
        );
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('friends:request_auto_accepted', () => {
        pmRtToast('Arkadaş eklendi', 'Karşılıklı istek bulundu ve arkadaşlık anında kuruldu.', 'success', { iconClass: 'fa-user-group' });
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('game:invite_receive', (payload) => {
        pmRtToast('Oyun daveti', `${payload?.hostName || 'Arkadaşın'} seni ${payload?.gameName || 'oyuna'} çağırıyor.`, 'info', { iconClass: 'fa-gamepad', duration: 4200 });
        pmRtShowInviteModal(payload);
    });

    sock.on('game:invite_error', (payload) => {
        pmRtToast('Davet hatası', payload?.message || 'Davet işlenemedi.', 'error');
    });

    sock.on('game:invite_response', (payload) => {
        const guestName = payload?.guestName || 'Arkadaşın';
        pmRtToast(
            payload?.response === 'accepted' ? 'Davet kabul edildi' : 'Davet reddedildi',
            payload?.response === 'accepted' ? `${guestName} daveti kabul etti.` : `${guestName} daveti şu an kabul etmedi.`,
            payload?.response === 'accepted' ? 'success' : 'info',
            { iconClass: payload?.response === 'accepted' ? 'fa-circle-check' : 'fa-circle-minus' }
        );
    });

    sock.on('connect_error', (error) => {
        if (error?.message === 'xhr poll error') return;
        pmRtToast('Canlı bağlantı', 'Bildirim hattı geçici olarak yeniden bağlanıyor.', 'info', { iconClass: 'fa-wifi', duration: 2600 });
    });


    sock.on('connect', () => {
        sock.emit('social:set_presence', { status: 'IN_GAME', activity: 'Space Pro Oynuyor' });
    });
    return sock;
}

async function initPlayMatrixRealtime() {
    if (!auth.currentUser) {
        disposePlayMatrixRealtime();
        return null;
    }
    if (pmRealtimeBootPromise) return pmRealtimeBootPromise;

    pmRealtimeBootPromise = (async () => {
        pmRtEnsureShell();
        await pmRtRefreshFriendCounts(true);
        await pmRtLoadSocketScript();
        const token = await getIdToken(auth.currentUser);
        const sock = window.io(API_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });
        return pmRtBindSocketEvents(sock);
    })();

    try {
        return await pmRealtimeBootPromise;
    } catch (error) {
        pmRealtimeBootPromise = null;
        throw error;
    }
}

function disposePlayMatrixRealtime() {
    pmRtCloseModal();
    if (pmRealtimeSocket) {
        try { pmRealtimeSocket.close(); } catch (_) {}
    }
    pmRealtimeSocket = null;
    pmRealtimeBootPromise = null;
}

window.addEventListener('beforeunload', () => {
    if (pmRealtimeSocket) {
        try { pmRealtimeSocket.close(); } catch (_) {}
    }
});


onAuthStateChanged(auth, user => {
        applyClassicAccessState(user || null);
    });
