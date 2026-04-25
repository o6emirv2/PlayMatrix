'use strict';

const { db, admin, isFirebaseReady, getFirebaseStatus } = require('../config/firebase');
const { safeNum, nowMs, cleanStr } = require('../utils/helpers');
const { writeLine, serializeError } = require('../utils/logger');
const { grantReward } = require('../utils/rewardService');
const { warnInactiveUsersAndCleanup } = require('../utils/userLifecycle');
const { cleanupRealtimeState } = require('../utils/realtimeState');
const { getPreviousActivityPeriodKey } = require('../utils/activityPeriod');
const { getRewardLadder } = require('../config/rewardCatalog');
const { getActivityResetWindowMeta } = require('../utils/platformControl');
const { buildActivityResetState } = require('../utils/progression');
const {
  ACTIVITY_RESET_CHECK_INTERVAL_MS,
  MONTHLY_REWARD_CHECK_INTERVAL_MS,
  ACTIVITY_RESET_BATCH_LIMIT,
  ACTIVITY_RESET_STALE_LOCK_MS,
  ACTIVITY_RESET_PAUSE_MS,
  LOBBY_CHAT_RETENTION_DAYS,
  DIRECT_CHAT_RETENTION_DAYS,
  CHAT_RETENTION_POLICY
} = require('../config/constants');

const colUsers = () => db.collection('users');
const colChess = () => db.collection('chess_rooms');
const colJobs = () => db.collection('system_jobs');
const colLobbyChat = () => db.collection('lobby_chat');

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, safeNum(ms, 0))));



const cronSkipLogAt = new Map();

function shouldRunFirebaseCron(jobName) {
  if (typeof isFirebaseReady !== 'function' || isFirebaseReady()) return true;
  const now = nowMs();
  const lastLogAt = safeNum(cronSkipLogAt.get(jobName), 0);
  if (!lastLogAt || now - lastLogAt > 5 * 60 * 1000) {
    cronSkipLogAt.set(jobName, now);
    writeLine('warn', 'cron_skipped_firebase_admin_unavailable', {
      job: jobName,
      firebase: typeof getFirebaseStatus === 'function' ? getFirebaseStatus() : { ready: false }
    });
  }
  return false;
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
    tx.set(ref, { ...data, running: true, lockedUntil: now + ACTIVITY_RESET_STALE_LOCK_MS, startedAt: now }, { merge: true });
    return { acquired: true, ref, data };
  });
}

async function releaseJobLock(ref, updates = {}) {
  if (!ref) return;
  await ref.set({ running: false, lockedUntil: 0, finishedAt: nowMs(), ...updates }, { merge: true });
}

function buildJobWindowState(lockData = {}, resetMeta = {}, extras = {}) {
  return {
    initializedAt: safeNum(lockData?.initializedAt, nowMs()),
    observedPeriodKey: String(resetMeta.currentPeriodKey || '').trim() || null,
    previousPeriodKey: String(resetMeta.previousPeriodKey || '').trim() || null,
    rewardMonthKey: String(resetMeta.rewardMonthKey || '').trim() || null,
    activityWindowOpenedAt: safeNum(resetMeta.resetAt, 0),
    activityWindowClosesAt: safeNum(resetMeta.activityWindowClosesAt, 0),
    monthlyWindowClosesAt: safeNum(resetMeta.monthlyWindowClosesAt, 0),
    ...extras
  };
}

async function hasMonthlyRewardsRecordedForMonth(monthKey = '') {
  const safeMonthKey = String(monthKey || '').trim();
  if (!safeMonthKey) return false;
  const snap = await colUsers().where('lastMonthlyRewardKey', '==', safeMonthKey).limit(1).get();
  return !snap.empty;
}

async function resetMonthlyActivityForNewPeriod(currentPeriodKey = '') {
  let lastDoc = null;
  const resetAt = nowMs();
  const resetState = buildActivityResetState(currentPeriodKey, { resetAt });
  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(ACTIVITY_RESET_BATCH_LIMIT);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    const ops = snap.docs.map((doc) => ({
      type: 'set',
      ref: doc.ref,
      data: resetState,
      options: { merge: true }
    }));
    await commitBatchOps(ops);
    lastDoc = snap.docs[snap.docs.length - 1];
    await wait(ACTIVITY_RESET_PAUSE_MS);
  }
}

async function resetActivityPresentationForNewPeriod(currentPeriodKey = '') {
  let lastDoc = null;
  const resetAt = nowMs();
  const resetState = buildActivityResetState(currentPeriodKey, { resetAt, resetActivityPass: false, includePresentationResetAt: true });
  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(ACTIVITY_RESET_BATCH_LIMIT);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    const ops = snap.docs.map((doc) => ({
      type: 'set',
      ref: doc.ref,
      data: resetState,
      options: { merge: true }
    }));
    await commitBatchOps(ops);
    lastDoc = snap.docs[snap.docs.length - 1];
    await wait(ACTIVITY_RESET_PAUSE_MS);
  }
}

