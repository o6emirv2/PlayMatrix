const express = require('express');
const { requireAuth } = require('../core/security');
const { creditBalance } = require('../core/economyService');
const { runtimeStore } = require('../core/runtimeStore');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { getProgression, normalizeXpBigInt } = require('../core/progressionService');
const { getWheelConfig, pickWeightedReward } = require('../core/wheelRuntimeService');
const { getWheelRights, consumeWheelRight } = require('../core/wheelRightsService');
const { recordRecentActivity } = require('../core/recentActivityService');
const router = express.Router();
function isEmailVerified(user = {}) { return !!(user.email_verified || user.emailVerified); }


const TTL_30_DAYS = 30 * 86400000;
const RECENT_WINNER_LIMIT = 20;

function istanbulParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => { if (part.type !== 'literal') acc[part.type] = part.value; return acc; }, {});
  return parts;
}

function istanbulDayKey(date = new Date()) {
  const p = istanbulParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function msUntilIstanbulNextDay() {
  const now = Date.now();
  const p = istanbulParts(new Date());
  const utcMidnightForNextIstanbulDay = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1, 21, 0, 0, 0);
  return Math.max(60_000, utcMidnightForNextIstanbulDay - now + 10_000);
}

async function pickReward() {
  const config = await getWheelConfig();
  return pickWeightedReward(config.rewards);
}

function safeName(value = '') {
  return String(value || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 28);
}

function rewardDisplay(reward = {}, settlement = {}) {
  const type = String(reward.type || settlement.type || 'mc').toLowerCase();
  if (type === 'xp') return `${Math.max(0, Math.trunc(Number(settlement.xp || reward.amount || 0))).toLocaleString('tr-TR')} XP`;
  if (type === 'badge') return `${safeName(reward.label || settlement.badgeId || reward.badgeId || 'Rozet')} rozeti`;
  return `${Math.max(0, Math.trunc(Number(settlement.amount || reward.amount || 0))).toLocaleString('tr-TR')} MC`;
}

function pushMemoryList(key, row, ttl = TTL_30_DAYS, limit = 60) {
  const current = runtimeStore.temporary.get(key) || [];
  const next = [row, ...current].slice(0, limit);
  runtimeStore.temporary.set(key, next, ttl);
  return next;
}

function notifyWheelWin(uid, username, reward = {}, settlement = {}) {
  if (!uid) return;
  const rewardAmount = Math.max(0, Math.trunc(Number(settlement.amount || reward.amount || 0)));
  const label = rewardDisplay(reward, settlement);
  const at = Date.now();
  const row = {
    id: `wheel_${at}_${Math.random().toString(36).slice(2)}`,
    type: 'personal',
    title: 'Günlük Çark Kazancı',
    message: `${safeName(username) || 'Oyuncu'} ${label} kazandı.`,
    icon: reward.type === 'xp' ? 'fa-star' : reward.type === 'badge' ? 'fa-medal' : 'fa-dharmachakra',
    amount: rewardAmount,
    rewardType: reward.type || 'mc',
    rewardLabel: label,
    at
  };
  pushMemoryList(`notify:personal:${uid}`, row, TTL_30_DAYS, 60);
  pushMemoryList(`account:tx:${uid}`, { id: row.id, title: 'Çark Ödülü', message: `${label} hesabına tanımlandı.`, icon: row.icon, amount: rewardAmount, rewardType: row.rewardType, at }, TTL_30_DAYS, 60);
  pushMemoryList(`account:game:${uid}`, { id: `${row.id}_game`, title: 'Günlük Çark', message: `${label} kazanç`, icon: 'fa-dharmachakra', amount: rewardAmount, rewardType: row.rewardType, at }, TTL_30_DAYS, 60);
}

function looksLikeEmailPrefixLeak(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.includes('@')) return true;
  return /^[0-9._+-]{4,}$/.test(raw);
}

