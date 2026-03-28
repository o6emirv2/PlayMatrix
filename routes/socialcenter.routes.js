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
  resolvePublicUsername,
  getSocialEdge,
  setSocialEdgeFlags
} = require('../utils/socialKit');
const { createNotification, listNotifications } = require('../utils/notifications');
const { recordRewardLedger, listRewardLedgerForUid, summarizeRewardLedgerForUid } = require('../utils/rewardLedger');
const { captureError } = require('../utils/errorMonitor');
const { listPresenceForUids } = require('../utils/realtimeState');
const { buildProgressionSnapshot } = require('../utils/progression');
const { listActiveSessionsForUid } = require('../utils/gameSession');
const { getSeasonCalendarParts, normalizePeriodClaimMap } = require('../utils/season');
const { SOCKET_INVITE_WINDOW_MS, SOCKET_INVITE_MAX_PER_WINDOW } = require('../config/constants');
const { DEFAULT_FEATURE_FLAGS } = require('../config/featureFlags');
const { buildRewardCatalogSummary } = require('../config/rewardCatalog');
const { listMatchHistoryForUid, summarizeMatchHistoryForUid } = require('../utils/matchHistory');
const { buildAchievementBoard, buildMissionBoard } = require('../utils/achievementBoard');
const { buildVipCenterSnapshot, buildVipCatalog } = require('../utils/vipCenter');
const { buildProfileHub, buildEconomyHub, buildInventoryHub, buildGameExperienceHub, resolveInventorySlot, mapInventoryFieldForSlot } = require('../utils/experienceCenter');
const { buildPlatformControlSnapshot } = require('../utils/platformControl');
const { buildStatsCenterSnapshot, buildResetScheduleSnapshot } = require('../utils/statsCenter');
const { getChatRetentionPolicyConfig, getRewardCatalogConfig } = require('../utils/adminConfig');
const { getRewardRuntimeCatalog, getActivityPassMilestones } = require('../utils/rewardCenter');
const { sendApiSuccess, sendApiError } = require('../utils/apiResponse');
const { buildInviteCooldownSnapshot, buildPartyInviteSnapshot } = require('../utils/inviteCenter');
const { buildSocialHubSnapshot } = require('../utils/socialHub');
const { buildSeasonalShopRuntime, purchaseSeasonalShopItem } = require('../utils/seasonalShopCenter');
const { buildSpectatorModeCenter, buildReplayCenter, buildMatchSummaryShareCard, buildPostGameAnalytics, buildSpectatorPath } = require('../utils/gameProductCenter');

const colFriends = () => db.collection('friends');
const colMatchHistory = () => db.collection('match_history');
const colParties = () => db.collection('parties');
const colPartyInvites = () => db.collection('party_invites');
const colGameInvites = () => db.collection('game_invites');

const colChessSpectator = () => db.collection('chess_rooms');
const colPistiSpectator = () => db.collection('pisti_online_rooms');
const colBlackjackSpectator = () => db.collection('blackjack_sessions');


