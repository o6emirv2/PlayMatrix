import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* =======================
   ANTI ZOOM / SCREEN SHIFT
   (Tasarımı bozmaz)
======================= */
(function hardenMobileUX() {
  // iOS pinch zoom / gesture
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  // double-tap zoom
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // iOS viewport resize jitter (adres çubuğu)
  const applyVH = () => {
    document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
  };
  applyVH();
  window.addEventListener("resize", applyVH);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", applyVH);
})();

/* =======================
   CONFIG
======================= */
const API_URL = "https://emirhan-siye.onrender.com";

const firebaseConfig = {
  apiKey: "AIzaSyBykwXCOJpX6rG0pUx93HmALjVcCQWVMYA",
  authDomain: "emirhan-site.firebaseapp.com",
  projectId: "emirhan-site",
  storageBucket: "emirhan-site.firebasestorage.app",
  messagingSenderId: "668871888390",
  appId: "1:668871888390:web:76568bda84cb1641f7bd87"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* =======================
   HELPERS
======================= */
const $ = (id) => document.getElementById(id);

const safeText = (v, fallback = "") => {
  if (typeof v !== "string") return fallback;
  return v.replace(/[<>]/g, "").trim();
};

const nowMs = () => Date.now();

async function fetchAPI(endpoint, method = "GET", body = null) {
  if (!auth.currentUser) throw new Error("Oturum bulunamadı!");
  const token = await auth.currentUser.getIdToken();

  const options = {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${endpoint}`, options);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const msg = (data && data.error) || `Sunucu hatası: ${res.status}`;
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error(data.error || "Sunucu hatası.");
  return data || { ok: true };
}

/* =======================
   AUDIO
======================= */
const sfx = {
  lobby: new Audio("https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3"),
  tap: new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3"),
  rain: new Audio("https://cdn.pixabay.com/audio/2022/03/15/audio_73d9136e05.mp3"),
  thunder: new Audio("https://cdn.pixabay.com/audio/2022/03/24/audio_924ebc01e6.mp3")
};

sfx.lobby.loop = true;
sfx.rain.loop = true;
sfx.lobby.volume = 0.4;
sfx.tap.volume = 0.8;
sfx.rain.volume = 1.0;
sfx.thunder.volume = 1.0;

let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) return;
  Object.values(sfx).forEach((a) => {
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
      })
      .catch(() => {});
  });
  audioUnlocked = true;
  if (currentScene === "lobby") sfx.lobby.play().catch(() => {});
};

document.body.addEventListener("touchstart", unlockAudio, { once: true });
document.body.addEventListener("click", unlockAudio, { once: true });

/* =======================
   UI MODALS
======================= */
const toggleModal = (id, show) => {
  const el = $(id);
  if (!el) return;
  el.style.display = show ? "flex" : "none";
};

const showModalAlert = (title, msg, onConfirm) => {
  $("alertTitle").textContent = title;
  $("alertMsg").textContent = msg;

  const cancel = $("alertCancelBtn");
  cancel.style.display = onConfirm ? "block" : "none";

  $("alertOkBtn").onclick = () => {
    toggleModal("alertModal", false);
    if (onConfirm) onConfirm();
  };

  toggleModal("alertModal", true);
};

/* =======================
   CANVAS BG
======================= */
const canvas = $("bg-canvas");
const ctx = canvas.getContext("2d");

let lobbyParticles = [];
let rainParticles = [];
let lightningFlash = 0;
let lightningTimer = null;

function initParticles() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  lobbyParticles = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2,
    s: Math.random() * 0.5
  }));

  rainParticles = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    l: Math.random() * 25 + 15,
    s: Math.random() * 20 + 15,
    w: Math.random() * 1.5 + 0.5,
    o: Math.random() * 0.4 + 0.1
  }));
}

function triggerLightning() {
  if (currentScene !== "game") return;
  lightningFlash = 3;
  if (audioUnlocked) {
    sfx.thunder.currentTime = 0;
    sfx.thunder.play().catch(() => {});
  }
  lightningTimer = setTimeout(triggerLightning, Math.random() * 10000 + 8000);
}

function drawBg() {
  if (currentScene === "lobby") {
    ctx.fillStyle = "#03050a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0, 242, 255, 0.2)";
    lobbyParticles.forEach((p) => {
      p.y -= p.s;
      if (p.y < 0) p.y = canvas.height;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    ctx.fillStyle = "rgba(3, 5, 10, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (lightningFlash > 0) {
      ctx.fillStyle = `rgba(230, 240, 255, ${Math.random() * 0.6 + 0.2})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      lightningFlash--;
    }

    ctx.lineCap = "round";
    rainParticles.forEach((p) => {
      ctx.strokeStyle = `rgba(200, 220, 255, ${p.o})`;
      p.y += p.s;
      p.x -= p.s * 0.1;
      if (p.y > canvas.height) {
        p.y = -20;
        p.x = Math.random() * canvas.width + 50;
      }
      ctx.beginPath();
      ctx.lineWidth = p.w;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.l * 0.1, p.y - p.l);
      ctx.stroke();
    });
  }

  requestAnimationFrame(drawBg);
}

