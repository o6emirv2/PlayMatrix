'use strict';

const { db, admin } = require('../config/firebase');
const { cleanStr, nowMs, safeNum } = require('./helpers');
const { PRESENCE_GRACE_MS } = require('../config/constants');

const SOCKET_CONNECTION_TTL_MS = Math.max(PRESENCE_GRACE_MS * 6, safeNum(process.env.SOCKET_CONNECTION_TTL_MS, 3 * 60 * 1000));
const MATCH_QUEUE_TTL_MS = Math.max(60 * 1000, safeNum(process.env.MATCH_QUEUE_TTL_MS, 2 * 60 * 1000));
const INVITE_TTL_MS = Math.max(30 * 1000, safeNum(process.env.GAME_INVITE_TTL_MS, 90 * 1000));
const INVITE_SYNC_LIMIT = 20;

const colPresence = () => db.collection('presence');
const colSocketConnections = () => db.collection('socket_connections');
const colMatchmakingQueue = () => db.collection('matchmaking_queue');
const colGameInvites = () => db.collection('game_invites');

function normalizeGameType(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('sat') || raw === 'chess') return 'chess';
  if (raw.includes('pist') || raw === 'pisti') return 'pisti';
  return '';
}

function normalizePresenceStatus(value = '') {
  const status = cleanStr(value || 'IDLE', 24).toUpperCase();
  return ['IDLE', 'MATCHMAKING', 'IN_GAME', 'OFFLINE'].includes(status) ? status : 'IDLE';
}

function getPresenceActivity(status = 'IDLE', gameType = '') {
  if (status === 'IN_GAME') return normalizeGameType(gameType) === 'pisti' ? 'Pişti Oynuyor' : 'Satranç Oynuyor';
  if (status === 'MATCHMAKING') return 'Eşleşme Aranıyor...';
  if (status === 'OFFLINE') return '';
  return 'Lobide';
}

function getMatchmakingDocId(entry = {}) {
  const uid = cleanStr(entry.uid || '', 160);
  const gameType = normalizeGameType(entry.gameType || '');
  if (!uid || !gameType) return '';
  return `${gameType}__${uid}`;
}

