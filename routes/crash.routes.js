'use strict';

const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { safeNum, safeFloat, nowMs, clamp, cleanStr } = require('../utils/helpers');
const { engineState } = require('../engines/crashEngine');
const { CRASH_MIN_BET, CRASH_MIN_AUTO, CRASH_MAX_MULTIPLIER, GAME_RESULT_CODES, GAME_SETTLEMENT_STATUS } = require('../config/constants');
const { getCanonicalSelectedFrame, buildCanonicalUserState } = require('../utils/accountState');
const { assertGamesAllowed } = require('../utils/userRestrictions');
const { recordGameAudit } = require('../utils/gameAudit');
const { applyProgressionPatchInTransaction, calculateSpendProgressReward } = require('../utils/economyCore');
const { saveMatchHistory } = require('../utils/matchHistory');
const { recordRewardLedger } = require('../utils/rewardLedger');

const colUsers = () => db.collection('users');
const colCrashBets = () => db.collection('crash_bets');

function pickUserSelectedFrame(user = {}) {
  return getCanonicalSelectedFrame(user, { defaultFrame: 0 });
}



function applySpendProgression(tx, userRef, userData = {}, spendMc = 0, source = '') {
  const reward = calculateSpendProgressReward(spendMc, source);
  applyProgressionPatchInTransaction(tx, userRef, userData, {
    xpEarned: reward.xpEarned,
    activityEarned: reward.activityEarned,
    roundsEarned: reward.roundsEarned,
    spentMc: reward.spentMc,
    source: reward.source,
    updatedAt: nowMs()
  });
  return reward;
}

function describeCrashOutcomeLabel(resultCode = '') {
  if (resultCode === GAME_RESULT_CODES.CRASH_CASHOUT_AUTO) return 'auto_cashout';
  if (resultCode === GAME_RESULT_CODES.CRASH_CASHOUT_MANUAL) return 'cashout';
  if (resultCode === GAME_RESULT_CODES.CRASH_CRASHED_LOSS) return 'crashed_loss';
  return 'unknown';
}

function buildCrashHistoryEntry({ betId = '', uid = '', roomId = '', roundId = '', amount = 0, payout = 0, resultCode = '', crashPoint = 0, cashoutMult = 0, createdAt = 0 } = {}) {
  const safeBetId = cleanStr(betId || '', 180);
  if (!safeBetId || !uid) return null;
  const rewardMc = Math.floor(safeNum(payout, 0));
  const stakeMc = Math.floor(safeNum(amount, 0));
  const netMc = rewardMc - stakeMc;
  return {
    id: `crash_${safeBetId}`,
    gameType: 'crash',
    roomId: cleanStr(roomId || roundId || safeBetId, 160),
    status: 'finished',
    result: describeCrashOutcomeLabel(resultCode),
    winnerUid: netMc > 0 ? cleanStr(uid || '', 160) : '',
    loserUid: netMc < 0 ? cleanStr(uid || '', 160) : '',
    participants: [cleanStr(uid || '', 160)].filter(Boolean),
    rewards: { mc: rewardMc, stakeMc, netMc },
    meta: {
      resultCode: cleanStr(resultCode || '', 64),
      roundId: cleanStr(roundId || '', 160),
      crashPoint: safeFloat(crashPoint),
      cashoutMult: safeFloat(cashoutMult)
    },
    createdAt: safeNum(createdAt, nowMs())
  };
}

async function persistCrashAudit({ uid = '', betId = '', roundId = '', eventType = '', resultCode = '', amount = 0, payout = 0, meta = {}, idempotencyKey = '' } = {}) {
  if (!uid || !betId || !eventType) return null;
  return recordGameAudit({
    gameType: 'crash',
    entityType: 'bet',
    entityId: betId,
    roomId: roundId,
    roundId,
    betId,
    eventType,
    resultCode,
    reason: cleanStr(meta?.reason || '', 48),
    status: resultCode === GAME_RESULT_CODES.CRASH_BET_PLACED ? GAME_SETTLEMENT_STATUS.ACTIVE : GAME_SETTLEMENT_STATUS.SETTLED,
    actorUid: uid,
    subjectUid: uid,
    amount,
    payout,
    meta,
    idempotencyKey
  }).catch(() => null);
}

