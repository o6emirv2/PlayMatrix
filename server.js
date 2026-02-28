'use strict';

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

process.on('uncaughtException', (err) => console.error('Kritik Hata:', err));
process.on('unhandledRejection', (reason) => console.error('Promise Hatası:', reason));

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// ======================================================
// FIREBASE BAŞLATMA & FAIL-FAST MANTIĞI
// ======================================================
(function initFirebase() {
  if (admin.apps.length) return;
  
  if (!process.env.FIREBASE_KEY) {
      console.error('⚠️ CRITICAL: FIREBASE_KEY bulunamadı. Sunucu durduruluyor.');
      process.exit(1); 
  }
  
  try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('✅ Firebase Admin başarıyla bağlandı.');
  } catch (e) { 
      console.error('⚠️ CRITICAL: FIREBASE_KEY parse edilemedi:', e.message); 
      process.exit(1);
  }
})();

const db = admin.firestore();
const auth = admin.auth();
const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

// ======================================================
// CORS GÜVENLİK VE ALLOWLIST AYARLARI
// ======================================================
app.use(cors({
  origin: function (origin, cb) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
    }
    return cb(new Error('CORS BLOCKED: Yetkisiz Domain Erişimi!'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 900, standardHeaders: true, legacyHeaders: false });
const bjActionLimiter = rateLimit({ windowMs: 10 * 1000, max: 25, message: { ok: false, error: 'Spam engellendi.' }});
const bonusLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { ok: false, error: "Limit aşıldı." }});
const profileLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { ok: false, error: "Çok fazla profil işlemi yaptınız, 1 dakika bekleyin." }});
app.use(generalLimiter);

app.get('/', (req, res) => res.status(200).send('✅ PlayMatrix API is running'));

const verifyAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok: false, redirect: true, error: 'Oturum yok.' });
  try { req.user = await auth.verifyIdToken(h.split(' ')[1]); return next(); } 
  catch { return res.status(401).json({ ok: false, redirect: true, error: 'Geçersiz token.' }); }
};

const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cleanStr = (v) => (typeof v === 'string' ? v.trim().replace(/[<>]/g, "") : '');

const isDisposableEmail = (email) => {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  const blocked = new Set([
    'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org',
    '10minutemail.com','10minutemail.net','10minemail.com',
    'tempmail.com','temp-mail.org','temp-mail.io','temp-mail.com',
    'yopmail.com','yopmail.fr','yopmail.net',
    'trashmail.com','getnada.com','dispostable.com','minuteinbox.com'
  ]);
  if (blocked.has(domain)) return true;
  if (domain.endsWith('.mailinator.com')) return true;
  if (domain.endsWith('.yopmail.com')) return true;
  return false;
};

const nowMs = () => Date.now();
const colUsers = () => db.collection('users');
const colPromos = () => db.collection('promo_codes');

async function findPromoDocIdByNormalized(codeUpper, maxScan = 500) {
  // Admin tarafında yanlışlıkla sonuna boşluk konmuş docId gibi durumları tolere etmek için:
  // docId'leri sınırlı sayıda tarayıp trim+upper eşleşmesi yapar.
  const refs = await colPromos().listDocuments();
  let c = 0;
  for (const ref of refs) {
    c++;
    if (c > maxScan) break;
    if (String(ref.id || '').trim().toUpperCase() === codeUpper) return ref.id;
  }
  return null;
}

const colBJ = () => db.collection('bj_sessions');
const ALLOWED_AVATAR_DOMAIN = "https://encrypted-tbn0.gstatic.com/";

// ======================================================
// 1. PROFİL & GENEL SİSTEMLER
// ======================================================

app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    let uData = await db.runTransaction(async (tx) => {
      const snap = await tx.get(colUsers().doc(req.user.uid));
      let u = snap.exists ? snap.data() : { balance: 0, email: req.user.email, createdAt: nowMs(), userChangeCount: 0 };
      let updates = {};
      let isUpdated = false;

      if (!snap.exists) { isUpdated = true; }

      if (req.user.email_verified && !u.emailRewardClaimed && !isDisposableEmail(req.user.email)) {
          if (snap.exists) {
              updates.balance = admin.firestore.FieldValue.increment(50000);
          } else {
              updates.balance = 50000;
          }
          updates.emailRewardClaimed = true;
          u.balance = safeNum(u.balance, 0) + 50000;
          u.emailRewardClaimed = true;
          isUpdated = true;
      }

      // Basit anti-suistimal: temp-mail domainlerinde e-posta ödülü verilmez (isteğe göre genişletilebilir)
      if (req.user.email_verified && !u.emailRewardClaimed && isDisposableEmail(req.user.email)) {
          updates.emailRewardBlocked = true;
          u.emailRewardBlocked = true;
          isUpdated = true;
      }

      if (isUpdated) {
          tx.set(colUsers().doc(req.user.uid), snap.exists ? updates : { ...u, ...updates }, { merge: true });


app.get('/api/check-username', async (req, res) => {
  try {
    const raw = cleanStr(req.query?.username);
    const username = raw.trim().replace(/\s+/g, ' ');
    if (!username) return res.status(400).json({ ok: false, error: 'Kullanıcı adı boş.' });

    // 3-20 karakter: harf/sayı/._- (Unicode harfleri destekler)
    if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username)) {
      return res.status(400).json({ ok: false, error: 'Kullanıcı adı geçersiz. (3-20 karakter, harf/sayı/._-)' });
    }

    const key = username.toLowerCase();
    const snap = await db.collection('usernames').doc(key).get();
    return res.json({ ok: true, available: !snap.exists });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Kontrol hatası.' });
  }
});


      }
      return u;
    });
    
    res.json({ ok: true, balance: safeNum(uData.balance, 0), user: uData });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/profile/update', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const { fullName, phone, username, avatar } = req.body || {};
    const uid = req.user.uid;
    let phoneRewarded = false;

    // Split-Brain önlemi: kullanıcı dökümanı *her koşulda* oluşsun.
    await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(uid);
      const snap = await tx.get(uRef);
      if (!snap.exists) {
        tx.set(uRef, { balance: 0, email: req.user.email, createdAt: nowMs(), userChangeCount: 0 }, { merge: true });
      }
    });

    await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(uid);
      const snap = await tx.get(uRef);
      const u = snap.exists ? (snap.data() || {}) : { balance: 0, email: req.user.email, createdAt: nowMs(), userChangeCount: 0 };

      const updates = {};
      if (cleanStr(fullName) && !cleanStr(u.fullName)) updates.fullName = cleanStr(fullName);

      if (cleanStr(phone) && !cleanStr(u.phone)) {
        updates.phone = cleanStr(phone);
        if (!u.phoneRewardClaimed) {
          updates.balance = admin.firestore.FieldValue.increment(100000);
          updates.phoneRewardClaimed = true;
          phoneRewarded = true;
        }
      }

      if (typeof avatar === 'string' && avatar.startsWith(ALLOWED_AVATAR_DOMAIN) && avatar.length < 250) updates.avatar = avatar;

      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        if (safeNum(u.userChangeCount, 0) >= 3) throw new Error("İsim hakkı doldu!");

        const wantedLower = wanted.toLowerCase();
        const usernameRef = db.collection('usernames').doc(wantedLower);
        const uDoc = await tx.get(usernameRef);

        if (uDoc.exists && uDoc.data().uid !== uid) throw new Error("Bu isim kullanımda!");

        if (cleanStr(u.username)) {
          const oldLower = cleanStr(u.username).toLowerCase();
          if (oldLower !== wantedLower) tx.delete(db.collection('usernames').doc(oldLower));
        }

        tx.set(usernameRef, { uid: uid, createdAt: nowMs() }, { merge: true });
        updates.username = wanted;
        updates.userChangeCount = safeNum(u.userChangeCount, 0) + 1;
      }

      tx.set(uRef, { ...u, ...updates }, { merge: true });
    });

    res.json({ ok: true, phoneRewarded });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});


