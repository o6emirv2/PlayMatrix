'use strict';

const express = require('express');
const router = express.Router();

const { db, admin } = require('../config/firebase');
const { verifyAuth, tryVerifyOptionalAuth } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum, nowMs } = require('../utils/helpers');
const {
  colUsers,
  pickUserSelectedFrame,
  resolvePublicUsername
} = require('../utils/socialKit');
const { createNotification } = require('../utils/notifications');
const { recordRewardLedger, listRewardLedgerForUid, summarizeRewardLedgerForUid } = require('../utils/rewardLedger');
const { captureError } = require('../utils/errorMonitor');
const { listPresenceForUids } = require('../utils/realtimeState');
const { buildProgressionSnapshot } = require('../utils/progression');
const { CHAT_RETENTION_POLICY } = require('../config/constants');
const { listActiveSessionsForUid } = require('../utils/gameSession');
const { getActivityCalendarParts, normalizePeriodClaimMap } = require('../utils/activityPeriod');
const { listRewardCatalog, buildRewardCatalogSummary } = require('../config/rewardCatalog');
const { listMatchHistoryForUid, summarizeMatchHistoryForUid } = require('../utils/matchHistory');
const { buildAchievementBoard, buildMissionBoard } = require('../utils/achievementBoard');
const { buildPlatformControlSnapshot } = require('../utils/platformControl');
const { DEFAULT_AVATAR, sanitizeAvatarForStorage } = require('../utils/avatarManifest');

const colFriends = () => db.collection('friends');
const colMatchHistory = () => db.collection('match_history');

const PASS_MILESTONES = Object.freeze([
  { level: 1, need: 10, rewardMc: 2500, badge: 'Başlangıç' },
  { level: 2, need: 25, rewardMc: 5000, badge: 'Aktif Oyuncu' },
  { level: 3, need: 50, rewardMc: 7500, badge: 'Sosyal Usta' },
  { level: 4, need: 80, rewardMc: 10000, badge: 'Aktiflik Koşucusu' },
  { level: 5, need: 120, rewardMc: 15000, badge: 'PlayMatrix Elite' }
]);

function buildMemberPayload(uid, data = {}, options = {}) {
  const presence = options.presence || null;
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
  return {
    uid,
    username: options.username || 'Oyuncu',
    avatar: sanitizeAvatarForStorage(data.avatar) || DEFAULT_AVATAR,
    selectedFrame: pickUserSelectedFrame({ ...data, accountLevel: progression.accountLevel }),
    accountLevelScore: progression.accountLevelScore,
    accountLevelProgressPct: progression.accountLevelProgressPct,
    accountLevel: progression.accountLevel,
    accountXp: progression.accountXp,
    monthlyActiveScore: progression.monthlyActivity,
    unreadMessages: safeNum(data.unread_messages, 0),
    lastSeen: safeNum(data.lastSeen?.toMillis?.() || data.lastSeen || data.lastActiveAt, 0),
    totalRank: progression.totalRank,
    totalRankClass: progression.totalRankClass,
    activityRank: progression.activityRank,
    activityRankClass: progression.activityRankClass,
    progression: {
      ...progression,
      accountLevel: progression.accountLevel,
      accountXp: progression.accountXp,
      monthlyActivity: progression.monthlyActivity,
      accountLevelScore: progression.accountLevelScore,
      accountLevelProgressPct: progression.accountLevelProgressPct,
      selectedFrame: pickUserSelectedFrame({ ...data, accountLevel: progression.accountLevel })
    },
    stats: {
      totalRounds,
      totalWins,
      totalLosses,
      totalSpentMc: safeNum(data.totalSpentMc, 0),
      chessWins,
      chessLosses,
      pistiWins,
      pistiLosses,
      crashRounds,
      crashWins,
      crashLosses
    },
    presence,
    online: !!presence?.online
  };
}

async function buildPublicMember(uid, presenceMap = null) {
  const snap = await colUsers().doc(uid).get().catch(() => null);
  const data = snap?.exists ? (snap.data() || {}) : {};
  const presence = presenceMap instanceof Map ? (presenceMap.get(uid) || null) : null;
  return buildMemberPayload(uid, data, {
    username: await resolvePublicUsername(uid, data),
    presence
  });
}

