window.__PLAYMATRIX_ROUTE_NORMALIZER_DISABLED__ = true;
    import { initPlayMatrixOnlineCore } from "../../../pm-online-core.js?v=playmatrix-v13-849";

const __PM_CRASH_CLIENT_REPORTER__ = (() => {
  const EXPECTED_FLOW = new Set(['CASHOUT_NOT_AVAILABLE','CASHOUT_TOO_LATE','BET_ALREADY_LOST','BET_REFUNDED','REFUND_IN_PROGRESS','AUTO_CASHOUT_MISSED']);
  const seen = new Map();
  function apiBase(){ try { return window.__PLAYMATRIX_API_URL__ || window.__PM_RUNTIME?.apiBase || window.location.origin; } catch (_) { return window.location.origin; } }
  function shouldReport(scope, payload = {}) {
    const message = String(payload.message || payload.error || '').trim();
    const upper = message.toUpperCase();
    if (EXPECTED_FLOW.has(upper)) return false;
    const source = String(payload.source || '').toLowerCase();
    if (source && !source.includes('/games/crash') && !source.includes('/public/js/games/crash/index.js') && !source.includes('crash-app') && !source.includes('/api/crash') && !source.includes('playmatrix-runtime') && !source.includes('playmatrix-api') && !source.includes('avatar-frame') && !source.includes('game-topbar')) return false;
    const key = `${scope}:${upper}:${source}:${payload.line || ''}`;
    const last = seen.get(key) || 0;
    if (Date.now() - last < 60 * 1000) return false;
    seen.set(key, Date.now());
    return true;
  }
  function sanitizeStack(stack = '') {
    return String(stack || '')
      .split('\n')
      .slice(0, 6)
      .map((line) => line.replace(/(apiKey|token|secret|password|privateKey|serviceAccount|ADMIN_[A-Z0-9_]+)=([^&\s]+)/ig, '$1=[redacted]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'))
      .join('\n')
      .slice(0, 700);
  }
  function report(scope, payload = {}) {
    try {
      if (!shouldReport(scope, payload)) return;
      const body = { game:'crash', scope:String(scope||'frontend'), type:'crash-client', message:String(payload.message || payload.error || scope || 'Crash istemci olayı').slice(0,500), path:location.pathname, source:payload.source || 'public/js/games/crash/index.js', line:payload.line || null, sanitizedStack:sanitizeStack(payload.stack || ''), at:Date.now() };
      fetch(`${apiBase()}/api/client/error`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), keepalive:true }).catch(()=>null);
    } catch (_) {}
  }
  window.addEventListener('error', (event) => report('window.error', { message:event.message, source:event.filename, line:event.lineno, stack:event.error?.stack }), true);
  window.addEventListener('unhandledrejection', (event) => report('promise.rejection', { message:event.reason?.message || String(event.reason || ''), source:event.reason?.source || '', stack:event.reason?.stack }), true);
  return { report };
})();

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
    
const INLINE_DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
    const DEFAULT_AVATAR = window.PMAvatar?.FALLBACK_AVATAR || INLINE_DEFAULT_AVATAR;
    const CRASH_MIN_BET = 1;
    const CRASH_ABSOLUTE_TECHNICAL_MAX_BET = 100000000;
    const CRASH_DEFAULT_ADMIN_RISK_LIMIT = 100000000;
    let crashAdminRiskLimit = CRASH_DEFAULT_ADMIN_RISK_LIMIT;
    const CRASH_MIN_AUTO_CASHOUT = 2;
    const CRASH_MAX_AUTO_CASHOUT = 100;

    function installCrashFrameFallbacks() {
      document.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
        if (img.dataset.fallbackTried === '1') { img.hidden = true; return; }
        img.dataset.fallbackTried = '1';
        img.src = img.dataset.fallback;
      }, true);
    }
    installCrashFrameFallbacks();

    function safeFloat(num) { return parseFloat((Number(num) || 0).toFixed(2)); }
    function safeMoney(num) { return Math.max(0, safeFloat(num)); }
    function clampBetAmount(value) {
        const normalized = String(value ?? '').trim().replace(',', '.');
        const numeric = Math.trunc(Number(normalized) || 0);
        return Math.max(CRASH_MIN_BET, Math.min(CRASH_ABSOLUTE_TECHNICAL_MAX_BET, numeric));
    }

    function getCrashUiBetLimit() {
        const n = Number(crashAdminRiskLimit || CRASH_DEFAULT_ADMIN_RISK_LIMIT);
        return Math.max(CRASH_MIN_BET, Math.min(CRASH_ABSOLUTE_TECHNICAL_MAX_BET, Number.isFinite(n) ? Math.trunc(n) : CRASH_DEFAULT_ADMIN_RISK_LIMIT));
    }
    function clampBetForUi(value) {
        return Math.max(CRASH_MIN_BET, Math.min(getCrashUiBetLimit(), clampBetAmount(value)));
    }
    function syncCrashBetLimits(payload = {}) {
        const limit = Number(payload?.betLimits?.adminRiskLimit ?? payload?.adminRiskLimit ?? payload?.riskBetLimit ?? payload?.profile?.betLimits?.adminRiskLimit ?? 0);
        if (Number.isFinite(limit) && limit >= CRASH_MIN_BET) crashAdminRiskLimit = Math.min(CRASH_ABSOLUTE_TECHNICAL_MAX_BET, Math.trunc(limit));
    }
    function friendlyCrashError(error, fallback = 'İşlem tamamlanamadı.') {
        const code = String(error?.payload?.error || error?.message || error || '').toUpperCase();
        const map = {
            BET_AMOUNT_OVER_ADMIN_RISK_LIMIT: 'Bu tutar güvenli tur limitini aşıyor. Daha düşük MC ile tekrar dene.',
            BET_AMOUNT_OVER_ADMIN: 'Bu tutar güvenli tur limitini aşıyor. Daha düşük MC ile tekrar dene.',
            BET_AMOUNT_TOO_HIGH: 'Bahis tutarı izin verilen teknik üst sınırı aşıyor.',
            BET_AMOUNT_TOO_LOW: 'Minimum bahis 1 MC.',
            INSUFFICIENT_BALANCE: 'Bakiyen bu bahis için yeterli değil.',
            AUTH_REQUIRED: 'Oyun için giriş yapman gerekiyor.',
            QUEUED_BET_NOT_FOUND: 'Bekleyen katılım bulunamadı veya raund başlamış olabilir.',
            QUEUED_BET_ALREADY_PROMOTED: 'Raund başladı. Katılım artık aktif turda görünüyor.'
        };
        return map[code] || error?.message || fallback;
    }

    function parseAutoCashoutValue(value) {
        const normalized = String(value ?? '').trim().replace(',', '.');
        if (!normalized) return NaN;
        const numeric = Number(normalized);
        return Number.isFinite(numeric) ? numeric : NaN;
    }
    function clampAutoCashout(value) {
        const parsed = parseAutoCashoutValue(value);
        if (!Number.isFinite(parsed)) return 0;
        return safeFloat(Math.min(CRASH_MAX_AUTO_CASHOUT, Math.max(CRASH_MIN_AUTO_CASHOUT, parsed)));
    }
    function formatAutoCashoutInput(value) {
        const parsed = parseAutoCashoutValue(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return '';
        return clampAutoCashout(parsed).toFixed(2);
    }
    function pickNumber(...values) {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return null;
    }
    function pickProfile(payload) {
        if (!payload || typeof payload !== 'object') return {};
        if (payload.user && typeof payload.user === 'object') return payload.user;
        if (payload.profile && typeof payload.profile === 'object') return payload.profile;
        return payload;
    }
    function extractBalance(payload) {
        const profile = pickProfile(payload);
        const value = pickNumber(payload?.balance, payload?.mcBalance, payload?.wallet?.balance, profile?.balance, profile?.mcBalance, profile?.wallet?.balance);
        return value === null ? null : safeMoney(value);
    }
    function getPlayerAccountLevel(player = {}) {
        const rawLevel = Number(player?.accountLevel ?? player?.progression?.accountLevel ?? player?.level ?? 1);
        if (Number.isFinite(rawLevel) && rawLevel > 0) {
            return Math.max(1, Math.min(100, Math.floor(rawLevel)));
        }
        return 1;
    }

    function getPlayerAccountProgressPct(player = {}) {
        const rawProgress = Number(player?.progression?.accountLevelProgressPct ?? player?.accountLevelProgressPct ?? 0);
        if (!Number.isFinite(rawProgress)) return 0;
        return Math.max(0, Math.min(100, rawProgress));
    }

    function resolveFrameIndex(rawLevel) {
        if (window.PMAvatar && typeof window.PMAvatar.getFrameAssetIndex === 'function') {
            return window.PMAvatar.getFrameAssetIndex(rawLevel);
        }
        const lvl = Math.max(0, Math.min(100, Math.floor(Number(rawLevel) || 0)));
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

    function getCrashFrameLevel(player) {
        const raw = Math.trunc(Number(player?.selectedFrame ?? player?.frame ?? 0) || 0);
        return Math.max(0, Math.min(100, raw));
    }

    function getCrashFrameIndex(player) {
        return resolveFrameIndex(getCrashFrameLevel(player));
    }

    function createCrashAvatarNode(player, avatarUrl) {
        const frameLevel = getCrashFrameLevel(player);
        const frameIndex = resolveFrameIndex(frameLevel);
        const wrap = document.createElement('div');
        wrap.className = `t-avatar-wrap${frameIndex > 0 ? ' has-frame' : ''}`;
        if (window.PMAvatar && typeof window.PMAvatar.createNode === 'function') {
            wrap.appendChild(window.PMAvatar.createNode({
                avatarUrl: avatarUrl || DEFAULT_AVATAR,
                level: frameLevel,
                exactFrameIndex: null,
                sizePx: 40,
                extraClass: 't-avatar-core',
                imageClass: 't-avatar',
                wrapperClass: 'pm-avatar',
                variant: 'crashLivePanel',
                sizeTag: 'crashLivePanel',
                alt: 'avatar'
            }));
            return wrap;
        }
        const avatar = document.createElement('img');
        avatar.src = avatarUrl || DEFAULT_AVATAR;
        avatar.className = 't-avatar';
        avatar.alt = 'avatar';
        avatar.dataset.fallback = DEFAULT_AVATAR;
        wrap.appendChild(avatar);
        if (frameIndex > 0) {
            const frame = document.createElement('img');
            frame.src = `/public/assets/frames/frame-${frameIndex}.png`;
            frame.className = `t-frame frame-${frameIndex}`;
            frame.alt = '';
            frame.ariaHidden = 'true';
            frame.dataset.fallback = `/public/assets/frames/frame-${frameIndex}.png`;
            wrap.appendChild(frame);
        }
        return wrap;
    }

    function syncAutoMode(box, enabled) {
        const autoBet = document.getElementById(`chkAutoBet${box}`);
        const autoBtn = document.getElementById(`btnAutoMode${box}`);
        const betBox = autoBtn ? autoBtn.closest('.bet-box') : null;
        if (autoBet) autoBet.checked = !!enabled;
        if (autoBtn) autoBtn.classList.toggle('active', !!enabled);
        if (betBox) betBox.classList.toggle('auto-linked', !!enabled);
        updateButtons();
        if (enabled && sPhase === 'COUNTDOWN') checkAutoBets();
    }

function setupAutoModeBindings() {
    [1, 2].forEach(box => {
        const autoCash = document.getElementById(`chkAutoCash${box}`);
        const autoBtn = document.getElementById(`btnAutoMode${box}`);
        const autoInput = document.getElementById(`inpAuto${box}`);
        const betInput = document.getElementById(`inpBet${box}`);
        const autoBet = document.getElementById(`chkAutoBet${box}`);
        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                const nextState = !(autoBet && autoBet.checked);
                syncAutoMode(box, nextState);
            });
        }
        if (autoCash) {
            autoCash.addEventListener('change', () => {
                updateAutoCashoutInputStates();
                updateButtons();
            });
        }
        if (autoInput) {
            const normalizeAuto = () => {
                const formatted = formatAutoCashoutInput(autoInput.value);
                if (formatted) autoInput.value = formatted;
            };
            autoInput.addEventListener('change', normalizeAuto);
            autoInput.addEventListener('blur', normalizeAuto);
            normalizeAuto();
        }
        if (betInput) {
            const normalizeBet = () => {
                betInput.value = clampBetForUi(String(betInput.value).replace(',', '.'));
                updateBetButtonLabel(box);
            };
            betInput.addEventListener('change', normalizeBet);
            betInput.addEventListener('blur', normalizeBet);
        }
        syncAutoMode(box, autoBet ? autoBet.checked : false);
    });
    updateAutoCashoutInputStates();
}

