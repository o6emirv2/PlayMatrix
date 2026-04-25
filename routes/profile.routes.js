'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { db, admin, isFirebaseReady, getFirebaseStatus } = require('../config/firebase');
const { verifyAuth, tryVerifyOptionalAuth } = require('../middlewares/auth.middleware');
const { profileLimiter, bonusLimiter } = require('../middlewares/rateLimiters');
const { safeNum, cleanStr, isDisposableEmail, containsBlockedUsername, nowMs } = require('../utils/helpers');
const { touchUserActivity, touchUserPresence, touchServerSession } = require('../utils/activity');
const { createNotification } = require('../utils/notifications');
const { recordRewardLedger } = require('../utils/rewardLedger');
const { grantReward, applyRewardGrantInTransaction, createRewardNotificationForGrant } = require('../utils/rewardService');
const { buildRewardFlowOverview, getRewardAmount, buildRewardGrantMessage } = require('../config/rewardCatalog');
const { ACCOUNT_PROGRESSION_VERSION, buildProgressionSnapshot, getAccountLevel, getAccountXp, normalizeUserRankState } = require('../utils/progression');
const { getCanonicalSelectedFrame, buildCanonicalUserState } = require('../utils/accountState');
const { bootstrapAccountByAuth } = require('../utils/accountBootstrap');
const { TtlCache } = require('../utils/cache');
const { listActiveSessionsForUid } = require('../utils/gameSession');
const { listMatchHistoryForUid, summarizeMatchHistoryForUid } = require('../utils/matchHistory');
const { getNextActivityResetMeta } = require('../utils/platformControl');
const { getActivityCalendarParts } = require('../utils/activityPeriod');
const { CHAT_RETENTION_POLICY } = require('../config/constants');
const {
  DEFAULT_AVATAR,
  sanitizeAvatarForStorage
} = require('../utils/avatarManifest');

const colUsers = () => db.collection('users');
const leaderboardCache = new TtlCache(15000, 24);
const colPromos = () => db.collection('promo_codes');
const colUsernames = () => db.collection('usernames');

