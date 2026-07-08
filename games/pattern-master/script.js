(() => {
  const gameKey = "pattern-master";
  let runId = '';
  let runToken = '';
  let startedAt = 0;
  let startPromise = null;
  let eventTimeline = [];
  function recordEvent(type, detail = {}) {
    const at = Math.max(0, Date.now() - (startedAt || Date.now()));
    const safeDetail = detail && typeof detail === 'object' ? detail : { value: detail };
    eventTimeline.push({ t: at, type: String(type || 'event').slice(0, 48), ...safeDetail });
    if (eventTimeline.length > 600) eventTimeline = eventTimeline.slice(-600);
  }
  const apiBase = () => String(window.__PM_API__?.getApiBaseSync?.() || window.__PLAYMATRIX_API_URL__ || window.location.origin || '').replace(/\/+$/, '').replace(/\/api$/i, '');
  async function authToken() {
    try { if (window.__PM_RUNTIME?.getIdToken) return await window.__PM_RUNTIME.getIdToken(false); } catch (_) {}
    try { if (window.__PM_RUNTIME?.auth?.currentUser?.getIdToken) return await window.__PM_RUNTIME.auth.currentUser.getIdToken(false); } catch (_) {}
    return '';
  }
  function userClassicMessage(error, fallback = 'Oyun oturumu şu anda başlatılamadı. Lütfen tekrar dene.') {
    const raw = String(error?.payload?.message || error?.payload?.error || error?.message || error || '').trim();
    if (/auth_required|auth_invalid|no_user|401|403|oturum bulunamadı|giriş/i.test(raw)) return 'Devam etmek için giriş yapman gerekiyor.';
    if (/load failed|failed to fetch|network|timeout|zaman aşımı|request_timeout/i.test(raw)) return 'Bağlantı kurulamadı. Lütfen internet bağlantını kontrol edip tekrar dene.';
    if (/run_not_found|run_token|classic_run/i.test(raw)) return 'Oyun oturumu doğrulanamadı. Lütfen oyunu yeniden başlat.';
    return fallback;
  }
  async function requestGame(path, body = null) {
    if (window.__PM_ONLINE_CORE__?.requestWithAuth) {
      return window.__PM_ONLINE_CORE__.requestWithAuth(path, { method: body == null ? 'GET' : 'POST', body, timeoutMs: 9000, retries: 1, allowSessionFallback: true });
    }
    if (window.__PM_ONLINE_CORE__?.waitForAuthReady) await window.__PM_ONLINE_CORE__.waitForAuthReady(7000).catch(() => null);
    if (window.__PM_API__?.ensureApiBase) await window.__PM_API__.ensureApiBase().catch(() => null);
    const headers = { Accept: 'application/json', 'x-playmatrix-client': 'web' };
    const bearer = await authToken();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body != null) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${apiBase()}${path}`, {
        method: body == null ? 'GET' : 'POST',
        headers,
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        body: body == null ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({ ok: false, error: `HTTP_${response.status}` }));
      if (!response.ok || payload?.ok === false) {
        const error = new Error(payload?.message || payload?.error || `HTTP_${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }
  async function ensureRunStarted() {
    if (runId) return runId;
    if (!startPromise) beginRun();
    await startPromise;
    if (!runId || !runToken) throw new Error('CLASSIC_RUN_NOT_STARTED');
    return runId;
  }
  function beginRun() {
    startedAt = Date.now();
    runId = '';
    runToken = '';
    eventTimeline = [];
    startPromise = requestGame(`/api/games/${gameKey}/start`).then((payload) => {
      runId = String(payload?.runId || '').trim();
      runToken = String(payload?.runToken || '').trim();
      if (!runId || !runToken) throw new Error('CLASSIC_RUN_TOKEN_MISSING');
      recordEvent('start', { game: gameKey });
      return runId;
    }).catch((error) => {
      runId = '';
      runToken = '';
      startPromise = null;
      try { reportClassicClientError('classic.start', error); } catch (_) {}
      throw error;
    });
    try { sessionStorage.pmClassicStartedAt = String(startedAt); } catch (_) {}
    return startPromise;
  }
  async function finishRun(score) {
    await ensureRunStarted();
    const durationMs = Math.max(0, Date.now() - (startedAt || Number(sessionStorage.pmClassicStartedAt || Date.now())));
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    recordEvent('finish', { score: safeScore, durationMs });
    return requestGame(`/api/games/${gameKey}/submit`, { runId, runToken, score: safeScore, durationMs, eventTimeline: eventTimeline.slice(0, 600) }).then((payload) => {
      try {
        if (payload?.ok && payload?.progression && window.__PM_GAME_ACCOUNT_SYNC__) {
          window.__PM_GAME_ACCOUNT_SYNC__.notifyMutation({
            progression: payload.progression,
            accountLevel: payload.progression.accountLevel,
            level: payload.progression.accountLevel,
            progressPercent: payload.progression.progressPercent
          });
          window.__PM_GAME_ACCOUNT_SYNC__.refresh?.({ force: true });
        }
      } catch (_) {}
      return payload;
    }).catch((error) => {
      try { reportClassicClientError('classic.submit', error); } catch (_) {}
      return { ok: false, error: error?.message || 'CLASSIC_SUBMIT_FAILED' };
    });
  }
  function reportClassicClientError(scope, error) {
    const body = JSON.stringify({ game: gameKey, scope, type: 'classic.runtime', message: error?.message || String(error || ''), source: `${gameKey}/script.js`, path: location.pathname, status: error?.status || 0 });
    fetch(`${apiBase()}/api/client/error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => null);
  }
  window.__PM_CLASSIC__ = {
    canPlay: () => { const rt = window.__PM_RUNTIME || {}; const core = window.__PM_ONLINE_CORE__; return !!(rt.auth?.currentUser || rt.currentUser || rt.user || core?.auth?.currentUser || core?.waitForAuthReady); },
    redirectToLogin: () => { window.location.href = '/#login'; },
    beginRun,
    finishRun,
    recordEvent
  };
})();



(() => {
  window.__PLAYMATRIX_ROUTE_NORMALIZER_DISABLED__ = true;
})();


(() => {
      let lastTouchEnd = 0;
      document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('gestureend', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });
      document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if ((now - lastTouchEnd) < 320) event.preventDefault();
        lastTouchEnd = now;
      }, { passive: false });
      document.addEventListener('dragstart', (event) => event.preventDefault());
    })();


const buttons = document.querySelectorAll(".btn");
    const grid = document.getElementById("grid");
    const levelEl = document.getElementById("level");
    const comboEl = document.getElementById("combo");
    const statusEl = document.getElementById("status");
    const startBtn = document.getElementById("startBtn");
    const highscoreEl = document.getElementById("highscore");

    let pattern = [];
    let playerIndex = 0;
    let level = 1;
    let combo = 0;
    let speed = 800;
    let isShowing = false;
    let gameActive = false;

    let highScore = localStorage.getItem("patternHigh") || 0;
    highscoreEl.innerText = "EN YÜKSEK SKOR: " + highScore;

    let audioCtx;

    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

    function unlockAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") audioCtx.resume();
    }

    function playBeep(freq, duration = 0.1) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function flashButton(dir) {
        const btn = document.querySelector(`[data-dir='${dir}']`);
        btn.classList.add("active");
        setTimeout(() => btn.classList.remove("active"), Math.max(200, speed - 200));
    }

    async function showPattern() {
        isShowing = true;
        grid.style.pointerEvents = "none";
        statusEl.innerText = "İZLE...";
        
        for (let i = 0; i < pattern.length; i++) {
            await new Promise(r => setTimeout(r, i === 0 ? 400 : speed / 2));
            flashButton(pattern[i]);
            playBeep(400 + (i * 50), 0.15);
            await new Promise(r => setTimeout(r, speed / 2));
        }
        
        isShowing = false;
        grid.style.pointerEvents = "auto";
        statusEl.innerText = "SIRANI YAP!";
    }

    async function startGame() {
        if (!(window.__PM_CLASSIC__ && window.__PM_CLASSIC__.canPlay())) {
            if (window.__PM_CLASSIC__?.redirectToLogin) window.__PM_CLASSIC__.redirectToLogin();
            return;
        }
        unlockAudio();
        gameActive = true;
        startBtn.classList.add("hidden");
        pattern = [];
        level = 1;
        combo = 0;
        speed = 800;
        try { if (window.__PM_CLASSIC__?.beginRun) await window.__PM_CLASSIC__.beginRun(); window.__PM_CLASSIC__?.recordEvent?.('game-ready', { level: 1 }); } catch (error) { gameActive = false; startBtn.classList.remove('hidden'); statusEl.innerText = userClassicMessage(error); return; }
        nextRound();
    }

    function nextRound() {
        playerIndex = 0;
        pattern.push(["up", "down", "left", "right"][Math.floor(Math.random() * 4)]);
        levelEl.innerText = level;
        comboEl.innerText = combo;
        showPattern();
    }

    function levelUp() {
        document.body.classList.add("flash-bg");
        setTimeout(() => document.body.classList.remove("flash-bg"), 100);
        playBeep(800, 0.2);
        statusEl.innerText = "SÜPER!";
        level++;
        speed = Math.max(300, speed - 50);
        setTimeout(nextRound, 800);
    }

    function gameOver(btn) {
        gameActive = false;
        document.body.classList.add("shake");
        setTimeout(() => document.body.classList.remove("shake"), 300);
        if(btn) btn.classList.add("wrong");
        
        playBeep(150, 0.4);
        const finalClassicScore = Math.max(0, level - 1);
        window.__PM_CLASSIC__?.recordEvent?.('game-over', { score: finalClassicScore, combo });
        statusEl.innerText = "BİTTİ!";
        
        if (finalClassicScore > highScore) {
            highScore = finalClassicScore;
            localStorage.setItem("patternHigh", highScore);
            highscoreEl.innerText = "EN YÜKSEK SKOR: " + highScore;
        }

        Promise.resolve(window.__PM_CLASSIC__?.finishRun?.(finalClassicScore)).then((result) => {
            if (result?.ok) statusEl.innerText = `BİTTİ! +${(result.xpAwarded ?? result.levelPoints ?? 0)} seviye puanı`;
        }).catch(() => null);

        setTimeout(() => {
            if(btn) btn.classList.remove("wrong");
            startBtn.classList.remove("hidden");
            startBtn.innerText = "TEKRAR DENE";
        }, 1200);
    }

    buttons.forEach(btn => {
        btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            if (!gameActive || isShowing) return;

            btn.classList.remove("ripple");
            void btn.offsetWidth;
            btn.classList.add("ripple");

            const dir = btn.dataset.dir;
            window.__PM_CLASSIC__?.recordEvent?.('input', { dir, index: playerIndex, level });
            playBeep(500, 0.1);

            if (dir === pattern[playerIndex]) {
                playerIndex++;
                combo++;
                comboEl.innerText = combo;
                if (playerIndex === pattern.length) levelUp();
            } else {
                gameOver(btn);
            }
        });
    });

    startBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        startGame();
    });



