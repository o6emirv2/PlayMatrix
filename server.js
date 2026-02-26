'use strict';

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

process.on('uncaughtException', (err) => console.error('Kritik Hata (Çökme Engellendi):', err));
process.on('unhandledRejection', (reason) => console.error('İşlenmeyen Promise Hatası:', reason));

// -------------------- Firebase Admin Init --------------------
try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log("✅ Firebase Admin bağlandı (FIREBASE_KEY).");
    } else {
      console.error("🔴 FIREBASE_KEY ortam değişkeni yok! (Render Env'e ekle)");
      // fallback (prod’da kullanma)
      admin.initializeApp();
    }
  }
} catch (e) {
  console.error("🔴 Firebase Başlatma Hatası:", e.message);
}

const db = admin.firestore();
const auth = admin.auth();

// -------------------- Express --------------------
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/ping', (req, res) => res.send('✅ PlayMatrix Backend Aktif'));

// -------------------- Auth Middleware --------------------
const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Oturum yok.' });
  try {
    req.user = await auth.verifyIdToken(h.split(' ')[1]);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Geçersiz token.' });
  }
};

// -------------------- Helpers --------------------
const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim() : '');
const nowMs = () => Date.now();

const CARD_POINTS = { "D0": 3, "C2": 2 }; // Karo10 / Sinek2
const normalizeCardVal = (c) => {
  if (!c) return "";
  let v = c.substring(0, c.length - 1);
  return (v === '0') ? '10' : v;
};
const calculatePoints = (cards) => {
  let p = 0;
  for (const c of cards) {
    if (CARD_POINTS[c]) p += CARD_POINTS[c];
    else {
      const val = normalizeCardVal(c);
      if (val === 'A' || val === 'J') p += 1;
    }
  }
  return p;
};

