const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// FIREBASE_KEY kontrolü (yoksa net hata ver)
if (!process.env.FIREBASE_KEY) {
  throw new Error("FIREBASE_KEY env yok. Render > Environment kısmına eklemelisin.");
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

  // Bazı panellerde private_key \\n olarak kalabiliyor, bunu düzelt
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
} catch (e) {
  throw new Error("FIREBASE_KEY JSON parse hatası. Değeri ham JSON olarak yapıştırmalısın.");
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Token Doğrulama Middleware (daha sağlam)
const authUser = async (req, res, next) => {
  try {
    const h = req.headers.authorization || "";
    const token = h.replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Token yok" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Oturum Hatası" });
  }
};

// 1) Kullanıcı ve Aktif Oyun Durumu
app.get("/api/me", authUser, async (req, res) => {
  const userRef = db.collection("users").doc(req.uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({ balance: 5000, currentSession: { active: false } });
    return res.json({ balance: 5000, session: { active: false } });
  }

  const data = doc.data() || {};
  res.json({ balance: data.balance || 0, session: data.currentSession || { active: false } });
});

// 2) Oyunu Başlat
app.post("/api/mines/start", authUser, async (req, res) => {
  const bet = Number(req.body?.bet);
  const mines = Number(req.body?.mines);

  if (!Number.isFinite(bet) || bet <= 0) return res.status(400).json({ error: "Geçersiz bahis" });
  if (!Number.isFinite(mines) || mines < 1 || mines > 24) return res.status(400).json({ error: "Geçersiz mayın" });

  const userRef = db.collection("users").doc(req.uid);

  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(userRef);

      // kullanıcı yoksa oluştur
      if (!snap.exists) {
        t.set(userRef, { balance: 5000, currentSession: { active: false } }, { merge: true });
      }

      const userData = (await t.get(userRef)).data() || {};
      const balance = Number(userData.balance || 0);

      if (balance < bet) throw new Error("Yetersiz Bakiye!");

      // mayınları rastgele yerleştir
      const allMines = [];
      while (allMines.length < mines) {
        const r = Math.floor(Math.random() * 25);
        if (!allMines.includes(r)) allMines.push(r);
      }

      t.set(
        userRef,
        {
          balance: balance - bet,
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

// 3) Kutu Açma
app.post("/api/mines/click", authUser, async (req, res) => {
  const index = Number(req.body?.index);
  if (!Number.isFinite(index) || index < 0 || index > 24) {
    return res.status(400).json({ error: "Geçersiz index" });
  }

  const userRef = db.collection("users").doc(req.uid);
  const user = (await userRef.get()).data() || {};
  const s = user.currentSession;

  if (!s || !s.active) return res.status(400).json({ error: "Aktif oyun yok" });
  if ((s.openedIndices || []).includes(index)) return res.status(400).json({ error: "Bu taş zaten açıldı" });

  if ((s.mineIndices || []).includes(index)) {
    await userRef.set({ currentSession: { ...s, active: false } }, { merge: true });
    return res.json({ result: "mine", mineIndices: s.mineIndices });
  }

  const n = Number(s.opened || 0) + 1;

  let mult = 1;
  for (let i = 0; i < n; i++) mult *= (25 - i) / (25 - Number(s.mines) - i);
  mult = Math.round(mult * 100) / 100;

  await userRef.set(
    {
      currentSession: {
        opened: n,
        multiplier: mult,
        openedIndices: admin.firestore.FieldValue.arrayUnion(index),
      },
    },
    { merge: true }
  );

  res.json({ result: "diamond", opened: n, multiplier: mult });
});

// 4) Cashout
app.post("/api/mines/cashout", authUser, async (req, res) => {
  const userRef = db.collection("users").doc(req.uid);
  const user = (await userRef.get()).data() || {};
  const s = user.currentSession;

  if (!s || !s.active || Number(s.opened || 0) === 0) return res.status(400).json({ error: "Geçersiz işlem" });

  const win = Math.floor(Number(s.bet) * Number(s.multiplier || 1));
  const newBalance = Number(user.balance || 0) + win;

  await userRef.set(
    {
      balance: newBalance,
      currentSession: { ...s, active: false },
    },
    { merge: true }
  );

  res.json({ ok: true, winAmount: win, balance: newBalance, mineIndices: s.mineIndices });
});

// Render uyumlu PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Motor Hazir! PORT:", PORT));