const crashNoticeTimers = new Map();
    const crashNoticeIconByType = {
        success: 'fa-circle-check',
        error: 'fa-triangle-exclamation',
        warning: 'fa-circle-exclamation',
        xp: 'fa-star',
        cashout: 'fa-sack-dollar',
        loss: 'fa-burst',
        system: 'fa-circle-info',
        info: 'fa-circle-info'
    };
    const crashNoticeQueue = [];
    const crashNoticeRecent = new Map();
    let crashNoticeActive = null;

    function normalizeNoticeType(type = 'info') {
        const raw = String(type || 'info').toLowerCase();
        if (['success','error','warning','xp','cashout','loss','system','info'].includes(raw)) return raw;
        return 'info';
    }

    function getCrashNoticeDuration(type = 'info', requested = null) {
        const n = Number(requested);
        const safeType = normalizeNoticeType(type);
        const minimums = { error: 6400, warning: 5600, cashout: 5000, loss: 5000, success: 4200, xp: 4600, system: 4200, info: 3600 };
        if (Number.isFinite(n) && n > 0) return Math.max(minimums[safeType] || 4800, n);
        return minimums[safeType] || 4800;
    }

    function getCrashNoticePriority(type = 'info') {
        const safeType = normalizeNoticeType(type);
        if (safeType === 'error' || safeType === 'loss') return 4;
        if (safeType === 'warning') return 3;
        if (safeType === 'cashout' || safeType === 'xp') return 2;
        return 1;
    }

    function clearCrashNoticeDisplay(el) {
        if (!el) return;
        const key = el.id || 'crashUnifiedNotice';
        if (crashNoticeTimers.has(key)) clearTimeout(crashNoticeTimers.get(key));
        crashNoticeTimers.delete(key);
        el.classList.remove('show','is-success','is-error','is-warning','is-cashout','is-loss');
        el.replaceChildren();
        crashNoticeActive = null;
    }

    function createNoticeCloseButton(el) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'crash-unified-close';
        close.setAttribute('aria-label', 'Bildirimi kapat');
        close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        close.addEventListener('click', () => {
            clearCrashNoticeDisplay(el);
            drainCrashNoticeQueue();
        });
        return close;
    }

    function renderCashoutNotice(el, payload = {}) {
        const card = document.createElement('div');
        card.className = 'crash-win-toast';
        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'crash-win-avatar';
        const avatarUrl = payload.avatar || userInfo?.avatar || DEFAULT_AVATAR;
        const frameUrl = payload.frameUrl || userInfo?.frameUrl || '';
        const selectedFrame = Number(payload.selectedFrame ?? payload.frame ?? userInfo?.selectedFrame ?? 0) || 0;
        const exactFrameIndex = payload.exactFrameIndex ?? userInfo?.exactFrameIndex ?? null;
        if (window.PMAvatar?.mount) {
            try {
                window.PMAvatar.mount(avatarWrap, {
                    avatarUrl,
                    level: selectedFrame,
                    exactFrameIndex,
                    frameUrl,
                    variant: 'crashWinNotice',
                    sizePx: 48,
                    showFrame: true,
                    preferredFrameType: payload.activeFrameType || userInfo?.activeFrameType || '',
                    wrapperClass: 'pm-avatar pm-crash-win-notice-avatar-frame',
                    imageClass: 'pm-avatar-img',
                    alt: 'Oyuncu avatarı'
                });
            } catch (_) {
                avatarWrap.replaceChildren();
            }
        }
        if (!avatarWrap.childElementCount) {
            const img = document.createElement('img');
            img.alt = 'Avatar';
            img.src = avatarUrl;
            img.dataset.fallback = DEFAULT_AVATAR;
            avatarWrap.appendChild(img);
        }
        const chips = [
            ['ÇEKİM KAZANCI', payload.amount || '0 MC'],
            ['ÇEKİLEN X', payload.multiplier || '-'],
            ['KAZANILAN XP', payload.xp || '+0 XP']
        ];
        card.appendChild(avatarWrap);
        chips.forEach(([label, value]) => {
            const chip = document.createElement('div');
            chip.className = 'crash-win-chip';
            const span = document.createElement('span');
            span.textContent = label;
            const strong = document.createElement('strong');
            strong.textContent = value;
            chip.append(span, strong);
            card.appendChild(chip);
        });
        card.appendChild(createNoticeCloseButton(el));
        return card;
    }

    function renderStandardNotice(el, { type = 'info', title = '', message = '', amount = '', multiplier = '', xp = '' } = {}) {
        const safeType = normalizeNoticeType(type);
        const card = document.createElement('div');
        card.className = 'crash-notice-card';
        const iconWrap = document.createElement('div');
        iconWrap.className = 'crash-notice-icon';
        const icon = document.createElement('i');
        icon.className = `fa-solid ${crashNoticeIconByType[safeType] || crashNoticeIconByType.info}`;
        iconWrap.appendChild(icon);
        const copy = document.createElement('div');
        copy.className = 'crash-unified-copy';
        const strong = document.createElement('strong');
        strong.textContent = title || (safeType === 'error' ? 'İşlem tamamlanamadı' : safeType === 'warning' ? 'Dikkat' : 'Bilgi');
        const parts = [message, amount, multiplier, xp].filter(Boolean);
        const span = document.createElement('span');
        span.textContent = parts.join(' • ');
        copy.append(strong, span);
        card.append(iconWrap, copy, createNoticeCloseButton(el));
        return card;
    }

    function renderNoticeInto(el, payload = {}, timeout = 4800) {
        if (!el) return;
        const safeType = normalizeNoticeType(payload.type);
        clearCrashNoticeDisplay(el);
        const card = safeType === 'cashout' ? renderCashoutNotice(el, payload) : renderStandardNotice(el, payload);
        el.appendChild(card);
        el.classList.add('show');
        el.classList.toggle('is-success', ['success','cashout','xp'].includes(safeType));
        el.classList.toggle('is-error', safeType === 'error' || safeType === 'loss');
        el.classList.toggle('is-warning', safeType === 'warning');
        el.classList.toggle('is-cashout', safeType === 'cashout');
        el.classList.toggle('is-loss', safeType === 'loss');
        const key = el.id || 'crashUnifiedNotice';
        const duration = getCrashNoticeDuration(safeType, timeout);
        const holdUntil = ['cashout', 'loss'].includes(safeType) ? duration : Math.min(duration, safeType === 'error' ? 4200 : 2400);
        crashNoticeActive = { type: safeType, priority: getCrashNoticePriority(safeType), minUntil: Date.now() + holdUntil };
        crashNoticeTimers.set(key, setTimeout(() => {
            clearCrashNoticeDisplay(el);
            drainCrashNoticeQueue();
        }, duration));
    }

    function drainCrashNoticeQueue() {
        const target = elCrashUnifiedNotice || document.getElementById('crashUnifiedNotice');
        if (!target || crashNoticeActive || !crashNoticeQueue.length) return;
        const next = crashNoticeQueue.shift();
        renderNoticeInto(target, next.payload, next.timeout);
    }

    function showCrashNotice(input = '', opts = {}) {
        const payload = typeof input === 'object' && input !== null ? { ...input } : { message: String(input || '') };
        const type = normalizeNoticeType(payload.type || opts.type || 'info');
        payload.type = type;
        payload.title = payload.title || opts.title || '';
        payload.message = payload.message || opts.message || '';
        const timeout = getCrashNoticeDuration(type, payload.duration ?? opts.duration);
        const dedupeKey = `${type}:${payload.title}:${payload.message}:${payload.amount || ''}:${payload.multiplier || ''}:${payload.xp || ''}`.slice(0, 320);
        const lastShownAt = Number(crashNoticeRecent.get(dedupeKey) || 0);
        const dedupeWindow = ['cashout', 'loss'].includes(type) ? 6500 : 2400;
        if (Date.now() - lastShownAt < dedupeWindow) return;
        crashNoticeRecent.set(dedupeKey, Date.now());
        if (crashNoticeRecent.size > 80) {
            const cutoff = Date.now() - 30000;
            for (const [key, at] of crashNoticeRecent.entries()) if (Number(at) < cutoff) crashNoticeRecent.delete(key);
        }
        const notice = { payload, timeout, priority: getCrashNoticePriority(type) };
        const target = elCrashUnifiedNotice || document.getElementById('crashUnifiedNotice');
        if (!target) return;
        if (crashNoticeActive) {
            const activeStickyOutcome = ['cashout', 'loss'].includes(crashNoticeActive.type) && Date.now() < crashNoticeActive.minUntil;
            if (activeStickyOutcome) {
                crashNoticeQueue.push(notice);
                return;
            }
            if (Date.now() < crashNoticeActive.minUntil && notice.priority <= crashNoticeActive.priority) {
                if (!['cashout', 'loss'].includes(type)) crashNoticeQueue.push(notice);
                return;
            }
            crashNoticeQueue.unshift(notice);
            clearCrashNoticeDisplay(target);
            drainCrashNoticeQueue();
            return;
        }
        crashNoticeQueue.push(notice);
        drainCrashNoticeQueue();
    }

    window.showCrashNotice = showCrashNotice;
    window.showInlineError = (message, opts = {}) => showCrashNotice({ type: opts.type || 'info', title: opts.title || 'Bilgi', message: String(message || ''), scope: opts.scope || 'hud', duration: opts.duration });

    window.showWinStrip = (avatar, user, mult, amt, xp = 0) => {
        showCrashNotice({ type: 'cashout', title: 'Çıkış alındı', avatar: avatar || DEFAULT_AVATAR, message: `${user || 'Oyuncu'}`, amount: `+${safeFloat(amt).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MC`, multiplier: `${safeFloat(mult).toFixed(2)}x`, xp: xp ? `+${xp} XP` : '+0 XP', duration: 6200 });
    };

    window.openRulesModal = () => {
        const m = elRulesModal;
        if (!m) return;
        m.hidden = false;
        m.setAttribute('aria-hidden', 'false');
        m.style.display = 'flex'; setTimeout(() => m.classList.add('show'), 10);
    };
    window.closeRulesModal = () => {
        const m = elRulesModal;
        if (!m) return;
        m.classList.remove('show');
        m.setAttribute('aria-hidden', 'true');
        setTimeout(() => { m.style.display = 'none'; m.hidden = true; }, 300);
    };

    let audioCtx = null;
    let audioUnlocked = false;
    let serverTimeOffsetMs = 0;
    const nowServer = () => Date.now() + serverTimeOffsetMs;
    const audioMaster = { musicGain: null, sfxGain: null, compressor: null };

    function createAudioContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        return new AudioContext({ latencyHint: 'interactive' });
    }

    function ensureAudioGraph() {
        if (!audioCtx) audioCtx = createAudioContext();
        if (!audioCtx) return false;
        if (audioMaster.musicGain) return true;

        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.22;

        const musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.0;
        const sfxGain = audioCtx.createGain();
        sfxGain.gain.value = 0.72;
        musicGain.connect(compressor);
        sfxGain.connect(compressor);
        compressor.connect(audioCtx.destination);
        audioMaster.musicGain = musicGain;
        audioMaster.sfxGain = sfxGain;
        audioMaster.compressor = compressor;
        return true;
    }

    
    function playEnvelopeOsc({ type='sine', frequency=440, frequencyEnd=null, duration=0.16, gain=0.08, when=audioCtx.currentTime, detune=0 }) {
        if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(1, frequency), when);
        if (frequencyEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), when + duration);
        if (detune) osc.detune.setValueAtTime(detune, when);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.008);
        amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        osc.connect(amp);
        amp.connect(audioMaster.sfxGain);
        osc.start(when);
        osc.stop(when + duration + 0.03);
    }

    function createNoiseBuffer() {
        if (!audioCtx) return null;
        const length = audioCtx.sampleRate * 1.1;
        const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const falloff = 1 - (i / length);
            channel[i] = (Math.random() * 2 - 1) * falloff;
        }
        return buffer;
    }
    let noiseBuffer = null;

    function playNoiseBurst({ duration=0.35, gain=0.16, filterType='bandpass', frequency=950, q=1.6, when=null }) {
        if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
        if (!noiseBuffer) noiseBuffer = createNoiseBuffer();
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const amp = audioCtx.createGain();
        const now = when ?? audioCtx.currentTime;
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter);
        filter.connect(amp);
        amp.connect(audioMaster.sfxGain);
        src.start(now);
        src.stop(now + duration + 0.03);
    }

    function playFilteredNoiseSweep({ startFreq=1200, endFreq=90, duration=0.5, gain=0.18, when=null }) {
        if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
        if (!noiseBuffer) noiseBuffer = createNoiseBuffer();
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        const now = when ?? audioCtx.currentTime;
        filter.frequency.setValueAtTime(startFreq, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
        const amp = audioCtx.createGain();
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter);
        filter.connect(amp);
        amp.connect(audioMaster.sfxGain);
        src.start(now);
        src.stop(now + duration + 0.03);
    }