function getFirestoreTimestampMs(value, fallback = 0) {
  if (value && typeof value.toMillis === 'function') return safeNum(value.toMillis(), fallback);
  if (value instanceof Date) return safeNum(value.getTime(), fallback);
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function pickUserSelectedFrame(user = {}) {
  return getCanonicalSelectedFrame(user, { defaultFrame: 0 });
}

function sanitizeStoredUsername(value = '') {
  const username = cleanStr(value || '', 32);
  if (!username) return '';
  if (username.includes('@')) return '';
  return username;
}

async function findUsernameByUid(uid = '') {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return '';
  try {
    const snap = await colUsernames().where('uid', '==', safeUid).limit(1).get();
    if (snap.empty) return '';
    return sanitizeStoredUsername(snap.docs[0].id);
  } catch (_) {
    return '';
  }
}

async function resolvePublicUsername(uid = '', userData = {}) {
  const direct = sanitizeStoredUsername(userData?.username);
  if (direct) return direct;
  const mapped = await findUsernameByUid(uid);
  if (mapped) return mapped;
  return 'Oyuncu';
}

function hasSameScalarValue(left, right) {
  if (typeof left === 'number' || typeof right === 'number') return safeNum(left, Number.NaN) === safeNum(right, Number.NaN);
  return String(left ?? '') === String(right ?? '');
}

function applyNormalizedRankPatch(user = {}, updates = {}) {
  const normalized = normalizeUserRankState(user);
  let changed = false;
  Object.entries(normalized).forEach(([key, value]) => {
    if (!hasSameScalarValue(user?.[key], value)) {
      updates[key] = value;
      user[key] = value;
      changed = true;
    }
  });
  return changed;
}


function applyCanonicalAccountPatch(user = {}, updates = {}) {
  const canonical = buildCanonicalUserState(user, { defaultFrame: 0 });
  let changed = false;
  Object.entries(canonical).forEach(([key, value]) => {
    if (key === 'progression') return;
    if (!hasSameScalarValue(user?.[key], value)) {
      updates[key] = value;
      user[key] = value;
      changed = true;
    }
  });
  return changed;
}


async function formatLeaderboardUser(doc, rank = null, extra = {}) {
  const data = doc.data() || {};
  const username = await resolvePublicUsername(doc.id, data);
  const canonical = buildCanonicalUserState(data, { defaultFrame: 0 });
  const progression = canonical.progression && typeof canonical.progression === 'object' ? canonical.progression : {};
  const metricKey = cleanStr(extra.metricKey || '', 32);
  const metricLabel = cleanStr(extra.metricLabel || '', 64);
  const metricValue = safeNum(extra.metricValue, 0);
  return {
    uid: doc.id,
    username,
    avatar: sanitizeAvatarForStorage(data.avatar) || DEFAULT_AVATAR,
    selectedFrame: canonical.selectedFrame,
    accountLevel: canonical.accountLevel,
    accountXp: canonical.accountXp,
    monthlyActiveScore: canonical.monthlyActiveScore,
    progression: {
      ...progression,
      accountLevel: canonical.accountLevel,
      accountXp: canonical.accountXp,
      accountLevelScore: canonical.accountLevelScore,
      monthlyActivity: canonical.monthlyActiveScore
    },
    leaderboard: {
      rank: safeNum(rank, 0),
      metricKey,
      metricLabel,
      metricValue
    }
  };
}

async function scanUsersByComputedMetric(metric = '', limit = 10, targetUid = '') {
  const safeMetric = cleanStr(metric || '', 64);
  const safeLimit = Math.max(1, Math.min(50, safeNum(limit, 10)));
  const entries = [];
  let lastDoc = null;

  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(250);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snap = await query.get();
    if (snap.empty) break;

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      let score = 0;
      let shouldInclude = false;
      if (safeMetric === 'accountLevelScore') {
        score = getAccountXp(data);
        shouldInclude = getAccountLevel(data) >= 1;
      }
      if (shouldInclude || doc.id === targetUid) entries.push({ doc, score });
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 250) break;
  }

  entries.sort((a, b) => b.score - a.score || String(a.doc.id).localeCompare(String(b.doc.id)));
  const topSlice = entries.slice(0, safeLimit);
  const metricLabel = safeMetric === 'monthlyActiveScore' ? 'Aylık Aktiflik' : 'Hesap Seviyesi';
  const top = await Promise.all(topSlice.map(async (entry, index) => formatLeaderboardUser(entry.doc, index + 1, {
    metricKey: safeMetric,
    metricLabel,
    metricValue: entry.score
  })));
  let self = null;
  if (targetUid) {
    const idx = entries.findIndex((entry) => entry.doc.id === targetUid);
    if (idx !== -1) self = await formatLeaderboardUser(entries[idx].doc, idx + 1, {
      metricKey: safeMetric,
      metricLabel: safeMetric === 'monthlyActiveScore' ? 'Aylık Aktiflik' : 'Hesap Seviyesi',
      metricValue: entries[idx].score
    });
  }
  return { top, self };
}

async function getLeaderboardTop(field, limit = 10) {
  const inputField = cleanStr(field || '', 64);
  const safeField = inputField;
  if (safeField === 'accountLevelScore') {
    return leaderboardCache.remember(`top:${safeField}:${limit}`, async () => (await scanUsersByComputedMetric(safeField, limit, '')).top, 15000);
  }
  const cacheKey = `top:${safeField}:${limit}`;
  return leaderboardCache.remember(cacheKey, async () => {
    const snap = await colUsers().orderBy(safeField, 'desc').limit(limit).get();
    const metricLabel = safeField === 'monthlyActiveScore' ? 'Aylık Aktiflik' : 'Hesap Seviyesi';
    return Promise.all(snap.docs.map((doc, index) => formatLeaderboardUser(doc, index + 1, {
      metricKey: safeField,
      metricLabel,
      metricValue: safeNum(doc.data()?.[safeField], 0)
    })));
  }, 15000);
}

function buildDegradedLeaderboardPayload(reason = 'FIREBASE_ADMIN_UNAVAILABLE') {
  const status = getFirebaseStatus();
  const baseTab = (key, label, metricKey) => ({
    key,
    label,
    metricKey,
    items: [],
    self: null
  });
  return {
    ok: true,
    schemaVersion: 1,
    generatedAt: nowMs(),
    degraded: true,
    code: reason,
    firebase: {
      ready: !!status.ready,
      source: status.source || null
    },
    tabs: {
      level: baseTab('level', 'En Yüksek Hesap Seviyesi', 'accountLevelScore'),
      activity: baseTab('activity', 'En Çok Aktif Oyuncular', 'monthlyActiveScore')
    }
  };
}

