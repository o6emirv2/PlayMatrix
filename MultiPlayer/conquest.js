import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const API_URL = "https://emirhan-siye.onrender.com";

const firebaseConfig = {
  apiKey: "AIzaSyBykwXCOJpX6rG0pUx93HmALjVcCQWVMYA",
  authDomain: "emirhan-site.firebaseapp.com",
  projectId: "emirhan-site",
  storageBucket: "emirhan-site.firebasestorage.app",
  messagingSenderId: "668871888390",
  appId: "1:668871888390:web:76568bda84cb1641f7bd87",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// -------------------- Safe API --------------------
async function fetchAPI(endpoint, method = "GET", body = null, timeoutMs = 8000) {
  if (!auth.currentUser) throw new Error("Oturum bulunamadı!");
  const token = await auth.currentUser.getIdToken();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : null,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : {};
    if (!res.ok || data.ok === false) throw new Error(data.error || "Sunucu hatası.");
    return data;
  } finally {
    clearTimeout(t);
  }
}

// -------------------- SFX --------------------
const sfx = {
  lobby: new Audio("https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3"),
  tap: new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3"),
  rain: new Audio("https://cdn.pixabay.com/audio/2022/03/15/audio_73d9136e05.mp3"),
  thunder: new Audio("https://cdn.pixabay.com/audio/2022/03/24/audio_924ebc01e6.mp3"),
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

// ✅ Double-tap zoom kesin engel (JS)
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });

// -------------------- UI helpers --------------------
const toggleModal = (id, show) => {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? "flex" : "none";
};

const showModalAlert = (title, msg, onConfirm) => {
  document.getElementById("alertTitle").textContent = title;
  document.getElementById("alertMsg").textContent = msg;
  document.getElementById("alertCancelBtn").style.display = onConfirm ? "block" : "none";
  document.getElementById("alertOkBtn").onclick = () => {
    toggleModal("alertModal", false);
    if (onConfirm) onConfirm();
  };
  toggleModal("alertModal", true);
};

// ✅ Üst bar isimleri (oyun içinde)
function setTopNames(p1, p2, show) {
  const topNames = document.getElementById("topNames");
  const topP1 = document.getElementById("topP1");
  const topP2 = document.getElementById("topP2");
  if (!topNames || !topP1 || !topP2) return;

  if (show) {
    topP1.textContent = p1 || "-";
    topP2.textContent = p2 || "-";
    topNames.style.display = "flex";
    topNames.setAttribute("aria-hidden", "false");
  } else {
    topNames.style.display = "none";
    topNames.setAttribute("aria-hidden", "true");
  }
}

// -------------------- State --------------------
let uid = null;
let curRoomId = null;
let myRole = null; // "p1" | "p2"
let isFin = false;
let canPlay = false;

let unsubLobby = null;
let unsubGame = null;

let heartbeatInt = null;
let timerUiInt = null;

let currentScene = "lobby";
let lightningTimer = null;

// -------------------- Background Canvas --------------------
const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");
let lobbyParticles = [],
  rainParticles = [],
  lightningFlash = 0;

function initParticles() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  lobbyParticles = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2,
    s: Math.random() * 0.5,
  }));
  rainParticles = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    l: Math.random() * 25 + 15,
    s: Math.random() * 20 + 15,
    w: Math.random() * 1.5 + 0.5,
    o: Math.random() * 0.4 + 0.1,
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
  } else if (currentScene === "game") {
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

// -------------------- Auth boot --------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try {
      await signInAnonymously(auth);
    } catch {}
    return;
  }

  uid = user.uid;

  // Kullanıcı adı
  try {
    const me = await fetchAPI("/api/me");
    document.getElementById("meName").textContent =
      me?.user?.username || `PILOT_${uid.slice(0, 4).toUpperCase()}`;
  } catch {
    document.getElementById("meName").textContent = `PILOT_${uid.slice(0, 4).toUpperCase()}`;
  }

  document.getElementById("createRoomBtn").disabled = false;
  document.getElementById("quickJoinBtn").disabled = false;

  // ✅ Resume: aktif odası varsa oyuna geri dön
  try {
    const r = await fetchAPI("/api/conquest/myroom", "GET");
    if (r.ok && r.roomId) {
      curRoomId = r.roomId;
      myRole = r.role || null;
      enterGame(curRoomId, true);
      return;
    }
  } catch {}

  // ✅ Resume yoksa lobby’yi başlat
  listenLobby();

  if (audioUnlocked) sfx.lobby.play().catch(() => {});
});

