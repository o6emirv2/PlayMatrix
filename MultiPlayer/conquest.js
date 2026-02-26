import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

async function fetchAPI(endpoint, method = 'GET', body = null) {
    if (!auth.currentUser) return { ok: false };
    const token = await auth.currentUser.getIdToken();
    const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${API_URL}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Sunucu hatası.");
    return data;
}

const sfx = {
    lobby: new Audio('https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3'),
    tap: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3'),
    rain: new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_73d9136e05.mp3'), 
    thunder: new Audio('https://cdn.pixabay.com/audio/2022/03/24/audio_924ebc01e6.mp3') 
};
sfx.lobby.loop = true; sfx.rain.loop = true; 
sfx.lobby.volume = 0.4; sfx.tap.volume = 0.8; sfx.rain.volume = 1.0; sfx.thunder.volume = 1.0; 

let audioUnlocked = false;
const unlockAudio = () => {
    if (!audioUnlocked) {
        Object.values(sfx).forEach(a => { a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(()=>{}); });
        audioUnlocked = true;
        if(currentScene === 'lobby') sfx.lobby.play().catch(()=>{});
    }
};
document.body.addEventListener('touchstart', unlockAudio, {once:true});
document.body.addEventListener('click', unlockAudio, {once:true});

let uid = null, curRoomId = null, myRole, isFin = false, canPlay = false, timerInt = null;
let unsubLobby = null, unsubGame = null;
let currentScene = 'lobby'; 
let lightningTimer = null; 

const toggleModal = (id, show) => { document.getElementById(id).style.display = show ? 'flex' : 'none'; };
const showModalAlert = (title, msg, onConfirm) => {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMsg').textContent = msg;
    document.getElementById('alertCancelBtn').style.display = onConfirm ? 'block' : 'none';
    document.getElementById('alertOkBtn').onclick = () => { toggleModal('alertModal', false); if(onConfirm) onConfirm(); };
    toggleModal('alertModal', true);
};

const canvas = document.getElementById('bg-canvas'); const ctx = canvas.getContext('2d');
let lobbyParticles = [], rainParticles = [], lightningFlash = 0;
function initParticles() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    lobbyParticles = Array.from({length: 60}, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 2, s: Math.random() * 0.5 }));
    rainParticles = Array.from({length: 150}, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, l: Math.random() * 25 + 15, s: Math.random() * 20 + 15, w: Math.random() * 1.5 + 0.5, o: Math.random() * 0.4 + 0.1 }));
}
function triggerLightning() {
    if (currentScene !== 'game') return; 
    lightningFlash = 3; 
    if (audioUnlocked) { sfx.thunder.currentTime = 0; sfx.thunder.play().catch(()=>{}); }
    lightningTimer = setTimeout(triggerLightning, Math.random() * 10000 + 8000);
}
function drawBg() {
    if (currentScene === 'lobby') {
        ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 242, 255, 0.2)';
        lobbyParticles.forEach(p => { p.y -= p.s; if(p.y < 0) p.y = canvas.height; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill(); });
    } else if (currentScene === 'game') {
        ctx.fillStyle = 'rgba(3, 5, 10, 0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (lightningFlash > 0) { ctx.fillStyle = `rgba(230, 240, 255, ${Math.random() * 0.6 + 0.2})`; ctx.fillRect(0, 0, canvas.width, canvas.height); lightningFlash--; }
        ctx.lineCap = 'round';
        rainParticles.forEach(p => { 
            ctx.strokeStyle = `rgba(200, 220, 255, ${p.o})`; p.y += p.s; p.x -= p.s * 0.1; 
            if(p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width + 50; } 
            ctx.beginPath(); ctx.lineWidth = p.w; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * 0.1, p.y - p.l); ctx.stroke(); 
        });
    }
    requestAnimationFrame(drawBg);
}
initParticles(); drawBg();

