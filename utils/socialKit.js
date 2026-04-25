'use strict';

const { db } = require('../config/firebase');
const { cleanStr, safeNum, nowMs } = require('./helpers');
const { getCanonicalSelectedFrame } = require('./accountState');

const colUsers = () => db.collection('users');
const colUsernames = () => db.collection('usernames');
const colFriends = () => db.collection('friends');
const colChats = () => db.collection('chats');

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

function friendshipDocId(uidA, uidB) {
  return [String(uidA || '').trim(), String(uidB || '').trim()].filter(Boolean).sort().join('__');
}

async function ensureAcceptedFriendship(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;
  const snap = await colFriends().doc(friendshipDocId(uidA, uidB)).get();
  return !!(snap.exists && snap.data()?.status === 'accepted');
}

function getPersistentDirectChatId(uidA, uidB) {
  return [String(uidA || '').trim(), String(uidB || '').trim()].filter(Boolean).sort().join('_');
}

function socialEdgeRef(uid, targetUid) {
  const safeUid = cleanStr(uid || '', 160);
  const safeTargetUid = cleanStr(targetUid || '', 160);
  return colUsers().doc(safeUid).collection('social_edges').doc(safeTargetUid);
}

async function getSocialEdge(uid, targetUid) {
  if (!uid || !targetUid) return {};
  try {
    const snap = await socialEdgeRef(uid, targetUid).get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch (_) {
    return {};
  }
}

async function getPeerRelationshipFlags(uid, targetUid) {
  const [mine, theirs] = await Promise.all([
    getSocialEdge(uid, targetUid),
    getSocialEdge(targetUid, uid)
  ]);

  return {
    mine: {
      blocked: !!mine.blocked,
      muted: !!mine.muted,
      archived: !!mine.archived,
      pinned: !!mine.pinned,
      note: cleanStr(mine.note || '', 180),
      updatedAt: safeNum(mine.updatedAt, 0)
    },
    theirs: {
      blocked: !!theirs.blocked,
      muted: !!theirs.muted,
      archived: !!theirs.archived,
      pinned: !!theirs.pinned,
      note: cleanStr(theirs.note || '', 180),
      updatedAt: safeNum(theirs.updatedAt, 0)
    }
  };
}

async function setSocialEdgeFlags(uid, targetUid, patch = {}) {
  if (!uid || !targetUid || uid === targetUid) return false;
  const next = {
    blocked: patch.blocked === true,
    muted: patch.muted === true,
    archived: patch.archived === true,
    pinned: patch.pinned === true,
    note: cleanStr(patch.note || '', 180),
    updatedAt: nowMs()
  };
  await socialEdgeRef(uid, targetUid).set(next, { merge: true });
  return true;
}

async function assertDmAllowed(senderUid, targetUid) {
  if (!senderUid || !targetUid || senderUid === targetUid) throw new Error('Geçersiz konuşma.');
  const areFriends = await ensureAcceptedFriendship(senderUid, targetUid);
  if (!areFriends) throw new Error('Arkadaş değilsiniz.');
  const flags = await getPeerRelationshipFlags(senderUid, targetUid);
  if (flags.mine.blocked) throw new Error('Bu kullanıcıyı engellediniz.');
  if (flags.theirs.blocked) throw new Error('Bu kullanıcı size mesaj kabul etmiyor.');
  return flags;
}

async function listConversationDocs(uid, limit = 40, options = {}) {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return { items: [], nextCursor: '' };
  const max = Math.max(1, Math.min(100, Math.floor(safeNum(limit, 40))));
  const safeCursor = cleanStr(options?.cursor || '', 220);
  const scanLimit = Math.max(80, Math.min(300, Math.floor(safeNum(options?.scanLimit, Math.max(max * 4, 120)))));
  const snap = await colChats()
    .where('participants', 'array-contains', safeUid)
    .limit(scanLimit)
    .get()
    .catch(() => ({ docs: [] }));

  let docs = (snap.docs || [])
    .sort((a, b) => safeNum(b.data()?.lastUpdatedAt?.toMillis?.() || b.data()?.lastUpdatedAt, 0) - safeNum(a.data()?.lastUpdatedAt?.toMillis?.() || a.data()?.lastUpdatedAt, 0));

  if (safeCursor) {
    const [cursorTsRaw, cursorIdRaw] = safeCursor.split('|');
    const cursorTs = safeNum(cursorTsRaw, 0);
    const cursorId = cleanStr(cursorIdRaw || '', 200);
    docs = docs.filter((doc) => {
      const ts = safeNum(doc.data()?.lastUpdatedAt?.toMillis?.() || doc.data()?.lastUpdatedAt, 0);
      if (ts < cursorTs) return true;
      if (ts === cursorTs && cursorId && String(doc.id) > cursorId) return true;
      return false;
    });
  }

  const page = docs.slice(0, max);
  const last = page[page.length - 1];
  const nextCursor = docs.length > max && last
    ? `${safeNum(last.data()?.lastUpdatedAt?.toMillis?.() || last.data()?.lastUpdatedAt, 0)}|${last.id}`
    : '';

  return { items: page, nextCursor };
}

module.exports = {
  colUsers,
  colChats,
  getFirestoreTimestampMs,
  pickUserSelectedFrame,
  sanitizeStoredUsername,
  findUsernameByUid,
  resolvePublicUsername,
  friendshipDocId,
  ensureAcceptedFriendship,
  getPersistentDirectChatId,
  socialEdgeRef,
  getSocialEdge,
  getPeerRelationshipFlags,
  setSocialEdgeFlags,
  assertDmAllowed,
  listConversationDocs
};
