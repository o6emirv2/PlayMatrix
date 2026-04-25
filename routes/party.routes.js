'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { db } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum, nowMs } = require('../utils/helpers');
const {
  colUsers,
  pickUserSelectedFrame,
  resolvePublicUsername,
  ensureAcceptedFriendship
} = require('../utils/socialKit');
const { captureError } = require('../utils/errorMonitor');

const PARTY_MEMBER_LIMIT = 4;
const PARTY_INVITE_TTL_MS = 5 * 60 * 1000;
const colParties = () => db.collection('parties');
const colPartyInvites = () => db.collection('party_invites');

function normalizeMember(member = {}) {
  return {
    uid: cleanStr(member.uid || '', 160),
    username: cleanStr(member.username || 'Oyuncu', 32) || 'Oyuncu',
    avatar: typeof member.avatar === 'string' ? member.avatar : '',
    selectedFrame: pickUserSelectedFrame(member),
    ready: !!member.ready,
    role: cleanStr(member.role || 'member', 16) || 'member',
    joinedAt: safeNum(member.joinedAt, nowMs())
  };
}

async function buildMember(uid, role = 'member') {
  const snap = await colUsers().doc(uid).get();
  if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
  const data = snap.data() || {};
  return normalizeMember({
    uid,
    username: await resolvePublicUsername(uid, data),
    avatar: data.avatar || '',
    selectedFrame: pickUserSelectedFrame(data),
    role,
    joinedAt: nowMs(),
    ready: false
  });
}

async function getPartyByUid(uid) {
  const safeUid = cleanStr(uid || '', 160);
  const snap = await colParties().where('memberUids', 'array-contains', safeUid).limit(10).get().catch(() => ({ empty: true, docs: [] }));
  const doc = (snap.docs || []).find((entry) => cleanStr(entry.data()?.status || 'active', 16) === 'active');
  if (!doc) return null;
  return { id: doc.id, data: doc.data() || {}, ref: doc.ref };
}

async function ensurePartyForLeader(uid) {
  const existing = await getPartyByUid(uid);
  if (existing) return existing;
  const leader = await buildMember(uid, 'leader');
  const ref = colParties().doc(crypto.randomUUID());
  const payload = {
    leaderUid: uid,
    memberUids: [uid],
    members: [leader],
    status: 'active',
    createdAt: nowMs(),
    updatedAt: nowMs(),
    readyCount: 0,
    gameContext: null
  };
  await ref.set(payload, { merge: true });
  return { id: ref.id, ref, data: payload };
}

async function getPendingInvites(uid, mode = 'incoming') {
  const safeUid = cleanStr(uid || '', 160);
  const snap = await colPartyInvites()
    .where(mode === 'incoming' ? 'targetUid' : 'fromUid', '==', safeUid)
    .limit(30)
    .get()
    .catch(() => ({ docs: [] }));
  const now = nowMs();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((item) => cleanStr(item.status || 'pending', 16) === 'pending' && safeNum(item.expiresAt, 0) > now);
}

async function expireCompetingPartyInvites(targetUid = '', exceptInviteId = '') {
  const safeTargetUid = cleanStr(targetUid || '', 160);
  const safeExceptInviteId = cleanStr(exceptInviteId || '', 160);
  if (!safeTargetUid) return 0;
  const snap = await colPartyInvites().where('targetUid', '==', safeTargetUid).limit(50).get().catch(() => ({ docs: [] }));
  if (!snap.docs?.length) return 0;
  const batch = db.batch();
  const ts = nowMs();
  let changed = 0;
  for (const doc of snap.docs || []) {
    if (doc.id === safeExceptInviteId) continue;
    const data = doc.data() || {};
    if (cleanStr(data.status || 'pending', 16) !== 'pending') continue;
    if (safeNum(data.expiresAt, 0) <= ts) continue;
    batch.set(doc.ref, { status: 'expired', respondedAt: ts, closeReason: 'superseded' }, { merge: true });
    changed += 1;
  }
  if (changed > 0) await batch.commit().catch(() => null);
  return changed;
}