async function processMonthlyRewardsIfNeeded() {
  if (!shouldRunFirebaseCron('monthly_rewards')) return;
  const resetMeta = getActivityResetWindowMeta();
  const currentPeriodKey = resetMeta.currentPeriodKey;
  const rewardMonthKey = resetMeta.previousPeriodKey || getPreviousActivityPeriodKey(currentPeriodKey);
  const monthlyRewardLadder = getRewardLadder('monthly_active_reward');
  const lock = await acquireJobLock('monthly_rewards');
  if (!lock.acquired) return;
  try {
    const alreadyProcessed = String(lock.data?.lastProcessedPeriodKey || '').trim();
    const lastRewardMonthKey = String(lock.data?.lastRewardMonthKey || '').trim();
    const alreadyRecordedForMonth = lastRewardMonthKey === rewardMonthKey || await hasMonthlyRewardsRecordedForMonth(rewardMonthKey);

    if (alreadyProcessed === currentPeriodKey) {
      return await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, {
        lastProcessedPeriodKey: currentPeriodKey,
        lastRewardMonthKey: rewardMonthKey,
        alreadyRecordedForMonth
      }));
    }

    if (alreadyRecordedForMonth) {
      return await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, {
        lastProcessedPeriodKey: currentPeriodKey,
        lastRewardMonthKey: rewardMonthKey,
        alreadyRecordedForMonth,
        waitReason: null
      }));
    }

    if (!resetMeta.isMonthlyRewardWindowOpen) {
      return await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, {
        deferredPeriodKey: currentPeriodKey,
        deferredRewardMonthKey: rewardMonthKey,
        deferredUntilWindow: resetMeta.monthlyWindowClosesAt,
        waitReason: 'monthly_reward_window_closed'
      }));
    }

    const topSnap = await colUsers().orderBy('monthlyActiveScore', 'desc').limit(monthlyRewardLadder.length).get();
    const awardedAt = nowMs();
    const eligibleRewards = topSnap.docs.map((doc, index) => {
      const amount = safeNum(monthlyRewardLadder[index], 0);
      const score = safeNum(doc.data()?.monthlyActiveScore, 0);
      if (!amount || score <= 0) return null;
      return { doc, rank: index + 1, amount, score };
    }).filter(Boolean);

    const grantResults = await Promise.allSettled(eligibleRewards.map((item) => grantReward({
      uid: item.doc.id,
      amount: item.amount,
      source: 'monthly_active_reward',
      referenceId: rewardMonthKey,
      idempotencyKey: `monthly_active_reward:${rewardMonthKey}:${item.doc.id}`,
      meta: { monthKey: rewardMonthKey, rank: item.rank, score: item.score },
      userPatch: {
        pendingReward: { rank: item.rank, amount: item.amount, monthKey: rewardMonthKey, awardedAt },
        lastMonthlyRewardKey: rewardMonthKey,
        lastMonthlyRewardAmount: item.amount,
        lastMonthlyRewardRank: item.rank,
        lastMonthlyRewardAwardedAt: awardedAt
      },
      notification: {
        data: { monthKey: rewardMonthKey, rank: item.rank, score: item.score }
      }
    })));

    const failedGrant = grantResults.find((result) => result.status === 'rejected');
    if (failedGrant) throw failedGrant.reason || new Error('monthly_reward_grant_failed');
    const awardedCount = grantResults.filter((result) => result.status === 'fulfilled' && !result.value?.duplicated).length;

    await resetMonthlyActivityForNewPeriod(currentPeriodKey);
    await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, {
      lastProcessedPeriodKey: currentPeriodKey,
      lastRewardMonthKey: rewardMonthKey,
      lastAwardedCount: awardedCount,
      lastProcessedAt: nowMs(),
      waitReason: null
    }));
  } catch (error) {
    writeLine('error', 'cron_monthly_rewards_failed', { job: 'monthly_rewards', error: serializeError(error) });
    await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, { lastError: String(error?.message || error) }));
  }
}