app.post('/api/wheel/spin', verifyAuth, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Çark çevirmek için e-postanızı onaylamalısınız! (Onayladıktan sonra çıkış yapıp tekrar girin)");

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(colUsers().doc(req.user.uid));
      if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {};
      if ((nowMs() - safeNum(u.lastSpin, 0)) < 86400000) throw new Error("Henüz süre dolmadı.");
      const rewards = [2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000];
      const rnd = crypto.randomInt(0, rewards.length);
      tx.update(colUsers().doc(req.user.uid), { balance: admin.firestore.FieldValue.increment(rewards[rnd]), lastSpin: nowMs() });
      return { index: rnd, prize: rewards[rnd] };
    });
    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/bonus/claim', verifyAuth, bonusLimiter, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Promosyon kodu kullanmak için e-postanızı onaylamalısınız!");

    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!code) throw new Error("Kod boş.");

    // Admin panelinde yanlışlıkla "KOD " (sonunda boşluk) gibi kaydedilen promo docId durumunu tolere et
    let promoDocId = code;
    const directSnap = await colPromos().doc(promoDocId).get();
    if (!directSnap.exists) {
      const alt = await findPromoDocIdByNormalized(code);
      if (alt) promoDocId = alt;
    }

    const out = await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(req.user.uid);
      const pRef = colPromos().doc(promoDocId);

      const [uSnap, pSnap] = await Promise.all([tx.get(uRef), tx.get(pRef)]);
      if (!uSnap.exists || !pSnap.exists) throw new Error("Geçersiz işlem.");

      const u = uSnap.data() || {}, p = pSnap.data() || {};
      if (safeNum(p.amount, 0) <= 0) throw new Error("Kod geçersiz veya kullanılmış.");

      // Kullanıcı tarafında aynı kodun farklı yazımı (boşluk vs) olmasın diye normalize edilmiş kodu sakla
      if ((u.usedPromos || []).includes(code)) throw new Error("Kod geçersiz veya kullanılmış.");
      if (safeNum(p.limitLeft, -1) === 0) throw new Error("Kod tükenmiş.");

      tx.update(uRef, { balance: admin.firestore.FieldValue.increment(p.amount), usedPromos: admin.firestore.FieldValue.arrayUnion(code) });
      if (safeNum(p.limitLeft, -1) > 0) tx.update(pRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });

      return { amount: p.amount };
    });

    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});


// ======================================================
// 2. BLACKJACK MOTORU
// ======================================================

function createDeck(shoeCount = 8) {
  const d = [];
  for(let i=0;i<shoeCount;i++) for(const s of ['H','D','C','S']) for(const v of [1,2,3,4,5,6,7,8,9,10,11,12,13]) d.push({suit:s,value:v});
  for(let i=d.length-1;i>0;i--){ const j=crypto.randomInt(0,i+1); [d[i],d[j]]=[d[j],d[i]]; } return d;
}

function scoreHand(cards){ 
  let t=0,a=0; 
  for(const c of (cards||[])){ const p=(c.value===1)?11:(c.value>=11?10:c.value); if(p===11)a++; t+=p; } 
  while(t>21&&a>0){t-=10;a--;} 
  return {total:t, softAces:a}; 
}
function isBJ(cards){ return Array.isArray(cards)&&cards.length===2&&scoreHand(cards).total===21; }

function publicState(session){
  if(!session) return null;
  const dealerHidden = !!session.dealerHidden;
  return {
    gameState: session.gameState,
    dealerHidden,
    dealer: dealerHidden ? [session.dealer[0] || null, null] : session.dealer,
    hands: (session.hands || []).map(h=>({cards:h.cards||[], bet:safeNum(h.bet,0), status:h.status||'playing'})),
    currentHandIdx: safeNum(session.currentHandIdx,0),
    insuranceOffered: !!session.insuranceOffered,
    message: session.message || '',
    seq: safeNum(session.seq,0)
  };
}

