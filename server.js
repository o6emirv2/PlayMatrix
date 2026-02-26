const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

function getServiceAccount() {
  const raw = process.env.FIREBASE_KEY;
  if (!raw) throw new Error("FIREBASE_KEY env değişkeni yok.");

  // 1) Direkt JSON olarak parse dene
  try {
    const obj = JSON.parse(raw);
    // Bazı paneller private_key içinde \\n bırakabiliyor
    if (obj.private_key && obj.private_key.includes("\\n")) {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }
    return obj;
  } catch (_) {}

  // 2) Eğer biri base64 yapıştırdıysa (opsiyonel destek)
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const obj = JSON.parse(decoded);
    if (obj.private_key && obj.private_key.includes("\\n")) {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }
    return obj;
  } catch (e) {
    throw new Error("FIREBASE_KEY parse edilemedi. Service Account JSON'un TAMAMINI yapıştırmalısın.");
  }
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// Health
app.get("/", (req, res) => res.send("OK"));

const authUser = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Token yok" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Oturum Hatası" });
  }
};

app.get("/api/me", authUser, async (req, res) => {
  const userRef = db.collection("users").doc(req.uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    await userRef.set({ balance: 5000, currentSession: { active: false } });
    return res.json({ balance: 5000, session: { active: false } });
  }

  const data = snap.data() || {};
  res.json({
    balance: Number(data.balance || 0),
    session: data.currentSession || { active: false },
  });
});

app.post("/api/mines/start", authUser, async (req, res) => {
  const bet = Number(req.body?.bet);
  const mines = Number(req.body?.mines);

  if (!Number.isFinite(bet) || bet < 1) return res.status(400).json({ error: "Geçersiz bahis" });
  if (!Number.isFinite(mines) || mines < 1 || mines > 24) return res.status(400).json({ error: "Geçersiz mayın sayısı" });

  const userRef = db.collection("users").doc(req.uid);

  await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    let user = snap.exists ? (snap.data() || {}) : { balance: 5000, currentSession: { active: false } };

    const balance = Number(user.balance || 0);
    if (balance < bet) throw new Error("Yetersiz Bakiye!");

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
  res.json({ ok: true, balance: updated.balance });
});

app.post("/api/mines/click", authUser, async (req, res) => {
  const index = Number(req.body?.index);
  if (!Number.isFinite(index) || index < 0 || index > 24) return res.status(400).json({ error: "Geçersiz index" });

  const userRef = db.collection("users").doc(req.uid);

  const out = await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new Error("Kullanıcı yok");

    const user = snap.data() || {};
    const s = user.currentSession;

    if (!s || !s.active) throw new Error("Aktif oyun yok");
    if (Array.isArray(s.openedIndices) && s.openedIndices.includes(index)) {
      return { result: "diamond", opened: s.opened, multiplier: s.multiplier };
    }

    if (Array.isArray(s.mineIndices) && s.mineIndices.includes(index)) {
      t.update(userRef, { "currentSession.active": false });
      return { result: "mine", mineIndices: s.mineIndices };
    }

    const n = Number(s.opened || 0) + 1;
    const m = Number(s.mines || 1);

    let mult = 1;
    for (let i = 0; i < n; i++) mult *= (25 - i) / (25 - m - i);
    mult = Math.round(mult * 100) / 100;

    t.update(userRef, {
      "currentSession.opened": n,
      "currentSession.multiplier": mult,
      "currentSession.openedIndices": admin.firestore.FieldValue.arrayUnion(index),
    });

    return { result: "diamond", opened: n, multiplier: mult };
  });

  res.json(out);
});

app.post("/api/mines/cashout", authUser, async (req, res) => {
  const userRef = db.collection("users").doc(req.uid);

  const out = await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new Error("Kullanıcı yok");

    const user = snap.data() || {};
    const s = user.currentSession;

    if (!s || !s.active || Number(s.opened || 0) === 0) throw new Error("Geçersiz işlem");

    const balance = Number(user.balance || 0);
    const win = Math.floor(Number(s.bet || 0) * Number(s.multiplier || 1));

    t.update(userRef, {
      balance: balance + win,
      "currentSession.active": false,
    });

    return { ok: true, winAmount: win, balance: balance + win, mineIndices: s.mineIndices };
  });

  res.json(out);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Motor Hazir! PORT:", PORT));