onAuthStateChanged(auth, async user => {
    if(!user) { window.location.href = '/'; return; }
    uid = user.uid;
    const res = await fetchAPI('/api/me');
    // İsim Garantileme Yöntemi
    document.getElementById('meName').textContent = res?.user?.username || res?.user?.fullName || "PİLOT";
    document.getElementById('createRoomBtn').disabled = false;
    document.getElementById('quickJoinBtn').disabled = false;
    listenLobby();
});

// ZERO-TRUST LOBİ SİSTEMİ 
function listenLobby() {
    if(unsubLobby) unsubLobby();
    const q = query(collection(db, "conquest_rooms"), where("status", "in", ["waiting", "playing"]));
    
    unsubLobby = onSnapshot(q, snap => {
        try {
            const list = document.getElementById('roomList'); list.innerHTML = "";
            let count = 0;
            
            snap.forEach(d => {
                const r = d.data();
                if (r.p1 === uid) return; 
                
                const p1n = r.p1Name || "PİLOT";
                const p2n = r.p2Name || "BEKLENİYOR...";

                if(r.status === 'waiting') {
                    count++;
                    const card = document.createElement('div'); card.className = "room-card";
                    const info = document.createElement('div'); info.className = "room-info";
                    const title = document.createElement('div'); title.className = "room-title"; title.textContent = `BÖLGE: ${d.id} ${r.isPrivate ? '🔒' : '🔓'}`;
                    const players = document.createElement('div'); players.className = "room-players";
                    players.innerHTML = `<span style="color:var(--p1)">${p1n}</span> <span style="color:#555">vs</span> <span style="color:var(--p2)">BEKLENİYOR...</span>`;
                    info.append(title, players);

                    const act = document.createElement('div'); act.className = "room-action";
                    const btn = document.createElement('button'); btn.className = "btn-neon btn-sec"; btn.textContent = "GİRİŞ YAP";
                    btn.addEventListener('click', () => joinHandler(d.id, r.isPrivate));
                    act.appendChild(btn);

                    card.append(info, act); list.appendChild(card);
                } else if(r.status === 'playing') {
                    count++;
                    
                    let s1 = 0, s2 = 0;
                    if(r.cells) {
                        for(let i=0; i<36; i++) { if(r.cells[i] === 'p1') s1++; else if(r.cells[i] === 'p2') s2++; }
                    }

                    const card = document.createElement('div'); card.className = "room-card";
                    const info = document.createElement('div'); info.className = "room-info";
                    const title = document.createElement('div'); title.className = "room-title"; title.textContent = `BÖLGE: ${d.id} ⚔️`;
                    const players = document.createElement('div'); players.className = "room-players";
                    players.innerHTML = `<span style="color:var(--p1)">${p1n} (${s1})</span> <span style="color:#555">vs</span> <span style="color:var(--p2)">${p2n} (${s2})</span>`;
                    
                    const timeDiv = document.createElement('div'); timeDiv.className = "room-time"; timeDiv.style.color = "var(--danger)";
                    timeDiv.textContent = `🔴 SAVAŞTA`;
                    
                    info.append(title, players, timeDiv);
                    
                    const act = document.createElement('div'); act.className = "room-action";
                    const btn = document.createElement('button'); btn.className = "btn-neon"; btn.disabled = true; btn.style.background = "#222"; btn.textContent = "MEŞGUL";
                    act.appendChild(btn);

                    card.append(info, act); list.appendChild(card);
                }
            });
            document.getElementById('emptyLobbyMsg').style.display = (count === 0) ? 'block' : 'none';
        } catch(e) { console.error("Lobi Hatası", e); }
    });
}