function createShuffledDeck(isDouble) {
  const s = ["H", "D", "C", "S"];
  const v = ["A","2","3","4","5","6","7","8","9","0","J","Q","K"];
  let d = [];
  for (const suit of s) for (const val of v) d.push(val + suit);
  if (isDouble) d = [...d, ...d];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function maxPlayersByType(type) {
  return String(type || "2-52").startsWith("4") ? 4 : 2;
}
function is104(type) {
  return String(type || "").includes("104");
}

// -------------------- Collections --------------------
const colUsers = () => db.collection('users');
const colPublic = () => db.collection('rooms_public');
const colState  = () => db.collection('rooms_state');
const colPass   = () => db.collection('rooms_passwords');
const colPromos = () => db.collection('promo_codes'); // (istersen adını değiştir)
const playersSub = (roomId) => colPublic().doc(roomId).collection('players');

// -------------------- Public doc builder (Lobby uyumlu) --------------------
function buildPublicDoc({
  name, type, bet, status, hasPassword,
  playersCount, maxP, createdAtMs,
  p1, p2, p3, p4, p1_name, p2_name, p3_name, p4_name
}) {
  return {
    name: cleanStr(name) || "Arena",
    type: cleanStr(type) || "2-52",
    bet: safeNum(bet, 0),
    status: cleanStr(status) || "waiting",
    hasPassword: !!hasPassword,

    // lobby uyumu:
    playersCount: safeNum(playersCount, 0),
    maxPlayers: safeNum(maxP, 2),

    p1: p1 || null, p2: p2 || null, p3: p3 || null, p4: p4 || null,
    p1_name: p1_name || null, p2_name: p2_name || null, p3_name: p3_name || null, p4_name: p4_name || null,

    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: safeNum(createdAtMs, nowMs()),
    updatedAtMs: nowMs()
  };
}

// -------------------- State doc builder --------------------
function buildInitialState({ type, deck, initialTable, bet }) {
  const maxP = maxPlayersByType(type);
  const state = {
    type: cleanStr(type) || "2-52",
    status: "waiting",
    bet: safeNum(bet, 0),          // ✅ client handleEnd için
    deck: deck || [],
    table: initialTable || [],
    turn: null,
    lastCollector: null,
    pistiSignal: 0,
    finishedAtMs: null,
    settled: false
  };
  for (let i = 1; i <= 4; i++) {
    state[`p${i}`] = null;
    state[`p${i}_name`] = null;
    state[`p${i}_score`] = 0;
    state[`p${i}_count`] = 0;
    state[`p${i}_hand`] = [];
  }
  return state;
}

function pickRole(state, maxP) {
  if (!state.p1) return "p1";
  if (!state.p2) return "p2";
  if (maxP === 4) {
    if (!state.p3) return "p3";
    if (!state.p4) return "p4";
  }
  return null;
}

// -------------------- Basic profile endpoints --------------------
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const u = await colUsers().doc(req.user.uid).get();
    const data = u.exists ? (u.data() || {}) : {};
    res.json({ ok: true, balance: safeNum(data.balance, 0), user: data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// index.html: /api/profile/update
app.post('/api/profile/update', verifyAuth, async (req, res) => {
  try {
    const { fullName, phone, username, avatar } = req.body || {};
    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("Kullanıcı kaydı yok!");

      const u = snap.data() || {};
      const updates = {};

      // fullName / phone (bir kez kilitlemek istersen: doluysa değiştirme)
      if (cleanStr(fullName) && !cleanStr(u.fullName)) updates.fullName = cleanStr(fullName);
      if (cleanStr(phone) && !cleanStr(u.phone)) updates.phone = cleanStr(phone);

      // avatar serbest
      if (typeof avatar === 'string') updates.avatar = avatar;

      // username: max 3 kez değiştirsin
      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        const used = safeNum(u.userChangeCount, 0);
        if (used >= 3) throw new Error("Kullanıcı adı değiştirme hakkın bitti!");
        // uniqueness kontrol:
        const q = await tx.get(
          db.collection('users').where('username', '==', wanted).limit(1)
        );
        if (!q.empty) {
          // aynı uid ise problem yok
          const doc0 = q.docs[0];
          if (doc0.id !== uid) throw new Error("Bu kullanıcı adı başka bir ajan tarafından kullanılıyor!");
        }
        updates.username = wanted;
        updates.userChangeCount = used + 1;
      }

      if (Object.keys(updates).length) tx.update(userRef, updates);
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// index.html: /api/wheel/spin
app.post('/api/wheel/spin', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);

    const rewards = [
      { label: "2.500 MC",  val: 2500 },
      { label: "5.000 MC",  val: 5000 },
      { label: "7.500 MC",  val: 7500 },
      { label: "12.500 MC", val: 12500 },
      { label: "20.000 MC", val: 20000 },
      { label: "25.000 MC", val: 25000 },
      { label: "30.000 MC", val: 30000 },
      { label: "50.000 MC", val: 50000 },
    ];

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("Kullanıcı kaydı yok!");
      const u = snap.data() || {};
      const lastSpin = safeNum(u.lastSpin, 0);

      const cooldown = 86400000; // 24h
      const diff = nowMs() - lastSpin;
      if (diff < cooldown) {
        const left = cooldown - diff;
        const h = Math.floor(left / 3600000);
        const m = Math.floor((left % 3600000) / 60000);
        throw new Error(`Çark beklemede. Kalan: ${h} saat ${m} dk`);
      }

      // kriptografik random
      const rnd = crypto.randomInt(0, rewards.length);
      const prize = rewards[rnd].val;

      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(prize),
        lastSpin: nowMs()
      });

      const newBal = safeNum(u.balance, 0) + prize;
      return { index: rnd, prize, balance: newBal };
    });

    res.json({ ok: true, ...out });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// index.html: /api/bonus/claim
app.post('/api/bonus/claim', verifyAuth, async (req, res) => {
  try {
    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!code) throw new Error("Kod boş olamaz.");

    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);
    const promoRef = colPromos().doc(code);

    const out = await db.runTransaction(async (tx) => {
      const [uSnap, pSnap] = await Promise.all([tx.get(userRef), tx.get(promoRef)]);
      if (!uSnap.exists) throw new Error("Kullanıcı kaydı yok!");
      if (!pSnap.exists) throw new Error("Kod geçersiz.");

      const u = uSnap.data() || {};
      const p = pSnap.data() || {};

      const amount = safeNum(p.amount, 0);
      if (amount <= 0) throw new Error("Kod aktif değil.");

      // tek kullanımlık (kullanıcı bazlı)
      const used = Array.isArray(u.usedPromos) ? u.usedPromos : [];
      if (used.includes(code)) throw new Error("Bu kod daha önce kullanıldı.");

      // global limit (opsiyon)
      const limitLeft = safeNum(p.limitLeft, -1); // -1 = limitsiz
      if (limitLeft === 0) throw new Error("Kod tükendi.");

      const newBal = safeNum(u.balance, 0) + amount;

      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        usedPromos: admin.firestore.FieldValue.arrayUnion(code)
      });

      if (limitLeft > 0) {
        tx.update(promoRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });
      }

      return { amount, balance: newBal };
    });

    res.json({ ok: true, ...out });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: CREATE --------------------