async function getAcceptedFriendUids(uid, limit = 30) {
  const [aSnap, bSnap] = await Promise.all([
    colFriends().where('requesterUid', '==', uid).limit(Math.max(limit, 60)).get().catch(() => ({ docs: [] })),
    colFriends().where('recipientUid', '==', uid).limit(Math.max(limit, 60)).get().catch(() => ({ docs: [] }))
  ]);
  const uids = new Set();
  aSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (cleanStr(data.status || '', 16) === 'accepted' && data.recipientUid) uids.add(cleanStr(data.recipientUid, 160));
  });
  bSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (cleanStr(data.status || '', 16) === 'accepted' && data.requesterUid) uids.add(cleanStr(data.requesterUid, 160));
  });
  return Array.from(uids).filter(Boolean).slice(0, limit);
}




function getPassPayload(user = {}) {
  const score = safeNum(user.monthlyActiveScore, 0);
  const currentPeriodKey = getActivityCalendarParts().periodKey;
  const claimed = normalizePeriodClaimMap(user.activityPassClaimed, currentPeriodKey);
  const levels = PASS_MILESTONES.map((item) => ({
    ...item,
    unlocked: score >= item.need,
    claimed: !!claimed[String(item.level)],
    progressPct: Math.max(0, Math.min(100, Math.round((score / Math.max(1, item.need)) * 100)))
  }));
  return {
    score,
    periodKey: currentPeriodKey,
    currentLevel: levels.reduce((acc, item) => item.unlocked ? item.level : acc, 0),
    nextLevel: levels.find((item) => !item.unlocked) || null,
    totalRewardMc: levels.reduce((sum, item) => sum + safeNum(item.rewardMc, 0), 0),
    claimedRewardMc: levels.filter((item) => item.claimed).reduce((sum, item) => sum + safeNum(item.rewardMc, 0), 0),
    levels
  };
}

function buildRecentPlayersMap(historyItems = [], uid = '') {
  const recentPlayersMap = new Map();
  (historyItems || []).forEach((item) => {
    const participants = Array.isArray(item.participants) ? item.participants.map((entry) => cleanStr(entry || '', 160)).filter(Boolean) : [];
    participants.filter((participantUid) => participantUid && participantUid !== uid).forEach((participantUid) => {
      if (!recentPlayersMap.has(participantUid)) recentPlayersMap.set(participantUid, safeNum(item.createdAt, 0));
    });
  });
  return recentPlayersMap;
}

function buildActivityFeed(matchItems = [], rewardItems = []) {
  const matchEvents = (matchItems || []).map((item) => ({
    id: `match:${item.id}`,
    type: cleanStr(item.gameType || 'match', 40),
    title: item.title || 'Maç',
    createdAt: safeNum(item.createdAt, 0),
    result: item.result || item.outcome || '',
    icon: '🎮'
  }));
  const rewardEvents = (rewardItems || []).map((item) => ({
    id: `reward:${item.id}`,
    type: 'reward',
    title: item.label || 'Ödül',
    createdAt: safeNum(item.createdAt || item.timestamp, 0),
    result: `${safeNum(item.amount, 0).toLocaleString('tr-TR')} ${item.currency || 'MC'}`,
    icon: '🎁'
  }));
  return [...matchEvents, ...rewardEvents]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 12);
}

function buildSummaryEnvelope(payload = {}) {
  const summary = {
    me: payload.me || null,
    friends: Array.isArray(payload.friends) ? payload.friends : [],
    recentPlayers: Array.isArray(payload.recentPlayers) ? payload.recentPlayers : [],
    recentMatches: Array.isArray(payload.recentMatches) ? payload.recentMatches : [],
    matchCenter: payload.matchCenter || { summary: null, items: [], nextCursor: '' },
    activeSessions: Array.isArray(payload.activeSessions) ? payload.activeSessions : [],
    chatPolicy: payload.chatPolicy || null,
    rewardCenter: payload.rewardCenter || null,
    socialStats: Array.isArray(payload.socialStats) ? payload.socialStats : [],
    activityFeed: Array.isArray(payload.activityFeed) ? payload.activityFeed : []
  };
  return {
    ok: true,
    schemaVersion: 2,
    generatedAt: nowMs(),
    summary,
    me: summary.me,
    friends: summary.friends,
    recentPlayers: summary.recentPlayers,
    recentMatches: summary.recentMatches,
    matchCenter: summary.matchCenter,
    activeSessions: summary.activeSessions,
    chatPolicy: summary.chatPolicy,
    rewardCenter: summary.rewardCenter,
    socialStats: summary.socialStats,
    activityFeed: summary.activityFeed
  };
}

