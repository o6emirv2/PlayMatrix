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

    function startGame() {
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
        if (window.__PM_CLASSIC__?.beginRun) window.__PM_CLASSIC__.beginRun();
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
        statusEl.innerText = "BİTTİ!";
        
        if (finalClassicScore > highScore) {
            highScore = finalClassicScore;
            localStorage.setItem("patternHigh", highScore);
            highscoreEl.innerText = "EN YÜKSEK SKOR: " + highScore;
        }

        Promise.resolve(window.__PM_CLASSIC__?.finishRun?.(finalClassicScore)).then((result) => {
            if (result?.ok) statusEl.innerText = `BİTTİ! +${result.levelPoints} seviye puanı`;
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