initParticles();
drawBg();
window.addEventListener("resize", initParticles);

/* =======================
   STATE
======================= */
let uid = null;
let username = "PILOT";

let curRoomId = null;
let myRole = null;

let isFin = false;
let canPlay = false;

let unsubLobby = null;
let unsubGame = null;
let unsubPubInGame = null;

let currentScene = "lobby";
let gameTimerInt = null;
let settleSent = false;

let lastClickAt = 0;

/* =======================
   LOBBY LIVE UI
======================= */
let lobbyTicker = null;
const lobbyCards = new Map(); // roomId -> { timeEl, statusEl, scoreEl, endTimeMs }

function startLobbyTicker() {
  if (lobbyTicker) return;
  lobbyTicker = setInterval(() => {
    for (const [, v] of lobbyCards) {
      if (!v.endTimeMs || !v.timeEl) continue;
      const left = Math.max(0, Math.ceil((v.endTimeMs - nowMs()) / 1000));
      v.timeEl.textContent = `⏱ ${left}s`;
    }
  }, 500);
}

function stopLobbyTicker() {
  if (lobbyTicker) clearInterval(lobbyTicker);
  lobbyTicker = null;
}

function clearLobbyCards() {
  lobbyCards.clear();
  $("roomList").innerHTML = "";
}