function fallbackUsername(user = {}, preferred = '') {
  const candidates = [preferred, user.username, user.displayName, user.name, user.fullName];
  for (const candidate of candidates) {
    const direct = safeName(candidate || '');
    if (direct && !looksLikeEmailPrefixLeak(direct)) return direct;
  }
  const uid = String(user.uid || '').trim();
  return uid ? `Oyuncu-${uid.slice(-5)}` : 'Oyuncu';
}

async function resolveUsername(uid, user = {}, preferred = '') {
  const { db } = initFirebaseAdmin();
  if (db && uid) {
    try {
      const snap = await db.collection('users').doc(String(uid)).get();
      if (snap.exists) {
        const data = snap.data() || {};
        const resolved = fallbackUsername({ ...user, ...data, uid }, preferred || data.username || data.displayName || '');
        if (resolved) return resolved;
      }
    } catch (_) {}
  }
  return fallbackUsername({ ...user, uid }, preferred);
}
function wheelClaimDocId(uid = '', day = '') {
  return `${String(uid || '').replace(/[^A-Za-z0-9_-]/g, '_')}_${String(day || '').replace(/[^0-9-]/g, '')}`.slice(0, 180);
}
async function readWheelDailyClaim({ uid, day, key }) {
  if (runtimeStore.temporary.get(key)) return { claimed: true, source: 'runtime' };
  const { db } = initFirebaseAdmin();
  if (!db || !uid || !day) return { claimed: false, source: 'memory' };
  const snap = await db.collection('wheelClaims').doc(wheelClaimDocId(uid, day)).get().catch(() => null);
  if (!snap?.exists) return { claimed: false, source: 'firestore' };
  const data = snap.data() || {};
  return { claimed: data.status !== 'failed', source: 'firestore', data };
}
async function reserveWheelDailyClaim({ uid, day, key }) {
  const { db } = initFirebaseAdmin();
  const at = Date.now();
  if (!db) {
    if (runtimeStore.temporary.get(key)) return { ok: false, alreadyClaimed: true };
    runtimeStore.temporary.set(key, { uid, day, status: 'pending', at }, msUntilIstanbulNextDay());
    return { ok: true, claimId: key, memoryOnly: true };
  }
  const claimId = wheelClaimDocId(uid, day);
  const claimRef = db.collection('wheelClaims').doc(claimId);
  let output = { ok: false, alreadyClaimed: true };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(claimRef);
    if (snap.exists && snap.data()?.status !== 'failed') {
      output = { ok: false, alreadyClaimed: true, claim: snap.data() || {} };
      return;
    }
    tx.set(claimRef, { uid, day, key, status: 'pending', createdAt: at, updatedAt: at }, { merge: false });
    output = { ok: true, claimId, claimRefPath: claimRef.path };
  });
  return output;
}
async function finalizeWheelDailyClaim({ uid, day, key, reward = {}, settlement = {}, index = 0 }) {
  const at = Date.now();
  runtimeStore.temporary.set(key, { uid, day, reward: Math.max(0, Math.trunc(Number(settlement.amount || reward.amount || 0))), type: reward.type || 'mc', status: 'final', at }, msUntilIstanbulNextDay());
  const { db } = initFirebaseAdmin();
  if (!db) return;
  const claimRef = db.collection('wheelClaims').doc(wheelClaimDocId(uid, day));
  await claimRef.set({ uid, day, key, status: settlement?.ok === false ? 'failed' : 'final', reward: { id: reward.id || '', type: reward.type || 'mc', amount: Math.max(0, Math.trunc(Number(reward.amount || 0))), index }, settlement: { amount: settlement.amount || 0, xp: settlement.xp || 0, badgeId: settlement.badgeId || '', balance: settlement.balance ?? null }, finalizedAt: at, updatedAt: at }, { merge: true }).catch(() => null);
}
async function applyWheelReward({ uid, reward, key }) {
  const type = String(reward?.type || 'mc').toLowerCase();
  const amount = Math.max(0, Math.trunc(Number(reward?.amount || 0)));
  const { db } = initFirebaseAdmin();
  if (type === 'xp') {
    const output = { ok: true, xp: amount, amount: 0, balance: null };
    if (!db) return output;
    const userRef = db.collection('users').doc(String(uid));
    const idemRef = db.collection('idempotency').doc(`${key}:xp`);
    await db.runTransaction(async (tx) => {
      const idem = await tx.get(idemRef);
      if (idem.exists) { Object.assign(output, idem.data()?.result || { ok: true, duplicate: true, xp: 0, amount: 0 }); return; }
      const snap = await tx.get(userRef);
      const data = snap.exists ? snap.data() || {} : {};
      const before = getProgression(data.accountXp ?? data.xp ?? 0);
      const xpToAdd = before.isMaxLevel ? 0 : amount;
      const next = normalizeXpBigInt(data.accountXp ?? data.xp ?? 0) + BigInt(xpToAdd);
      const progression = getProgression(next);
      tx.set(userRef, { xp: progression.xp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression, updatedAt: Date.now() }, { merge: true });
      output.xp = xpToAdd;
      output.progression = progression;
      tx.set(idemRef, { key: `${key}:xp`, type: 'wheel-xp', uid, createdAt: Date.now(), result: { ...output } }, { merge: false });
    });
    return output;
  }
  if (type === 'badge') {
    if (db) {
      const idemRef = db.collection('idempotency').doc(`${key}:badge`);
      const userRef = db.collection('users').doc(String(uid));
      let out = { ok: true, amount: 0, badgeId: String(reward.badgeId || reward.id || '') };
      await db.runTransaction(async (tx) => {
        const idem = await tx.get(idemRef);
        if (idem.exists) { out = idem.data()?.result || out; return; }
        tx.set(userRef, { wheelBadges: { [String(reward.badgeId || reward.id || 'wheel-badge')]: { grantedAt: Date.now() } }, updatedAt: Date.now() }, { merge: true });
        tx.set(idemRef, { key: `${key}:badge`, type: 'wheel-badge', uid, createdAt: Date.now(), result: out }, { merge: false });
      });
      return out;
    }
    return { ok: true, amount: 0, badgeId: String(reward.badgeId || reward.id || '') };
  }
  return creditBalance({ uid, amount, reason: 'daily-wheel', idempotencyKey: key });
}