app.post('/api/pisti/create', verifyAuth, async (req, res) => {
  try {
    const { name, type, pass, bet } = req.body || {};
    const betNum = safeNum(bet, 0);
    if (!Number.isInteger(betNum) || betNum < 100) throw new Error("Bahis min 100 MC olmalı!");

    const ttype = cleanStr(type) || "2-52";
    const maxP = maxPlayersByType(ttype);
    const hasPassword = !!cleanStr(pass);

    const roomId = `room_${nowMs()}_${req.user.uid.slice(0,4)}`;
    const userRef = colUsers().doc(req.user.uid);
    const pubRef  = colPublic().doc(roomId);
    const stateRef= colState().doc(roomId);
    const passRef = colPass().doc(roomId);

    const deck = createShuffledDeck(is104(ttype));
    const initialTableCount = (ttype === "4-104") ? 8 : 4;
    const initialTable = deck.splice(0, initialTableCount);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      const uData = uSnap.exists ? (uSnap.data() || {}) : {};
      const bal = safeNum(uData.balance, 0);
      if (bal < betNum) throw new Error("Yetersiz bakiye!");

      const uname = cleanStr(uData.username) || "Oyuncu";

      // public lobby doc (client uyumu için p1/p1_name yazıyoruz)
      tx.set(pubRef, buildPublicDoc({
        name, type: ttype, bet: betNum, status: "waiting",
        createdAtMs: nowMs(),
        hasPassword,
        playersCount: 1,
        maxP,
        p1: req.user.uid,
        p1_name: uname
      }));

      // lobby players subdoc
      tx.set(playersSub(roomId).doc(req.user.uid), {
        uid: req.user.uid, name: uname, role: "p1", joinedAtMs: nowMs()
      });

      // state doc
      const state = buildInitialState({ type: ttype, deck, initialTable, bet: betNum });
      state.p1 = req.user.uid;
      state.p1_name = uname;
      tx.set(stateRef, state);

      // ✅ password storage
      if (hasPassword) {
        tx.set(passRef, { password: cleanStr(pass), updatedAtMs: nowMs() }, { merge: true });
      }

      // bet lock
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-betNum) });
    });

    res.json({ ok: true, roomId });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: JOIN --------------------