function isFirebaseAdminUnavailableError(error) {
  return error?.code === 'FIREBASE_ADMIN_UNAVAILABLE'
    || /FIREBASE_ADMIN_UNAVAILABLE|Firebase Admin/i.test(String(error?.message || ''));
}

async function getLeaderboardSelfEntry(uid, field) {
  if (!uid) return null;
  const inputField = cleanStr(field || '', 64);
  const safeField = inputField;
  if (safeField === 'accountLevelScore') {
    return (await scanUsersByComputedMetric(safeField, 10, uid)).self;
  }

  const selfSnap = await colUsers().doc(uid).get();
  if (!selfSnap.exists) return null;

  const selfData = selfSnap.data() || {};
  const normalizedField = safeField === 'monthlyActiveScore' ? 'monthlyActiveScore' : 'accountLevelScore';
  const currentValue = safeNum(selfData[normalizedField], 0);

  let rank = 1;
  try {
    const higherCountSnap = await colUsers().where(normalizedField, '>', currentValue).count().get();
    rank = safeNum(higherCountSnap.data()?.count, 0) + 1;
  } catch (_) {}

  return formatLeaderboardUser(selfSnap, rank, {
    metricKey: normalizedField,
    metricLabel: normalizedField === 'monthlyActiveScore' ? 'Aylık Aktiflik' : 'Hesap Seviyesi',
    metricValue: currentValue
  });
}


function genReferralCode(uid){
  return crypto.createHash('sha256').update(uid + '|' + nowMs() + '|' + crypto.randomBytes(8).toString('hex')).digest('hex').slice(0,10).toUpperCase();
}

async function findPromoDocIdByNormalized(codeUpper, maxScan = 500) {
  const refs = await colPromos().listDocuments();
  let c = 0;
  for (const ref of refs) {
    c++;
    if (c > maxScan) break;
    if (String(ref.id || '').trim().toUpperCase() === codeUpper) return ref.id;
  }
  return null;
}


