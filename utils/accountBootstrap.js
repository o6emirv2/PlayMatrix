'use strict';

const { db } = require('../config/firebase');
const { cleanStr, safeNum, nowMs, isDisposableEmail } = require('./helpers');
const { buildCanonicalUserState } = require('./accountState');
const { normalizeUserRankState, MONTHLY_ACTIVITY_BASE_STATE, buildLevelRankMeta } = require('./progression');
const { getRewardAmount, buildRewardGrantMessage } = require('../config/rewardCatalog');
const { recordRewardLedger } = require('./rewardLedger');
const { createNotification } = require('./notifications');

const colUsers = () => db.collection('users');

function buildBaseUserRecord(email = '') {
  const now = nowMs();
  const startingRank = buildLevelRankMeta(1);
  return {
    balance: 0,
    email: cleanStr(email || '', 200).toLowerCase(),
    createdAt: now,
    lastActiveAt: now,
    lastSeen: now,
    lastLogin: now,
    userChangeCount: 0,
    totalRank: startingRank.name,
    totalRankKey: startingRank.key,
    totalRankClass: startingRank.className,
    activityRank: MONTHLY_ACTIVITY_BASE_STATE.activityRank,
    activityRankKey: MONTHLY_ACTIVITY_BASE_STATE.activityRankKey,
    activityRankClass: MONTHLY_ACTIVITY_BASE_STATE.activityRankClass,
    monthlyActiveScore: 0,
    activityScore: 0,
    accountXp: 0,
    accountLevel: 1,
    accountLevelScore: 0,
    selectedFrame: 0,
    totalSpentMc: 0,
    totalRounds: 0,
    notificationsEnabled: true,
    unread_messages: 0,
    signupRewardClaimed: false,
    signupRewardToastShown: false,
    signupRewardLedgerRecorded: false,
    signupRewardNotificationCreated: false,
    signupRewardArtifactSyncedAt: 0,
    emailRewardClaimed: false,
    emailRewardToastShown: false,
    emailRewardBlocked: false,
    emailRewardLedgerRecorded: false,
    emailRewardNotificationCreated: false,
    emailRewardArtifactSyncedAt: 0
  };
}

function buildRewardArtifactPayload(source, amount) {
  const message = buildRewardGrantMessage(source, { amount });
  return {
    source: message.source || source,
    amount,
    amountLabel: message.amountLabel,
    notification: {
      type: 'reward',
      title: message.title,
      body: message.body,
      data: {
        source: message.source || source,
        amount,
        amountLabel: message.amountLabel
      }
    }
  };
}

async function ensureRewardArtifactsForUser({ uid = '', source = '', amount = 0, referenceId = 'account_bootstrap', idempotencyKey = '' } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  const safeSource = cleanStr(source || '', 80).toLowerCase();
  const safeAmount = Math.floor(safeNum(amount, 0));
  if (!safeUid || !safeSource || safeAmount <= 0) return { ledger: null, notification: null };

  const artifact = buildRewardArtifactPayload(safeSource, safeAmount);
  const safeIdempotencyKey = cleanStr(idempotencyKey || `${safeSource}_${safeUid}`, 220);

  const [ledgerResult, notificationResult] = await Promise.all([
    recordRewardLedger({
      uid: safeUid,
      amount: safeAmount,
      source: safeSource,
      referenceId: cleanStr(referenceId || 'account_bootstrap', 180),
      idempotencyKey: safeIdempotencyKey
    }),
    createNotification({
      uid: safeUid,
      ...artifact.notification,
      idempotencyKey: safeIdempotencyKey
    })
  ]);

  return { ledger: ledgerResult, notification: notificationResult };
}

async function syncBootstrapRewardArtifacts({ uid = '', user = {}, grantedSignupReward = false, grantedEmailReward = false, referenceId = 'account_bootstrap' } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return { signup: null, email: null };

  const updates = {};
  const tasks = [];
  const result = { signup: null, email: null };
  const signupRewardAmount = getRewardAmount('signup_reward', 50000);
  const emailRewardAmount = getRewardAmount('email_verify_reward', 100000);

  const shouldSyncSignup = !!user.signupRewardClaimed && (grantedSignupReward || !user.signupRewardLedgerRecorded || !user.signupRewardNotificationCreated);
  const shouldSyncEmail = !!user.emailRewardClaimed && (grantedEmailReward || !user.emailRewardLedgerRecorded || !user.emailRewardNotificationCreated);

  if (shouldSyncSignup) {
    tasks.push((async () => {
      result.signup = await ensureRewardArtifactsForUser({
        uid: safeUid,
        amount: signupRewardAmount,
        source: 'signup_reward',
        referenceId,
        idempotencyKey: `signup_reward_${safeUid}`
      });
      updates.signupRewardLedgerRecorded = true;
      updates.signupRewardNotificationCreated = true;
      updates.signupRewardArtifactSyncedAt = nowMs();
    })());
  }

  if (shouldSyncEmail) {
    tasks.push((async () => {
      result.email = await ensureRewardArtifactsForUser({
        uid: safeUid,
        amount: emailRewardAmount,
        source: 'email_verify_reward',
        referenceId,
        idempotencyKey: `email_reward_${safeUid}`
      });
      updates.emailRewardLedgerRecorded = true;
      updates.emailRewardNotificationCreated = true;
      updates.emailRewardArtifactSyncedAt = nowMs();
    })());
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
    await colUsers().doc(safeUid).set(updates, { merge: true });
  }

  return result;
}