app.get('/api/bj/state', verifyAuth, async (req, res) => {
  try {
    const snap = await colBJ().doc(req.user.uid).get();
    res.json({ ok: true, state: snap.exists ? publicState(snap.data()) : null });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/bj/start', verifyAuth, async (req, res) => {
  try {
    const bet = safeNum(req.body?.bet, 0);
    if (bet < 10) throw new Error('Min bahis 10 MC.');
    const uid = req.user.uid;

    const session = await db.runTransaction(async (tx) => {
      const existing = await tx.get(colBJ().doc(uid));
      if (existing.exists && ['playing', 'resolving'].includes(existing.data().gameState)) {
          // Re-connect desteği: Aktif el varsa hata vermek yerine mevcut state'i döndür.
          if (nowMs() - safeNum(existing.data().lastActionAtMs, 0) > 300000) {
              tx.delete(colBJ().doc(uid));
          } else {
              return { ...existing.data(), _resumed: true };
          }
      }
      const uSnap = await tx.get(colUsers().doc(uid));
      if (!uSnap.exists) throw new Error('Kayıt yok.');
      if (safeNum(uSnap.data()?.balance, 0) < bet) throw new Error('Bakiye yetersiz.');
      
      tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-bet) });
      const deck = createDeck(8);
      const newSession = { uid, gameState: 'playing', dealer: [deck.pop(), deck.pop()], dealerHidden: true, hands: [{ cards: [deck.pop(), deck.pop()], bet, status: 'playing', done: false }], currentHandIdx: 0, _deck: deck, seq: 1, lastActionAtMs: nowMs() };
      newSession.insuranceOffered = newSession.dealer[0].value === 1;
      
      if (!newSession.insuranceOffered && (isBJ(newSession.hands[0].cards) || isBJ(newSession.dealer))) { 
          newSession.dealerHidden = false; newSession.gameState = 'resolving'; 
      }
      tx.set(colBJ().doc(uid), newSession); return newSession;
    });

    if (session.gameState === 'resolving') await resolveAndPayout(uid);
    const finalSnap = await colBJ().doc(uid).get();
    res.json({ ok: true, state: publicState(finalSnap.data()) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/bj/action', verifyAuth, bjActionLimiter, async (req, res) => {
  try {
    const uid = req.user.uid, action = (req.body?.action || ''), clientSeq = safeNum(req.body?.seq, 0);
    
    const updated = await db.runTransaction(async (tx) => {
      const sSnap = await tx.get(colBJ().doc(uid));
      if (!sSnap.exists) throw new Error('Oyun yok.');
      const s = sSnap.data() || {};
      if (s.gameState !== 'playing' || clientSeq !== safeNum(s.seq, 0)) throw new Error('Senkronizasyon hatası.');

      const uSnap = await tx.get(colUsers().doc(uid));
      const userBal = safeNum(uSnap.data()?.balance, 0);

      if (s._deck.length < 20) s._deck = [...s._deck, ...createDeck(8)];

      if (s.insuranceOffered) {
        if (action === 'insurance_yes') {
          const insCost = Math.floor(safeNum(s.hands[0].bet, 0) / 2);
          if (userBal < insCost) throw new Error('Sigorta için bakiye yetersiz.'); 
          tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-insCost) }); s.insuranceBet = insCost;
        }
        s.insuranceOffered = false;
        if (isBJ(s.hands[0].cards) || isBJ(s.dealer)) { s.dealerHidden = false; s.gameState = 'resolving'; }
      } else {
        const h = s.hands[s.currentHandIdx];
        if (action === 'hit') { 
            h.cards.push(s._deck.pop()); 
            if (scoreHand(h.cards).total >= 21) h.done = true; 
        } 
        else if (action === 'stand') { h.done = true; } 
        else if (action === 'double') {
          if (h.cards.length !== 2) throw new Error('Sadece ilk 2 kartta geçerlidir.');
          if (userBal < h.bet) throw new Error('Double için bakiye yetersiz.'); 
          tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-h.bet) });
          h.bet *= 2; h.cards.push(s._deck.pop()); h.done = true;
        } else if (action === 'split') {
          if (s.hands.length !== 1 || h.cards[0].value !== h.cards[1].value) throw new Error('Geçersiz Split.');
          if (userBal < h.bet) throw new Error('Split için bakiye yetersiz.'); 
          tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-h.bet) });
          
          const isAceSplit = (h.cards[0].value === 1);
          s.hands.push({ cards: [h.cards.pop(), s._deck.pop()], bet: h.bet, status: 'playing', done: isAceSplit });
          h.cards.push(s._deck.pop());
          if (isAceSplit) h.done = true;
        }
        
        const nextIdx = s.hands.findIndex(x => !x.done);
        if (nextIdx >= 0) s.currentHandIdx = nextIdx;
        else {
          s.dealerHidden = false;
          let dScore = scoreHand(s.dealer);
          while (dScore.total < 17 || (dScore.total === 17 && dScore.softAces > 0)) {
              s.dealer.push(s._deck.pop());
              dScore = scoreHand(s.dealer);
          }
          s.gameState = 'resolving';
        }
      }
      s.seq = safeNum(s.seq, 0) + 1; s.lastActionAtMs = nowMs();
      tx.set(colBJ().doc(uid), s, { merge: true }); return s;
    });

    if (updated.gameState === 'resolving') await resolveAndPayout(uid);
    const finalSnap = await colBJ().doc(uid).get();
    res.json({ ok: true, state: publicState(finalSnap.data()) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

async function resolveAndPayout(uid) {
  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(colBJ().doc(uid)); if (!sSnap.exists) return;
    const s = sSnap.data(); if (s.gameState !== 'resolving') return;
    const dTotal = scoreHand(s.dealer).total, dBJ = isBJ(s.dealer); let totalWin = 0;
    
    if (safeNum(s.insuranceBet, 0) > 0 && dBJ) totalWin += s.insuranceBet * 3;
    
    for (const h of s.hands) {
      const pTotal = scoreHand(h.cards).total, pBJ = isBJ(h.cards) && s.hands.length === 1;
      if (pTotal > 21 || (dBJ && !pBJ)) continue;
      if (pBJ && !dBJ) totalWin += Math.floor(h.bet * 2.5);
      else if (dTotal > 21 || pTotal > dTotal) totalWin += h.bet * 2;
      else if (pTotal === dTotal) totalWin += h.bet;
    }
    
    if (totalWin > 0) tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(totalWin) });
    tx.update(colBJ().doc(uid), { gameState: 'finished', dealerHidden: false, seq: safeNum(s.seq, 0) + 1, message: totalWin > 0 ? `KAZANDINIZ: ${totalWin} MC` : 'KAYBETTİNİZ!', lastActionAtMs: nowMs() });
  });
  setTimeout(() => colBJ().doc(uid).delete().catch(()=>null), 5000); 
}

