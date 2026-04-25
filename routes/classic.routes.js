'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { safeNum, cleanStr, nowMs } = require('../utils/helpers');
const { applyProgressionPatchInTransaction } = require('../utils/economyCore');
const { recordRewardLedger } = require('../utils/rewardLedger');

const colUsers = () => db.collection('users');
const colClassicRuns = () => db.collection('classic_runs');
const colClassicScoreSignatures = () => db.collection('classic_score_signatures');

const CLASSIC_GAME_RULES = Object.freeze({
  snakepro: Object.freeze({ label: 'Snake Pro', maxScore: 250000, minDurationMs: 8000, duplicateWindowMs: 120000 }),
  patternmaster: Object.freeze({ label: 'Pattern Master', maxScore: 50000, minDurationMs: 8000, duplicateWindowMs: 120000 }),
  spacepro: Object.freeze({ label: 'Space Pro', maxScore: 250000, minDurationMs: 8000, duplicateWindowMs: 120000 })
});

function normalizeGameType(value = '') {
  return cleanStr(value || '', 32).toLowerCase();
}


function clampScore(value = 0, max = 0) {
  const safe = Math.max(0, Math.floor(safeNum(value, 0)));
  if (!Number.isFinite(max) || max <= 0) return safe;
  return Math.min(max, safe);
}

function computeClassicLevelPoints(score = 0) {
  return Math.max(0, Math.floor(clampScore(score, Number.MAX_SAFE_INTEGER) / 100));
}

function makeRunFingerprint(uid = '', gameType = '', runId = '') {
  return crypto.createHash('sha1').update(`${uid}::${gameType}::${runId}`).digest('hex');
}

function makeScoreSignature(uid = '', gameType = '', score = 0) {
  return crypto.createHash('sha1').update(`${uid}::${gameType}::${Math.max(0, Math.floor(safeNum(score, 0)))}`).digest('hex');
}

router.post('/classic/submit', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = cleanStr(req.user?.uid || '', 160);
    if (!uid) return res.status(401).json({ ok: false, error: 'Oturum doğrulanamadı.' });

    const gameType = normalizeGameType(req.body?.gameType);
    const rules = CLASSIC_GAME_RULES[gameType];
    if (!rules) return res.status(400).json({ ok: false, error: 'Geçersiz klasik oyun türü.' });

    const score = clampScore(req.body?.score, rules.maxScore);
    const runId = cleanStr(req.body?.runId || '', 120);
    if (!runId) return res.status(400).json({ ok: false, error: 'Oyun oturumu doğrulanamadı.' });

    const startedAt = Math.max(0, Math.floor(safeNum(req.body?.startedAt, 0)));
    const endedAtRaw = Math.max(0, Math.floor(safeNum(req.body?.endedAt, 0)));
    const submittedAt = nowMs();
    const endedAt = endedAtRaw > 0 ? Math.min(endedAtRaw, submittedAt) : submittedAt;
    const durationMs = Math.max(0, endedAt - startedAt);
    if (startedAt <= 0 || durationMs < rules.minDurationMs) {
      return res.status(400).json({ ok: false, error: 'Skor kaydı için oyun süresi yetersiz.' });
    }

    const fingerprint = makeRunFingerprint(uid, gameType, runId);
    const runRef = colClassicRuns().doc(fingerprint);
    const signatureRef = colClassicScoreSignatures().doc(makeScoreSignature(uid, gameType, score));
    const userRef = colUsers().doc(uid);

    const levelPoints = computeClassicLevelPoints(score);
    const activityEarned = score > 0 ? 1 : 0;

    const result = await db.runTransaction(async (tx) => {
      const [runSnap, sigSnap, userSnap] = await Promise.all([
        tx.get(runRef),
        tx.get(signatureRef),
        tx.get(userRef)
      ]);

      if (runSnap.exists) {
        return { ok: false, code: 'DUPLICATE_RUN', error: 'Bu skor oturumu daha önce işlendi.' };
      }

      if (sigSnap.exists) {
        const sigData = sigSnap.data() || {};
        const lastSubmittedAt = Math.max(0, Math.floor(safeNum(sigData.lastSubmittedAt, 0)));
        if ((submittedAt - lastSubmittedAt) <= rules.duplicateWindowMs) {
          return { ok: false, code: 'DUPLICATE_SCORE_WINDOW', error: 'Aynı skor kısa sürede tekrar gönderilemez.' };
        }
      }

      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      const previousStats = (userData.classicStats && typeof userData.classicStats === 'object') ? userData.classicStats : {};
      const gameStats = previousStats[gameType] && typeof previousStats[gameType] === 'object' ? previousStats[gameType] : {};
      const nextClassicStats = {
        ...previousStats,
        [gameType]: {
          bestScore: Math.max(score, Math.max(0, Math.floor(safeNum(gameStats.bestScore, 0)))),
          lastScore: score,
          lastDurationMs: durationMs,
          lastRunId: runId,
          lastSubmittedAt: submittedAt,
          totalRuns: Math.max(0, Math.floor(safeNum(gameStats.totalRuns, 0)) + 1),
          totalScore: Math.max(0, Math.floor(safeNum(gameStats.totalScore, 0)) + score),
          totalLevelPoints: Math.max(0, Math.floor(safeNum(gameStats.totalLevelPoints, 0)) + levelPoints)
        }
      };

      const progress = applyProgressionPatchInTransaction(tx, userRef, userData, {
        xpEarned: levelPoints,
        activityEarned,
        roundsEarned: 1,
        source: `CLASSIC_${gameType.toUpperCase()}`,
        referenceId: fingerprint,
        updatedAt: submittedAt
      });

      tx.set(userRef, {
        classicStats: nextClassicStats,
        lastClassicGameType: gameType,
        lastClassicScore: score,
        lastClassicRunId: runId,
        lastClassicSubmittedAt: submittedAt
      }, { merge: true });

      const canonical = progress.canonical;

      tx.create(runRef, {
        uid,
        gameType,
        runId,
        score,
        levelPoints,
        activityEarned,
        startedAt,
        endedAt,
        durationMs,
        createdAt: submittedAt
      });

      tx.set(signatureRef, {
        uid,
        gameType,
        score,
        lastRunId: runId,
        lastSubmittedAt: submittedAt
      }, { merge: true });

      return {
        ok: true,
        gameType,
        score,
        levelPoints,
        activityEarned,
        accountXp: canonical.accountXp,
        accountLevel: canonical.accountLevel,
        monthlyActiveScore: canonical.monthlyActiveScore,
        progression: canonical.progression || null,
        duplicate: false
      };
    });

    if (!result.ok) {
      const status = result.code === 'DUPLICATE_RUN' ? 409 : 429;
      return res.status(status).json(result);
    }

    if (result.levelPoints > 0) {
      recordRewardLedger({
        uid,
        amount: result.levelPoints,
        currency: 'XP',
        source: 'classic_score_progress',
        referenceId: fingerprint,
        idempotencyKey: `classic_score_progress:${fingerprint}`,
        meta: { gameType, score, runId, durationMs }
      }).catch(() => null);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Klasik skor kaydı oluşturulamadı.' });
  }
});

module.exports = router;
