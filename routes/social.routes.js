'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { db } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { safeNum, safeFloat, cleanStr, nowMs } = require('../utils/helpers');
const { getCanonicalSelectedFrame } = require('../utils/accountState');
const { buildProgressionSnapshot } = require('../utils/progression');
const { DEFAULT_AVATAR, sanitizeAvatarForStorage } = require('../utils/avatarManifest');
const { listPresenceForUids } = require('../utils/realtimeState');
const { recordAuditLog } = require('../utils/logger');

const colUsers = () => db.collection('users');
const colFriends = () => db.collection('friends');
const colSupportReceipts = () => db.collection('support_receipts');
const colSupportCallbacks = () => db.collection('support_callback_requests');
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

function friendshipDocId(uidA, uidB) {
  return [String(uidA || '').trim(), String(uidB || '').trim()].filter(Boolean).sort().join('__');
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

function buildSocialMemberPayload(uid = '', userData = {}, options = {}) {
  const presence = options.presence || null;
  const progression = buildProgressionSnapshot(userData);
  const monthlyActiveScore = progression.monthlyActivity;
  const lastSeen = getFirestoreTimestampMs(userData.lastSeen?.toMillis?.() ? userData.lastSeen : (userData.lastSeen || userData.lastActiveAt), 0);
  const chessWins = safeNum(userData.chessWins, 0);
  const chessLosses = safeNum(userData.chessLosses, 0);
  const pistiWins = safeNum(userData.pistiWins || userData.pisti_wins, 0);
  const pistiLosses = safeNum(userData.pistiLosses || userData.pisti_losses, 0);
  const crashRounds = safeNum(userData.crashRounds || userData.crash_rounds, 0);
  const crashWins = safeNum(userData.crashWins || userData.crash_wins, 0);
  const crashLosses = safeNum(userData.crashLosses || userData.crash_losses, 0);
  const totalWins = safeNum(userData.totalWins, chessWins + pistiWins + crashWins);
  const totalLosses = safeNum(userData.totalLosses, chessLosses + pistiLosses + crashLosses);
  const totalRounds = safeNum(userData.totalRounds, totalWins + totalLosses + crashRounds);
  return {
    uid,
    username: options.username || 'Oyuncu',
    avatar: sanitizeAvatarForStorage(userData.avatar) || DEFAULT_AVATAR,
    selectedFrame: pickUserSelectedFrame({ ...userData, accountLevel: progression.accountLevel }),
    accountLevel: progression.accountLevel,
    accountXp: progression.accountXp,
    monthlyActiveScore,
    progression: {
      ...progression,
      accountLevel: progression.accountLevel,
      accountXp: progression.accountXp,
      accountLevelScore: progression.accountLevelScore,
      monthlyActivity: monthlyActiveScore
    },
    stats: {
      totalRounds,
      totalWins,
      totalLosses,
      totalSpentMc: safeNum(userData.totalSpentMc, 0),
      chessWins,
      chessLosses,
      pistiWins,
      pistiLosses,
      crashRounds,
      crashWins,
      crashLosses
    },
    presence,
    online: !!presence?.online,
    lastSeen,
    activity: cleanStr(presence?.activity || '', 80),
    activityStatus: cleanStr(presence?.status || '', 24),
    activityGameType: cleanStr(presence?.gameType || '', 24)
  };
}

async function getFriendDocsForUid(uid, status = null) {
  const requesterQuery = status
    ? colFriends().where('requesterUid', '==', uid).where('status', '==', status)
    : colFriends().where('requesterUid', '==', uid);
  const recipientQuery = status
    ? colFriends().where('recipientUid', '==', uid).where('status', '==', status)
    : colFriends().where('recipientUid', '==', uid);

  const [requesterSnap, recipientSnap] = await Promise.all([requesterQuery.get(), recipientQuery.get()]);
  const docs = new Map();
  requesterSnap.forEach((doc) => docs.set(doc.id, doc));
  recipientSnap.forEach((doc) => docs.set(doc.id, doc));
  return Array.from(docs.values());
}

async function resolveFriendTarget(targetRaw, targetUidRaw) {
  const rawUid = cleanStr(targetUidRaw || '', 160);
  if (rawUid) {
    const snap = await colUsers().doc(rawUid).get();
    return snap.exists ? { uid: rawUid, data: snap.data() || {} } : null;
  }
  const target = cleanStr(targetRaw || '', 32);
  if (!target) return null;
  const mapping = await db.collection('usernames').doc(target.toLowerCase()).get();
  if (!mapping.exists) return null;
  const uid = cleanStr(mapping.data()?.uid || '', 160);
  if (!uid) return null;
  const userSnap = await colUsers().doc(uid).get();
  return userSnap.exists ? { uid, data: userSnap.data() || {} } : null;
}


router.get('/friends/list', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const docs = await getFriendDocsForUid(uid);
    const relatedUids = Array.from(new Set(docs.flatMap((doc) => {
      const data = doc.data() || {};
      return [data.requesterUid, data.recipientUid].filter(Boolean);
    }).filter((itemUid) => itemUid !== uid)));

    const refs = relatedUids.map((friendUid) => colUsers().doc(friendUid));
    const [snaps, presenceMap] = await Promise.all([
      refs.length ? db.getAll(...refs) : [],
      listPresenceForUids(relatedUids)
    ]);
    const userMap = new Map();
    snaps.forEach((snap) => { if (snap.exists) userMap.set(snap.id, snap.data() || {}); });

    const payload = { accepted: [], incoming: [], outgoing: [] };

    const usernameEntries = await Promise.all(
      relatedUids.map(async (friendUid) => [friendUid, await resolvePublicUsername(friendUid, userMap.get(friendUid) || {})])
    );
    const usernameMap = new Map(usernameEntries);

    docs.forEach((doc) => {
      const data = doc.data() || {};
      const friendUid = data.requesterUid === uid ? data.recipientUid : data.requesterUid;
      if (!friendUid) return;
      const friendData = userMap.get(friendUid) || {};

      const presence = presenceMap instanceof Map ? (presenceMap.get(friendUid) || null) : null;
      const entry = {
        friendshipId: doc.id,
        ...buildSocialMemberPayload(friendUid, friendData, {
          username: usernameMap.get(friendUid) || 'Oyuncu',
          presence
        }),
        status: cleanStr(data.status || 'pending', 16) || 'pending',
        requestedAt: safeNum(data.createdAt, 0),
        updatedAt: safeNum(data.updatedAt, 0),
        requesterUid: String(data.requesterUid || ''),
        recipientUid: String(data.recipientUid || '')
      };

      if (entry.status === 'accepted') payload.accepted.push(entry);
      else if (data.recipientUid === uid) payload.incoming.push(entry);
      else payload.outgoing.push(entry);
    });

    payload.accepted.sort((a, b) => a.username.localeCompare(b.username, 'tr'));
    payload.incoming.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    payload.outgoing.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    res.json({
  ok: true,
  schemaVersion: 2,
  generatedAt: nowMs(),
  lists: {
    accepted: payload.accepted,
    incoming: payload.incoming,
    outgoing: payload.outgoing
  },
  members: {
    accepted: payload.accepted,
    incoming: payload.incoming,
    outgoing: payload.outgoing
  },
  counts: {
    accepted: payload.accepted.length,
    incoming: payload.incoming.length,
    outgoing: payload.outgoing.length,
    online: payload.accepted.filter((item) => item.online).length
  },
  summary: {
    acceptedCount: payload.accepted.length,
    incomingCount: payload.incoming.length,
    outgoingCount: payload.outgoing.length,
    onlineCount: payload.accepted.filter((item) => item.online).length
  }
});
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/friends/request', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const target = await resolveFriendTarget(req.body?.target, req.body?.targetUid);
    if (!target?.uid) throw new Error('Kullanıcı bulunamadı. Lütfen tam kullanıcı adını yazın.');
    if (target.uid === uid) throw new Error('Kendinizi arkadaş olarak ekleyemezsiniz.');

    const friendshipId = friendshipDocId(uid, target.uid);
    const outcome = await db.runTransaction(async (tx) => {
      const fRef = colFriends().doc(friendshipId);
      const targetRef = colUsers().doc(target.uid);
      const [friendSnap, targetUserSnap] = await Promise.all([tx.get(fRef), tx.get(targetRef)]);
      if (!targetUserSnap.exists) throw new Error('Hedef kullanıcı bulunamadı.');

      if (friendSnap.exists) {
        const existing = friendSnap.data() || {};
        if (existing.status === 'accepted') throw new Error('Bu kullanıcı zaten arkadaş listenizde.');
        if (existing.requesterUid === uid && existing.status === 'pending') throw new Error('Zaten arkadaşlık isteği gönderdiniz.');
        if (existing.requesterUid === target.uid && existing.recipientUid === uid && existing.status === 'pending') {
          tx.update(fRef, { status: 'accepted', acceptedAt: nowMs(), updatedAt: nowMs() });
          return { acceptedNow: true };
        }
      }

      tx.set(fRef, { requesterUid: uid, recipientUid: target.uid, status: 'pending', createdAt: nowMs(), updatedAt: nowMs() }, { merge: true });
      return { acceptedNow: false };
    });

    const io = req.app.get('io');
    if (outcome.acceptedNow) {
      if (io) io.to(`user_${target.uid}`).emit('friends:request_auto_accepted', { uid, ts: nowMs() });
      return res.json({ ok: true, acceptedNow: true, message: 'Karşılıklı istek bulundu ve arkadaşlık otomatik onaylandı.' });
    }

    if (io) io.to(`user_${target.uid}`).emit('friends:request_received', { fromUid: uid, ts: nowMs() });
    res.json({ ok: true, acceptedNow: false, message: 'Arkadaşlık isteği gönderildi.' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/friends/respond', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const friendshipId = cleanStr(req.body?.friendshipId || '', 220);
    const action = cleanStr(req.body?.action || '', 16).toLowerCase();
    if (!friendshipId) throw new Error('Arkadaşlık kaydı bulunamadı.');
    if (!['accept', 'decline'].includes(action)) throw new Error('Geçersiz işlem.');

    const related = await db.runTransaction(async (tx) => {
      const fRef = colFriends().doc(friendshipId);
      const snap = await tx.get(fRef);
      if (!snap.exists) throw new Error('İstek artık mevcut değil.');
      const data = snap.data() || {};
      if (data.recipientUid !== uid || data.status !== 'pending') throw new Error('Bu isteği yönetme yetkiniz yok.');

      if (action === 'accept') tx.update(fRef, { status: 'accepted', acceptedAt: nowMs(), updatedAt: nowMs() });
      else tx.delete(fRef);
      
      return { requesterUid: data.requesterUid, recipientUid: data.recipientUid, accepted: action === 'accept' };
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${related.requesterUid}`).emit('friends:request_result', { uid: related.recipientUid, accepted: related.accepted, ts: nowMs() });
      io.to(`user_${related.requesterUid}`).emit('friends:updated', { ts: nowMs() });
      io.to(`user_${related.recipientUid}`).emit('friends:updated', { ts: nowMs() });
    }

    res.json({ ok: true, accepted: related.accepted });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/friends/remove', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const friendshipIdRaw = cleanStr(req.body?.friendshipId || '', 220);
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    const friendshipId = friendshipIdRaw || friendshipDocId(uid, targetUid);
    if (!friendshipId) throw new Error('Arkadaşlık kaydı bulunamadı.');

    const affected = await db.runTransaction(async (tx) => {
      const ref = colFriends().doc(friendshipId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Kayıt zaten kaldırılmış.');
      const data = snap.data() || {};
      if (data.requesterUid !== uid && data.recipientUid !== uid) throw new Error('Bu kaydı silme yetkiniz yok.');
      tx.delete(ref);
      return [data.requesterUid, data.recipientUid].filter(Boolean);
    });

    const io = req.app.get('io');
    if (io) affected.forEach(u => io.to(`user_${u}`).emit('friends:updated', { ts: nowMs() }));
    
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/support/receipt', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const note = cleanStr((req.body||{}).note || '');
    const subject = cleanStr((req.body||{}).subject || '');
    const amount = safeFloat((req.body||{}).amount || 0);
    const txId = cleanStr((req.body||{}).txId || '');
    const category = cleanStr((req.body||{}).category || 'Genel');
    const priority = cleanStr((req.body||{}).priority || 'Normal');
    const email = cleanStr((req.body||{}).email || req.user.email || '');
    const roundId = cleanStr((req.body||{}).roundId || '');

    if (!note && !subject && !txId && !amount && !roundId) throw new Error('Destek bilgisi boş.');
    if (subject && subject.length > 80) throw new Error('Konu başlığı çok uzun.');
    if (note && note.length > 2500) throw new Error('Destek detayı çok uzun.');

    const receiptRef = await colSupportReceipts().add({
      uid, email: email || req.user.email || null, subject, note, amount, txId,
      category, priority, roundId, createdAt: nowMs(), status: 'new'
    });

    await recordAuditLog({ actorUid: uid, actorEmail: req.user.email || '', action: 'support.receipt.create', targetType: 'support_receipt', targetId: receiptRef.id, metadata: { amount, category, priority } });

    res.json({ ok:true, id: receiptRef.id });
  } catch(e){ res.json({ ok:false, error:e.message }); }
});

router.post('/support/callback', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const note = cleanStr((req.body||{}).note || '');

    const callbackRef = await colSupportCallbacks().add({
      uid, email: req.user.email || null, note, createdAt: nowMs(), status: 'new'
    });

    await recordAuditLog({ actorUid: uid, actorEmail: req.user.email || '', action: 'support.callback.create', targetType: 'support_callback', targetId: callbackRef.id });

    res.json({ ok:true, id: callbackRef.id });
  } catch(e){ res.json({ ok:false, error:e.message }); }
});

module.exports = router;