// ======================================================
// 3. CRASH MOTORU
// ======================================================

function generateRoundProvablyFair() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const h = parseInt(hash.slice(0, 13), 16);
    const e = Math.pow(2, 52);
    if (h % 100 === 0) return { serverSeed, hash, crashPoint: 1.00 };
    const cp = Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);
    return { serverSeed, hash, crashPoint: Number(cp.toFixed(2)) };
}

const crashState = { phase: 'COUNTDOWN', startTime: nowMs() + 6000, crashPoint: 1.00, serverSeed: '', hash: '', endTime: 0, history: [], players: {}, roundId: 0 };

async function initCrashDb() {
    try {
        const snap = await db.collection('server_data').doc('crash_global').get();
        if(snap.exists) {
            const d = snap.data();
            crashState.phase = d.phase || 'COUNTDOWN'; crashState.startTime = d.startTime || (nowMs() + 6000);
            crashState.crashPoint = d.crashPoint || 1.00; crashState.serverSeed = d.serverSeed || '';
            crashState.hash = d.hash || ''; crashState.roundId = d.roundId || Date.now(); crashState.history = d.history || [];
        } else {
            crashState.roundId = Date.now();
            const pf = generateRoundProvablyFair();
            crashState.crashPoint = pf.crashPoint; crashState.serverSeed = pf.serverSeed; crashState.hash = pf.hash;
            await syncCrashDb();
        }
        const activeBets = await db.collection('crash_bets').where('roundId', '==', crashState.roundId).get();
        activeBets.forEach(doc => {
            const b = doc.data();
            if (!crashState.players[b.uid]) crashState.players[b.uid] = {};
            crashState.players[b.uid][`box${b.box}`] = { bet: b.amount, cashed: b.cashed, win: b.win, inProgress: false };
        });
    } catch(e) {}
}
initCrashDb();

async function syncCrashDb() {
    try {
        await db.collection('server_data').doc('crash_global').set({
            phase: crashState.phase, startTime: crashState.startTime, crashPoint: crashState.crashPoint,
            serverSeed: crashState.serverSeed, hash: crashState.hash, roundId: crashState.roundId, history: crashState.history
        }, { merge: true });
    } catch(e) {}
}

setInterval(() => {
    const now = nowMs();
    if (crashState.phase === 'COUNTDOWN') {
        if (now >= crashState.startTime) { crashState.phase = 'FLYING'; crashState.startTime = now; syncCrashDb(); }
    } else if (crashState.phase === 'FLYING') {
        const elapsed = (now - crashState.startTime) / 1000;
        const currentMult = 1 + Math.pow(elapsed * 0.18, 1.35);
        if (currentMult >= crashState.crashPoint) {
            crashState.phase = 'CRASHED'; crashState.endTime = now;
            crashState.history.unshift(Number(crashState.crashPoint.toFixed(2)));
            if (crashState.history.length > 15) crashState.history.pop();
            syncCrashDb(); 
        }
    } else if (crashState.phase === 'CRASHED') {
        if (now >= crashState.endTime + 4000) {
            crashState.phase = 'COUNTDOWN'; crashState.startTime = now + 6000;
            const pf = generateRoundProvablyFair();
            crashState.crashPoint = pf.crashPoint; crashState.serverSeed = pf.serverSeed; crashState.hash = pf.hash;
            crashState.roundId = nowMs(); crashState.players = {}; 
            syncCrashDb(); 
        }
    }
}, 100);

app.get('/api/crash/state', verifyAuth, (req, res) => {
    const uid = req.user.uid;
    res.json({ ok: true, state: { phase: crashState.phase, startTime: crashState.startTime, serverNow: nowMs(), history: crashState.history, hash: crashState.hash, seed: crashState.phase === 'CRASHED' ? crashState.serverSeed : null, crashPoint: crashState.phase === 'CRASHED' ? crashState.crashPoint : null, myBets: crashState.players[uid] || {} }});
});

