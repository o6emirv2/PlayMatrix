/* PlayMatrix FAZ 3: Crash application module extracted from HTML shell. */
    import { initPlayMatrixOnlineCore } from "../../../pm-online-core.js";

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
    function clampBetAmount(value) { return Math.max(1, safeFloat(value)); }
    function parseAutoCashoutValue(value) {
        const normalized = String(value ?? '').trim().replace(',', '.');
        if (!normalized) return NaN;
        const numeric = Number(normalized);
        return Number.isFinite(numeric) ? numeric : NaN;
    }
    function clampAutoCashout(value) {
        const parsed = parseAutoCashoutValue(value);
        if (!Number.isFinite(parsed)) return 0;
        return safeFloat(Math.min(100, Math.max(0, parsed)));
    }
    function formatAutoCashoutInput(value) {
        const parsed = parseAutoCashoutValue(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return '';
        return clampAutoCashout(parsed).toFixed(2);
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

    function getCrashFrameIndex(player) {
        const explicit = resolveFrameIndex(player?.selectedFrame ?? player?.frame ?? 0);
        return explicit > 0 ? explicit : 0;
    }

    function renderCrashAvatar(player, avatarUrl) {
        const frameIndex = getCrashFrameIndex(player);
        const avatarHtml = window.PMAvatar && typeof window.PMAvatar.buildHTML === 'function'
          ? window.PMAvatar.buildHTML({
              avatarUrl: avatarUrl || DEFAULT_AVATAR,
              level: player?.selectedFrame ?? player?.frame ?? 0,
              sizePx: 40,
              extraClass: 't-avatar-core',
              imageClass: 't-avatar',
              wrapperClass: 'pm-avatar',
              alt: 'avatar'
            })
          : (() => {
              const frameHtml = frameIndex > 0
                ? `<img src="/Cerceve/frame-${frameIndex}.png" class="t-frame frame-${frameIndex}" alt="" aria-hidden="true" data-fallback="/Çerçeve/frame-${frameIndex}.png">`
                : '';
              return `<img src="${escapeHTML(avatarUrl || DEFAULT_AVATAR)}" class="t-avatar" alt="avatar">${frameHtml}`;
            })();
        return `<div class="t-avatar-wrap${frameIndex > 0 ? ' has-frame' : ''}">${avatarHtml}</div>`;
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
                betInput.value = clampBetAmount(String(betInput.value).replace(',', '.'));
                updateBetButtonLabel(box);
            };
            betInput.addEventListener('change', normalizeBet);
            betInput.addEventListener('blur', normalizeBet);
        }
        syncAutoMode(box, autoBet ? autoBet.checked : false);
    });
    updateAutoCashoutInputStates();
}

