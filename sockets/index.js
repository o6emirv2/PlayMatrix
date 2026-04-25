'use strict';

const crypto = require('crypto');
const { db, admin } = require('../config/firebase');
const { safeNum, cleanStr, checkProfanity, nowMs } = require('../utils/helpers');
const { touchUserActivity } = require('../utils/activity');
const { captureError } = require('../utils/errorMonitor');
const { logCaughtError } = require('../utils/logger');
const { assertDmAllowed: assertDmAllowedInSocket, getPeerRelationshipFlags: getPeerRelationshipFlagsInSocket } = require('../utils/socialKit');
const { createNotification } = require('../utils/notifications');
const { assertNoOtherActiveGame } = require('../utils/gameSession');
const { restrictionSnapshot, formatRestrictionMessage } = require('../utils/userRestrictions');
const {
  isUserOnlinePersistent,
  setPresence: persistPresence,
  touchSocketConnection,
  removeSocketConnection,
  dequeueMatchmaking,
  claimMatchmakingCandidate,
  createInvite,
  getInvite,
  respondToInvite,
  listPendingInvitesForTarget,
  listInviteUpdatesForHost,
  expireCompetingInvites
} = require('../utils/realtimeState');
const {
  LOBBY_CHAT_MAX_LENGTH, LOBBY_CHAT_HISTORY_LIMIT, SOCKET_CHAT_WINDOW_MS, SOCKET_CHAT_MAX_PER_WINDOW,
  SOCKET_DM_WINDOW_MS, SOCKET_DM_MAX_PER_WINDOW, SOCKET_TYPING_WINDOW_MS, SOCKET_TYPING_MAX_PER_WINDOW,
  SOCKET_INVITE_WINDOW_MS, SOCKET_INVITE_MAX_PER_WINDOW, PRESENCE_GRACE_MS, CHAT_RETENTION_POLICY,
  LOBBY_CHAT_RETENTION_DAYS, DIRECT_CHAT_RETENTION_DAYS,
  SOCKET_PING_INTERVAL_MS, SOCKET_STALE_TIMEOUT_MS, SOCKET_MEMORY_SWEEP_INTERVAL_MS
} = require('../config/constants');
const { evaluateInviteRoomState } = require('../utils/gameFlow');
const { getCanonicalSelectedFrame } = require('../utils/accountState');

const colUsers = () => db.collection('users');
const colFriends = () => db.collection('friends');
const colChats = () => db.collection('chats');
const colChess = () => db.collection('chess_rooms');
const colOnlinePisti = () => db.collection('pisti_online_rooms');
const colLobbyChat = () => db.collection('lobby_chat');
const colUsernames = () => db.collection('usernames');
const colGameInvites = () => db.collection('game_invites');

async function findPendingInviteBetweenUsers(hostUid, targetUid, roomId, gameKey) {
  const safeHostUid = cleanStr(hostUid || '', 160);
  const safeTargetUid = cleanStr(targetUid || '', 160);
  const safeRoomId = cleanStr(roomId || '', 160);
  const safeGameKey = normalizeGameType(gameKey || '');
  if (!safeHostUid || !safeTargetUid || !safeRoomId || !safeGameKey) return { kind: 'none', invite: null };
  const now = nowMs();
  const [hostSnap, reverseSnap] = await Promise.all([
    colGameInvites().where('hostUid', '==', safeHostUid).limit(30).get().catch((error) => { logCaughtError('socket.firestore_query', error); return ({ docs: [] }); }),
    colGameInvites().where('hostUid', '==', safeTargetUid).limit(20).get().catch((error) => { logCaughtError('socket.firestore_query', error); return ({ docs: [] }); })
  ]);

  const hostPending = (hostSnap.docs || [])
    .map((doc) => ({ inviteId: doc.id, ...(doc.data() || {}) }))
    .filter((invite) => cleanStr(invite.status || 'pending', 24) === 'pending' && safeNum(invite.expiresAt, 0) > now && normalizeGameType(invite.gameKey || '') === safeGameKey);

  const exactMatch = hostPending
    .filter((invite) => cleanStr(invite.targetUid || '', 160) === safeTargetUid && cleanStr(invite.roomId || '', 160) === safeRoomId)
    .sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0))[0] || null;
  if (exactMatch) return { kind: 'reuse', invite: exactMatch };

  const sameRoomConflict = hostPending.find((invite) => cleanStr(invite.roomId || '', 160) === safeRoomId && cleanStr(invite.targetUid || '', 160) !== safeTargetUid);
  if (sameRoomConflict) {
    return { kind: 'block', invite: sameRoomConflict, message: 'Bu oda için zaten bekleyen başka bir davet var.' };
  }

  const samePairConflict = hostPending.find((invite) => cleanStr(invite.targetUid || '', 160) === safeTargetUid);
  if (samePairConflict) {
    return { kind: 'block', invite: samePairConflict, message: 'Bu oyuncuyla zaten bekleyen bir oyun davetin var.' };
  }

  const reverseConflict = (reverseSnap.docs || [])
    .map((doc) => ({ inviteId: doc.id, ...(doc.data() || {}) }))
    .find((invite) => cleanStr(invite.targetUid || '', 160) === safeHostUid
      && cleanStr(invite.status || 'pending', 24) === 'pending'
      && safeNum(invite.expiresAt, 0) > now
      && normalizeGameType(invite.gameKey || '') === safeGameKey);

  if (reverseConflict) {
    return { kind: 'block', invite: reverseConflict, message: 'Karşılıklı bekleyen bir oyun daveti var.' };
  }

  return { kind: 'none', invite: null };
}


const onlineUsers = new Map();
const socketActionWindows = new Map();
const lobbyChatHistory = [];
const userPresence = Object.create(null);
const matchQueue = { pisti: [], chess: [] };
const recentMessageFingerprints = new Map();

function pruneTransientMaps() {
  const now = Date.now();
  for (const [key, bucket] of socketActionWindows.entries()) {
    if (!bucket || safeNum(bucket.resetAt, 0) < (now - SOCKET_MEMORY_SWEEP_INTERVAL_MS)) socketActionWindows.delete(key);
  }
  for (const [key, meta] of recentMessageFingerprints.entries()) {
    if (!meta || safeNum(meta.createdAt, 0) < (now - 5 * 60 * 1000)) recentMessageFingerprints.delete(key);
  }
}

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

function normalizeGameType(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('sat') || raw === 'chess') return 'chess';
  if (raw.includes('pist') || raw === 'pisti') return 'pisti';
  return '';
}

function getGamePath(gameType = '') {
  return normalizeGameType(gameType) === 'pisti' ? '/Online Oyunlar/Pisti.html' : '/Online Oyunlar/Satranc.html';
}

