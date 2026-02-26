const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Render env FIREBASE_KEY bazen "\\n" içerir -> gerçek newline'a çevir
const rawKey = process.env.FIREBASE_KEY;
if (!rawKey) throw new Error("FIREBASE_KEY env yok!");

const fixedKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
const serviceAccount = JSON.parse(fixedKey);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Token Doğrulama Middleware
const authUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token yok" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    res.status(401).json({ error: "Oturum Hatası" });
  }
};

// 1. Kullanıcı ve Aktif Oyun Durumu
app.get("/api/me", authUser, async (req, res) => {
  const userRef = db.collection("users").doc(req.uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({ balance: 5000, currentSession: { active: false } }, { merge: true });
    return res.json({ balance: 5000, session: { active: false } });
  }

  const data = doc.data() || {};
  res.json({ balance: data.balance || 0, session: data.currentSession || { active: false } });
});

// 2. Oyunu Başlat
app.post("/api/mines/start", authUser, async (req, res) => {
  const { bet, mines } = req.body;
  const userRef = db.collection("users").doc(req.uid);

  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      const user = snap.exists ? (snap.data() || {}) : { balance: 5000, currentSession: { active: false } };

      if (!snap.exists) t.set(userRef, user, { merge: true });
      if (user.currentSession?.active) throw new Error("Zaten aktif oyun var!");
      if ((user.balance || 0) < bet) throw new Error("Yetersiz Bakiye!");

      const allMines = [];
      while (allMines.length < mines) {
        const r = Math.floor(Math.random() * 25);
        if (!allMines.includes(r)) allMines.push(r);
      }

      t.set(
        userRef,
        {
          balance: (user.balance || 0) - bet,
          currentSession: {
            active: true,
            bet,
            mines,
            mineIndices: allMines,
            openedIndices: [],
            multiplier: 1.0,
            opened: 0,
          },
        },
        { merge: true }
      );
    });

    const updated = (await userRef.get()).data() || {};
    res.json({ ok: true, balance: updated.balance || 0 });
  } catch (e) {
    res.status(400).json({ error: e.message || "Başlatma hatası" });
  }
});

// 3. Kutu Açma
app.post("/api/mines/click", authUser, async (req, res) => {
  const { index } = req.body;
  const userRef = db.collection("users").doc(req.uid);
  const user = (await userRef.get()).data() || {};
  const s = user.currentSession;

  if (!s || !s.active) return res.status(400).json({ error: "Aktif oyun yok" });

  if (s.mineIndices.includes(index)) {
    await userRef.update({ "currentSession.active": false });
    return res.json({ result: "mine", mineIndices: s.mineIndices });
  }

  const n = (s.opened || 0) + 1;
  let mult = 1;
  for (let i = 0; i < n; i++) mult *= (25 - i) / (25 - s.mines - i);
  mult = Math.round(mult * 100) / 100;

  await userRef.update({
    "currentSession.opened": n,
    "currentSession.multiplier": mult,
    "currentSession.openedIndices": admin.firestore.FieldValue.arrayUnion(index),
  });

  res.json({ result: "diamond", opened: n, multiplier: mult });
});

// 4. Cashout
app.post("/api/mines/cashout", authUser, async (req, res) => {
  const userRef = db.collection("users").doc(req.uid);
  const user = (await userRef.get()).data() || {};
  const s = user.currentSession;

  if (!s || !s.active || (s.opened || 0) === 0) return res.status(400).json({ error: "Geçersiz işlem" });

  const win = Math.floor(s.bet * s.multiplier);

  await userRef.update({
    balance: (user.balance || 0) + win,
    "currentSession.active": false,
  });

  res.json({ ok: true, winAmount: win, balance: (user.balance || 0) + win, mineIndices: s.mineIndices });
});

app.get("/", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Motor Hazir!", PORT));
