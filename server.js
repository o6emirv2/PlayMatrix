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
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ---------- Firebase Admin Init ----------
(function initFirebase() {
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_KEY) throw new Error('FIREBASE_KEY missing');
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  } catch {
    throw new Error('FIREBASE_KEY JSON parse hatası.');
  }
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

// Genel limit
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 900,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Blackjack action endpoint’i için ekstra limit (hile/spam)
const bjActionLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Çok hızlı işlem (spam) tespit edildi.' }
});

// Bonus için limit (istersen kaldırabilirsin)
const bonusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { ok: false, error: "Çok fazla deneme yaptınız." }
});

app.get('/', (req, res) => res.status(200).send('✅ PlayMatrix API is running'));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- Auth Verify ----------
const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Oturum yok.' });
  try {
    req.user = await auth.verifyIdToken(h.split(' ')[1]);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Geçersiz token.' });
  }
};

const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim().replace(/[<>]/g, "") : '');
const nowMs = () => Date.now();

const colUsers = () => db.collection('users');
const colPromos = () => db.collection('promo_codes');
const colBJ = () => db.collection('bj_sessions');

const ALLOWED_AVATAR_DOMAIN = "https://encrypted-tbn0.gstatic.com/";

// ======================================================
// KULLANICI PROFİL / ÇARK / BONUS
// ======================================================
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const uRef = colUsers().doc(req.user.uid);
    const snap = await uRef.get();
    res.json({
      ok: true,
      balance: safeNum(snap.exists ? snap.data().balance : 0, 0),
      user: snap.exists ? snap.data() : {}
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/profile/update', verifyAuth, async (req, res) => {
  try {
    const { fullName, phone, username, avatar } = req.body || {};
    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {};
      const updates = {};

      if (!u.email && req.user.email) updates.email = req.user.email;
      if (cleanStr(fullName) && !cleanStr(u.fullName)) updates.fullName = cleanStr(fullName);
      if (cleanStr(phone) && !cleanStr(u.phone)) updates.phone = cleanStr(phone);

      if (typeof avatar === 'string' && avatar.startsWith(ALLOWED_AVATAR_DOMAIN)) updates.avatar = avatar;

      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        const used = safeNum(u.userChangeCount, 0);
        if (used >= 3) throw new Error("İsim hakkı doldu!");
        const qSnap = await tx.get(db.collection('users').where('username', '==', wanted).limit(1));
        if (!qSnap.empty && qSnap.docs[0].id !== uid) throw new Error("Bu isim kullanımda!");
        updates.username = wanted;
        updates.userChangeCount = used + 1;
      }

      if (Object.keys(updates).length > 0) tx.update(userRef, updates);
    });

    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/wheel/spin', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);
    const rewards = [2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000];

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {};
      const lastSpin = safeNum(u.lastSpin, 0);
      if ((nowMs() - lastSpin) < 86400000) throw new Error("Süre dolmadı.");

      const rnd = crypto.randomInt(0, rewards.length);
      const prize = rewards[rnd];

      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(prize), lastSpin: nowMs() });
      return { index: rnd, prize, balance: safeNum(u.balance, 0) + prize };
    });

    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/bonus/claim', verifyAuth, bonusLimiter, async (req, res) => {
  try {
    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!code) throw new Error("Kod boş.");

    const uid = req.user.uid;
    const userRef = colUsers().doc(uid);
    const promoRef = colPromos().doc(code);

    const out = await db.runTransaction(async (tx) => {
      const [uSnap, pSnap] = await Promise.all([tx.get(userRef), tx.get(promoRef)]);
      if (!uSnap.exists || !pSnap.exists) throw new Error("Hata.");

      const u = uSnap.data() || {};
      const p = pSnap.data() || {};

      const amount = safeNum(p.amount, 0);
      if (amount <= 0) throw new Error("Kod pasif.");

      const used = Array.isArray(u.usedPromos) ? u.usedPromos : [];
      if (used.includes(code)) throw new Error("Kullanılmış.");

      const limitLeft = safeNum(p.limitLeft, -1);
      if (limitLeft === 0) throw new Error("Tükendi.");

      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        usedPromos: admin.firestore.FieldValue.arrayUnion(code)
      });
      if (limitLeft > 0) tx.update(promoRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });

      return { amount, balance: safeNum(u.balance, 0) + amount };
    });

    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ======================================================