// -------------------- Lobby (CANLI) --------------------
function listenLobby() {
  if (unsubLobby) unsubLobby();

  // ✅ waiting + playing odaları kesin görünsün (AÇIK / DOLU)
  // ❌ orderBy eklemiyoruz (index istemesin, hata çıkarmasın)
  const q = query(
    collection(db, "conquest_rooms"),
    where("status", "in", ["waiting", "playing"])
  );

  unsubLobby = onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const list = document.getElementById("roomList");
      list.innerHTML = "";
      let count = 0;
      const now = Date.now();

      snap.forEach((d) => {
        const r = d.data();
        if (!r) return;

        // güvenlik: cache bug'ında biterse yine filtrele
        if (r.status === "finished") return;

        // ✅ waiting TTL client-side filtre (server-side cleanup ayrıca var)
        if (r.status === "waiting") {
          const age = now - (Number(r.createdAtMs) || 0);
          if (age > 70000) return;
        }

        const iAmInThis = (r.p1 === uid) || (r.p2 === uid);

        const p1n = r.p1Name || "PİLOT";
        const p2n = r.p2Name || "BEKLENİYOR...";

        const s1 = Number.isFinite(Number(r.score1)) ? Number(r.score1) : 0;
        const s2 = Number.isFinite(Number(r.score2)) ? Number(r.score2) : 0;

        // ---- CARD ----
        const card = document.createElement("div");
        card.className = "room-card";

        const info = document.createElement("div");
        info.className = "room-info";

        const title = document.createElement("div");
        title.className = "room-title";

        if (r.status === "waiting") {
          title.textContent = `BÖLGE: ${d.id} ${r.isPrivate ? "🔒" : "🔓"} ${iAmInThis ? "• SENİN" : ""}`;
        } else {
          title.textContent = `BÖLGE: ${d.id} ⚔️ ${iAmInThis ? "• SENİN" : ""}`;
        }

        // ✅ AÇIK/DOLU badge (CSS yoksa da sorun değil)
        const badge = document.createElement("div");
        badge.className = "room-time"; // mevcut stili kullansın diye
        badge.style.opacity = "0.9";
        badge.style.fontWeight = "900";
        badge.textContent = (r.status === "waiting") ? "AÇIK" : "DOLU";

        // ✅ isim + skor (Lobby listesinde)
        const players = document.createElement("div");
        players.className = "room-players";
        if (r.status === "waiting") {
          players.innerHTML =
            `<span style="color:var(--p1)">${p1n} (${s1})</span>
             <span style="color:#555">vs</span>
             <span style="color:var(--p2)">BEKLENİYOR... (${s2})</span>`;
        } else {
          players.innerHTML =
            `<span style="color:var(--p1)">${p1n} (${s1})</span>
             <span style="color:#555">vs</span>
             <span style="color:var(--p2)">${p2n} (${s2})</span>`;
        }

        const time = document.createElement("div");
        time.className = "room-time";

        if (r.status === "waiting") {
          const sec = Math.max(0, Math.floor((now - (Number(r.createdAtMs) || now)) / 1000));
          time.textContent = sec < 5 ? "Az önce" : `${sec}s önce`;
        } else {
          time.style.color = "var(--warning)";
          const left = Math.max(0, Math.ceil(((Number(r.endTimeMs) || 0) - now) / 1000));
          time.textContent = `⏳ ${left}s`;
        }

        info.append(title, badge, players, time);

        const act = document.createElement("div");
        act.className = "room-action";

        const btn = document.createElement("button");

        if (r.status === "waiting") {
          btn.className = "btn-neon btn-sec";
          btn.textContent = iAmInThis ? "DEVAM ET" : "GİRİŞ YAP";
          btn.addEventListener("click", () => {
            if (iAmInThis) {
              curRoomId = d.id;
              enterGame(curRoomId, true);
              return;
            }
            joinHandler(d.id, !!r.isPrivate);
          });
        } else {
          btn.className = "btn-neon";
          btn.textContent = iAmInThis ? "DEVAM ET" : "MEŞGUL";
          btn.disabled = !iAmInThis;
          if (!iAmInThis) {
            btn.style.background = "#222";
            btn.style.color = "#555";
          }
          btn.addEventListener("click", () => {
            if (!iAmInThis) return;
            curRoomId = d.id;
            enterGame(curRoomId, true);
          });
        }

        act.appendChild(btn);
        card.append(info, act);
        list.appendChild(card);
        count++;
      });

      document.getElementById("emptyLobbyMsg").style.display = count === 0 ? "block" : "none";
    },
    (err) => {
      console.error("Lobby snapshot error", err);
      const msg = err?.code ? `${err.code}: ${err.message}` : (err?.message || "Bilinmeyen hata");
      showModalAlert("HATA", "Lobby canlı bağlantı hatası:\n" + msg);
    }
  );
}

