(() => {
  const gameKey = "space-pro";
  let runId = '';
  let runToken = '';
  let startedAt = 0;
  let startPromise = null;
  const apiBase = () => String(window.__PM_API__?.getApiBaseSync?.() || window.__PLAYMATRIX_API_URL__ || window.location.origin || '').replace(/\/+$/, '').replace(/\/api$/i, '');
  async function authToken() {
    try { if (window.__PM_RUNTIME?.getIdToken) return await window.__PM_RUNTIME.getIdToken(false); } catch (_) {}
    try { if (window.__PM_RUNTIME?.auth?.currentUser?.getIdToken) return await window.__PM_RUNTIME.auth.currentUser.getIdToken(false); } catch (_) {}
    return '';
  }
  function userClassicMessage(error, fallback = 'Oyun oturumu şu anda başlatılamadı. Lütfen tekrar dene.') {
    const raw = String(error?.payload?.message || error?.payload?.error || error?.message || error || '').trim();
    if (/auth_required|auth_invalid|no_user|401|403|oturum bulunamadı|giriş/i.test(raw)) return 'Devam etmek için giriş yapman gerekiyor.';
    if (/load failed|failed to fetch|network|timeout|zaman aşımı|request_timeout/i.test(raw)) return 'Oyun bağlantısı yenileniyor. Lütfen birkaç saniye sonra tekrar dene.';
    if (/run_not_found|run_token|classic_run/i.test(raw)) return 'Oyun oturumu doğrulanamadı. Lütfen oyunu yeniden başlat.';
    return fallback;
  }
  async function requestGame(path, body = null) {
    if (window.__PM_ONLINE_CORE__?.requestWithAuth) {
      return window.__PM_ONLINE_CORE__.requestWithAuth(path, { method: body == null ? 'GET' : 'POST', body, timeoutMs: 9000, retries: 1, allowSessionFallback: false });
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
    startPromise = requestGame(`/api/games/${gameKey}/start`).then((payload) => {
      runId = String(payload?.runId || '').trim();
      runToken = String(payload?.runToken || '').trim();
      if (!runId || !runToken) throw new Error('CLASSIC_RUN_TOKEN_MISSING');
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
    return requestGame(`/api/games/${gameKey}/submit`, { runId, runToken, score: Math.max(0, Math.floor(Number(score) || 0)), durationMs }).then((payload) => {
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
      return { ok: false, error: 'CLASSIC_SUBMIT_FAILED', message: userClassicMessage(error, 'Skorun şu anda doğrulanamadı. Lütfen oyunu tekrar başlat.') };
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
    finishRun
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


const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const restartBtn = document.getElementById("restartBtn");
    const W = 380, H = 500;
    canvas.width = W; canvas.height = H;

    const audio = {
        ctx: null,
        init() { if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if(this.ctx.state === 'suspended') this.ctx.resume(); },
        play(f, t='square', v=0.05, d=100) {
            this.init(); if(!this.ctx) return;
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = t; o.frequency.setValueAtTime(f, this.ctx.currentTime);
            g.gain.setValueAtTime(v, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + d/1000);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(); o.stop(this.ctx.currentTime + d/1000);
        }
    };

    let state = {
        highScore: parseInt(localStorage.getItem("proSpaceScore")) || 0,
        score: 0, lives: 5, running: false, frame: 0, baseX: W/2 - 20,
        moveLeft: false, moveRight: false
    };

    let entities = { rockets: [], mermiler: [], enemies: [], boss: null, particles: [], powerups: [], stars: [] };
    let loopFrameId = 0;

    async function init() {
        stopLoop();
        if (!(window.__PM_CLASSIC__ && window.__PM_CLASSIC__.canPlay())) {
            endSpaceRun();
            return;
        }
        state.score = 0; state.lives = 5; state.running = true; state.frame = 0; state.baseX = W/2 - 20;
        entities = {
            rockets: [{ off: 0 }], mermiler: [], enemies: [], boss: null, particles: [], powerups: [],
            stars: Array.from({length: 80}, () => ({ x: Math.random()*W, y: Math.random()*H, s: Math.random()*2, v: Math.random()*2 + 0.5 }))
        };
        document.getElementById("gameOver").style.display = "none";
        try { if (window.__PM_CLASSIC__?.beginRun) await window.__PM_CLASSIC__.beginRun(); } catch (error) {
            endSpaceRun();
            const over = document.getElementById("gameOver");
            const final = document.getElementById("finalScore");
            if (over) over.style.display = "grid";
            if (final) final.innerText = userClassicMessage(error);
            return;
        }
        updateUI();
        startLoop();
    }

    function updateUI() {
        document.getElementById("scoreUI").innerText = `SCORE: ${state.score.toString().padStart(3, '0')}`;
        document.getElementById("highScoreUI").innerText = `BEST: ${state.highScore.toString().padStart(3, '0')}`;
    }

    function addRocket() {
        if(entities.rockets.length >= 4) return;
        const offsets = [0, -40, 40, -80]; 
        entities.rockets.push({ off: offsets[entities.rockets.length] });
        audio.play(500, 'triangle', 0.1, 200);
    }

    function createExplosion(x, y, color, amount = 10) {
        for(let i=0; i<amount; i++) entities.particles.push({ x, y, vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6, l: 1, c: color, s: Math.random()*3 + 1 });
    }

    function checkHit(a, b, wa, ha, wb, hb) {
        return a.x < b.x + wb && a.x + wa > b.x && a.y < b.y + hb && a.y + ha > b.y;
    }

    function update() {
        if(!state.running) return;
        state.frame++;

        entities.stars.forEach(s => { s.y += s.v; if(s.y > H) s.y = 0; });

        let minOff = 0, maxOff = 0;
        entities.rockets.forEach(r => {
            if(r.off < minOff) minOff = r.off;
            if(r.off > maxOff) maxOff = r.off;
        });

        const leftLimit = -minOff + 5;
        const rightLimit = W - maxOff - 45;

        if(state.moveLeft) state.baseX = Math.max(leftLimit, state.baseX - 7);
        if(state.moveRight) state.baseX = Math.min(rightLimit, state.baseX + 7);

        if(state.frame % 12 === 0) {
            entities.rockets.forEach(r => entities.mermiler.push({ x: state.baseX + r.off + 18, y: 430 }));
            audio.play(150, 'sine', 0.02, 50);
        }

        if(state.frame % Math.max(15, 45 - Math.floor(state.score/15)) === 0) entities.enemies.push({ x: Math.random()*(W-40), y: -40, v: 2 + (state.score*0.04) });
        
        if(state.score > 0 && state.score % 50 === 0 && !entities.boss) {
            entities.boss = { x: W/2-40, y: -100, hp: 40, max: 40 };
        }

        for(let mi = entities.mermiler.length - 1; mi >= 0; mi--) {
            let m = entities.mermiler[mi];
            m.y -= 10;
            if(m.y < -20) { entities.mermiler.splice(mi, 1); continue; }
            
            entities.powerups.forEach((p, pi) => {
                if(checkHit(m, p, 4, 15, 30, 30)) {
                    if(p.t === 'W') addRocket(); else state.lives = Math.min(5, state.lives + 1);
                    createExplosion(p.x, p.y, p.t === 'W' ? '#00f2ff' : '#ff0055');
                    entities.powerups.splice(pi, 1);
                    entities.mermiler.splice(mi, 1);
                }
            });
        }

        entities.enemies.forEach((e, i) => {
            e.y += e.v;
            if(e.y > H) { state.lives--; entities.enemies.splice(i, 1); audio.play(100, 'sawtooth', 0.1, 200); }
            entities.mermiler.forEach((m, mi) => {
                if(checkHit(m, e, 4, 15, 35, 35)) {
                    createExplosion(e.x+15, e.y+15, '#00ff88');
                    entities.enemies.splice(i, 1);
                    entities.mermiler.splice(mi, 1);
                    state.score++; updateUI();
                    audio.play(400, 'square', 0.03, 80);
                }
            });
        });

        if(state.frame % 800 === 0) {
            const type = (entities.rockets.length < 4) ? (Math.random() > 0.4 ? 'W' : 'L') : 'L';
            entities.powerups.push({ x: Math.random()*(W-40), y: -40, t: type });
        }

        entities.powerups.forEach((p, i) => {
            p.y += 2;
            if(checkHit({x: state.baseX + minOff, y: 430}, p, (maxOff - minOff) + 40, 50, 30, 30)) {
                if(p.t === 'W') addRocket(); else state.lives = Math.min(5, state.lives + 1);
                entities.powerups.splice(i, 1);
                audio.play(800, 'triangle', 0.1, 300);
            }
        });

        if(entities.boss) {
            let b = entities.boss;
            b.y = Math.min(60, b.y + 1);
            b.x += Math.sin(state.frame/20)*2;
            
            for(let mi = entities.mermiler.length - 1; mi >= 0; mi--) {
                let m = entities.mermiler[mi];
                if(checkHit(m, b, 4, 15, 80, 80)) {
                    b.hp--;
                    entities.mermiler.splice(mi, 1);
                    audio.play(200, 'sawtooth', 0.02, 50);
                    
                    if(b.hp <= 0) {
                        for(let k=0; k<4; k++) {
                            entities.powerups.push({ 
                                x: b.x + Math.random()*60, 
                                y: b.y + Math.random()*40, 
                                t: 'L' 
                            });
                        }
                        createExplosion(b.x+40, b.y+40, '#ff0055', 30);
                        state.score += 20;
                        entities.boss = null; 
                        updateUI();
                        audio.play(80, 'square', 0.2, 500);
                        break; 
                    }
                }
            }
        }

        entities.particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.l -= 0.03; if(p.l <= 0) entities.particles.splice(i, 1); });
        
        if(state.lives <= 0) { 
            endSpaceRun();
            if(state.score > state.highScore) localStorage.setItem("proSpaceScore", state.score);
            document.getElementById("gameOver").style.display = "flex";
            document.getElementById("finalScore").innerText = `FINAL SCORE: ${state.score}`;
            Promise.resolve(window.__PM_CLASSIC__?.finishRun?.(state.score)).then((result) => {
                if (result?.ok) document.getElementById("finalScore").innerText = `FINAL SCORE: ${state.score} • +${(result.xpAwarded ?? result.levelPoints ?? 0)} seviye puanı`;
            }).catch(() => null);
        }
    }

    function draw() {
        ctx.clearRect(0,0,W,H);
        entities.stars.forEach(s => { ctx.globalAlpha = s.v/3; ctx.fillStyle = "white"; ctx.fillRect(s.x, s.y, s.s, s.s); });
        ctx.globalAlpha = 1;

        entities.rockets.forEach(r => {
            ctx.font = "40px Arial"; ctx.fillText("🚀", state.baseX + r.off, 460);
            ctx.fillStyle = "#ff4400"; ctx.fillRect(state.baseX + r.off + 16, 465, 8, 5+Math.random()*10);
        });

        ctx.fillStyle = "#00f2ff";
        entities.mermiler.forEach(m => ctx.fillRect(m.x, m.y, 4, 15));
        entities.enemies.forEach(e => { ctx.font = "32px Arial"; ctx.fillText("👾", e.x, e.y + 30); });
        entities.powerups.forEach(p => { ctx.font = "30px Arial"; ctx.fillText(p.t === 'W' ? "⚡" : "❤️", p.x, p.y); });
        
        if(entities.boss) {
            ctx.font = "80px Arial"; ctx.fillText("👽", entities.boss.x, entities.boss.y + 70);
            ctx.fillStyle = "#ff0055"; ctx.fillRect(entities.boss.x, entities.boss.y-10, (entities.boss.hp/entities.boss.max)*80, 5);
        }

        entities.particles.forEach(p => { ctx.globalAlpha = p.l; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); });
        ctx.globalAlpha = 1;
        for(let i=0; i<state.lives; i++) { ctx.font = "18px Arial"; ctx.fillText("❤️", 20 + i*25, 60); }
    }

    function stopLoop() {
        if (loopFrameId) {
            cancelAnimationFrame(loopFrameId);
            loopFrameId = 0;
        }
    }
    function startLoop() {
        if (!loopFrameId && state.running) loopFrameId = requestAnimationFrame(loop);
    }
    function endSpaceRun() {
        state.running = false;
        stopLoop();
    }
    function loop() {
        loopFrameId = 0;
        if (!state.running) return;
        if (!document.hidden) {
            update();
            if (state.running) draw();
        }
        if (state.running) startLoop();
    }

    const handleCtrl = (id, type) => {
        const el = document.getElementById(id);
        el.addEventListener("touchstart", (e) => { e.preventDefault(); audio.init(); if(type === 'L') state.moveLeft = true; else state.moveRight = true; });
        el.addEventListener("touchend", (e) => { e.preventDefault(); if(type === 'L') state.moveLeft = false; else state.moveRight = false; });
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.init(); if(type === 'L') state.moveLeft = true; else state.moveRight = true; });
        el.addEventListener("pointerup", (e) => { e.preventDefault(); if(type === 'L') state.moveLeft = false; else state.moveRight = false; });
        el.addEventListener("pointercancel", () => { if(type === 'L') state.moveLeft = false; else state.moveRight = false; });
    };

    handleCtrl("leftBtn", 'L'); handleCtrl("rightBtn", 'R');
    restartBtn.addEventListener('click', () => {
        if (!(window.__PM_CLASSIC__ && window.__PM_CLASSIC__.canPlay())) {
            if (window.__PM_CLASSIC__?.redirectToLogin) window.__PM_CLASSIC__.redirectToLogin();
            return;
        }
        init();
    });
    function installSpaceManualStartFallback(){
        const box = document.getElementById('game-container');
        if (!box) return;
        box.addEventListener('click', () => { if (!state.running) init(); }, { passive: true });
        box.addEventListener('touchstart', () => { if (!state.running) init(); }, { passive: true });
    }
    installSpaceManualStartFallback();
    function installSpaceAutoStart(){
        const run = () => { if(!state.running) init(); };
        if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true }); else setTimeout(run, 160);
    }
    installSpaceAutoStart();

function installSpaceAudioUnlock(){ document.body?.addEventListener('click', () => audio.init(), { passive: true }); }
installSpaceAudioUnlock();