function recordRecentWinner({ uid, username, amount, reward = {}, settlement = {} }) {
  const row = {
    uid: String(uid || ''),
    username: safeName(username) || 'Oyuncu',
    amount: Math.max(0, Math.trunc(Number(amount || 0))),
    rewardType: reward.type || 'mc',
    rewardLabel: rewardDisplay(reward, settlement),
    xp: settlement.xp || 0,
    badgeId: settlement.badgeId || '',
    at: Date.now()
  };
  const current = runtimeStore.temporary.get('wheel:recentWinners') || [];
  const next = [row, ...current].slice(0, RECENT_WINNER_LIMIT);
  runtimeStore.temporary.set('wheel:recentWinners', next, TTL_30_DAYS);
  return row;
}

function recentPayload(limit = RECENT_WINNER_LIMIT) {
  return (runtimeStore.temporary.get('wheel:recentWinners') || []).slice(0, limit).map((item) => ({ ...item }));
}

router.get('/wheel/config', async (_req, res) => {
  const config = await getWheelConfig();
  const totalWeight = config.rewards.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 1;
  res.json({
    ok: true,
    memoryOnly: config.source !== 'firestore',
    active: config.active !== false,
    resetTimezone: 'Europe/Istanbul',
    reset: '00:00',
    rewards: config.rewards.map((reward, index) => ({ ...reward, index, probability: Number(reward.weight || 0) / totalWeight })),
    recentWinners: recentPayload(5)
  });
});

router.get('/wheel/recent-winners', (_req, res) => {
  res.json({ ok: true, memoryOnly: true, items: recentPayload(20) });
});