async function decoratePartyPayload(party) {
  if (!party) return null;
  return {
    id: party.id,
    leaderUid: cleanStr(party.data.leaderUid || '', 160),
    memberUids: Array.isArray(party.data.memberUids) ? party.data.memberUids : [],
    members: Array.isArray(party.data.members) ? party.data.members.map((member) => normalizeMember(member)) : [],
    readyCount: safeNum(party.data.readyCount, 0),
    status: cleanStr(party.data.status || 'active', 16) || 'active',
    createdAt: safeNum(party.data.createdAt, 0),
    updatedAt: safeNum(party.data.updatedAt, 0),
    gameContext: party.data.gameContext && typeof party.data.gameContext === 'object' ? party.data.gameContext : null
  };
}

async function emitPartySnapshot(req, uid) {
  const io = req.app.get('io');
  if (!io || !uid) return;
  const party = await getPartyByUid(uid);
  const payload = await decoratePartyPayload(party);
  if (!payload) {
    io.to(`user_${uid}`).emit('party:update', { party: null, ts: nowMs() });
    return;
  }
  payload.memberUids.forEach((memberUid) => io.to(`user_${memberUid}`).emit('party:update', { party: payload, ts: nowMs() }));
}

router.get('/party/me', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [party, incomingInvites, outgoingInvites] = await Promise.all([
      getPartyByUid(uid),
      getPendingInvites(uid, 'incoming'),
      getPendingInvites(uid, 'outgoing')
    ]);
    return res.json({ ok: true, party: await decoratePartyPayload(party), incomingInvites, outgoingInvites });
  } catch (error) {
    await captureError(error, { route: 'party.me', uid: req.user?.uid || '' });
    return res.status(500).json({ ok: false, error: 'Parti bilgisi alınamadı.' });
  }
});

router.post('/party/create', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const party = await ensurePartyForLeader(uid);
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true, party: await decoratePartyPayload(party) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Parti oluşturulamadı.' });
  }
});

router.post('/party/invite', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef oyuncu.');
    const areFriends = await ensureAcceptedFriendship(uid, targetUid);
    if (!areFriends) throw new Error('Sadece arkadaşlarını partiye davet edebilirsin.');

    const [mine, theirs, existingOutgoing] = await Promise.all([
      getPartyByUid(uid),
      getPartyByUid(targetUid),
      getPendingInvites(uid, 'outgoing')
    ]);
    if (theirs) throw new Error('Hedef oyuncu zaten bir partide.');
    const party = mine || await ensurePartyForLeader(uid);
    if ((party.data.memberUids || []).length >= PARTY_MEMBER_LIMIT) throw new Error('Parti dolu.');
    if (cleanStr(party.data.leaderUid || '', 160) !== uid) throw new Error('Sadece lider davet gönderebilir.');
    if (existingOutgoing.some((item) => cleanStr(item.targetUid || '', 160) === targetUid && cleanStr(item.partyId || '', 160) === party.id)) {
      throw new Error('Bu oyuncuya zaten bekleyen davetiniz var.');
    }

    const [fromMember, targetMember] = await Promise.all([buildMember(uid, 'leader'), buildMember(targetUid, 'member')]);
    const inviteId = crypto.randomUUID();
    const payload = {
      partyId: party.id,
      fromUid: uid,
      targetUid,
      fromMember,
      targetMember,
      status: 'pending',
      createdAt: nowMs(),
      expiresAt: nowMs() + PARTY_INVITE_TTL_MS
    };
    await colPartyInvites().doc(inviteId).set(payload, { merge: true });
    req.app.get('io')?.to(`user_${targetUid}`).emit('party:invite_receive', { inviteId, ...payload });
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true, inviteId, partyId: party.id });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Parti daveti gönderilemedi.' });
  }
});