async function buildPublicMember(uid, presenceMap = null) {
  const snap = await colUsers().doc(uid).get().catch(() => null);
  const data = snap?.exists ? (snap.data() || {}) : {};
  const presence = presenceMap instanceof Map ? (presenceMap.get(uid) || null) : null;
  const progression = buildProgressionSnapshot(data);
  return {
    uid,
    username: await resolvePublicUsername(uid, data),
    avatar: data.avatar || '',
    selectedFrame: pickUserSelectedFrame(data),
    rp: progression.competitiveScore,
    competitiveScore: progression.competitiveScore,
    totalRank: progression.totalRank,
    totalRankClass: progression.totalRankClass,
    seasonRp: progression.seasonScore,
    seasonRank: progression.seasonRank,
    accountLevel: progression.accountLevel,
    monthlyActiveScore: progression.monthlyActivity,
    unreadMessages: safeNum(data.unread_messages, 0),
    lastSeen: safeNum(data.lastSeen?.toMillis?.() || data.lastSeen || data.lastActiveAt, 0),
    progression,
    presence,
    online: !!presence?.online
  };
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

async function getPartySnapshotByUid(uid) {
  const snap = await colParties().where('memberUids', 'array-contains', uid).limit(10).get().catch(() => ({ empty: true, docs: [] }));
  const doc = (snap.docs || []).find((entry) => cleanStr(entry.data()?.status || 'active', 16) === 'active');
  if (!doc) return null;
  const data = doc.data() || {};
  return {
    id: doc.id,
    leaderUid: cleanStr(data.leaderUid || '', 160),
    members: Array.isArray(data.members) ? data.members : [],
    memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
    readyCount: safeNum(data.readyCount, 0),
    gameContext: data.gameContext && typeof data.gameContext === 'object' ? data.gameContext : null,
    updatedAt: safeNum(data.updatedAt, 0)
  };
}

async function getIncomingPartyInvites(uid) {
  const snap = await colPartyInvites().where('targetUid', '==', uid).limit(20).get().catch(() => ({ docs: [] }));
  const now = nowMs();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((item) => cleanStr(item.status || 'pending', 16) === 'pending' && safeNum(item.expiresAt, 0) > now)
    .slice(0, 10);
}


async function getOutgoingPartyInvites(uid) {
  const snap = await colPartyInvites().where('fromUid', '==', uid).limit(20).get().catch(() => ({ docs: [] }));
  const now = nowMs();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((item) => cleanStr(item.status || 'pending', 16) === 'pending' && safeNum(item.expiresAt, 0) > now)
    .slice(0, 10);
}

function getPassPayload(user = {}, milestones = []) {
  const score = safeNum(user.monthlyActiveScore, 0);
  const currentSeasonKey = getSeasonCalendarParts().seasonKey;
  const claimed = normalizePeriodClaimMap(user.activityPassClaimed, currentSeasonKey);
  const levels = (Array.isArray(milestones) ? milestones : []).map((item) => ({
    ...item,
    unlocked: score >= item.need,
    claimed: !!claimed[String(item.level)],
    progressPct: Math.max(0, Math.min(100, Math.round((score / Math.max(1, item.need)) * 100)))
  }));
  return {
    score,
    seasonKey: currentSeasonKey,
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


function buildSpectatorSnapshotForGame(gameType = '', roomId = '', data = {}) {
  const safeGameType = cleanStr(gameType || '', 24).toLowerCase();
  const safeRoomId = cleanStr(roomId || '', 160);
  if (!safeRoomId) return null;
  if (safeGameType === 'chess') {
    const host = data?.host && typeof data.host === 'object' ? data.host : {};
    const guest = data?.guest && typeof data.guest === 'object' ? data.guest : {};
    return {
      gameType: safeGameType,
      roomId: safeRoomId,
      title: 'Satranç Canlı Oda',
      status: cleanStr(data?.status || 'waiting', 24),
      playerCount: Number(!!host.uid) + Number(!!guest.uid),
      players: [host, guest].filter((item) => cleanStr(item?.uid || '', 160)).map((item) => ({ uid: cleanStr(item?.uid || '', 160), username: cleanStr(item?.username || 'Oyuncu', 40) || 'Oyuncu', avatar: cleanStr(item?.avatar || '', 220), selectedFrame: item?.selectedFrame || 0 })),
      turn: cleanStr(data?.turn || '', 8),
      updatedAt: safeNum(data?.updatedAt, 0),
      cleanupAt: safeNum(data?.cleanupAt, 0),
      note: 'İzleyici modu oda özeti gösterir; oyun müdahalesi yapmaz.'
    };
  }
  if (safeGameType === 'pisti') {
    const players = Array.isArray(data?.players) ? data.players : [];
    return {
      gameType: safeGameType,
      roomId: safeRoomId,
      title: 'Online Pişti Canlı Masa',
      status: cleanStr(data?.status || 'waiting', 24),
      playerCount: players.length,
      players: players.slice(0, 4).map((item) => ({ uid: cleanStr(item?.uid || '', 160), username: cleanStr(item?.username || 'Oyuncu', 40) || 'Oyuncu', avatar: cleanStr(item?.avatar || '', 220), selectedFrame: item?.selectedFrame || 0, score: safeNum(item?.score, 0), cardCount: safeNum(item?.cardCount, 0) })),
      turn: safeNum(data?.turn, 0),
      updatedAt: safeNum(data?.updatedAt, 0),
      cleanupAt: safeNum(data?.cleanupAt, 0),
      note: 'İzleyici modu masa özetini ve skor akışını gösterir.'
    };
  }
  if (safeGameType === 'blackjack') {
    const hands = Array.isArray(data?.hands) ? data.hands : [];
    return {
      gameType: safeGameType,
      roomId: safeRoomId,
      title: 'BlackJack Oturum Özeti',
      status: cleanStr(data?.gameState || data?.status || 'idle', 24),
      playerCount: hands.length ? 1 : 0,
      players: [{ uid: safeRoomId, username: 'Aktif Oyuncu', avatar: '', selectedFrame: 0, handCount: hands.length }],
      updatedAt: safeNum(data?.updatedAt, 0),
      cleanupAt: safeNum(data?.cleanupAt, 0),
      note: 'İzleyici modu sonuç ve masa özetini gösterir.'
    };
  }
  return null;
}

async function getSpectatorSnapshot(gameType = '', roomId = '') {
  const safeGameType = cleanStr(gameType || '', 24).toLowerCase();
  const safeRoomId = cleanStr(roomId || '', 160);
  if (!safeRoomId) return null;
  if (safeGameType === 'chess') {
    const snap = await colChessSpectator().doc(safeRoomId).get().catch(() => null);
    return snap?.exists ? buildSpectatorSnapshotForGame(safeGameType, safeRoomId, snap.data() || {}) : null;
  }
  if (safeGameType === 'pisti') {
    const snap = await colPistiSpectator().doc(safeRoomId).get().catch(() => null);
    return snap?.exists ? buildSpectatorSnapshotForGame(safeGameType, safeRoomId, snap.data() || {}) : null;
  }
  if (safeGameType === 'blackjack') {
    const snap = await colBlackjackSpectator().doc(safeRoomId).get().catch(() => null);
    return snap?.exists ? buildSpectatorSnapshotForGame(safeGameType, safeRoomId, snap.data() || {}) : null;
  }
  return null;
}

async function buildFriendEdgeMap(uid, friendUids = []) {
  const entries = await Promise.all((Array.isArray(friendUids) ? friendUids : []).map(async (friendUid) => {
    const edge = await getSocialEdge(uid, friendUid);
    return [friendUid, {
      pinned: !!edge?.pinned,
      note: cleanStr(edge?.note || '', 180),
      muted: !!edge?.muted,
      archived: !!edge?.archived,
      updatedAt: safeNum(edge?.updatedAt, 0)
    }];
  }));
  return new Map(entries);
}

async function getOutgoingGameInvites(uid) {
  const snap = await colGameInvites().where('hostUid', '==', uid).limit(20).get().catch(() => ({ docs: [] }));
  const now = nowMs();
  return (snap.docs || [])
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((item) => cleanStr(item.status || 'pending', 16) === 'pending' && safeNum(item.expiresAt, 0) > now)
    .sort((a, b) => safeNum(a.expiresAt, 0) - safeNum(b.expiresAt, 0))
    .slice(0, 10);
}

function buildPartyVoicePlaceholder(party = null, user = {}) {
  return {
    enabled: user?.partyVoiceEnabled !== false,
    status: party ? 'ready' : 'idle',
    provider: 'placeholder',
    roomId: cleanStr(party?.id || '', 160),
    label: party ? 'Parti ses kanalı hazır' : 'Parti kurulduğunda ses kanalı alanı görünür'
  };
}


router.get('/social-center/summary', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [meSnap, friendUids, party, invites, outgoingPartyInvites, outgoingGameInvites, rewardCenterPage, rewardCenterSummary, activeSessions, matchPage, matchSummary, notifications] = await Promise.all([
      colUsers().doc(uid).get(),
      getAcceptedFriendUids(uid, 20),
      getPartySnapshotByUid(uid),
      getIncomingPartyInvites(uid),
      getOutgoingPartyInvites(uid),
      getOutgoingGameInvites(uid),
      listRewardLedgerForUid(uid, { limit: 12 }),
      summarizeRewardLedgerForUid(uid, { sampleLimit: 180 }),
      listActiveSessionsForUid(uid, { includeBlackjack: true }),
      listMatchHistoryForUid(uid, { limit: 24 }),
      summarizeMatchHistoryForUid(uid, { sampleLimit: 150 }),
      listNotifications(uid, 12)
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

    const recentPlayersMap = buildRecentPlayersMap(matchPage.items, uid);
    const friendEdgeMap = await buildFriendEdgeMap(uid, friendUids);
    friends.forEach((friend) => {
      const edge = friendEdgeMap.get(friend.uid) || {};
      friend.pinned = !!edge.pinned;
      friend.note = cleanStr(edge.note || '', 180);
      friend.archived = !!edge.archived;
      friend.muted = !!edge.muted;
      friend.lastPlayedAt = safeNum(recentPlayersMap.get(friend.uid), 0);
    });
    friends.sort((a, b) => {
      const pinDelta = Number(!!b.pinned) - Number(!!a.pinned);
      if (pinDelta !== 0) return pinDelta;
      const onlineDelta = Number(!!b.online) - Number(!!a.online);
      if (onlineDelta !== 0) return onlineDelta;
      return Math.max(b.lastPlayedAt || 0, b.lastSeen || 0) - Math.max(a.lastPlayedAt || 0, a.lastSeen || 0);
    });
    const recentPlayers = await Promise.all(Array.from(recentPlayersMap.keys()).slice(0, 10).map((playerUid) => buildPublicMember(playerUid, presenceMap)));

    const showcase = {
      title: cleanStr(me.showcaseTitle || '', 40),
      bio: cleanStr(me.showcaseBio || '', 180),
      favoriteGame: cleanStr(me.favoriteGame || '', 24),
      selectedBadge: cleanStr(me.selectedBadge || '', 32),
      profileBanner: cleanStr(me.profileBanner || '', 220),
      vipTheme: cleanStr(me.vipTheme || '', 24),
      vipNameplate: cleanStr(me.vipNameplate || '', 24),
      vipBubble: cleanStr(me.vipBubble || '', 24),
      vipBannerPreset: cleanStr(me.vipBannerPreset || '', 24),
      vipHalo: cleanStr(me.vipHalo || '', 24),
      vipEntranceFx: cleanStr(me.vipEntranceFx || '', 24),
      vipPartyBanner: cleanStr(me.vipPartyBanner || '', 24),
      vipEmotePack: cleanStr(me.vipEmotePack || '', 24),
      vipStickerPack: cleanStr(me.vipStickerPack || '', 24),
      vipLoungeBackdrop: cleanStr(me.vipLoungeBackdrop || '', 24),
      vipSeasonPassSkin: cleanStr(me.vipSeasonPassSkin || '', 24)
    };

    const [rewardCatalogConfig, chatRetentionPolicy] = await Promise.all([
      getRewardCatalogConfig({ includePrivate: false }),
      getChatRetentionPolicyConfig()
    ]);
    const catalog = rewardCatalogConfig.items;
    const rewardCatalogSummary = buildRewardCatalogSummary({ includePrivate: false, items: catalog });
    const statsCenter = buildStatsCenterSnapshot(me, { progression: meProgression });
    const resetSchedule = buildResetScheduleSnapshot(new Date(), { chatRetention: chatRetentionPolicy });
    const achievementBoard = buildAchievementBoard({
      user: { ...me, competitiveScore: meProgression.competitiveScore },
      matchSummary,
      rewardSummary: rewardCenterSummary,
      context: { friendCount: friendUids.length }
    });
    const missionBoard = buildMissionBoard({
      user: { ...me, competitiveScore: meProgression.competitiveScore },
      matchSummary,
      rewardSummary: rewardCenterSummary,
      context: { friendCount: friendUids.length }
    });
    const vipCenter = buildVipCenterSnapshot({
      user: me,
      progression: meProgression,
      showcase
    });
    const inviteCenter = buildInviteCooldownSnapshot(outgoingGameInvites, { incomingPartyInvites: invites, outgoingPartyInvites, party });
    const partyCenter = buildPartyInviteSnapshot({ incomingInvites: invites, outgoingInvites: outgoingPartyInvites, party });
    const profileHub = buildProfileHub({ user: { ...me, customTitle: cleanStr(me.customTitle || me.showcaseTitle || '', 40) }, matchPage, matchSummary, rewardPage: rewardCenterPage, rewardSummary: rewardCenterSummary, achievements: achievementBoard, vipCenter });
    const economyHub = buildEconomyHub({ user: me, rewardPage: rewardCenterPage, rewardSummary: rewardCenterSummary, vipCenter, featureFlags: DEFAULT_FEATURE_FLAGS, rewardCatalog: catalog });
    const inventoryHub = buildInventoryHub({ user: me, vipCenter, featureFlags: DEFAULT_FEATURE_FLAGS, rewardSummary: rewardCenterSummary });
    const seasonalShopHub = buildSeasonalShopRuntime({ user: me, featureFlags: DEFAULT_FEATURE_FLAGS });
    const gameHub = buildGameExperienceHub({ activeSessions, featureFlags: DEFAULT_FEATURE_FLAGS, matchItems: matchPage.items });
    const socialHub = buildSocialHubSnapshot({ friends, recentPlayers, recentMatches: matchPage.items, notifications, inviteCenter, partyCenter, partyVoice: buildPartyVoicePlaceholder(party, me), party, gameHub });

    return sendApiSuccess(req, res, {
      me: {
        uid,
        username: await resolvePublicUsername(uid, me),
        avatar: me.avatar || '',
        selectedFrame: pickUserSelectedFrame(me),
        rp: safeNum(me.rp, 0),
        competitiveScore: meProgression.competitiveScore,
        totalRank: meProgression.totalRank,
        totalRankClass: meProgression.totalRankClass,
        seasonRp: safeNum(me.seasonRp, 0),
        seasonRank: meProgression.seasonRank,
        unreadMessages: safeNum(me.unread_messages, 0),
        monthlyActiveScore: safeNum(me.monthlyActiveScore, 0),
        progression: meProgression,
        statsCenter,
        resetSchedule,
        showcase,
        activityPass: getPassPayload(me, getActivityPassMilestones(catalog)),
        presence: presenceMap.get(uid) || null,
        online: !!presenceMap.get(uid)?.online
      },
      party,
      partyInvites: invites,
      partyOutgoingInvites: outgoingPartyInvites,
      partyCenter,
      friends,
      pinnedFriends: friends.filter((item) => item.pinned).slice(0, 6),
      recentPlayers,
      recentMatches: matchPage.items,
      inviteCenter,
      socialPreferences: {
        customTitle: cleanStr(me.customTitle || me.showcaseTitle || '', 40),
        partyVoiceEnabled: me.partyVoiceEnabled !== false,
        pinnedFriendCount: friends.filter((item) => item.pinned).length,
        noteCount: friends.filter((item) => item.note).length
      },
      partyVoice: socialHub.partyVoice,
      notificationsCenter: socialHub.notificationsCenter,
      socialHub,
      profileHub,
      economyHub,
      inventoryHub,
      seasonalShopHub,
      gameHub,
      matchCenter: {
        summary: matchSummary,
        items: matchPage.items,
        nextCursor: matchPage.nextCursor
      },
      activeSessions: (activeSessions || []).map((item) => ({
        ...item,
        resumePath: item.gameType === 'chess' ? './Online Oyunlar/Satranc.html' : './Online Oyunlar/Pisti.html'
      })),
      chatPolicy: chatRetentionPolicy,
      rewardCenter: {
        summary: rewardCenterSummary,
        items: rewardCenterPage.items,
        nextCursor: rewardCenterPage.nextCursor,
        catalog,
        catalogSummary: rewardCatalogSummary,
        resetSchedule
      },
      statsCenter,
      resetSchedule,
      vipCenter,
      achievements: achievementBoard,
      missionBoard,
      overviewCards: [
        { key: 'friends_online', label: 'Çevrimiçi Arkadaş', value: friends.filter((item) => item.online).length },
        { key: 'unread_messages', label: 'Okunmamış Mesaj', value: safeNum(me.unread_messages, 0) },
        { key: 'season_score', label: 'Sezon Puanı', value: safeNum(me.seasonRp, 0) },
        { key: 'activity_score', label: 'Aylık Aktiflik', value: safeNum(me.monthlyActiveScore, 0) },
        { key: 'match_wins', label: 'Galibiyet', value: safeNum(matchSummary.wins, 0) },
        { key: 'reward_total', label: 'Toplam Ödül', value: safeNum(rewardCenterSummary.totalMc, 0) }
      ],
      activityFeed: buildActivityFeed(matchPage.items, rewardCenterPage.items)
    });
  } catch (error) {
    await captureError(error, { route: 'social-center.summary', uid: req.user?.uid || '' });
    return sendApiError(req, res, 500, 'Sosyal merkez özeti yüklenemedi.', { code: 'SOCIAL_CENTER_SUMMARY_FAILED', retryable: true });
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
      vipTheme: cleanStr(req.body?.vipTheme || '', 24),
      vipNameplate: cleanStr(req.body?.vipNameplate || '', 24),
      vipBubble: cleanStr(req.body?.vipBubble || '', 24),
      vipBannerPreset: cleanStr(req.body?.vipBannerPreset || '', 24),
      vipHalo: cleanStr(req.body?.vipHalo || '', 24),
      vipEntranceFx: cleanStr(req.body?.vipEntranceFx || '', 24),
      vipPartyBanner: cleanStr(req.body?.vipPartyBanner || '', 24),
      vipEmotePack: cleanStr(req.body?.vipEmotePack || '', 24),
      vipStickerPack: cleanStr(req.body?.vipStickerPack || '', 24),
      vipLoungeBackdrop: cleanStr(req.body?.vipLoungeBackdrop || '', 24),
      vipSeasonPassSkin: cleanStr(req.body?.vipSeasonPassSkin || '', 24),
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
      profile: {
        uid,
        username: await resolvePublicUsername(uid, user),
        avatar: user.avatar || '',
        selectedFrame: pickUserSelectedFrame(user),
        rp: safeNum(user.rp, 0),
        seasonRp: safeNum(user.seasonRp, 0),
        chessElo: safeNum(user.chessElo, 1000),
        pistiElo: safeNum(user.pistiElo, 1000),
        showcaseTitle: cleanStr(user.showcaseTitle || '', 40),
        showcaseBio: cleanStr(user.showcaseBio || '', 180),
        favoriteGame: cleanStr(user.favoriteGame || '', 24),
        selectedBadge: cleanStr(user.selectedBadge || '', 32),
        profileBanner: cleanStr(user.profileBanner || '', 220),
        vipTheme: cleanStr(user.vipTheme || '', 24),
        vipNameplate: cleanStr(user.vipNameplate || '', 24),
        vipBubble: cleanStr(user.vipBubble || '', 24),
        vipBannerPreset: cleanStr(user.vipBannerPreset || '', 24),
        vipHalo: cleanStr(user.vipHalo || '', 24),
        vipEntranceFx: cleanStr(user.vipEntranceFx || '', 24),
        vipPartyBanner: cleanStr(user.vipPartyBanner || '', 24),
        vipEmotePack: cleanStr(user.vipEmotePack || '', 24),
        vipStickerPack: cleanStr(user.vipStickerPack || '', 24),
        vipLoungeBackdrop: cleanStr(user.vipLoungeBackdrop || '', 24),
        vipSeasonPassSkin: cleanStr(user.vipSeasonPassSkin || '', 24),
        recentMatches: historyPage.items.slice(0, 6)
      }
    });
  } catch (error) {
    return res.status(404).json({ ok: false, error: error.message || 'Profil vitrini yüklenemedi.' });
  }
});

router.get('/activity-pass', verifyAuth, async (req, res) => {
  try {
    const [snap, rewardRuntime] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      getRewardRuntimeCatalog({ includePrivate: false })
    ]);
    const user = snap.exists ? (snap.data() || {}) : {};
    return res.json({ ok: true, pass: getPassPayload(user, getActivityPassMilestones(rewardRuntime.map)) });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Activity Pass bilgisi yüklenemedi.' });
  }
});