router.get('/social-center/summary', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [meSnap, friendUids, rewardCenterPage, rewardCenterSummary, activeSessions, matchPage, matchSummary] = await Promise.all([
      colUsers().doc(uid).get(),
      getAcceptedFriendUids(uid, 20),
      listRewardLedgerForUid(uid, { limit: 8 }),
      summarizeRewardLedgerForUid(uid, { sampleLimit: 150 }),
      listActiveSessionsForUid(uid),
      listMatchHistoryForUid(uid, { limit: 20 }),
      summarizeMatchHistoryForUid(uid, { sampleLimit: 120 })
    ]);
    const me = meSnap.exists ? (meSnap.data() || {}) : {};
    const meProgression = buildProgressionSnapshot(me);
    const presenceUidSet = new Set([uid, ...friendUids]);
    (matchPage.items || []).forEach((item) => {
      (Array.isArray(item.participants) ? item.participants : []).forEach((participantUid) => {
        const safeParticipantUid = cleanStr(participantUid || '', 160);
        if (safeParticipantUid) presenceUidSet.add(safeParticipantUid);
      });
    });
    const presenceMap = await listPresenceForUids(Array.from(presenceUidSet));
    const friends = await Promise.all(friendUids.map((friendUid) => buildPublicMember(friendUid, presenceMap)));
    friends.sort((a, b) => {
      const onlineDelta = Number(!!b.online) - Number(!!a.online);
      if (onlineDelta !== 0) return onlineDelta;
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });

    const recentPlayersMap = buildRecentPlayersMap(matchPage.items, uid);
    const recentPlayers = await Promise.all(Array.from(recentPlayersMap.keys()).slice(0, 10).map((playerUid) => buildPublicMember(playerUid, presenceMap)));

    const showcase = {
      title: cleanStr(me.showcaseTitle || '', 40),
      bio: cleanStr(me.showcaseBio || '', 180),
      favoriteGame: cleanStr(me.favoriteGame || '', 24),
      selectedBadge: cleanStr(me.selectedBadge || '', 32),
      profileBanner: cleanStr(me.profileBanner || '', 220),
    };

    const catalog = listRewardCatalog({ includePrivate: false });
    const rewardCatalogSummary = buildRewardCatalogSummary({ includePrivate: false });
    const achievementBoard = buildAchievementBoard({
      user: { ...me, accountLevel: meProgression.accountLevel, progression: meProgression },
      matchSummary,
      rewardSummary: rewardCenterSummary,
      context: { friendCount: friendUids.length }
    });
    const missionBoard = buildMissionBoard({
      user: { ...me, accountLevel: meProgression.accountLevel, progression: meProgression },
      matchSummary,
      rewardSummary: rewardCenterSummary,
      context: { friendCount: friendUids.length }
    });

    return res.json(buildSummaryEnvelope({
  me: {
    ...buildMemberPayload(uid, me, {
      username: await resolvePublicUsername(uid, me),
      presence: presenceMap.get(uid) || null
    }),
    showcase,
    activityPass: getPassPayload(me)
  },
  friends,
  recentPlayers,
  recentMatches: matchPage.items,
  matchCenter: {
    summary: matchSummary,
    items: matchPage.items,
    nextCursor: matchPage.nextCursor
  },
  activeSessions: (activeSessions || []).map((item) => ({
    ...item,
    resumePath: item.gameType === 'pisti' ? './pisti' : './satranc'
  })),
  chatPolicy: CHAT_RETENTION_POLICY,
  rewardCenter: {
    summary: rewardCenterSummary,
    items: rewardCenterPage.items,
    nextCursor: rewardCenterPage.nextCursor,
    catalog,
    catalogSummary: rewardCatalogSummary
  },
  socialStats: [
    { key: 'friends_online', label: 'Çevrimiçi Arkadaş', value: friends.filter((item) => item.online).length },
    { key: 'unread_messages', label: 'Okunmamış Mesaj', value: safeNum(me.unread_messages, 0) },
    { key: 'activity_score', label: 'Aylık Aktiflik', value: safeNum(me.monthlyActiveScore, 0) },
    { key: 'match_wins', label: 'Galibiyet', value: safeNum(matchSummary.wins, 0) },
    { key: 'reward_total', label: 'Toplam Ödül', value: safeNum(rewardCenterSummary.totalMc, 0) }
  ],
  activityFeed: buildActivityFeed(matchPage.items, rewardCenterPage.items)
}));
  } catch (error) {
    await captureError(error, { route: 'social-center.summary', uid: req.user?.uid || '' });
    return res.status(500).json({ ok: false, error: 'Sosyal merkez özeti yüklenemedi.' });
  }
});

