const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const box = 15;
const size = 300;

let snake, direction, nextDirection, food, score, started = false;
let currentSpeed, lastMoveTime, gameInterval;

let audioCtx = null;

function forceUnlockAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
}

function playSound(freq, type, dur, vol = 0.1) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

const sounds = {
    move: () => playSound(450, 'sine', 0.04, 0.05),
    eatGreen: () => playSound(880, 'square', 0.1, 0.1), // 🍏 sesi
    eatRed: () => { // 🍎 sesi (çift bip)
        playSound(1000, 'square', 0.1, 0.1);
        setTimeout(() => playSound(1300, 'square', 0.1, 0.1), 60);
    },
    dead: () => {
        playSound(220, 'sawtooth', 0.3, 0.2);
        setTimeout(() => playSound(110, 'sawtooth', 0.5, 0.2), 150);
    }
};

const getHigh = () => localStorage.getItem("snake_pro_best") || 0;
document.getElementById("high").innerText = getHigh();

function spawnFood() {
    const isSpecial = Math.random() < 0.15; // %15 şansla nadir 🍎
    food = {
        x: Math.floor(Math.random() * (size/box)) * box,
        y: Math.floor(Math.random() * (size/box)) * box,
        type: isSpecial ? '🍎' : '🍏',
        value: isSpecial ? 3 : 1
    };
    if(snake.some(s => s.x === food.x && s.y === food.y)) spawnFood();
}

function startGame() {
    if (!(window.__PM_CLASSIC__ && window.__PM_CLASSIC__.canPlay())) {
        if (window.__PM_CLASSIC__?.redirectToLogin) window.__PM_CLASSIC__.redirectToLogin();
        return;
    }
    forceUnlockAudio();
    snake = [{x: 10*box, y: 10*box}, {x: 9*box, y: 10*box}, {x: 8*box, y: 10*box}];
    direction = "RIGHT";
    nextDirection = "RIGHT";
    score = 0;
    currentSpeed = 150;
    lastMoveTime = 0;
    spawnFood();
    
    document.getElementById("score").innerText = "0";
    document.getElementById("startup").style.display = "none";
    document.getElementById("gameover").style.display = "none";
    if (window.__PM_CLASSIC__?.beginRun) window.__PM_CLASSIC__.beginRun();
    
    started = true;
    if(gameInterval) cancelAnimationFrame(gameInterval);
    gameInterval = requestAnimationFrame(gameLoop);
}

function gameLoop(time) {
    if (!started) return;
    if (time - lastMoveTime > currentSpeed) {
        update();
        lastMoveTime = time;
    }
    draw();
    gameInterval = requestAnimationFrame(gameLoop);
}

function update() {
    direction = nextDirection;
    let head = { x: snake[0].x, y: snake[0].y };

    if (direction === "UP") head.y -= box;
    if (direction === "DOWN") head.y += box;
    if (direction === "LEFT") head.x -= box;
    if (direction === "RIGHT") head.x += box;

    if (head.x < 0 || head.y < 0 || head.x >= size || head.y >= size || 
        snake.some(s => s.x === head.x && s.y === head.y)) {
        return endGame();
    }

    if (head.x === food.x && head.y === food.y) {
        score += food.value;
        document.getElementById("score").innerText = score;
        
        if(food.type === '🍎') sounds.eatRed(); else sounds.eatGreen();

        spawnFood();
        if(currentSpeed > 60) currentSpeed -= 2;
    } else {
        snake.pop();
    }
    snake.unshift(head);
}

function draw() {
    ctx.fillStyle = "#9bbc0f";
    ctx.fillRect(0, 0, size, size);
    
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(food.type, food.x + box/2, food.y + box/2);

    snake.forEach(s => {
        ctx.fillStyle = "#0f380f";
        ctx.fillRect(s.x + 1, s.y + 1, box - 2, box - 2);
    });
}

function endGame() {
    started = false;
    sounds.dead();
    if (score > getHigh()) localStorage.setItem("snake_pro_best", score);
    document.getElementById("high").innerText = getHigh();
    const finalScoreNode = document.getElementById("finalScore");
    if (finalScoreNode) finalScoreNode.innerText = "SKORUN: " + score;
    document.getElementById("gameover").style.display = "flex";
    Promise.resolve(window.__PM_CLASSIC__?.finishRun?.(score)).then((result) => {
        if (finalScoreNode && result?.ok) {
            finalScoreNode.innerText = `SKORUN: ${score} • +${result.levelPoints} seviye puanı`;
        }
    }).catch(() => null);
}

function moveAction(dir) {
    forceUnlockAudio();
    if(!started) return;
    
    sounds.move();

    if (dir === "UP" && direction !== "DOWN") nextDirection = "UP";
    if (dir === "DOWN" && direction !== "UP") nextDirection = "DOWN";
    if (dir === "LEFT" && direction !== "RIGHT") nextDirection = "LEFT";
    if (dir === "RIGHT" && direction !== "LEFT") nextDirection = "RIGHT";
}

document.addEventListener("keydown", e => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowUp") moveAction("UP");
    if (e.key === "ArrowDown") moveAction("DOWN");
    if (e.key === "ArrowLeft") moveAction("LEFT");
    if (e.key === "ArrowRight") moveAction("RIGHT");
});

const btns = ["UP", "DOWN", "LEFT", "RIGHT"];
btns.forEach(id => {
    const el = document.getElementById("btn-" + id);
    el.addEventListener("touchstart", (e) => {
        e.preventDefault(); 
        moveAction(id);
    }, { passive: false });
});

const startUI = document.getElementById("startup");
const restartUI = document.getElementById("gameover");

[startUI, restartUI].forEach(el => {
    el.addEventListener("touchstart", (e) => {
        e.preventDefault();
        startGame();
    }, { passive: false });
});