router.get('/', verifyAuth, async (req, res) => {
  try {
    const bootstrap = await bootstrapAccountByAuth({
      uid: req.user.uid,
      email: req.user.email || '',
      emailVerified: !!req.user.email_verified,
      referenceId: 'api_me'
    });
    let uData = await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(req.user.uid);
      const snap = await tx.get(uRef);

      let u = snap.exists
        ? (snap.data() || {})
        : { ...(bootstrap.user || {}) };
      const updates = {};
      let isUpdated = false;
      const toast = { signup: false, email: false };

      if (!cleanStr(u.email) && req.user.email) { updates.email = req.user.email; u.email = req.user.email; isUpdated = true; }
      if (u.monthlyActiveScore === undefined || u.monthlyActiveScore === null) { updates.monthlyActiveScore = 0; u.monthlyActiveScore = 0; isUpdated = true; }
      if (u.totalSpentMc === undefined || u.totalSpentMc === null) { updates.totalSpentMc = 0; u.totalSpentMc = 0; isUpdated = true; }
      if (u.totalRounds === undefined || u.totalRounds === null) { updates.totalRounds = 0; u.totalRounds = 0; isUpdated = true; }
      if (u.userChangeCount === undefined || u.userChangeCount === null) { updates.userChangeCount = 0; u.userChangeCount = 0; isUpdated = true; }
      if (u.unread_messages === undefined || u.unread_messages === null) { updates.unread_messages = 0; u.unread_messages = 0; isUpdated = true; }
      if (applyCanonicalAccountPatch(u, updates)) isUpdated = true;
      if (u.lastActiveAt === undefined || u.lastActiveAt === null) { updates.lastActiveAt = nowMs(); u.lastActiveAt = nowMs(); isUpdated = true; }
      if (u.lastSeen === undefined || u.lastSeen === null) { updates.lastSeen = nowMs(); u.lastSeen = nowMs(); isUpdated = true; }
      if (!snap.exists) { updates.lastLogin = nowMs(); u.lastLogin = nowMs(); isUpdated = true; }
      if (cleanStr(u.fullName) && !u.fullNameLocked) { updates.fullNameLocked = true; u.fullNameLocked = true; isUpdated = true; }
      if (req.user.email_verified && !u.emailRewardClaimed && isDisposableEmail(req.user.email)) {
        updates.emailRewardBlocked = true; u.emailRewardBlocked = true; isUpdated = true;
      }
      if (u.signupRewardClaimed && !u.signupRewardToastShown) {
        updates.signupRewardToastShown = true; u.signupRewardToastShown = true; toast.signup = true; isUpdated = true;
      }
      if (u.emailRewardClaimed && !u.emailRewardToastShown) {
        updates.emailRewardToastShown = true; u.emailRewardToastShown = true; toast.email = true; isUpdated = true;
      }
      if (applyNormalizedRankPatch(u, updates)) isUpdated = true;

      if (isUpdated) tx.set(uRef, snap.exists ? updates : { ...u, ...updates }, { merge: true });
      return { u, toast };
    });

    Promise.allSettled([
      touchUserActivity(req.user.uid, { scope: 'api_me', login: false })
    ]).catch(() => null);

    const publicUsername = await resolvePublicUsername(req.user.uid, uData.u);
    const canonical = buildCanonicalUserState(uData.u, { defaultFrame: 0 });
    const progression = canonical.progression;
    const rewardPolicy = buildRewardFlowOverview({ verified: !!req.user.email_verified, disposableEmail: isDisposableEmail(req.user.email) });
    const activityMeta = getNextActivityResetMeta();
    const safeUser = {
      ...uData.u,
      ...canonical,
      username: publicUsername,
      fullNameLocked: !!(uData.u.fullNameLocked || cleanStr(uData.u.fullName)),
      usernameChangeLimit: 3,
      usernameChangeRemaining: Math.max(0, 3 - safeNum(uData.u.userChangeCount, 0)),
      unread_messages: safeNum(uData.u.unread_messages, 0),
      statistics: {
        accountLevel: canonical.accountLevel,
        accountXp: canonical.accountXp,
        accountLevelScore: canonical.accountLevelScore,
        monthlyActiveScore: canonical.monthlyActiveScore,
        totalRounds: safeNum(uData.u.totalRounds, 0),
        totalSpentMc: safeNum(uData.u.totalSpentMc, 0),
        totalWins: safeNum(uData.u.totalWins, safeNum(uData.u.chessWins, 0) + safeNum(uData.u.pistiWins, 0) + safeNum(uData.u.crashWins, 0)),
        totalLosses: safeNum(uData.u.totalLosses, safeNum(uData.u.chessLosses, 0) + safeNum(uData.u.pistiLosses, 0) + safeNum(uData.u.crashLosses, 0)),
        chessWins: safeNum(uData.u.chessWins, 0),
        chessLosses: safeNum(uData.u.chessLosses, 0),
        pistiWins: safeNum(uData.u.pistiWins || uData.u.pisti_wins, 0),
        pistiLosses: safeNum(uData.u.pistiLosses || uData.u.pisti_losses, 0),
        crashRounds: safeNum(uData.u.crashRounds || uData.u.crash_rounds, 0),
        crashWins: safeNum(uData.u.crashWins || uData.u.crash_wins, 0),
        crashLosses: safeNum(uData.u.crashLosses || uData.u.crash_losses, 0),
        unreadMessages: safeNum(uData.u.unread_messages, 0)
      },
      progression,
      chatPolicy: CHAT_RETENTION_POLICY,
      rewardPolicy,
      systemOverview: {
        periodKey: getActivityCalendarParts().periodKey,
        periodResetLabel: activityMeta.label,
        activityResetLabel: activityMeta.label,
        chatPolicy: CHAT_RETENTION_POLICY,
        rewardPolicy
      },
      lastActiveAt: getFirestoreTimestampMs(uData.u.lastActiveAt, nowMs()),
      lastSeen: getFirestoreTimestampMs(uData.u.lastSeen || uData.u.lastActiveAt, nowMs())
    };
    res.json({ ok: true, balance: safeNum(uData.u.balance, 0), user: safeUser, toast: uData.toast });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});




router.post('/me/activity/heartbeat', verifyAuth, async (req, res) => {
  try {
    const status = cleanStr(req.body?.status || 'ACTIVE', 24).toUpperCase();
    const activity = cleanStr(req.body?.activity || 'heartbeat', 120) || 'heartbeat';
    const page = cleanStr(req.body?.page || req.headers['x-page'] || '', 120);
    const context = cleanStr(req.body?.context || '', 120);
    const roomId = cleanStr(req.body?.roomId || '', 160);
    const interactive = !!req.body?.interactive;
    await Promise.allSettled([
      touchUserActivity(req.user.uid, {
        scope: 'heartbeat',
        status,
        activity,
        sessionId: cleanStr(req.user?.sessionId || '', 160)
      }),
      touchUserPresence(req.user.uid, {
        status,
        activity,
        sessionId: cleanStr(req.user?.sessionId || '', 160)
      })
    ]);
    return res.json({
      ok: true,
      uid: cleanStr(req.user?.uid || '', 160),
      activity: {
        status,
        activity,
        page,
        context,
        roomId,
        interactive,
        touchedAt: nowMs()
      }
    });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Heartbeat kaydedilemedi.' });
  }
});

