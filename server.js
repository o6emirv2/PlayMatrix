'use strict';

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

process.on('uncaughtException', (err) => console.error('Kritik Hata (Çökme Engellendi):', err));
process.on('unhandledRejection', (reason) => console.error('İşlenmeyen Promise Hatası:', reason));

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

(function initFirebase() {
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_KEY) throw new Error('FIREBASE_KEY missing');
  let serviceAccount;
  try { serviceAccount = JSON.parse(process.env.FIREBASE_KEY); } 
  catch (e) { throw new Error('FIREBASE_KEY JSON parse hatası.'); }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('✅ Firebase Admin bağlandı.');
})();

const db = admin.firestore();
const auth = admin.auth();
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: function (origin, cb) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Tıklama oyunu için genel limit 800'e çıkarıldı (Akıcı Oynanış İçin)
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 800, standardHeaders: true, legacyHeaders: false });
app.use(generalLimiter);

const bonusLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { ok: false, error: "Çok fazla deneme yaptınız. Lütfen 15 dakika bekleyin." } });

app.get('/', (req, res) => res.status(200).send('✅ PlayMatrix API is running'));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Oturum yok.' });
  try { req.user = await auth.verifyIdToken(h.split(' ')[1]); return next(); } 
  catch (e) { return res.status(401).json({ ok: false, error: 'Geçersiz token.' }); }
};

const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim().replace(/</g,"") : ''); 
const nowMs = () => Date.now();
const ALLOWED_AVATAR_DOMAIN = "https://encrypted-tbn0.gstatic.com/";

const colUsers = () => db.collection('users');
const colPromos = () => db.collection('promo_codes');
const colPublic = () => db.collection('rooms_public');
const colState  = () => db.collection('rooms_state');
const colPass   = () => db.collection('rooms_passwords');
const playersSub = (roomId) => colPublic().doc(roomId).collection('players');

// ==========================================
// KULLANICI PROFİL & ÇARK
// ==========================================
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const uRef = db.collection('users').doc(req.user.uid);
    const snap = await uRef.get();
    res.json({ ok: true, balance: safeNum(snap.exists ? snap.data().balance : 0, 0), user: snap.exists ? snap.data() : {} });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/profile/update', verifyAuth, async (req, res) => {
  try {
    const { fullName, phone, username, avatar } = req.body || {};
    const uid = req.user.uid; const userRef = colUsers().doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef); if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {}; const updates = {};
      if (!u.email && req.user.email) updates.email = req.user.email;
      if (cleanStr(fullName) && !cleanStr(u.fullName)) updates.fullName = cleanStr(fullName);
      if (cleanStr(phone) && !cleanStr(u.phone)) updates.phone = cleanStr(phone);
      if (typeof avatar === 'string' && avatar.startsWith(ALLOWED_AVATAR_DOMAIN)) updates.avatar = avatar;
      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        const used = safeNum(u.userChangeCount, 0); if (used >= 3) throw new Error("İsim hakkı doldu!");
        const qSnap = await tx.get(db.collection('users').where('username', '==', wanted).limit(1));
        if (!qSnap.empty && qSnap.docs[0].id !== uid) throw new Error("Bu isim kullanımda!");
        updates.username = wanted; updates.userChangeCount = used + 1;
      }
      if (Object.keys(updates).length > 0) tx.update(userRef, updates);
    });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/wheel/spin', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid; const userRef = colUsers().doc(uid);
    const rewards = [2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000];
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef); if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {}; const lastSpin = safeNum(u.lastSpin, 0);
      if ((nowMs() - lastSpin) < 86400000) throw new Error("Süre dolmadı.");
      const rnd = crypto.randomInt(0, rewards.length); const prize = rewards[rnd];
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(prize), lastSpin: nowMs() });
      return { index: rnd, prize, balance: safeNum(u.balance, 0) + prize };
    });
    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/bonus/claim', verifyAuth, bonusLimiter, async (req, res) => {
  try {
    const code = cleanStr((req.body || {}).code).toUpperCase(); if (!code) throw new Error("Kod boş.");
    const uid = req.user.uid; const userRef = colUsers().doc(uid); const promoRef = colPromos().doc(code);
    const out = await db.runTransaction(async (tx) => {
      const [uSnap, pSnap] = await Promise.all([tx.get(userRef), tx.get(promoRef)]);
      if (!uSnap.exists || !pSnap.exists) throw new Error("Hata.");
      const u = uSnap.data() || {}; const p = pSnap.data() || {};
      const amount = safeNum(p.amount, 0); if (amount <= 0) throw new Error("Kod pasif.");
      const used = Array.isArray(u.usedPromos) ? u.usedPromos : []; if (used.includes(code)) throw new Error("Kullanılmış.");
      const limitLeft = safeNum(p.limitLeft, -1); if (limitLeft === 0) throw new Error("Tükendi.");
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(amount), usedPromos: admin.firestore.FieldValue.arrayUnion(code) });
      if (limitLeft > 0) tx.update(promoRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });
      return { amount, balance: safeNum(u.balance, 0) + amount };
    });
    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ==========================================