router.get('/wheel/status', requireAuth, async (req, res) => {
  const config = await getWheelConfig();
  const uid = req.user.uid;
  const day = istanbulDayKey();
  const key = `wheel:${uid}:${day}`;
  const claimState = await readWheelDailyClaim({ uid, day, key });
  const claimed = !!claimState.claimed;
  const extraRights = await getWheelRights(uid).catch(() => 0);
  const active = config.active !== false;
  res.json({ ok: true, memoryOnly: claimState.source !== 'firestore', enabled: active, active, claimed, extraRights, canSpin: active && (!claimed || extraRights > 0), day, reset: '00:00', resetTimezone: 'Europe/Istanbul' });
});

router.post('/wheel/spin', requireAuth, async (req, res) => {
  const config = await getWheelConfig();
  if (config.active === false) return res.status(503).json({ ok: false, error: 'WHEEL_OFFLINE' });
  if (!isEmailVerified(req.user)) return res.status(403).json({ ok: false, error: 'EMAIL_VERIFICATION_REQUIRED' });
  const uid = req.user.uid;
  const day = istanbulDayKey();
  const key = `wheel:${uid}:${day}`;
  const claimState = await readWheelDailyClaim({ uid, day, key });
  let usedExtraRight = false;
  let extraRights = await getWheelRights(uid).catch(() => 0);
  let spinKey = key;
  let dailyReservation = null;
  if (claimState.claimed) {
    if (extraRights <= 0) return res.status(409).json({ ok: false, error: 'WHEEL_ALREADY_CLAIMED_TODAY', day, extraRights: 0 });
    spinKey = `wheel:${uid}:${day}:extra:${String(req.body?.idempotencyKey || req.body?.correlationId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const consumed = await consumeWheelRight({ uid, reason: 'wheel-spin-extra', claimKey: spinKey });
    if (!consumed.ok) return res.status(409).json({ ok: false, error: consumed.error || 'NO_EXTRA_WHEEL_RIGHTS', day, extraRights: 0 });
    usedExtraRight = true;
    extraRights = consumed.remaining || 0;
  } else {
    dailyReservation = await reserveWheelDailyClaim({ uid, day, key });
    if (!dailyReservation.ok) return res.status(409).json({ ok: false, error: 'WHEEL_ALREADY_CLAIMED_TODAY', day, extraRights });
  }
  const reward = await pickReward();
  const index = Math.max(0, (config.rewards || []).findIndex((item) => item.id === reward.id));
  const settlement = await applyWheelReward({ uid, reward, key: spinKey });
  if (!settlement.ok) {
    if (dailyReservation?.ok) await finalizeWheelDailyClaim({ uid, day, key, reward, settlement: { ...settlement, ok: false }, index });
    return res.status(400).json(settlement);
  }
  const amount = Math.max(0, Math.trunc(Number(reward.amount || settlement.amount || 0)));
  if (dailyReservation?.ok) await finalizeWheelDailyClaim({ uid, day, key, reward, settlement, index });
  const username = await resolveUsername(uid, req.user, req.body?.username || req.body?.displayName || '');
  const winner = recordRecentWinner({ uid, username, amount, reward, settlement });
  recordRecentActivity({ id: `wheel:${uid}:${Date.now()}`, source: 'wheel', game: 'wheel', title: 'Çark Kazancı', username, uid, amount, xp: settlement.xp || 0, rewardType: reward.type || 'mc', rewardLabel: rewardDisplay(reward, settlement), outcome: usedExtraRight ? 'extra-right' : 'daily-right' });
  notifyWheelWin(uid, username, reward, settlement);
  res.json({ ok: true, memoryOnly: true, day, reward: amount, prize: amount, amount, type: reward.type || 'mc', xp: settlement.xp || 0, badgeId: settlement.badgeId || '', index, winner, recentWinners: recentPayload(5), lastSpin: Date.now(), lastSpinAt: Date.now(), balance: settlement.balance, usedExtraRight, extraRights });
});

module.exports = router;