async function processActivityResetIfNeeded() {
  if (!shouldRunFirebaseCron('activity_reset')) return;
  const resetMeta = getActivityResetWindowMeta();
  const currentPeriodKey = resetMeta.currentPeriodKey;
  const lock = await acquireJobLock('activity_reset');
  if (!lock.acquired) return;
  try {
    const alreadyProcessed = String(lock.data?.lastProcessedPeriodKey || '').trim();
    if (alreadyProcessed === currentPeriodKey) {
      return await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, { lastProcessedPeriodKey: currentPeriodKey }));
    }
    if (!resetMeta.isActivityResetWindowOpen) {
      return await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, {
        deferredPeriodKey: currentPeriodKey,
        deferredUntilWindow: resetMeta.activityWindowClosesAt,
        waitReason: 'activity_reset_window_closed'
      }));
    }
    await resetActivityPresentationForNewPeriod(currentPeriodKey);
    await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, {
      lastProcessedPeriodKey: currentPeriodKey,
      lastProcessedAt: nowMs(),
      waitReason: null
    }));
  } catch (error) {
    writeLine('error', 'cron_activity_reset_failed', { job: 'activity_reset', error: serializeError(error) });
    await releaseJobLock(lock.ref, buildJobWindowState(lock.data, resetMeta, { lastError: String(error?.message || error) }));
  }
}