// GRID CONQUEST API (GÜÇLENDİRİLMİŞ ZERO-TRUST, AKICI YAPI)
// ==========================================

// Oyunu bitiren merkezi sunucu fonksiyonu
async function settleConquestRoom(rid) {
  const roomRef = db.collection('conquest_rooms').doc(rid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) return;
      const data = snap.data();

      if (data.status !== "playing") return;

      let s1 = 0, s2 = 0;
      const cells = data.cells || {};
      for (let i=0; i<36; i++) { if (cells[i] === 'p1') s1++; else if (cells[i] === 'p2') s2++; }

      let winner = null;
      if (s1 > s2) winner = data.p1;
      else if (s2 > s1) winner = data.p2;

      tx.update(roomRef, { status: "finished", winner: winner || "draw" });

      if (winner && winner !== "draw") {
          tx.update(db.collection('users').doc(winner), { balance: admin.firestore.FieldValue.increment(500) });
      }
    });
  } catch(e) { console.error("Oda bitirme hatası:", e); }
}

app.post('/api/conquest/create', verifyAuth, async (req, res) => {
  try {
    const pass = cleanStr(req.body.pass);
    const isPrivate = pass.length >= 5;
    const rid = crypto.randomBytes(3).toString('hex').toUpperCase();

    const userRef = db.collection('users').doc(req.user.uid);
    const roomRef = db.collection('conquest_rooms').doc(rid);
    const passRef = db.collection('conquest_pass').doc(rid);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      const uData = uSnap.exists ? uSnap.data() : {};
      // İsim bulma garantilendi
      const uname = uData.username || uData.fullName || "Pilot";

      tx.set(roomRef, { 
        id: rid, p1: req.user.uid, p1Name: uname, p2: null, p2Name: null, 
        status: "waiting", isPrivate, cells: {}, createdAt: admin.firestore.FieldValue.serverTimestamp() 
      });
      if (isPrivate) tx.set(passRef, { pass });
    });

    res.json({ ok: true, roomId: rid });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/conquest/join', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const pass = cleanStr(req.body.pass);
    if (!rid) throw new Error("Arena ID gerekli!");

    const userRef = db.collection('users').doc(req.user.uid);
    const roomRef = db.collection('conquest_rooms').doc(rid);
    const passRef = db.collection('conquest_pass').doc(rid);

    await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(roomRef);
      if (!rSnap.exists) throw new Error("Arena kapalı!");
      const rData = rSnap.data();

      if (rData.status !== "waiting") throw new Error("Arena dolu!");
      if (rData.isPrivate) {
          const passData = await tx.get(passRef);
          if (!passData.exists || passData.data().pass !== pass) throw new Error("Hatalı şifre!");
      }
      if (rData.p1 === req.user.uid) throw new Error("Kendi arenana giremezsin.");

      const uSnap = await tx.get(userRef);
      const uData = uSnap.exists ? uSnap.data() : {};
      const uname = uData.username || uData.fullName || "Pilot";

      const now = Date.now();
      // Sunucu bitiş süresini belirler (60 saniye)
      tx.update(roomRef, { 
        p2: req.user.uid, 
        p2Name: uname, 
        status: "playing",
        startedAtMs: now,
        endTimeMs: now + 60000 
      });
    });

    // Sunucu içindeki sayaç oyunu tam 60.5 saniye sonra kapatır!
    setTimeout(() => settleConquestRoom(rid), 60500);

    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// Oyunun akıcılığını artırmak için Transaction YERİNE Direct Update kullanıldı. 