router.get('/music-tiles/bootstrap', async (_req, res) => {
  return res.json({
    ok: true,
    enabled: false,
    featureFlag: 'musicTilesEnabled',
    status: 'disabled',
    message: 'Music Tiles şu an aktif değil.'
  });
});

router.get('/me/active-sessions', verifyAuth, async (req, res) => {
  try {
    const sessions = await listActiveSessionsForUid(req.user.uid);
    const items = sessions.map((item) => ({
      ...item,
      resumePath: item.gameType === 'pisti' ? './Online Oyunlar/Pisti.html' : './Online Oyunlar/Satranc.html',
      roomKey: `${item.gameType}:${item.roomId}`
    }));
    return res.json({ ok: true, items, sessions: items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Aktif oturumlar yüklenemedi.' });
  }
});

router.get('/leaderboard', tryVerifyOptionalAuth, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (!isFirebaseReady()) {
      return res.json(buildDegradedLeaderboardPayload());
    }

    const uid = cleanStr(req.user?.uid || '', 160);
    const [levelTop, activityTop, selfLevel, selfActivity] = await Promise.all([
      getLeaderboardTop('accountLevelScore', 5),
      getLeaderboardTop('monthlyActiveScore', 5),
      uid ? getLeaderboardSelfEntry(uid, 'accountLevelScore') : Promise.resolve(null),
      uid ? getLeaderboardSelfEntry(uid, 'monthlyActiveScore') : Promise.resolve(null)
    ]);

    return res.json({
      ok: true,
      schemaVersion: 1,
      generatedAt: nowMs(),
      degraded: false,
      tabs: {
        level: {
          key: 'level',
          label: 'En Yüksek Hesap Seviyesi',
          metricKey: 'accountLevelScore',
          items: levelTop,
          self: selfLevel
        },
        activity: {
          key: 'activity',
          label: 'En Çok Aktif Oyuncular',
          metricKey: 'monthlyActiveScore',
          items: activityTop,
          self: selfActivity
        }
      }
    });
  } catch (error) {
    if (isFirebaseAdminUnavailableError(error)) {
      return res.json(buildDegradedLeaderboardPayload('FIREBASE_ADMIN_UNAVAILABLE'));
    }
    return res.status(500).json({ ok: false, error: 'Liderlik tablosu yüklenemedi.' });
  }
});