router.post('/me/showcase', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const payload = {
      showcaseTitle: cleanStr(req.body?.title || '', 40),
      showcaseBio: cleanStr(req.body?.bio || '', 180),
      favoriteGame: cleanStr(req.body?.favoriteGame || '', 24),
      selectedBadge: cleanStr(req.body?.selectedBadge || '', 32),
      profileBanner: cleanStr(req.body?.profileBanner || '', 220),
      updatedAt: nowMs()
    };
    await colUsers().doc(uid).set(payload, { merge: true });
    return res.json({ ok: true, showcase: payload });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Profil vitrini kaydedilemedi.' });
  }
});

router.get('/showcase/:uid', tryVerifyOptionalAuth, async (req, res) => {
  try {
    const uid = cleanStr(req.params?.uid || '', 160);
    if (!uid) throw new Error('Geçersiz kullanıcı.');
    const snap = await colUsers().doc(uid).get();
    if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
    const user = snap.data() || {};
    const historyPage = await listMatchHistoryForUid(uid, { limit: 20 });
    return res.json({
      ok: true,
      schemaVersion: 1,
      profile: {
        ...buildMemberPayload(uid, user, {
          username: await resolvePublicUsername(uid, user),
          presence: null
        }),
        showcase: {
          title: cleanStr(user.showcaseTitle || '', 40),
          bio: cleanStr(user.showcaseBio || '', 180),
          favoriteGame: cleanStr(user.favoriteGame || '', 24),
          selectedBadge: cleanStr(user.selectedBadge || '', 32),
          profileBanner: cleanStr(user.profileBanner || '', 220)
        },
        recentMatches: historyPage.items.slice(0, 6)
      }
    });
  } catch (error) {
    return res.status(404).json({ ok: false, error: error.message || 'Profil vitrini yüklenemedi.' });
  }
});

router.get('/activity-pass', verifyAuth, async (req, res) => {
  try {
    const snap = await colUsers().doc(req.user.uid).get();
    const user = snap.exists ? (snap.data() || {}) : {};
    return res.json({ ok: true, pass: getPassPayload(user) });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Activity Pass bilgisi yüklenemedi.' });
  }
});

router.post('/activity-pass/claim', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const level = Math.max(1, Math.min(99, Math.floor(safeNum(req.body?.level, 0))));
    const milestone = PASS_MILESTONES.find((item) => item.level === level);
    if (!milestone) throw new Error('Geçersiz seviye.');

    const result = await db.runTransaction(async (tx) => {
      const ref = colUsers().doc(uid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
      const user = snap.data() || {};
      const score = safeNum(user.monthlyActiveScore, 0);
      const currentPeriodKey = getActivityCalendarParts().periodKey;
      const claimed = normalizePeriodClaimMap(user.activityPassClaimed, currentPeriodKey);
      if (score < milestone.need) throw new Error('Bu seviye henüz açılmadı.');
      if (claimed[String(level)]) throw new Error('Bu ödül zaten alındı.');
      claimed.__periodKey = currentPeriodKey;
      claimed[String(level)] = nowMs();
      tx.set(ref, {
        balance: admin.firestore.FieldValue.increment(milestone.rewardMc),
        activityPassClaimed: claimed,
        activityPassClaimedPeriodKey: currentPeriodKey,
        selectedBadge: cleanStr(user.selectedBadge || milestone.badge, 32) || milestone.badge,
        updatedAt: nowMs()
      }, { merge: true });
      return { rewardMc: milestone.rewardMc, badge: milestone.badge };
    });

    await Promise.allSettled([
      recordRewardLedger({ uid, amount: result.rewardMc, source: 'activity_pass', referenceId: `activity-pass:${level}` }),
      createNotification({ uid, type: 'reward', title: `Activity Pass Seviye ${level}`, body: `${result.rewardMc.toLocaleString('tr-TR')} MC ve ${result.badge} rozeti hesabına eklendi.` })
    ]);

    return res.json({ ok: true, rewardMc: result.rewardMc, badge: result.badge });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Activity Pass ödülü alınamadı.' });
  }
});

