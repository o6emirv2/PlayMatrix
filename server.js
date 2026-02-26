'use strict';

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Güvenlik Hardening
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// -------------------- Process guards --------------------
process.on('uncaughtException', (err) => console.error('Kritik Hata (Çökme Engellendi):', err));
process.on('unhandledRejection', (reason) => console.error('İşlenmeyen Promise Hatası:', reason));

// -------------------- ENV --------------------
const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// -------------------- Firebase Admin Init --------------------
(function initFirebase() {
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_KEY) throw new Error('FIREBASE_KEY missing');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  } catch (e) {
    throw new Error('FIREBASE_KEY JSON parse hatası. Değer tek satır JSON olmalı.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin bağlandı.');
})();

const db = admin.firestore();
const auth = admin.auth();

// -------------------- Express Setup --------------------
const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

app.use(cors({
  origin: function (origin, cb) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Genel Rate Limit (DDOS Koruması)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Bonus Kodu Özel Rate Limit (Brute Force Engelleme - 15 dk 5 deneme)
const bonusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, 
  message: { ok: false, error: "Çok fazla deneme yaptınız. Lütfen 15 dakika bekleyin." }
});

app.get('/', (req, res) => res.status(200).send('✅ PlayMatrix API is running'));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// -------------------- Auth Middleware --------------------
const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Oturum yok.' });

  try {
    const token = h.split(' ')[1];
    req.user = await auth.verifyIdToken(token);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Geçersiz token.' });
  }
};

// -------------------- Helpers --------------------
const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim() : '');
const nowMs = () => Date.now();
const ALLOWED_AVATAR_DOMAIN = "https://encrypted-tbn0.gstatic.com/"; // Avatar Allowlist

// --- PİŞTİ HELPERLARI ---
const CARD_POINTS = { "D0": 3, "C2": 2 }; 
const normalizeCardVal = (c) => { if (!c) return ""; const v = c.substring(0, c.length - 1); return (v === '0') ? '10' : v; };
const calculatePoints = (cards) => {
  let p = 0;
  for (const c of cards) {
    if (CARD_POINTS[c]) p += CARD_POINTS[c];
    else { const val = normalizeCardVal(c); if (val === 'A' || val === 'J') p += 1; }
  }
  return p;
};
function createShuffledDeck(isDouble) {
  const s = ["H", "D", "C", "S"], v = ["A","2","3","4","5","6","7","8","9","0","J","Q","K"];
  let d = [];
  for (const suit of s) for (const val of v) d.push(val + suit);
  if (isDouble) d = [...d, ...d];
  for (let i = d.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function maxPlayersByType(type) { return String(type || "2-52").startsWith("4") ? 4 : 2; }
function is104(type) { return String(type || "").includes("104"); }

// -------------------- Collections --------------------
const colUsers = () => db.collection('users');
const colPromos = () => db.collection('promo_codes');
// ... Pişti Collections ... (Burası bir önceki dosyadaki ile aynı kalacak, uzatmamak için kestim. Pişti endpointlerin sabit kalıyor.)
const colPublic = () => db.collection('rooms_public');
const colState  = () => db.collection('rooms_state');
const colPass   = () => db.collection('rooms_passwords');
const playersSub = (roomId) => colPublic().doc(roomId).collection('players');

// -------------------- /api/me --------------------
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const uRef = colUsers().doc(req.user.uid);
    const snap = await uRef.get();
    const data = snap.exists ? (snap.data() || {}) : {};

    if (!data.email && req.user.email) {
      await uRef.set({ email: req.user.email }, { merge: true });
      data.email = req.user.email;
    }
    res.json({ ok: true, balance: safeNum(data.balance, 0), user: data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- /api/profile/update --------------------
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

      if (!u.email && req.user.email) updates.email = req.user.email;

      // Kilitli Alanlar: Doluysa ASLA değişmez (Backend Enforcement)
      if (cleanStr(fullName) && !cleanStr(u.fullName)) updates.fullName = cleanStr(fullName);
      if (cleanStr(phone) && !cleanStr(u.phone)) updates.phone = cleanStr(phone);

      // Avatar Allowlist Kontrolü
      if (typeof avatar === 'string' && avatar.startsWith(ALLOWED_AVATAR_DOMAIN)) {
        updates.avatar = avatar;
      }

      // Kullanıcı Adı: Max 3 Değişim Kesin Kontrolü
      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        const used = safeNum(u.userChangeCount, 0);
        if (used >= 3) throw new Error("Kullanıcı adı değiştirme hakkınız tamamen dolmuştur!");

        const qSnap = await tx.get(db.collection('users').where('username', '==', wanted).limit(1));
        if (!qSnap.empty && qSnap.docs[0].id !== uid) throw new Error("Bu kullanıcı adı sistemde kayıtlı!");

        updates.username = wanted;
        updates.userChangeCount = used + 1;
      }

      if (Object.keys(updates).length > 0) tx.update(userRef, updates);
    });

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- /api/wheel/spin (Backend Cooldown Enforcement) --------------------
app.post('/api/wheel/spin', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);
    const rewards = [2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000]; // Miktarlar backendde gömülü

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("Kullanıcı kaydı yok!");
      const u = snap.data() || {};
      const lastSpin = safeNum(u.lastSpin, 0);

      const cooldown = 86400000; // 24 Saat kesin kontrol
      if ((nowMs() - lastSpin) < cooldown) throw new Error("Çark bekleme süreniz henüz dolmadı. (İllegal istek reddedildi)");

      const rnd = crypto.randomInt(0, rewards.length);
      const prize = rewards[rnd];

      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(prize), lastSpin: nowMs() });
      return { index: rnd, prize, balance: safeNum(u.balance, 0) + prize };
    });

    res.json({ ok: true, ...out });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// -------------------- /api/bonus/claim (Rate Limited) --------------------
app.post('/api/bonus/claim', verifyAuth, bonusLimiter, async (req, res) => {
  try {
    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!code) throw new Error("Kod boş olamaz.");

    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);
    const promoRef = colPromos().doc(code);

    const out = await db.runTransaction(async (tx) => {
      const [uSnap, pSnap] = await Promise.all([tx.get(userRef), tx.get(promoRef)]);
      if (!uSnap.exists) throw new Error("Kullanıcı kaydı yok!");
      if (!pSnap.exists) throw new Error("Geçersiz veya süresi dolmuş promosyon kodu.");

      const u = uSnap.data() || {};
      const p = pSnap.data() || {};
      const amount = safeNum(p.amount, 0);
      if (amount <= 0) throw new Error("Kod pasif durumda.");

      const used = Array.isArray(u.usedPromos) ? u.usedPromos : [];
      if (used.includes(code)) throw new Error("Bu kodu daha önce hesabınızda kullandınız!");

      const limitLeft = safeNum(p.limitLeft, -1);
      if (limitLeft === 0) throw new Error("Maalesef bu kodun kullanım limiti tükendi.");

      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        usedPromos: admin.firestore.FieldValue.arrayUnion(code)
      });
      if (limitLeft > 0) tx.update(promoRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });

      return { amount, balance: safeNum(u.balance, 0) + amount };
    });

    res.json({ ok: true, ...out });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ... BURAYA PİŞTİ APİ ROUTELERI GELECEK (DOKUNULMADI) ...

app.listen(PORT, () => console.log(`🚀 PlayMatrix Backend Started. Port: ${PORT}`));