window.showInlineError = (message) => {
        const el = document.getElementById("inlineNotificationArea");
        if (!el) return;
        el.replaceChildren();
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-circle-info';
        const text = document.createTextNode(` Bilgi: ${String(message || '')}`);
        el.append(icon, text);
        el.classList.add("show");
        if(window.errorTimeout) clearTimeout(window.errorTimeout);
        window.errorTimeout = setTimeout(() => { el.classList.remove("show"); }, 3500);
    };

    window.showWinStrip = (avatar, user, mult, amt) => {
        elWsAvatar.src = avatar || DEFAULT_AVATAR;
        elWsUser.innerText = user || 'Oyuncu';
        elWsMult.innerText = safeFloat(mult).toFixed(2) + 'x';
        elWsAmt.innerText = '+' + safeFloat(amt).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' MC';
        const el = elWinStrip;
        el.classList.add("show");
        if(window.winStripTimeout) clearTimeout(window.winStripTimeout);
        window.winStripTimeout = setTimeout(() => { el.classList.remove("show"); }, 3500);
    };

    window.openRulesModal = () => {
        const m = elRulesModal;
        m.style.display = 'flex'; setTimeout(() => m.classList.add('show'), 10);
    };
    window.closeRulesModal = () => {
        const m = elRulesModal;
        m.classList.remove('show'); setTimeout(() => m.style.display = 'none', 300);
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
    const elStudioIntro = document.getElementById('studioIntro');
    const elLoaderFill = document.getElementById('loaderFill');
    const elRulesModal = document.getElementById('rulesModal');
    const elUiPhase = document.getElementById('uiPhase');
    const elLiveBetCount = document.getElementById('liveBetCount');
    const elLiveCashoutCount = document.getElementById('liveCashoutCount');
    const elUiAccountLevelBar = document.getElementById('uiAccountLevelBar');
    const elUiAccountLevelPct = document.getElementById('uiAccountLevelPct');
    const elUiAccountLevelBadge = document.getElementById('uiAccountLevelBadge');
    const elWsAvatar = document.getElementById('wsAvatar');
    const elWsUser = document.getElementById('wsUser');
    const elWsMult = document.getElementById('wsMult');
    const elWsAmt = document.getElementById('wsAmt');
    const elWinStrip = document.getElementById('winStrip');
    const elCrashRuntimeNotice = document.getElementById('crashRuntimeNotice');
    let bootPromise = null;
    let bootCompleted = false;
    let bootActionMode = 'retry';

    function renderCrashRuntimeNotice(message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
        if (!elCrashRuntimeNotice) return;
        const text = String(message || '').trim();
        if (!text) { elCrashRuntimeNotice.className = 'crash-runtime-notice'; elCrashRuntimeNotice.replaceChildren(); return; }
        elCrashRuntimeNotice.className = `crash-runtime-notice show ${tone === 'error' ? 'is-error' : tone === 'warning' ? 'is-warning' : ''}`.trim();
        elCrashRuntimeNotice.replaceChildren();
        const noticeText = document.createElement('div');
        noticeText.className = 'crash-runtime-notice__text';
        noticeText.textContent = text;
        elCrashRuntimeNotice.appendChild(noticeText);
        if (actionLabel && typeof actionHandler === 'function') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'crash-runtime-notice__action';
            btn.textContent = actionLabel;
            btn.addEventListener('click', actionHandler);
            elCrashRuntimeNotice.appendChild(btn);
        }
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

    async function fetchBootProfile() {
        const d = await api('/api/me');
        if (!d?.ok) throw new Error(d?.error || 'PROFILE_LOAD_FAILED');
        currentBalance = safeFloat(d.balance);
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if(d.user) {
            userInfo.avatar = d.user.avatar || '';
            userInfo.username = d.user.username || 'Sen';
            const accountLevel = getPlayerAccountLevel(d.user);
            const accountProgress = getPlayerAccountProgressPct(d.user);
            if (elUiAccountLevelBar) elUiAccountLevelBar.style.width = accountProgress + '%';
            if (elUiAccountLevelPct) elUiAccountLevelPct.innerText = `${accountProgress.toFixed(1)}%`;
            if (elUiAccountLevelBadge) elUiAccountLevelBadge.innerText = accountLevel;
            const badgeWrap = document.querySelector('.level-badge-wrap');
            if (badgeWrap) badgeWrap.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
            const statFill = document.querySelector('.stat-bar-fill');
            if (statFill) statFill.style.background = '';
        }
        return d;
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
            await withTimeout(fetchBootProfile(), 7000, 'PROFILE_TIMEOUT');
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
            if (code === 'AUTH_TIMEOUT' || code === 'NO_USER') {
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
    let userInfo = { avatar: '', username: 'Sen' };
    let lastServerMult = 1.00;
    let lastServerMultAt = 0;
    let lastServerTickAt = 0;

    const elUiMultiplier = document.getElementById('uiMultiplier');
    const elLiveTableBody = document.getElementById('liveTableBody');
    const elHistory = document.getElementById('uiHistory');
    const elHudSpeed = document.getElementById('hudSpeed');
    const elBgSpeedLayer = document.getElementById('bgSpeedLayer');
    const elHudPhase = document.getElementById('hudPhase');
    const elUiBalance = document.getElementById('uiBalance');

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

    function updateBal() {
    fetchBootProfile().catch(() => {});
}

function scheduleCrashReconnect(delayMs = 1200) {
    clearTimeout(crashReconnectTimer);
    crashReconnectTimer = setTimeout(() => {
        connectStream().catch(() => null);
    }, delayMs);
}

async function connectStream() {
    if (crashConnectPromise) return crashConnectPromise;
    crashConnectPromise = (async () => {
        socket = await core.createAuthedSocket(socket, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 8, timeout: 6000 });

        socket.on('crash:update', (d) => {
            crashStreamReady = true;
            renderCrashRuntimeNotice('');
            if (d.type === 'TICK') handleTick(d); else handleServerData(d);
        });

        socket.on('connect', () => {
            crashStreamReady = true;
            renderCrashRuntimeNotice('');
        });

        socket.on('connect_error', () => {
            crashStreamReady = false;
            renderCrashRuntimeNotice('Canlı akış şu an kurulamıyor. Ekran açık kalacak; arka planda tekrar denenecek.', 'warning', 'Tekrar Dene', () => connectStream().catch(() => null));
            scheduleCrashReconnect(1200);
        });

        socket.on('disconnect', () => {
            crashStreamReady = false;
            renderCrashRuntimeNotice('Canlı akış bağlantısı geçici olarak koptu. Arka planda yeniden bağlanılıyor.', 'warning', 'Tekrar Dene', () => connectStream().catch(() => null));
            scheduleCrashReconnect(1000);
        });

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
    updateBal();
    if (!crashUiStarted) {
        bindQuickButtons();
        syncBetButtonAmounts();
        setupAutoModeBindings();
        crashUiStarted = true;
    }
    updateAutoCashoutInputStates();
    updateHud();
    if (!skipConnect) {
        scheduleCrashReconnect(100);
    }
}

async function api(endpoint, method='GET', body=null, attempt = 0) {
    return core.requestWithAuth(endpoint, { method, body, timeoutMs: 8000, retries: attempt === 0 ? 1 : 0 });
}


async function pmRtLoadSocketScript() {
    await ensureSocketClientReady();
    return window.io;
}

async function pmRtRequest(endpoint, method = 'GET', body = null) {
    let payload = null;

    if (typeof api === 'function') {
        payload = await api(endpoint, method, body);
    } else {
        throw new Error('REQUEST_HELPER_UNAVAILABLE');
    }

    if (payload?.ok === false) {
        const error = new Error(payload?.error || 'İstek işlenemedi.');
        error.code = payload?.code || 'REQUEST_FAILED';
        throw error;
    }

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
                ? 'Şu an otomatik çıkış tanımı olmayan aktif bir Crash turun var. Davete geçersen tur arka planda devam eder ve sonuç riski sana ait olur. Yine de devam etmek istiyor musun?'
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
    return true;
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

function pmRtEmitCrashBetPresence(amount) {
    if (typeof pmRealtimeSocket !== 'undefined' && pmRealtimeSocket && pmRealtimeSocket.connected) {
        pmRealtimeSocket.emit('social:set_presence', {
            status: 'IN_GAME',
            activity: `Crash Oynuyor (${Number(amount || 0).toLocaleString('tr-TR')} MC)`
        });
    }
}

async function pmRtHandleInviteAcceptedRedirect(payload) {
    try {
        const gameKey = pmRtNormalizeGameKey(payload?.gameKey);
        const roomId = String(payload?.roomId || '').trim();
        if (!gameKey || !roomId) return;
        if (payload?.hostUid && auth.currentUser?.uid && String(payload.hostUid) !== String(auth.currentUser.uid)) return;
        await pmRtBeforeRedirect();
        pmRtSetPendingJoin(gameKey, roomId);
        pmRtToast('Oyuna geçiliyor', `${payload?.guestName || 'Arkadaşın'} ile satranç masasına bağlanıyorsun.`, 'success', { iconClass: 'fa-arrow-right' });
        window.setTimeout(() => window.location.replace(pmRtGameHref(gameKey, roomId)), 220);
    } catch (error) {
        pmRtToast('Davet yönlendirme hatası', error?.message || 'Oyun odası açılamadı.', 'error');
    }
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

    sock.on('game:invite_success', (payload) => {
        pmRtHandleInviteAcceptedRedirect(payload).catch(() => null);
    });

    sock.on('game:invite_response', (payload) => {
        const accepted = payload?.response === 'accepted';
        const guestName = payload?.guestName || 'Arkadaşın';
        pmRtToast(
            accepted ? 'Davet kabul edildi' : 'Davet reddedildi',
            accepted ? `${guestName} daveti kabul etti.` : `${guestName} daveti şu an kabul etmedi.`,
            accepted ? 'success' : 'info',
            { iconClass: accepted ? 'fa-circle-check' : 'fa-circle-minus' }
        );
        if (accepted) pmRtHandleInviteAcceptedRedirect(payload).catch(() => null);
    });

    sock.on('connect_error', (error) => {
        if (error?.message === 'xhr poll error') return;
        pmRtToast('Canlı bağlantı', 'Bildirim hattı geçici olarak yeniden bağlanıyor.', 'info', { iconClass: 'fa-wifi', duration: 2600 });
    });

    const setMyPresence = () => {
        sock.emit('social:set_presence', { status: 'IN_GAME', activity: 'Crash Oynuyor' });
    };

    if (sock.connected) {
        setMyPresence();
    }
    sock.on('connect', setMyPresence);

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


onAuthStateChanged(auth, u => {
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