async function touchSocketConnection({ socketId = '', uid = '', status = 'IDLE', activity = '', gameType = '' } = {}) {
  const safeSocketId = cleanStr(socketId, 200);
  const safeUid = cleanStr(uid, 160);
  if (!safeSocketId || !safeUid) return false;
  const safeStatus = normalizePresenceStatus(status);
  const safeGameType = normalizeGameType(gameType || '');
  const now = nowMs();
  await colSocketConnections().doc(safeSocketId).set({
    socketId: safeSocketId,
    uid: safeUid,
    status: safeStatus,
    activity: cleanStr(activity || getPresenceActivity(safeStatus, safeGameType), 80),
    gameType: safeGameType,
    connectedAt: now,
    updatedAt: now,
    expiresAt: now + SOCKET_CONNECTION_TTL_MS,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return true;
}

async function removeSocketConnection(socketId = '') {
  const safeSocketId = cleanStr(socketId, 200);
  if (!safeSocketId) return false;
  await colSocketConnections().doc(safeSocketId).delete().catch(() => null);
  return true;
}

async function getLiveConnectionCount(uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return 0;
  const snap = await colSocketConnections()
    .where('uid', '==', safeUid)
    .where('expiresAt', '>', nowMs())
    .limit(20)
    .get()
    .catch(() => ({ docs: [] }));
  return Array.isArray(snap.docs) ? snap.docs.length : 0;
}

async function isUserOnlinePersistent(uid = '') {
  return (await getLiveConnectionCount(uid)) > 0;
}

async function setPresence(uid = '', presence = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return null;
  const status = normalizePresenceStatus(presence.status || 'IDLE');
  const gameType = normalizeGameType(presence.gameType || '');
  const activity = status === 'OFFLINE'
    ? ''
    : (cleanStr(presence.activity || getPresenceActivity(status, gameType), 80) || getPresenceActivity(status, gameType));
  const payload = {
    uid: safeUid,
    status,
    activity,
    gameType,
    online: status !== 'OFFLINE',
    updatedAt: nowMs(),
    lastSeen: safeNum(presence.lastSeen, status === 'OFFLINE' ? nowMs() : 0),
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };
  await colPresence().doc(safeUid).set(payload, { merge: true });
  return payload;
}

async function getPresence(uid = '', fallback = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return null;
  try {
    const snap = await colPresence().doc(safeUid).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const online = await isUserOnlinePersistent(safeUid).catch(() => !!data.online);
      return {
        status: normalizePresenceStatus(data.status || (online ? 'IDLE' : 'OFFLINE')),
        activity: cleanStr(data.activity || getPresenceActivity(data.status || 'IDLE', data.gameType || ''), 80),
        gameType: normalizeGameType(data.gameType || ''),
        online,
        updatedAt: safeNum(data.updatedAt, 0),
        lastSeen: safeNum(data.lastSeen, 0)
      };
    }
  } catch (_) {}
  const fallbackOnline = !!fallback.online;
  const status = normalizePresenceStatus(fallback.status || (fallbackOnline ? 'IDLE' : 'OFFLINE'));
  return {
    status,
    activity: cleanStr(fallback.activity || getPresenceActivity(status, fallback.gameType || ''), 80),
    gameType: normalizeGameType(fallback.gameType || ''),
    online: fallbackOnline,
    updatedAt: safeNum(fallback.updatedAt, 0),
    lastSeen: safeNum(fallback.lastSeen, 0)
  };
}

async function listPresenceForUids(uids = []) {
  const safeUids = Array.from(new Set((Array.isArray(uids) ? uids : []).map((uid) => cleanStr(uid || '', 160)).filter(Boolean)));
  if (!safeUids.length) return new Map();
  const snaps = await Promise.all(safeUids.map((uid) => colPresence().doc(uid).get().catch(() => null)));
  const liveCounts = await Promise.all(safeUids.map((uid) => getLiveConnectionCount(uid).catch(() => 0)));
  const map = new Map();
  safeUids.forEach((uid, index) => {
    const snap = snaps[index];
    const data = snap?.exists ? (snap.data() || {}) : {};
    const online = liveCounts[index] > 0;
    const status = normalizePresenceStatus(data.status || (online ? 'IDLE' : 'OFFLINE'));
    map.set(uid, {
      status,
      activity: cleanStr(data.activity || getPresenceActivity(status, data.gameType || ''), 80),
      gameType: normalizeGameType(data.gameType || ''),
      online,
      updatedAt: safeNum(data.updatedAt, 0),
      lastSeen: safeNum(data.lastSeen, 0)
    });
  });
  return map;
}

async function enqueueMatchmaking(entry = {}) {
  const docId = getMatchmakingDocId(entry);
  if (!docId) return null;
  const payload = {
    uid: cleanStr(entry.uid || '', 160),
    gameType: normalizeGameType(entry.gameType || ''),
    mode: cleanStr(entry.mode || '', 16),
    bet: Math.max(0, Math.floor(safeNum(entry.bet, 0))),
    joinedAt: safeNum(entry.joinedAt, nowMs()),
    updatedAt: nowMs(),
    expiresAt: nowMs() + MATCH_QUEUE_TTL_MS
  };
  await colMatchmakingQueue().doc(docId).set(payload, { merge: true });
  return payload;
}

async function dequeueMatchmaking(uid = '', gameType = '') {
  const safeUid = cleanStr(uid, 160);
  const safeGameType = normalizeGameType(gameType || '');
  if (!safeUid) return 0;
  const targets = safeGameType ? [safeGameType] : ['chess', 'pisti'];
  await Promise.all(targets.map((key) => colMatchmakingQueue().doc(`${key}__${safeUid}`).delete().catch(() => null)));
  return targets.length;
}

async function claimMatchmakingCandidate(entry = {}) {
  const safeEntry = {
    uid: cleanStr(entry.uid || '', 160),
    gameType: normalizeGameType(entry.gameType || ''),
    mode: cleanStr(entry.mode || '', 16),
    bet: Math.max(0, Math.floor(safeNum(entry.bet, 0))),
    joinedAt: safeNum(entry.joinedAt, nowMs())
  };
  const selfDocId = getMatchmakingDocId(safeEntry);
  if (!selfDocId || !safeEntry.uid || !safeEntry.gameType) return { type: 'invalid' };

  return db.runTransaction(async (tx) => {
    tx.delete(colMatchmakingQueue().doc(selfDocId));
    const query = colMatchmakingQueue()
      .where('gameType', '==', safeEntry.gameType)
      .orderBy('joinedAt', 'asc')
      .limit(25);
    const snap = await tx.get(query);
    const now = nowMs();
    const candidates = (snap.docs || [])
      .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() || {} }))
      .filter((doc) => doc.data.uid !== safeEntry.uid && safeNum(doc.data.expiresAt, 0) > now)
      .filter((doc) => safeEntry.gameType !== 'pisti' || (cleanStr(doc.data.mode || '', 16) === safeEntry.mode && Math.floor(safeNum(doc.data.bet, 0)) === safeEntry.bet))
      .sort((a, b) => safeNum(a.data.joinedAt, 0) - safeNum(b.data.joinedAt, 0));

    if (candidates.length) {
      const candidate = candidates[0];
      tx.delete(candidate.ref);
      return { type: 'matched', candidate: candidate.data };
    }

    const payload = {
      uid: safeEntry.uid,
      gameType: safeEntry.gameType,
      mode: safeEntry.mode,
      bet: safeEntry.bet,
      joinedAt: safeEntry.joinedAt || now,
      updatedAt: now,
      expiresAt: now + MATCH_QUEUE_TTL_MS,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    tx.set(colMatchmakingQueue().doc(selfDocId), payload, { merge: true });
    return { type: 'queued', queued: payload };
  });
}

