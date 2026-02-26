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
// GRID CONQUEST API (FULL SERVER-AUTHORITATIVE)
// Collection: conquest_rooms (tek kaynak)
// Pass: conquest_pass (hash'li)
// ==========================================

const CONQUEST_DURATION_MS = 60 * 1000;
const CONQUEST_WAITING_TTL_MS = 70 * 1000;
const CONQUEST_FINISHED_TTL_MS = 60 * 1000;     // ✅ finished odalar 60sn sonra silinsin
const CONQUEST_TERMINATED_TTL_MS = 60 * 1000;   // ✅ terminated odalar 60sn sonra silinsin
const CLICK_MIN_INTERVAL_MS = 140;

// ✅ cleanup endpoint güvenliği (opsiyonel)
const CONQUEST_CLEANUP_KEY = cleanStr(process.env.CONQUEST_CLEANUP_KEY || "");

const roomRef = (rid) => db.collection('conquest_rooms').doc(rid);
const passRef = (rid) => db.collection('conquest_pass').doc(rid);

const isValidRoomId = (rid) => /^[A-F0-9]{6}$/.test(String(rid || ''));
const newRoomId = () => crypto.randomBytes(3).toString('hex').toUpperCase();

const hashPass = (pass, saltHex) => {
  const salt = Buffer.from(saltHex, 'hex');
  const dk = crypto.pbkdf2Sync(String(pass), salt, 120000, 32, 'sha256');
  return dk.toString('hex');
};

const makePassRecord = (pass) => {
  const saltHex = crypto.randomBytes(16).toString('hex');
  return { salt: saltHex, hash: hashPass(pass, saltHex), updatedAtMs: nowMs() };
};