router.post('/party/respond', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const inviteId = cleanStr(req.body?.inviteId || '', 160);
    const action = cleanStr(req.body?.action || '', 16).toLowerCase();
    if (!inviteId || !['accept', 'decline'].includes(action)) throw new Error('Geçersiz işlem.');
    const result = await db.runTransaction(async (tx) => {
      const inviteRef = colPartyInvites().doc(inviteId);
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) throw new Error('Davet bulunamadı.');
      const invite = inviteSnap.data() || {};
      if (cleanStr(invite.targetUid || '', 160) !== uid) throw new Error('Bu daveti yanıtlayamazsın.');
      if (cleanStr(invite.status || '', 16) !== 'pending') throw new Error('Davet zaten sonuçlandı.');
      if (safeNum(invite.expiresAt, 0) <= nowMs()) throw new Error('Davetin süresi doldu.');

      const activePartySnap = await tx.get(colParties().where('memberUids', 'array-contains', uid).limit(10));
      const activePartyDoc = (activePartySnap.docs || []).find((entry) => cleanStr(entry.data()?.status || 'active', 16) === 'active');
      if (activePartyDoc && activePartyDoc.id !== cleanStr(invite.partyId || '', 160)) throw new Error('Önce mevcut partiden ayrılmalısın.');

      const partyRef = colParties().doc(cleanStr(invite.partyId || '', 160));
      const partySnap = await tx.get(partyRef);
      if (!partySnap.exists) throw new Error('Parti artık mevcut değil.');
      const party = partySnap.data() || {};
      if (cleanStr(party.status || 'active', 16) !== 'active') throw new Error('Parti aktif değil.');
      if (cleanStr(party.leaderUid || '', 160) !== cleanStr(invite.fromUid || '', 160)) throw new Error('Parti lideri değiştiği için bu davet geçersiz.');

      if (action === 'decline') {
        tx.set(inviteRef, { status: 'declined', respondedAt: nowMs() }, { merge: true });
        return { invite, accepted: false };
      }

      const memberUids = Array.isArray(party.memberUids) ? party.memberUids.map((item) => cleanStr(item || '', 160)).filter(Boolean) : [];
      if (memberUids.includes(uid)) {
        tx.set(inviteRef, { status: 'accepted', respondedAt: nowMs() }, { merge: true });
        return { invite, accepted: true };
      }
      if (memberUids.length >= PARTY_MEMBER_LIMIT) throw new Error('Parti dolu.');
      const member = await buildMember(uid, 'member');
      const nextMembers = [...(Array.isArray(party.members) ? party.members : []).map((item) => normalizeMember(item)), member];
      const nextMemberUids = [...memberUids, uid];
      tx.set(partyRef, {
        members: nextMembers,
        memberUids: nextMemberUids,
        readyCount: nextMembers.filter((item) => item.ready).length,
        updatedAt: nowMs()
      }, { merge: true });
      tx.set(inviteRef, { status: 'accepted', respondedAt: nowMs() }, { merge: true });
      return { invite, accepted: true };
    });

    if (result.accepted) expireCompetingPartyInvites(uid, inviteId).catch(() => null);

    req.app.get('io')?.to(`user_${result.invite.fromUid}`).emit('party:invite_result', { inviteId, action, targetUid: uid, accepted: result.accepted, ts: nowMs() });
    req.app.get('io')?.to(`user_${uid}`).emit('party:invite_result', { inviteId, action, targetUid: uid, accepted: result.accepted, ts: nowMs() });
    await emitPartySnapshot(req, result.invite.fromUid);
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true, accepted: result.accepted, partyId: cleanStr(result.invite.partyId || '', 160) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Parti daveti işlenemedi.' });
  }
});