app.post('/api/conquest/click', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const idx = parseInt(req.body.cellIndex, 10);
    if (!rid || isNaN(idx) || idx < 0 || idx > 35) return res.json({ok:false});

    const roomRef = db.collection('conquest_rooms').doc(rid);
    const snap = await roomRef.get();
    if (!snap.exists) return res.json({ok:false});
    const data = snap.data();

    if (data.status !== "playing") return res.json({ok:false});

    // Süre dolmuşsa tıklamaları iptal et ve sunucu çökme durumuna karşı oyunu bitir
    if (data.endTimeMs && Date.now() > data.endTimeMs) {
        settleConquestRoom(rid);
        return res.json({ok:false});
    }

    let role = null;
    if (data.p1 === req.user.uid) role = "p1";
    else if (data.p2 === req.user.uid) role = "p2";
    if (!role) return res.json({ok:false});

    if (data.cells && data.cells[idx] === role) return res.json({ok:true});

    // Direkt yazma ile donma ihtimali %0'a indirildi
    await roomRef.update({ [`cells.${idx}`]: role });
    
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

app.post('/api/conquest/leave', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const roomRef = db.collection('conquest_rooms').doc(rid);
    const passRef = db.collection('conquest_pass').doc(rid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) return;
      const data = snap.data();

      let role = null;
      if (data.p1 === req.user.uid) role = "p1";
      else if (data.p2 === req.user.uid) role = "p2";
      if (!role) return;

      if (data.status === "waiting") {
        if (role === "p1") { tx.delete(roomRef); tx.delete(passRef); }
        else { tx.update(roomRef, { p2: null, p2Name: null, status: "waiting" }); }
      } else if (data.status === "playing") {
        // Çıkan kaybeder, diğeri kazanır
        const winner = (role === "p1") ? data.p2 : data.p1;
        tx.update(roomRef, { status: "terminated", winner: winner });
        if(winner) tx.update(db.collection('users').doc(winner), { balance: admin.firestore.FieldValue.increment(500) });
      }
      // "finished" olanları ellemeyin, istemci skoru görebilsin
    });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

