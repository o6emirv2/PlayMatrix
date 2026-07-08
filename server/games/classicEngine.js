const express = require('express');
const crypto = require('crypto');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { getProgression, normalizeXpBigInt } = require('../core/progressionService');
const { requireAuth } = require('../core/security');
const { recordRecentActivity, displayGameName } = require('../core/recentActivityService');

const DAILY_CLASSIC_XP_CAP = 100_000;
const EVENT_TIMELINE_MAX_ITEMS = 600;
const EVENT_TIMELINE_MAX_BYTES = 32768;
const RUN_TTL_MS = 6 * 3600000;
const DONE_TTL_MS = 30 * 86400000;

function gameConfig(game) {
  const map = {
    'pattern-master': { maxScore: 1000000, xpPerPoint: 1, maxXpPerRun: 1000, minDurationMs: 3000, maxScorePerMinute: 25000 },
    'space-pro': { maxScore: 1000000, xpPerPoint: 1, maxXpPerRun: 1000, minDurationMs: 3000, maxScorePerMinute: 120000 },
    'snake-pro': { maxScore: 1000000, xpPerPoint: 1, maxXpPerRun: 1000, minDurationMs: 3000, maxScorePerMinute: 60000 }
  };
  return map[game] || map['pattern-master'];
}

function istanbulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((acc, part) => { if (part.type !== 'literal') acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function msUntilIstanbulNextDay() {
  const now = Date.now();
  const p = istanbulDateKey().split('-').map(Number);
  const nextIstanbulMidnightUtc = Date.UTC(p[0], p[1] - 1, p[2] + 1, 21, 0, 0, 0);
  return Math.max(60_000, nextIstanbulMidnightUtc - now + 10_000);
}

function validateEventTimeline(value = null) {
  const encodedSize = Buffer.byteLength(JSON.stringify(value || []), 'utf8');
  if (encodedSize > EVENT_TIMELINE_MAX_BYTES) return { ok: false, code: 'PAYLOAD_TOO_LARGE', suspiciousReasons: ['TIMELINE_PAYLOAD_TOO_LARGE'] };
  const timeline = Array.isArray(value) ? value.slice(0, EVENT_TIMELINE_MAX_ITEMS) : [];
  if (!timeline.length) return { ok: false, code: 'EVENT_TIMELINE_REQUIRED', suspiciousReasons: ['EVENT_TIMELINE_REQUIRED'] };
  let lastTs = -1;
  for (const event of timeline) {
    const ts = Number(event?.t ?? event?.time ?? event?.at ?? 0);
    if (!Number.isFinite(ts) || ts < 0) return { ok: false, code: 'EVENT_TIMELINE_INVALID', suspiciousReasons: ['EVENT_TIMELINE_INVALID'] };
    if (ts < lastTs) return { ok: false, code: 'EVENT_TIMELINE_ORDER_INVALID', suspiciousReasons: ['EVENT_TIMELINE_ORDER_INVALID'] };
    lastTs = ts;
  }
  return { ok: true, eventCount: timeline.length, payloadBytes: encodedSize };
}

function calculateXp(game, score, durationMs, metrics = {}, timelineResult = { ok: true }) {
  const cfg = gameConfig(game);
  const safeScore = Math.max(0, Math.min(cfg.maxScore, Math.trunc(Number(score) || 0)));
  const safeDuration = Math.max(0, Math.trunc(Number(durationMs) || 0));
  const seconds = Math.max(1, safeDuration / 1000);
  const scorePerMinute = safeScore / (seconds / 60);
  const suspiciousReasons = [];
  if (safeDuration < cfg.minDurationMs && safeScore > 0) suspiciousReasons.push('DURATION_TOO_SHORT');
  if (scorePerMinute > cfg.maxScorePerMinute) suspiciousReasons.push('SCORE_SPEED_TOO_HIGH');
  if (safeScore >= cfg.maxScore) suspiciousReasons.push('SCORE_CLAMPED_TO_MAX');
  if (!timelineResult.ok) suspiciousReasons.push(...(timelineResult.suspiciousReasons || ['EVENT_TIMELINE_INVALID']));
  const metricBonus = Math.max(0, Math.trunc(Number(metrics?.combo || metrics?.level || metrics?.survivalSeconds || metrics?.foodCount || 0) || 0));
  const rawXp = Math.floor((safeScore * cfg.xpPerPoint) + Math.min(metricBonus, cfg.maxXpPerRun / 4));
  const xp = suspiciousReasons.length ? 0 : Math.min(cfg.maxXpPerRun, Math.max(0, rawXp));
  return { score: safeScore, durationMs: safeDuration, xp, suspicious: suspiciousReasons.length > 0, suspiciousReasons, dailyCap: DAILY_CLASSIC_XP_CAP, maxXpPerRun: cfg.maxXpPerRun };
}

function mergeClassicStats(existing = {}, game, score) {
  const total = existing.total && typeof existing.total === 'object' ? { ...existing.total } : {};
  const classic = existing.classic && typeof existing.classic === 'object' ? { ...existing.classic } : {};
  const gameStats = existing[game] && typeof existing[game] === 'object' ? { ...existing[game] } : {};
  const nextTotalRounds = Math.max(0, Number(total.rounds || 0)) + 1;
  const nextClassicRounds = Math.max(0, Number(classic.rounds || 0)) + 1;
  const nextGameRounds = Math.max(0, Number(gameStats.rounds || 0)) + 1;
  return {
    ...existing,
    total: { ...total, rounds: nextTotalRounds, games: nextTotalRounds, score: Math.max(0, Number(total.score || 0)) + score, highScore: Math.max(Number(total.highScore || 0), score) },
    classic: { ...classic, rounds: nextClassicRounds, games: nextClassicRounds, score: Math.max(0, Number(classic.score || 0)) + score, highScore: Math.max(Number(classic.highScore || 0), score) },
    [game]: { ...gameStats, rounds: nextGameRounds, games: nextGameRounds, score: Math.max(0, Number(gameStats.score || 0)) + score, highScore: Math.max(Number(gameStats.highScore || 0), score), lastScore: score, updatedAt: Date.now() }
  };
}

function pushMemoryList(key, row, ttl = 30 * 86400000, limit = 80) {
  const current = runtimeStore.temporary.get(key) || [];
  const next = [row, ...current].slice(0, limit);
  runtimeStore.temporary.set(key, next, ttl);
  return next;
}

function pushClassicGameMemory(uid, game, score, xp, progression, capInfo = {}) {
  if (!uid) return;
  const capText = capInfo.xpLocked ? ' Maksimum seviyedesin; XP eklenmedi.' : capInfo.remainingDailyXp === 0 ? ' Günlük klasik XP limitine ulaştın.' : '';
  pushMemoryList(`account:game:${uid}`, {
    id: `classic_${game}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    title: `${game} skoru`,
    message: `${score.toLocaleString('tr-TR')} skor ile +${xp.toLocaleString('tr-TR')} XP işlendi.${capText}`,
    game,
    score,
    xp,
    level: progression?.level || progression?.accountLevel || 1,
    icon: 'fa-gamepad',
    at: Date.now()
  }, 30 * 86400000, 80);
}

function buildRunToken() {
  return crypto.randomBytes(18).toString('hex');
}

function safeRunId(game) {
  return `${game}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function applyDailyCapRuntime(uid, requestedXp) {
  const dateKey = istanbulDateKey();
  const key = `classic:daily-xp:${dateKey}:${uid}`;
  const used = Math.max(0, Math.trunc(Number(runtimeStore.temporary.get(key) || 0)));
  const remaining = Math.max(0, DAILY_CLASSIC_XP_CAP - used);
  const awarded = Math.min(Math.max(0, requestedXp), remaining);
  runtimeStore.temporary.set(key, String(used + awarded), msUntilIstanbulNextDay());
  return { dateKey, usedBefore: used, awarded, usedAfter: used + awarded, remainingDailyXp: Math.max(0, DAILY_CLASSIC_XP_CAP - used - awarded), dailyCap: DAILY_CLASSIC_XP_CAP };
}

function createClassicRouter(game) {
  const router = express.Router();

  function startRun(req, res) {
    const runId = safeRunId(game);
    const runToken = buildRunToken();
    const uid = String(req.user?.uid || '');
    const startedAt = Date.now();
    runtimeStore.temporary.set(`classic:${runId}`, { game, uid, runToken, startedAt, finished: false }, RUN_TTL_MS);
    res.json({ ok: true, game, runId, runToken, startedAt, authenticated: true, dailyClassicXpCap: DAILY_CLASSIC_XP_CAP, maxXpPerRun: gameConfig(game).maxXpPerRun });
  }

  router.get('/start', requireAuth, startRun);
  router.post('/start', requireAuth, startRun);
  router.post('/submit', requireAuth, async (req, res) => {
    const runId = String(req.body.runId || '').trim();
    const runToken = String(req.body.runToken || req.headers['x-classic-run-token'] || '').trim();
    if (!runId) return res.status(400).json({ ok: false, error: 'RUN_ID_REQUIRED', message: 'Oyun oturumu doğrulanamadı. Lütfen oyunu yeniden başlat.' });
    if (!runToken) return res.status(401).json({ ok: false, error: 'RUN_TOKEN_REQUIRED', message: 'Oyun oturumu doğrulanamadı. Lütfen oyunu yeniden başlat.' });
    const done = runtimeStore.temporary.get(`classic:done:${runId}`);
    if (done) return res.json({ ok: true, duplicate: true, ...done });
    const run = runtimeStore.temporary.get(`classic:${runId}`);
    const uid = String(req.user?.uid || '');
    if (!run || run.game !== game) return res.status(404).json({ ok: false, error: 'RUN_NOT_FOUND', message: 'Oyun oturumu bulunamadı. Lütfen oyunu yeniden başlat.' });
    if (run.uid !== uid) return res.status(403).json({ ok: false, error: 'RUN_OWNER_MISMATCH', message: 'Bu oyun oturumu hesabınla eşleşmiyor.' });
    if (run.runToken !== runToken) return res.status(403).json({ ok: false, error: 'RUN_TOKEN_INVALID', message: 'Oyun oturumu doğrulanamadı. Lütfen oyunu yeniden başlat.' });
    if (run.finished) return res.json({ ok: true, duplicate: true, ...(runtimeStore.temporary.get(`classic:done:${runId}`) || { game, runId }) });

    const backendDurationMs = Math.max(0, Date.now() - Number(run.startedAt || Date.now()));
    const clientDurationMs = Math.max(0, Math.trunc(Number(req.body?.durationMs || 0)));
    const durationMs = Math.max(backendDurationMs, clientDurationMs);
    const timelineResult = validateEventTimeline(req.body.eventTimeline || req.body.timeline || req.body.events || null);
    if (!timelineResult.ok && timelineResult.code === 'PAYLOAD_TOO_LARGE') return res.status(413).json({ ok: false, error: 'PAYLOAD_TOO_LARGE', code: 'PAYLOAD_TOO_LARGE', message: 'Oyun sonucu çok büyük. Lütfen oyunu tekrar başlat.' });
    const calc = calculateXp(game, req.body.score, durationMs, req.body.metrics || {}, timelineResult);
    let progression = getProgression(0);
    let xpAwarded = 0;
    let capInfo = { dailyCap: DAILY_CLASSIC_XP_CAP, remainingDailyXp: DAILY_CLASSIC_XP_CAP };

    if (calc.xp > 0) {
      const { db, admin } = initFirebaseAdmin();
      if (db && admin) {
        const userRef = db.collection('users').doc(uid);
        const runRef = db.collection('classicGameRuns').doc(runId);
        const dateKey = istanbulDateKey();
        const dailyRef = db.collection('classicDailyXp').doc(`${uid}_${dateKey}`);
        await db.runTransaction(async (tx) => {
          const runSnap = await tx.get(runRef);
          if (runSnap.exists) {
            const data = runSnap.data() || {};
            xpAwarded = Math.max(0, Number(data.xp || data.xpAwarded || 0));
            progression = data.progression || getProgression(0);
            capInfo = data.capInfo || capInfo;
            return;
          }
          const snap = await tx.get(userRef);
          const dailySnap = await tx.get(dailyRef);
          const data = snap.exists ? (snap.data() || {}) : {};
          const current = normalizeXpBigInt(data.xp ?? data.accountXp ?? 0);
          const currentProgression = getProgression(current);
          const usedDaily = Math.max(0, Number(dailySnap.exists ? (dailySnap.data().usedXp || 0) : 0));
          const remaining = Math.max(0, DAILY_CLASSIC_XP_CAP - usedDaily);
          xpAwarded = currentProgression.isMaxLevel ? 0 : Math.min(calc.xp, remaining);
          const next = current + BigInt(xpAwarded);
          progression = getProgression(next);
          capInfo = { dateKey, dailyCap: DAILY_CLASSIC_XP_CAP, usedBefore: usedDaily, usedAfter: usedDaily + xpAwarded, remainingDailyXp: Math.max(0, remaining - xpAwarded), xpLocked: currentProgression.isMaxLevel };
          const gameStats = mergeClassicStats(data.gameStats || {}, game, calc.score);
          tx.set(userRef, { xp: progression.xp, accountXp: progression.xp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.progressPercent, progression, gameStats, monthlyActiveScore: Math.max(0, Number(data.monthlyActiveScore || 0)) + 1, updatedAt: Date.now() }, { merge: true });
          tx.set(dailyRef, { uid, dateKey, usedXp: usedDaily + xpAwarded, dailyCap: DAILY_CLASSIC_XP_CAP, updatedAt: Date.now(), expiresAt: Date.now() + 3 * 86400000 }, { merge: true });
          tx.set(runRef, { uid, game, score: calc.score, durationMs: calc.durationMs, xp: xpAwarded, requestedXp: calc.xp, levelPoints: xpAwarded, suspicious: calc.suspicious, suspiciousReasons: calc.suspiciousReasons, eventTimeline: { ok: timelineResult.ok, eventCount: timelineResult.eventCount || 0, payloadBytes: timelineResult.payloadBytes || 0 }, progression, capInfo, at: Date.now() }, { merge: false });
          if (xpAwarded > 0) tx.set(db.collection('ledger').doc(`classic_xp_${runId}`), { uid, operationType: `classic-xp:${game}`, type: 'classic-xp', amount: xpAwarded, idempotencyKey: runId, createdAt: Date.now(), at: Date.now() }, { merge: false });
        });
      } else {
        const key = `xp:${uid}`;
        const current = normalizeXpBigInt(runtimeStore.temporary.get(key) || 0);
        const currentProgression = getProgression(current);
        capInfo = applyDailyCapRuntime(uid, currentProgression.isMaxLevel ? 0 : calc.xp);
        capInfo.xpLocked = currentProgression.isMaxLevel;
        xpAwarded = capInfo.awarded;
        const next = current + BigInt(xpAwarded);
        runtimeStore.temporary.set(key, next.toString(), 30 * 86400000);
        progression = getProgression(next);
      }
    } else {
      progression = getProgression(0);
    }

    const result = { game, runId, score: calc.score, durationMs: calc.durationMs, xpAwarded, levelPoints: xpAwarded, requestedXp: calc.xp, suspicious: calc.suspicious, suspiciousReasons: calc.suspiciousReasons, eventTimeline: { ok: timelineResult.ok, eventCount: timelineResult.eventCount || 0, payloadBytes: timelineResult.payloadBytes || 0 }, progression, capInfo, dailyClassicXpCap: DAILY_CLASSIC_XP_CAP, maxXpPerRun: calc.maxXpPerRun, authRequiredForXp: false };
    const currentMemoryStats = runtimeStore.temporary.get(`gameStats:${uid}`) || {};
    runtimeStore.temporary.set(`gameStats:${uid}`, mergeClassicStats(currentMemoryStats, game, calc.score), 30 * 86400000);
    pushClassicGameMemory(uid, game, calc.score, result.xpAwarded, progression, capInfo);
    recordRecentActivity({ id: `classic:${game}:${runId}:${uid}`, source: game, game, title: `${displayGameName(game)} Skor Kazancı`, username: req.user?.username || req.user?.displayName || 'Oyuncu', uid, score: calc.score, xp: result.xpAwarded, outcome: 'score-submit', rewardLabel: `${calc.score.toLocaleString('tr-TR')} skor • +${result.xpAwarded.toLocaleString('tr-TR')} XP` });
    runtimeStore.temporary.set(`classic:done:${runId}`, result, DONE_TTL_MS);
    runtimeStore.temporary.set(`classic:${runId}`, { ...run, finished: true, finishedAt: Date.now() }, DONE_TTL_MS);
    res.json({ ok: true, ...result });
  });
  return router;
}

module.exports = { createClassicRouter, calculateXp, gameConfig, DAILY_CLASSIC_XP_CAP };