router.post('/party/leave', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const party = await getPartyByUid(uid);
    if (!party) throw new Error('Aktif partiniz yok.');

    const members = (party.data.members || []).map((item) => normalizeMember(item)).filter((member) => member.uid !== uid);
    if (!members.length) {
      await party.ref.set({ status: 'closed', memberUids: [], members: [], updatedAt: nowMs(), closedAt: nowMs() }, { merge: true });
      await emitPartySnapshot(req, uid);
      return res.json({ ok: true, closed: true });
    }

    let leaderUid = cleanStr(party.data.leaderUid || '', 160);
    if (leaderUid === uid) {
      leaderUid = members[0].uid;
      members[0].role = 'leader';
    }

    await party.ref.set({
      leaderUid,
      members,
      memberUids: members.map((member) => member.uid),
      readyCount: members.filter((member) => member.ready).length,
      updatedAt: nowMs()
    }, { merge: true });
    await emitPartySnapshot(req, leaderUid);
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true, closed: false });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Partiden ayrılamadınız.' });
  }
});

router.post('/party/kick', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    const party = await getPartyByUid(uid);
    if (!party) throw new Error('Aktif partiniz yok.');
    if (cleanStr(party.data.leaderUid || '', 160) !== uid) throw new Error('Sadece lider oyuncu çıkarabilir.');
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');

    const members = (party.data.members || []).map((item) => normalizeMember(item)).filter((member) => member.uid !== targetUid);
    if (members.length === (party.data.members || []).length) throw new Error('Oyuncu partide değil.');
    await party.ref.set({
      members,
      memberUids: members.map((member) => member.uid),
      readyCount: members.filter((member) => member.ready).length,
      updatedAt: nowMs()
    }, { merge: true });
    req.app.get('io')?.to(`user_${targetUid}`).emit('party:kicked', { partyId: party.id, byUid: uid, ts: nowMs() });
    await emitPartySnapshot(req, uid);
    await emitPartySnapshot(req, targetUid);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Oyuncu çıkarılamadı.' });
  }
});

router.post('/party/promote', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    const party = await getPartyByUid(uid);
    if (!party) throw new Error('Aktif partiniz yok.');
    if (cleanStr(party.data.leaderUid || '', 160) !== uid) throw new Error('Sadece lider yetki devredebilir.');

    const members = (party.data.members || []).map((item) => normalizeMember(item));
    if (!members.some((member) => member.uid === targetUid)) throw new Error('Oyuncu partide değil.');
    members.forEach((member) => { member.role = member.uid === targetUid ? 'leader' : 'member'; });
    await party.ref.set({ leaderUid: targetUid, members, updatedAt: nowMs() }, { merge: true });
    await emitPartySnapshot(req, targetUid);
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Lider aktarımı başarısız.' });
  }
});

router.post('/party/ready', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const ready = req.body?.ready !== false;
    const party = await getPartyByUid(uid);
    if (!party) throw new Error('Aktif partiniz yok.');
    const members = (party.data.members || []).map((item) => normalizeMember(item)).map((member) => member.uid === uid ? { ...member, ready } : member);
    await party.ref.set({ members, readyCount: members.filter((member) => member.ready).length, updatedAt: nowMs() }, { merge: true });
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true, ready });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Hazır durumu güncellenemedi.' });
  }
});

router.post('/party/context', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const party = await getPartyByUid(uid);
    if (!party) throw new Error('Aktif partiniz yok.');
    if (cleanStr(party.data.leaderUid || '', 160) !== uid) throw new Error('Sadece lider parti hedefini güncelleyebilir.');
    const gameType = cleanStr(req.body?.gameType || '', 24);
    const roomId = cleanStr(req.body?.roomId || '', 160);
    await party.ref.set({ gameContext: gameType ? { gameType, roomId, updatedAt: nowMs() } : null, updatedAt: nowMs() }, { merge: true });
    await emitPartySnapshot(req, uid);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Parti hedefi güncellenemedi.' });
  }
});

module.exports = router;