router.get('/rewards/center', verifyAuth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, safeNum(req.query?.limit, 20)));
    const cursor = cleanStr(req.query?.cursor || '', 220);
    const [page, summary] = await Promise.all([
      listRewardLedgerForUid(req.user.uid, { limit, cursor }),
      summarizeRewardLedgerForUid(req.user.uid, { sampleLimit: 150 })
    ]);
    return res.json({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor,
      summary,
      catalog: listRewardCatalog({ includePrivate: false }),
      catalogSummary: buildRewardCatalogSummary({ includePrivate: false })
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Ödül merkezi yüklenemedi.' });
  }
});

router.get('/rewards/catalog', verifyAuth, async (_req, res) => {
  return res.json({
    ok: true,
    items: listRewardCatalog({ includePrivate: false }),
    summary: buildRewardCatalogSummary({ includePrivate: false })
  });
});

router.get('/matches/history', verifyAuth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, safeNum(req.query?.limit, 20)));
    const cursor = cleanStr(req.query?.cursor || '', 220);
    const gameType = cleanStr(req.query?.gameType || '', 24).toLowerCase();
    const [page, summary] = await Promise.all([
      listMatchHistoryForUid(req.user.uid, { limit, cursor, gameType }),
      summarizeMatchHistoryForUid(req.user.uid, { sampleLimit: 120 })
    ]);
    return res.json({ ok: true, items: page.items, nextCursor: page.nextCursor, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Maç geçmişi yüklenemedi.' });
  }
});

router.get('/achievements', verifyAuth, async (req, res) => {
  try {
    const [userSnap, matchSummary, rewardSummary, friendUids] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      summarizeMatchHistoryForUid(req.user.uid, { sampleLimit: 120 }),
      summarizeRewardLedgerForUid(req.user.uid, { sampleLimit: 120 }),
      getAcceptedFriendUids(req.user.uid, 50)
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const board = buildAchievementBoard({ user, matchSummary, rewardSummary, context: { friendCount: friendUids.length } });
    return res.json({ ok: true, ...board });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Başarılar yüklenemedi.' });
  }
});

router.get('/missions', verifyAuth, async (req, res) => {
  try {
    const [userSnap, matchSummary, rewardSummary, friendUids] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      summarizeMatchHistoryForUid(req.user.uid, { sampleLimit: 120 }),
      summarizeRewardLedgerForUid(req.user.uid, { sampleLimit: 120 }),
      getAcceptedFriendUids(req.user.uid, 50)
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const board = buildMissionBoard({ user, matchSummary, rewardSummary, context: { friendCount: friendUids.length } });
    return res.json({ ok: true, ...board });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Görev panosu yüklenemedi.' });
  }
});



router.get('/platform/control', verifyAuth, async (req, res) => {
  try {
    const [userSnap, rewardSummary, activeSessions] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      Promise.resolve(buildRewardCatalogSummary({ includePrivate: false })),
      listActiveSessionsForUid(req.user.uid)
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const snapshot = buildPlatformControlSnapshot({
      rewardCatalogSummary: rewardSummary,
      activeSessions,
      users: [user]
    });
    return res.json({ ok: true, control: snapshot });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Platform kontrol özeti yüklenemedi.' });
  }
});

module.exports = router;