router.get('/user-stats/:uid', verifyAuth, async (req, res) => {
  try {
    const uid = cleanStr(req.params.uid || '', 128);
    if (!uid || uid === 'undefined' || uid === 'null') return res.status(400).json({ ok: false, error: 'Geçersiz kullanıcı kimliği.' });

    const userDoc = await colUsers().doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });

    const data = userDoc.data() || {};
    const progression = buildProgressionSnapshot(data);
    const chessWins = safeNum(data.chessWins, 0);
    const chessLosses = safeNum(data.chessLosses, 0);
    const pistiWins = safeNum(data.pistiWins || data.pisti_wins, 0);
    const pistiLosses = safeNum(data.pistiLosses || data.pisti_losses, 0);
    const crashRounds = safeNum(data.crashRounds || data.crash_rounds, 0);
    const crashWins = safeNum(data.crashWins || data.crash_wins, 0);
    const crashLosses = safeNum(data.crashLosses || data.crash_losses, 0);
    const totalWins = safeNum(data.totalWins, chessWins + pistiWins + crashWins);
    const totalLosses = safeNum(data.totalLosses, chessLosses + pistiLosses + crashLosses);
    const totalRounds = safeNum(data.totalRounds, totalWins + totalLosses + crashRounds);
    const totalSpentMc = safeNum(data.totalSpentMc, 0);
    const monthlyActiveScore = safeNum(data.monthlyActiveScore, progression.monthlyActivity);
    const selectedFrame = getCanonicalSelectedFrame(data, { accountLevel: progression.accountLevel, defaultFrame: 0 });
    const classicStats = data.classicStats && typeof data.classicStats === 'object' ? data.classicStats : {};
    const classicTotals = Object.values(classicStats).reduce((acc, item) => {
      const stat = item && typeof item === 'object' ? item : {};
      acc.totalRuns += safeNum(stat.totalRuns, 0);
      acc.totalScore += safeNum(stat.totalScore, 0);
      acc.bestScore = Math.max(acc.bestScore, safeNum(stat.bestScore, 0));
      return acc;
    }, { totalRuns: 0, totalScore: 0, bestScore: 0 });
    const [historySummary, recentHistory] = await Promise.all([
      summarizeMatchHistoryForUid(uid, { sampleLimit: 120 }).catch(() => ({ totalMatches: 0, wins: 0, losses: 0, draws: 0, byGame: {} })),
      listMatchHistoryForUid(uid, { limit: 6 }).catch(() => ({ items: [] }))
    ]);
    const resolvedWins = Math.max(totalWins, safeNum(historySummary.wins, 0));
    const resolvedLosses = Math.max(totalLosses, safeNum(historySummary.losses, 0));
    const resolvedDraws = safeNum(historySummary.draws, 0);
    const resolvedDecidedGames = Math.max(0, resolvedWins + resolvedLosses);
    const winRatePct = resolvedDecidedGames > 0 ? Math.round((resolvedWins / resolvedDecidedGames) * 1000) / 10 : 0;
    const accountProgression = {
      ...progression,
      selectedFrame,
      accountLevel: progression.accountLevel,
      accountXp: progression.accountXp,
      accountLevelScore: progression.accountLevelScore,
      accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION
    };

    return res.json({
      ok: true,
      data: {
        uid,
        username: await resolvePublicUsername(uid, data),
        avatar: sanitizeAvatarForStorage(data.avatar) || DEFAULT_AVATAR,
        level: progression.accountLevel,
        accountLevel: progression.accountLevel,
        accountXp: progression.accountXp,
        accountLevelScore: progression.accountLevelScore,
        accountLevelProgressPct: progression.accountLevelProgressPct,
        selectedFrame,
        createdAt: getFirestoreTimestampMs(data.createdAt, nowMs()),
        lastLogin: getFirestoreTimestampMs(data.lastLogin || data.lastSeen || data.lastActiveAt, nowMs()),
        lastSeen: getFirestoreTimestampMs(data.lastSeen || data.lastActiveAt, nowMs()),
        monthlyActiveScore,
        progression: accountProgression,
        totalRounds,
        totalSpentMc,
        totalWins: resolvedWins,
        totalLosses: resolvedLosses,
        totalDraws: resolvedDraws,
        winRate: winRatePct,
        winRatePct,
        chessWins,
        chessLosses,
        pistiWins,
        pistiLosses,
        crashRounds,
        crashWins,
        crashLosses,
        classicStats,
        gameStats: {
          total: { rounds: totalRounds, wins: resolvedWins, losses: resolvedLosses, draws: resolvedDraws, winRatePct },
          chess: { wins: chessWins, losses: chessLosses, matches: chessWins + chessLosses },
          pisti: { wins: pistiWins, losses: pistiLosses, matches: pistiWins + pistiLosses },
          crash: { rounds: crashRounds, wins: crashWins, losses: crashLosses },
          classic: classicTotals,
          history: historySummary
        },
        recentGames: Array.isArray(recentHistory.items) ? recentHistory.items.slice(0, 6) : [],
        statistics: {
          accountLevel: progression.accountLevel,
          accountXp: progression.accountXp,
          accountLevelScore: progression.accountLevelScore,
          accountLevelProgressPct: progression.accountLevelProgressPct,
          selectedFrame,
          monthlyActiveScore,
          totalRounds,
          totalSpentMc,
          totalWins: resolvedWins,
          totalLosses: resolvedLosses,
          totalDraws: resolvedDraws,
          winRatePct,
          chessWins,
          chessLosses,
          pistiWins,
          pistiLosses,
          crashRounds,
          crashWins,
          crashLosses,
          classicTotals,
          unreadMessages: safeNum(data.unread_messages, 0)
        }
      }
    });

  } catch (error) { return res.status(500).json({ ok: false, error: 'Sunucu hatası.' }); }
});