const verifyPassHash = (pass, rec) => {
  if (!rec || !rec.salt || !rec.hash) return false;
  const a = Buffer.from(hashPass(pass, rec.salt), 'hex');
  const b = Buffer.from(String(rec.hash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const computeScores = (cells) => {
  let s1 = 0, s2 = 0;
  const c = cells || {};
  for (let i = 0; i < 36; i++) {
    if (c[i] === 'p1') s1++;
    else if (c[i] === 'p2') s2++;
  }
  return { s1, s2 };
};

const settleRoomInTx = async (tx, rid, data) => {
  if (!data || data.status !== 'playing') return;
  const ended = Number.isFinite(data.endTimeMs) && nowMs() >= data.endTimeMs;
  if (!ended) return;

  const { s1, s2 } = computeScores(data.cells);
  let winner = null;
  if (s1 > s2) winner = data.p1 || null;
  else if (s2 > s1) winner = data.p2 || null;

  tx.update(roomRef(rid), {
    status: 'finished',
    winner,
    score1: s1,
    score2: s2,
    finishedAtMs: nowMs(),
    updatedAtMs: nowMs(),
  });

  if (winner) {
    tx.update(db.collection('users').doc(winner), {
      balance: admin.firestore.FieldValue.increment(500),
    });
  }
};

// ✅ (6)(7) Server-side cleanup: waiting TTL + finished/terminated TTL
async function cleanupConquestRooms() {
  const now = nowMs();

  const staleWaitingBefore = now - CONQUEST_WAITING_TTL_MS;
  const staleFinishedBefore = now - CONQUEST_FINISHED_TTL_MS;
  const staleTermBefore = now - CONQUEST_TERMINATED_TTL_MS;

  // 1) waiting stale
  const waitingSnap = await db.collection('conquest_rooms')
    .where('status', '==', 'waiting')
    .where('createdAtMs', '<', staleWaitingBefore)
    .limit(200)
    .get();

  // 2) finished stale
  const finishedSnap = await db.collection('conquest_rooms')
    .where('status', '==', 'finished')
    .where('finishedAtMs', '<', staleFinishedBefore)
    .limit(200)
    .get();

  // 3) terminated stale
  const terminatedSnap = await db.collection('conquest_rooms')
    .where('status', '==', 'terminated')
    .where('terminatedAtMs', '<', staleTermBefore)
    .limit(200)
    .get();

  const all = [...waitingSnap.docs, ...finishedSnap.docs, ...terminatedSnap.docs];
  if (all.length === 0) return { deleted: 0 };

  const batch = db.batch();
  for (const docu of all) {
    const rid = docu.id;
    batch.delete(roomRef(rid));
    batch.delete(passRef(rid)); // varsa
  }
  await batch.commit();

  return { deleted: all.length };
}

// ✅ Cleanup endpoint (cron ile vurabilirsin)
// Header: x-cleanup-key: <CONQUEST_CLEANUP_KEY> (env varsa zorunlu)
app.post('/api/conquest/cleanup', async (req, res) => {
  try {
    if (CONQUEST_CLEANUP_KEY) {
      const k = cleanStr(req.headers['x-cleanup-key'] || '');
      if (!k || k !== CONQUEST_CLEANUP_KEY) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }
    const out = await cleanupConquestRooms();
    res.json({ ok: true, ...out, ts: nowMs() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ✅ Odayı SUNUCU oluşturur
app.post('/api/conquest/create', verifyAuth, async (req, res) => {
  try {
    const pass = cleanStr((req.body || {}).pass);
    const isPrivate = pass.length >= 5;

    const rid = newRoomId();
    const uRef = db.collection('users').doc(req.user.uid);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(uRef);
      const uname = uSnap.exists ? cleanStr(uSnap.data().username) || "Pilot" : "Pilot";

      tx.set(roomRef(rid), {
        id: rid,
        status: 'waiting',
        isPrivate,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs: nowMs(),
        updatedAtMs: nowMs(),

        p1: req.user.uid,
        p1Name: uname,
        p2: null,
        p2Name: null,

        startedAtMs: null,
        endTimeMs: null,

        cells: {},
        score1: 0,
        score2: 0,

        p1_lastClick: 0,
        p2_lastClick: 0,

        terminatedBy: null,
        terminatedAtMs: null,

        winner: null,
        finishedAtMs: null,
      });

      if (isPrivate) {
        tx.set(passRef(rid), makePassRecord(pass));
      }
    });

    res.json({ ok: true, roomId: rid, role: 'p1' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Join
app.post('/api/conquest/join', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr((req.body || {}).roomId).toUpperCase();
    const pass = cleanStr((req.body || {}).pass);

    if (!isValidRoomId(rid)) throw new Error("Arena ID geçersiz!");

    const uRef = db.collection('users').doc(req.user.uid);

    await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(roomRef(rid));
      if (!rSnap.exists) throw new Error("Arena kapalı!");

      const r = rSnap.data();

      // waiting odaları TTL
      const age = nowMs() - safeNum(r.createdAtMs, 0);
      if (r.status === 'waiting' && age > CONQUEST_WAITING_TTL_MS) {
        tx.delete(roomRef(rid));
        tx.delete(passRef(rid));
        throw new Error("Arena süresi doldu!");
      }

      if (r.status !== 'waiting') throw new Error("Arena dolu/meşgul!");
      if (r.p1 === req.user.uid) throw new Error("Kendi arenana giremezsin!");

      if (r.isPrivate) {
        const pSnap = await tx.get(passRef(rid));
        if (!pSnap.exists) throw new Error("Şifre gerekli!");
        const ok = verifyPassHash(pass, pSnap.data());
        if (!ok) throw new Error("Hatalı şifre!");
      }

      const uSnap = await tx.get(uRef);
      const uname = uSnap.exists ? cleanStr(uSnap.data().username) || "Pilot" : "Pilot";

      const start = nowMs();
      const end = start + CONQUEST_DURATION_MS;

      tx.update(roomRef(rid), {
        p2: req.user.uid,
        p2Name: uname,
        status: 'playing',
        startedAtMs: start,
        endTimeMs: end,
        updatedAtMs: nowMs(),
      });
    });

    res.json({ ok: true, role: 'p2' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Click
app.post('/api/conquest/click', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr((req.body || {}).roomId).toUpperCase();
    const idx = parseInt((req.body || {}).cellIndex, 10);

    if (!isValidRoomId(rid)) return res.json({ ok: false });
    if (!Number.isInteger(idx) || idx < 0 || idx > 35) return res.json({ ok: false });

    await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(roomRef(rid));
      if (!rSnap.exists) return;

      const r = rSnap.data();

      await settleRoomInTx(tx, rid, r);

      if (r.status !== 'playing') return;
      if (Number.isFinite(r.endTimeMs) && nowMs() >= r.endTimeMs) return;

      let role = null;
      let lastField = null;

      if (r.p1 === req.user.uid) { role = 'p1'; lastField = 'p1_lastClick'; }
      else if (r.p2 === req.user.uid) { role = 'p2'; lastField = 'p2_lastClick'; }
      else return;

      const last = safeNum(r[lastField], 0);
      if (nowMs() - last < CLICK_MIN_INTERVAL_MS) return;

      const cells = r.cells || {};
      if (cells[idx] === role) {
        tx.update(roomRef(rid), { [lastField]: nowMs(), updatedAtMs: nowMs() });
        return;
      }

      cells[idx] = role;
      const { s1, s2 } = computeScores(cells);

      tx.update(roomRef(rid), {
        [`cells.${idx}`]: role,
        score1: s1,
        score2: s2,
        [lastField]: nowMs(),
        updatedAtMs: nowMs(),
      });
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// Heartbeat
app.post('/api/conquest/heartbeat', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr((req.body || {}).roomId).toUpperCase();
    if (!isValidRoomId(rid)) return res.json({ ok: false });

    let out = { ok: true };

    await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(roomRef(rid));
      if (!rSnap.exists) { out = { ok: false }; return; }

      const r = rSnap.data();

      await settleRoomInTx(tx, rid, r);

      const rSnap2 = await tx.get(roomRef(rid));
      if (!rSnap2.exists) { out = { ok: false }; return; }
      const rr = rSnap2.data();

      out = {
        ok: true,
        status: rr.status,
        endTimeMs: rr.endTimeMs || null,
        score1: safeNum(rr.score1, 0),
        score2: safeNum(rr.score2, 0),
        winner: rr.winner || null,
      };
    });

    res.json(out);
  } catch (e) {
    res.json({ ok: false });
  }
});

// myroom
app.get('/api/conquest/myroom', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    const q1 = await db.collection('conquest_rooms')
      .where('p1', '==', uid)
      .where('status', 'in', ['waiting', 'playing'])
      .limit(1).get();

    if (!q1.empty) {
      const d = q1.docs[0];
      return res.json({ ok: true, roomId: d.id, role: 'p1' });
    }

    const q2 = await db.collection('conquest_rooms')
      .where('p2', '==', uid)
      .where('status', 'in', ['waiting', 'playing'])
      .limit(1).get();

    if (!q2.empty) {
      const d = q2.docs[0];
      return res.json({ ok: true, roomId: d.id, role: 'p2' });
    }

    res.json({ ok: true, roomId: null });
  } catch (e) {
    res.json({ ok: false });
  }
});

// Leave
app.post('/api/conquest/leave', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr((req.body || {}).roomId).toUpperCase();
    if (!isValidRoomId(rid)) return res.json({ ok: false });

    await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(roomRef(rid));
      if (!rSnap.exists) return;

      const r = rSnap.data();

      let role = null;
      if (r.p1 === req.user.uid) role = 'p1';
      else if (r.p2 === req.user.uid) role = 'p2';
      else return;

      if (r.status === 'waiting') {
        if (role === 'p1') {
          tx.delete(roomRef(rid));
          tx.delete(passRef(rid));
        } else {
          tx.update(roomRef(rid), { p2: null, p2Name: null, updatedAtMs: nowMs() });
        }
        return;
      }

      if (r.status === 'playing') {
        tx.update(roomRef(rid), {
          status: 'terminated',
          terminatedBy: req.user.uid,
          terminatedAtMs: nowMs(),
          updatedAtMs: nowMs(),
        });
        return;
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ==========================================
// PIŞTİ (Aynen korundu)
// ==========================================
// ... (senin mevcut Pişti kodların BURADA aynen duracak, değiştirme)

// (Senin mesajındaki tüm Pişti fonksiyonları ve endpointleri burada aynı kalacak)
// ⚠️ Buraya tekrar yapıştırman gereken yer: mevcut server.js'teki PIŞTİ bloğu.

// ==========================================
// AUTO CLEANUP LOOP (server kendi kendini temizler)
// ==========================================
setInterval(() => {
  cleanupConquestRooms().catch(() => {});
}, 30 * 1000);

app.listen(PORT, () => console.log(`🚀 PlayMatrix Backend Started. Port: ${PORT}`));