app.post('/api/crash/bet', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const box = safeNum(req.body.box, 0); const amount = safeNum(req.body.amount, 0);
        if (box !== 1 && box !== 2) throw new Error('Geçersiz kutu.');
        if (amount < 10) throw new Error('Min bahis 10 MC.');
        const currentRoundId = crashState.roundId; const betId = `${currentRoundId}_${uid}_${box}`;

        await db.runTransaction(async (tx) => {
            const gSnap = await tx.get(db.collection('server_data').doc('crash_global'));
            if (!gSnap.exists || gSnap.data().phase !== 'COUNTDOWN') throw new Error('Bahisler kapandı.');
            if (gSnap.data().roundId !== currentRoundId) throw new Error('Tur değişti, tekrar deneyin.');
            const betSnap = await tx.get(db.collection('crash_bets').doc(betId));
            if (betSnap.exists) throw new Error('Bu kutuya zaten bahis yapıldı.');
            const uSnap = await tx.get(colUsers().doc(uid));
            if (!uSnap.exists || safeNum(uSnap.data().balance, 0) < amount) throw new Error('Bakiye yetersiz.');
            tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-amount) });
            tx.set(db.collection('crash_bets').doc(betId), { uid, box, amount, cashed: false, win: 0, roundId: currentRoundId });
        });
        if (!crashState.players[uid]) crashState.players[uid] = {};
        crashState.players[uid][`box${box}`] = { bet: amount, cashed: false, win: 0, inProgress: false };
        res.json({ ok: true, myBets: crashState.players[uid] });
    } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/crash/cashout', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const box = safeNum(req.body.box, 0); const reqTime = nowMs();
        const currentRoundId = crashState.roundId; const betId = `${currentRoundId}_${uid}_${box}`;

        if (crashState.phase !== 'FLYING') throw new Error(crashState.phase === 'CRASHED' ? 'Çok geç, patladı!' : 'Şu an bozdurulamaz.');
        const elapsed = (reqTime - crashState.startTime) / 1000;
        let currentMult = 1 + Math.pow(elapsed * 0.18, 1.35);
        if (currentMult >= crashState.crashPoint) throw new Error('Çok geç, patladı!');

        const winAmount = await db.runTransaction(async (tx) => {
            const betRef = db.collection('crash_bets').doc(betId);
            const betSnap = await tx.get(betRef);
            if (!betSnap.exists) throw new Error('Aktif bahis yok.');
            if (betSnap.data().cashed) throw new Error('Zaten çekildi.');
            const finalWin = Math.floor(betSnap.data().amount * currentMult);
            tx.update(betRef, { cashed: true, win: finalWin, cashoutMult: currentMult });
            tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(finalWin) });
            return finalWin;
        });

        if (crashState.players[uid] && crashState.players[uid][`box${box}`]) {
            crashState.players[uid][`box${box}`].cashed = true;
            crashState.players[uid][`box${box}`].win = winAmount;
        }
        res.json({ ok: true, myBets: crashState.players[uid], winAmount });
    } catch (e) { res.json({ ok: false, error: e.message }); }
});


// ======================================================
// 4. MINES MOTORU
// ======================================================

const colMines = () => db.collection('mines_sessions');

function calculateMinesMult(mines, opened) {
    if(opened === 0) return 1.00; if(25 - mines - opened < 0) return 0;
    let prob = 1; for(let i=0; i<opened; i++) prob *= (25 - mines - i) / (25 - i);
    return Math.floor((1 / prob) * 0.97 * 100) / 100;
}

function createMinesBoard(minesCount) {
    let board = Array(25).fill(0); let placed = 0;
    while(placed < minesCount) { let r = crypto.randomInt(0, 25); if(board[r] === 0) { board[r] = 1; placed++; } }
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(serverSeed + ":" + board.join(',')).digest('hex');
    return { board, serverSeed, hash };
}

app.get('/api/mines/state', verifyAuth, async (req, res) => {
    try {
        const snap = await colMines().doc(req.user.uid).get();
        if (!snap.exists) return res.json({ ok: true, state: null });
        const data = snap.data();
        res.json({ ok: true, state: { status: data.status, bet: data.bet, minesCount: data.minesCount, opened: data.opened, multiplier: data.multiplier, hash: data.hash, serverSeed: (data.status === 'busted' || data.status === 'cashed_out') ? data.serverSeed : undefined }});
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/mines/start', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const bet = safeNum(req.body.bet, 0); const minesCount = safeNum(req.body.minesCount, 3);
        if(bet < 10 || bet > 100000) throw new Error('Geçersiz bahis miktarı. Min: 10 MC');
        if(minesCount < 1 || minesCount > 24) throw new Error('Geçersiz mayın sayısı.');
        const session = await db.runTransaction(async (tx) => {
            const existing = await tx.get(colMines().doc(uid));
            if (existing.exists && existing.data().status === 'playing') {
                if (nowMs() - safeNum(existing.data().updatedAt, 0) > 300000) tx.delete(colMines().doc(uid)); 
                else throw new Error('Zaten devam eden bir oyununuz var.');
            }
            const uSnap = await tx.get(colUsers().doc(uid));
            if(safeNum(uSnap.data()?.balance, 0) < bet) throw new Error('Bakiye yetersiz.');
            tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-bet) });
            const boardData = createMinesBoard(minesCount);
            const newSession = { uid, status: 'playing', bet, minesCount, board: boardData.board, serverSeed: boardData.serverSeed, hash: boardData.hash, opened: [], multiplier: 1.00, updatedAt: nowMs() };
            tx.set(colMines().doc(uid), newSession); return newSession;
        });
        res.json({ ok: true, state: { status: session.status, bet: session.bet, minesCount: session.minesCount, opened: session.opened, multiplier: session.multiplier, hash: session.hash } });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/mines/action', verifyAuth, bjActionLimiter, async (req, res) => {
    try {
        const uid = req.user.uid; const action = req.body.action;
        const result = await db.runTransaction(async (tx) => {
            const sSnap = await tx.get(colMines().doc(uid));
            if (!sSnap.exists || sSnap.data().status !== 'playing') throw new Error('Aktif bir oyun bulunamadı.');
            const s = sSnap.data();
            if (action === 'cashout') {
                if (s.opened.length === 0) throw new Error('Henüz taş açmadınız.');
                const winAmount = Math.floor(s.bet * s.multiplier);
                tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(winAmount) });
                s.status = 'cashed_out'; s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash, serverSeed: s.serverSeed }, winAmount, board: s.board };
            } 
            else if (action === 'click') {
                const index = safeNum(req.body.index, -1);
                if (index < 0 || index > 24) throw new Error('Geçersiz kutu.');
                if (s.opened.includes(index)) throw new Error('Bu taş zaten açık.');
                if (s.board[index] === 1) {
                    s.status = 'busted'; s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                    return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash, serverSeed: s.serverSeed }, board: s.board };
                } else {
                    s.opened.push(index); s.multiplier = calculateMinesMult(s.minesCount, s.opened.length);
                    if (s.opened.length === (25 - s.minesCount)) {
                        const winAmount = Math.floor(s.bet * s.multiplier);
                        tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(winAmount) });
                        s.status = 'cashed_out'; s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                        return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash, serverSeed: s.serverSeed }, winAmount, board: s.board };
                    }
                    s.updatedAt = nowMs(); tx.set(colMines().doc(uid), s);
                    return { state: { status: s.status, bet: s.bet, minesCount: s.minesCount, opened: s.opened, multiplier: s.multiplier, hash: s.hash } };
                }
            } else { throw new Error('Geçersiz işlem.'); }
        });
        if (result.state.status === 'busted' || result.state.status === 'cashed_out') { setTimeout(() => colMines().doc(uid).delete().catch(()=>null), 5000); }
        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ======================================================
