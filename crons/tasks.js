// crons/tasks.js
'use strict';

const { db, admin } = require('../config/firebase');
const { safeNum, safeFloat, nowMs, cleanStr } = require('../utils/helpers');
const { recordRewardLedger } = require('../utils/rewardLedger');
const { createNotification } = require('../utils/notifications');
const { warnInactiveUsersAndCleanup } = require('../utils/userLifecycle');
const { cleanupRealtimeState } = require('../utils/realtimeState');
const { getSeasonCalendarParts, getPreviousSeasonKey } = require('../utils/season');
const {
  SEASON_RESET_CHECK_INTERVAL_MS,
  MONTHLY_REWARD_CHECK_INTERVAL_MS,
  MONTHLY_REWARD_VALUES,
  SEASON_RESET_BATCH_LIMIT,
  SEASON_RESET_STALE_LOCK_MS,
  SEASON_RESET_PAUSE_MS,
  COMPETITIVE_ELO_DEFAULT,
  LOBBY_CHAT_RETENTION_DAYS,
  DIRECT_CHAT_RETENTION_DAYS
} = require('../config/constants');

const colUsers = () => db.collection('users');
const colOnlinePisti = () => db.collection('pisti_online_rooms');
const colChess = () => db.collection('chess_rooms');
const colMines = () => db.collection('mines_sessions');
const colBJ = () => db.collection('bj_sessions');
const colJobs = () => db.collection('system_jobs');
const colLobbyChat = () => db.collection('lobby_chat');

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, safeNum(ms, 0))));

function getBlackjackStakeForRefund(session) {
  if (!session || !['playing', 'resolving'].includes(session.gameState)) return 0;
  const handsTotal = Array.isArray(session.hands) ? session.hands.reduce((sum, hand) => sum + safeNum(hand?.bet, 0), 0) : 0;
  return handsTotal + safeNum(session.insuranceBet, 0) + safeNum(session.totalSideBets, 0);
}


async function commitBatchOps(ops) {
  const MAX = 450;
  let batch = db.batch();
  let count = 0;
  const flush = async () => {
    if (count === 0) return;
    await batch.commit();
    batch = db.batch();
    count = 0;
  };
  for (const op of ops) {
    if (!op || !op.ref) continue;
    if (op.type === 'delete') batch.delete(op.ref);
    else if (op.type === 'update') batch.update(op.ref, op.data || {});
    else if (op.type === 'set') batch.set(op.ref, op.data || {}, op.options || { merge: true });
    count += 1;
    if (count >= MAX) await flush();
  }
  await flush();
}

async function acquireJobLock(jobName) {
  const ref = colJobs().doc(jobName);
  const now = nowMs();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const lockedUntil = safeNum(data.lockedUntil, 0);
    if (data.running && lockedUntil > now) return { acquired: false, ref, data };
    tx.set(ref, { ...data, running: true, lockedUntil: now + SEASON_RESET_STALE_LOCK_MS, startedAt: now }, { merge: true });
    return { acquired: true, ref, data };
  });
}

async function releaseJobLock(ref, updates = {}) {
  if (!ref) return;
  await ref.set({ running: false, lockedUntil: 0, finishedAt: nowMs(), ...updates }, { merge: true });
}

async function resetFieldForAllUsers(field, value, extraData = {}) {
  let lastDoc = null;
  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(SEASON_RESET_BATCH_LIMIT);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    const ops = snap.docs.map((doc) => ({ type: 'set', ref: doc.ref, data: { [field]: value, [`${field}ResetAt`]: nowMs(), ...(extraData && typeof extraData === 'object' ? extraData : {}) }, options: { merge: true } }));
    await commitBatchOps(ops);
    lastDoc = snap.docs[snap.docs.length - 1];
    await wait(SEASON_RESET_PAUSE_MS);
  }
}