async function createInvite(payload = {}) {
  const inviteId = cleanStr(payload.inviteId || '', 160) || db.collection('_').doc().id;
  const record = {
    inviteId,
    hostUid: cleanStr(payload.hostUid || '', 160),
    targetUid: cleanStr(payload.targetUid || '', 160),
    roomId: cleanStr(payload.roomId || '', 160),
    gameKey: normalizeGameType(payload.gameKey || ''),
    gameName: cleanStr(payload.gameName || '', 40),
    gamePath: cleanStr(payload.gamePath || '', 200),
    hostName: cleanStr(payload.hostName || '', 40) || 'Oyuncu',
    hostAvatar: cleanStr(payload.hostAvatar || '', 400),
    hostSelectedFrame: safeNum(payload.hostSelectedFrame, 0),
    guestName: cleanStr(payload.guestName || '', 40) || 'Oyuncu',
    guestAvatar: cleanStr(payload.guestAvatar || '', 400),
    guestSelectedFrame: safeNum(payload.guestSelectedFrame, 0),
    createdAt: nowMs(),
    updatedAt: nowMs(),
    respondedAt: 0,
    expiresAt: nowMs() + INVITE_TTL_MS,
    status: 'pending',
    targetDeliveredAt: 0,
    hostDeliveredAt: 0,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };
  await colGameInvites().doc(inviteId).set(record, { merge: true });
  return record;
}

async function getInvite(inviteId = '') {
  const safeInviteId = cleanStr(inviteId, 160);
  if (!safeInviteId) return null;
  const snap = await colGameInvites().doc(safeInviteId).get().catch(() => null);
  return snap?.exists ? { inviteId: safeInviteId, ...(snap.data() || {}) } : null;
}