/* =======================
   AUTH INIT
======================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showModalAlert("OTURUM GEREKLİ", "Lütfen giriş yap.", () => (window.location.href = "index.html"));
    return;
  }

  uid = user.uid;

  try {
    const me = await fetchAPI("/api/me");
    username = safeText(me?.user?.username, "PILOT") || "PILOT";
    $("meName").textContent = username;

    $("createRoomBtn").disabled = false;
    $("quickJoinBtn").disabled = false;

    // lobby music
    if (audioUnlocked) sfx.lobby.play().catch(() => {});

    listenLobby();
  } catch (e) {
    showModalAlert("SUNUCU BAĞLANTI", e.message || "Bağlantı hatası.", () => window.location.reload());
  }
});

/* =======================
   LOBBY LISTENER
======================= */
function listenLobby() {
  if (unsubLobby) unsubLobby();
  clearLobbyCards();
  startLobbyTicker();

  const q = query(collection(db, "conquest_pub"), where("status", "in", ["waiting", "playing"]));

  unsubLobby = onSnapshot(
    q,
    (snap) => {
      const list = $("roomList");
      list.innerHTML = "";

      lobbyCards.clear();
      let count = 0;

      snap.forEach((d) => {
        const r = d.data() || {};
        const roomId = d.id;

        const status = safeText(r.status, "");
        const isPrivate = !!r.isPrivate;

        // temel güvenlik: eksik doc alanı crash etmesin
        const p1Name = safeText(r.p1Name, "PILOT");
        const p2Name = safeText(r.p2Name, "");

        const s1 = Number.isFinite(Number(r.s1)) ? Number(r.s1) : 0;
        const s2 = Number.isFinite(Number(r.s2)) ? Number(r.s2) : 0;
        const endTimeMs = Number.isFinite(Number(r.endTimeMs)) ? Number(r.endTimeMs) : 0;

        const card = document.createElement("div");
        card.className = "room-card";

        const info = document.createElement("div");
        info.className = "room-info";

        const title = document.createElement("div");
        title.className = "room-title";
        title.textContent = `BÖLGE: ${roomId} ${isPrivate ? "🔒" : "🔓"}`;

        const players = document.createElement("div");
        players.className = "room-players";

        const sp1 = document.createElement("span");
        sp1.style.color = "var(--p1)";
        sp1.textContent = p1Name;

        const vs = document.createElement("span");
        vs.style.color = "#555";
        vs.textContent = "vs";

        const sp2 = document.createElement("span");
        sp2.style.color = "var(--p2)";
        sp2.textContent = status === "playing" ? (p2Name || "PILOT") : "BEKLENİYOR...";

        players.append(sp1, vs, sp2);

        const timeRow = document.createElement("div");
        timeRow.className = "room-time";

        const scoreRow = document.createElement("div");
        scoreRow.className = "room-time";
        scoreRow.style.marginTop = "6px";

        // createdAt age
        let ageText = "";
        try {
          if (r.createdAt && typeof r.createdAt.toMillis === "function") {
            const ageSec = Math.max(0, Math.floor((nowMs() - r.createdAt.toMillis()) / 1000));
            ageText = ageSec < 5 ? "Az önce" : `${ageSec} saniye önce`;
          }
        } catch (_) {}

        if (status === "waiting") {
          timeRow.textContent = `🟢 BOŞ (1/2) • ⏳ ${ageText || "Yeni"}`;
          scoreRow.textContent = `Skor: 0 - 0`;
        } else {
          timeRow.textContent = `🔴 DOLU (2/2) • ⏱ ${Math.max(0, Math.ceil((endTimeMs - nowMs()) / 1000))}s`;
          scoreRow.textContent = `Skor: ${s1} - ${s2}`;
        }

        info.append(title, players, timeRow, scoreRow);

        const act = document.createElement("div");
        act.className = "room-action";

        const btn = document.createElement("button");

        if (status === "waiting") {
          btn.className = "btn-neon btn-sec";
          btn.textContent = "GİRİŞ YAP";
          btn.addEventListener("click", () => joinHandler(roomId, isPrivate));
        } else {
          btn.className = "btn-neon";
          btn.disabled = true;
          btn.style.background = "#222";
          btn.style.color = "#555";
          btn.style.cursor = "not-allowed";
          btn.textContent = "MEŞGUL";
        }

        act.appendChild(btn);
        card.append(info, act);
        list.appendChild(card);

        lobbyCards.set(roomId, {
          timeEl: timeRow,
          scoreEl: scoreRow,
          endTimeMs: status === "playing" ? endTimeMs : 0
        });

        count++;
      });

      $("emptyLobbyMsg").style.display = count === 0 ? "block" : "none";
    },
    (err) => {
      showModalAlert("LOBİ HATASI", err?.message || "Lobi dinlenemiyor.");
    }
  );
}

/* =======================
   UI EVENTS (INLINE YOK)
======================= */
$("btnExit").addEventListener("click", () => {
  if (currentScene === "game") {
    showModalAlert("ONAY", "Savaş alanından ayrılıp lobiye dönmek istiyor musun?", leaveToLobby);
  } else {
    window.location.href = "index.html";
  }
});

$("roomSearch").addEventListener("input", (e) => {
  const s = (e.target.value || "").toLowerCase();
  document.querySelectorAll(".room-card").forEach((c) => {
    c.style.display = c.textContent.toLowerCase().includes(s) ? "flex" : "none";
  });
});

$("createRoomBtn").addEventListener("click", () => toggleModal("roomTypeModal", true));
$("btnHelp").addEventListener("click", () => toggleModal("helpModal", true));
$("btnUnderstand").addEventListener("click", () => toggleModal("helpModal", false));

$("btnCancelType").addEventListener("click", () => toggleModal("roomTypeModal", false));
$("btnPublicArena").addEventListener("click", () => createArena(false));
$("btnPrivateArena").addEventListener("click", () => {
  toggleModal("roomTypeModal", false);
  toggleModal("privateSettingsModal", true);
});
$("btnCancelPrivate").addEventListener("click", () => toggleModal("privateSettingsModal", false));
$("btnCreatePrivate").addEventListener("click", () => createArena(true));

$("btnCancelJoinPass").addEventListener("click", () => toggleModal("passwordEntryModal", false));
$("alertCancelBtn").addEventListener("click", () => toggleModal("alertModal", false));
$("btnReturnLobby").addEventListener("click", () => leaveToLobby());