// -------------------- Buttons --------------------
document.getElementById("btnExit").addEventListener("click", () => {
  if (currentScene === "game") {
    showModalAlert("ONAY", "Savaştan çıkıp lobiye dönmek istiyor musun?", () => leaveToLobby(true));
  } else {
    window.location.href = "index.html";
  }
});

document.getElementById("roomSearch").addEventListener("input", (e) => {
  const s = (e.target.value || "").toLowerCase();
  document.querySelectorAll(".room-card").forEach((c) => {
    c.style.display = c.textContent.toLowerCase().includes(s) ? "flex" : "none";
  });
});

document.getElementById("createRoomBtn").addEventListener("click", () => toggleModal("roomTypeModal", true));

document.getElementById("quickJoinBtn").addEventListener("click", () => {
  let target = null;
  document.querySelectorAll(".room-card").forEach((c) => {
    if (c.textContent.includes("🔓") && c.textContent.includes("GİRİŞ YAP")) target = c;
  });
  if (target) target.querySelector("button").click();
  else showModalAlert("HATA", "Uygun şifresiz arena yok.");
});

document.getElementById("btnHelp").addEventListener("click", () => toggleModal("helpModal", true));
document.getElementById("btnUnderstand").addEventListener("click", () => toggleModal("helpModal", false));

document.getElementById("btnCancelType").addEventListener("click", () => toggleModal("roomTypeModal", false));
document.getElementById("btnPublicArena").addEventListener("click", () => createArena(false));
document.getElementById("btnPrivateArena").addEventListener("click", () => {
  toggleModal("roomTypeModal", false);
  toggleModal("privateSettingsModal", true);
});
document.getElementById("btnCancelPrivate").addEventListener("click", () => toggleModal("privateSettingsModal", false));
document.getElementById("btnCreatePrivate").addEventListener("click", () => createArena(true));

document.getElementById("btnCancelJoinPass").addEventListener("click", () => toggleModal("passwordEntryModal", false));
document.getElementById("alertCancelBtn").addEventListener("click", () => toggleModal("alertModal", false));
document.getElementById("btnReturnLobby").addEventListener("click", () => leaveToLobby(false));

// -------------------- Create / Join --------------------
async function createArena(isPrivate) {
  let pass = "";
  if (isPrivate) {
    pass = document.getElementById("customRoomPass").value;
    if (String(pass || "").length < 5) {
      document.getElementById("createError").style.display = "block";
      return;
    }
  }

  try {
    const r = await fetchAPI("/api/conquest/create", "POST", { pass });
    curRoomId = r.roomId;
    myRole = r.role || "p1";
    toggleModal("roomTypeModal", false);
    toggleModal("privateSettingsModal", false);
    enterGame(curRoomId, true);
  } catch (e) {
    showModalAlert("HATA", e.message);
  }
}

let pendingJoinId = null;
function joinHandler(id, isPrivate) {
  if (isPrivate) {
    pendingJoinId = id;
    document.getElementById("passError").style.display = "none";
    document.getElementById("joinRoomPassInput").value = "";
    toggleModal("passwordEntryModal", true);
  } else {
    completeJoin(id, "");
  }
}

document.getElementById("confirmJoinPass").addEventListener("click", () => {
  completeJoin(pendingJoinId, document.getElementById("joinRoomPassInput").value);
});

async function completeJoin(id, pass) {
  try {
    const r = await fetchAPI("/api/conquest/join", "POST", { roomId: id, pass });
    curRoomId = id;
    myRole = r.role || "p2";
    toggleModal("passwordEntryModal", false);
    enterGame(id, true);
  } catch (e) {
    document.getElementById("passError").style.display = "block";
    document.getElementById("passError").textContent = e.message;
  }
}

// -------------------- Game --------------------
function startHeartbeat(roomId) {
  stopHeartbeat();
  heartbeatInt = setInterval(() => {
    fetchAPI("/api/conquest/heartbeat", "POST", { roomId }).catch(() => {});
  }, 2000);
}

function stopHeartbeat() {
  if (heartbeatInt) clearInterval(heartbeatInt);
  heartbeatInt = null;
}

function startTimerUi(getEndTimeMs) {
  stopTimerUi();
  timerUiInt = setInterval(() => {
    const end = Number(getEndTimeMs());
    if (!Number.isFinite(end) || end <= 0) return;
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    document.getElementById("timer-display").textContent = left;
  }, 250);
}

function stopTimerUi() {
  if (timerUiInt) clearInterval(timerUiInt);
  timerUiInt = null;
}

