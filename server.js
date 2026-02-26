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

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use(generalLimiter);

app.get('/', (req, res) => res.status(200).send('✅ PlayMatrix API is running'));

const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Oturum yok.' });
  try { req.user = await auth.verifyIdToken(h.split(' ')[1]); return next(); }
  catch (e) { return res.status(401).json({ ok: false, error: 'Geçersiz token.' }); }
};

const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim().replace(/[<>]/g, '') : '');
const nowMs = () => Date.now();

/* ===== USER ===== */
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const uRef = db.collection('users').doc(req.user.uid);
    const snap = await uRef.get();
    res.json({
      ok: true,
      balance: safeNum(snap.exists ? snap.data().balance : 0, 0),
      user: snap.exists ? snap.data() : {}
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/wheel/spin', verifyAuth, async (req, res) => { res.json({ ok: true, prize: 5000 }); });
app.post('/api/bonus/claim', verifyAuth, async (req, res) => { res.json({ ok: true }); });

/* ==========================================
   GRID CONQUEST (LIVE SCORE/TIMER ENABLED)
========================================== */

app.post('/api/conquest/create', verifyAuth, async (req, res) => {
  try {
    const pass = cleanStr(req.body.pass);
    const isPrivate = pass.length >= 5;
    const rid = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 haneli

    const userRef = db.collection('users').doc(req.user.uid);
    const pubRef = db.collection('conquest_pub').doc(rid);
    const stateRef = db.collection('conquest_state').doc(rid);
    const passRef = db.collection('conquest_pass').doc(rid);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      const uname = uSnap.exists ? (uSnap.data().username || "Pilot") : "Pilot";

      tx.set(pubRef, {
        id: rid,
        p1Name: uname,
        p2Name: null,
        status: "waiting",
        isPrivate,
        s1: 0,
        s2: 0,
        endTimeMs: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      tx.set(stateRef, {
        p1: req.user.uid,
        p2: null,
        status: "waiting",
        cells: {},
        s1: 0,
        s2: 0,
        p1_lastClick: 0,
        p2_lastClick: 0,
        endTimeMs: null,
        winner: null
      });

      if (isPrivate) tx.set(passRef, { pass }); // istersen burada hash'e geçeriz
    });

    res.json({ ok: true, roomId: rid });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/conquest/join', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const pass = cleanStr(req.body.pass);
    if (!rid) throw new Error("Arena ID gerekli!");

    const userRef = db.collection('users').doc(req.user.uid);
    const pubRef = db.collection('conquest_pub').doc(rid);
    const stateRef = db.collection('conquest_state').doc(rid);
    const passRef = db.collection('conquest_pass').doc(rid);

    await db.runTransaction(async (tx) => {
      const pSnap = await tx.get(pubRef);
      if (!pSnap.exists) throw new Error("Arena kapalı!");
      const pData = pSnap.data();

      if (pData.status !== "waiting") throw new Error("Arena dolu!");

      if (pData.isPrivate) {
        const passData = await tx.get(passRef);
        if (!passData.exists || passData.data().pass !== pass) throw new Error("Hatalı şifre!");
      }

      const stSnap = await tx.get(stateRef);
      if (!stSnap.exists) throw new Error("Arena kapalı!");
      const st = stSnap.data();

      if (st.p1 === req.user.uid) throw new Error("Kendi arenana giremezsin.");
      if (st.p2) throw new Error("Arena dolu!");

      const uSnap = await tx.get(userRef);
      const uname = uSnap.exists ? (uSnap.data().username || "Pilot") : "Pilot";

      const endTimeMs = nowMs() + 60000;

      tx.update(pubRef, {
        p2Name: uname,
        status: "playing",
        endTimeMs,
      });

      tx.update(stateRef, {
        p2: req.user.uid,
        status: "playing",
        endTimeMs
      });
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/conquest/click', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const idx = parseInt(req.body.cellIndex, 10);
    if (!rid || isNaN(idx) || idx < 0 || idx > 35) throw new Error("Geçersiz");

    const stateRef = db.collection('conquest_state').doc(rid);
    const pubRef = db.collection('conquest_pub').doc(rid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists) return;
      const data = snap.data();

      if (data.status !== "playing") return;

      const endTimeMs = safeNum(data.endTimeMs, 0);
      if (!endTimeMs || nowMs() > endTimeMs) return;

      let role = null, lastClickField = '';
      if (data.p1 === req.user.uid) { role = "p1"; lastClickField = "p1_lastClick"; }
      else if (data.p2 === req.user.uid) { role = "p2"; lastClickField = "p2_lastClick"; }
      if (!role) return;

      if (nowMs() - safeNum(data[lastClickField], 0) < 140) throw new Error("Çok hızlı");

      const cells = data.cells || {};
      const oldOwner = cells[idx];
      if (oldOwner === role) return;

      let s1 = safeNum(data.s1, 0);
      let s2 = safeNum(data.s2, 0);

      if (oldOwner === "p1") s1 = Math.max(0, s1 - 1);
      else if (oldOwner === "p2") s2 = Math.max(0, s2 - 1);

      if (role === "p1") s1++;
      else s2++;

      tx.update(stateRef, {
        [`cells.${idx}`]: role,
        [lastClickField]: nowMs(),
        s1, s2
      });

      tx.update(pubRef, { s1, s2 });
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

app.post('/api/conquest/settle', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const stateRef = db.collection('conquest_state').doc(rid);
    const pubRef = db.collection('conquest_pub').doc(rid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists) return;
      const data = snap.data();

      if (data.status !== "playing") return;

      const endTimeMs = safeNum(data.endTimeMs, 0);
      if (nowMs() < endTimeMs - 3000) return;

      const s1 = safeNum(data.s1, 0);
      const s2 = safeNum(data.s2, 0);

      let winner = null;
      if (s1 > s2) winner = data.p1;
      else if (s2 > s1) winner = data.p2;

      tx.update(stateRef, { status: "finished", winner });
      tx.update(pubRef, { status: "finished" });

      if (winner) {
        tx.update(db.collection('users').doc(winner), {
          balance: admin.firestore.FieldValue.increment(500)
        });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

app.post('/api/conquest/leave', verifyAuth, async (req, res) => {
  try {
    const rid = cleanStr(req.body.roomId);
    const stateRef = db.collection('conquest_state').doc(rid);
    const pubRef = db.collection('conquest_pub').doc(rid);
    const passRef = db.collection('conquest_pass').doc(rid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists) return;
      const data = snap.data();

      const isP1 = data.p1 === req.user.uid;
      const isP2 = data.p2 === req.user.uid;
      if (!isP1 && !isP2) return;

      // finished: direkt temizle (ghost oda kalmasın)
      if (data.status === "finished") {
        tx.delete(pubRef);
        tx.delete(stateRef);
        tx.delete(passRef);
        return;
      }

      // waiting
      if (data.status === "waiting") {
        // sadece p1 room owner olduğu için temizler
        if (isP1) {
          tx.delete(pubRef);
          tx.delete(stateRef);
          tx.delete(passRef);
        }
        return;
      }

      // playing: terminate
      if (data.status === "playing") {
        tx.update(stateRef, { status: "terminated" });
        tx.update(pubRef, { status: "terminated" });
        return;
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

app.listen(PORT, () => console.log(`🚀 PlayMatrix Backend Started. Port: ${PORT}`));
