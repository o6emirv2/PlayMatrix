'use strict';

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

process.on('uncaughtException', (err) => console.error('Kritik Hata (Çökme Engellendi):', err));
process.on('unhandledRejection', (reason) => console.error('İşlenmeyen Promise Hatası:', reason));

// -------------------- Firebase Admin Init --------------------
try {
  if (!admin.apps.length) {
    let serviceAccount;
    if (process.env.FIREBASE_KEY) {
      serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log("✅ Firebase Admin bağlandı (FIREBASE_KEY).");
    } else {
      console.error("🔴 FIREBASE_KEY ortam değişkeni yok! (Render Env'e ekle)");
      admin.initializeApp({ projectId: "emirhan-site" });
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

app.get('/ping', (req, res) => res.send('✅ PlayMatrix Backend Aktif (Pişti API)'));

// -------------------- Auth Middleware --------------------
const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Oturum yok.' });
  try {
    req.user = await auth.verifyIdToken(h.split(' ')[1]);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Geçersiz token.' });
  }
};

// -------------------- Helpers --------------------
const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim() : '');

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

function nowMs() {
  return Date.now();
}

// public doc builder (lobi için)
function buildPublicDoc({ name, type, bet, status, createdAtMs, hasPassword, playersCount, maxP }) {
  return {
    name: cleanStr(name) || "Arena",
    type: cleanStr(type) || "2-52",
    bet: safeNum(bet, 0),
    status: cleanStr(status) || "waiting",
    hasPassword: !!hasPassword,
    playersCount: safeNum(playersCount, 0),
    maxPlayers: safeNum(maxP, 2),
    createdAtMs: safeNum(createdAtMs, nowMs()),
    updatedAtMs: nowMs()
  };
}

// state doc builder
function buildInitialState({ type, deck, initialTable }) {
  const maxP = maxPlayersByType(type);
  const state = {
    type: cleanStr(type) || "2-52",
    status: "waiting",
    deck: deck || [],
    table: initialTable || [],
    turn: null,
    lastCollector: null,
    pistiSignal: 0,
    finishedAtMs: null,
    settled: false, // payout/refund kilidi
  };
  for (let i = 1; i <= 4; i++) {
    state[`p${i}`] = null;            // uid
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

function listPlayers(state, maxP) {
  const out = [];
  for (let i = 1; i <= maxP; i++) if (state[`p${i}`]) out.push(state[`p${i}`]);
  return out;
}

// -------------------- Collections --------------------
const colUsers = () => db.collection('users');
const colPublic = () => db.collection('rooms_public');
const colState = () => db.collection('rooms_state');

// players subcollection for lobby visibility & quick join
const playersSub = (roomId) => colPublic().doc(roomId).collection('players');

// -------------------- Basic profile endpoints (opsiyon) --------------------
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const u = await colUsers().doc(req.user.uid).get();
    const data = u.exists ? (u.data() || {}) : {};
    res.json({ ok: true, balance: safeNum(data.balance, 0), user: data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/auth/bootstrap', verifyAuth, async (req, res) => {
  try {
    const { username, avatar } = req.body || {};
    const userRef = colUsers().doc(req.user.uid);
    await userRef.set({
      balance: 50000,
      username: cleanStr(username) || `Oyuncu_${req.user.uid.slice(0,5)}`,
      avatar: cleanStr(avatar) || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    res.json({ ok: true, balance: 50000 });
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
    const pubRef = colPublic().doc(roomId);
    const stateRef = colState().doc(roomId);

    const deck = createShuffledDeck(is104(ttype));
    const initialTableCount = (ttype === "4-104") ? 8 : 4;
    const initialTable = deck.splice(0, initialTableCount);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      const uData = uSnap.exists ? (uSnap.data() || {}) : {};
      const bal = safeNum(uData.balance, 0);
      if (bal < betNum) throw new Error("Yetersiz bakiye!");

      const uname = cleanStr(uData.username) || "Oyuncu";

      // public lobby doc
      tx.set(pubRef, buildPublicDoc({
        name, type: ttype, bet: betNum, status: "waiting",
        createdAtMs: nowMs(),
        hasPassword,
        playersCount: 1,
        maxP
      }));

      // players subdoc (lobbyde kim var)
      tx.set(playersSub(roomId).doc(req.user.uid), {
        uid: req.user.uid,
        name: uname,
        role: "p1",
        joinedAtMs: nowMs()
      });

      // state doc
      const state = buildInitialState({ type: ttype, deck, initialTable });
      state.p1 = req.user.uid;
      state.p1_name = uname;

      tx.set(stateRef, state);

      // bet lock (parayı düş)
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
    const pubRef = colPublic().doc(rid);
    const stateRef = colState().doc(rid);

    const role = await db.runTransaction(async (tx) => {
      const [uSnap, pubSnap, stSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(pubRef),
        tx.get(stateRef),
      ]);

      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda bulunamadı / kapandı!");

      const pub = pubSnap.data() || {};
      const st = stSnap.data() || {};

      const status = cleanStr(st.status || pub.status);
      if (status !== "waiting") throw new Error("Oyun başlamış veya bitmiş!");

      // password check
      // password sadece server tarafında kontrol edilir. public doc sadece hasPassword tutar.
      // Burada password state içinde tutulmuyor => güvenli.
      // Eğer şifreli oda istiyorsan şifreyi public doc'a değil ayrı secure yere yazmak gerekir.
      // Basit çözüm: roomId için rooms_private collection. Şimdilik FIREBASE'da rooms_passwords yapalım.
      const passDocRef = db.collection('rooms_passwords').doc(rid);
      const passSnap = await tx.get(passDocRef);
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

      // player subdoc
      tx.set(playersSub(rid).doc(req.user.uid), {
        uid: req.user.uid,
        name: uname,
        role: assigned,
        joinedAtMs: nowMs()
      });

      // public playersCount + status
      const newCount = safeNum(pub.playersCount, 0) + 1;
      const pubUpdates = {
        playersCount: newCount,
        updatedAtMs: nowMs()
      };

      if (newCount >= maxP) {
        pubUpdates.status = "playing";
        tx.update(stateRef, { status: "playing", turn: st.p1 || req.user.uid }); // p1 başlar
      }

      tx.update(pubRef, pubUpdates);

      // bet lock
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-bet) });

      return assigned;
    });

    res.json({ ok: true, role });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: CREATE password storage (optional) --------------------
// CREATE sırasında şifre varsa güvenli koleksiyona yaz
app.post('/api/pisti/setpass', verifyAuth, async (req, res) => {
  try {
    const { roomId, password } = req.body || {};
    const rid = cleanStr(roomId);
    const pw = cleanStr(password);
    if (!rid) throw new Error("roomId gerekli");

    const stRef = colState().doc(rid);
    const passRef = db.collection('rooms_passwords').doc(rid);

    await db.runTransaction(async (tx) => {
      const stSnap = await tx.get(stRef);
      if (!stSnap.exists) throw new Error("Oda yok");
      const st = stSnap.data() || {};
      if (st.p1 !== req.user.uid) throw new Error("Sadece oda sahibi ayarlayabilir");
      tx.set(passRef, { password: pw, updatedAtMs: nowMs() }, { merge: true });
      // public doc hasPassword zaten true/false olarak kalır
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- PISTI: LEAVE (refund / quit) --------------------
app.post('/api/pisti/leave', verifyAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {};
    const rid = cleanStr(roomId);
    if (!rid) throw new Error("roomId gerekli");

    const userRef = colUsers().doc(req.user.uid);
    const pubRef = colPublic().doc(rid);
    const stateRef = colState().doc(rid);

    await db.runTransaction(async (tx) => {
      const [uSnap, pubSnap, stSnap] = await Promise.all([
        tx.get(userRef), tx.get(pubRef), tx.get(stateRef)
      ]);
      if (!pubSnap.exists || !stSnap.exists) return;

      const pub = pubSnap.data() || {};
      const st = stSnap.data() || {};

      const bet = safeNum(pub.bet, 0);
      const maxP = maxPlayersByType(st.type || pub.type);

      // role bul
      let myRole = null;
      for (let i = 1; i <= maxP; i++) {
        if (st[`p${i}`] === req.user.uid) myRole = `p${i}`;
      }
      if (!myRole) {
        // oyuncu zaten yoksa subdoc'u temizle
        tx.delete(playersSub(rid).doc(req.user.uid));
        return;
      }

      const status = cleanStr(st.status || pub.status);

      // Waiting'de ayrılan oyuncuya refund (tek taraf)
      if (status === "waiting") {
        // state’den çıkar
        tx.update(stateRef, { [myRole]: null, [myRole + "_name"]: null });

        // public playersCount düş
        const newCount = Math.max(0, safeNum(pub.playersCount, 0) - 1);
        tx.update(pubRef, { playersCount: newCount, updatedAtMs: nowMs() });

        // refund (bet iade)
        tx.update(userRef, { balance: admin.firestore.FieldValue.increment(bet) });

        // subdoc sil
        tx.delete(playersSub(rid).doc(req.user.uid));

        // Eğer owner (p1) çıktı ve odada kimse kalmadıysa oda temizle
        if (myRole === "p1") {
          if (newCount <= 0) {
            tx.delete(pubRef);
            tx.delete(stateRef);
            tx.delete(db.collection('rooms_passwords').doc(rid));
          }
        }
        return;
      }

      // Playing'de çıkarsa: oyunu bitir + refund/payout güvenli kilit
      if (status === "playing") {
        // Oyunu finished yap
        tx.update(stateRef, { status: "finished", finishedAtMs: nowMs() });

        // public doc status finished
        tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() });

        // DİKKAT: payout/refund işini burada yapmıyoruz,
        // çünkü client handleEnd’de zaten sadece bilgilendiriyor.
        // Settlement’i ayrı function: /api/pisti/settle
        // Ama kullanıcı çıkınca otomatik settle çağıracağız:
      }

      // subdoc sil
      tx.delete(playersSub(rid).doc(req.user.uid));
    });

    // Otomatik settle dene (idempotent)
    try {
      await settleRoom(rid);
    } catch (_) {}

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
    const stateRef = colState().doc(rid);

    await db.runTransaction(async (tx) => {
      const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stateRef)]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda yok!");

      const pub = pubSnap.data() || {};
      const st = stSnap.data() || {};
      if (cleanStr(st.status) !== "playing") return;

      const maxP = maxPlayersByType(st.type);
      const fullSize = is104(st.type) ? 104 : 52;
      const initialTableCount = (st.type === "4-104") ? 8 : 4;

      let deck = Array.isArray(st.deck) ? [...st.deck] : [];
      let table = Array.isArray(st.table) ? [...st.table] : [];

      // Güvenlik: deck hiç yoksa yeniden yaratma (hileye açık). YOKSA odayı bitir.
      if (!deck.length && table.length && !st.finishedAtMs) {
        tx.update(stateRef, { status: "finished", finishedAtMs: nowMs() });
        tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() });
        return;
      }

      // Oyun başı: table boşsa ve deck full gibi görünüyorsa initial table aç
      if (table.length === 0 && deck.length === fullSize) {
        table = deck.splice(0, initialTableCount);
      }

      // Herkese 4 kart dağıt
      const needed = maxP * 4;
      if (deck.length >= needed) {
        const up = { table, deck };
        for (let i = 1; i <= maxP; i++) {
          up[`p${i}_hand`] = deck.splice(0, 4);
        }
        up.deck = deck;
        tx.update(stateRef, up);
      } else {
        // Deste bitti -> masadaki kartlar lastCollector'a yaz
        const up = { table: [], deck: [], status: "finished", finishedAtMs: nowMs() };

        if (table.length > 0 && st.lastCollector) {
          let lcRole = null;
          for (let i = 1; i <= maxP; i++) {
            if (st[`p${i}`] === st.lastCollector) lcRole = `p${i}`;
          }
          if (lcRole) {
            up[lcRole + "_score"] = admin.firestore.FieldValue.increment(calculatePoints(table));
            up[lcRole + "_count"] = admin.firestore.FieldValue.increment(table.length);
          }
        }

        tx.update(stateRef, up);
        tx.update(pubRef, { status: "finished", updatedAtMs: nowMs() });
      }
    });

    // finished olduysa otomatik settle dene
    try { await settleRoom(rid); } catch (_) {}

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
    const stateRef = colState().doc(rid);

    await db.runTransaction(async (tx) => {
      const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stateRef)]);
      if (!pubSnap.exists || !stSnap.exists) throw new Error("Oda yok!");

      const st = stSnap.data() || {};
      const pub = pubSnap.data() || {};
      if (cleanStr(st.status) !== "playing") throw new Error("Oyun aktif değil!");

      if (st.turn !== req.user.uid) throw new Error("Sıra sizde değil!");

      const maxP = maxPlayersByType(st.type);

      // role bul
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
          // Pişti: yerde 1 kart var ve VALE ile alınmadı
          if (table.length === 1 && !isVale) {
            scoreInc = 10;
            pistiHit = true;
          } else {
            scoreInc = calculatePoints([...table, card]);
          }

          countInc = table.length + 1;
          table = [];
          lastCollector = req.user.uid;
        } else {
          table.push(card);
        }
      } else {
        table.push(card);
      }

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
        turn: nextUid || st.p1, // güvenlik
      };

      if (pistiHit) up.pistiSignal = admin.firestore.FieldValue.increment(1);

      tx.update(stateRef, up);

      // public doc updateAt (lobby “canlı” gözükmesi)
      tx.update(pubRef, { updatedAtMs: nowMs() });
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- SETTLEMENT (payout/refund fix) --------------------
async function settleRoom(roomId) {
  const rid = cleanStr(roomId);
  if (!rid) return;

  const pubRef = colPublic().doc(rid);
  const stRef = colState().doc(rid);

  await db.runTransaction(async (tx) => {
    const [pubSnap, stSnap] = await Promise.all([tx.get(pubRef), tx.get(stRef)]);
    if (!pubSnap.exists || !stSnap.exists) return;

    const pub = pubSnap.data() || {};
    const st = stSnap.data() || {};

    if (st.settled) return; // idempotent
    if (cleanStr(st.status) !== "finished" && cleanStr(pub.status) !== "finished") return;

    const bet = safeNum(pub.bet, 0);
    const maxP = maxPlayersByType(st.type || pub.type);

    // oyuncular
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

    // Eğer oyuncu sayısı < 2 ise (ör: biri çıktı, oyun başlamadan bitti), refund
    if (players.length < 2) {
      // kim ödeme yaptıysa refund: public players subcollection’da kimler var diye bakmak yerine state’de kalanlara refund
      for (const p of players) {
        tx.update(colUsers().doc(p.uid), { balance: admin.firestore.FieldValue.increment(bet) });
      }
      tx.update(stRef, { settled: true });
      return;
    }

    // Bonus: en çok kart alan +3
    const sortedByCount = [...players].sort((a, b) => b.count - a.count);
    const bonusRole = (sortedByCount[0].count > (sortedByCount[1]?.count || -1)) ? sortedByCount[0].role : null;
    for (const p of players) {
      if (p.role === bonusRole) p.score += 3;
    }

    // winner(s)
    players.sort((a, b) => b.score - a.score);
    const topScore = players[0].score;
    const winners = players.filter(p => p.score === topScore);

    const pot = bet * players.length;
    const prizeEach = Math.floor(pot / winners.length);

    for (const w of winners) {
      tx.update(colUsers().doc(w.uid), { balance: admin.firestore.FieldValue.increment(prizeEach) });
    }

    // kilitle
    tx.update(stRef, { settled: true });
  });
}

// manuel settle endpoint (opsiyon)
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