function playSfx(name) {
    if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
    const now = audioCtx.currentTime;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    switch (name) {
        case 'tick':
            playEnvelopeOsc({ type: 'square', frequency: 1740, frequencyEnd: 1380, duration: 0.04, gain: 0.022, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 1180, frequencyEnd: 860, duration: 0.055, gain: 0.014, when: now + 0.004 });
            break;
        case 'bet':
            playEnvelopeOsc({ type: 'square', frequency: 180, frequencyEnd: 320, duration: 0.06, gain: 0.03, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 320, frequencyEnd: 620, duration: 0.08, gain: 0.022, when: now + 0.016 });
            playEnvelopeOsc({ type: 'sine', frequency: 760, frequencyEnd: 980, duration: 0.07, gain: 0.01, when: now + 0.032 });
            break;
        case 'launch':
            playNoiseBurst({ duration: 0.18, gain: 0.03, filterType: 'highpass', frequency: 1800, q: 0.8, when: now });
            playEnvelopeOsc({ type: 'sawtooth', frequency: 72, frequencyEnd: 240, duration: 0.16, gain: 0.03, when: now });
            playEnvelopeOsc({ type: 'sawtooth', frequency: 180, frequencyEnd: 920, duration: 0.52, gain: 0.05, when: now + 0.03 });
            playEnvelopeOsc({ type: 'triangle', frequency: 120, frequencyEnd: 680, duration: 0.58, gain: 0.036, when: now + 0.02 });
            playEnvelopeOsc({ type: 'sine', frequency: 1040, frequencyEnd: 1620, duration: 0.22, gain: 0.012, when: now + 0.16 });
            break;
        case 'crash':
            playFilteredNoiseSweep({ startFreq: 3200, endFreq: 110, duration: 0.9, gain: 0.16, when: now });
            playNoiseBurst({ duration: 0.48, gain: 0.09, filterType: 'bandpass', frequency: 280, q: 0.85, when: now });
            playEnvelopeOsc({ type: 'sawtooth', frequency: 420, frequencyEnd: 46, duration: 0.72, gain: 0.085, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 180, frequencyEnd: 26, duration: 0.78, gain: 0.05, when: now + 0.015 });
            playEnvelopeOsc({ type: 'sine', frequency: 90, frequencyEnd: 18, duration: 0.68, gain: 0.02, when: now + 0.02 });
            break;
        case 'win':
            playEnvelopeOsc({ type: 'triangle', frequency: 600, frequencyEnd: 920, duration: 0.09, gain: 0.028, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 920, frequencyEnd: 1320, duration: 0.11, gain: 0.025, when: now + 0.045 });
            playEnvelopeOsc({ type: 'triangle', frequency: 1320, frequencyEnd: 1760, duration: 0.13, gain: 0.022, when: now + 0.095 });
            playEnvelopeOsc({ type: 'sine', frequency: 1760, frequencyEnd: 2280, duration: 0.14, gain: 0.016, when: now + 0.14 });
            break;
    }
}

async function initAndUnlockAudio() {
        if (audioUnlocked) return;
        try {
            if (!audioCtx) audioCtx = createAudioContext();
            if (!audioCtx) return;
            ensureAudioGraph();
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            const buffer = audioCtx.createBuffer(1, 1, 22050);
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(0);
            audioUnlocked = true;
        } catch(e) {}
    }

    ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click'].forEach(evt => {
        window.addEventListener(evt, () => { initAndUnlockAudio(); }, { passive: true, once: false });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            initAndUnlockAudio();
            connectStream().catch(() => {});
        }
    });
    window.addEventListener('focus', () => { connectStream().catch(() => {}); });
    window.addEventListener('pageshow', () => { connectStream().catch(() => {}); });
    window.addEventListener('online', () => { connectStream().catch(() => {}); });

    const elBtnAction1 = document.getElementById('btnAction1');
    const elBtnAction2 = document.getElementById('btnAction2');
    const elBtnEnterGame = document.getElementById('btnEnterGame');
    const elBtnRetryBoot = document.getElementById('btnRetryBoot');
    const elStudioIntro = document.getElementById('studioIntro');
    const elLoaderFill = document.getElementById('loaderFill');
    const elLoaderStatus = document.getElementById('loaderStatus');
    const elRulesModal = document.getElementById('rulesModal');
    const elUiPhase = document.getElementById('uiPhase');
    const elLiveBetCount = document.getElementById('liveBetCount');
    const elLiveCashoutCount = document.getElementById('liveCashoutCount');
    const elUiAccountLevelBar = document.getElementById('uiAccountLevelBar');
    const elUiAccountLevelPct = document.getElementById('uiAccountLevelPct');
    const elUiAccountLevelBadge = document.getElementById('uiAccountLevelBadge');
    const elUiAccountAvatarHost = document.getElementById('uiAccountAvatarHost');
    const elCrashUnifiedNotice = document.getElementById('crashUnifiedNotice');

    function getSafeWebStorage(name = 'localStorage') {
        try {
            const storage = window[name];
            if (!storage) return null;
            const probeKey = `__pm_storage_probe_${name}`;
            storage.setItem(probeKey, '1');
            storage.removeItem(probeKey);
            return storage;
        } catch (_) { return null; }
    }

    function getSafeStorageList() {
        return [getSafeWebStorage('sessionStorage'), getSafeWebStorage('localStorage')].filter(Boolean);
    }
    let bootPromise = null;
    let bootCompleted = false;
    let bootActionMode = 'retry';

    function renderCrashRuntimeNotice(message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
        const text = String(message || '').trim();
        if (!text) {
            const target = elCrashUnifiedNotice || document.getElementById('crashUnifiedNotice');
            if (target) clearCrashNoticeDisplay(target);
            return;
        }
        showCrashNotice({ type: tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'info', title: actionLabel || 'Crash', message: text, duration: actionHandler ? 6500 : 4200 });
    }

    function setBootBusyState(isBusy) { if (elBtnEnterGame) elBtnEnterGame.disabled = !!isBusy; if (elBtnRetryBoot) elBtnRetryBoot.disabled = !!isBusy; }

    function setBootProgress(value) {
        const pct = Math.max(0, Math.min(100, Number(value) || 0));
        if (elLoaderFill) elLoaderFill.style.width = pct + '%';
    }

    function setBootStatus(message, tone = 'info') {
        if (!elLoaderStatus) return;
        elLoaderStatus.textContent = message;
        elLoaderStatus.classList.remove('is-error');
        if (tone === 'error') elLoaderStatus.classList.add('is-error');
    }

    function playCrashSfx(name = '') {
    try {
        const key = String(name || '').trim().toLowerCase();
        if (!key) return;
        if (typeof playSfx === 'function') { playSfx(key); return; }
        const audio = window.__PM_CRASH_SFX__ && window.__PM_CRASH_SFX__[key];
        if (audio && typeof audio.play === 'function') {
            audio.currentTime = 0;
            audio.play().catch(() => null);
        }
    } catch (_) {}
}

window.playCrashSfx = window.playCrashSfx || playCrashSfx;