async function respondToInvite(inviteId = '', responderUid = '', response = '') {
  const safeInviteId = cleanStr(inviteId, 160);
  const safeResponderUid = cleanStr(responderUid, 160);
  const nextStatus = cleanStr(response, 24).toLowerCase();
  if (!safeInviteId || !safeResponderUid || !['accepted', 'declined'].includes(nextStatus)) throw new Error('INVALID_INVITE_RESPONSE');

  return db.runTransaction(async (tx) => {
    const ref = colGameInvites().doc(safeInviteId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('INVITE_NOT_FOUND');
    const data = snap.data() || {};
    if (cleanStr(data.targetUid || '', 160) !== safeResponderUid) throw new Error('INVITE_FORBIDDEN');
    if (cleanStr(data.status || 'pending', 24) !== 'pending') throw new Error('INVITE_CLOSED');
    if (safeNum(data.expiresAt, 0) <= nowMs()) throw new Error('INVITE_EXPIRED');
    tx.set(ref, { status: nextStatus, respondedAt: nowMs(), updatedAt: nowMs() }, { merge: true });
    return { inviteId: safeInviteId, ...data, status: nextStatus, respondedAt: nowMs() };
  });
}

async function listPendingInvitesForTarget(uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return [];
  const snap = await colGameInvites().where('targetUid', '==', safeUid).limit(INVITE_SYNC_LIMIT).get().catch(() => ({ docs: [] }));
  const now = nowMs();
  return (snap.docs || [])
    .map((doc) => ({ inviteId: doc.id, ...(doc.data() || {}) }))
    .filter((invite) => cleanStr(invite.status || 'pending', 24) === 'pending' && safeNum(invite.expiresAt, 0) > now)
    .sort((a, b) => safeNum(a.createdAt, 0) - safeNum(b.createdAt, 0));
}

async function listInviteUpdatesForHost(uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return [];
  const snap = await colGameInvites().where('hostUid', '==', safeUid).limit(INVITE_SYNC_LIMIT).get().catch(() => ({ docs: [] }));
  return (snap.docs || [])
    .map((doc) => ({ inviteId: doc.id, ...(doc.data() || {}) }))
    .filter((invite) => ['accepted', 'declined', 'expired'].includes(cleanStr(invite.status || '', 24)))
    .sort((a, b) => safeNum(a.respondedAt || a.updatedAt, 0) - safeNum(b.respondedAt || b.updatedAt, 0));
}

async function expireCompetingInvites({ targetUid = '', exceptInviteId = '' } = {}) {
  const safeTargetUid = cleanStr(targetUid, 160);
  const safeExceptInviteId = cleanStr(exceptInviteId, 160);
  if (!safeTargetUid) return 0;
  const snap = await colGameInvites().where('targetUid', '==', safeTargetUid).limit(50).get().catch(() => ({ docs: [] }));
  if (!snap.docs?.length) return 0;
  const batch = db.batch();
  const ts = nowMs();
  let changed = 0;
  for (const doc of snap.docs || []) {
    if (doc.id === safeExceptInviteId) continue;
    const data = doc.data() || {};
    if (cleanStr(data.status || 'pending', 24) !== 'pending') continue;
    if (safeNum(data.expiresAt, 0) <= ts) continue;
    batch.set(doc.ref, { status: 'expired', respondedAt: ts, updatedAt: ts, closeReason: 'superseded' }, { merge: true });
    changed += 1;
  }
  if (changed > 0) await batch.commit().catch(() => null);
  return changed;
}

async function cleanupRealtimeState() {
  const now = nowMs();

  async function drainExpiredDocs(queryFactory) {
    while (true) {
      const snap = await queryFactory().limit(250).get().catch(() => ({ docs: [] }));
      if (!snap.docs?.length) break;
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit().catch(() => null);
      if (snap.docs.length < 250) break;
    }
  }

  await drainExpiredDocs(() => colSocketConnections().where('expiresAt', '<=', now));
  await drainExpiredDocs(() => colMatchmakingQueue().where('expiresAt', '<=', now));

  const staleInviteCutoff = now - (6 * 60 * 60 * 1000);
  let lastDoc = null;
  while (true) {
    let query = colGameInvites().orderBy(admin.firestore.FieldPath.documentId()).limit(250);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const inviteSnap = await query.get().catch(() => ({ docs: [] }));
    if (!inviteSnap.docs?.length) break;

    const inviteBatch = db.batch();
    let inviteOps = 0;
    for (const doc of inviteSnap.docs || []) {
      const data = doc.data() || {};
      const status = cleanStr(data.status || 'pending', 24).toLowerCase();
      const expiresAt = safeNum(data.expiresAt, 0);
      const updatedAt = safeNum(data.updatedAt || data.respondedAt || data.createdAt, 0);
      if (status === 'pending' && expiresAt > 0 && expiresAt <= now) {
        inviteBatch.set(doc.ref, { status: 'expired', respondedAt: now, updatedAt: now }, { merge: true });
        inviteOps += 1;
      } else if (['accepted', 'declined', 'expired'].includes(status) && updatedAt > 0 && updatedAt < staleInviteCutoff) {
        inviteBatch.delete(doc.ref);
        inviteOps += 1;
      }
    }
    if (inviteOps > 0) await inviteBatch.commit().catch(() => null);
    lastDoc = inviteSnap.docs[inviteSnap.docs.length - 1];
    if (inviteSnap.docs.length < 250) break;
  }
}

module.exports = {
  SOCKET_CONNECTION_TTL_MS,
  MATCH_QUEUE_TTL_MS,
  INVITE_TTL_MS,
  normalizeGameType,
  normalizePresenceStatus,
  getPresenceActivity,
  touchSocketConnection,
  removeSocketConnection,
  getLiveConnectionCount,
  isUserOnlinePersistent,
  setPresence,
  getPresence,
  listPresenceForUids,
  enqueueMatchmaking,
  dequeueMatchmaking,
  claimMatchmakingCandidate,
  createInvite,
  getInvite,
  respondToInvite,
  listPendingInvitesForTarget,
  listInviteUpdatesForHost,
  expireCompetingInvites,
  cleanupRealtimeState
};