// ==========================================
// PIŞTİ (Aynen korundu)
// ==========================================
const CARD_POINTS_PISTI = { "D0": 3, "C2": 2 }; 
const normalizeCardValPisti = (c) => { if (!c) return ""; const v = c.substring(0, c.length - 1); return (v === '0') ? '10' : v; };
const calculatePointsPisti = (cards) => { let p = 0; for (const c of cards) { if (CARD_POINTS_PISTI[c]) p += CARD_POINTS_PISTI[c]; else { const val = normalizeCardValPisti(c); if (val === 'A' || val === 'J') p += 1; } } return p; };
function createShuffledDeckPisti(isDouble) { const s = ["H", "D", "C", "S"], v = ["A","2","3","4","5","6","7","8","9","0","J","Q","K"]; let d = []; for (const suit of s) for (const val of v) d.push(val + suit); if (isDouble) d = [...d, ...d]; for (let i = d.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; }
function maxPlayersByTypePisti(type) { return String(type || "2-52").startsWith("4") ? 4 : 2; }
function is104Pisti(type) { return String(type || "").includes("104"); }
function buildPublicDocPisti({ name, type, bet, status, hasPassword, playersCount, maxP, createdAtMs, p1, p2, p3, p4, p1_name, p2_name, p3_name, p4_name }) { return { name: cleanStr(name) || "Arena", type: cleanStr(type) || "2-52", bet: safeNum(bet, 0), status: cleanStr(status) || "waiting", hasPassword: !!hasPassword, playersCount: safeNum(playersCount, 0), maxPlayers: safeNum(maxP, 2), p1: p1 || null, p2: p2 || null, p3: p3 || null, p4: p4 || null, p1_name: p1_name || null, p2_name: p2_name || null, p3_name: p3_name || null, p4_name: p4_name || null, createdAt: admin.firestore.FieldValue.serverTimestamp(), createdAtMs: safeNum(createdAtMs, nowMs()), updatedAtMs: nowMs() }; }
function buildInitialStatePisti({ type, deck, initialTable, bet }) { const state = { type: cleanStr(type) || "2-52", status: "waiting", bet: safeNum(bet, 0), deck: deck || [], table: initialTable || [], turn: null, lastCollector: null, pistiSignal: 0, finishedAtMs: null, settled: false }; for (let i = 1; i <= 4; i++) { state[`p${i}`] = null; state[`p${i}_name`] = null; state[`p${i}_score`] = 0; state[`p${i}_count`] = 0; state[`p${i}_hand`] = []; } return state; }
function pickRolePisti(state, maxP) { if (!state.p1) return "p1"; if (!state.p2) return "p2"; if (maxP === 4) { if (!state.p3) return "p3"; if (!state.p4) return "p4"; } return null; }

app.post('/api/pisti/create', verifyAuth, async (req, res) => {
  try {
    const { name, type, pass, bet } = req.body || {};
    const betNum = safeNum(bet, 0);
    if (!Number.isInteger(betNum) || betNum < 100) throw new Error("Bahis min 100 MC olmalı!");
    const ttype = cleanStr(type) || "2-52"; const maxP = maxPlayersByTypePisti(ttype); const hasPassword = !!cleanStr(pass);
    const roomId = `room_${nowMs()}_${req.user.uid.slice(0,4)}`; const userRef = colUsers().doc(req.user.uid); const pubRef  = colPublic().doc(roomId); const stateRef= colState().doc(roomId); const passRef = colPass().doc(roomId);
    const deck = createShuffledDeckPisti(is104Pisti(ttype)); const initialTableCount = (ttype === "4-104") ? 8 : 4; const initialTable = deck.splice(0, initialTableCount);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef); const uData = uSnap.exists ? (uSnap.data() || {}) : {};
      if (safeNum(uData.balance, 0) < betNum) throw new Error("Yetersiz bakiye!");
      const uname = cleanStr(uData.username) || "Oyuncu";
      tx.set(pubRef, buildPublicDocPisti({ name, type: ttype, bet: betNum, status: "waiting", createdAtMs: nowMs(), hasPassword, playersCount: 1, maxP, p1: req.user.uid, p1_name: uname }));
      tx.set(playersSub(roomId).doc(req.user.uid), { uid: req.user.uid, name: uname, role: "p1", joinedAtMs: nowMs() });
      const state = buildInitialStatePisti({ type: ttype, deck, initialTable, bet: betNum }); state.p1 = req.user.uid; state.p1_name = uname; tx.set(stateRef, state);
      if (hasPassword) tx.set(passRef, { password: cleanStr(pass), updatedAtMs: nowMs() }, { merge: true });
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-betNum) });
    });
    res.json({ ok: true, roomId });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/pisti/join', verifyAuth, async (req, res) => {
  try {
    const { roomId, pass } = req.body || {}; const rid = cleanStr(roomId); if (!rid) throw new Error("roomId gerekli");
    const userRef = colUsers().doc(req.user.uid); const pubRef = colPublic().doc(rid); const stateRef = colState().doc(rid); const passRef = colPass().doc(rid);
    const role = await db.runTransaction(async (tx) => {
      const [uSnap, pubSnap, stSnap, passSnap] = await Promise.all([ tx.get(userRef), tx.get(pubRef), tx.get(stateRef), tx.get(passRef) ]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda bulunamadı / kapandı!");
      const pub = pubSnap.data() || {}; const st  = stSnap.data() || {};
      if (cleanStr(st.status) !== "waiting") throw new Error("Oyun başlamış veya bitmiş!");
      const storedPass = passSnap.exists ? cleanStr((passSnap.data() || {}).password) : ""; if (storedPass && storedPass !== cleanStr(pass)) throw new Error("Hatalı şifre!");
      const uData = uSnap.exists ? (uSnap.data() || {}) : {}; const bet = safeNum(pub.bet, 0);
      if (safeNum(uData.balance, 0) < bet) throw new Error("Bakiye yetersiz!");
      const maxP = maxPlayersByTypePisti(st.type || pub.type); const assigned = pickRolePisti(st, maxP); if (!assigned) throw new Error("Oda dolu!");
      const uname = cleanStr(uData.username) || "Oyuncu";
      tx.update(stateRef, { [assigned]: req.user.uid, [assigned + "_name"]: uname });
      const pubUp = { playersCount: admin.firestore.FieldValue.increment(1), updatedAtMs: nowMs(), [assigned]: req.user.uid, [assigned + "_name"]: uname };
      if (safeNum(pub.playersCount, 0) + 1 >= maxP) { pubUp.status = "playing"; tx.update(stateRef, { status: "playing", turn: st.p1 || req.user.uid }); }
      tx.update(pubRef, pubUp); tx.set(playersSub(rid).doc(req.user.uid), { uid: req.user.uid, name: uname, role: assigned, joinedAtMs: nowMs() });
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-bet) });
      return assigned;
    });
    res.json({ ok: true, role });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/pisti/leave', verifyAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {}; const rid = cleanStr(roomId); if (!rid) throw new Error("roomId gerekli");
    const userRef = colUsers().doc(req.user.uid); const pubRef = colPublic().doc(rid); const stateRef = colState().doc(rid); const passRef = colPass().doc(rid);
    await db.runTransaction(async (tx) => {
      const [uSnap, pubSnap, stSnap] = await Promise.all([ tx.get(userRef), tx.get(pubRef), tx.get(stateRef) ]);
      if (!pubSnap.exists || !stSnap.exists) return;
      const pub = pubSnap.data() || {}; const st  = stSnap.data() || {};
      const bet = safeNum(pub.bet, 0); const maxP = maxPlayersByTypePisti(st.type || pub.type);
      let myRole = null; for (let i = 1; i <= maxP; i++) if (st[`p${i}`] === req.user.uid) myRole = `p${i}`;
      if (!myRole) { tx.delete(playersSub(rid).doc(req.user.uid)); return; }
      const status = cleanStr(st.status || pub.status);
      if (status === "waiting") {
        tx.update(stateRef, { [myRole]: null, [myRole + "_name"]: null });
        const newCount = Math.max(0, safeNum(pub.playersCount, 0) - 1);
        tx.update(pubRef, { playersCount: newCount, updatedAtMs: nowMs(), [myRole]: null, [myRole + "_name"]: null });
        tx.update(userRef, { balance: admin.firestore.FieldValue.increment(bet) }); tx.delete(playersSub(rid).doc(req.user.uid));
        if (myRole === "p1" && newCount <= 0) { tx.delete(pubRef); tx.delete(stateRef); tx.delete(passRef); } return;
      }
      if (status === "playing") { tx.update(stateRef, { status: "finished", finishedAtMs: nowMs() }); tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() }); }
      tx.delete(playersSub(rid).doc(req.user.uid));
    });
    try { await settleRoomPisti(rid); } catch {}
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/pisti/refill', verifyAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {}; const rid = cleanStr(roomId); if (!rid) throw new Error("roomId gerekli");
    const pubRef = colPublic().doc(rid); const stateRef = colState().doc(rid);
    await db.runTransaction(async (tx) => {
      const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stateRef)]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda yok!");
      const pub = pubSnap.data() || {}; const st  = stSnap.data() || {};
      if (cleanStr(st.status) !== "playing") return;
      const maxP = maxPlayersByTypePisti(st.type); const fullSize = is104Pisti(st.type) ? 104 : 52; const initialTableCount = (st.type === "4-104") ? 8 : 4;
      let deck = Array.isArray(st.deck) ? [...st.deck] : []; let table = Array.isArray(st.table) ? [...st.table] : [];
      if (table.length === 0 && deck.length === fullSize) { table = deck.splice(0, initialTableCount); }
      if (deck.length >= maxP * 4) {
        const up = { table, deck }; for (let i = 1; i <= maxP; i++) up[`p${i}_hand`] = deck.splice(0, 4); up.deck = deck; tx.update(stateRef, up);
      } else {
        const up = { table: [], deck: [], status: "finished", finishedAtMs: nowMs() };
        if (table.length > 0 && st.lastCollector) { let lcRole = null; for (let i = 1; i <= maxP; i++) if (st[`p${i}`] === st.lastCollector) lcRole = `p${i}`; if (lcRole) { up[lcRole + "_score"] = admin.firestore.FieldValue.increment(calculatePointsPisti(table)); up[lcRole + "_count"] = admin.firestore.FieldValue.increment(table.length); } }
        tx.update(stateRef, up); tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() });
      }
    });
    try { await settleRoomPisti(rid); } catch {}
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/pisti/play', verifyAuth, async (req, res) => {
  try {
    const { roomId, cardIndex } = req.body || {}; const rid = cleanStr(roomId); const idx = parseInt(cardIndex, 10);
    if (!rid) throw new Error("roomId gerekli"); if (!Number.isInteger(idx)) throw new Error("cardIndex geçersiz");
    const pubRef = colPublic().doc(rid); const stateRef = colState().doc(rid);
    await db.runTransaction(async (tx) => {
      const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stateRef)]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda yok!");
      const st = stSnap.data() || {};
      if (cleanStr(st.status) !== "playing") throw new Error("Oyun aktif değil!"); if (st.turn !== req.user.uid) throw new Error("Sıra sizde değil!");
      const maxP = maxPlayersByTypePisti(st.type); let myRole = null; for (let i = 1; i <= maxP; i++) if (st[`p${i}`] === req.user.uid) myRole = `p${i}`;
      if (!myRole) throw new Error("Odada değilsiniz!");
      const hand = Array.isArray(st[myRole + "_hand"]) ? [...st[myRole + "_hand"]] : []; if (idx < 0 || idx >= hand.length) throw new Error("Geçersiz kart!");
      const card = hand.splice(idx, 1)[0]; let table = Array.isArray(st.table) ? [...st.table] : []; let scoreInc = 0, countInc = 0, pistiHit = false; let lastCollector = st.lastCollector || null;
      if (table.length > 0) {
        const top = table[table.length - 1]; const isVale = normalizeCardValPisti(card) === "J";
        if (normalizeCardValPisti(card) === normalizeCardValPisti(top) || isVale) {
          if (table.length === 1 && !isVale) { scoreInc = 10; pistiHit = true; } else scoreInc = calculatePointsPisti([...table, card]);
          countInc = table.length + 1; table = []; lastCollector = req.user.uid;
        } else table.push(card);
      } else table.push(card);
      const curIdx = parseInt(myRole.slice(1), 10); const nextIdx = (curIdx % maxP) + 1; const nextUid = st[`p${nextIdx}`];
      const up = { [myRole + "_hand"]: hand, table, [myRole + "_score"]: admin.firestore.FieldValue.increment(scoreInc), [myRole + "_count"]: admin.firestore.FieldValue.increment(countInc), lastCollector, turn: nextUid || st.p1 };
      if (pistiHit) up.pistiSignal = admin.firestore.FieldValue.increment(1);
      tx.update(stateRef, up); tx.update(pubRef, { updatedAtMs: nowMs() });
    });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