router.post('/update', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const { fullName, username, avatar, selectedFrame } = req.body || {};
    const uid = req.user.uid;
    const bootstrap = await bootstrapAccountByAuth({
      uid,
      email: req.user.email || '',
      emailVerified: !!req.user.email_verified,
      referenceId: 'profile_update'
    });

    await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(uid);
      const snap = await tx.get(uRef);
      const u = snap.exists ? (snap.data() || {}) : { ...(bootstrap.user || {}) };

      const updates = {};
      if (cleanStr(fullName) && !cleanStr(u.fullName)) { updates.fullName = cleanStr(fullName); updates.fullNameLocked = true; }
      if (avatar !== undefined) {
        const normalizedAvatar = sanitizeAvatarForStorage(avatar);
        if (!normalizedAvatar) throw new Error('Geçersiz avatar seçimi.');
        updates.avatar = normalizedAvatar;
      }

      const numericSelectedFrame = Number(selectedFrame);
      if (Number.isFinite(numericSelectedFrame) && numericSelectedFrame >= 0) {
        const safeSelectedFrame = Math.max(0, Math.min(100, Math.floor(numericSelectedFrame)));
        const maxUnlockedFrame = buildCanonicalUserState(u, { defaultFrame: 0 }).accountLevel;
        if (safeSelectedFrame > maxUnlockedFrame) throw new Error(`Bu çerçeveyi kaydetmek için en az Seviye ${safeSelectedFrame} olmalısın.`);
        updates.selectedFrame = safeSelectedFrame;
      }

      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(wanted)) throw new Error("Kullanıcı adı geçersiz. (3-20 karakter, harf/sayı/._-)");
        if (containsBlockedUsername(wanted)) throw new Error("Bu kullanıcı adı kullanılamaz.");
        if (safeNum(u.userChangeCount, 0) >= 3) throw new Error("Kullanıcı adı değiştirme hakkın doldu.");

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

      const mergedUser = { ...u, ...updates };
      const canonicalState = buildCanonicalUserState(mergedUser, { defaultFrame: 0 });
      tx.set(uRef, { ...mergedUser, ...canonicalState, ...normalizeUserRankState({ ...mergedUser, ...canonicalState }) }, { merge: true });
    });

    const freshSnap = await colUsers().doc(uid).get();
    const freshData = freshSnap.exists ? (freshSnap.data() || {}) : {};
    const freshCanonical = buildCanonicalUserState(freshData, { defaultFrame: 0 });
    res.json({ ok: true, selectedFrame: freshCanonical.selectedFrame, progression: freshCanonical.progression });
  } catch (e) {
    const message = e && e.message ? e.message : 'Profil güncellenemedi.';
    const status = /geçersiz|kilit|seviye|kullanılamaz|doldu|kullanımda/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
});

router.post('/claim-monthly-reward', verifyAuth, async (req, res) => {
  try {
    await colUsers().doc(req.user.uid).set({ pendingReward: admin.firestore.FieldValue.delete() }, { merge: true });
    return res.json({ ok: true });
  } catch (error) { return res.status(500).json({ ok: false, error: 'Ödül onayı işlenemedi.' }); }
});