document.getElementById('btnExit').addEventListener('click', () => {
    if (currentScene === 'game') showModalAlert('ONAY', 'Savaş alanından ayrılıp lobiye dönmek istediğine emin misin?', leaveToLobby);
    else window.location.href = "index.html";
});
document.getElementById('roomSearch').addEventListener('input', (e) => {
    const s = e.target.value.toLowerCase();
    document.querySelectorAll('.room-card').forEach(c => c.style.display = c.textContent.toLowerCase().includes(s) ? 'flex' : 'none');
});
document.getElementById('createRoomBtn').addEventListener('click', () => toggleModal('roomTypeModal', true));
document.getElementById('quickJoinBtn').addEventListener('click', () => {
    let target = null; document.querySelectorAll('.room-card').forEach(c => { if(c.textContent.includes('🔓') && !c.textContent.includes('MEŞGUL')) target = c; });
    if(target) target.querySelector('button').click(); else showModalAlert("HATA", "Uygun şifresiz arena yok.");
});
document.getElementById('btnHelp').addEventListener('click', () => toggleModal('helpModal', true));
document.getElementById('btnUnderstand').addEventListener('click', () => toggleModal('helpModal', false));
document.getElementById('btnCancelType').addEventListener('click', () => toggleModal('roomTypeModal', false));
document.getElementById('btnPublicArena').addEventListener('click', () => createArena(false));
document.getElementById('btnPrivateArena').addEventListener('click', () => { toggleModal('roomTypeModal', false); toggleModal('privateSettingsModal', true); });
document.getElementById('btnCancelPrivate').addEventListener('click', () => toggleModal('privateSettingsModal', false));
document.getElementById('btnCreatePrivate').addEventListener('click', () => createArena(true));
document.getElementById('btnCancelJoinPass').addEventListener('click', () => toggleModal('passwordEntryModal', false));
document.getElementById('alertCancelBtn').addEventListener('click', () => toggleModal('alertModal', false));
document.getElementById('btnReturnLobby').addEventListener('click', () => leaveToLobby());

async function createArena(isPrivate) {
    let pass = "";
    if(isPrivate) {
        pass = document.getElementById('customRoomPass').value;
        if(pass.length < 5) { document.getElementById('createError').style.display = 'block'; return; }
    }
    try {
        const res = await fetchAPI('/api/conquest/create', 'POST', { pass });
        curRoomId = res.roomId; myRole = 'p1';
        toggleModal('roomTypeModal', false); toggleModal('privateSettingsModal', false);
        enterGame(curRoomId);
    } catch(e) { showModalAlert("HATA", e.message); }
}

let pendingJoinId = null;
function joinHandler(id, isPrivate) {
    if(isPrivate) { pendingJoinId = id; toggleModal('passwordEntryModal', true); } 
    else completeJoin(id);
}
document.getElementById('confirmJoinPass').addEventListener('click', () => { completeJoin(pendingJoinId, document.getElementById('joinRoomPassInput').value); });

async function completeJoin(id, pass = "") {
    try {
        await fetchAPI('/api/conquest/join', 'POST', { roomId: id, pass });
        curRoomId = id; myRole = 'p2';
        toggleModal('passwordEntryModal', false);
        enterGame(id);
    } catch(e) { document.getElementById('passError').style.display = 'block'; document.getElementById('passError').textContent = e.message; }
}