app.post('/api/pisti/join', verifyAuth, async (req, res) => {
  try {
    const { roomId, pass } = req.body || {};
    const rid = cleanStr(roomId);
    if (!rid) throw new Error("roomId gerekli");

    const userRef = colUsers().doc(req.user.uid);
    const pubRef  = colPublic().doc(rid);
    const stateRef= colState().doc(rid);
    const passRef = colPass().doc(rid);

    const role = await db.runTransaction(async (tx) => {
      const [uSnap, pubSnap, stSnap, passSnap] = await Promise.all([
        tx.get(userRef), tx.get(pubRef), tx.get(stateRef), tx.get(passRef)
      ]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda bulunamadı / kapandı!");

      const pub = pubSnap.data() || {};
      const st  = stSnap.data() || {};

      if (cleanStr(st.status) !== "waiting") throw new Error("Oyun başlamış veya bitmiş!");

      const storedPass = passSnap.exists ? cleanStr((passSnap.data() || {}).password) : "";
      if (storedPass && storedPass !== cleanStr(pass)) throw new Error("Hatalı şifre!");

      const uData = uSnap.exists ? (uSnap.data() || {}) : {};
      const bal = safeNum(uData.balance, 0);
      const bet = safeNum(pub.bet, 0);
      if (bal < bet) throw new Error("Bakiye yetersiz!");

      const maxP = maxPlayersByType(st.type || pub.type);
      const assigned = pickRole(st, maxP);
      if (!assigned) throw new Error("Oda dolu!");

      const uname = cleanStr(uData.username) || "Oyuncu";

      // state update
      tx.update(stateRef, {
        [assigned]: req.user.uid,
        [assigned + "_name"]: uname,
      });

      // public doc update (lobi isimleri + uid’ler)
      const pubUp = {
        playersCount: admin.firestore.FieldValue.increment(1),
        updatedAtMs: nowMs(),
        [assigned]: req.user.uid,
        [assigned + "_name"]: uname,
      };

      // full olduysa başlat
      const newCount = safeNum(pub.playersCount, 0) + 1;
      if (newCount >= maxP) {
        pubUp.status = "playing";
        tx.update(stateRef, { status: "playing", turn: st.p1 || req.user.uid });
      }

      tx.update(pubRef, pubUp);

      // lobby players subdoc
      tx.set(playersSub(rid).doc(req.user.uid), {
        uid: req.user.uid, name: uname, role: assigned, joinedAtMs: nowMs()
      });

      // bet lock
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-bet) });

      return assigned;
    });

    res.json({ ok: true, role });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: LEAVE --------------------
app.post('/api/pisti/leave', verifyAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {};
    const rid = cleanStr(roomId);
    if (!rid) throw new Error("roomId gerekli");

    const userRef = colUsers().doc(req.user.uid);
    const pubRef  = colPublic().doc(rid);
    const stateRef= colState().doc(rid);
    const passRef = colPass().doc(rid);

    await db.runTransaction(async (tx) => {
      const [uSnap, pubSnap, stSnap] = await Promise.all([
        tx.get(userRef), tx.get(pubRef), tx.get(stateRef)
      ]);
      if (!pubSnap.exists || !stSnap.exists) return;

      const pub = pubSnap.data() || {};
      const st  = stSnap.data() || {};

      const bet = safeNum(pub.bet, 0);
      const maxP = maxPlayersByType(st.type || pub.type);

      // role bul
      let myRole = null;
      for (let i = 1; i <= maxP; i++) if (st[`p${i}`] === req.user.uid) myRole = `p${i}`;
      if (!myRole) {
        tx.delete(playersSub(rid).doc(req.user.uid));
        return;
      }

      const status = cleanStr(st.status || pub.status);

      // waiting -> refund ve odadan çıkar
      if (status === "waiting") {
        tx.update(stateRef, { [myRole]: null, [myRole + "_name"]: null });

        const newCount = Math.max(0, safeNum(pub.playersCount, 0) - 1);
        tx.update(pubRef, {
          playersCount: newCount,
          updatedAtMs: nowMs(),
          [myRole]: null,
          [myRole + "_name"]: null
        });

        tx.update(userRef, { balance: admin.firestore.FieldValue.increment(bet) });
        tx.delete(playersSub(rid).doc(req.user.uid));

        // owner çıktı ve oda boşaldıysa temizle
        if (myRole === "p1" && newCount <= 0) {
          tx.delete(pubRef);
          tx.delete(stateRef);
          tx.delete(passRef);
        }
        return;
      }

      // playing -> finished
      if (status === "playing") {
        tx.update(stateRef, { status: "finished", finishedAtMs: nowMs() });
        tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() });
      }

      tx.delete(playersSub(rid).doc(req.user.uid));
    });

    // settle dene
    try { await settleRoom(rid); } catch {}

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: REFILL --------------------
app.post('/api/pisti/refill', verifyAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {};
    const rid = cleanStr(roomId);
    if (!rid) throw new Error("roomId gerekli");

    const pubRef = colPublic().doc(rid);
    const stateRef= colState().doc(rid);

    await db.runTransaction(async (tx) => {
      const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stateRef)]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda yok!");

      const pub = pubSnap.data() || {};
      const st  = stSnap.data() || {};
      if (cleanStr(st.status) !== "playing") return;

      const maxP = maxPlayersByType(st.type);
      const fullSize = is104(st.type) ? 104 : 52;
      const initialTableCount = (st.type === "4-104") ? 8 : 4;

      let deck = Array.isArray(st.deck) ? [...st.deck] : [];
      let table = Array.isArray(st.table) ? [...st.table] : [];

      if (table.length === 0 && deck.length === fullSize) {
        table = deck.splice(0, initialTableCount);
      }

      const needed = maxP * 4;
      if (deck.length >= needed) {
        const up = { table, deck };
        for (let i = 1; i <= maxP; i++) up[`p${i}_hand`] = deck.splice(0, 4);
        up.deck = deck;
        tx.update(stateRef, up);
      } else {
        // deste bitti -> masayı lastCollector’a yaz, finished
        const up = { table: [], deck: [], status: "finished", finishedAtMs: nowMs() };

        if (table.length > 0 && st.lastCollector) {
          let lcRole = null;
          for (let i = 1; i <= maxP; i++) if (st[`p${i}`] === st.lastCollector) lcRole = `p${i}`;
          if (lcRole) {
            up[lcRole + "_score"] = admin.firestore.FieldValue.increment(calculatePoints(table));
            up[lcRole + "_count"] = admin.firestore.FieldValue.increment(table.length);
          }
        }

        tx.update(stateRef, up);
        tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() });
      }
    });

    try { await settleRoom(rid); } catch {}
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: PLAY --------------------
app.post('/api/pisti/play', verifyAuth, async (req, res) => {
  try {
    const { roomId, cardIndex } = req.body || {};
    const rid = cleanStr(roomId);
    const idx = parseInt(cardIndex, 10);
    if (!rid) throw new Error("roomId gerekli");
    if (!Number.isInteger(idx)) throw new Error("cardIndex geçersiz");

    const pubRef = colPublic().doc(rid);
    const stateRef= colState().doc(rid);

    await db.runTransaction(async (tx) => {
      const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stateRef)]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda yok!");

      const st  = stSnap.data() || {};
      if (cleanStr(st.status) !== "playing") throw new Error("Oyun aktif değil!");
      if (st.turn !== req.user.uid) throw new Error("Sıra sizde değil!");

      const maxP = maxPlayersByType(st.type);

      let myRole = null;
      for (let i = 1; i <= maxP; i++) if (st[`p${i}`] === req.user.uid) myRole = `p${i}`;
      if (!myRole) throw new Error("Odada değilsiniz!");

      const hand = Array.isArray(st[myRole + "_hand"]) ? [...st[myRole + "_hand"]] : [];
      if (idx < 0 || idx >= hand.length) throw new Error("Geçersiz kart!");

      const card = hand.splice(idx, 1)[0];
      let table = Array.isArray(st.table) ? [...st.table] : [];
      let scoreInc = 0, countInc = 0, pistiHit = false;
      let lastCollector = st.lastCollector || null;

      if (table.length > 0) {
        const top = table[table.length - 1];
        const isVale = normalizeCardVal(card) === "J";

        if (normalizeCardVal(card) === normalizeCardVal(top) || isVale) {
          if (table.length === 1 && !isVale) { scoreInc = 10; pistiHit = true; }
          else scoreInc = calculatePoints([...table, card]);

          countInc = table.length + 1;
          table = [];
          lastCollector = req.user.uid;
        } else table.push(card);
      } else table.push(card);

      // next turn
      const curIdx = parseInt(myRole.slice(1), 10);
      const nextIdx = (curIdx % maxP) + 1;
      const nextUid = st[`p${nextIdx}`];

      const up = {
        [myRole + "_hand"]: hand,
        table,
        [myRole + "_score"]: admin.firestore.FieldValue.increment(scoreInc),
        [myRole + "_count"]: admin.firestore.FieldValue.increment(countInc),
        lastCollector,
        turn: nextUid || st.p1
      };
      if (pistiHit) up.pistiSignal = admin.firestore.FieldValue.increment(1);

      tx.update(stateRef, up);
      tx.update(pubRef, { updatedAtMs: nowMs() });
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- SETTLEMENT (payout) --------------------
async function settleRoom(roomId) {
  const rid = cleanStr(roomId);
  if (!rid) return;

  const pubRef = colPublic().doc(rid);
  const stRef  = colState().doc(rid);

  await db.runTransaction(async (tx) => {
    const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stRef)]);
    if (!pubSnap.exists || !stSnap.exists) return;

    const pub = pubSnap.data() || {};
    const st  = stSnap.data() || {};
    if (st.settled) return;
    if (cleanStr(st.status) !== "finished" && cleanStr(pub.status) !== "finished") return;

    const bet = safeNum(st.bet, safeNum(pub.bet, 0));
    const maxP = maxPlayersByType(st.type || pub.type);

    const players = [];
    for (let i = 1; i <= maxP; i++) {
      const uid = st[`p${i}`];
      if (!uid) continue;
      players.push({
        role: `p${i}`,
        uid,
        name: st[`p${i}_name`] || "Oyuncu",
        score: safeNum(st[`p${i}_score`], 0),
        count: safeNum(st[`p${i}_count`], 0)
      });
    }

    if (players.length < 2) {
      for (const p of players) {
        tx.update(colUsers().doc(p.uid), { balance: admin.firestore.FieldValue.increment(bet) });
      }
      tx.update(stRef, { settled: true });
      return;
    }

    // en çok kart bonus +3
    const sortedByCount = [...players].sort((a, b) => b.count - a.count);
    const bonusRole = (sortedByCount[0].count > (sortedByCount[1]?.count || -1)) ? sortedByCount[0].role : null;
    for (const p of players) if (p.role === bonusRole) p.score += 3;

    players.sort((a, b) => b.score - a.score);
    const topScore = players[0].score;
    const winners = players.filter(p => p.score === topScore);

    const pot = bet * players.length;
    const prizeEach = Math.floor(pot / winners.length);

    for (const w of winners) {
      tx.update(colUsers().doc(w.uid), { balance: admin.firestore.FieldValue.increment(prizeEach) });
    }

    tx.update(stRef, { settled: true });
  });
}

app.post('/api/pisti/settle', verifyAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {};
    await settleRoom(roomId);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- Start --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 PlayMatrix Backend Started. Port: ${PORT}`));