async function processMonthlyRewardsIfNeeded() {
  const { seasonKey: currentSeasonKey } = getSeasonCalendarParts();
  const lock = await acquireJobLock('monthly_rewards');
  if (!lock.acquired) return;
  try {
    const alreadyProcessed = String(lock.data?.lastProcessedSeasonKey || '').trim();
    if (!alreadyProcessed) return await releaseJobLock(lock.ref, { lastProcessedSeasonKey: currentSeasonKey, initializedAt: nowMs() });
    if (alreadyProcessed === currentSeasonKey) return await releaseJobLock(lock.ref);

    const rewardMonthKey = getPreviousSeasonKey(currentSeasonKey);
    const topSnap = await colUsers().orderBy('monthlyActiveScore', 'desc').limit(MONTHLY_REWARD_VALUES.length).get();
    const ops = [];
    let awardedCount = 0;

    topSnap.docs.forEach((doc, index) => {
      const amount = safeNum(MONTHLY_REWARD_VALUES[index], 0);
      const score = safeNum(doc.data()?.monthlyActiveScore, 0);
      if (!amount || score <= 0) return;
      awardedCount += 1;
      ops.push({
        type: 'set',
        ref: doc.ref,
        data: {
          balance: admin.firestore.FieldValue.increment(amount),
          pendingReward: { rank: index + 1, amount, monthKey: rewardMonthKey, awardedAt: nowMs() },
          lastMonthlyRewardKey: rewardMonthKey,
          lastMonthlyRewardAmount: amount,
          lastMonthlyRewardRank: index + 1
        },
        options: { merge: true }
      });
    });

    if (ops.length) await commitBatchOps(ops);
    if (!topSnap.empty) {
      await Promise.allSettled(topSnap.docs.map((doc, index) => {
        const amount = safeNum(MONTHLY_REWARD_VALUES[index], 0);
        const score = safeNum(doc.data()?.monthlyActiveScore, 0);
        if (!amount || score <= 0) return Promise.resolve(null);
        return Promise.allSettled([
          recordRewardLedger({ uid: doc.id, amount, source: 'monthly_active_reward', referenceId: rewardMonthKey, meta: { rank: index + 1, score } }),
          createNotification({ uid: doc.id, type: 'reward', title: 'Aylık aktiflik ödülü', body: `${rewardMonthKey} dönemi için ${amount} MC hesabına eklendi.`, data: { source: 'monthly_active_reward', monthKey: rewardMonthKey, rank: index + 1, amount } })
        ]);
      }));
    }
    await resetFieldForAllUsers('monthlyActiveScore', 0, { activityPassClaimed: {}, activityPassClaimedSeasonKey: currentSeasonKey });
    await releaseJobLock(lock.ref, { lastProcessedSeasonKey: currentSeasonKey, lastRewardMonthKey: rewardMonthKey, lastAwardedCount: awardedCount });
  } catch (error) {
    console.error('CRON Aylık Ödül Hatası:', error);
    await releaseJobLock(lock.ref, { lastError: String(error?.message || error) });
  }
}

async function processSeasonResetIfNeeded() {
  const { seasonKey: currentSeasonKey } = getSeasonCalendarParts();
  const lock = await acquireJobLock('season_reset');
  if (!lock.acquired) return;
  try {
    const alreadyProcessed = String(lock.data?.lastProcessedSeasonKey || '').trim();
    if (!alreadyProcessed) return await releaseJobLock(lock.ref, { lastProcessedSeasonKey: currentSeasonKey, initializedAt: nowMs() });
    if (alreadyProcessed === currentSeasonKey) return await releaseJobLock(lock.ref);
    await resetFieldForAllUsers('seasonRp', 0, { seasonScore: 0, seasonRank: 'Bronze', seasonRankKey: 'bronze', seasonRankClass: 'rank-bronze' });
    await releaseJobLock(lock.ref, { lastProcessedSeasonKey: currentSeasonKey, chessEloBaseline: COMPETITIVE_ELO_DEFAULT });
  } catch (error) {
    console.error('CRON Sezon Reset Hatası:', error);
    await releaseJobLock(lock.ref, { lastError: String(error?.message || error) });
  }
}