router.post('/wheel/spin', verifyAuth, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Çark çevirmek için e-postanızı onaylamalısınız!");

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(colUsers().doc(req.user.uid));
      if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {};
      if ((nowMs() - safeNum(u.lastSpin, 0)) < 86400000) throw new Error("Henüz süre dolmadı.");

      const rewards = [2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000];
      const rnd = crypto.randomInt(0, rewards.length);
      const spinAt = nowMs();
      const grant = await applyRewardGrantInTransaction(tx, {
        uid: req.user.uid,
        amount: rewards[rnd],
        source: 'wheel_spin',
        referenceId: `wheel:${req.user.uid}:${spinAt}`,
        idempotencyKey: `wheel_spin:${req.user.uid}:${spinAt}`,
        userPatch: { lastSpin: spinAt }
      });
      return { index: rnd, prize: rewards[rnd], grant };
    });
    createRewardNotificationForGrant(out.grant, { data: { source: 'wheel_spin', amount: out.prize, spinIndex: out.index } }).catch(() => null);
    const { grant, ...response } = out;
    res.json({ ok: true, ...response, duplicated: !!grant?.duplicated });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/bonus/claim', verifyAuth, bonusLimiter, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Promosyon kodu kullanmak için e-postanızı onaylamalısınız!");

    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!code) throw new Error("Kod boş.");

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
      if (p.active === false) throw new Error("Kod pasif durumda.");
      if (safeNum(p.expiresAt, 0) > 0 && safeNum(p.expiresAt, 0) < nowMs()) throw new Error("Kod süresi dolmuş.");

      if ((u.usedPromos || []).includes(code)) throw new Error("Kod geçersiz veya kullanılmış.");
      if (safeNum(p.limitLeft, -1) === 0) throw new Error("Kod tükenmiş.");

      const grant = await applyRewardGrantInTransaction(tx, {
        uid: req.user.uid,
        amount: p.amount,
        source: 'promo_code',
        referenceId: code,
        idempotencyKey: `promo_code:${code}:${req.user.uid}`,
        meta: { code, promoDocId },
        userPatch: { usedPromos: admin.firestore.FieldValue.arrayUnion(code) }
      });
      if (safeNum(p.limitLeft, -1) > 0) tx.update(pRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });

      return { amount: p.amount, code: promoDocId, grant };
    });

    createRewardNotificationForGrant(out.grant, { data: { source: 'promo_code', code, amount: out.amount } }).catch(() => null);
    const { grant, ...response } = out;
    res.json({ ok: true, ...response, duplicated: !!grant?.duplicated });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.get('/referral/link', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const uRef = colUsers().doc(uid);
    const snap = await uRef.get();
    if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
    const u = snap.data() || {};

    let code = u.referralCode;
    if (!code) {
      code = genReferralCode(uid);
      await uRef.set({ referralCode: code }, { merge:true });
    }

    const configuredBase = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const originHeader = String(req.headers.origin || '').trim().replace(/\/+$/, '');
    const safeBase = configuredBase || originHeader || 'https://playmatrix.com.tr';
    
    res.json({ ok:true, code, link: code ? `${safeBase}/?ref=${code}` : '' });
  } catch(e){ res.json({ ok:false, error:e.message }); }
});

router.post('/referral/claim', verifyAuth, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Davet ödülü için önce e-postanızı doğrulamalısınız.");
    if (isDisposableEmail(req.user.email)) throw new Error("Güvenlik: Geçici e-posta ile davet ödülü verilemez.");

    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new Error("Davet kodu geçersiz.");

    const REF_INVITER_REWARD = getRewardAmount('referral_inviter', 50000);
    const REF_INVITEE_REWARD = getRewardAmount('referral_invitee', 10000);

    const out = await db.runTransaction(async (tx) => {
      const uid = req.user.uid;
      const uRef = colUsers().doc(uid);
      const uSnap = await tx.get(uRef);
      if (!uSnap.exists) throw new Error("Kullanıcı bulunamadı.");

      const u = uSnap.data() || {};
      if (u.referredBy || u.referralClaimedAt) throw new Error("Bu hesap zaten bir davet kodu kullanmış.");

      const q = await tx.get(colUsers().where('referralCode', '==', code).limit(1));
      if (q.empty) throw new Error("Davet kodu bulunamadı.");

      const inviterUid = q.docs[0].id;
      if (inviterUid === uid) throw new Error("Kendi davet kodunuz kullanılamaz.");

      tx.set(uRef, { referredBy: inviterUid, referralCodeUsed: code, referralClaimedAt: nowMs() }, { merge: true });

      return { inviterUid, inviterReward: REF_INVITER_REWARD, inviteeReward: REF_INVITEE_REWARD };
    });

    const referralGrants = await Promise.allSettled([
      out.inviterReward > 0 ? grantReward({
        uid: out.inviterUid,
        amount: out.inviterReward,
        source: 'referral_inviter',
        referenceId: code,
        idempotencyKey: `referral_inviter:${code}:${out.inviterUid}:${req.user.uid}`,
        meta: { code, claimedBy: req.user.uid },
        userPatch: { referralCount: admin.firestore.FieldValue.increment(1) },
        notification: { data: { code, claimedBy: req.user.uid } }
      }) : Promise.resolve(null),
      out.inviteeReward > 0 ? grantReward({
        uid: req.user.uid,
        amount: out.inviteeReward,
        source: 'referral_invitee',
        referenceId: code,
        idempotencyKey: `referral_invitee:${code}:${req.user.uid}:${out.inviterUid}`,
        meta: { code, inviterUid: out.inviterUid },
        notification: { data: { code, inviterUid: out.inviterUid } }
      }) : Promise.resolve(null)
    ]);

    res.json({ ok: true, ...out, rewardAudit: referralGrants.map((item) => item.status === 'fulfilled' ? { ok: true, ledgerId: item.value?.id || '', duplicated: !!item.value?.duplicated } : { ok: false, error: String(item.reason?.message || item.reason || 'grant_failed') }) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