$("quickJoinBtn").addEventListener("click", () => {
  // en güncel listeden ilk şifresiz waiting odaya gir
  let targetRoomId = null;
  for (const [rid, meta] of lobbyCards.entries()) {
    // waiting odalar endTimeMs=0
    if (!meta.endTimeMs) {
      // kart metnini kontrol et
      const card = [...document.querySelectorAll(".room-card")].find((x) => x.textContent.includes(`BÖLGE: ${rid}`));
      if (card && card.textContent.includes("🔓") && card.textContent.includes("BOŞ")) {
        targetRoomId = rid;
        break;
      }
    }
  }
  if (!targetRoomId) {
    showModalAlert("ARENA YOK", "Uygun şifresiz boş arena bulunamadı.");
    return;
  }
  joinHandler(targetRoomId, false);
});

/* =======================
   CREATE / JOIN
======================= */
async function createArena(isPrivate) {
  $("createError").style.display = "none";

  let pass = "";
  if (isPrivate) {
    pass = ($("customRoomPass").value || "").trim();
    if (pass.length < 5) {
      $("createError").style.display = "block";
      return;
    }
  }

  try {
    const res = await fetchAPI("/api/conquest/create", "POST", { pass });
    curRoomId = res.roomId;
    myRole = "p1";

    toggleModal("roomTypeModal", false);
    toggleModal("privateSettingsModal", false);

    enterGame(curRoomId);
  } catch (e) {
    showModalAlert("HATA", e.message || "Oda oluşturulamadı.");
  }
}

let pendingJoinId = null;
function joinHandler(roomId, isPrivate) {
  $("passError").style.display = "none";
  $("passError").textContent = "HATA: ŞİFRE YANLIŞ!";
  $("joinRoomPassInput").value = "";

  if (isPrivate) {
    pendingJoinId = roomId;
    toggleModal("passwordEntryModal", true);
    return;
  }
  completeJoin(roomId, "");
}

$("confirmJoinPass").addEventListener("click", () => {
  const pass = ($("joinRoomPassInput").value || "").trim();
  completeJoin(pendingJoinId, pass);
});

async function completeJoin(roomId, pass) {
  if (!roomId) return;
  try {
    await fetchAPI("/api/conquest/join", "POST", { roomId, pass });
    curRoomId = roomId;
    myRole = "p2";
    toggleModal("passwordEntryModal", false);
    enterGame(roomId);
  } catch (e) {
    $("passError").style.display = "block";
    $("passError").textContent = e.message || "Şifre/katılım hatası";
  }
}

/* =======================
   GAME
======================= */
function enterGame(roomId) {
  // lobi dinlemesini kapat
  if (unsubLobby) unsubLobby();
  stopLobbyTicker();

  currentScene = "game";
  isFin = false;
  canPlay = false;
  settleSent = false;

  // audio scene swap
  sfx.lobby.pause();
  sfx.rain.currentTime = 0;
  if (audioUnlocked) sfx.rain.play().catch(() => {});
  triggerLightning();

  $("lobby").style.display = "none";
  $("game-view").style.display = "flex";

  // Grid init
  const g = $("grid");
  g.innerHTML = "";
  for (let i = 0; i < 36; i++) {
    const c = document.createElement("div");
    c.className = "cell";
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", `Alan ${i + 1}`);

    c.addEventListener("click", () => {
      const t = nowMs();
      if (!canPlay || isFin) return;
      if (t - lastClickAt < 120) return; // client throttle (server zaten kontrol ediyor)
      lastClickAt = t;

      // UI fast (server state zaten düzeltir)
      c.className = `cell ${myRole}`;
      sfx.tap.currentTime = 0;
      if (audioUnlocked) sfx.tap.play().catch(() => {});

      fetchAPI("/api/conquest/click", "POST", { roomId, cellIndex: i }).catch(() => {});
    });

    g.appendChild(c);
  }

  // Pub doc'u oyunda canlı dinle (isimler, durum)
  if (unsubPubInGame) unsubPubInGame();
  unsubPubInGame = onSnapshot(
    doc(db, "conquest_pub", roomId),
    (snap) => {
      if (!snap.exists()) return;
      const p = snap.data() || {};
      $("n1").textContent = safeText(p.p1Name, "-");
      $("n2").textContent = safeText(p.p2Name, "BEKLENİYOR...") || "BEKLENİYOR...";
    },
    () => {}
  );

  // State doc'u dinle
  if (unsubGame) unsubGame();
  unsubGame = onSnapshot(
    doc(db, "conquest_state", roomId),
    (snap) => {
      if (!snap.exists()) {
        // oda silindiyse
        if (!isFin) showModalAlert("ARENA KAPANDI", "Arena kapatıldı.", leaveToLobby);
        return;
      }

      const d = snap.data() || {};
      const status = safeText(d.status, "");

      if (status === "terminated" && !isFin) {
        isFin = true;
        showModalAlert("BAĞLANTI KOPTU", "Rakip ayrıldı. Lobiye dön.", leaveToLobby);
        return;
      }

      if (status === "playing") canPlay = true;

      // server timer
      const endTimeMs = Number.isFinite(Number(d.endTimeMs)) ? Number(d.endTimeMs) : 0;
      if (status === "playing" && endTimeMs > 0) startGameTimer(roomId, endTimeMs);

      // cells & score
      const cells = d.cells || {};
      let s1 = 0;
      let s2 = 0;

      document.querySelectorAll(".cell").forEach((cellEl, i) => {
        const owner = cells[i];
        if (owner === "p1") {
          cellEl.className = "cell p1";
          s1++;
        } else if (owner === "p2") {
          cellEl.className = "cell p2";
          s2++;
        } else {
          cellEl.className = "cell";
        }
      });

      $("s1").textContent = String(s1);
      $("s2").textContent = String(s2);

      if (status === "finished" && !isFin) {
        finish(roomId, s1, s2, safeText(d.winner, ""));
      }
    },
    (err) => {
      showModalAlert("OYUN HATASI", err?.message || "Oyun state okunamıyor. Firestore Rules kontrol et.", leaveToLobby);
    }
  );
}