router.post('/activity-pass/claim', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const level = Math.max(1, Math.min(99, Math.floor(safeNum(req.body?.level, 0))));
    const rewardRuntime = await getRewardRuntimeCatalog({ includePrivate: false });
    const milestone = getActivityPassMilestones(rewardRuntime.map).find((item) => item.level === level);
    if (!milestone) throw new Error('Geçersiz seviye.');

    const result = await db.runTransaction(async (tx) => {
      const ref = colUsers().doc(uid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
      const user = snap.data() || {};
      const score = safeNum(user.monthlyActiveScore, 0);
      const currentSeasonKey = getSeasonCalendarParts().seasonKey;
      const claimed = normalizePeriodClaimMap(user.activityPassClaimed, currentSeasonKey);
      if (score < milestone.need) throw new Error('Bu seviye henüz açılmadı.');
      if (claimed[String(level)]) throw new Error('Bu ödül zaten alındı.');
      claimed.__seasonKey = currentSeasonKey;
      claimed[String(level)] = nowMs();
      tx.set(ref, {
        balance: admin.firestore.FieldValue.increment(milestone.rewardMc),
        activityPassClaimed: claimed,
        activityPassClaimedSeasonKey: currentSeasonKey,
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
    const rewardRuntime = await getRewardRuntimeCatalog({ includePrivate: false });
    return res.json({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor,
      summary,
      catalog: rewardRuntime.items,
      catalogSummary: buildRewardCatalogSummary({ includePrivate: false, items: rewardRuntime.items }),
      runtimeMeta: rewardRuntime.meta
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Ödül merkezi yüklenemedi.' });
  }
});

router.get('/rewards/catalog', verifyAuth, async (_req, res) => {
  const rewardCatalogConfig = await getRewardCatalogConfig({ includePrivate: false });
  return res.json({
    ok: true,
    items: rewardCatalogConfig.items,
    summary: buildRewardCatalogSummary({ includePrivate: false, items: rewardCatalogConfig.items })
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

router.get('/matches/replay-center', verifyAuth, async (req, res) => {
  try {
    const userSnap = await colUsers().doc(req.user.uid).get();
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const page = await listMatchHistoryForUid(req.user.uid, { limit: 12, gameType: cleanStr(req.query?.gameType || '', 24).toLowerCase() });
    const replayCenter = buildReplayCenter(page.items, { perspectiveName: cleanStr(user?.username || 'Sen', 40) || 'Sen' });
    const analytics = buildPostGameAnalytics(page.items);
    return res.json({ ok: true, replayCenter, analytics });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Replay merkezi yüklenemedi.' });
  }
});

router.get('/matches/:id/share-card', verifyAuth, async (req, res) => {
  try {
    const matchId = cleanStr(req.params?.id || '', 220);
    if (!matchId) throw new Error('Geçerli maç kimliği gerekli.');
    const page = await listMatchHistoryForUid(req.user.uid, { limit: 80 });
    const item = (page.items || []).find((entry) => cleanStr(entry?.id || '', 220) === matchId);
    if (!item) return res.status(404).json({ ok: false, error: 'Maç özeti bulunamadı.' });
    return res.json({ ok: true, shareCard: buildMatchSummaryShareCard(item, { perspectiveName: 'Sen' }) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Paylaşım kartı üretilemedi.' });
  }
});

router.get('/spectator-center', verifyAuth, async (req, res) => {
  try {
    const activeSessions = await listActiveSessionsForUid(req.user.uid, { includeBlackjack: true });
    const spectatorCenter = buildSpectatorModeCenter(activeSessions, DEFAULT_FEATURE_FLAGS);
    return res.json({ ok: true, spectatorCenter });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'İzleyici merkezi yüklenemedi.' });
  }
});

router.get('/spectator/snapshot', verifyAuth, async (req, res) => {
  try {
    const gameType = cleanStr(req.query?.gameType || '', 24).toLowerCase();
    const roomId = cleanStr(req.query?.roomId || '', 160);
    if (!gameType || !roomId) throw new Error('Geçerli oyun türü ve oda kimliği gerekli.');
    const snapshot = await getSpectatorSnapshot(gameType, roomId);
    if (!snapshot) return res.status(404).json({ ok: false, error: 'İzleme özeti bulunamadı.' });
    return res.json({ ok: true, snapshot, spectatorPath: buildSpectatorPath(gameType, roomId) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'İzleme özeti alınamadı.' });
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

router.get('/vip/center', verifyAuth, async (req, res) => {
  try {
    const snap = await colUsers().doc(req.user.uid).get();
    const user = snap.exists ? (snap.data() || {}) : {};
    const progression = buildProgressionSnapshot(user);
    const showcase = {
      profileBanner: cleanStr(user.profileBanner || '', 220),
      vipTheme: cleanStr(user.vipTheme || '', 24),
      vipNameplate: cleanStr(user.vipNameplate || '', 24),
      vipBubble: cleanStr(user.vipBubble || '', 24),
      vipBannerPreset: cleanStr(user.vipBannerPreset || '', 24),
      vipHalo: cleanStr(user.vipHalo || '', 24),
      vipEntranceFx: cleanStr(user.vipEntranceFx || '', 24),
      vipPartyBanner: cleanStr(user.vipPartyBanner || '', 24),
      vipEmotePack: cleanStr(user.vipEmotePack || '', 24),
      vipStickerPack: cleanStr(user.vipStickerPack || '', 24),
      vipLoungeBackdrop: cleanStr(user.vipLoungeBackdrop || '', 24),
      vipSeasonPassSkin: cleanStr(user.vipSeasonPassSkin || '', 24)
    };
    return res.json({
      ok: true,
      vipCenter: buildVipCenterSnapshot({ user, progression, showcase }),
      catalog: buildVipCatalog()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'VIP merkezi yüklenemedi.' });
  }
});

router.get('/vip/catalog', verifyAuth, async (_req, res) => {
  return res.json({ ok: true, catalog: buildVipCatalog() });
});

router.get('/platform/control', verifyAuth, async (req, res) => {
  try {
    const [userSnap, rewardCatalogConfig, activeSessions, chatRetentionPolicy] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      getRewardCatalogConfig({ includePrivate: false }),
      listActiveSessionsForUid(req.user.uid, { includeBlackjack: true }),
      getChatRetentionPolicyConfig()
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const snapshot = buildPlatformControlSnapshot({
      rewardCatalogSummary: buildRewardCatalogSummary({ includePrivate: false, items: rewardCatalogConfig.items }),
      rewardCatalogItems: rewardCatalogConfig.items,
      activeSessions,
      users: [user],
      chatRetention: chatRetentionPolicy
    });
    return res.json({ ok: true, control: snapshot });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Platform kontrol özeti yüklenemedi.' });
  }
});


router.get('/profile-hub', verifyAuth, async (req, res) => {
  try {
    const [userSnap, rewardPage, rewardSummary, matchPage, matchSummary, friendUids] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      listRewardLedgerForUid(req.user.uid, { limit: 24 }),
      summarizeRewardLedgerForUid(req.user.uid, { sampleLimit: 180 }),
      listMatchHistoryForUid(req.user.uid, { limit: 24 }),
      summarizeMatchHistoryForUid(req.user.uid, { sampleLimit: 150 }),
      getAcceptedFriendUids(req.user.uid, 50)
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const achievements = buildAchievementBoard({ user, matchSummary, rewardSummary, context: { friendCount: friendUids.length } });
    return res.json({ ok: true, profileHub: buildProfileHub({ user, rewardPage, rewardSummary, matchPage, matchSummary, achievements }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Profil merkezi yüklenemedi.' });
  }
});

router.get('/economy-hub', verifyAuth, async (req, res) => {
  try {
    const [userSnap, rewardPage, rewardSummary, rewardCatalogConfig] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      listRewardLedgerForUid(req.user.uid, { limit: 24 }),
      summarizeRewardLedgerForUid(req.user.uid, { sampleLimit: 180 }),
      getRewardCatalogConfig({ includePrivate: false })
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const vipCenter = buildVipCenterSnapshot({ user, progression: buildProgressionSnapshot(user), showcase: { vipTheme: cleanStr(user.vipTheme || '', 24), vipNameplate: cleanStr(user.vipNameplate || '', 24), vipBubble: cleanStr(user.vipBubble || '', 24), vipBannerPreset: cleanStr(user.vipBannerPreset || '', 24), vipHalo: cleanStr(user.vipHalo || '', 24), vipEntranceFx: cleanStr(user.vipEntranceFx || '', 24), vipPartyBanner: cleanStr(user.vipPartyBanner || '', 24), vipEmotePack: cleanStr(user.vipEmotePack || '', 24), vipStickerPack: cleanStr(user.vipStickerPack || '', 24), vipLoungeBackdrop: cleanStr(user.vipLoungeBackdrop || '', 24), vipSeasonPassSkin: cleanStr(user.vipSeasonPassSkin || '', 24) } });
    return res.json({ ok: true, economyHub: buildEconomyHub({ user, rewardPage, rewardSummary, vipCenter, featureFlags: DEFAULT_FEATURE_FLAGS, rewardCatalog: rewardCatalogConfig.items }), seasonalShop: buildSeasonalShopRuntime({ user, featureFlags: DEFAULT_FEATURE_FLAGS }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Ekonomi merkezi yüklenemedi.' });
  }
});


router.get('/inventory-hub', verifyAuth, async (req, res) => {
  try {
    const [userSnap, rewardSummary] = await Promise.all([
      colUsers().doc(req.user.uid).get(),
      summarizeRewardLedgerForUid(req.user.uid, { sampleLimit: 180 })
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const vipCenter = buildVipCenterSnapshot({ user, progression: buildProgressionSnapshot(user), showcase: { vipTheme: cleanStr(user.vipTheme || '', 24), vipNameplate: cleanStr(user.vipNameplate || '', 24), vipBubble: cleanStr(user.vipBubble || '', 24), vipBannerPreset: cleanStr(user.vipBannerPreset || '', 24), vipHalo: cleanStr(user.vipHalo || '', 24), vipEntranceFx: cleanStr(user.vipEntranceFx || '', 24), vipPartyBanner: cleanStr(user.vipPartyBanner || '', 24), vipEmotePack: cleanStr(user.vipEmotePack || '', 24), vipStickerPack: cleanStr(user.vipStickerPack || '', 24), vipLoungeBackdrop: cleanStr(user.vipLoungeBackdrop || '', 24), vipSeasonPassSkin: cleanStr(user.vipSeasonPassSkin || '', 24) } });
    return res.json({ ok: true, inventoryHub: buildInventoryHub({ user, vipCenter, featureFlags: DEFAULT_FEATURE_FLAGS, rewardSummary }), seasonalShop: buildSeasonalShopRuntime({ user, featureFlags: DEFAULT_FEATURE_FLAGS }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Envanter merkezi yüklenemedi.' });
  }
});

router.post('/inventory/equip', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const rawItemKey = cleanStr(req.body?.itemKey || req.body?.key || '', 80).toLowerCase();
    const explicitSlot = cleanStr(req.body?.slot || '', 24);
    if (!rawItemKey) throw new Error('Geçerli bir envanter anahtarı gerekli.');

    const userSnap = await colUsers().doc(req.user.uid).get();
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const vipCenter = buildVipCenterSnapshot({ user, progression: buildProgressionSnapshot(user), showcase: { vipTheme: cleanStr(user.vipTheme || '', 24), vipNameplate: cleanStr(user.vipNameplate || '', 24), vipBubble: cleanStr(user.vipBubble || '', 24), vipBannerPreset: cleanStr(user.vipBannerPreset || '', 24), vipHalo: cleanStr(user.vipHalo || '', 24), vipEntranceFx: cleanStr(user.vipEntranceFx || '', 24), vipPartyBanner: cleanStr(user.vipPartyBanner || '', 24), vipEmotePack: cleanStr(user.vipEmotePack || '', 24), vipStickerPack: cleanStr(user.vipStickerPack || '', 24), vipLoungeBackdrop: cleanStr(user.vipLoungeBackdrop || '', 24), vipSeasonPassSkin: cleanStr(user.vipSeasonPassSkin || '', 24) } });
    const inventoryHub = buildInventoryHub({ user, vipCenter, featureFlags: DEFAULT_FEATURE_FLAGS, rewardSummary: {} });
    const ownedItem = (inventoryHub.ownedItems || []).find((item) => cleanStr(item?.key || '', 80).toLowerCase() === rawItemKey);
    if (!ownedItem || !ownedItem.owned) throw new Error('Bu envanter öğesi hesabında açık değil.');

    const resolvedSlot = explicitSlot || resolveInventorySlot(rawItemKey);
    const field = mapInventoryFieldForSlot(resolvedSlot);
    if (!field) throw new Error('Bu öğe şu anda ekipman slotuna atanamıyor.');

    const payload = { [field]: rawItemKey, updatedAt: nowMs() };
    await colUsers().doc(req.user.uid).set(payload, { merge: true });
    return res.json({ ok: true, equipped: { slot: resolvedSlot, slotLabel: ownedItem.slotLabel || resolvedSlot, field, key: rawItemKey, label: ownedItem.label || rawItemKey } });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Envanter öğesi kuşanılamadı.' });
  }
});

router.get('/seasonal-shop', verifyAuth, async (req, res) => {
  try {
    const userSnap = await colUsers().doc(req.user.uid).get();
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    return res.json({ ok: true, seasonalShop: buildSeasonalShopRuntime({ user, featureFlags: DEFAULT_FEATURE_FLAGS }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Sezonluk mağaza yüklenemedi.' });
  }
});

router.post('/seasonal-shop/purchase', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const itemKey = cleanStr(req.body?.itemKey || req.body?.key || '', 80);
    if (!itemKey) throw new Error('Geçerli bir mağaza ürünü gerekli.');
    const result = await purchaseSeasonalShopItem({ uid: req.user.uid, itemKey, featureFlags: DEFAULT_FEATURE_FLAGS });
    return res.json({ ok: true, purchase: result.item, remainingBalance: result.remainingBalance, equipped: result.equipped, seasonKey: result.seasonKey });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Mağaza ürünü satın alınamadı.' });
  }
});

router.get('/game-hub', verifyAuth, async (req, res) => {
  try {
    const [activeSessions, matchPage] = await Promise.all([
      listActiveSessionsForUid(req.user.uid, { includeBlackjack: true }),
      listMatchHistoryForUid(req.user.uid, { limit: 12 })
    ]);
    return res.json({ ok: true, gameHub: buildGameExperienceHub({ activeSessions, featureFlags: DEFAULT_FEATURE_FLAGS, matchItems: matchPage.items, user: { uid: req.user.uid } }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Oyun deneyim merkezi yüklenemedi.' });
  }
});

router.patch('/preferences', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const payload = {
      customTitle: cleanStr(req.body?.customTitle || '', 40),
      partyVoiceEnabled: req.body?.partyVoiceEnabled !== false,
      updatedAt: nowMs()
    };
    await colUsers().doc(req.user.uid).set(payload, { merge: true });
    return res.json({ ok: true, preferences: payload });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Tercihler kaydedilemedi.' });
  }
});

router.patch('/friends/:uid/preferences', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const targetUid = cleanStr(req.params?.uid || '', 160);
    if (!targetUid || targetUid === req.user.uid) throw new Error('Geçersiz arkadaş kaydı.');
    const patch = {
      pinned: req.body?.pinned === true,
      archived: req.body?.archived === true,
      muted: req.body?.muted === true,
      note: cleanStr(req.body?.note || '', 180)
    };
    await setSocialEdgeFlags(req.user.uid, targetUid, patch);
    return res.json({ ok: true, targetUid, edge: { ...patch, updatedAt: nowMs() } });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Arkadaş tercihleri kaydedilemedi.' });
  }
});


router.get('/social-hub', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [meSnap, friendUids, party, invites, outgoingPartyInvites, outgoingGameInvites, notifications, matchPage] = await Promise.all([
      colUsers().doc(uid).get(),
      getAcceptedFriendUids(uid, 20),
      getPartySnapshotByUid(uid),
      getIncomingPartyInvites(uid),
      getOutgoingPartyInvites(uid),
      getOutgoingGameInvites(uid),
      listNotifications(uid, 12),
      listMatchHistoryForUid(uid, { limit: 24 })
    ]);
    const me = meSnap.exists ? (meSnap.data() || {}) : {};
    const friendEdgeMap = await buildFriendEdgeMap(uid, friendUids);
    const presenceMap = await listPresenceForUids([uid, ...friendUids]);
    const friends = await Promise.all(friendUids.map((friendUid) => buildPublicMember(friendUid, presenceMap)));
    const recentPlayersMap = buildRecentPlayersMap(matchPage.items, uid);
    friends.forEach((friend) => {
      const edge = friendEdgeMap.get(friend.uid) || {};
      friend.pinned = !!edge.pinned;
      friend.note = cleanStr(edge.note || '', 180);
      friend.archived = !!edge.archived;
      friend.muted = !!edge.muted;
      friend.lastPlayedAt = safeNum(recentPlayersMap.get(friend.uid), 0);
    });
    const recentPlayers = await Promise.all(Array.from(recentPlayersMap.keys()).slice(0, 10).map((playerUid) => buildPublicMember(playerUid, presenceMap)));
    const inviteCenter = buildInviteCooldownSnapshot(outgoingGameInvites, { incomingPartyInvites: invites, outgoingPartyInvites, party });
    const partyCenter = buildPartyInviteSnapshot({ incomingInvites: invites, outgoingInvites: outgoingPartyInvites, party });
    const socialHub = buildSocialHubSnapshot({ friends, recentPlayers, recentMatches: matchPage.items, notifications, inviteCenter, partyCenter, partyVoice: buildPartyVoicePlaceholder(party, me), party });
    return res.json({ ok: true, socialHub, notificationsCenter: socialHub.notificationsCenter, partyVoice: socialHub.partyVoice });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Sosyal merkez katmanı yüklenemedi.' });
  }
});

module.exports = router;