async function settleRoomPisti(roomId) {
  const rid = cleanStr(roomId); if (!rid) return;
  const pubRef = colPublic().doc(rid); const stRef = colState().doc(rid);
  await db.runTransaction(async (tx) => {
    const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stRef)]);
    if (!pubSnap.exists || !stSnap.exists) return;
    const pub = pubSnap.data() || {}; const st = stSnap.data() || {};
    if (st.settled || (cleanStr(st.status) !== "finished" && cleanStr(pub.status) !== "finished")) return;
    const bet = safeNum(st.bet, safeNum(pub.bet, 0)); const maxP = maxPlayersByTypePisti(st.type || pub.type);
    const players = []; for (let i = 1; i <= maxP; i++) { const uid = st[`p${i}`]; if (uid) players.push({ role: `p${i}`, uid, score: safeNum(st[`p${i}_score`], 0), count: safeNum(st[`p${i}_count`], 0) }); }
    if (players.length < 2) { for (const p of players) tx.update(colUsers().doc(p.uid), { balance: admin.firestore.FieldValue.increment(bet) }); tx.update(stRef, { settled: true }); return; }
    const sortedByCount = [...players].sort((a, b) => b.count - a.count); const bonusRole = (sortedByCount[0].count > (sortedByCount[1]?.count || -1)) ? sortedByCount[0].role : null;
    for (const p of players) if (p.role === bonusRole) p.score += 3;
    players.sort((a, b) => b.score - a.score); const topScore = players[0].score; const winners = players.filter(p => p.score === topScore);
    const pot = bet * players.length; const prizeEach = Math.floor(pot / winners.length);
    for (const w of winners) tx.update(colUsers().doc(w.uid), { balance: admin.firestore.FieldValue.increment(prizeEach) });
    tx.update(stRef, { settled: true });
  });
}
app.post('/api/pisti/settle', verifyAuth, async (req, res) => { try { await settleRoomPisti(req.body.roomId); res.json({ ok: true }); } catch (e) { res.json({ ok: false, error: e.message }); } });

app.listen(PORT, () => console.log(`🚀 PlayMatrix Backend Started. Port: ${PORT}`));