async function bootstrapAccountByAuth({ tx = null, uid = '', email = '', emailVerified = false, referenceId = 'account_bootstrap' } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) throw new Error('ACCOUNT_UID_REQUIRED');
  const safeEmail = cleanStr(email || '', 200).toLowerCase();
  const runner = tx ? async (fn) => fn(tx) : (fn) => db.runTransaction(fn);

  const bootstrap = await runner(async (trx) => {
    const userRef = colUsers().doc(safeUid);
    const snap = await trx.get(userRef);
    const base = snap.exists ? { ...(snap.data() || {}) } : buildBaseUserRecord(safeEmail);
    const user = { ...base };
    const now = nowMs();
    let grantedSignupReward = false;
    let grantedEmailReward = false;

    if (!cleanStr(user.email) && safeEmail) user.email = safeEmail;
    if (!snap.exists) {
      user.createdAt = safeNum(user.createdAt, now) || now;
      user.lastLogin = now;
      user.lastActiveAt = now;
      user.lastSeen = now;
    }

    if (user.notificationsEnabled === undefined || user.notificationsEnabled === null) user.notificationsEnabled = true;
    if (user.unread_messages === undefined || user.unread_messages === null) user.unread_messages = 0;
    if (user.userChangeCount === undefined || user.userChangeCount === null) user.userChangeCount = 0;
    if (user.monthlyActiveScore === undefined || user.monthlyActiveScore === null) user.monthlyActiveScore = 0;
    if (user.activityScore === undefined || user.activityScore === null) user.activityScore = safeNum(user.monthlyActiveScore, 0);
    if (user.totalSpentMc === undefined || user.totalSpentMc === null) user.totalSpentMc = 0;
    if (user.totalRounds === undefined || user.totalRounds === null) user.totalRounds = 0;
    if (user.signupRewardLedgerRecorded === undefined || user.signupRewardLedgerRecorded === null) user.signupRewardLedgerRecorded = false;
    if (user.signupRewardNotificationCreated === undefined || user.signupRewardNotificationCreated === null) user.signupRewardNotificationCreated = false;
    if (user.signupRewardArtifactSyncedAt === undefined || user.signupRewardArtifactSyncedAt === null) user.signupRewardArtifactSyncedAt = 0;
    if (user.emailRewardLedgerRecorded === undefined || user.emailRewardLedgerRecorded === null) user.emailRewardLedgerRecorded = false;
    if (user.emailRewardNotificationCreated === undefined || user.emailRewardNotificationCreated === null) user.emailRewardNotificationCreated = false;
    if (user.emailRewardArtifactSyncedAt === undefined || user.emailRewardArtifactSyncedAt === null) user.emailRewardArtifactSyncedAt = 0;

    const signupRewardAmount = getRewardAmount('signup_reward', 50000);
    const emailRewardAmount = getRewardAmount('email_verify_reward', 100000);

    if (!user.signupRewardClaimed) {
      user.balance = safeNum(user.balance, 0) + signupRewardAmount;
      user.signupRewardClaimed = true;
      user.signupRewardLedgerRecorded = false;
      user.signupRewardNotificationCreated = false;
      user.signupRewardArtifactSyncedAt = 0;
      grantedSignupReward = true;
    }

    const disposable = isDisposableEmail(safeEmail);
    if (emailVerified && !user.emailRewardClaimed && !disposable) {
      user.balance = safeNum(user.balance, 0) + emailRewardAmount;
      user.emailRewardClaimed = true;
      user.emailRewardBlocked = false;
      user.emailRewardLedgerRecorded = false;
      user.emailRewardNotificationCreated = false;
      user.emailRewardArtifactSyncedAt = 0;
      grantedEmailReward = true;
    } else if (emailVerified && !user.emailRewardClaimed && disposable) {
      user.emailRewardBlocked = true;
    }

    const canonical = buildCanonicalUserState(user, { defaultFrame: 0 });
    const next = {
      ...user,
      ...canonical,
      ...normalizeUserRankState({ ...user, ...canonical })
    };

    trx.set(userRef, next, { merge: false });
    return {
      exists: snap.exists,
      user: next,
      grantedSignupReward,
      grantedEmailReward,
      emailRewardBlocked: !!next.emailRewardBlocked,
      disposableEmail: disposable
    };
  });

  const rewardArtifacts = await syncBootstrapRewardArtifacts({
    uid: safeUid,
    user: bootstrap.user,
    grantedSignupReward: bootstrap.grantedSignupReward,
    grantedEmailReward: bootstrap.grantedEmailReward,
    referenceId
  });

  return {
    ...bootstrap,
    rewardArtifacts,
    user: {
      ...bootstrap.user,
      ...(rewardArtifacts.signup ? {
        signupRewardLedgerRecorded: true,
        signupRewardNotificationCreated: true,
        signupRewardArtifactSyncedAt: nowMs()
      } : {}),
      ...(rewardArtifacts.email ? {
        emailRewardLedgerRecorded: true,
        emailRewardNotificationCreated: true,
        emailRewardArtifactSyncedAt: nowMs()
      } : {})
    }
  };
}

module.exports = {
  buildBaseUserRecord,
  bootstrapAccountByAuth,
  syncBootstrapRewardArtifacts,
  ensureRewardArtifactsForUser
};