function enterGame(id) {
    if(unsubLobby) unsubLobby();
    currentScene = 'game';
    sfx.lobby.pause(); sfx.rain.currentTime = 0; if (audioUnlocked) sfx.rain.play().catch(()=>{}); triggerLightning(); 

    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game-view').style.display = 'flex';
    
    const g = document.getElementById('grid'); g.innerHTML = "";
    for(let i=0; i<36; i++) {
        const c = document.createElement('div'); c.className = 'cell'; c.setAttribute('role', 'button');
        
        c.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if(canPlay && !isFin && c.className !== `cell ${myRole}`) {
                c.className = `cell ${myRole}`; 
                sfx.tap.currentTime = 0; if(audioUnlocked) sfx.tap.play().catch(()=>{});
                fetchAPI('/api/conquest/click', 'POST', { roomId: id, cellIndex: i }).catch(()=>{});
            }
        });
        g.appendChild(c);
    }

    unsubGame = onSnapshot(doc(db, "conquest_rooms", id), snap => {
        try {
            // Oda bittiğinde veya silindiğinde istemciyi kendi kendine atmasını engelledik
            if(!snap.exists()) { 
                if(!isFin && currentScene === 'game') leaveToLobby(); 
                return; 
            }
            const d = snap.data();
            
            // Eğer oyun oynanırken biri çıkarsa sunucu 'terminated' yapar
            if(d.status === 'terminated' && !isFin) { 
                isFin = true; 
                let msg = d.winner === uid ? "Rakip kaçtı, SAVAŞI KAZANDIN!" : "Oyun koptu!";
                showModalAlert("SAVAŞ SONA ERDİ", msg, leaveToLobby); 
                return; 
            }

            document.getElementById('n1').textContent = d.p1Name || "PİLOT";
            document.getElementById('n2').textContent = d.p2Name || "BEKLENİYOR...";

            if(d.status === 'playing') canPlay = true;

            // Sadece görsel geri sayım, işlemi sunucu yapacak
            if(d.status === 'playing' && d.endTimeMs && !isFin) {
                if(!timerInt) {
                    timerInt = setInterval(() => {
                        let left = Math.ceil((d.endTimeMs - Date.now()) / 1000);
                        if(left <= 0) { 
                            left = 0; 
                            clearInterval(timerInt); timerInt = null; 
                            canPlay = false; // Tıklamalar kapanır, sunucunun karar vermesi beklenir
                        }
                        document.getElementById('timer-display').textContent = left;
                    }, 500); 
                }
            }

            let s1=0, s2=0;
            document.querySelectorAll('.cell').forEach((c, i) => {
                if(d.cells && d.cells[i]) { 
                    c.className = 'cell ' + d.cells[i]; d.cells[i] === 'p1' ? s1++ : s2++; 
                } else c.className = 'cell'; 
            });
            document.getElementById('s1').textContent = s1; document.getElementById('s2').textContent = s2;

            // Sunucu oyunu bitirdiyse sonuç ekranını göster
            if(d.status === 'finished' && !isFin) {
                finish(id, s1, s2, d.winner);
            }
        } catch(e) { console.error("Sync Hatası", e); }
    });
}

function finish(id, s1, s2, winner) {
    isFin = true; if(timerInt) { clearInterval(timerInt); timerInt = null; } canPlay = false; 
    const win = (myRole === 'p1' && winner === uid) || (myRole === 'p2' && winner === uid);
    const label = document.getElementById('winnerLabel');
    label.textContent = s1 === s2 ? "BERABERE" : (win ? "ZAFER" : "BOZGUN");
    label.className = "result-header " + (win ? "win-text" : "lose-text");
    document.getElementById('finalS1').textContent = s1;
    document.getElementById('finalS2').textContent = s2;
    toggleModal('resultModal', true);
}

async function leaveToLobby() {
    if (curRoomId) {
        if (unsubGame) unsubGame(); if (timerInt) { clearInterval(timerInt); timerInt = null; } if (lightningTimer) clearTimeout(lightningTimer);
        try { fetchAPI('/api/conquest/leave', 'POST', { roomId: curRoomId }); } catch (e) {} 
    }
    curRoomId = null; isFin = false; canPlay = false; myRole = null; currentScene = 'lobby'; lightningFlash = 0;
    sfx.rain.pause(); sfx.thunder.pause(); if (audioUnlocked) { sfx.lobby.currentTime = 0; sfx.lobby.play().catch(()=>{}); }
    document.getElementById('game-view').style.display = 'none'; document.getElementById('lobby').style.display = 'flex';
    toggleModal('resultModal', false); toggleModal('alertModal', false);
    listenLobby(); 
}

// Oyundan acil çıkışlar için bağlantı kopma tespiti
window.addEventListener("pagehide", () => {
    if (curRoomId && !isFin && auth.currentUser) {
        fetchAPI('/api/conquest/leave', 'POST', { roomId: curRoomId }).catch(()=>{});
    }
});