router.get('/active-bets', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const playerState = engineState.crashState.players[uid] || {};
    const activeBoxes = ['box1', 'box2']
      .map((boxKey) => ({ boxKey, bet: playerState[boxKey] }))
      .filter((entry) => {
        if (!entry.bet || entry.bet.cashed || engineState.crashState.phase === 'CRASHED') return false;
        return true;
      })
      .map((entry) => ({
        box: entry.boxKey === 'box2' ? 2 : 1,
        amount: safeFloat(entry.bet.bet),
        autoCashout: safeFloat(entry.bet.autoCashout || 0)
      }));

    res.json({
      ok: true,
      hasActiveBet: activeBoxes.length > 0,
      hasRiskyBet: activeBoxes.some((entry) => safeFloat(entry.autoCashout) <= 1),
      phase: engineState.crashState.phase,
      bets: activeBoxes
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/bet', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const guardSnap = await colUsers().doc(uid).get();
    assertGamesAllowed(guardSnap.data() || {});
    const box = safeNum(req.body.box, 0);
    const amount = safeFloat(req.body.amount);
    const autoCashout = engineState.normalizeAutoCashout(req.body.autoCashout);
    const autoCashoutEnabled = autoCashout > 0 && autoCashout >= CRASH_MIN_AUTO;

    if (box !== 1 && box !== 2) throw new Error('Geçersiz kutu.');
    if (isNaN(amount) || amount < CRASH_MIN_BET || amount > 10000000) throw new Error(`Katılım tutarı ${CRASH_MIN_BET} ile 10.000.000 MC arasında olmalıdır.`);

    const currentRoundId = String(engineState.crashState.roundId || '');
    const betId = `${currentRoundId}_${uid}_${box}`;
    let uData;
    let progressReward = null;

    await db.runTransaction(async (tx) => {
      if (engineState.crashState.phase !== 'COUNTDOWN') throw new Error('Katılım penceresi kapandı, bir sonraki turu bekleyin.');

      const betRef = colCrashBets().doc(betId);
      const betSnap = await tx.get(betRef);
      if (betSnap.exists) throw new Error('Bu kutu için tur kaydı zaten alındı.');

      const userRef = colUsers().doc(uid);
      const uSnap = await tx.get(userRef);
      if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı.');

      uData = uSnap.data() || {};
      if (safeFloat(uData.balance) < amount) throw new Error('Bakiye yetersiz.');

      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
      progressReward = applySpendProgression(tx, userRef, uData, amount, 'CRASH_BET');

      tx.set(betRef, {
        uid,
        username: uData.username || 'Oyuncu',
        box,
        amount,
        autoCashout,
        autoCashoutEnabled,
        cashed: false,
        win: 0,
        roundId: currentRoundId,
        createdAt: nowMs(),
        updatedAt: nowMs(),
        status: 'active',
        settlementStatus: GAME_SETTLEMENT_STATUS.ACTIVE,
        resultCode: 'pending',
        resultReason: '',
        settledAt: 0,
        cashoutSource: ''
      });
    });

    if (progressReward?.xpEarned > 0) {
      recordRewardLedger({
        uid,
        amount: progressReward.xpEarned,
        currency: 'XP',
        source: 'crash_spend_progress',
        referenceId: betId,
        idempotencyKey: 'crash_spend_progress:' + betId,
        meta: { amount, roundId: currentRoundId, box, spentMc: progressReward.spentMc, resultCode: GAME_RESULT_CODES.CRASH_BET_PLACED }
      }).catch(() => null);
    }

    if (!engineState.crashState.players[uid]) engineState.crashState.players[uid] = {};

    engineState.crashState.players[uid][`box${box}`] = {
      uid,
      username: uData.username || 'Oyuncu',
      avatar: uData.avatar || '',
      selectedFrame: pickUserSelectedFrame(uData || {}),
      betId,
      bet: amount,
      autoCashout,
      autoCashoutEnabled,
      cashed: false,
      cashingOut: false,
      win: 0,
      cashoutMult: 0,
      box,
      roundId: currentRoundId
    };

    engineState.triggerUpdate();

    persistCrashAudit({
      uid,
      betId,
      roundId: currentRoundId,
      eventType: 'bet_placed',
      resultCode: GAME_RESULT_CODES.CRASH_BET_PLACED,
      amount,
      payout: 0,
      meta: { box, autoCashout, autoCashoutEnabled, reason: 'bet_placed' },
      idempotencyKey: `crash:${betId}:bet_placed`
    });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/cashout', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const guardSnap = await colUsers().doc(uid).get();
    assertGamesAllowed(guardSnap.data() || {});
    const box = safeNum(req.body.box, 0);

    if (engineState.crashState.phase !== 'FLYING') {
      throw new Error(engineState.crashState.phase === 'CRASHED' ? 'Çok geç, tur sona erdi.' : 'Şu an çıkış alınamaz.');
    }

    const pBet = engineState.crashState.players[uid] && engineState.crashState.players[uid][`box${box}`];
    if (!pBet) throw new Error('Aktif tur kaydınız bulunmuyor.');
    if (pBet.cashed || pBet.cashingOut) throw new Error('Bu tur için çıkış işlemi zaten tamamlandı.');

    pBet.cashingOut = true;

    const elapsedMs = nowMs() - engineState.crashState.startTime;
    const exactCurrentMult = safeFloat(clamp(Math.max(1.00, Math.pow(Math.E, 0.00008 * Math.max(0, elapsedMs))), 1.00, CRASH_MAX_MULTIPLIER));

    if (exactCurrentMult >= engineState.crashState.crashPoint) {
      pBet.cashingOut = false;
      throw new Error('Çok geç, uçak patladı!');
    }

    const finalWin = safeFloat(pBet.bet * exactCurrentMult);
    const settledAt = nowMs();

    const settlement = await db.runTransaction(async (tx) => {
      const betRef = colCrashBets().doc(pBet.betId);
      const betSnap = await tx.get(betRef);
      if (!betSnap.exists) throw new Error('Aktif tur kaydı bulunmuyor.');

      const betDoc = betSnap.data() || {};
      const currentSettlement = cleanStr(betDoc.settlementStatus || '', 24);
      const alreadySettled = safeNum(betDoc.settledAt, 0) > 0 || currentSettlement === GAME_SETTLEMENT_STATUS.SETTLED || betDoc.cashed === true;
      if (alreadySettled) {
        return {
          duplicated: true,
          resultCode: cleanStr(betDoc.resultCode || '', 64),
          winAmount: safeFloat(betDoc.win || 0),
          cashoutMult: safeFloat(betDoc.cashoutMult || 0),
          cashoutSource: cleanStr(betDoc.cashoutSource || '', 32)
        };
      }

      if (cleanStr(betDoc.uid || '', 160) !== uid || safeNum(betDoc.box, 0) !== box) throw new Error('Tur kaydı doğrulanamadı.');
      if (cleanStr(betDoc.roundId || '', 160) !== String(pBet.roundId || engineState.crashState.roundId || '')) throw new Error('Tur eşleşmesi doğrulanamadı.');

      tx.update(betRef, {
        cashed: true,
        win: finalWin,
        cashoutMult: exactCurrentMult,
        updatedAt: settledAt,
        status: 'settled',
        settlementStatus: GAME_SETTLEMENT_STATUS.SETTLED,
        resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_MANUAL,
        resultReason: 'cashout_manual',
        settledAt,
        cashoutSource: 'manual'
      });
      tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(finalWin) });
      return { duplicated: false, resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_MANUAL, winAmount: finalWin, cashoutMult: exactCurrentMult, cashoutSource: 'manual' };
    });

    pBet.cashingOut = false;
    pBet.cashed = true;
    pBet.win = settlement.winAmount;
    pBet.cashoutMult = settlement.cashoutMult;
    engineState.triggerUpdate();

    if (settlement.resultCode === GAME_RESULT_CODES.CRASH_CRASHED_LOSS) throw new Error('Çok geç, tur sona erdi.');

    if (!settlement.duplicated) {
      const historyEntry = buildCrashHistoryEntry({
        betId: pBet.betId,
        uid,
        roundId: String(pBet.roundId || engineState.crashState.roundId || ''),
        amount: pBet.bet,
        payout: settlement.winAmount,
        resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_MANUAL,
        cashoutMult: settlement.cashoutMult,
        createdAt: settledAt
      });
      if (historyEntry) saveMatchHistory(historyEntry).catch(() => null);
      persistCrashAudit({
        uid,
        betId: pBet.betId,
        roundId: String(pBet.roundId || engineState.crashState.roundId || ''),
        eventType: 'bet_settled',
        resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_MANUAL,
        amount: pBet.bet,
        payout: settlement.winAmount,
        meta: { box, cashoutMult: settlement.cashoutMult, reason: 'cashout_manual' },
        idempotencyKey: `crash:${pBet.betId}:cashout_manual`
      });
    }
    res.json({ ok: true, winAmount: settlement.winAmount, cashoutMult: settlement.cashoutMult, duplicated: !!settlement.duplicated });
  } catch (e) {
    const uid = req.user?.uid;
    const box = safeNum(req.body?.box, 0);
    const pBet = uid && engineState.crashState.players[uid] && engineState.crashState.players[uid][`box${box}`];

    if (pBet) {
      pBet.cashingOut = false;
      if (!pBet.cashed) { pBet.win = 0; pBet.cashoutMult = 0; }
      engineState.triggerUpdate();
    }
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