// 5. PİŞTİ MOTORU 
// ======================================================

const colPisti = () => db.collection('pisti_sessions');

function createPistiDeck() {
    const suits = ["H", "D", "C", "S"]; 
    const vals = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "0", "J", "Q", "K"]; 
    let deck = [];
    suits.forEach(s => vals.forEach(v => deck.push(v + s)));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function calculateCardPoints(cards) {
    let pts = 0;
    for (let c of cards) {
        if (c === '0D') pts += 3; 
        else if (c === '2C') pts += 2; 
        else if (c[0] === 'A') pts += 1; 
        else if (c[0] === 'J') pts += 1; 
    }
    return pts;
}

function checkPistiCapture(tableCards, playedCard) {
    if (tableCards.length === 0) return { captured: false, isPisti: false, points: 0, collected: [] };
    
    const topCard = tableCards[tableCards.length - 1];
    const isJack = playedCard[0] === 'J';
    const isMatch = playedCard[0] === topCard[0];

    if (isJack || isMatch) {
        const collected = [...tableCards, playedCard];
        const isPisti = (tableCards.length === 1 && isMatch); 
        let pistiPoints = 0;
        
        if (isPisti) {
            pistiPoints = isJack ? 20 : 10; 
        }
        
        const cardPoints = calculateCardPoints(collected);
        return { captured: true, isPisti: isPisti, points: pistiPoints + cardPoints, collected: collected };
    }
    return { captured: false, isPisti: false, points: 0, collected: [] };
}

// Bakiye sorununu çözen ana State API'si
app.get('/api/pisti/state', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const [snap, uSnap] = await Promise.all([
            colPisti().doc(uid).get(),
            colUsers().doc(uid).get()
        ]);
        
        const balance = uSnap.exists ? safeNum(uSnap.data()?.balance, 0) : 0;
        
        if (!snap.exists) return res.json({ ok: true, state: null, balance });
        
        const data = snap.data();
        res.json({ ok: true, state: {
            status: data.status, bet: data.bet, playerHand: data.playerHand,
            botCardCount: data.botHand.length, tableCards: data.tableCards,
            playerScore: data.playerScore, botScore: data.botScore, round: data.round
        }, balance });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/pisti/start', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const bet = safeNum(req.body.bet, 0);
        
        if (bet < 100 || bet > 50000) throw new Error('Geçersiz bahis. Min: 100 MC, Max: 50.000 MC');

        const { session, balanceAfter } = await db.runTransaction(async (tx) => {
            const existing = await tx.get(colPisti().doc(uid));
            if (existing.exists && existing.data().status === 'playing') throw new Error('Devam eden oyununuz var.');
            
            const uSnap = await tx.get(colUsers().doc(uid));
            const userBal = safeNum(uSnap.data()?.balance, 0);
            if (userBal < bet) throw new Error('Bakiye yetersiz.');

            tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-bet) });
            const balanceAfter = userBal - bet;

            const deck = createPistiDeck();
            
            const tableCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
            const playerHand = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
            const botHand = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
            
            const newSession = {
                uid, status: 'playing', bet, deck, tableCards, playerHand, botHand,
                playerScore: 0, botScore: 0, playerCardCount: 0, botCardCount: 0,
                lastCapturer: null, round: 1, updatedAt: nowMs()
            };

            tx.set(colPisti().doc(uid), newSession);
            return { session: newSession, balanceAfter };
        });

        res.json({ ok: true, state: {
            status: session.status, bet: session.bet, playerHand: session.playerHand,
            botCardCount: session.botHand.length, tableCards: session.tableCards,
            playerScore: session.playerScore, botScore: session.botScore, round: session.round
        }, balance: balanceAfter });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/pisti/play', verifyAuth, bjActionLimiter, async (req, res) => {
    try {
        const uid = req.user.uid;
        const cardIndex = safeNum(req.body.cardIndex, -1);

        const result = await db.runTransaction(async (tx) => {
            const [sSnap, uSnap] = await Promise.all([
                tx.get(colPisti().doc(uid)),
                tx.get(colUsers().doc(uid))
            ]);
            if (!sSnap.exists || sSnap.data().status !== 'playing') throw new Error('Aktif oyun yok.');
            
            const s = sSnap.data();
            let balanceAfter = uSnap.exists ? safeNum(uSnap.data()?.balance, 0) : 0;

            if (cardIndex < 0 || cardIndex >= s.playerHand.length) throw new Error('Geçersiz kart.');

            let actionLog = { playerAction: null, botAction: null, roundOver: false, gameOver: false, winAmount: 0 };

            const playedCard = s.playerHand.splice(cardIndex, 1)[0];
            const pCapture = checkPistiCapture(s.tableCards, playedCard);
            actionLog.playerAction = { card: playedCard, isPisti: pCapture.isPisti, captured: pCapture.captured };

            if (pCapture.captured) {
                s.playerScore += pCapture.points;
                s.playerCardCount += pCapture.collected.length;
                s.lastCapturer = 'player';
                s.tableCards = []; 
            } else {
                s.tableCards.push(playedCard);
            }

            // BOT ZEKA DÜZELTMESİ (Tahmin edilebilirliği yok edildi, Rastgele zeka eklendi)
            if (s.botHand.length > 0) {
                let botCardIdx = -1;
                if (s.tableCards.length > 0) {
                    const topCard = s.tableCards[s.tableCards.length - 1];
                    botCardIdx = s.botHand.findIndex(c => c[0] === topCard[0]); 
                    
                    if (botCardIdx === -1 && s.tableCards.length >= 2) { 
                        botCardIdx = s.botHand.findIndex(c => c[0] === 'J'); 
                    }
                }
                
                if (botCardIdx === -1) {
                    let nonJackIndices = [];
                    for(let i=0; i<s.botHand.length; i++) { if(s.botHand[i][0] !== 'J') nonJackIndices.push(i); }
                    if(nonJackIndices.length > 0) {
                        botCardIdx = nonJackIndices[crypto.randomInt(0, nonJackIndices.length)];
                    } else {
                        botCardIdx = 0; 
                    }
                }

                const botCard = s.botHand.splice(botCardIdx, 1)[0];
                const bCapture = checkPistiCapture(s.tableCards, botCard);
                actionLog.botAction = { card: botCard, isPisti: bCapture.isPisti, captured: bCapture.captured };

                if (bCapture.captured) {
                    s.botScore += bCapture.points;
                    s.botCardCount += bCapture.collected.length;
                    s.lastCapturer = 'bot';
                    s.tableCards = [];
                } else {
                    s.tableCards.push(botCard);
                }
            }

            if (s.playerHand.length === 0 && s.botHand.length === 0) {
                if (s.deck.length >= 8) {
                    s.playerHand = [s.deck.pop(), s.deck.pop(), s.deck.pop(), s.deck.pop()];
                    s.botHand = [s.deck.pop(), s.deck.pop(), s.deck.pop(), s.deck.pop()];
                    s.round += 1;
                    actionLog.roundOver = true;
                } else {
                    s.status = 'finished';
                    actionLog.gameOver = true;
                    
                    if (s.tableCards.length > 0 && s.lastCapturer) {
                        const finalPts = calculateCardPoints(s.tableCards);
                        if(s.lastCapturer === 'player') { s.playerCardCount += s.tableCards.length; s.playerScore += finalPts; }
                        else { s.botCardCount += s.tableCards.length; s.botScore += finalPts; }
                    }

                    if (s.playerCardCount > s.botCardCount) s.playerScore += 3;
                    else if (s.botCardCount > s.playerCardCount) s.botScore += 3;

                    if (s.playerScore > s.botScore) {
                        actionLog.winAmount = s.bet * 2;
                        tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(actionLog.winAmount) });
                        balanceAfter += actionLog.winAmount;
                    } else if (s.playerScore === s.botScore) {
                        actionLog.winAmount = s.bet; 
                        tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(actionLog.winAmount) });
                        balanceAfter += actionLog.winAmount;
                    }
                }
            }

            s.updatedAt = nowMs();
            tx.set(colPisti().doc(uid), s);

            return {
                state: {
                    status: s.status, bet: s.bet, playerHand: s.playerHand,
                    botCardCount: s.botHand.length, tableCards: s.tableCards,
                    playerScore: s.playerScore, botScore: s.botScore, round: s.round
                },
                log: actionLog,
                balance: balanceAfter
            };
        });

        // ÇÖP TOPLAMA (VERİTABANI ŞİŞMESİ ENGELLENDİ)
        if (result.state.status === 'finished') {
            setTimeout(() => colPisti().doc(uid).delete().catch(()=>null), 5000);
        }

        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ======================================================
