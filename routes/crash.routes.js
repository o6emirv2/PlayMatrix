// routes/crash.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { safeNum, safeFloat, nowMs, clamp } = require('../utils/helpers');
const { awardRpFromSpend } = require('../utils/rpSystem');
const { engineState } = require('../engines/crashEngine');
const { CRASH_MIN_AUTO, CRASH_MAX_MULTIPLIER } = require('../config/constants');

const colUsers = () => db.collection('users');

function pickUserSelectedFrame(user = {}) {
  if (typeof user?.selectedFrame === 'string' && user.selectedFrame.trim()) return user.selectedFrame.trim();
  const numericSelected = Number(user?.selectedFrame);
  if (Number.isFinite(numericSelected) && numericSelected > 0) return Math.floor(numericSelected);
  if (typeof user?.activeFrameClass === 'string' && user.activeFrameClass.trim()) return user.activeFrameClass.trim();
  const numericActive = Number(user?.activeFrame);
  if (Number.isFinite(numericActive) && numericActive > 0) return Math.floor(numericActive);
  return 0;
}

// GET /api/crash/active-bets
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

// POST /api/crash/bet
router.post('/bet', verifyAuth, async (req, res) => {
  try {
      const uid = req.user.uid;
      const box = safeNum(req.body.box, 0);
      const amount = safeFloat(req.body.amount);
      const autoCashout = engineState.normalizeAutoCashout(req.body.autoCashout);
      const autoCashoutEnabled = autoCashout > 0 && autoCashout >= CRASH_MIN_AUTO;

      if (box !== 1 && box !== 2) throw new Error('Geçersiz kutu.');
      if (isNaN(amount) || amount < 1 || amount > 10000000) throw new Error('Bahis tutarı 1 ile 10.000.000 MC arasında olmalıdır.');

      const currentRoundId = engineState.crashState.roundId;
      const betId = `${currentRoundId}_${uid}_${box}`;
      let uData; let rpEarned = 0;

      await db.runTransaction(async (tx) => {
          if (engineState.crashState.phase !== 'COUNTDOWN') throw new Error('Bahisler kapandı, bir sonraki eli bekleyin.');
          
          const betSnap = await tx.get(db.collection('crash_bets').doc(betId));
          if (betSnap.exists) throw new Error('Bu kutuya zaten bahis yapıldı.');

          const userRef = colUsers().doc(uid);
          const uSnap = await tx.get(userRef);
          if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı.');

          uData = uSnap.data();
          if (safeFloat(uData.balance) < amount) throw new Error('Bakiye yetersiz.');

          tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
          rpEarned += awardRpFromSpend(tx, userRef, uData, amount, 'CRASH_BET');

          tx.set(db.collection('crash_bets').doc(betId), {
              uid, username: uData.username || 'Oyuncu', box, amount, autoCashout,
              autoCashoutEnabled, cashed: false, win: 0, roundId: currentRoundId, createdAt: nowMs()
          });
      });

      if (!engineState.crashState.players[uid]) engineState.crashState.players[uid] = {};

      engineState.crashState.players[uid][`box${box}`] = {
          uid, username: uData.username || 'Oyuncu', avatar: uData.avatar || '',
          selectedFrame: pickUserSelectedFrame(uData || {}), betId, bet: amount,
          autoCashout, autoCashoutEnabled, cashed: false, cashingOut: false,
          win: 0, cashoutMult: 0, box
      };

      engineState.triggerUpdate();
      
      const io = req.app.get('io');
      if (io && rpEarned > 0) io.to(`user_${uid}`).emit('user:rp_earned', { earned: rpEarned });
      res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/crash/cashout
router.post('/cashout', verifyAuth, async (req, res) => {
  try {
      const uid = req.user.uid;
      const box = safeNum(req.body.box, 0);

      if (engineState.crashState.phase !== 'FLYING') {
          throw new Error(engineState.crashState.phase === 'CRASHED' ? 'Çok geç, uçak patladı!' : 'Şu an bozdurulamaz.');
      }

      const pBet = engineState.crashState.players[uid] && engineState.crashState.players[uid][`box${box}`];
      if (!pBet) throw new Error('Aktif bahisiniz bulunmuyor.');
      if (pBet.cashed || pBet.cashingOut) throw new Error('Bu bahsi zaten çektiniz.');

      pBet.cashingOut = true; 

      const elapsedMs = nowMs() - engineState.crashState.startTime;
      const exactCurrentMult = safeFloat(clamp(Math.max(1.00, Math.pow(Math.E, 0.00008 * Math.max(0, elapsedMs))), 1.00, CRASH_MAX_MULTIPLIER));

      if (exactCurrentMult >= engineState.crashState.crashPoint) {
          pBet.cashingOut = false;
          throw new Error('Çok geç, uçak patladı!');
      }

      const finalWin = safeFloat(pBet.bet * exactCurrentMult);
      pBet.cashed = true; pBet.win = finalWin; pBet.cashoutMult = exactCurrentMult; 
      engineState.triggerUpdate();

      await db.runTransaction(async (tx) => {
          tx.update(db.collection('crash_bets').doc(pBet.betId), { cashed: true, win: finalWin, cashoutMult: exactCurrentMult });
          tx.update(colUsers().doc(uid), { balance: admin.firestore.FieldValue.increment(finalWin) });
      });

      pBet.cashingOut = false;
      res.json({ ok: true, winAmount: finalWin });
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