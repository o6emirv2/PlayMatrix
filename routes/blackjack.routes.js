// routes/blackjack.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Modüllerimiz
const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { bjActionLimiter } = require('../middlewares/rateLimiters');
const { safeNum, cleanStr, nowMs } = require('../utils/helpers');
const { awardRpFromSpend } = require('../utils/rpSystem');
const { 
  BJ_MAX_SPLITS, 
  BJ_STALE_SESSION_MS, 
  BJ_SIDE_BET_DEFAULTS, 
  BJ_SHOE_COUNT, 
  BJ_CUT_CARD_REMAINING 
} = require('../config/constants');

const colBJ = () => db.collection('bj_sessions');
const colBJShoes = () => db.collection('bj_shoes');
const colUsers = () => db.collection('users');

// ---------------------------------------------------------
// BLACKJACK MATEMATİK VE YARDIMCI FONKSİYONLARI
// ---------------------------------------------------------

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function createDeck(shoeCount = 8, seed = null) {
  const d = [];
  for(let i=0;i<shoeCount;i++) for(const s of ['H','D','C','S']) for(const v of [1,2,3,4,5,6,7,8,9,10,11,12,13]) d.push({suit:s,value:v});

  if (seed) {
    for(let i=d.length-1;i>0;i--){
      const digest = sha256Hex(`${seed}:${i}`);
      const j = Number(BigInt(`0x${digest}`) % BigInt(i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  for(let i=d.length-1;i>0;i--){ const j=crypto.randomInt(0,i+1); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

function createProvablyFairBjRound(shoeCount = 8) {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  return { serverSeed, fairHash: sha256Hex(serverSeed), deck: createDeck(shoeCount, serverSeed) };
}

function scoreHand(cards){ 
  let t=0,a=0; 
  for(const c of (cards||[])){ const p=(c.value===1)?11:(c.value>=11?10:c.value); if(p===11)a++; t+=p; } 
  while(t>21&&a>0){t-=10;a--;} 
  return {total:t, softAces:a}; 
}

function isBJ(cards){ return Array.isArray(cards)&&cards.length===2&&scoreHand(cards).total===21; }

function normalizeBjSideBets(sideBets = {}) {
  return { bb: safeNum(sideBets?.bb, 0), t3: safeNum(sideBets?.t3, 0), pp: safeNum(sideBets?.pp, 0), c7: safeNum(sideBets?.c7, 0) };
}

function normalizeBjPayload(body = {}) {
  const legacyBets = body?.bets && typeof body.bets === 'object' ? body.bets : null;
  if (legacyBets) {
    const uiBets = { main: safeNum(legacyBets?.main, 0), bust: safeNum(legacyBets?.bust, 0), '213': safeNum(legacyBets?.['213'], 0), perfect: safeNum(legacyBets?.perfect, 0), crazy7: safeNum(legacyBets?.crazy7, 0) };
    return { mainBet: uiBets.main, sideBets: normalizeBjSideBets({ bb: uiBets.bust, t3: uiBets['213'], pp: uiBets.perfect, c7: uiBets.crazy7 }), uiBets, clientSeed: cleanStr(body?.clientSeed || '') };
  }
  const sideBets = normalizeBjSideBets(body?.sideBets || BJ_SIDE_BET_DEFAULTS);
  const uiBets = { main: safeNum(body?.bet, 0), bust: safeNum(sideBets.bb, 0), '213': safeNum(sideBets.t3, 0), perfect: safeNum(sideBets.pp, 0), crazy7: safeNum(sideBets.c7, 0) };
  return { mainBet: uiBets.main, sideBets, uiBets, clientSeed: cleanStr(body?.clientSeed || '') };
}

function getSessionUiBets(session = {}) {
  return {
    main: safeNum(session?.uiBets?.main, Array.isArray(session?.hands) && session.hands[0] ? safeNum(session.hands[0].bet, 0) : 0),
    bust: safeNum(session?.uiBets?.bust, session?.sideBets?.bb || 0),
    '213': safeNum(session?.uiBets?.['213'], session?.sideBets?.t3 || 0),
    perfect: safeNum(session?.uiBets?.perfect, session?.sideBets?.pp || 0),
    crazy7: safeNum(session?.uiBets?.crazy7, session?.sideBets?.c7 || 0)
  };
}

function bjCardsSnapshot(cards = []) { return (cards || []).map((card) => ({ suit: card?.suit || '', value: safeNum(card?.value, 0) })); }
function bjCloneCard(card) { return card ? { suit: card?.suit || '', value: safeNum(card?.value, 0) } : null; }

function initBjSideBetContext(session = {}) {
  if (!session.sideBetContext || typeof session.sideBetContext !== 'object') session.sideBetContext = {};
  const ctx = session.sideBetContext;
  const firstCards = Array.isArray(session?.hands?.[0]?.cards) ? session.hands[0].cards.slice(0, 2) : [];
  if (!Array.isArray(ctx.initialPlayerCards) || ctx.initialPlayerCards.length === 0) ctx.initialPlayerCards = firstCards.map(bjCloneCard).filter(Boolean);
  if (!Array.isArray(ctx.crazy7Cards) || ctx.crazy7Cards.length === 0) ctx.crazy7Cards = firstCards.map(bjCloneCard).filter(Boolean);
  if (!Number.isFinite(Number(ctx.primaryHandOrigin))) ctx.primaryHandOrigin = 0;
  return ctx;
}

function trackCrazy7Card(session, handIdx, card) {
  if (!session || safeNum(session?.sideBets?.c7, 0) <= 0 || !card) return;
  const ctx = initBjSideBetContext(session);
  const trackedHandIdx = safeNum(ctx.primaryHandOrigin, 0);
  if (safeNum(handIdx, -1) !== trackedHandIdx) return;
  if (!Array.isArray(ctx.crazy7Cards)) ctx.crazy7Cards = [];
  if (ctx.crazy7Cards.length >= 3) return;
  ctx.crazy7Cards.push(bjCloneCard(card));
}

function getCrazy7EvaluationCards(session = {}) {
  const tracked = session?.sideBetContext?.crazy7Cards;
  if (Array.isArray(tracked) && tracked.length > 0) return tracked.map(bjCloneCard).filter(Boolean).slice(0, 3);
  const fallback = Array.isArray(session?.hands?.[0]?.cards) ? session.hands[0].cards.slice(0, 3) : [];
  return fallback.map(bjCloneCard).filter(Boolean);
}

function bjHandsSnapshot(hands = []) {
  return (hands || []).map((hand) => ({ cards: bjCardsSnapshot(hand?.cards || []), bet: safeNum(hand?.bet, 0), doubled: !!hand?.doubled, status: hand?.status || 'playing' }));
}

function makeBjRoundId() { return `BJ-${nowMs().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }

function createBjShoeState(shoeCount = BJ_SHOE_COUNT) {
  const fairRound = createProvablyFairBjRound(shoeCount);
  return { deck: fairRound.deck, fairHash: fairRound.fairHash, serverSeed: fairRound.serverSeed, shoeCount, cutCardThreshold: BJ_CUT_CARD_REMAINING, shuffledAt: nowMs(), remaining: fairRound.deck.length };
}

function canBjEvenMoney(session) {
  if (!session || session.gameState !== 'playing' || !session.insuranceOffered) return false;
  if (safeNum(session.currentHandIdx, 0) !== 0) return false;
  if ((session.hands || []).length !== 1 || safeNum(session.splitCount, 0) > 0) return false;
  const hand = session.hands?.[0];
  return !!hand && isBJ(hand.cards) && safeNum(session?.dealer?.[0]?.value, 0) === 1;
}

function canBjDouble(session) {
  if (!session || session.gameState !== 'playing' || !!session.insuranceOffered) return false;
  const hand = session.hands?.[safeNum(session.currentHandIdx, 0)];
  return !!hand && Array.isArray(hand.cards) && hand.cards.length === 2 && !hand.done && hand.status === 'playing';
}

function canBjSplit(session) {
  if (!session || session.gameState !== 'playing' || !!session.insuranceOffered) return false;
  const hand = session.hands?.[safeNum(session.currentHandIdx, 0)];
  if (!hand || !Array.isArray(hand.cards) || hand.cards.length !== 2 || hand.done) return false;
  const left = hand.cards[0]?.value >= 10 ? 10 : safeNum(hand.cards[0]?.value, 0);
  const right = hand.cards[1]?.value >= 10 ? 10 : safeNum(hand.cards[1]?.value, 0);
  return left > 0 && left === right && safeNum(session.splitCount, 0) < safeNum(session.maxSplit, BJ_MAX_SPLITS);
}

function canBjSurrender(session) {
  if (!session || session.gameState !== 'playing' || !!session.insuranceOffered || !!session.evenMoneyTaken) return false;
  if (safeNum(session.currentHandIdx, 0) !== 0) return false;
  if ((session.hands || []).length !== 1 || safeNum(session.splitCount, 0) > 0) return false;
  const hand = session.hands?.[0];
  return !!hand && Array.isArray(hand.cards) && hand.cards.length === 2 && !hand.doubled && !hand.done && hand.status !== 'surrender';
}

function getBjActionAvailability(session) {
  return { canSurrender: canBjSurrender(session), canDouble: canBjDouble(session), canSplit: canBjSplit(session), evenMoneyOffered: canBjEvenMoney(session) };
}

function syncBjShoeTransaction(tx, uid, session = {}) {
  if (!tx || !uid || !session) return;
  const deck = Array.isArray(session._deck) ? session._deck : [];
  tx.set(colBJShoes().doc(uid), {
    deck, fairHash: session.fairHash || '', serverSeed: session.serverSeed || '',
    shoeCount: safeNum(session.shoeCount, BJ_SHOE_COUNT), cutCardThreshold: safeNum(session.cutCardThreshold, BJ_CUT_CARD_REMAINING),
    remaining: deck.length, updatedAt: nowMs(), shuffledAt: safeNum(session.shoeShuffledAt, nowMs())
  }, { merge: true });
}

function getBlackjackStakeForRefund(session) {
  if (!session || !['playing', 'resolving'].includes(session.gameState)) return 0;
  const handsTotal = Array.isArray(session.hands) ? session.hands.reduce((sum, hand) => sum + safeNum(hand?.bet, 0), 0) : 0;
  return handsTotal + safeNum(session.insuranceBet, 0) + safeNum(session.totalSideBets, 0);
}

function publicState(session){
  if(!session) return null;
  const dealerHidden = !!session.dealerHidden;
  const availability = getBjActionAvailability(session);
  return {
    gameState: session.gameState, dealerHidden,
    dealer: dealerHidden ? [session.dealer[0] || null, null] : session.dealer,
    hands: (session.hands || []).map(h=>({cards:h.cards||[], bet:safeNum(h.bet,0), status:h.status||'playing', doubled: !!h.doubled})),
    currentHandIdx: safeNum(session.currentHandIdx,0),
    insuranceOffered: !!session.insuranceOffered, evenMoneyOffered: !!availability.evenMoneyOffered,
    message: session.message || '', seq: safeNum(session.seq,0),
    sideBets: session.sideBets || BJ_SIDE_BET_DEFAULTS, sideBetHits: session.sideBetHits || [],
    bets: getSessionUiBets(session), totalStake: safeNum(session.totalStake, 0),
    insuranceBet: safeNum(session.insuranceBet, 0), roundId: session.roundId || '',
    splitCount: safeNum(session.splitCount, 0), maxSplit: safeNum(session.maxSplit, BJ_MAX_SPLITS),
    canSurrender: !!availability.canSurrender, canDouble: !!availability.canDouble, canSplit: !!availability.canSplit,
    shoeRemaining: Array.isArray(session._deck) ? session._deck.length : safeNum(session.shoeRemaining, 0),
    cutCardThreshold: safeNum(session.cutCardThreshold, BJ_CUT_CARD_REMAINING), shoeReshuffled: !!session.shoeReshuffled,
    cleanupAt: safeNum(session.cleanupAt, 0), resumeAvailableUntil: safeNum(session.resumeAvailableUntil, 0), cleanupPolicy: cleanStr(session.cleanupPolicy || '', 32),
    result: session.result || null
  };
}

function emitBjState(uid, session, io) {
  if (!io || !uid) return;
  const roomId = `bj_${uid}`;
  const emitState = (snap) => io.to(roomId).emit('bj:state', { ok: true, state: snap ? publicState(snap) : null });
  
  if (session !== undefined) { emitState(session); return; }
  colBJ().doc(uid).get().then((snap) => emitState(snap.exists ? snap.data() : null)).catch(() => null);
}

// ---------------------------------------------------------
// REWARD & PAYOUT MOTORU
// ---------------------------------------------------------

async function resolveAndPayout(uid, io) {
  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(colBJ().doc(uid)); if (!sSnap.exists) return;
    const s = sSnap.data(); if (s.gameState !== 'resolving') return;
    const dTotal = scoreHand(s.dealer).total, dBJ = isBJ(s.dealer);

    let roundWin = 0; let delayedSideWin = 0;
    if (!s.sideBetHits) s.sideBetHits = [];

    if (safeNum(s.insuranceBet, 0) > 0 && dBJ) roundWin += s.insuranceBet * 3;

    if (s.sideBets && safeNum(s.sideBets.bb, 0) > 0 && dTotal > 21) {
      const dLength = s.dealer.length;
      if (dLength === 3) { delayedSideWin += s.sideBets.bb * 2; s.sideBetHits.push({ code: 'bust', mult: 2, win: s.sideBets.bb * 2 }); }
      else if (dLength === 4) { delayedSideWin += s.sideBets.bb * 3; s.sideBetHits.push({ code: 'bust', mult: 3, win: s.sideBets.bb * 3 }); }
      else if (dLength === 5) { delayedSideWin += s.sideBets.bb * 10; s.sideBetHits.push({ code: 'bust', mult: 10, win: s.sideBets.bb * 10 }); }
      else if (dLength === 6) { delayedSideWin += s.sideBets.bb * 51; s.sideBetHits.push({ code: 'bust', mult: 51, win: s.sideBets.bb * 51 }); }
      else if (dLength >= 7) { delayedSideWin += s.sideBets.bb * 101; s.sideBetHits.push({ code: 'bust', mult: 101, win: s.sideBets.bb * 101 }); }
    }

    if (s.sideBets && safeNum(s.sideBets.c7, 0) > 0 && s.hands.length > 0) {
      const trackedCards = getCrazy7EvaluationCards(s);
      const sevens = trackedCards.filter((card) => safeNum(card?.value, 0) === 7);
      if (sevens.length === 1) { delayedSideWin += s.sideBets.c7 * 4; s.sideBetHits.push({ code: 'crazy7', mult: 4, win: s.sideBets.c7 * 4 }); }
      else if (sevens.length === 2) {
        if (sevens[0].suit === sevens[1].suit) { delayedSideWin += s.sideBets.c7 * 101; s.sideBetHits.push({ code: 'crazy7', mult: 101, win: s.sideBets.c7 * 101 }); }
        else { delayedSideWin += s.sideBets.c7 * 51; s.sideBetHits.push({ code: 'crazy7', mult: 51, win: s.sideBets.c7 * 51 }); }
      } else if (sevens.length === 3) {
        if (sevens[0].suit === sevens[1].suit && sevens[1].suit === sevens[2].suit) { delayedSideWin += s.sideBets.c7 * 5001; s.sideBetHits.push({ code: 'crazy7', mult: 5001, win: s.sideBets.c7 * 5001 }); }
        else { delayedSideWin += s.sideBets.c7 * 501; s.sideBetHits.push({ code: 'crazy7', mult: 501, win: s.sideBets.c7 * 501 }); }
      }
    }

    for (const h of s.hands) {
      if (h.status === 'surrender') { roundWin += Math.floor(safeNum(h.bet, 0) / 2); continue; }
      const pTotal = scoreHand(h.cards).total, pBJ = isBJ(h.cards) && s.hands.length === 1;
      if (s.evenMoneyTaken && pBJ) { roundWin += h.bet * 2; continue; }
      if (pTotal > 21 || (dBJ && !pBJ)) continue;
      if (pBJ && !dBJ) roundWin += Math.floor(h.bet * 2.5);
      else if (dTotal > 21 || pTotal > dTotal) roundWin += h.bet * 2;
      else if (pTotal === dTotal) roundWin += h.bet;
    }

    const totalWinThisTx = roundWin + delayedSideWin;
    if (totalWinThisTx > 0) tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(totalWinThisTx) });

    const totalOverallWin = totalWinThisTx + safeNum(s.sideBetWin, 0);
    const totalStake = safeNum(s.totalStake, 0);
    const net = totalOverallWin - totalStake;

    let message = 'KAYBETTİNİZ!';
    if (s.evenMoneyTaken) message = `BİRE BİR ÖDEMESİ: ${totalOverallWin} MC`;
    else if (net > 0) message = `KAZANÇ: ${totalOverallWin} MC (NET +${net} MC)`;
    else if (net === 0 && totalOverallWin > 0) message = `İADE: ${totalOverallWin} MC`;
    else if (totalOverallWin > 0) message = `ÖDEME: ${totalOverallWin} MC (NET ${net} MC)`;

    const historyDoc = {
      uid, roundId: s.roundId || makeBjRoundId(), game: 'Türkçe ONE Blackjack',
      bet: totalStake, win: totalOverallWin, net, createdAt: nowMs(),
      fairHash: s.fairHash || '', serverSeedHash: s.fairHash || '', serverSeed: s.serverSeed || '', clientSeed: s.clientSeed || '',
      dealer: bjCardsSnapshot(s.dealer || []), hands: bjHandsSnapshot(s.hands || []),
      sideBets: normalizeBjSideBets(s.sideBets || BJ_SIDE_BET_DEFAULTS), sideBetHits: s.sideBetHits || [],
      splitCount: safeNum(s.splitCount, 0), totalSideBets: safeNum(s.totalSideBets, 0),
      sideBetContext: s.sideBetContext || null, message, insuranceBet: safeNum(s.insuranceBet, 0),
      evenMoneyTaken: !!s.evenMoneyTaken, shoeRemaining: Array.isArray(s._deck) ? s._deck.length : 0,
      cutCardThreshold: safeNum(s.cutCardThreshold, BJ_CUT_CARD_REMAINING)
    };
    tx.set(db.collection('bj_history').doc(), historyDoc);

    applyBlackjackCloseWindow(s, BJ_RESULT_RETENTION_MS);
    tx.update(colBJ().doc(uid), {
      gameState: 'finished', dealerHidden: false, seq: safeNum(s.seq, 0) + 1, message, lastActionAtMs: nowMs(),
      sideBetHits: s.sideBetHits, result: { payout: totalOverallWin, net, stake: totalStake },
      canSurrender: false, evenMoneyOffered: false,
      cleanupAt: safeNum(s.cleanupAt, 0),
      resumeAvailableUntil: safeNum(s.resumeAvailableUntil, 0),
      cleanupPolicy: cleanStr(s.cleanupPolicy || 'cron_persisted', 32),
      lifecycleVersion: safeNum(s.lifecycleVersion, 2),
      lifecycleKind: cleanStr(s.lifecycleKind || 'blackjack_session', 32)
    });
  });

  const finalSnap = await colBJ().doc(uid).get().catch(() => null);
  if (finalSnap?.exists) emitBjState(uid, finalSnap.data(), io);
}

// ---------------------------------------------------------
// API UÇ NOKTALARI
// ---------------------------------------------------------

router.get('/history', verifyAuth, async (req, res) => {
  try {
    const snap = await db.collection('bj_history').where('uid', '==', req.user.uid).limit(50).get();
    const history = [];
    snap.forEach((doc) => history.push({ id: doc.id, ...doc.data() }));
    history.sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0));
    res.json({ ok: true, history: history.slice(0, 20) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.get('/state', verifyAuth, async (req, res) => {
  try {
    const snap = await colBJ().doc(req.user.uid).get();
    res.json({ ok: true, state: snap.exists ? publicState(snap.data()) : null });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/start', verifyAuth, async (req, res) => {
  try {
    const normalizedPayload = normalizeBjPayload(req.body || {});
    const mainBet = safeNum(normalizedPayload.mainBet, 0);
    const sideBets = normalizeBjSideBets(normalizedPayload.sideBets || BJ_SIDE_BET_DEFAULTS);
    const totalSideBets = safeNum(sideBets.bb, 0) + safeNum(sideBets.t3, 0) + safeNum(sideBets.pp, 0) + safeNum(sideBets.c7, 0);
    const totalStake = mainBet + totalSideBets;

    if (isNaN(totalStake) || totalStake < 1 || totalStake > 10000000) throw new Error('Toplam bahis geçersiz. (Maksimum 10M)');
    if (mainBet <= 0 && totalSideBets > 0) throw new Error('Ana bahis yapmadan yan bahis oynanamaz.');

    const uid = req.user.uid;
    let rpEarned = 0;

    const session = await db.runTransaction(async (tx) => {
      const existing = await tx.get(colBJ().doc(uid));
      const uSnap = await tx.get(colUsers().doc(uid));
      const shoeSnap = await tx.get(colBJShoes().doc(uid));
      if (!uSnap.exists) throw new Error('Kayıt yok.');

      let availableBalance = safeNum(uSnap.data()?.balance, 0);
      if (existing.exists && ['playing', 'resolving'].includes(existing.data().gameState)) {
          const existingData = existing.data();
          if (nowMs() - safeNum(existingData.lastActionAtMs, 0) > BJ_STALE_SESSION_MS) {
              const staleRefund = getBlackjackStakeForRefund(existingData);
              if (staleRefund > 0) {
                  tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(staleRefund) });
                  availableBalance += staleRefund;
              }
              syncBjShoeTransaction(tx, uid, existingData);
              tx.delete(colBJ().doc(uid));
          } else {
              return { ...existingData, _resumed: true };
          }
      }
      if (availableBalance < totalStake) throw new Error('Bakiye yetersiz.');

      tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-totalStake) });
      rpEarned += awardRpFromSpend(tx, colUsers().doc(uid), uSnap.data()||{}, totalStake, 'BJ_BET');

      const storedShoe = shoeSnap.exists ? (shoeSnap.data() || {}) : null;
      const shouldReshuffle = !storedShoe || !Array.isArray(storedShoe.deck) || storedShoe.deck.length < BJ_CUT_CARD_REMAINING;
      const shoeState = shouldReshuffle ? createBjShoeState(BJ_SHOE_COUNT) : {
        deck: storedShoe.deck.map(bjCloneCard).filter(Boolean), fairHash: storedShoe.fairHash || '', serverSeed: storedShoe.serverSeed || '',
        shoeCount: safeNum(storedShoe.shoeCount, BJ_SHOE_COUNT), cutCardThreshold: safeNum(storedShoe.cutCardThreshold, BJ_CUT_CARD_REMAINING),
        shuffledAt: safeNum(storedShoe.shuffledAt, nowMs()), remaining: Array.isArray(storedShoe.deck) ? storedShoe.deck.length : 0
      };
      const deck = shoeState.deck.slice();

      const newSession = {
          uid, gameState: 'playing', roundId: makeBjRoundId(), dealer: [deck.pop(), deck.pop()], dealerHidden: true,
          hands: [{ cards: [deck.pop(), deck.pop()], bet: mainBet, status: 'playing', done: false, doubled: false }],
          currentHandIdx: 0, _deck: deck, seq: 1, lastActionAtMs: nowMs(), fairHash: shoeState.fairHash, serverSeed: shoeState.serverSeed,
          shoeCount: safeNum(shoeState.shoeCount, BJ_SHOE_COUNT), cutCardThreshold: safeNum(shoeState.cutCardThreshold, BJ_CUT_CARD_REMAINING),
          shoeShuffledAt: safeNum(shoeState.shuffledAt, nowMs()), shoeReshuffled: shouldReshuffle,
          clientSeed: normalizedPayload.clientSeed || sha256Hex(`${uid}:${shoeState.serverSeed}`).slice(0, 24),
          sideBets, totalSideBets, totalStake, sideBetWin: 0, sideBetHits: [], uiBets: normalizedPayload.uiBets, splitCount: 0, maxSplit: BJ_MAX_SPLITS, result: null,
          cleanupAt: 0, resumeAvailableUntil: 0, cleanupPolicy: '', lifecycleVersion: 2, lifecycleKind: 'blackjack_session'
      };
      initBjSideBetContext(newSession);

      let instantSideWin = 0;
      if(sideBets.pp > 0) {
          const c1 = newSession.hands[0].cards[0], c2 = newSession.hands[0].cards[1];
          if(c1.value === c2.value) {
              if(c1.suit === c2.suit) { instantSideWin += sideBets.pp * 25; newSession.sideBetHits.push({ code: 'perfect', mult: 25, win: sideBets.pp * 25 }); }
              else if ((['H','D'].includes(c1.suit) && ['H','D'].includes(c2.suit)) || (['C','S'].includes(c1.suit) && ['C','S'].includes(c2.suit))) { instantSideWin += sideBets.pp * 12; newSession.sideBetHits.push({ code: 'perfect', mult: 12, win: sideBets.pp * 12 }); }
              else { instantSideWin += sideBets.pp * 6; newSession.sideBetHits.push({ code: 'perfect', mult: 6, win: sideBets.pp * 6 }); }
          }
      }

      if(sideBets.t3 > 0) {
          const c1 = newSession.hands[0].cards[0], c2 = newSession.hands[0].cards[1], d1 = newSession.dealer[0];
          const suits = [c1.suit, c2.suit, d1.suit], vals = [c1.value, c2.value, d1.value].sort((a,b)=>a-b);
          const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
          const isThreeOfKind = vals[0] === vals[1] && vals[1] === vals[2];
          const isStraight = (vals[0]+1 === vals[1] && vals[1]+1 === vals[2]) || (vals[0]===1 && vals[1]===12 && vals[2]===13);

          if (isThreeOfKind && isFlush) { instantSideWin += sideBets.t3 * 100; newSession.sideBetHits.push({ code: '213', mult: 100, win: sideBets.t3 * 100 }); }
          else if (isStraight && isFlush) { instantSideWin += sideBets.t3 * 40; newSession.sideBetHits.push({ code: '213', mult: 40, win: sideBets.t3 * 40 }); }
          else if (isThreeOfKind) { instantSideWin += sideBets.t3 * 30; newSession.sideBetHits.push({ code: '213', mult: 30, win: sideBets.t3 * 30 }); }
          else if (isStraight) { instantSideWin += sideBets.t3 * 10; newSession.sideBetHits.push({ code: '213', mult: 10, win: sideBets.t3 * 10 }); }
          else if (isFlush) { instantSideWin += sideBets.t3 * 5; newSession.sideBetHits.push({ code: '213', mult: 5, win: sideBets.t3 * 5 }); }
      }

      newSession.sideBetWin = instantSideWin;
      if(instantSideWin > 0) tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(instantSideWin) });

      newSession.insuranceOffered = newSession.dealer[0].value === 1;
      newSession.evenMoneyOffered = canBjEvenMoney(newSession);

      if (!newSession.insuranceOffered && (isBJ(newSession.hands[0].cards) || isBJ(newSession.dealer))) {
          newSession.dealerHidden = false; newSession.gameState = 'resolving';
      }
      syncBjShoeTransaction(tx, uid, newSession);
      tx.set(colBJ().doc(uid), newSession);
      return newSession;
    });

    const io = req.app.get('io');
    if (session.gameState === 'resolving') await resolveAndPayout(uid, io);
    const finalSnap = await colBJ().doc(uid).get();
    if (finalSnap.exists) emitBjState(uid, finalSnap.data(), io);
    if (io && rpEarned > 0) io.to(`user_${uid}`).emit('user:rp_earned', { earned: rpEarned });
    
    res.json({ ok: true, state: finalSnap.exists ? publicState(finalSnap.data()) : null });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/action', verifyAuth, bjActionLimiter, async (req, res) => {
  try {
    const uid = req.user.uid, action = cleanStr(req.body?.action || ''), clientSeq = safeNum(req.body?.seq, 0);
    let rpEarned = 0;
    const allowedActions = new Set(['hit', 'stand', 'double', 'split', 'surrender', 'insurance_yes', 'insurance_no', 'even_money_yes', 'even_money_no']);
    if (!allowedActions.has(action)) throw new Error('Geçersiz blackjack aksiyonu.');

    const updated = await db.runTransaction(async (tx) => {
      const sSnap = await tx.get(colBJ().doc(uid));
      if (!sSnap.exists) throw new Error('Oyun yok.');
      const s = sSnap.data() || {};
      if (s.gameState !== 'playing' || clientSeq !== safeNum(s.seq, 0)) throw new Error('Senkronizasyon hatası.');

      const uSnap = await tx.get(colUsers().doc(uid));
      const userBal = safeNum(uSnap.data()?.balance, 0);

      if (['hit', 'double', 'split'].includes(action) && s._deck.length < 1) throw new Error('Deste tükendi. Yeni oyun başlatın.');

      if (s.insuranceOffered) {
        if (canBjEvenMoney(s)) {
          if (!['even_money_yes', 'even_money_no'].includes(action)) throw new Error('Önce bire bir kararını verin.');
          s.evenMoneyOffered = false; s.insuranceOffered = false; s.dealerHidden = false;
          if (action === 'even_money_yes') s.evenMoneyTaken = true;
          s.gameState = 'resolving';
        } else {
          if (!['insurance_yes', 'insurance_no'].includes(action)) throw new Error('Önce sigorta kararını verin.');
          if (action === 'insurance_yes') {
            const insCost = Math.floor(safeNum(s.hands?.[0]?.bet, 0) / 2);
            if (userBal < insCost) throw new Error('Sigorta için bakiye yetersiz.');
            tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-insCost) });
            rpEarned += awardRpFromSpend(tx, colUsers().doc(uid), uSnap.data()||{}, insCost, 'BJ_SPEND');
            s.insuranceBet = insCost; s.totalStake += insCost;
          }
          s.evenMoneyOffered = false; s.insuranceOffered = false;
          if (isBJ(s.hands[0].cards) || isBJ(s.dealer)) { s.dealerHidden = false; s.gameState = 'resolving'; }
        }
      } else {
        const h = s.hands[s.currentHandIdx];
        if (!h) throw new Error('Aktif el bulunamadı.');

        if (action === 'hit') {
          h.status = 'playing'; const drawnCard = s._deck.pop(); h.cards.push(drawnCard);
          trackCrazy7Card(s, s.currentHandIdx, drawnCard);
          if (scoreHand(h.cards).total >= 21) { h.done = true; if (scoreHand(h.cards).total > 21) h.status = 'bust'; }
        } else if (action === 'stand') {
          h.done = true; if (h.status === 'playing') h.status = 'stand';
        } else if (action === 'double') {
          if (h.cards.length !== 2) throw new Error('Sadece ilk 2 kartta geçerlidir.');
          if (userBal < h.bet) throw new Error('Double için bakiye yetersiz.');
          tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-h.bet) });
          rpEarned += awardRpFromSpend(tx, colUsers().doc(uid), uSnap.data()||{}, h.bet, 'BJ_SPEND');
          s.totalStake += h.bet; h.bet *= 2;
          const drawnCard = s._deck.pop(); h.cards.push(drawnCard);
          trackCrazy7Card(s, s.currentHandIdx, drawnCard);
          h.done = true; h.doubled = true; h.status = scoreHand(h.cards).total > 21 ? 'bust' : 'stand';
        } else if (action === 'split') {
          if (h.cards.length !== 2) throw new Error('Split için elde tam 2 kart olmalı.');
          initBjSideBetContext(s);
          const val1 = h.cards[0].value >= 10 ? 10 : h.cards[0].value, val2 = h.cards[1].value >= 10 ? 10 : h.cards[1].value;
          if (val1 !== val2) throw new Error('Geçersiz Split.');
          if (safeNum(s.splitCount, 0) >= safeNum(s.maxSplit, BJ_MAX_SPLITS)) throw new Error('Maksimum split limitine ulaşıldı.');
          if (userBal < h.bet) throw new Error('Split için bakiye yetersiz.');
          tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(-h.bet) });
          rpEarned += awardRpFromSpend(tx, colUsers().doc(uid), uSnap.data()||{}, h.bet, 'BJ_SPEND');
          s.totalStake += h.bet;

          const popped = h.cards.pop(), isAceSplit = popped?.value === 1;
          h.doubled = false; h.status = 'playing'; h.done = false;
          const currentHandDraw = s._deck.pop(); h.cards.push(currentHandDraw);
          trackCrazy7Card(s, s.currentHandIdx, currentHandDraw);
          if (isAceSplit) { h.done = true; h.status = 'stand'; }

          const newHand = { cards: [popped, s._deck.pop()], bet: h.bet, status: isAceSplit ? 'stand' : 'playing', done: isAceSplit, doubled: false };
          s.hands.splice(s.currentHandIdx + 1, 0, newHand); s.splitCount = safeNum(s.splitCount, 0) + 1;
        } else if (action === 'surrender') {
          if (!canBjSurrender(s)) throw new Error('Pes etme şu an kullanılamaz.');
          h.done = true; h.status = 'surrender';
        }

        const nextIdx = s.hands.findIndex((x) => !x.done);
        if (nextIdx >= 0) { s.currentHandIdx = nextIdx; } 
        else {
          s.dealerHidden = false;
          const allHandsSurrendered = s.hands.every((x) => x.status === 'surrender');
          if (!allHandsSurrendered) {
            let dScore = scoreHand(s.dealer);
            while (dScore.total < 17) { s.dealer.push(s._deck.pop()); dScore = scoreHand(s.dealer); }
          }
          s.gameState = 'resolving';
        }
      }
      s.seq = safeNum(s.seq, 0) + 1; s.lastActionAtMs = nowMs();
      syncBjShoeTransaction(tx, uid, s); tx.set(colBJ().doc(uid), s, { merge: true });
      return s;
    });

    const io = req.app.get('io');
    if (updated.gameState === 'resolving') await resolveAndPayout(uid, io);
    const finalSnap = await colBJ().doc(uid).get();
    if (finalSnap.exists) emitBjState(uid, finalSnap.data(), io);
    if (io && rpEarned > 0) io.to(`user_${uid}`).emit('user:rp_earned', { earned: rpEarned });
    res.json({ ok: true, state: finalSnap.exists ? publicState(finalSnap.data()) : null });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;