async function cleanupStaleData() {
  if (!shouldRunFirebaseCron('cleanup_stale_data')) return;
  try {
    const now = Date.now();
    const oldTime20Mins = now - (20 * 60 * 1000);
    const oldTime5Mins = now - (5 * 60 * 1000);
    const oldLobbyChat = now - (LOBBY_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const oldDirectChat = now - (DIRECT_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const retentionPurgeGraceMs = 3 * 24 * 60 * 60 * 1000;
    const oldLobbyChatHardPurge = oldLobbyChat - retentionPurgeGraceMs;
    const oldDirectChatHardPurge = oldDirectChat - retentionPurgeGraceMs;
    const cleanupRunId = `cleanup-${now}`;
    const stats = {
      job: 'chat_retention_cleanup',
      cleanupRunId,
      startedAt: now,
      lobbyRetentionDays: LOBBY_CHAT_RETENTION_DAYS,
      directRetentionDays: DIRECT_CHAT_RETENTION_DAYS,
      chessRoomsDeleted: 0,
      crashBetsDeleted: 0,
      globalMessagesMarked: 0,
      globalMessagesPurged: 0,
      directMessagesMarked: 0,
      directMessagesPurged: 0,
      emptyChatDocsDeleted: 0,
      totalOps: 0
    };
    const ops = [];


    const chessSnap = await colChess().limit(500).get();
    chessSnap.forEach((doc) => {
      const data = doc.data() || {};
      const cleanupAt = safeNum(data.cleanupAt, 0);
      const status = cleanStr(data.status || '', 24);
      const lastActivityAt = Math.max(
        safeNum(data.lastActivityAt, 0),
        safeNum(data.updatedAt, 0),
        safeNum(data.host?.lastPing, 0),
        safeNum(data.guest?.lastPing, 0)
      );
      const shouldDeleteClosed = ['finished', 'abandoned'].includes(status) && cleanupAt > 0 && cleanupAt <= now;
      const shouldDeleteStale = ['waiting', 'playing'].includes(status) && lastActivityAt > 0 && lastActivityAt < oldTime20Mins;
      if (shouldDeleteClosed || shouldDeleteStale) {
        stats.chessRoomsDeleted += 1;
        ops.push({ type: 'delete', ref: doc.ref });
      }
    });



    const crashSnap = await db.collection('crash_bets').where('createdAt', '<', oldTime5Mins).limit(500).get();
    crashSnap.forEach((doc) => {
      stats.crashBetsDeleted += 1;
      ops.push({ type: 'delete', ref: doc.ref });
    });

    const lobbySnap = await colLobbyChat().where('createdAt', '<', oldLobbyChat).limit(500).get();
    lobbySnap.forEach((doc) => {
      const data = doc.data() || {};
      const createdAt = safeNum(data.createdAt, 0);
      if (safeNum(data.deletedAt, 0) > 0 && createdAt < oldLobbyChatHardPurge) {
        stats.globalMessagesPurged += 1;
        ops.push({ type: 'delete', ref: doc.ref });
        return;
      }
      if (safeNum(data.deletedAt, 0) > 0) return;
      stats.globalMessagesMarked += 1;
      ops.push({
        type: 'set',
        ref: doc.ref,
        data: { message: '', deletedAt: now, deletedBy: 'system:retention', deletionMode: CHAT_RETENTION_POLICY.deleteModes.retention, deletedLabel: CHAT_RETENTION_POLICY.cleanupLabel, status: 'deleted' },
        options: { merge: true }
      });
    });

    const affectedInactiveChatRefs = new Map();
    const directExpiredSnap = await db.collectionGroup('messages').where('createdAt', '<', oldDirectChat).limit(500).get().catch(() => ({ docs: [] }));
    for (const msgDoc of directExpiredSnap.docs || []) {
      const chatRef = msgDoc.ref.parent?.parent || null;
      if (!chatRef || chatRef.parent?.id !== 'chats') continue;
      const data = msgDoc.data() || {};
      const createdAt = safeNum(data.createdAt, 0);
      if (!createdAt || createdAt >= oldDirectChat) continue;
      const lastChatUpdateSnap = await chatRef.get().catch(() => null);
      const chatData = lastChatUpdateSnap?.exists ? (lastChatUpdateSnap.data() || {}) : {};
      const lastUpdatedAt = safeNum(chatData.lastUpdatedAt?.toMillis?.() || chatData.lastUpdatedAt, 0);
      const inactiveChat = !lastUpdatedAt || lastUpdatedAt < oldDirectChat;
      if (inactiveChat) affectedInactiveChatRefs.set(chatRef.id, chatRef);
      if (safeNum(data.deletedAt, 0) > 0 && createdAt < oldDirectChatHardPurge) {
        stats.directMessagesPurged += 1;
        ops.push({ type: 'delete', ref: msgDoc.ref });
        continue;
      }
      if (safeNum(data.deletedAt, 0) > 0) continue;
      stats.directMessagesMarked += 1;
      ops.push({
        type: 'set',
        ref: msgDoc.ref,
        data: { text: '', deletedAt: now, deletedBy: 'system:retention', deletionMode: CHAT_RETENTION_POLICY.deleteModes.retention, deletedLabel: CHAT_RETENTION_POLICY.cleanupLabel, status: 'deleted' },
        options: { merge: true }
      });
    }

    for (const chatRef of affectedInactiveChatRefs.values()) {
      ops.push({
        type: 'set',
        ref: chatRef,
        data: {
          lastMessage: CHAT_RETENTION_POLICY.cleanupLabel,
          lastMessageState: 'deleted',
          lastMessageDeletedLabel: CHAT_RETENTION_POLICY.cleanupLabel,
          lastMessageDeletedAt: now,
          lastMessageDeletionMode: CHAT_RETENTION_POLICY.deleteModes.retention,
          lastRetentionCleanupAt: now
        },
        options: { merge: true }
      });
    }

    const emptyChatsSnap = await db.collection('chats').where('lastRetentionCleanupAt', '<', oldDirectChatHardPurge).limit(150).get().catch(() => ({ docs: [] }));
    for (const chatDoc of emptyChatsSnap.docs || []) {
      const msgSnap = await chatDoc.ref.collection('messages').limit(1).get().catch(() => ({ docs: [] }));
      if ((msgSnap.docs || []).length === 0) {
        stats.emptyChatDocsDeleted += 1;
        ops.push({ type: 'delete', ref: chatDoc.ref });
      }
    }


    stats.totalOps = ops.length;
    if (ops.length > 0) await commitBatchOps(ops);
    await cleanupRealtimeState().catch(() => null);
    const summary = { ...stats, ok: true, finishedAt: nowMs() };
    await colJobs().doc('chat_retention_cleanup').set(summary, { merge: true }).catch(() => null);
    writeLine('info', 'cron_chat_retention_cleanup_completed', summary);
  } catch (error) {
    const failedAt = nowMs();
    const payload = {
      job: 'cleanup_stale_data',
      query: 'stale_rooms_and_chat_retention',
      jobRunId: `cleanup-${failedAt}`,
      ok: false,
      failedAt,
      lobbyRetentionDays: LOBBY_CHAT_RETENTION_DAYS,
      directRetentionDays: DIRECT_CHAT_RETENTION_DAYS,
      code: cleanStr(error?.code || '', 80) || null,
      message: cleanStr(error?.message || '', 500),
      error: serializeError(error)
    };
    await colJobs().doc('chat_retention_cleanup').set(payload, { merge: true }).catch(() => null);
    writeLine('error', 'cron_cleanup_failed', payload);
  }
}

async function cleanupLongTermData() {
  return null;
}

function initCrons() {
  setInterval(() => { cleanupStaleData().catch(() => null); }, 60 * 1000);
  setInterval(() => { cleanupLongTermData().catch(() => null); }, 60 * 60 * 1000);
  setInterval(() => { processMonthlyRewardsIfNeeded().catch(() => null); }, MONTHLY_REWARD_CHECK_INTERVAL_MS);
  setInterval(() => { processActivityResetIfNeeded().catch(() => null); }, ACTIVITY_RESET_CHECK_INTERVAL_MS);
  setInterval(() => { warnInactiveUsersAndCleanup().catch(() => null); }, 6 * 60 * 60 * 1000);

  setTimeout(() => { cleanupStaleData().catch(() => null); }, 10 * 1000).unref();
  setTimeout(() => { processMonthlyRewardsIfNeeded().catch(() => null); }, 20 * 1000).unref();
  setTimeout(() => { processActivityResetIfNeeded().catch(() => null); }, 30 * 1000).unref();
  setTimeout(() => { warnInactiveUsersAndCleanup().catch(() => null); }, 40 * 1000).unref();
}

module.exports = { initCrons };