// 7. ONLINE SATRANÇ MOTORU (HATA KÖKTEN ÇÖZÜLDÜ)
// ======================================================

const colChess = () => db.collection('chess_rooms');

app.get('/api/chess/lobby', verifyAuth, async (req, res) => {
    try {
        const snapWait = await colChess().where('status', '==', 'waiting').get();
        const snapPlay = await colChess().where('status', '==', 'playing').get();
        
        let rooms = [];
        snapWait.forEach(doc => {
            let d = doc.data();
            rooms.push({ id: doc.id, hostUid: d.host.uid, host: d.host.username, guest: null, status: d.status, createdAt: d.createdAt });
        });
        snapPlay.forEach(doc => {
            let d = doc.data();
            rooms.push({ id: doc.id, hostUid: d.host.uid, host: d.host.username, guest: d.guest ? d.guest.username : 'Bilinmeyen', status: d.status, createdAt: d.createdAt });
        });

        rooms.sort((a, b) => b.createdAt - a.createdAt);
        res.json({ ok: true, rooms: rooms.slice(0, 20) });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/chess/create', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const roomData = await db.runTransaction(async (tx) => {
            const uSnap = await tx.get(colUsers().doc(uid));
            if (!uSnap.exists) throw new Error("Kullanıcı bulunamadı.");
            const u = uSnap.data();

            const activeRooms = await tx.get(colChess().where('host.uid', '==', uid).where('status', '==', 'waiting'));
            if (!activeRooms.empty) throw new Error("Zaten bekleyen bir odanız var.");

            const newRoomRef = colChess().doc();
            const newRoom = {
                host: { uid: uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, lastPing: nowMs() },
                guest: null,
                status: 'waiting', 
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                turn: 'w', 
                winner: null,
                createdAt: nowMs(),
                updatedAt: nowMs()
            };
            
            tx.set(newRoomRef, newRoom);
            return { id: newRoomRef.id, ...newRoom };
        });
        res.json({ ok: true, room: roomData });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/chess/join', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const roomId = req.body.roomId ? cleanStr(req.body.roomId) : null;

        const roomData = await db.runTransaction(async (tx) => {
            const uSnap = await tx.get(colUsers().doc(uid));
            const u = uSnap.data();

            if (roomId) {
                const rSnap = await tx.get(colChess().doc(roomId));
                if (!rSnap.exists) throw new Error("Oda bulunamadı.");
                let r = rSnap.data();
                if (r.status !== 'waiting') throw new Error("Bu oda artık müsait değil.");
                if (r.host.uid === uid) throw new Error("Kendi odanıza katılamazsınız.");
                
                r.guest = { uid: uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, lastPing: nowMs() };
                r.status = 'playing';
                r.updatedAt = nowMs();
                tx.update(colChess().doc(roomId), r);
                return { id: roomId, ...r };
            } else {
                const snap = await tx.get(colChess().where('status', '==', 'waiting'));
                if (snap.empty) throw new Error("Müsait oda bulunamadı. Lütfen yeni oda kurun.");
                
                let docToJoin = null;
                snap.forEach(doc => { if (doc.data().host.uid !== uid && !docToJoin) docToJoin = doc; });

                if (!docToJoin) throw new Error("Şu an sadece kendi kurduğunuz oda var. Başka bir oyuncunun gelmesini bekleyin.");

                let r = docToJoin.data();
                r.guest = { uid: uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, lastPing: nowMs() };
                r.status = 'playing';
                r.updatedAt = nowMs();
                tx.update(docToJoin.ref, r);
                return { id: docToJoin.id, ...r };
            }
        });
        res.json({ ok: true, room: roomData });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/chess/state/:id', verifyAuth, async (req, res) => {
    try {
        const roomId = cleanStr(req.params.id);
        const snap = await colChess().doc(roomId).get();
        if (!snap.exists) throw new Error("Oda bulunamadı.");
        res.json({ ok: true, room: { id: roomId, ...snap.data() } });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/chess/ping', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const roomId = cleanStr(req.body.roomId);
        if (!roomId) throw new Error("Oda ID yok");

        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(colChess().doc(roomId));
            if (!snap.exists) throw new Error("Oda Yok");
            let r = snap.data();

            if (r.status === 'finished' || r.status === 'abandoned') {
                return { status: r.status, message: "Oyun zaten bitti." };
            }

            const isHost = r.host && r.host.uid === uid;
            const isGuest = r.guest && r.guest.uid === uid;

            if (isHost) r.host.lastPing = nowMs();
            if (isGuest) r.guest.lastPing = nowMs();

            if (r.status === 'playing') {
                const hostDrop = nowMs() - (r.host.lastPing || 0) > 30000;
                const guestDrop = nowMs() - (r.guest.lastPing || 0) > 30000;

                if (hostDrop || guestDrop) {
                    r.status = 'abandoned';
                    r.winner = 'none';
                    r.updatedAt = nowMs();
                    tx.update(colChess().doc(roomId), r);
                    setTimeout(() => colChess().doc(roomId).delete().catch(()=>null), 5000);
                    return { status: 'abandoned', message: "Rakibiniz odadan ayrıldığı için maç iptal edildi." };
                }
            }

            tx.update(colChess().doc(roomId), r);
            return { id: roomId, ...r };
        });

        res.json({ ok: true, room: result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/chess/move', verifyAuth, bjActionLimiter, async (req, res) => {
    try {
        const uid = req.user.uid;
        
        // SUNUCU & İSTEMCİ VERSİYON FARKINI ÇÖZEN NET HAMLE MANTIĞI:
        // moveSan yerine from ve to ile koordinat alınır (Örn: {from: 'e2', to: 'e4'})
        const { roomId, from, to, promotion } = req.body;

        const result = await db.runTransaction(async (tx) => {
            const rSnap = await tx.get(colChess().doc(roomId));
            if (!rSnap.exists) throw new Error("Oda bulunamadı.");
            let r = rSnap.data();

            if (r.status !== 'playing') throw new Error("Oyun aktif değil.");
            
            let isWhite = r.host.uid === uid;
            let isBlack = r.guest.uid === uid;
            
            if (!isWhite && !isBlack) throw new Error("Bu odada oyuncu değilsiniz.");
            if ((r.turn === 'w' && !isWhite) || (r.turn === 'b' && !isBlack)) throw new Error("Sıra sizde değil.");

            const chess = new Chess(r.fen);
            
            // Kökten çözüm: Hamleyi koordinat (from-to) objesi olarak işle. Hata vermez.
            const move = chess.move({ from: from, to: to, promotion: promotion || 'q' });
            
            if (move === null) throw new Error("Geçersiz hamle! Kural hatası.");

            r.fen = chess.fen();
            r.turn = chess.turn(); 
            r.updatedAt = nowMs();
            
            let winAmount = 0;
            let gameOverMessage = null;

            if (chess.in_checkmate()) {
                r.status = 'finished';
                r.winner = isWhite ? 'white' : 'black';
                winAmount = 5000;
                gameOverMessage = "ŞAH MAT!";
                tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(winAmount) });
            } else if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition()) {
                r.status = 'finished';
                r.winner = 'draw';
                gameOverMessage = "BERABERE!";
            }

            tx.update(colChess().doc(roomId), r);
            return { room: { id: roomId, ...r }, moveStr: move.san, winAmount, gameOverMessage };
        });
        
        if (result.room.status === 'finished') {
            setTimeout(() => colChess().doc(roomId).delete().catch(()=>null), 5000);
        }

        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/chess/resign', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const { roomId } = req.body;
        const result = await db.runTransaction(async (tx) => {
            const rSnap = await tx.get(colChess().doc(roomId));
            if (!rSnap.exists) throw new Error("Oda bulunamadı.");
            let r = rSnap.data();

            if (r.status !== 'playing') throw new Error("Oyun aktif değil.");
            let isWhite = r.host.uid === uid; let isBlack = r.guest.uid === uid;
            if (!isWhite && !isBlack) throw new Error("Yetkiniz yok.");

            r.status = 'finished'; r.winner = isWhite ? 'black' : 'white'; r.updatedAt = nowMs();
            
            // HATA ÇÖZÜLDÜ: Teslimiyette karşı tarafa ödül (5000 MC) VERİLMİYOR.
            
            tx.update(colChess().doc(roomId), r);
            return { room: { id: roomId, ...r } };
        });
        
        setTimeout(() => colChess().doc(roomId).delete().catch(()=>null), 5000);
        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

setInterval(async () => {
    try {
        const now = Date.now();
        const oldTime = now - 1800000; 
        const snap = await colChess().where('updatedAt', '<', oldTime).get();
        snap.forEach(doc => { doc.ref.delete().catch(()=>null); });
    } catch(e) { }
}, 30 * 60 * 1000);

app.listen(PORT, () => console.log(`🚀 PlayMatrix Core Backend Started. Port: ${PORT}`));