function getGameDisplayName(gameType = '') {
  return normalizeGameType(gameType) === 'pisti' ? 'Pişti' : 'Satranç';
}

function friendshipDocId(uidA, uidB) {
  return [String(uidA || '').trim(), String(uidB || '').trim()].filter(Boolean).sort().join('__');
}

async function ensureAcceptedFriendship(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;
  const snap = await colFriends().doc(friendshipDocId(uidA, uidB)).get();
  return !!(snap.exists && snap.data()?.status === 'accepted');
}

function getRateWindow(mapKey, uid) {
  const composed = `${mapKey}:${uid}`;
  let bucket = socketActionWindows.get(composed);
  if (!bucket) {
    bucket = { count: 0, resetAt: 0 };
    socketActionWindows.set(composed, bucket);
  }
  return bucket;
}

function hitRateLimit(mapKey, uid, windowMs, maxCount) {
  const now = Date.now();
  const bucket = getRateWindow(mapKey, uid);
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  return bucket.count > maxCount;
}

function trackUserOnline(uid) {
  const next = (onlineUsers.get(uid) || 0) + 1;
  onlineUsers.set(uid, next);
  return next === 1;
}

function untrackUserOnline(uid) {
  const next = Math.max(0, (onlineUsers.get(uid) || 0) - 1);
  if (next <= 0) {
    onlineUsers.delete(uid);
    return true;
  }
  onlineUsers.set(uid, next);
  return false;
}

async function isUserOnline(uid) {
  if ((onlineUsers.get(uid) || 0) > 0) return true;
  return isUserOnlinePersistent(uid).catch(() => false);
}

function getPresenceActivity(status = 'IDLE', gameType = '') {
  if (status === 'IN_GAME') return normalizeGameType(gameType) === 'pisti' ? 'Pişti Oynuyor' : 'Satranç Oynuyor';
  if (status === 'MATCHMAKING') return 'Eşleşme Aranıyor...';
  if (status === 'OFFLINE') return '';
  return 'Lobide';
}

function getUserPresence(uid, fallback = {}) {
  const existing = userPresence[uid];
  const fallbackOnline = (onlineUsers.get(uid) || 0) > 0 || !!fallback?.online;
  const fallbackLastSeen = getFirestoreTimestampMs(fallback?.lastSeen, 0);
  if (!existing) {
    const status = fallbackOnline ? 'IDLE' : 'OFFLINE';
    return { status, activity: status === 'OFFLINE' ? '' : 'Lobide', gameType: normalizeGameType(fallback?.gameType || ''), online: fallbackOnline, updatedAt: Date.now(), lastSeen: fallbackLastSeen };
  }
  const rawStatus = cleanStr(existing.status || (fallbackOnline ? 'IDLE' : 'OFFLINE'), 24).toUpperCase();
  const status = ['IDLE', 'MATCHMAKING', 'IN_GAME', 'OFFLINE'].includes(rawStatus) ? rawStatus : (fallbackOnline ? 'IDLE' : 'OFFLINE');
  const gameType = normalizeGameType(existing.gameType || fallback?.gameType || '');
  const fallbackActivity = getPresenceActivity(status, gameType);
  const inGracePeriod = !!existing.disconnectTimer;
  const online = status !== 'OFFLINE' || fallbackOnline || inGracePeriod;
  return {
    status,
    activity: status === 'OFFLINE' ? '' : (cleanStr(existing.activity || fallback?.activity || fallbackActivity, 80) || fallbackActivity),
    gameType,
    online,
    updatedAt: safeNum(existing.updatedAt, Date.now()),
    lastSeen: getFirestoreTimestampMs(existing.lastSeen, fallbackLastSeen)
  };
}

function emitPresenceUpdate(io, uid, source = 'socket') {
  if (!io || !uid) return;
  const presence = getUserPresence(uid);
  io.emit('social:presence_update', {
    uid,
    presence,
    source,
    updatedAt: safeNum(presence?.updatedAt, Date.now()),
    ts: Date.now()
  });
}

function updateUserPresence(io, uid, status = 'IDLE', activity = '', extras = {}) {
  if (!uid) return null;
  const existing = userPresence[uid] || {};
  if (existing.disconnectTimer) {
    clearTimeout(existing.disconnectTimer);
    existing.disconnectTimer = null;
  }
  const rawStatus = cleanStr(status || 'IDLE', 24).toUpperCase();
  const nextStatus = ['IDLE', 'MATCHMAKING', 'IN_GAME', 'OFFLINE'].includes(rawStatus) ? rawStatus : 'IDLE';
  const nextGameType = normalizeGameType(extras.gameType || existing.gameType || '');
  const fallbackActivity = getPresenceActivity(nextStatus, nextGameType);
  const nextActivity = nextStatus === 'OFFLINE' ? '' : (cleanStr(activity || extras.activity || fallbackActivity, 80) || fallbackActivity);
  const nextPresence = {
    ...existing,
    status: nextStatus,
    activity: nextActivity,
    gameType: nextGameType,
    updatedAt: Date.now(),
    lastSeen: nextStatus === 'OFFLINE' ? getFirestoreTimestampMs(extras.lastSeen, Date.now()) : getFirestoreTimestampMs(existing.lastSeen, getFirestoreTimestampMs(extras.lastSeen, 0)),
    disconnectTimer: null
  };
  userPresence[uid] = nextPresence;
  persistPresence(uid, nextPresence).catch(() => null);
  if (extras.socketId) {
    touchSocketConnection({ socketId: extras.socketId, uid, status: nextStatus, activity: nextActivity, gameType: nextGameType }).catch(() => null);
  }
  emitPresenceUpdate(io, uid, 'state_change');
  return getUserPresence(uid);
}

async function removeUserFromQueue(uid, gameType = '') {
  const safeGameType = normalizeGameType(gameType || '');
  if (!uid) return false;
  const games = safeGameType ? [safeGameType] : Object.keys(matchQueue);
  let removed = false;
  games.forEach((key) => {
    const queue = Array.isArray(matchQueue[key]) ? matchQueue[key] : [];
    const nextQueue = queue.filter((entry) => entry && entry.uid !== uid);
    if (nextQueue.length !== queue.length) removed = true;
    matchQueue[key] = nextQueue;
  });
  await dequeueMatchmaking(uid, safeGameType).catch(() => null);
  return removed;
}

function getPersistentDirectChatId(uidA, uidB) {
  return [String(uidA || '').trim(), String(uidB || '').trim()].filter(Boolean).sort().join('_');
}