function setBootActions({ showEnter = false, showRetry = false, enterLabel = 'CRASH OYNA', actionMode = 'continue' } = {}) {
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
        setTimeout(() => { elStudioIntro.style.display = 'none'; }, 320);
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

    function renderCrashTopbarAvatar(profile = {}) {
        if (!elUiAccountAvatarHost) return;
        const avatarUrl = profile.avatar || profile.photoURL || profile.avatarUrl || DEFAULT_AVATAR;
        const frameLevel = Number(profile.selectedFrame || profile.frameLevel || profile.level || profile.accountLevel || 0) || 0;
        const exactFrameIndex = profile.exactFrameIndex ?? profile.frameIndex ?? null;
        const frameUrl = profile.marketFrameUrl || profile.frameUrl || profile.activeFrameUrl || '';
        const signature = JSON.stringify({ avatarUrl, frameLevel, exactFrameIndex, frameUrl, variant: 'crashTopbar' });
        if (elUiAccountAvatarHost.dataset.pmAvatarSig === signature && elUiAccountAvatarHost.childElementCount) return;
        elUiAccountAvatarHost.dataset.pmAvatarSig = signature;
        if (window.PMAvatar?.mount) {
            try {
                window.PMAvatar.mount(elUiAccountAvatarHost, {
                    avatarUrl,
                    level: frameLevel,
                    exactFrameIndex,
                    frameUrl,
                    sizePx: 50,
                    wrapperClass: 'pm-avatar pm-crash-topbar-avatar-frame',
                    imageClass: 'pm-avatar-img',
                    variant: 'crashTopbar',
                    preferredFrameType: profile.activeFrameType || profile.selectedFrameType || profile.frameType || '',
                    sizeTag: 'crashTopbar',
                    alt: 'Oyuncu'
                });
                return;
            } catch (_) {}
        }
        const img = document.createElement('img');
        img.className = 'pm-game-topbar-avatar-only';
        img.src = (window.PMAvatar?.safeAvatarUrl ? window.PMAvatar.safeAvatarUrl(avatarUrl) : avatarUrl) || DEFAULT_AVATAR;
        img.alt = 'Oyuncu avatarı';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        elUiAccountAvatarHost.replaceChildren(img);
    }

    function applyCrashProgression(profile = {}, { animate = false } = {}) {
        const accountLevel = getPlayerAccountLevel(profile);
        const accountProgress = getPlayerAccountProgressPct(profile);
        if (elUiAccountLevelBar) {
            elUiAccountLevelBar.style.width = accountProgress + '%';
            if (animate) {
                elUiAccountLevelBar.classList.add('xp-pulse');
                setTimeout(() => elUiAccountLevelBar?.classList.remove('xp-pulse'), 900);
            }
        }
        if (elUiAccountLevelPct) elUiAccountLevelPct.innerText = `${accountProgress.toFixed(1)}%`;
        if (elUiAccountLevelBadge) elUiAccountLevelBadge.innerText = accountLevel;
    }

    function applyCrashProfilePayload(payload) {
        syncCrashBetLimits(payload);
        if (!payload?.ok) throw new Error(payload?.error || 'PROFILE_LOAD_FAILED');
        lastProfilePayload = payload;
        const profile = pickProfile(payload);
        const balance = extractBalance(payload);
        if (balance !== null) {
            currentBalance = balance;
            balanceReady = true;
        }
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if(profile && Object.keys(profile).length) {
            userInfo.avatar = profile.avatar || profile.photoURL || profile.avatarUrl || '';
            userInfo.username = profile.username || profile.displayName || profile.fullName || 'Sen';
            userInfo.selectedFrame = Number(profile.selectedFrame || profile.frameLevel || profile.level || profile.accountLevel || 0) || 0;
            userInfo.exactFrameIndex = profile.exactFrameIndex ?? profile.frameIndex ?? null;
            userInfo.frameUrl = profile.marketFrameUrl || profile.frameUrl || profile.activeFrameUrl || '';
            userInfo.activeFrameType = profile.activeFrameType || profile.selectedFrameType || profile.frameType || '';
            renderCrashTopbarAvatar(profile);
            applyCrashProgression(profile, { animate: false });
            const badgeWrap = document.querySelector('.level-badge-wrap');
            if (badgeWrap) badgeWrap.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
            const statFill = document.querySelector('.stat-bar-fill');
            if (statFill) statFill.style.background = '';
        }
        updateButtons();
        return payload;
    }

    async function fetchBootProfile() {
        const payload = await api('/api/crash/profile');
        return applyCrashProfilePayload(payload);
    }

    async function waitForSocketReady(sock, timeoutMs = 6500) {
        return core.waitForSocketReady(sock, timeoutMs);
    }

    async function bootCrashApp(force = false) {
        if (bootCompleted && !force) return true;
        if (bootPromise) return bootPromise;
        bootPromise = (async () => {
            setBootBusyState(true);
            renderCrashRuntimeNotice('');
            setBootProgress(8);
            setBootStatus('Oturum doğrulanıyor...');
            setBootActions({ showEnter: false, showRetry: false });
            const user = await waitForAuthReady(15000);
            uid = user.uid;
            setBootProgress(26);
            setBootStatus('Profil ve bakiye hazırlanıyor...');
            await withTimeout(fetchBootProfile(), 7000, 'PROFILE_TIMEOUT').catch((error) => {
                balanceReady = false;
                renderCrashRuntimeNotice('Profil/bakiye verisi alınamadı. Bakiye doğrulanana kadar bahis butonları kapalı kalacak.', 'warning', 'Tekrar Dene', () => fetchBootProfile().catch(() => null));
                return null;
            });
            setBootProgress(42);
            setBootStatus('Ses katmanı hazırlanıyor...');
            await withTimeout(initAndUnlockAudio(), 2500, 'AUDIO_TIMEOUT').catch(() => null);
            setBootProgress(65);
            setBootStatus('Canlı akış bağlanıyor...');
            let streamReady = false;
            try {
                await withTimeout(connectStream(), 2500, 'SOCKET_INIT_TIMEOUT');
                await waitForSocketReady(socket, 3500);
                streamReady = true;
            } catch (_) {
                streamReady = false;
            }
            bootCompleted = true;
            setBootProgress(100);
            setBootStatus(streamReady ? 'Canlı akış hazır. Oyun açılıyor...' : 'Ekran hazırlanıyor. Canlı akış arka planda yeniden denenecek.', streamReady ? 'info' : 'warning');
            setBootActions({ showEnter: true, showRetry: !streamReady, enterLabel: 'CRASH OYNA', actionMode: 'continue' });
            if (!streamReady) {
                renderCrashRuntimeNotice('Canlı akış şu an hazır değil. Ekran açılacak; bağlantı arka planda tekrar denenecek.', 'warning', 'Tekrar Dene', () => connectStream().catch(() => null));
                scheduleCrashReconnect(250);
            }
            await startApp(!streamReady);
            dismissIntro();
            return true;
        })().catch((error) => {
            const code = error?.code || error?.message || 'BOOT_ERROR';
            if (['AUTH_TIMEOUT','NO_USER','FIREBASE_UNAVAILABLE','PUBLIC_RUNTIME_CONFIG_UNAVAILABLE','PUBLIC_FIREBASE_CONFIG_MISSING','FIREBASE_IMPORT_FAILED','FIREBASE_SDK_TIMEOUT'].includes(code)) {
                setBootProgress(18);
                setBootStatus('Oturum doğrulanamadı. Önce giriş yapıp tekrar deneyin.', 'error');
                setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ANASAYFAYA DÖN', actionMode: 'home' });
            } else {
                setBootProgress(48);
                setBootStatus('Canlı akış kurulamadı. Tekrar deneyin.', 'error');
                renderCrashRuntimeNotice('Canlı akış hazır değil. Tekrar deneyerek bağlantıyı yeniden başlatabilirsiniz.', 'error', 'Tekrar Dene', () => bootCrashApp(true).catch(() => null));
                setBootActions({ showEnter: false, showRetry: true, actionMode: 'retry' });
            }
            bootCompleted = false;
            throw error;
        }).finally(() => { setBootBusyState(false); bootPromise = null; });
        return bootPromise;
    }

    elBtnEnterGame.addEventListener('click', async () => {
        if (bootActionMode === 'home') { window.location.href = '/'; return; }
        if (!bootCompleted) { bootCrashApp(true).catch(() => null); return; }
        dismissIntro();
        startApp(true).catch(() => null);
    });

    elBtnRetryBoot?.addEventListener('click', () => { bootCrashApp(true).catch(() => null); });

    let socket = null;
    let uid = null;
    let currentBalance = 0;
    let balanceReady = false;
    let balanceRefreshTimer = null;
    let canvasFrameId = 0;
    let canvasLoopActive = false;
    let lastProfilePayload = null;
    let sPhase = 'COUNTDOWN';
    let sMult = 1.00;
    let currentRoundId = null;
    let previousRoundId = null;
    let autoBetPlacedForRound = { box1: null, box2: null };
    let myBets = { box1: null, box2: null };
    let isProcessing = { box1: false, box2: false };
    let lastTick = -1;
    let lastRenderedTableData = '';
    let localTargetTime = 0;
    let localStartTime = 0;
    let crashCountdownEnd = 0;
    let pendingPhaseAfterCrash = null;
    let pendingCountdownStartTime = 0;
    let userInfo = { avatar: '', username: 'Sen', selectedFrame: 0, frameUrl: '', exactFrameIndex: null, activeFrameType: '' };
    let lastServerMult = 1.00;
    let lastServerMultAt = 0;
    let lastServerTickAt = 0;
    const seenOutcomeNotices = new Map();
    const OUTCOME_NOTICE_TTL_MS = 30000;
    function cleanupCrashOutcomeNotices(force = false) {
        const cutoff = Date.now() - OUTCOME_NOTICE_TTL_MS;
        for (const [key, at] of seenOutcomeNotices.entries()) {
            if (force || Number(at || 0) < cutoff) seenOutcomeNotices.delete(key);
        }
    }
    function crashOutcomeNoticeKey(input = {}, box = 1, outcome = 'cashout') {
        const normalizedBox = Number(input.box ?? box) === 2 ? 2 : 1;
        const round = String(input.roundId || currentRoundId || previousRoundId || 'round');
        const player = String(input.uid || input.userId || uid || 'me');
        return `crash:${round}:${player}:${normalizedBox}:${outcome}`;
    }
    function markCrashOutcomeNotice(input = {}, box = 1, outcome = 'cashout') {
        cleanupCrashOutcomeNotices(false);
        const key = crashOutcomeNoticeKey(input, box, outcome);
        if (seenOutcomeNotices.has(key)) return false;
        seenOutcomeNotices.set(key, Date.now());
        return true;
    }

    const elUiMultiplier = document.getElementById('uiMultiplier');
    const elLiveTableBody = document.getElementById('liveTableBody');
    const elHistory = document.getElementById('uiHistory');
    const elHudSpeed = document.getElementById('hudSpeed');
    const elBgSpeedLayer = document.getElementById('bgSpeedLayer');
    const elHudPhase = document.getElementById('hudPhase');
    const elUiBalance = document.getElementById('uiBalance');
    const elCrashCanvas = document.getElementById('crashCanvas');

    let lastDisplayedMultStr = '';
    let lastDisplayedCountdownStr = '';
    let lastSpeedPct = -1;
    let lastHistoryHtml = '';

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match] || match));
    }

    function formatCompactMc(value, includeUnit = true) {
        const num = Number(value) || 0;
        const abs = Math.abs(num);
        const units = [
            { limit: 1e12, suffix: 'T' },
            { limit: 1e9, suffix: 'B' },
            { limit: 1e6, suffix: 'M' },
            { limit: 1e3, suffix: 'K' }
        ];
        let text = '';
        const picked = units.find(unit => abs >= unit.limit);
        if (picked) {
            const shortVal = num / picked.limit;
            text = `${shortVal >= 100 ? shortVal.toFixed(0) : shortVal >= 10 ? shortVal.toFixed(1) : shortVal.toFixed(2)}${picked.suffix}`;
        } else {
            text = num.toLocaleString('tr-TR', { minimumFractionDigits: abs >= 100 ? 0 : 2, maximumFractionDigits: abs >= 100 ? 0 : 2 });
        }
        return includeUnit ? `${text} MC` : text;
    }

    let crashReconnectTimer = null;
    let crashConnectPromise = null;
    let crashStreamReady = false;
    let crashConnectionNoticeTimer = null;
    let crashConnectionNoticeFailures = 0;
    let pmRealtimeSocket = null;
    let pmRealtimeBootPromise = null;
    let pmRealtimeReconnectNoticeTimer = null;
    const PM_REALTIME_PAGE_KEY = 'crash';

    function getBoxKey(box) { return `box${Number(box) === 2 ? 2 : 1}`; }
    function getBetInput(box) { return document.getElementById(`inpBet${Number(box) === 2 ? 2 : 1}`); }
    function getAutoInput(box) { return document.getElementById(`inpAuto${Number(box) === 2 ? 2 : 1}`); }
    function getAutoCashInput(box) { return document.getElementById(`chkAutoCash${Number(box) === 2 ? 2 : 1}`); }
    function getAutoBetInput(box) { return document.getElementById(`chkAutoBet${Number(box) === 2 ? 2 : 1}`); }
    function getActionButton(box) { return document.getElementById(`btnAction${Number(box) === 2 ? 2 : 1}`); }
    function getStatusEl(box) { return document.getElementById(`boxStatus${Number(box) === 2 ? 2 : 1}`); }

    function isQueuedBet(bet) {
        return !!(bet && (bet.queued || bet.queuedForNextRound || (!bet.roundId && !bet.cashed && !bet.lost && !bet.refunded)));
    }

    function setButtonMode(button, mode) {
        if (!button) return;
        button.classList.toggle('btn-cashout', mode === 'cashout');
        button.classList.toggle('btn-success', mode === 'success');
        button.classList.toggle('btn-lost', mode === 'lost');
        button.classList.toggle('btn-next-round', mode === 'next');
        button.classList.toggle('btn-cancel', mode === 'cancel');
        button.classList.toggle('btn-bet', !['cashout','success','lost','next','cancel'].includes(mode));
    }

    function setActionButtonContent(button, label, detail = '') {
        if (!button) return;
        const span = document.createElement('span');
        span.textContent = String(detail || '');
        button.replaceChildren(document.createTextNode(String(label || '')), span);
    }

    function setIconCounter(element, text) {
        if (!element) return;
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-user';
        element.replaceChildren(icon, document.createTextNode(String(text || '')));
    }

    function setBoxStatus(box, text, state = '') {
        const el = getStatusEl(box);
        if (!el) return;
        el.textContent = text;
        el.dataset.state = state;
    }

    function updateBetButtonLabel(box) {
        const btn = getActionButton(box);
        const input = getBetInput(box);
        if (!btn || !input) return;
        const amount = clampBetForUi(String(input.value || '0').replace(',', '.'));
        const span = btn.querySelector('span');
        if (span) span.textContent = formatCompactMc(amount);
        else btn.textContent = `MC KULLAN ${formatCompactMc(amount)}`;
    }

    function syncBetButtonAmounts() {
        [1, 2].forEach((box) => updateBetButtonLabel(box));
    }

    function updateAutoCashoutInputStates() {
        [1, 2].forEach((box) => {
            const checkbox = getAutoCashInput(box);
            const input = getAutoInput(box);
            if (!input) return;
            const enabled = !!checkbox?.checked;
            input.disabled = !enabled;
            input.closest('.auto-input-shell')?.classList.toggle('disabled', !enabled);
        });
    }

    function normalizeLocalBetForBox(box, data = {}) {
        const amount = Number(data.bet ?? data.amount ?? 0) || 0;
        return {
            uid: data.uid || uid,
            username: data.username || userInfo.username || 'Sen',
            avatar: data.avatar || userInfo.avatar || DEFAULT_AVATAR,
            selectedFrame: data.selectedFrame ?? data.frame ?? 0,
            betId: data.betId || '',
            box,
            roundId: (data.queued || data.queuedForNextRound) ? String(data.roundId || '') : String(data.roundId || currentRoundId || ''),
            bet: amount,
            amount,
            autoCashout: Number(data.autoCashout || 0) || 0,
            autoCashoutEnabled: !!data.autoCashoutEnabled,
            cashed: !!data.cashed,
            lost: !!data.lost,
            refunded: !!data.refunded,
            queued: !!(data.queued || data.queuedForNextRound),
            queuedForNextRound: !!(data.queued || data.queuedForNextRound),
            cancelable: !!data.cancelable || !!(data.queued || data.queuedForNextRound),
            sourceRoundId: String(data.sourceRoundId || ''),
            queuedAt: Number(data.queuedAt || 0) || 0,
            cashingOut: !!data.cashingOut,
            settlementPending: !!data.settlementPending,
            xpAwarded: Number(data.xpAwarded ?? data.xpResult?.xpAwarded ?? 0) || 0,
            xpResult: data.xpResult || null,
            win: Number(data.win || 0) || 0,
            cashoutMult: Number(data.cashoutMult || 0) || 0
        };
    }

    function getServerMultiplier(data = {}) {
        return pickNumber(data.currentMult, data.multiplier, data.crashPoint);
    }

    function getServerCountdownUntil(data = {}) {
        return pickNumber(data.startTime, data.countdownUntil, data.countdownEndsAt);
    }

    function normalizeServerBet(raw = {}) {
        const box = Number(raw.box) === 2 ? 2 : 1;
        const queued = !!(raw.queued || raw.queuedForNextRound);
        return normalizeLocalBetForBox(box, {
            ...raw,
            queued,
            queuedForNextRound: queued,
            uid: raw.uid || (raw.isMine ? uid : raw.playerKey),
            username: raw.isMine ? (userInfo.username || 'Sen') : (raw.username || 'Oyuncu'),
            avatar: raw.isMine ? (userInfo.avatar || raw.avatar || DEFAULT_AVATAR) : (raw.avatar || DEFAULT_AVATAR),
            win: raw.win ?? raw.winAmount ?? 0,
            amount: raw.amount ?? raw.bet ?? 0,
            bet: raw.bet ?? raw.amount ?? 0,
            roundId: queued ? String(raw.roundId || '') : (raw.roundId || currentRoundId)
        });
    }

    async function restoreActiveBets() {
        try {
            const payload = await api('/api/crash/resume');
            if (!payload?.ok) return;
            if (payload.roundId) currentRoundId = String(payload.roundId);
            if (payload.phase) sPhase = String(payload.phase || '').toUpperCase();
            const mult = getServerMultiplier(payload);
            if (Number.isFinite(mult)) sMult = safeFloat(mult);
            const countdownUntil = getServerCountdownUntil(payload);
            if (Number.isFinite(countdownUntil)) crashCountdownEnd = Number(countdownUntil);
            const balance = extractBalance(payload);
            if (balance !== null) {
                currentBalance = balance;
                balanceReady = true;
                if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
            const bets = Array.isArray(payload.myBets) ? payload.myBets : (Array.isArray(payload.bets) ? payload.bets : []);
            const queuedBets = Array.isArray(payload.queuedBets) ? payload.queuedBets : (Array.isArray(payload.myQueuedBets) ? payload.myQueuedBets : []);
            [...bets, ...queuedBets].forEach((bet) => {
                const box = Number(bet.box) === 2 ? 2 : 1;
                myBets[getBoxKey(box)] = normalizeServerBet({ ...bet, isMine: true });
            });
            handleServerData(payload);
            updateButtons();
            updateHud();
        } catch (_) {}
    }

    function currentCashoutEstimate(bet) {
        if (!bet) return 0;
        const mult = sPhase === 'FLYING' ? Math.max(1, Number(sMult) || 1) : 1;
        return safeFloat((Number(bet.bet ?? bet.amount) || 0) * mult);
    }

    function updateButtons() {
        [1, 2].forEach((box) => {
            const boxKey = getBoxKey(box);
            const btn = getActionButton(box);
            const bet = myBets[boxKey];
            if (!btn) return;
            const amount = clampBetForUi(getBetInput(box)?.value || 0);
            const amountLabel = formatCompactMc(amount);
            const insufficientBalance = balanceReady && amount > currentBalance;
            btn.disabled = false;
            btn.classList.toggle('is-processing', !!isProcessing[boxKey]);
            btn.classList.toggle('is-insufficient', !!insufficientBalance);
            if (isProcessing[boxKey]) {
                setButtonMode(btn, isQueuedBet(bet) ? 'next' : (bet && !bet.cashed && sPhase === 'FLYING' ? 'cashout' : 'bet'));
                setActionButtonContent(btn, isQueuedBet(bet) ? 'İPTAL EDİLİYOR' : 'İŞLENİYOR', 'Lütfen bekle');
                btn.disabled = true;
                setBoxStatus(box, 'İşlemde', 'processing');
                return;
            }
            if (isQueuedBet(bet)) {
                setButtonMode(btn, 'next');
                setActionButtonContent(btn, 'SONRAKİ RAUND BEKLENİYOR', 'İptal etmek için dokun');
                btn.disabled = false;
                setBoxStatus(box, 'Sonraki raund bekleniyor', 'waiting');
                return;
            }
            if (bet && String(bet.roundId || '') === String(currentRoundId || '') && bet.cashed) {
                setButtonMode(btn, 'success');
                const mult = Number(bet.cashoutMult || 0) || 0;
                const xp = Number(bet.xpAwarded ?? bet.xpResult?.xpAwarded ?? 0) || 0;
                setActionButtonContent(btn, 'ÇIKIŞ ALINDI', `${mult > 0 ? mult.toFixed(2) + 'x' : ''}${xp > 0 ? ` • +${xp} XP` : ''}`);
                btn.disabled = true;
                setBoxStatus(box, bet.settlementPending ? 'Bakiye işleniyor' : 'Çıkış alındı', bet.settlementPending ? 'processing' : 'ready');
                return;
            }
            if (bet && String(bet.roundId || '') === String(currentRoundId || '') && bet.lost) {
                setButtonMode(btn, 'lost');
                const xp = Number(bet.xpAwarded ?? bet.xpResult?.xpAwarded ?? 0) || 0;
                setActionButtonContent(btn, 'KAYBETTİ', xp > 0 ? `+${xp} XP` : 'Tur kapandı');
                btn.disabled = true;
                setBoxStatus(box, 'Tur kaybedildi', 'closed');
                return;
            }

            if (bet && !bet.cashed && !bet.refunded && String(bet.roundId || '') === String(currentRoundId || '')) {
                if (sPhase === 'FLYING') {
                    setButtonMode(btn, 'cashout');
                    setActionButtonContent(btn, 'ÇIKIŞ AL', formatCompactMc(currentCashoutEstimate(bet)));
                    setBoxStatus(box, `${safeFloat(sMult).toFixed(2)}x aktif`, 'flying');
                } else if (sPhase === 'COUNTDOWN') {
                    setButtonMode(btn, 'bet');
                    setActionButtonContent(btn, 'TURA KATILDIN', formatCompactMc(bet.bet ?? bet.amount));
                    btn.disabled = true;
                    setBoxStatus(box, 'Tur bekleniyor', 'locked');
                } else {
                    setButtonMode(btn, 'bet');
                    setActionButtonContent(btn, 'SONUÇ BEKLENİYOR', formatCompactMc(bet.bet ?? bet.amount));
                    btn.disabled = true;
                    setBoxStatus(box, 'Tur kapandı', 'closed');
                }
                return;
            }

            setButtonMode(btn, 'bet');
            setActionButtonContent(btn, 'MC KULLAN', amountLabel);

            if (!balanceReady) {
                btn.disabled = true;
                setBoxStatus(box, 'Bakiye doğrulanıyor', 'waiting');
                return;
            }

            if (insufficientBalance) {
                btn.disabled = true;
                setBoxStatus(box, 'Bakiye yetersiz', 'closed');
                return;
            }

            if (sPhase !== 'COUNTDOWN') {
                setButtonMode(btn, 'next');
                setActionButtonContent(btn, 'SONRAKİ RAUND', amountLabel);
                setBoxStatus(box, 'Sonraki raund bekleniyor', 'waiting');
                return;
            }

            setBoxStatus(box, 'Hazır', 'ready');
        });
    }

    function bindQuickButtons() {
        document.querySelectorAll('.chip-btn,.step-btn').forEach((btn) => {
            if (btn.__pmCrashBound) return;
            btn.__pmCrashBound = true;
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const input = targetId ? document.getElementById(targetId) : null;
                if (!input) return;
                const current = clampBetForUi(String(input.value || '0').replace(',', '.'));
                let next = current;
                switch (btn.dataset.op) {
                    case 'minus10': next = Math.max(1, current - 10); break;
                    case 'plus1': next = current + 1; break;
                    case 'plus10': next = current + 10; break;
                    case 'plus100': next = current + 100; break;
                    case 'double': next = current * 2; break;
                    case 'half': next = Math.max(1, current / 2); break;
                    case 'max': next = currentBalance >= CRASH_MIN_BET ? Math.max(CRASH_MIN_BET, Math.min(getCrashUiBetLimit(), Math.trunc(currentBalance))) : CRASH_MIN_BET; break;
                    default: next = current;
                }
                input.value = clampBetForUi(next);
                syncBetButtonAmounts();
                updateButtons();
            });
        });

        [1, 2].forEach((box) => {
            const btn = getActionButton(box);
            if (!btn || btn.__pmCrashActionBound) return;
            btn.__pmCrashActionBound = true;
            btn.addEventListener('click', () => handleBetAction(box));
        });
    }

    async function handleBetAction(box) {
        const boxKey = getBoxKey(box);
        if (isProcessing[boxKey]) return;
        const activeBet = myBets[boxKey];
        try {
            isProcessing[boxKey] = true;
            updateButtons();
            if (isQueuedBet(activeBet)) await cancelQueuedBet(box);
            else if (activeBet && !activeBet.cashed && sPhase === 'FLYING') await cashOut(box);
            else await placeBet(box);
        } catch (error) {
            showCrashNotice({ type: 'error', title: 'İşlem başarısız', message: error?.message || 'İşlem tamamlanamadı.', scope: `box${box}` });
        } finally {
            isProcessing[boxKey] = false;
            updateButtons();
        }
    }

    async function placeBet(box, silent = false) {
        const boxKey = getBoxKey(box);
        if (isQueuedBet(myBets[boxKey])) return;
        if (myBets[boxKey] && String(myBets[boxKey].roundId || '') === String(currentRoundId || '')) return;
        const amount = clampBetForUi(getBetInput(box)?.value || 0);
        if (!balanceReady) throw new Error('Bakiye doğrulanmadan bahis alınamaz.');
        if (amount > currentBalance) throw new Error('Bakiye yetersiz.');
        const autoCashEnabled = !!getAutoCashInput(box)?.checked;
        const autoCashout = autoCashEnabled ? clampAutoCashout(getAutoInput(box)?.value || 0) : 0;
        const payload = await api('/api/crash/bet', 'POST', { box, amount, autoCashout });
        syncCrashBetLimits(payload);
        if (!payload?.ok) throw new Error(friendlyCrashError({ payload }, 'Bahis alınamadı.'));
        const queued = !!(payload.queued || payload.nextRound || payload.bet?.queued || payload.bet?.queuedForNextRound);
        if (payload.roundId && !queued) currentRoundId = String(payload.roundId);
        myBets[boxKey] = normalizeServerBet({ ...(payload.bet || {}), isMine: true, box, roundId: queued ? '' : (payload.roundId || currentRoundId), queued, queuedForNextRound: queued, sourceRoundId: payload.sourceRoundId || currentRoundId || '', amount, autoCashout, autoCashoutEnabled: autoCashEnabled });
        const balance = extractBalance(payload);
        if (balance !== null) currentBalance = balance;
        try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.({ ...payload, balance: currentBalance }); } catch (_) {}
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if (!silent) showCrashNotice({ type: 'success', title: payload.queued ? 'Sonraki raund' : 'Bahis alındı', message: payload.queued ? `${formatCompactMc(amount)} sonraki raunda işlendi.` : `${formatCompactMc(amount)} tura işlendi.`, scope: `box${box}` });
        updateButtons();
    }


    async function cancelQueuedBet(box) {
        const boxKey = getBoxKey(box);
        const bet = myBets[boxKey];
        if (!isQueuedBet(bet)) return;
        const payload = await api('/api/crash/cancel-queued-bet', 'POST', { box });
        if (!payload?.ok) throw new Error(friendlyCrashError({ payload }, 'Sonraki raund katılımı iptal edilemedi. Lütfen tekrar dene.'));
        myBets[boxKey] = null;
        const balance = extractBalance(payload);
        if (balance !== null) currentBalance = balance;
        try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.({ ...payload, balance: currentBalance }); } catch (_) {}
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        showCrashNotice({ type: 'success', title: 'Katılım iptal edildi', message: `${formatCompactMc(payload.amount || bet.amount || bet.bet)} hesabına iade edildi.`, scope: `box${box}` });
        updateButtons();
    }

    function applyCrashProgressionFromPayload(payload = {}, { animate = true } = {}) {
        const progression = payload?.progression || payload?.xpResult?.progression || payload?.resultSummary?.xpResult?.progression;
        if (!progression || typeof progression !== 'object') return;
        applyCrashProgression({ progression, accountLevel: progression.accountLevel ?? progression.level, accountLevelProgressPct: progression.accountLevelProgressPct ?? progression.progressPercent }, { animate });
    }

    function showCrashResultSummary(summary, { box = 0 } = {}) {
        if (!summary || typeof summary !== 'object') return;
        const xp = summary.xpResult || null;
        const message = summary.message || 'Tur sonucu işlendi.';
        const xpText = xp?.xpAwarded > 0 ? `+${xp.xpAwarded} XP` : (xp?.reason === 'MANUAL_CASHOUT_BELOW_1_50_NO_XP' ? 'XP için minimum 1.50x gerekir' : '');
        showCrashNotice({ type: summary.type === 'loss' ? 'loss' : 'cashout', title: summary.type === 'loss' ? 'Tur sonucu' : 'Kazanç', avatar: userInfo.avatar || DEFAULT_AVATAR, selectedFrame: userInfo.selectedFrame || 0, exactFrameIndex: userInfo.exactFrameIndex ?? null, frameUrl: userInfo.frameUrl || '', activeFrameType: userInfo.activeFrameType || '', message, amount: summary.winAmount ? `+${Number(summary.winAmount).toLocaleString('tr-TR')} MC` : '', multiplier: summary.cashoutMult ? `${Number(summary.cashoutMult).toFixed(2)}x` : '', xp: xpText, scope: box ? `box${box}` : 'hud', duration: 5200 });
    }

    async function cashOut(box) {
        const boxKey = getBoxKey(box);
        const bet = myBets[boxKey];
        if (!bet || bet.cashed || bet.cashingOut) return;
        if (isQueuedBet(bet)) {
            showCrashNotice({ type: 'warning', title: 'Sonraki raund bekleniyor', message: 'Bu katılım sonraki raund için bekliyor. İstersen butona tekrar dokunup katılımı iptal edebilirsin.', scope: `box${box}` });
            return;
        }
        bet.cashingOut = true;
        myBets[boxKey] = bet;
        updateButtons();
        const requestedAtMult = sMult;
        try {
            const payload = await api('/api/crash/cashout', 'POST', {
                box,
                correlationId: `cashout:${Date.now()}:${Math.random().toString(36).slice(2)}`,
                clientClickedAt: Date.now(),
                roundId: currentRoundId || ''
            });
            if (!payload?.ok) throw new Error(friendlyCrashError({ payload }, 'Çıkış şu anda alınamadı. Lütfen tekrar dene.'));
            const serverBet = payload.bet ? normalizeServerBet({ ...payload.bet, isMine: true }) : null;
            const targetBet = serverBet || bet;
            targetBet.cashed = true;
            targetBet.cashingOut = false;
            targetBet.win = Number(payload.winAmount ?? targetBet.win ?? 0) || 0;
            targetBet.cashoutMult = Number(payload.cashoutMult ?? targetBet.cashoutMult ?? requestedAtMult) || requestedAtMult;
            myBets[boxKey] = targetBet;
            const balance = extractBalance(payload);
            if (balance !== null) currentBalance = balance;
            try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.({ ...payload, balance: currentBalance, winAmount: targetBet.win, cashoutMult: targetBet.cashoutMult }); } catch (_) {}
            if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            const xpAwarded = Number(payload.xpAwarded || payload.xpResult?.xpAwarded || 0) || 0;
            const shouldNotifyCashout = markCrashOutcomeNotice({ ...targetBet, roundId: targetBet.roundId || currentRoundId, box, xpAwarded }, box, 'cashout');
            if (shouldNotifyCashout) showCrashNotice({ type: 'cashout', title: 'Çıkış alındı', avatar: userInfo.avatar || DEFAULT_AVATAR, selectedFrame: userInfo.selectedFrame || 0, exactFrameIndex: userInfo.exactFrameIndex ?? null, frameUrl: userInfo.frameUrl || '', activeFrameType: userInfo.activeFrameType || '', message: userInfo.username || 'Sen', amount: `+${formatCompactMc(targetBet.win)}`, multiplier: `${Number(targetBet.cashoutMult || requestedAtMult).toFixed(2)}x`, xp: xpAwarded ? `+${xpAwarded} XP` : '', duration: 5200 });
            applyCrashProgressionFromPayload(payload, { animate: true });
            if (shouldNotifyCashout) playCrashSfx('win');
        } catch (error) {
            bet.cashingOut = false;
            myBets[boxKey] = bet;
            showCrashNotice({ type: 'error', title: 'Çıkış alınamadı', message: error?.message || 'Çıkış şu anda tamamlanamadı. Lütfen tekrar dene.', scope: `box${box}` });
        } finally {
            updateButtons();
        }
    }

    async function checkAutoBets() {
        if (sPhase !== 'COUNTDOWN' || !currentRoundId || !uid) return;
        for (const box of [1, 2]) {
            const boxKey = getBoxKey(box);
            const autoBet = getAutoBetInput(box);
            if (!autoBet?.checked) continue;
            if (autoBetPlacedForRound[boxKey] === currentRoundId) continue;
            if (myBets[boxKey] && String(myBets[boxKey].roundId || '') === String(currentRoundId)) continue;
            autoBetPlacedForRound[boxKey] = currentRoundId;
            placeBet(box, true).catch((error) => {
                autoBetPlacedForRound[boxKey] = null;
                showCrashNotice({ type: 'error', title: 'Otomatik bahis', message: error?.message || 'Otomatik bahis alınamadı.', scope: `box${box}` });
            });
        }
    }

    function historyMultiplier(item) {
        if (item && typeof item === 'object') return pickNumber(item.multiplier, item.currentMult, item.crashPoint) ?? 0;
        return Number(item) || 0;
    }

    function renderHistory(history = []) {
        if (!elHistory) return;
        const normalized = (Array.isArray(history) ? history : []).slice(0, 20).map(historyMultiplier).filter((value) => Number.isFinite(value) && value > 0);
        const signature = normalized.map((mult) => safeFloat(mult).toFixed(2)).join('|');
        if (signature !== lastHistoryHtml) {
            const fragment = document.createDocumentFragment();
            normalized.forEach((mult) => {
                const pill = document.createElement('span');
                pill.className = `hist-pill ${mult < 2 ? 'hist-red' : mult >= 10 ? 'hist-gold' : 'hist-green'}`;
                pill.textContent = `${safeFloat(mult).toFixed(2)}x`;
                fragment.appendChild(pill);
            });
            elHistory.replaceChildren(fragment);
            lastHistoryHtml = signature;
        }
    }

    function syncMyBetsFromActivePlayers(activePlayers = []) {
        if (!Array.isArray(activePlayers) || !uid) return;
        const seen = new Set();
        activePlayers.forEach((player) => {
            if (!player?.isMine) return;
            const box = Number(player.box || (String(player.betId || '').endsWith('_2') ? 2 : 1)) === 2 ? 2 : 1;
            const boxKey = getBoxKey(box);
            seen.add(boxKey);
            myBets[boxKey] = normalizeServerBet({ ...player, isMine: true, roundId: player.roundId || currentRoundId });
        });
        if (sPhase === 'COUNTDOWN') {
            [1, 2].forEach((box) => {
                const boxKey = getBoxKey(box);
                if (!seen.has(boxKey) && myBets[boxKey]?.roundId !== currentRoundId) myBets[boxKey] = null;
            });
        }
    }


    function syncQueuedBetsFromPayload(data = {}) {
        const queuedBets = Array.isArray(data.queuedBets) ? data.queuedBets : (Array.isArray(data.myQueuedBets) ? data.myQueuedBets : null);
        if (!queuedBets) return;
        const seen = new Set();
        queuedBets.forEach((bet) => {
            if (!bet?.isMine && bet.uid && uid && bet.uid !== uid) return;
            const box = Number(bet.box) === 2 ? 2 : 1;
            const boxKey = getBoxKey(box);
            seen.add(boxKey);
            myBets[boxKey] = normalizeServerBet({ ...bet, isMine: true, queued: true, queuedForNextRound: true, roundId: '' });
        });
        [1, 2].forEach((box) => {
            const boxKey = getBoxKey(box);
            if (!seen.has(boxKey) && isQueuedBet(myBets[boxKey])) myBets[boxKey] = null;
        });
    }

    function maybeShowOutcomeNotice(player = {}) {
        if (!player?.isMine) return;
        const box = Number(player.box) === 2 ? 2 : 1;
        const xp = player.xpResult || null;
        if (player.cashed) {
            if (!markCrashOutcomeNotice(player, box, 'cashout')) return;
            const mult = Number(player.cashoutMult || 0) || 0;
            const win = Number(player.win ?? player.winAmount ?? 0) || 0;
            const xpText = xp?.xpAwarded > 0 ? ` • +${xp.xpAwarded} XP` : (xp?.reason === 'MANUAL_CASHOUT_BELOW_1_50_NO_XP' ? ' • XP için minimum 1.50x gerekir' : '');
            showCrashNotice({ type: 'cashout', title: 'Çıkış alındı', avatar: player.avatar || userInfo.avatar || DEFAULT_AVATAR, selectedFrame: player.selectedFrame ?? player.frame ?? userInfo.selectedFrame ?? 0, exactFrameIndex: player.exactFrameIndex ?? userInfo.exactFrameIndex ?? null, frameUrl: player.frameUrl || userInfo.frameUrl || '', activeFrameType: player.activeFrameType || userInfo.activeFrameType || '', message: player.isMine ? (userInfo.username || 'Sen') : (player.username || 'Oyuncu'), amount: `+${formatCompactMc(win)}`, multiplier: `${mult.toFixed(2)}x`, xp: xp?.xpAwarded > 0 ? `+${xp.xpAwarded} XP` : '', duration: 5600 });
            if (xp?.progression) applyCrashProgressionFromPayload({ xpResult: xp }, { animate: true });
            return;
        }
        if (player.lost) {
            if (!markCrashOutcomeNotice(player, box, 'loss')) return;
            const xpText = xp?.xpAwarded > 0 ? ` +${xp.xpAwarded} XP işlendi.` : ' XP oluşmadı.';
            showCrashNotice({ type: 'loss', title: 'Tur patladı', message: `Bahis kaybedildi.${xpText}`, duration: 5600 });
            if (xp?.progression) applyCrashProgressionFromPayload({ xpResult: xp }, { animate: true });
        }
    }

    function renderLiveTable(activePlayers = []) {
        if (!elLiveTableBody) return;
        const rows = (Array.isArray(activePlayers) ? activePlayers : [])
            .filter((player) => Number(player?.bet ?? player?.amount ?? 0) > 0)
            .slice()
            .sort((a, b) => {
                const rank = (p) => p?.cashed ? 3 : p?.lost ? 1 : 2;
                return (rank(b) - rank(a)) || (Number(b.win || b.winAmount || 0) - Number(a.win || a.winAmount || 0)) || (Number(b.bet || b.amount || 0) - Number(a.bet || a.amount || 0));
            })
            .slice(0, 80);
        const signature = JSON.stringify(rows.map((p) => [p.playerKey, p.isMine, p.username, p.bet ?? p.amount, p.cashed, p.cashoutMult, p.win ?? p.winAmount]));
        if (signature === lastRenderedTableData) return;
        lastRenderedTableData = signature;
        setIconCounter(elLiveBetCount, `${rows.length} bahis`);
        setIconCounter(elLiveCashoutCount, `${rows.filter((p) => p.cashed).length} çekim • ${rows.filter((p) => p.lost).length} patladı`);
        const fragment = document.createDocumentFragment();
        const makeCell = (className, text) => {
            const node = document.createElement('div');
            node.className = className;
            node.textContent = text;
            return node;
        };
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'table-row';
            const user = document.createElement('div');
            user.className = 't-user';
            const meta = document.createElement('div');
            meta.className = 't-meta';
            meta.append(makeCell('t-name', 'Tur katılımcıları bekleniyor'), makeCell('t-tier', 'Bahis giren oyuncular burada görünür'));  
            user.appendChild(meta);
            empty.append(user, makeCell('t-bet', '-'), makeCell('t-mult', '-'), makeCell('t-win', '-'));
            fragment.appendChild(empty);
        } else {
            rows.forEach((player) => {
                const amount = Number(player.bet ?? player.amount ?? 0) || 0;
                const mult = Number(player.cashoutMult || 0) || 0;
                const win = Number(player.win ?? player.winAmount ?? 0) || 0;
                const name = player.isMine ? (userInfo.username || 'Sen') : (player.username || 'Oyuncu');
                const row = document.createElement('div');
                row.className = `table-row ${player.cashed ? 'row-cashed' : player.lost ? 'row-lost' : 'row-active'}`.trim();
                const user = document.createElement('div');
                user.className = 't-user';
                const meta = document.createElement('div');
                meta.className = 't-meta';
                meta.append(makeCell('t-name', name), makeCell('t-tier', player.cashed ? 'ÇEKİM ALDI' : player.lost ? 'PATLADI' : (player.isMine ? 'SEN • UÇUŞTA' : 'OYUNCU • UÇUŞTA')));
                user.append(createCrashAvatarNode(player, player.avatar || DEFAULT_AVATAR), meta);
                row.append(
                    user,
                    makeCell('t-bet', formatCompactMc(amount)),
                    makeCell('t-mult', mult > 0 ? `${safeFloat(mult).toFixed(2)}x` : (player.lost ? 'PATLADI' : 'UÇUŞTA')),
                    makeCell('t-win', win > 0 ? '+' + formatCompactMc(win) : (player.lost ? 'KAYIP' : 'BEKLİYOR'))
                );
                fragment.appendChild(row);
            });
        }
        elLiveTableBody.replaceChildren(fragment);
    }

    function updateHud() {
        const phaseMap = { COUNTDOWN: 'GERİ SAYIM', FLYING: 'UÇUŞTA', CRASHED: 'PATLADI' };
        const phaseText = phaseMap[sPhase] || 'BAĞLANILIYOR';
        if (elUiPhase) elUiPhase.textContent = phaseText;
        if (elHudPhase) elHudPhase.textContent = phaseText;
        if (elUiMultiplier) {
            elUiMultiplier.classList.toggle('val-flying', sPhase === 'FLYING');
            elUiMultiplier.classList.toggle('val-crashed', sPhase === 'CRASHED');
            elUiMultiplier.classList.toggle('val-countdown', sPhase === 'COUNTDOWN');
        }
        if (sPhase === 'COUNTDOWN') {
            const remaining = Math.max(0, Math.ceil((crashCountdownEnd - nowServer()) / 1000));
            const text = remaining > 0 ? `${remaining}` : '0';
            if (text !== lastDisplayedCountdownStr) {
                if (elUiMultiplier) elUiMultiplier.textContent = text;
                lastDisplayedCountdownStr = text;
                lastDisplayedMultStr = '';
            }
        } else {
            const text = `${safeFloat(sMult).toFixed(2)}x`;
            if (text !== lastDisplayedMultStr) {
                if (elUiMultiplier) elUiMultiplier.textContent = text;
                lastDisplayedMultStr = text;
                lastDisplayedCountdownStr = '';
            }
        }
        const speedPct = Math.max(0, Math.min(100, Math.round((Math.max(1, Number(sMult) || 1) - 1) * 18)));
        if (speedPct !== lastSpeedPct) {
            if (elHudSpeed) elHudSpeed.textContent = `${speedPct}%`;
            if (elBgSpeedLayer) elBgSpeedLayer.style.opacity = String(Math.min(0.85, speedPct / 100));
            lastSpeedPct = speedPct;
        }
        updateButtons();
    }

    function drawCrashCanvas() {
        if (!elCrashCanvas) return;
        const rect = elCrashCanvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (elCrashCanvas.width !== width || elCrashCanvas.height !== height) {
            elCrashCanvas.width = width;
            elCrashCanvas.height = height;
        }
        const ctx = elCrashCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.scale(dpr, dpr);
        const w = rect.width;
        const h = rect.height;
        const t = performance.now() / 1000;
        const mult = Math.max(1, Number(sMult) || 1);
        const speed = Math.min(3.2, 0.55 + Math.log(mult) * 0.55);
        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#020616');
        bg.addColorStop(0.45, '#061735');
        bg.addColorStop(1, '#130322');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        const nebula = ctx.createRadialGradient(w * 0.72, h * 0.18, 10, w * 0.72, h * 0.18, Math.max(w, h) * 0.72);
        nebula.addColorStop(0, 'rgba(34,211,238,.22)');
        nebula.addColorStop(0.45, 'rgba(168,85,247,.10)');
        nebula.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, w, h);

        const starCount = Math.max(42, Math.min(94, Math.floor(w * h / 5200)));
        for (let i = 0; i < starCount; i += 1) {
            const seed = (i * 9301 + 49297) % 233280;
            const x = ((seed / 233280) * w - (t * speed * (6 + (i % 5) * 2))) % (w + 24);
            const px = x < -12 ? x + w + 24 : x;
            const y = (((seed * 17) % 233280) / 233280) * h;
            const r = 0.65 + (i % 4) * 0.22;
            ctx.globalAlpha = 0.28 + (i % 7) * 0.07;
            ctx.fillStyle = i % 9 === 0 ? 'rgba(125,249,255,.95)' : 'rgba(255,255,255,.9)';
            ctx.beginPath();
            ctx.arc(px, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        for (let i = 0; i < 4; i += 1) {
            const x = (w + 80 - ((t * (24 + i * 7) * speed + i * 190) % (w + 180)));
            const y = h * (0.16 + i * 0.14) + Math.sin(t * 0.8 + i) * 5;
            ctx.save();
            ctx.globalAlpha = 0.18 + i * 0.035;
            ctx.translate(x, y);
            ctx.fillStyle = 'rgba(160,220,255,.72)';
            ctx.beginPath();
            ctx.ellipse(0, 0, 22 - i * 2, 5, -0.08, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(44,255,210,.8)';
            ctx.fillRect(-4, -2, 12, 4);
            ctx.restore();
        }

        const climb = sPhase === 'COUNTDOWN' ? 0 : Math.max(0.02, Math.min(1, Math.log(mult) / Math.log(150)));
        const startX = w * 0.10;
        const startY = h * 0.78;
        const targetX = w * 0.86;
        const targetY = h * 0.20;
        const ease = 1 - Math.pow(1 - climb, 2.15);
        let planeX = startX + (targetX - startX) * ease;
        let planeY = startY + (targetY - startY) * Math.pow(ease, 0.78);
        if (climb > 0.92) planeY += Math.sin(t * 2.4) * 4;

        ctx.strokeStyle = sPhase === 'CRASHED' ? 'rgba(255,84,84,.92)' : 'rgba(251,191,36,.86)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = sPhase === 'CRASHED' ? 'rgba(255,84,84,.65)' : 'rgba(251,191,36,.45)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(w * 0.28, h * 0.70, w * 0.52, h * 0.34, planeX, planeY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.translate(planeX, planeY);
        ctx.rotate(-0.42 + Math.min(0.18, Math.log(mult) * 0.015));
        const scale = Math.max(0.78, Math.min(1.08, w / 720));
        ctx.scale(scale, scale);
        const flame = 20 + Math.min(28, Math.log(mult) * 10);
        const flameGrad = ctx.createLinearGradient(-48 - flame, 0, -18, 0);
        flameGrad.addColorStop(0, 'rgba(255,70,70,0)');
        flameGrad.addColorStop(0.35, 'rgba(255,122,24,.72)');
        flameGrad.addColorStop(1, 'rgba(255,238,132,.92)');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.moveTo(-26, -8);
        ctx.lineTo(-48 - flame, 0);
        ctx.lineTo(-26, 8);
        ctx.closePath();
        ctx.fill();
        const bodyGrad = ctx.createLinearGradient(-32, -16, 42, 14);
        bodyGrad.addColorStop(0, '#dbeafe');
        bodyGrad.addColorStop(0.45, '#38bdf8');
        bodyGrad.addColorStop(1, '#f8fafc');
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(44, 0);
        ctx.quadraticCurveTo(16, -18, -36, -10);
        ctx.quadraticCurveTo(-24, 0, -36, 10);
        ctx.quadraticCurveTo(16, 18, 44, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(6,12,24,.78)';
        ctx.beginPath();
        ctx.ellipse(10, -4, 14, 6, -0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#93c5fd';
        ctx.beginPath();
        ctx.moveTo(-2, 8);
        ctx.lineTo(-22, 30);
        ctx.lineTo(20, 10);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-4, -8);
        ctx.lineTo(-26, -30);
        ctx.lineTo(16, -10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.moveTo(-30, -9);
        ctx.lineTo(-48, -23);
        ctx.lineTo(-38, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(38, Math.min(74, w * 0.13))}px Inter, system-ui, sans-serif`;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,.52)';
        ctx.fillStyle = sPhase === 'CRASHED' ? '#ff6767' : '#fbbf24';
        ctx.shadowColor = sPhase === 'CRASHED' ? 'rgba(255,78,78,.55)' : 'rgba(251,191,36,.55)';
        ctx.shadowBlur = 24;
        const label = sPhase === 'COUNTDOWN' ? `${Math.max(0, Math.ceil((crashCountdownEnd - nowServer()) / 1000))}` : `${mult.toFixed(2)}x`;
        ctx.strokeText(label, w * 0.50, h * 0.48);
        ctx.fillText(label, w * 0.50, h * 0.48);
        ctx.restore();
        ctx.restore();
    }

    function startCanvasLoop() {
        if (canvasLoopActive) return;
        canvasLoopActive = true;
        const loop = () => {
            if (!canvasLoopActive) return;
            if (document.visibilityState === 'visible') drawCrashCanvas();
            canvasFrameId = window.requestAnimationFrame(loop);
        };
        canvasFrameId = window.requestAnimationFrame(loop);
    }

    function stopCanvasLoop() {
        canvasLoopActive = false;
        if (canvasFrameId) {
            window.cancelAnimationFrame(canvasFrameId);
            canvasFrameId = 0;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startCanvasLoop();
            drawCrashCanvas();
        }
    });

    startCanvasLoop();

    function handleRoundBoundary(nextRoundId) {
        const next = String(nextRoundId || '');
        if (!next || next === String(currentRoundId || '')) return;
        previousRoundId = currentRoundId;
        currentRoundId = next;
        cleanupCrashOutcomeNotices(false);
        myBets = { box1: null, box2: null };
        autoBetPlacedForRound = { box1: null, box2: null };
    }

    function getActivePlayersFromPayload(data = {}) {
        if (Array.isArray(data.activePlayers)) return data.activePlayers;
        if (Array.isArray(data.activeBets)) return data.activeBets;
        return [];
    }

    function handleServerData(data = {}) {
        if (Number.isFinite(Number(data.serverNow))) serverTimeOffsetMs = Number(data.serverNow) - Date.now();
        if (data.roundId) handleRoundBoundary(data.roundId);
        if (data.phase) {
            const oldPhase = sPhase;
            sPhase = String(data.phase || '').toUpperCase();
            if (oldPhase !== sPhase) {
                if (sPhase === 'FLYING') playCrashSfx('launch');
                if (sPhase === 'CRASHED') playCrashSfx('crash');
            }
        }
        const mult = getServerMultiplier(data);
        if (Number.isFinite(mult)) sMult = safeFloat(mult);
        const countdownUntil = getServerCountdownUntil(data);
        if (Number.isFinite(countdownUntil)) {
            localStartTime = Number(countdownUntil);
            if (sPhase === 'COUNTDOWN') crashCountdownEnd = Number(countdownUntil);
        }
        if (Array.isArray(data.history)) renderHistory(data.history);
        const activePlayers = getActivePlayersFromPayload(data);
        if (activePlayers.length || Array.isArray(data.activePlayers) || Array.isArray(data.activeBets)) {
            syncMyBetsFromActivePlayers(activePlayers);
            activePlayers.forEach(maybeShowOutcomeNotice);
            renderLiveTable(activePlayers);
        }
        syncQueuedBetsFromPayload(data);
        updateButtons();
        updateHud();
        if (sPhase === 'COUNTDOWN') checkAutoBets();
    }

    function handleTick(data = {}) {
        if (Number.isFinite(Number(data.serverNow))) serverTimeOffsetMs = Number(data.serverNow) - Date.now();
        if (data.roundId) handleRoundBoundary(data.roundId);
        if (data.phase) sPhase = String(data.phase || '').toUpperCase();
        const mult = getServerMultiplier(data);
        if (Number.isFinite(mult)) {
            sMult = safeFloat(mult);
            lastServerMult = sMult;
            lastServerMultAt = Date.now();
            lastServerTickAt = Number(data.serverNow || nowServer());
        }
        const countdownUntil = getServerCountdownUntil(data);
        if (Number.isFinite(countdownUntil)) {
            localStartTime = Number(countdownUntil);
            if (sPhase === 'COUNTDOWN') crashCountdownEnd = Number(countdownUntil);
        }
        updateHud();
        if (sPhase === 'COUNTDOWN') checkAutoBets();
    }

    
    
    
    
    function pmRtToast(title = '', message = '', tone = 'info') {
        const text = `${message || ''}`.trim();
        if (title || text) showCrashNotice({ type: tone === 'error' ? 'error' : tone === 'success' ? 'success' : 'info', title, message: text, scope: 'hud', duration: 4600 });
        return { tone };
    }


    function updateBal() {
        return fetchBootProfile().catch(() => {
            balanceReady = false;
            updateButtons();
            return null;
        });
    }

    function startBalanceRefreshLoop() {
        if (balanceRefreshTimer) return;
        balanceRefreshTimer = setInterval(() => {
            if (document.visibilityState === 'visible' && auth.currentUser) updateBal();
        }, 12000);
    }


function scheduleCrashReconnect(delayMs = 1200) {
    clearTimeout(crashReconnectTimer);
    crashReconnectTimer = setTimeout(() => {
        connectStream().catch(() => null);
    }, delayMs);
}

function clearCrashConnectionNotice() {
    crashConnectionNoticeFailures = 0;
    clearTimeout(crashConnectionNoticeTimer);
    crashConnectionNoticeTimer = null;
}

function scheduleCrashConnectionNotice(message = '', tone = 'warning') {
    crashConnectionNoticeFailures += 1;
    const failureCount = crashConnectionNoticeFailures;
    clearTimeout(crashConnectionNoticeTimer);
    crashConnectionNoticeTimer = setTimeout(() => {
        if (crashStreamReady || failureCount < 2) return;
        renderCrashRuntimeNotice(message, tone, 'Tekrar Dene', () => connectStream().catch(() => null));
    }, 4200);
}

async function connectStream() {
    if (crashConnectPromise) return crashConnectPromise;
    crashConnectPromise = (async () => {
        if (socket && socket.connected) {
            try { socket.emit('crash:subscribe'); } catch (_) {}
            return socket;
        }
        socket = await core.createAuthedSocket(socket, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 8, timeout: 6000 });

        if (!socket.__pmCrashStreamBound) {
            socket.__pmCrashStreamBound = true;
            socket.on('crash:update', (d) => {
                crashStreamReady = true;
                clearCrashConnectionNotice();
                renderCrashRuntimeNotice('');
                if (d.type === 'TICK') handleTick(d); else handleServerData(d);
            });

            socket.on('connect', () => {
                crashStreamReady = true;
                clearCrashConnectionNotice();
                try { socket.emit('crash:subscribe'); } catch (_) {}
                renderCrashRuntimeNotice('');
            });

            socket.on('connect_error', () => {
                crashStreamReady = false;
                scheduleCrashConnectionNotice('Canlı akış şu an yenileniyor. Bağlantı kurulunca oyun otomatik devam edecek.', 'warning');
            });

            socket.on('disconnect', () => {
                crashStreamReady = false;
                scheduleCrashConnectionNotice('Canlı akış kısa süreliğine durdu. Oyun bağlantısı otomatik yenileniyor.', 'warning');
            });
        }

        try { socket.emit('crash:subscribe'); } catch (_) {}
        return socket;
    })().finally(() => {
        crashConnectPromise = null;
    });

    return crashConnectPromise;
}

let crashUiStarted = false;

async function startApp(skipConnect = false) {
    if (!auth.currentUser) throw new Error('NO_USER');
    uid = auth.currentUser.uid;
    startBalanceRefreshLoop();
    updateBal();
    if (!crashUiStarted) {
        bindQuickButtons();
        syncBetButtonAmounts();
        setupAutoModeBindings();
        crashUiStarted = true;
    }
    updateAutoCashoutInputStates();
    await restoreActiveBets().catch(() => null);
    updateHud();
    if (!skipConnect) {
        scheduleCrashReconnect(100);
    }
}

async function api(endpoint, method='GET', body=null, attempt = 0) {
    try {
        return await core.requestWithAuth(endpoint, { method, body, timeoutMs: 8000, retries: attempt === 0 ? 1 : 0 });
    } catch (error) {
        const code = String(error?.payload?.error || error?.error || error?.message || '').toUpperCase();
        if (Number(error?.status || 0) === 503 || code === 'GAME_MAINTENANCE' || code === 'SYSTEM_MAINTENANCE') {
            window.location.replace('/?pm_maintenance=crash');
            return new Promise(() => {});
        }
        throw error;
    }
}


async function pmRtLoadSocketScript() {
    await ensureSocketClientReady();
    return window.io;
}

async function pmRtBindSocketEvents(sock) {
    if (!sock || sock.__pmRealtimeBound) return sock;
    sock.__pmRealtimeBound = true;
    pmRealtimeSocket = sock;
    sock.on('connect_error', (error) => {
        if (error?.message === 'xhr poll error') return;
        clearTimeout(pmRealtimeReconnectNoticeTimer);
        pmRealtimeReconnectNoticeTimer = setTimeout(() => {
            if (sock.connected) return;
            pmRtToast('Canlı bağlantı', 'Oyun bağlantısı geçici olarak yeniden bağlanıyor.', 'info', { iconClass: 'fa-wifi', duration: 2600 });
        }, 4200);
    });
    sock.on('connect', () => {
        clearTimeout(pmRealtimeReconnectNoticeTimer);
        try { sock.emit('presence:update', { status: 'IN_GAME', activity: 'Crash Oynuyor' }); } catch (_) {}
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
        await pmRtLoadSocketScript();
        const sock = await core.createAuthedSocket(null, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 8,
            timeout: 6000,
            extraOptions: { reconnectionDelay: 1000, reconnectionDelayMax: 5000 }
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
    if (balanceRefreshTimer) { clearInterval(balanceRefreshTimer); balanceRefreshTimer = null; }
    if (socket) { try { socket.emit('crash:unsubscribe'); } catch (_) {} }
    if (pmRealtimeSocket) {
        try { pmRealtimeSocket.close(); } catch (_) {}
    }
    pmRealtimeSocket = null;
    pmRealtimeBootPromise = null;
}

window.addEventListener('beforeunload', () => {
    stopCanvasLoop();
    if (balanceRefreshTimer) { clearInterval(balanceRefreshTimer); balanceRefreshTimer = null; }
    if (socket) { try { socket.emit('crash:unsubscribe'); } catch (_) {} }
    if (pmRealtimeSocket) {
        try { pmRealtimeSocket.close(); } catch (_) {}
    }
});


onAuthStateChanged(u => {
    if(!u) {
        disposePlayMatrixRealtime();
        bootCompleted = false;
        setBootProgress(10);
        setBootStatus('Oturum doğrulanıyor...');
        setBootActions({ showEnter: false, showRetry: false });
        return;
    }
    initPlayMatrixRealtime().catch(() => null);
    if (!bootCompleted && !bootPromise) bootCrashApp(false).catch(() => null);
});

window.addEventListener('load', () => {
    setBootProgress(4);
    setBootStatus('Kaynaklar hazırlanıyor...');
    setBootActions({ showEnter: false, showRetry: false });
    setTimeout(() => { if (!bootCompleted && !bootPromise) bootCrashApp(false).catch(() => null); }, 150);
});