async function cleanupStaleData() {
  try {
    const now = Date.now();
    const oldTime20Mins = now - (20 * 60 * 1000);
    const oldTime5Mins = now - (5 * 60 * 1000);
    const oldLobbyChat = now - (LOBBY_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const oldDirectChat = now - (DIRECT_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const ops = [];

    const pistiSnap = await colOnlinePisti().limit(250).get();
    pistiSnap.forEach((doc) => {
      const data = doc.data() || {};
      const updatedAt = safeNum(data.updatedAt, 0);
      const cleanupAt = safeNum(data.cleanupAt, 0);
      const status = cleanStr(data.status || '', 24);
      const shouldDeleteClosed = ['finished', 'abandoned'].includes(status) && cleanupAt > 0 && cleanupAt <= now;
      const shouldDeleteStale = ['waiting', 'playing'].includes(status) && updatedAt < oldTime20Mins;
      if (!shouldDeleteClosed && !shouldDeleteStale) return;
      if (shouldDeleteStale) {
        (data.players || []).forEach((player) => {
          if (player?.uid) ops.push({ type: 'update', ref: colUsers().doc(player.uid), data: { balance: admin.firestore.FieldValue.increment(safeNum(data.bet, 0)) } });
        });
      }
      ops.push({ type: 'delete', ref: doc.ref });
    });

    const chessSnap = await colChess().limit(500).get();
    chessSnap.forEach((doc) => {
      const data = doc.data() || {};
      const updatedAt = safeNum(data.updatedAt, 0);
      const cleanupAt = safeNum(data.cleanupAt, 0);
      const status = cleanStr(data.status || '', 24);
      const shouldDeleteClosed = ['finished', 'abandoned'].includes(status) && cleanupAt > 0 && cleanupAt <= now;
      const shouldDeleteStale = ['waiting', 'playing'].includes(status) && updatedAt < oldTime20Mins;
      if (shouldDeleteClosed || shouldDeleteStale) ops.push({ type: 'delete', ref: doc.ref });
    });

    const minesSnap = await colMines().where('updatedAt', '<', oldTime20Mins).limit(500).get();
    minesSnap.forEach((doc) => {
      const data = doc.data() || {};
      if (data.status === 'playing') {
        const refund = safeFloat(data.bet);
        if (refund > 0 && (data.uid || doc.id)) ops.push({ type: 'update', ref: colUsers().doc(data.uid || doc.id), data: { balance: admin.firestore.FieldValue.increment(refund) } });
      }
      ops.push({ type: 'delete', ref: doc.ref });
    });

    const bjSnap = await colBJ().where('lastActionAtMs', '<', oldTime20Mins).limit(500).get();
    bjSnap.forEach((doc) => {
      const data = doc.data() || {};
      const refund = getBlackjackStakeForRefund(data);
      if (refund > 0 && (data.uid || doc.id)) ops.push({ type: 'update', ref: colUsers().doc(data.uid || doc.id), data: { balance: admin.firestore.FieldValue.increment(refund) } });
      ops.push({ type: 'delete', ref: doc.ref });
    });

    const crashSnap = await db.collection('crash_bets').where('createdAt', '<', oldTime5Mins).limit(500).get();
    crashSnap.forEach((doc) => ops.push({ type: 'delete', ref: doc.ref }));

    const lobbySnap = await colLobbyChat().where('createdAt', '<', oldLobbyChat).limit(500).get();
    lobbySnap.forEach((doc) => ops.push({ type: 'delete', ref: doc.ref }));

    const dmMessagesSnap = await db.collectionGroup('messages').where('createdAt', '<', oldDirectChat).limit(500).get();
    dmMessagesSnap.forEach((doc) => {
      const parent = doc.ref.parent && doc.ref.parent.parent;
      if (parent && parent.parent && parent.parent.id === 'chats') {
        ops.push({ type: 'delete', ref: doc.ref });
      }
    });

    const staleChatsSnap = await db.collection('chats').where('lastUpdatedAt', '<', oldDirectChat).limit(150).get().catch(() => ({ docs: [] }));
    for (const chatDoc of staleChatsSnap.docs || []) {
      const msgSnap = await chatDoc.ref.collection('messages').limit(200).get().catch(() => ({ docs: [] }));
      if ((msgSnap.docs || []).length === 0) {
        ops.push({ type: 'delete', ref: chatDoc.ref });
      }
    }

    if (ops.length > 0) await commitBatchOps(ops);
    await cleanupRealtimeState().catch(() => null);
  } catch (error) {
    console.error('CRON Temizlik Hatası:', error);
  }
}

async function cleanupLongTermData() {
  try {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const bjHistorySnap = await db.collection('bj_history').where('createdAt', '<', oneWeekAgo).limit(500).get();
    if (!bjHistorySnap.empty) {
      const ops = bjHistorySnap.docs.map((doc) => ({ type: 'delete', ref: doc.ref }));
      await commitBatchOps(ops);
    }
  } catch (error) {
    console.error('Uzun Vadeli Temizlik Hatası (BJ History):', error);
  }
}

function initCrons() {
  setInterval(() => { cleanupStaleData().catch(() => null); }, 60 * 1000);
  setInterval(() => { cleanupLongTermData().catch(() => null); }, 60 * 60 * 1000);
  setInterval(() => { processMonthlyRewardsIfNeeded().catch(() => null); }, MONTHLY_REWARD_CHECK_INTERVAL_MS);
  setInterval(() => { processSeasonResetIfNeeded().catch(() => null); }, SEASON_RESET_CHECK_INTERVAL_MS);
  setInterval(() => { warnInactiveUsersAndCleanup().catch(() => null); }, 6 * 60 * 60 * 1000);

  setTimeout(() => { cleanupStaleData().catch(() => null); }, 10 * 1000).unref();
  setTimeout(() => { processMonthlyRewardsIfNeeded().catch(() => null); }, 20 * 1000).unref();
  setTimeout(() => { processSeasonResetIfNeeded().catch(() => null); }, 30 * 1000).unref();
  setTimeout(() => { warnInactiveUsersAndCleanup().catch(() => null); }, 40 * 1000).unref();
}

module.exports = { initCrons, getSeasonCalendarParts };