function normalizeLobbyMessage(message = {}) {
  const deletedAt = safeNum(message.deletedAt, 0);
  const deletionMode = cleanStr(message.deletionMode || '', 32) || (deletedAt > 0 ? CHAT_RETENTION_POLICY.deleteModes.retention : '');
  const deletedLabel = deletionMode === CHAT_RETENTION_POLICY.deleteModes.retention ? CHAT_RETENTION_POLICY.cleanupLabel : (deletedAt > 0 ? CHAT_RETENTION_POLICY.manualDeleteLabel : '');
  return {
    id: cleanStr(message.id || crypto.randomUUID(), 120),
    uid: cleanStr(message.uid || '', 160),
    username: sanitizeStoredUsername(message.username) || 'Oyuncu',
    avatar: typeof message.avatar === 'string' ? message.avatar : '',
    selectedFrame: pickUserSelectedFrame(message),
    message: deletedAt > 0 ? '' : cleanStr(message.message || '', LOBBY_CHAT_MAX_LENGTH),
    createdAt: safeNum(message.createdAt || getFirestoreTimestampMs(message.timestamp, 0), nowMs()),
    deletedAt,
    deleted: deletedAt > 0,
    deletionMode,
    deletedLabel
  };
}

async function loadLobbyChatHistory() {
  try {
    const snap = await colLobbyChat().orderBy('createdAt', 'desc').limit(LOBBY_CHAT_HISTORY_LIMIT).get();
    const rawMessages = snap.docs.map((doc) => normalizeLobbyMessage({ id: doc.id, ...(doc.data() || {}) }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const uniqueUids = Array.from(new Set(rawMessages.map((item) => cleanStr(item.uid || '', 160)).filter(Boolean)));
    const userSnaps = await Promise.all(uniqueUids.map((uid) => colUsers().doc(uid).get().catch(() => null)));
    const userMap = new Map();
    userSnaps.forEach((snap) => {
      if (snap && snap.exists) userMap.set(snap.id, snap.data() || {});
    });
    const usernameEntries = await Promise.all(
      uniqueUids.map(async (uid) => [uid, await resolvePublicUsername(uid, userMap.get(uid) || {})])
    );
    const usernameMap = new Map(usernameEntries);

    const messages = rawMessages.map((message) => ({
      ...message,
      username: usernameMap.get(message.uid) || message.username || 'Oyuncu'
    }));

    lobbyChatHistory.length = 0;
    messages.forEach((message) => lobbyChatHistory.push(message));
    return messages;
  } catch (_) {
    return lobbyChatHistory.slice(-LOBBY_CHAT_HISTORY_LIMIT);
  }
}

async function persistLobbyChatMessage(payload) {
  try {
    await colLobbyChat().doc(payload.id).set({
      uid: payload.uid,
      username: payload.username,
      avatar: payload.avatar,
      selectedFrame: payload.selectedFrame,
      message: payload.message,
      createdAt: payload.createdAt,
      expiresAt: payload.createdAt + (LOBBY_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (_) {}
}

function formatDirectMessagePayload(message = {}, meta = {}) {
  const createdAt = safeNum(message.createdAt || getFirestoreTimestampMs(message.timestamp, 0), nowMs());
  const deletedAt = safeNum(message.deletedAt, 0);
  const deletionMode = cleanStr(message.deletionMode || '', 32) || (deletedAt > 0 ? CHAT_RETENTION_POLICY.deleteModes.manual : '');
  const deletedLabel = deletionMode === CHAT_RETENTION_POLICY.deleteModes.retention ? CHAT_RETENTION_POLICY.cleanupLabel : (deletedAt > 0 ? CHAT_RETENTION_POLICY.manualDeleteLabel : '');
  const text = deletedAt > 0 ? '' : cleanStr(message.text || message.message || '', LOBBY_CHAT_MAX_LENGTH);
  const sender = cleanStr(message.sender || message.fromUid || '', 160);
  const toUid = cleanStr(message.toUid || meta.toUid || '', 160);
  return {
    id: cleanStr(message.id || crypto.randomUUID(), 120),
    chatId: cleanStr(message.chatId || meta.chatId || '', 200),
    sender,
    fromUid: sender,
    toUid,
    username: sanitizeStoredUsername(message.username || meta.username) || 'Oyuncu',
    avatar: typeof (message.avatar || meta.avatar) === 'string' ? (message.avatar || meta.avatar) : '',
    selectedFrame: pickUserSelectedFrame({ selectedFrame: message.selectedFrame ?? meta.selectedFrame ?? 0 }),
    text,
    message: text,
    createdAt,
    editedAt: safeNum(message.editedAt, 0),
    deletedAt,
    deleted: deletedAt > 0,
    deletionMode,
    deletedLabel,
    deletedBy: cleanStr(message.deletedBy || '', 160),
    status: cleanStr(message.status || 'sent', 24) || 'sent',
    clientTempId: cleanStr(message.clientTempId || '', 120)
  };
}

async function loadDirectChatHistory(uid, targetUid) {
  const chatId = getPersistentDirectChatId(uid, targetUid);
  const [messagesSnap, senderSnap, targetSnap] = await Promise.all([
    colChats().doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(80).get(),
    colUsers().doc(uid).get(),
    colUsers().doc(targetUid).get()
  ]);

  const senderMeta = senderSnap.exists ? senderSnap.data() || {} : {};
  const targetMeta = targetSnap.exists ? targetSnap.data() || {} : {};
  const senderUsername = await resolvePublicUsername(uid, senderMeta);
  const targetUsername = await resolvePublicUsername(targetUid, targetMeta);

  const metaByUid = {
    [uid]: {
      username: senderUsername,
      avatar: senderMeta.avatar || '',
      selectedFrame: pickUserSelectedFrame(senderMeta)
    },
    [targetUid]: {
      username: targetUsername,
      avatar: targetMeta.avatar || '',
      selectedFrame: pickUserSelectedFrame(targetMeta)
    }
  };

  return messagesSnap.docs.map((doc) => {
    const data = doc.data() || {};
    const sender = cleanStr(data.sender || '', 160);
    const peerMeta = metaByUid[sender] || {};
    return formatDirectMessagePayload({
      id: doc.id,
      chatId,
      sender,
      toUid: sender === uid ? targetUid : uid,
      username: peerMeta.username,
      avatar: peerMeta.avatar,
      selectedFrame: peerMeta.selectedFrame,
      text: data.text,
      createdAt: data.createdAt || getFirestoreTimestampMs(data.timestamp, nowMs()),
      editedAt: data.editedAt,
      deletedAt: data.deletedAt,
      deletedBy: data.deletedBy,
      deletionMode: data.deletionMode,
      status: data.status || 'sent'
    });
  }).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

async function validateInviteRoomOwnership(uid, roomId, gameType) {
  const safeGameType = normalizeGameType(gameType);
  if (!uid || !roomId || !safeGameType) throw new Error('Geçersiz davet odası.');

  if (safeGameType === 'chess') {
    const snap = await colChess().doc(roomId).get();
    if (!snap.exists) throw new Error('Satranç odası bulunamadı.');
    const room = snap.data() || {};
    if (room.host?.uid !== uid && room.guest?.uid !== uid) throw new Error('Bu satranç odası size ait değil.');
    if (!['waiting', 'playing'].includes(cleanStr(room.status || 'waiting', 24))) throw new Error('Satranç odası aktif değil.');
    return room;
  }

  const snap = await colOnlinePisti().doc(roomId).get();
  if (!snap.exists) throw new Error('Pişti odası bulunamadı.');
  const room = snap.data() || {};
  const isPlayer = (room.players || []).some((player) => player.uid === uid);
  if (!isPlayer) throw new Error('Bu Pişti odası size ait değil.');
  if (!['waiting', 'playing'].includes(cleanStr(room.status || 'waiting', 24))) throw new Error('Pişti odası aktif değil.');
  return room;
}

function assertInviteJoinable(room = {}, invite = {}, targetUid = '') {
  const decision = evaluateInviteRoomState(room, invite, targetUid);
  if (!decision.ok) throw new Error(decision.message || 'Davet odası artık uygun değil.');
  return true;
}

async function decrementUnreadCounter(uid, amount = 1) {
  const safeUid = cleanStr(uid, 160);
  const safeAmount = Math.max(0, Math.floor(safeNum(amount, 0)));
  if (!safeUid || safeAmount <= 0) return 0;
  return db.runTransaction(async (tx) => {
    const ref = colUsers().doc(safeUid);
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const current = safeNum(snap.data()?.unread_messages, 0);
    const next = Math.max(0, current - safeAmount);
    tx.set(ref, { unread_messages: next }, { merge: true });
    return current - next;
  });
}

async function markDirectMessagesRead(readerUid, peerUid, limit = 200) {
  const targetUid = cleanStr(peerUid || '', 160);
  const uid = cleanStr(readerUid || '', 160);
  if (!uid || !targetUid || uid === targetUid) return { changed: 0, chatId: '' };
  const chatId = getPersistentDirectChatId(uid, targetUid);
  const messagesSnap = await colChats().doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(limit).get();
  const batch = db.batch();
  let changed = 0;
  const readAt = nowMs();
  messagesSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (safeNum(data.deletedAt, 0) > 0 || cleanStr(data.status || 'sent', 24) === 'deleted') return;
    if (cleanStr(data.sender || '', 160) === targetUid && cleanStr(data.status || 'sent', 24) !== 'read') {
      batch.set(doc.ref, { status: 'read', readAt }, { merge: true });
      changed += 1;
    }
  });
  if (changed > 0) await batch.commit();
  return { changed, chatId, readAt };
}

function buildMessageFingerprint(uid, text, scope = '') {
  return `${scope}:${uid}:${cleanStr(text || '', 240).toLowerCase()}`;
}

function isDuplicateMessage(uid, text, scope = '') {
  const fingerprint = buildMessageFingerprint(uid, text, scope);
  const now = nowMs();
  const last = safeNum(recentMessageFingerprints.get(fingerprint), 0);
  recentMessageFingerprints.set(fingerprint, now);
  return last > 0 && (now - last) < 4000;
}

async function createMatchmakingRoom(gameType, uidA, uidB) {
  const safeGameType = normalizeGameType(gameType);
  if (!safeGameType || !uidA || !uidB || uidA === uidB) throw new Error('Geçersiz eşleşme.');
  await assertNoOtherActiveGame(uidA, { allowGameType: safeGameType });
  await assertNoOtherActiveGame(uidB, { allowGameType: safeGameType });

  return db.runTransaction(async (tx) => {
    const [aSnap, bSnap] = await Promise.all([tx.get(colUsers().doc(uidA)), tx.get(colUsers().doc(uidB))]);
    if (!aSnap.exists || !bSnap.exists) throw new Error('Oyuncular bulunamadı.');
    const a = aSnap.data() || {};
    const b = bSnap.data() || {};
    const [aUsername, bUsername] = await Promise.all([resolvePublicUsername(uidA, a), resolvePublicUsername(uidB, b)]);

    const roomRef = colChess().doc();
    tx.set(roomRef, {
      host: { uid: uidA, username: aUsername, avatar: a.avatar || null, selectedFrame: pickUserSelectedFrame(a), lastPing: nowMs() },
      guest: { uid: uidB, username: bUsername, avatar: b.avatar || null, selectedFrame: pickUserSelectedFrame(b), lastPing: nowMs() },
      status: 'playing',
      bet: 0,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      winner: null,
      createdAt: nowMs(),
      updatedAt: nowMs()
    });
    return { roomId: roomRef.id, gameType: 'chess', gamePath: '/Online Oyunlar/Satranc.html' };
  });
}


async function syncPendingInvitesForSocket(socket, io, uid) {
  if (!socket || !uid) return;
  socket.data = socket.data || {};
  socket.data.seenTargetInviteIds = socket.data.seenTargetInviteIds instanceof Set ? socket.data.seenTargetInviteIds : new Set();
  socket.data.seenHostInviteUpdateIds = socket.data.seenHostInviteUpdateIds instanceof Set ? socket.data.seenHostInviteUpdateIds : new Set();

  const pendingInvites = await listPendingInvitesForTarget(uid).catch(() => []);
  pendingInvites.forEach((invite) => {
    const inviteId = cleanStr(invite.inviteId || '', 160);
    if (!inviteId || socket.data.seenTargetInviteIds.has(inviteId)) return;
    socket.data.seenTargetInviteIds.add(inviteId);
    socket.emit('game:invite_receive', {
      inviteId,
      hostUid: invite.hostUid,
      hostName: invite.hostName,
      hostAvatar: invite.hostAvatar,
      hostSelectedFrame: invite.hostSelectedFrame,
      guestName: invite.guestName,
      guestAvatar: invite.guestAvatar,
      guestSelectedFrame: invite.guestSelectedFrame,
      roomId: invite.roomId,
      gameKey: invite.gameKey,
      gameName: invite.gameName,
      gamePath: invite.gamePath,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt
    });
  });

  const hostUpdates = await listInviteUpdatesForHost(uid).catch(() => []);
  hostUpdates.forEach((invite) => {
    const inviteId = cleanStr(invite.inviteId || '', 160);
    if (!inviteId) return;
    const dedupeKey = `${inviteId}:${invite.status}:${safeNum(invite.respondedAt || invite.updatedAt, 0)}`;
    if (socket.data.seenHostInviteUpdateIds.has(dedupeKey)) return;
    socket.data.seenHostInviteUpdateIds.add(dedupeKey);

    const basePayload = {
      inviteId,
      roomId: invite.roomId,
      gameKey: invite.gameKey,
      gameName: invite.gameName,
      gamePath: invite.gamePath,
      response: invite.status,
      hostUid: invite.hostUid,
      guestUid: invite.targetUid,
      guestName: invite.guestName || 'Oyuncu',
      guestAvatar: invite.guestAvatar || '',
      guestSelectedFrame: safeNum(invite.guestSelectedFrame, 0)
    };

    if (invite.status === 'accepted') {
      socket.emit('game:invite_success', basePayload);
    }
    socket.emit('game:invite_response', basePayload);
  });
}

module.exports = function initSockets(io, auth) {
  const transientSweepTimer = setInterval(() => {
    pruneTransientMaps();
  }, SOCKET_MEMORY_SWEEP_INTERVAL_MS);
  transientSweepTimer.unref?.();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('NO_TOKEN'));
      socket.user = await auth.verifyIdToken(String(token));
      socket.data = socket.data || {};
      socket.data.pistiRooms = socket.data.pistiRooms instanceof Set ? socket.data.pistiRooms : new Set();
      socket.data.bjRoomId = socket.data.bjRoomId || null;
      return next();
    } catch (_error) {
      return next(new Error('BAD_TOKEN'));
    }
  });

  io.on('connection', async (socket) => {
    const uid = socket.user.uid;
    trackUserOnline(uid);
    socket.join('crash');
    socket.join('lobby');
    socket.join(`user_${uid}`);

    const lobbyMessages = await loadLobbyChatHistory();
    socket.emit('chat:lobby_history', { messages: lobbyMessages.slice(-LOBBY_CHAT_HISTORY_LIMIT), policy: CHAT_RETENTION_POLICY });

    socket.data.seenTargetInviteIds = socket.data.seenTargetInviteIds instanceof Set ? socket.data.seenTargetInviteIds : new Set();
    socket.data.seenHostInviteUpdateIds = socket.data.seenHostInviteUpdateIds instanceof Set ? socket.data.seenHostInviteUpdateIds : new Set();

    const syncSocketPresence = (status = 'IDLE', activity = '', extras = {}) => updateUserPresence(io, uid, status, activity, { ...extras, socketId: socket.id });

    await touchSocketConnection({ socketId: socket.id, uid, status: 'IDLE', activity: 'Lobide' }).catch(() => null);
    if (!userPresence[uid] || getUserPresence(uid).status === 'OFFLINE') syncSocketPresence('IDLE', 'Lobide');
    else emitPresenceUpdate(io, uid, 'sync');
    touchUserActivity(uid, { scope: 'socket_connect', status: 'IDLE', activity: 'Lobide' }).catch(() => null);
    syncPendingInvitesForSocket(socket, io, uid).catch(() => null);

    socket.data.lastPongAt = Date.now();
    socket.data.connectionRefreshTimer = setInterval(() => {
      const presence = getUserPresence(uid);
      touchSocketConnection({
        socketId: socket.id,
        uid,
        status: presence.status || 'IDLE',
        activity: presence.activity || 'Lobide',
        gameType: presence.gameType || ''
      }).catch(() => null);
    }, 45000);
    socket.data.connectionRefreshTimer.unref?.();

    socket.data.inviteSyncTimer = setInterval(() => {
      syncPendingInvitesForSocket(socket, io, uid).catch(() => null);
    }, 4000);
    socket.data.inviteSyncTimer.unref?.();

    socket.data.socketHealthTimer = setInterval(() => {
      const now = Date.now();
      const lastPongAt = safeNum(socket.data.lastPongAt, 0);
      if (lastPongAt > 0 && (now - lastPongAt) > SOCKET_STALE_TIMEOUT_MS) {
        try { socket.emit('pm:stale', { reason: 'pong_timeout', ts: now }); } catch (_) {}
        try { socket.disconnect(true); } catch (_) {}
        return;
      }
      try { socket.emit('pm:ping', { ts: now }); } catch (_) {}
    }, SOCKET_PING_INTERVAL_MS);
    socket.data.socketHealthTimer.unref?.();

    socket.on('pm:pong', (payload = {}) => {
      socket.data.lastPongAt = Date.now();
      const presence = getUserPresence(uid);
      touchSocketConnection({
        socketId: socket.id,
        uid,
        status: presence.status || 'IDLE',
        activity: presence.activity || 'Lobide',
        gameType: presence.gameType || ''
      }).catch(() => null);
      if (payload?.page) {
        touchUserActivity(uid, { scope: 'socket_pong', status: presence.status || 'IDLE', activity: cleanStr(payload.page, 120) || 'socket_pong' }).catch(() => null);
      }
    });

    socket.on('social:set_presence', (data = {}) => {
      const rawStatus = cleanStr(data?.status || 'IDLE', 24).toUpperCase();
      const nextStatus = ['IDLE', 'MATCHMAKING', 'IN_GAME'].includes(rawStatus) ? rawStatus : 'IDLE';
      const activity = cleanStr(data?.activity || '', 80);
      syncSocketPresence(nextStatus, activity, { gameType: data?.gameType || '' });
      touchUserActivity(uid, { scope: 'socket_presence', status: nextStatus, activity }).catch(() => null);
    });

    socket.on('bj:join', () => {
      const roomId = `bj_${uid}`;
      if (socket.data.bjRoomId && socket.data.bjRoomId !== roomId) socket.leave(socket.data.bjRoomId);
      socket.data.bjRoomId = roomId;
      socket.join(roomId);
    });

    socket.on('bj:leave', () => {
      if (socket.data.bjRoomId) socket.leave(socket.data.bjRoomId);
      socket.data.bjRoomId = null;
    });






    socket.on('pisti:join', (id) => {
      const roomId = cleanStr(id, 160);
      if (!roomId) return;
      socket.join(`pisti_${roomId}`);
      socket.data.pistiRooms.add(roomId);
    });

    socket.on('pisti:leave', (id) => {
      const roomId = cleanStr(id, 160);
      if (!roomId) return;
      socket.leave(`pisti_${roomId}`);
      socket.data.pistiRooms.delete(roomId);
    });

    socket.on('chat:lobby_send', async (payload) => {
      try {
        if (hitRateLimit('chat', uid, SOCKET_CHAT_WINDOW_MS, SOCKET_CHAT_MAX_PER_WINDOW)) return socket.emit('chat:lobby_error', { message: 'Spam engellendi.' });
        const msg = cleanStr(payload?.message || '', LOBBY_CHAT_MAX_LENGTH);
        if (!msg || checkProfanity(msg)) return socket.emit('chat:lobby_error', { message: 'Geçersiz veya küfürlü mesaj.' });

        const uSnap = await colUsers().doc(uid).get();
        const u = uSnap.data() || {};
        const restriction = restrictionSnapshot(u);
        if (restriction.isBanned) return socket.emit('chat:lobby_error', { message: 'Hesabınız kısıtlı.' });
        if (restriction.globalChatBlocked) return socket.emit('chat:lobby_error', { message: formatRestrictionMessage('global', u) });
        if (isDuplicateMessage(uid, msg, 'lobby')) return socket.emit('chat:lobby_error', { message: 'Aynı mesajı çok hızlı tekrar gönderdiniz.' });
        const publicUsername = await resolvePublicUsername(uid, u);
        const chatPayload = {
          id: crypto.randomUUID(),
          uid,
          username: publicUsername,
          avatar: u.avatar || '',
          selectedFrame: pickUserSelectedFrame(u),
          message: msg,
          createdAt: Date.now()
        };
        lobbyChatHistory.push(chatPayload);
        if (lobbyChatHistory.length > LOBBY_CHAT_HISTORY_LIMIT) lobbyChatHistory.shift();
        persistLobbyChatMessage(chatPayload).catch(() => null);
        io.to('lobby').emit('chat:lobby_new', chatPayload);
      } catch (_) {}
    });

    socket.on('chat:dm_load_history', async (payload) => {
      try {
        const targetUid = cleanStr(payload?.targetUid || payload?.toUid || '', 160);
        if (!targetUid || targetUid === uid) return socket.emit('chat:dm_error', { message: 'Geçersiz konuşma.' });
        await assertDmAllowedInSocket(uid, targetUid);
        const messages = await loadDirectChatHistory(uid, targetUid);
        const readInfo = await markDirectMessagesRead(uid, targetUid, 200);
        if (readInfo.changed > 0) {
          await decrementUnreadCounter(uid, readInfo.changed).catch(() => null);
          io.to(`user_${targetUid}`).emit('chat:dm_read', { chatId: readInfo.chatId, byUid: uid, targetUid, readAt: readInfo.readAt });
          socket.emit('chat:unread_count', { unread: Math.max(0, safeNum((await colUsers().doc(uid).get().catch(() => ({ data: () => ({ unread_messages: 0 }) }))).data()?.unread_messages, 0)) });
        }
        touchUserActivity(uid, { scope: 'dm_load' }).catch(() => null);
        socket.emit('chat:dm_history', { targetUid, peerUid: targetUid, messages, policy: CHAT_RETENTION_POLICY });
      } catch (error) {
        socket.emit('chat:dm_error', { message: error.message || 'Konuşma geçmişi yüklenemedi.' });
      }
    });

    socket.on('chat:typing', async (payload) => {
      try {
        if (hitRateLimit('chat_typing', uid, SOCKET_TYPING_WINDOW_MS, SOCKET_TYPING_MAX_PER_WINDOW)) return;
        const targetUid = cleanStr(payload?.toUid || payload?.targetUid || '', 160);
        if (!targetUid || targetUid === uid) return;
        await assertDmAllowedInSocket(uid, targetUid);
        const relationship = await getPeerRelationshipFlagsInSocket(targetUid, uid);
        if (relationship.mine.muted) return;
        io.to(`user_${targetUid}`).emit('chat:typing_status', { fromUid: uid, isTyping: !!payload?.isTyping, ts: nowMs() });
      } catch (_) {}
    });

    socket.on('chat:dm_send', async (payload) => {
      try {
        if (hitRateLimit('chat_dm', uid, SOCKET_DM_WINDOW_MS, SOCKET_DM_MAX_PER_WINDOW)) return socket.emit('chat:dm_error', { message: 'Spam.' });
        const targetUid = cleanStr(payload?.targetUid || payload?.toUid || '', 160);
        const msg = cleanStr(payload?.message || payload?.text || '', LOBBY_CHAT_MAX_LENGTH);
        if (!targetUid || targetUid === uid || !msg || checkProfanity(msg)) return socket.emit('chat:dm_error', { message: 'Hata.' });

        await assertDmAllowedInSocket(uid, targetUid);

        const uSnap = await colUsers().doc(uid).get();
        const u = uSnap.data() || {};
        const restriction = restrictionSnapshot(u);
        if (restriction.isBanned) return socket.emit('chat:dm_error', { message: 'Hesabınız kısıtlı.' });
        if (restriction.dmBlocked) return socket.emit('chat:dm_error', { message: formatRestrictionMessage('dm', u) });
        if (isDuplicateMessage(uid, msg, `dm:${targetUid}`)) return socket.emit('chat:dm_error', { message: 'Aynı mesajı çok hızlı tekrar gönderdiniz.' });
        const chatId = getPersistentDirectChatId(uid, targetUid);
        const messageId = crypto.randomUUID();
        const createdAt = nowMs();

        await colChats().doc(chatId).collection('messages').doc(messageId).set({
          sender: uid,
          text: msg,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt,
          expiresAt: createdAt + (DIRECT_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
          status: 'sent'
        });
        await colChats().doc(chatId).set({
          lastMessage: msg,
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMessageSender: uid,
          participants: [uid, targetUid],
          participantKey: chatId
        }, { merge: true });

        const publicUsername = await resolvePublicUsername(uid, u);
        const dmPayload = formatDirectMessagePayload({
          id: messageId,
          chatId,
          sender: uid,
          toUid: targetUid,
          username: publicUsername,
          avatar: u.avatar || '',
          selectedFrame: pickUserSelectedFrame(u),
          text: msg,
          createdAt,
          status: 'sent',
          clientTempId: cleanStr(payload?.clientTempId || '', 120)
        });

        const receiverRelationship = await getPeerRelationshipFlagsInSocket(targetUid, uid).catch(() => ({ mine: { muted: false } }));
        const receiverMutedSender = !!receiverRelationship?.mine?.muted;
        let targetUnread = null;
        if (!receiverMutedSender) {
          await colUsers().doc(targetUid).set({ unread_messages: admin.firestore.FieldValue.increment(1) }, { merge: true });
          try {
            const targetUnreadSnap = await colUsers().doc(targetUid).get();
            targetUnread = Math.max(0, safeNum(targetUnreadSnap.data()?.unread_messages, 0));
          } catch (_) {}
        }
        if ((await isUserOnline(targetUid)) && !receiverMutedSender) {
          io.to(`user_${targetUid}`).emit('chat:dm_new', dmPayload);
          io.to(`user_${targetUid}`).emit('chat:direct_receive', dmPayload);
          if (targetUnread !== null) io.to(`user_${targetUid}`).emit('chat:unread_count', { unread: targetUnread });
        }
        io.to(`user_${uid}`).emit('chat:conversation_updated', { chatId, targetUid, lastMessage: msg, ts: createdAt });
        io.to(`user_${targetUid}`).emit('chat:conversation_updated', { chatId, targetUid: uid, lastMessage: msg, ts: createdAt });

        touchUserActivity(uid, { scope: 'dm_send' }).catch(() => null);
        socket.emit('chat:dm_success', dmPayload);
        socket.emit('chat:direct_sent', dmPayload);
      } catch (error) {
        captureError(error, { scope: 'socket', event: 'chat:dm_send', uid }).catch(() => null);
        socket.emit('chat:dm_error', { message: error.message || 'Özel mesaj gönderilemedi.' });
      }
    });

    socket.on('chat:dm_mark_read', async (payload) => {
      try {
        const targetUid = cleanStr(payload?.targetUid || payload?.fromUid || '', 160);
        if (!targetUid || targetUid === uid) return;
        const areFriends = await ensureAcceptedFriendship(uid, targetUid);
        if (!areFriends) return;
        const readInfo = await markDirectMessagesRead(uid, targetUid, 200);
        if (readInfo.changed > 0) {
          await decrementUnreadCounter(uid, readInfo.changed).catch(() => null);
          io.to(`user_${targetUid}`).emit('chat:dm_read', { chatId: readInfo.chatId, byUid: uid, targetUid, readAt: readInfo.readAt });
        }
        const meSnap = await colUsers().doc(uid).get().catch(() => null);
        socket.emit('chat:unread_count', { unread: Math.max(0, safeNum(meSnap?.data()?.unread_messages, 0)) });
        touchUserActivity(uid, { scope: 'dm_read' }).catch(() => null);
      } catch (_) {}
    });

    socket.on('game:invite_send', async (payload) => {
      try {
        if (hitRateLimit('invite', uid, SOCKET_INVITE_WINDOW_MS, SOCKET_INVITE_MAX_PER_WINDOW)) return socket.emit('game:invite_error', { message: 'Davet limiti aşıldı.' });
        const targetUid = cleanStr(payload?.targetUid || '', 160);
        const roomId = cleanStr(payload?.roomId || '', 160);
        const gameKey = normalizeGameType(payload?.gameKey || payload?.gameType || payload?.game || '');
        if (!targetUid || targetUid === uid) return socket.emit('game:invite_error', { message: 'Geçersiz hedef oyuncu.' });
        if (!roomId || !gameKey) return socket.emit('game:invite_error', { message: 'Davet bilgisi eksik.' });

        const areFriends = await ensureAcceptedFriendship(uid, targetUid);
        if (!areFriends) return socket.emit('game:invite_error', { message: 'Sadece arkadaşlarını davet edebilirsin.' });

        const [hostSnap, targetSnap] = await Promise.all([colUsers().doc(uid).get(), colUsers().doc(targetUid).get()]);
        const host = hostSnap.data() || {};
        const target = targetSnap.data() || {};
        const inviteRoom = await validateInviteRoomOwnership(uid, roomId, gameKey);
        assertInviteJoinable(inviteRoom, { gameKey, targetUid }, targetUid);
        await assertNoOtherActiveGame(targetUid, { allowGameType: gameKey, allowRoomId: roomId }).catch(() => { throw new Error('Hedef oyuncunun önce aktif oyun oturumunu kapatması gerekiyor.'); });
        const [hostNameResolved, guestNameResolved] = await Promise.all([
          resolvePublicUsername(uid, host),
          resolvePublicUsername(targetUid, target)
        ]);

        const inviteConflict = await findPendingInviteBetweenUsers(uid, targetUid, roomId, gameKey);
        if (inviteConflict.kind === 'block') return socket.emit('game:invite_error', { message: inviteConflict.message || 'Bu davet zaten bekliyor.' });
        const invite = inviteConflict.kind === 'reuse' ? inviteConflict.invite : await createInvite({
          hostUid: uid,
          targetUid,
          roomId,
          gameKey,
          gameName: cleanStr(payload?.gameName || getGameDisplayName(gameKey), 32) || getGameDisplayName(gameKey),
          gamePath: getGamePath(gameKey),
          hostName: cleanStr(hostNameResolved || 'Oyuncu', 32) || 'Oyuncu',
          hostAvatar: host.avatar || '',
          hostSelectedFrame: pickUserSelectedFrame(host),
          guestName: cleanStr(guestNameResolved || 'Oyuncu', 32) || 'Oyuncu',
          guestAvatar: target.avatar || '',
          guestSelectedFrame: pickUserSelectedFrame(target)
        });

        io.to(`user_${targetUid}`).emit('game:invite_receive', {
          inviteId: invite.inviteId,
          hostUid: uid,
          hostName: invite.hostName,
          hostAvatar: invite.hostAvatar,
          hostSelectedFrame: invite.hostSelectedFrame,
          guestName: invite.guestName,
          guestAvatar: invite.guestAvatar,
          guestSelectedFrame: invite.guestSelectedFrame,
          roomId,
          gameKey,
          gameName: invite.gameName,
          gamePath: invite.gamePath,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt
        });
        const targetOnline = await isUserOnline(targetUid);
        createNotification({
          uid: targetUid,
          type: 'game_invite',
          title: 'Oyun daveti',
          body: `${invite.hostName || 'Bir oyuncu'} seni ${invite.gameName || getGameDisplayName(gameKey)} oyununa davet etti.`,
          data: { inviteId: invite.inviteId, roomId, gameKey, gameName: invite.gameName, gamePath: invite.gamePath, hostUid: uid },
          idempotencyKey: `game_invite:${invite.inviteId}`
        }).catch(() => null);
        socket.emit('game:invite_sent', { inviteId: invite.inviteId, roomId, targetUid, gameKey, offline: !targetOnline, reused: inviteConflict.kind === 'reuse' });
      } catch (error) {
        captureError(error, { scope: 'socket', event: 'game:invite_send', uid }).catch(() => null);
        socket.emit('game:invite_error', { message: error.message || 'Davet gönderilemedi.' });
      }
    });

    socket.on('game:invite_response', async (payload) => {
      try {
        const inviteId = cleanStr(payload?.inviteId || '', 160);
        const response = cleanStr(payload?.response || '', 24).toLowerCase();
        if (!inviteId || !['accepted', 'declined'].includes(response)) return;

        const invite = await getInvite(inviteId);
        if (!invite) return socket.emit('game:invite_error', { message: 'Davet bulunamadı veya süresi doldu.' });
        if (invite.targetUid !== uid) return socket.emit('game:invite_error', { message: 'Bu davete yanıt verme yetkiniz yok.' });
        if (safeNum(invite.expiresAt, 0) <= nowMs()) return socket.emit('game:invite_error', { message: 'Davetin süresi doldu.' });

        if (response === 'accepted') {
          await assertNoOtherActiveGame(uid, { allowGameType: invite.gameKey, allowRoomId: invite.roomId }).catch(() => { throw new Error('Önce aktif oyun oturumunu kapatmalısın.'); });
          const inviteRoom = await validateInviteRoomOwnership(invite.hostUid, invite.roomId, invite.gameKey);
          assertInviteJoinable(inviteRoom, invite, uid);
        }

        const finalizedInvite = await respondToInvite(inviteId, uid, response);
        if (response === 'accepted') expireCompetingInvites({ targetUid: uid, exceptInviteId: inviteId }).catch(() => null);
        const guestSnap = await colUsers().doc(uid).get();
        const guest = guestSnap.data() || {};
        const guestName = cleanStr((await resolvePublicUsername(uid, guest)) || finalizedInvite.guestName || 'Oyuncu', 32) || 'Oyuncu';
        const basePayload = {
          inviteId,
          roomId: finalizedInvite.roomId,
          gameKey: finalizedInvite.gameKey,
          gameName: finalizedInvite.gameName,
          gamePath: finalizedInvite.gamePath,
          response,
          hostUid: finalizedInvite.hostUid,
          guestUid: uid,
          guestName,
          guestAvatar: guest.avatar || finalizedInvite.guestAvatar || '',
          guestSelectedFrame: pickUserSelectedFrame(guest)
        };

        if (response === 'accepted') {
          syncSocketPresence('IN_GAME', getPresenceActivity('IN_GAME', finalizedInvite.gameKey), { gameType: finalizedInvite.gameKey });
          updateUserPresence(io, finalizedInvite.hostUid, 'IN_GAME', getPresenceActivity('IN_GAME', finalizedInvite.gameKey), { gameType: finalizedInvite.gameKey });
          io.to(`user_${finalizedInvite.hostUid}`).emit('game:invite_success', basePayload);
        }

        io.to(`user_${finalizedInvite.hostUid}`).emit('game:invite_response', basePayload);
        socket.emit('game:invite_response', basePayload);
      } catch (error) {
        captureError(error, { scope: 'socket', event: 'game:invite_response', uid }).catch(() => null);
        socket.emit('game:invite_error', { message: error.message || 'Davet yanıtı işlenemedi.' });
      }
    });

    socket.on('game:matchmake_join', async (data) => {
      try {
        const gameType = normalizeGameType(data?.gameType || data?.game || '');
        if (!gameType) return socket.emit('game:matchmake_error', { message: 'Geçersiz oyun.' });
        if (getUserPresence(uid).status === 'IN_GAME') return socket.emit('game:matchmake_error', { message: 'Zaten oyundasınız.' });

        await removeUserFromQueue(uid);
        const reqData = { uid, gameType, joinedAt: Date.now() };


        syncSocketPresence('MATCHMAKING', 'Eşleşme Aranıyor...', { gameType });
        const claimResult = await claimMatchmakingCandidate(reqData);
        if (claimResult?.type === 'matched' && claimResult.candidate?.uid) {
          const room = await createMatchmakingRoom(gameType, claimResult.candidate.uid, uid, reqData);
          updateUserPresence(io, claimResult.candidate.uid, 'IN_GAME', getPresenceActivity('IN_GAME', gameType), { gameType });
          syncSocketPresence('IN_GAME', getPresenceActivity('IN_GAME', gameType), { gameType });
          const payload = { ok: true, gameType, roomId: room.roomId, gamePath: room.gamePath, mode: room.mode || reqData.mode, bet: room.bet || reqData.bet };
          io.to(`user_${claimResult.candidate.uid}`).emit('game:matchmake_success', payload);
          io.to(`user_${uid}`).emit('game:matchmake_success', payload);
        } else {
          matchQueue[gameType] = [reqData];
          socket.emit('game:matchmake_joined', { ok: true, gameType, mode: reqData.mode, bet: reqData.bet, queuedAt: Date.now() });
        }
      } catch (error) {
        captureError(error, { scope: 'socket', event: 'game:matchmake_join', uid }).catch(() => null);
        await removeUserFromQueue(uid);
        syncSocketPresence('IDLE', 'Lobide');
        socket.emit('game:matchmake_error', { message: error.message || 'Hata' });
      }
    });

    socket.on('game:matchmake_leave', async (data) => {
      const gameType = normalizeGameType(data?.gameType || '');
      await removeUserFromQueue(uid, gameType);
      if (getUserPresence(uid).status === 'MATCHMAKING') syncSocketPresence('IDLE', 'Lobide');
      socket.emit('game:matchmake_left', { ok: true, gameType });
    });

    socket.on('disconnect', () => {
      if (socket.data.connectionRefreshTimer) clearInterval(socket.data.connectionRefreshTimer);
      if (socket.data.inviteSyncTimer) clearInterval(socket.data.inviteSyncTimer);
      if (socket.data.socketHealthTimer) clearInterval(socket.data.socketHealthTimer);
      if (socket.data.bjRoomId) socket.leave(socket.data.bjRoomId);
      if (socket.data.pistiRooms instanceof Set) {
        socket.data.pistiRooms.forEach((roomId) => socket.leave(`pisti_${roomId}`));
      }

      removeSocketConnection(socket.id).catch(() => null);
      const wentOffline = untrackUserOnline(uid);
      if (wentOffline) {
        const presence = userPresence[uid] || { status: 'IDLE' };
        presence.disconnectTimer = setTimeout(async () => {
          await removeUserFromQueue(uid);
          const stillOnline = await isUserOnline(uid).catch(() => false);
          if (stillOnline) return;
          userPresence[uid] = { ...presence, status: 'OFFLINE', lastSeen: Date.now(), disconnectTimer: null };
          persistPresence(uid, userPresence[uid]).catch(() => null);
          emitPresenceUpdate(io, uid, 'disconnect');
          colUsers().doc(uid).set({ lastSeen: admin.firestore.Timestamp.now() }, { merge: true }).catch(() => {});
        }, PRESENCE_GRACE_MS);
      }
    });
  });
};