// ✅ BLACKJACK (TÜM MANTIK SUNUCUDA) - ANTI-HİLE
// ======================================================

// ---- Blackjack Engine ----
function createDeck(shoeCount = 8) {
  const suits = ['H', 'D', 'C', 'S'];
  const vals = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  const deck = [];
  for (let i=0;i<shoeCount;i++) for (const s of suits) for (const v of vals) deck.push({ suit: s, value: v });

  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardPoints(v){
  if (v === 1) return 11; // A
  if (v >= 11) return 10; // J Q K
  return v;
}

function scoreHand(cards){
  let total = 0;
  let aces = 0;
  for (const c of (cards || [])) {
    const p = cardPoints(c.value);
    if (p === 11) aces++;
    total += p;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, softAces: aces };
}

function isSoft17(cards){
  const s = scoreHand(cards);
  return s.total === 17 && s.softAces > 0;
}

function isBJ(cards){
  return Array.isArray(cards) && cards.length === 2 && scoreHand(cards).total === 21;
}

function canSplit(hand){
  if (!hand || !Array.isArray(hand.cards) || hand.cards.length !== 2) return false;
  const v1 = hand.cards[0].value >= 11 ? 10 : hand.cards[0].value;
  const v2 = hand.cards[1].value >= 11 ? 10 : hand.cards[1].value;
  return v1 === v2;
}

function publicState(session){
  const dealer = session.dealer || [];
  const dealerHidden = !!session.dealerHidden;
  return {
    ok: true,
    state: {
      gameState: session.gameState,
      dealerHidden,
      dealer: dealerHidden ? [dealer[0] || null, null] : dealer,
      hands: (session.hands || []).map(h => ({
        cards: h.cards || [],
        bet: safeNum(h.bet, 0),
        status: h.status || 'playing',
        done: !!h.done,
      })),
      currentHandIdx: safeNum(session.currentHandIdx, 0),
      insuranceOffered: !!session.insuranceOffered,
      insuranceBet: safeNum(session.insuranceBet, 0),
      message: session.message || '',
      lastResult: session.lastResult || null,
      seq: safeNum(session.seq, 0),
    }
  };
}

// ---- Session TTL Cleanup (Sadece çok eski session’ları siler) ----
setInterval(async () => {
  try {
    const q = await colBJ().limit(300).get();
    const now = nowMs();
    const batch = db.batch();
    let n = 0;
    q.forEach(doc => {
      const d = doc.data() || {};
      const age = now - safeNum(d.updatedAtMs, safeNum(d.createdAtMs, 0));
      // sadece çok eskileri sil (aktif oyunu "hızlı silme" yok)
      if (age > 20 * 60 * 1000) { // 20 dk
        batch.delete(doc.ref);
        n++;
      }
    });
    if (n) await batch.commit();
  } catch {}
}, 60 * 1000);

// ---- Resume ----
app.get('/api/bj/state', verifyAuth, async (req, res) => {
  try {
    const sRef = colBJ().doc(req.user.uid);
    const snap = await sRef.get();
    if (!snap.exists) return res.json({ ok: true, state: null });

    const session = snap.data() || {};
    const age = nowMs() - safeNum(session.updatedAtMs, safeNum(session.createdAtMs, 0));
    if (age > 20 * 60 * 1000) {
      await sRef.delete().catch(() => {});
      return res.json({ ok: true, state: null });
    }

    return res.json(publicState(session));
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---- Start (GÜNCELLENMİŞ: Escape Exploit kapalı) ----
app.post('/api/bj/start', verifyAuth, async (req, res) => {
  try {
    const bet = safeNum(req.body?.bet, 0);
    if (!Number.isInteger(bet) || bet < 1000) throw new Error('Min bahis 1000 MC.');

    const uid = req.user.uid;
    const uRef = colUsers().doc(uid);
    const sRef = colBJ().doc(uid);

    const session = await db.runTransaction(async (tx) => {
      // 1) Aktif oyun var mı? (playing/resolving ise YENİ OYUN YOK)
      const existingSessionSnap = await tx.get(sRef);
      if (existingSessionSnap.exists) {
        const existing = existingSessionSnap.data() || {};
        if (existing.gameState === 'playing' || existing.gameState === 'resolving') {
          // İstersen burada "state'i döndür" şeklinde de yapabiliriz,
          // ama senin istediğin gibi start engelliyoruz.
          throw new Error('Hala devam eden aktif bir oyununuz var. Lütfen önce o eli bitirin.');
        }
      }

      // 2) Kullanıcı bakiye kontrol
      const uSnap = await tx.get(uRef);
      if (!uSnap.exists) throw new Error('Kullanıcı yok.');

      const bal = safeNum(uSnap.data()?.balance, 0);
      if (bal < bet) throw new Error('Bakiye yetersiz.');

      // 3) Bakiye düş
      tx.update(uRef, { balance: admin.firestore.FieldValue.increment(-bet) });

      // 4) Yeni oyun state’i
      const deck = createDeck(8);
      const hands = [{ cards: [], bet, status: 'playing', done: false }];
      const dealer = [];

      hands[0].cards.push(deck.pop(), deck.pop());
      dealer.push(deck.pop(), deck.pop());

      const insuranceOffered = dealer[0]?.value === 1; // A

      const newSession = {
        uid,
        createdAtMs: nowMs(),
        updatedAtMs: nowMs(),
        gameState: 'playing',
        dealer,
        dealerHidden: true,
        hands,
        currentHandIdx: 0,
        insuranceOffered,
        insuranceBet: 0,
        message: insuranceOffered ? 'SİGORTA İSTER MİSİNİZ?' : '',
        lastResult: null,
        _deck: deck,
        seq: 1,
        lastActionAtMs: nowMs(),
      };

      // 5) Sigorta yoksa BJ kontrol
      if (!insuranceOffered) {
        const pBJ = isBJ(hands[0].cards);
        const dBJ = isBJ(dealer);
        if (pBJ || dBJ) {
          newSession.dealerHidden = false;
          newSession.gameState = 'resolving';
        }
      }

      tx.set(sRef, newSession, { merge: true });
      return newSession;
    });

    if (session.gameState === 'resolving') {
      await resolveAndPayout(uid);
      const snap = await colBJ().doc(uid).get();
      return res.json(publicState(snap.data() || {}));
    }

    res.json(publicState(session));
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---- Action ----
app.post('/api/bj/action', verifyAuth, bjActionLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const action = cleanStr(req.body?.action).toLowerCase();
    const clientSeq = safeNum(req.body?.seq, 0);

    const sRef = colBJ().doc(uid);
    const uRef = colUsers().doc(uid);

    const updated = await db.runTransaction(async (tx) => {
      const sSnap = await tx.get(sRef);
      if (!sSnap.exists) throw new Error('Aktif oyun yok.');
      const s = sSnap.data() || {};
      if (s.gameState !== 'playing' && s.gameState !== 'resolving') throw new Error('Oyun aktif değil.');

      // Anti-replay
      const seq = safeNum(s.seq, 0);
      if (clientSeq !== seq) throw new Error('Şüpheli istek (senkron bozuk / replay).');

      // Çok hızlı aksiyon engeli
      const lastAt = safeNum(s.lastActionAtMs, 0);
      const now = nowMs();
      if (now - lastAt < 120) throw new Error('Çok hızlı işlem tespit edildi.');

      // resolving ise sadece state
      if (s.gameState === 'resolving') {
        tx.update(sRef, { seq: seq + 1, lastActionAtMs: nowMs(), updatedAtMs: nowMs() });
        return s;
      }

      // insurance aşaması
      if (s.insuranceOffered) {
        if (action !== 'insurance_yes' && action !== 'insurance_no') throw new Error('Sigorta seçimi gerekli.');
        const bet = safeNum(s.hands?.[0]?.bet, 0);
        const insCost = Math.floor(bet / 2);

        if (action === 'insurance_yes') {
          const uSnap = await tx.get(uRef);
          const bal = safeNum(uSnap.data()?.balance, 0);
          if (bal < insCost) throw new Error('Sigorta için bakiye yetersiz.');
          tx.update(uRef, { balance: admin.firestore.FieldValue.increment(-insCost) });
          s.insuranceBet = insCost;
        }

        s.insuranceOffered = false;
        s.message = '';

        const pBJ = isBJ(s.hands?.[0]?.cards || []);
        const dBJ = isBJ(s.dealer || []);
        if (pBJ || dBJ) { s.dealerHidden = false; s.gameState = 'resolving'; }

        s.seq = seq + 1;
        s.lastActionAtMs = now;
        s.updatedAtMs = now;
        tx.set(sRef, s, { merge: true });
        return s;
      }

      // normal aksiyonlar
      if (!Array.isArray(s._deck) || s._deck.length < 20) s._deck = createDeck(8);
      const deck = s._deck;

      const hands = Array.isArray(s.hands) ? s.hands : [];
      const dealer = Array.isArray(s.dealer) ? s.dealer : [];
      let cur = safeNum(s.currentHandIdx, 0);
      if (!hands[cur]) throw new Error('El bulunamadı.');

      const openIdx = hands.findIndex(h => !h.done);
      if (openIdx >= 0) { cur = openIdx; s.currentHandIdx = openIdx; }

      const hand = hands[cur];
      hand.cards = Array.isArray(hand.cards) ? hand.cards : [];
      if (hand.done) throw new Error('Bu el bitti.');

      if (action === 'hit') {
        hand.cards.push(deck.pop());
        const sc = scoreHand(hand.cards).total;
        if (sc >= 21) { hand.done = true; hand.status = sc > 21 ? 'bust' : 'stand'; }
      } else if (action === 'stand') {
        hand.done = true;
        hand.status = 'stand';
      } else if (action === 'double') {
        if (hand.cards.length !== 2) throw new Error('Double sadece ilk 2 kartta.');
        const uSnap = await tx.get(uRef);
        const bal = safeNum(uSnap.data()?.balance, 0);
        if (bal < safeNum(hand.bet, 0)) throw new Error('Double için bakiye yetersiz.');
        tx.update(uRef, { balance: admin.firestore.FieldValue.increment(-safeNum(hand.bet, 0)) });
        hand.bet = safeNum(hand.bet, 0) * 2;
        hand.cards.push(deck.pop());
        const sc = scoreHand(hand.cards).total;
        hand.done = true;
        hand.status = sc > 21 ? 'bust' : 'stand';
      } else if (action === 'split') {
        if (hands.length !== 1) throw new Error('Split sadece tek elde.');
        if (!canSplit(hand)) throw new Error('Split şartı yok.');
        const uSnap = await tx.get(uRef);
        const bal = safeNum(uSnap.data()?.balance, 0);
        if (bal < safeNum(hand.bet, 0)) throw new Error('Split için bakiye yetersiz.');
        tx.update(uRef, { balance: admin.firestore.FieldValue.increment(-safeNum(hand.bet, 0)) });

        const c2 = hand.cards.pop();
        const newHand = { cards: [c2], bet: safeNum(hand.bet, 0), status: 'playing', done: false };
        hands.push(newHand);

        hand.cards.push(deck.pop());
        newHand.cards.push(deck.pop());
      } else {
        throw new Error('Geçersiz action.');
      }

      // sıradaki el / dealer
      let nextIdx = -1;
      for (let i = 0; i < hands.length; i++) {
        if (!hands[i].done) { nextIdx = i; break; }
      }

      if (nextIdx >= 0) {
        s.currentHandIdx = nextIdx;
      } else {
        // dealer turn
        s.dealerHidden = false;
        const allBust = hands.every(h => scoreHand(h.cards).total > 21);
        if (!allBust) {
          while (scoreHand(dealer).total < 17 || isSoft17(dealer)) dealer.push(deck.pop());
        }
        s.gameState = 'resolving';
      }

      s.hands = hands;
      s.dealer = dealer;
      s._deck = deck;

      s.seq = seq + 1;
      s.lastActionAtMs = now;
      s.updatedAtMs = now;

      tx.set(sRef, s, { merge: true });
      return s;
    });

    if (updated.gameState === 'resolving') {
      await resolveAndPayout(uid);
      const snap = await colBJ().doc(uid).get();
      return res.json(publicState(snap.data() || {}));
    }

    const snap = await colBJ().doc(uid).get();
    res.json(publicState(snap.data() || {}));
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---- Resolve & Payout ----
async function resolveAndPayout(uid) {
  const sRef = colBJ().doc(uid);
  const uRef = colUsers().doc(uid);

  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists) return;
    const s = sSnap.data() || {};
    if (s.gameState !== 'resolving') return;

    const dealer = Array.isArray(s.dealer) ? s.dealer : [];
    const hands = Array.isArray(s.hands) ? s.hands : [];
    const dTotal = scoreHand(dealer).total;
    const dBJ = isBJ(dealer);

    let totalWin = 0;
    let didWin = false;

    const insuranceBet = safeNum(s.insuranceBet, 0);
    if (insuranceBet > 0 && dBJ) {
      totalWin += insuranceBet * 3; // stake dahil 3x
      didWin = true;
    }

    for (const h of hands) {
      const bet = safeNum(h.bet, 0);
      const pTotal = scoreHand(h.cards || []).total;
      const pBJ = isBJ(h.cards || []) && hands.length === 1;

      if (pTotal > 21) continue;
      if (dBJ && !pBJ) continue;

      if (pBJ && !dBJ) {
        totalWin += Math.floor(bet * 2.5); // 3:2
        didWin = true;
        continue;
      }

      if (dTotal > 21) {
        totalWin += bet * 2;
        didWin = true;
        continue;
      }

      if (pTotal > dTotal) {
        totalWin += bet * 2;
        didWin = true;
      } else if (pTotal === dTotal) {
        totalWin += bet; // push
      }
    }

    if (totalWin > 0) tx.update(uRef, { balance: admin.firestore.FieldValue.increment(totalWin) });

    tx.update(sRef, {
      gameState: 'finished',
      dealerHidden: false,
      lastResult: { totalWin, didWin, dealerTotal: dTotal, ts: nowMs() },
      message: totalWin > 0 ? `KAZANCINIZ: ${totalWin}` : 'KAYBETTİNİZ!',
      updatedAtMs: nowMs(),
      seq: safeNum(s.seq, 0) + 1,
    });
  });

  // finished state 8 sn sonra sil
  setTimeout(async () => {
    try {
      const snap = await colBJ().doc(uid).get();
      if (!snap.exists) return;
      const s = snap.data() || {};
      if (s.gameState === 'finished') await colBJ().doc(uid).delete();
    } catch {}
  }, 8000);
}

app.listen(PORT, () => console.log(`🚀 PlayMatrix Backend Started. Port: ${PORT}`));