function enterGame(id) {
  if (unsubLobby) unsubLobby();
  unsubLobby = null;

  currentScene = "game";

  sfx.lobby.pause();
  sfx.rain.currentTime = 0;
  if (audioUnlocked) sfx.rain.play().catch(() => {});
  triggerLightning();

  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-view").style.display = "flex";

  // ✅ üst bar isimleri aç (snap geldiğinde güncellenecek)
  setTopNames("-", "-", true);

  isFin = false;
  canPlay = false;

  // grid build
  const g = document.getElementById("grid");
  g.innerHTML = "";
  for (let i = 0; i < 36; i++) {
    const c = document.createElement("div");
    c.className = "cell";
    c.setAttribute("role", "button");

    // zoom/scroll engelle
    c.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        if (!canPlay || isFin) return;
        fetchAPI("/api/conquest/click", "POST", { roomId: id, cellIndex: i }).catch(() => {});
        if (audioUnlocked) {
          sfx.tap.currentTime = 0;
          sfx.tap.play().catch(() => {});
        }
      },
      { passive: false }
    );

    g.appendChild(c);
  }

  const ref = doc(db, "conquest_rooms", id);

  unsubGame = onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) {
        if (snap.metadata.fromCache) return;
        showModalAlert("HATA", "Oda bulunamadı / kapandı.", () => leaveToLobby(false));
        return;
      }

      const d = snap.data();

      if (d.p1 === uid) myRole = "p1";
      else if (d.p2 === uid) myRole = "p2";
      else {
        showModalAlert("HATA", "Bu odada değilsin.", () => leaveToLobby(false));
        return;
      }

      const p1Name = d.p1Name || "PİLOT";
      const p2Name = d.p2Name || "BEKLENİYOR...";

      document.getElementById("n1").textContent = p1Name;
      document.getElementById("n2").textContent = p2Name;

      // ✅ üst barda isimler
      setTopNames(p1Name, p2Name, true);

      const s1 = Number.isFinite(Number(d.score1)) ? Number(d.score1) : 0;
      const s2 = Number.isFinite(Number(d.score2)) ? Number(d.score2) : 0;
      document.getElementById("s1").textContent = s1;
      document.getElementById("s2").textContent = s2;

      const cells = d.cells || {};
      document.querySelectorAll(".cell").forEach((cell, i) => {
        const v = cells[i];
        cell.className = v ? `cell ${v}` : "cell";
      });

      if (d.status === "playing") {
        canPlay = true;
        startHeartbeat(id);
        startTimerUi(() => d.endTimeMs || 0);
      }

      if (d.status === "terminated" && !isFin) {
        isFin = true;
        canPlay = false;
        stopHeartbeat();
        stopTimerUi();
        showModalAlert("Oyun Bitti", "Bir oyuncu odadan ayrıldı.", () => toggleModal("resultModal", false));
      }

      if (d.status === "finished" && !isFin) {
        isFin = true;
        canPlay = false;
        stopHeartbeat();
        stopTimerUi();

        const winner = d.winner || null;
        const win = winner && winner === uid;

        const label = document.getElementById("winnerLabel");
        label.textContent = s1 === s2 ? "BERABERE" : win ? "ZAFER" : "BOZGUN";
        label.className = "result-header " + (win ? "win-text" : "lose-text");

        document.getElementById("finalS1").textContent = s1;
        document.getElementById("finalS2").textContent = s2;
        toggleModal("resultModal", true);
      }
    },
    (err) => {
      console.error("Game snapshot error", err);
      showModalAlert("HATA", "Bağlantı sorunu. Lobiye dön.", () => leaveToLobby(false));
    }
  );
}

// -------------------- Leave / Back to Lobby --------------------
async function leaveToLobby(callServerLeave) {
  if (unsubGame) unsubGame();
  unsubGame = null;

  stopHeartbeat();
  stopTimerUi();

  if (lightningTimer) clearTimeout(lightningTimer);
  lightningTimer = null;
  lightningFlash = 0;

  if (callServerLeave && curRoomId) {
    fetchAPI("/api/conquest/leave", "POST", { roomId: curRoomId }).catch(() => {});
  }

  curRoomId = null;
  myRole = null;
  isFin = false;
  canPlay = false;

  currentScene = "lobby";

  // ✅ üst bar isimleri kapat
  setTopNames("-", "-", false);

  sfx.rain.pause();
  sfx.thunder.pause();
  if (audioUnlocked) {
    sfx.lobby.currentTime = 0;
    sfx.lobby.play().catch(() => {});
  }

  document.getElementById("game-view").style.display = "none";
  document.getElementById("lobby").style.display = "flex";
  toggleModal("resultModal", false);
  toggleModal("alertModal", false);

  listenLobby();
}

// ❌ pagehide/beforeunload leave yok (atıyor sorununu önler)