function startGameTimer(roomId, endTimeMs) {
  if (gameTimerInt) return; // zaten çalışıyor

  gameTimerInt = setInterval(() => {
    const left = Math.max(0, Math.ceil((endTimeMs - nowMs()) / 1000));
    $("timer-display").textContent = String(left);

    if (left === 0 && !settleSent) {
      settleSent = true;
      // server settle (tek sefer)
      fetchAPI("/api/conquest/settle", "POST", { roomId }).catch(() => {});
    }
  }, 250);
}

function stopGameTimer() {
  if (gameTimerInt) clearInterval(gameTimerInt);
  gameTimerInt = null;
}

function finish(roomId, s1, s2, winnerUid) {
  isFin = true;
  canPlay = false;
  stopGameTimer();
  if (lightningTimer) clearTimeout(lightningTimer);

  const label = $("winnerLabel");
  const draw = s1 === s2;

  const didWin = winnerUid && winnerUid === uid;
  label.textContent = draw ? "BERABERE" : didWin ? "ZAFER" : "BOZGUN";
  label.className = "result-header " + (draw ? "" : didWin ? "win-text" : "lose-text");

  $("finalS1").textContent = String(s1);
  $("finalS2").textContent = String(s2);

  toggleModal("resultModal", true);

  // odaları temizlemek için p1 otomatik leave (server zaten cleanup yapacak)
  if (myRole === "p1") {
    setTimeout(() => {
      fetchAPI("/api/conquest/leave", "POST", { roomId }).catch(() => {});
    }, 2500);
  }
}

async function leaveToLobby() {
  try {
    if (curRoomId) {
      stopGameTimer();
      if (lightningTimer) clearTimeout(lightningTimer);

      if (unsubGame) unsubGame();
      unsubGame = null;

      if (unsubPubInGame) unsubPubInGame();
      unsubPubInGame = null;

      await fetchAPI("/api/conquest/leave", "POST", { roomId: curRoomId }).catch(() => {});
    }
  } finally {
    curRoomId = null;
    myRole = null;
    isFin = false;
    canPlay = false;
    currentScene = "lobby";
    lightningFlash = 0;

    sfx.rain.pause();
    sfx.thunder.pause();
    if (audioUnlocked) {
      sfx.lobby.currentTime = 0;
      sfx.lobby.play().catch(() => {});
    }

    $("game-view").style.display = "none";
    $("lobby").style.display = "flex";
    toggleModal("resultModal", false);
    toggleModal("alertModal", false);
    toggleModal("passwordEntryModal", false);

    listenLobby();
  }
}

// tab kapama
window.addEventListener("beforeunload", () => {
  if (curRoomId && auth.currentUser) {
    fetchAPI("/api/conquest/leave", "POST", { roomId: curRoomId }).catch(() => {});
  }
});
