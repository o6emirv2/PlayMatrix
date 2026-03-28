'use strict';

const express = require('express');
const router = express.Router();

const { db } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { profileLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum, nowMs } = require('../utils/helpers');
const {
  colUsers,
  colChats,
  pickUserSelectedFrame,
  resolvePublicUsername,
  getPersistentDirectChatId,
  getPeerRelationshipFlags,
  setSocialEdgeFlags,
  assertDmAllowed,
  listConversationDocs
} = require('../utils/socialKit');
const { captureError } = require('../utils/errorMonitor');
const { CHAT_RETENTION_POLICY } = require('../config/constants');
const { getChatRetentionPolicyConfig } = require('../utils/adminConfig');
const { DIRECT_MESSAGE_EDIT_WINDOW_MS, buildChatLifecycleSnapshot } = require('../utils/chatLifecycle');


function encodeCursor(payload = {}) {
  try {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  } catch (_) {
    return '';
  }
}

function decodeCursor(value = '') {
  const raw = cleanStr(value || '', 320);
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
}


function normalizeMessage(doc, metaByUid = {}, meUid = '', peerUid = '') {
  const data = doc.data() || {};
  const sender = cleanStr(data.sender || '', 160);
  const isDeleted = !!data.deletedAt;
  const senderMeta = metaByUid?.[sender] || metaByUid?.default || {};
  return {
    id: doc.id,
    sender,
    toUid: sender === meUid ? peerUid : meUid,
    text: isDeleted ? '' : cleanStr(data.text || '', 280),
    status: cleanStr(data.status || 'sent', 24) || 'sent',
    createdAt: safeNum(data.createdAt, 0),
    editedAt: safeNum(data.editedAt, 0),
    deletedAt: safeNum(data.deletedAt, 0),
    deleted: isDeleted,
    username: senderMeta.username || 'Oyuncu',
    avatar: senderMeta.avatar || '',
    selectedFrame: pickUserSelectedFrame(senderMeta)
  };
}

async function buildPeerMeta(uid) {
  const snap = await colUsers().doc(uid).get().catch(() => null);
  const data = snap?.exists ? (snap.data() || {}) : {};
  return {
    uid,
    username: await resolvePublicUsername(uid, data),
    avatar: data.avatar || '',
    selectedFrame: pickUserSelectedFrame(data)
  };
}

async function buildMetaMap(uids = []) {
  const unique = Array.from(new Set((Array.isArray(uids) ? uids : []).map((item) => cleanStr(item || '', 160)).filter(Boolean)));
  const entries = await Promise.all(unique.map(async (uid) => [uid, await buildPeerMeta(uid)]));
  return Object.fromEntries(entries);
}

async function rebuildConversationSummary(chatId = '') {
  const safeChatId = cleanStr(chatId || '', 200);
  if (!safeChatId) return null;
  const chatRef = colChats().doc(safeChatId);
  const snap = await chatRef.collection('messages').orderBy('createdAt', 'desc').limit(40).get().catch(() => ({ docs: [] }));
  const latestVisible = (snap.docs || []).find((doc) => !safeNum(doc.data()?.deletedAt, 0));
  const payload = latestVisible
    ? {
        lastMessage: cleanStr(latestVisible.data()?.text || '', 280),
        lastUpdatedAt: safeNum(latestVisible.data()?.editedAt || latestVisible.data()?.createdAt, nowMs()),
        lastMessageSender: cleanStr(latestVisible.data()?.sender || '', 160)
      }
    : {
        lastMessage: '',
        lastUpdatedAt: nowMs(),
        lastMessageSender: ''
      };
  await chatRef.set(payload, { merge: true });
  return payload;
}

function filterHistoryPageDocs(docs = [], cursorData = null, limit = 60) {
  const cursorCreatedAt = safeNum(cursorData?.createdAt, 0);
  const cursorMessageId = cleanStr(cursorData?.messageId || '', 160);
  const filtered = (Array.isArray(docs) ? docs : []).filter((doc) => {
    if (!cursorCreatedAt) return true;
    const createdAt = safeNum(doc.data()?.createdAt, 0);
    if (createdAt < cursorCreatedAt) return true;
    if (createdAt > cursorCreatedAt) return false;
    if (!cursorMessageId) return false;
    return String(doc.id) < cursorMessageId;
  });
  return filtered.slice(0, Math.max(1, Math.floor(safeNum(limit, 60))));
}

async function decorateConversation(uid, doc) {
  const data = doc.data() || {};
  const participants = Array.isArray(data.participants) ? data.participants.map((item) => cleanStr(item || '', 160)).filter(Boolean) : [];
  const peerUid = participants.find((item) => item !== uid) || '';
  const [peerMeta, flags] = await Promise.all([
    buildPeerMeta(peerUid),
    getPeerRelationshipFlags(uid, peerUid)
  ]);
  return {
    chatId: doc.id,
    peerUid,
    peer: peerMeta,
    lastMessage: cleanStr(data.lastMessage || '', 280),
    lastUpdatedAt: safeNum(data.lastUpdatedAt?.toMillis?.() || data.lastUpdatedAt, 0),
    lastMessageSender: cleanStr(data.lastMessageSender || '', 160),
    flags: flags.mine,
    blockedByPeer: flags.theirs.blocked
  };
}

router.get('/chat/policy', verifyAuth, async (_req, res) => {
  try {
    const policy = await getChatRetentionPolicyConfig();
    return res.json({ ok: true, policy, lifecycle: buildChatLifecycleSnapshot(policy) });
  } catch (_) {
    return res.json({ ok: true, policy: CHAT_RETENTION_POLICY, lifecycle: buildChatLifecycleSnapshot(CHAT_RETENTION_POLICY) });
  }
});


router.get('/chat/direct/list', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const mode = cleanStr(req.query?.mode || 'active', 16).toLowerCase();
    const limit = Math.max(1, Math.min(80, safeNum(req.query?.limit, 30)));
    const cursor = cleanStr(req.query?.cursor || '', 220);
    const page = await listConversationDocs(uid, limit, { cursor, scanLimit: Math.max(limit * 5, 140) });
    const items = await Promise.all((page.items || []).map((doc) => decorateConversation(uid, doc)));
    let filtered = items;
    if (mode === 'archived') filtered = items.filter((item) => item.flags.archived);
    else if (mode === 'all') filtered = items;
    else filtered = items.filter((item) => !item.flags.archived);
    return res.json({ ok: true, items: filtered, nextCursor: page.nextCursor || '' });
  } catch (error) {
    await captureError(error, { route: 'chat.direct.list', uid: req.user?.uid || '' });
    return res.status(500).json({ ok: false, error: 'Konuşmalar yüklenemedi.' });
  }
});

router.get('/chat/direct/search', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const q = cleanStr(req.query?.q || '', 80).toLowerCase();
    const targetUid = cleanStr(req.query?.targetUid || '', 160);
    const limit = Math.max(1, Math.min(100, safeNum(req.query?.limit, 30)));
    const scanChats = Math.max(1, Math.min(60, safeNum(req.query?.scanChats, targetUid ? 1 : 30)));
    const scanMessagesPerChat = Math.max(20, Math.min(400, safeNum(req.query?.scanMessagesPerChat, targetUid ? 200 : 140)));
    const cursorData = decodeCursor(req.query?.cursor || '');
    const cursorCreatedAt = safeNum(cursorData?.createdAt, 0);
    const cursorMessageId = cleanStr(cursorData?.messageId || '', 160);
    if (!q || q.length < 2) return res.status(400).json({ ok: false, error: 'En az 2 karakter girin.' });

    let chatIds = [];
    if (targetUid) {
      chatIds = [getPersistentDirectChatId(uid, targetUid)];
    } else {
      const page = await listConversationDocs(uid, scanChats, { scanLimit: Math.max(scanChats * 5, 160) });
      chatIds = (page.items || []).map((doc) => doc.id);
    }

    const results = [];
    for (const chatId of chatIds.slice(0, scanChats)) {
      const participants = chatId.split('_').filter(Boolean);
      const peerUid = participants.find((item) => item !== uid) || targetUid;
      const peerMeta = await buildPeerMeta(peerUid);
      let query = colChats().doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(scanMessagesPerChat);
      const snap = await query.get().catch(() => ({ docs: [] }));
      snap.docs.forEach((doc) => {
        const data = doc.data() || {};
        const text = cleanStr(data.text || '', 280);
        const createdAt = safeNum(data.createdAt, 0);
        if (!text || !!data.deletedAt) return;
        if (!text.toLowerCase().includes(q)) return;
        if (cursorCreatedAt > 0) {
          if (createdAt > cursorCreatedAt) return;
          if (createdAt === cursorCreatedAt && cursorMessageId && String(doc.id) >= cursorMessageId) return;
        }
        results.push({
          chatId,
          peerUid,
          peer: peerMeta,
          messageId: doc.id,
          text,
          createdAt,
          sender: cleanStr(data.sender || '', 160)
        });
      });
    }

    results.sort((a, b) => b.createdAt - a.createdAt || String(b.messageId).localeCompare(String(a.messageId)));
    const pageItems = results.slice(0, limit);
    const last = pageItems[pageItems.length - 1];
    const nextCursor = results.length > limit && last ? encodeCursor({ createdAt: last.createdAt, messageId: last.messageId }) : '';
    return res.json({ ok: true, items: pageItems, nextCursor });
  } catch (error) {
    await captureError(error, { route: 'chat.direct.search', uid: req.user?.uid || '' });
    return res.status(500).json({ ok: false, error: 'Mesaj araması başarısız.' });
  }
});

router.post('/chat/direct/edit', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    const messageId = cleanStr(req.body?.messageId || '', 160);
    const text = cleanStr(req.body?.text || '', 280);
    if (!targetUid || !messageId || !text) throw new Error('Eksik bilgi.');
    await assertDmAllowed(uid, targetUid);

    const chatId = getPersistentDirectChatId(uid, targetUid);
    const ref = colChats().doc(chatId).collection('messages').doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Mesaj bulunamadı.');
    const data = snap.data() || {};
    if (cleanStr(data.sender || '', 160) !== uid) throw new Error('Sadece kendi mesajınızı düzenleyebilirsiniz.');
    if (safeNum(data.deletedAt, 0) > 0) throw new Error('Silinmiş mesaj düzenlenemez.');
    if (nowMs() - safeNum(data.createdAt, 0) > DIRECT_MESSAGE_EDIT_WINDOW_MS) throw new Error('Mesaj düzenleme süresi doldu.');

    const editedAt = nowMs();
    await ref.set({ text, editedAt, status: 'edited' }, { merge: true });
    await rebuildConversationSummary(chatId);

    req.app.get('io')?.to(`user_${targetUid}`).emit('chat:dm_edited', { chatId, messageId, text, editedAt, byUid: uid });
    req.app.get('io')?.to(`user_${uid}`).emit('chat:dm_edited', { chatId, messageId, text, editedAt, byUid: uid });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Mesaj güncellenemedi.' });
  }
});

router.post('/chat/direct/delete', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    const messageId = cleanStr(req.body?.messageId || '', 160);
    if (!targetUid || !messageId) throw new Error('Eksik bilgi.');
    await assertDmAllowed(uid, targetUid);

    const chatId = getPersistentDirectChatId(uid, targetUid);
    const ref = colChats().doc(chatId).collection('messages').doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Mesaj bulunamadı.');
    const data = snap.data() || {};
    if (cleanStr(data.sender || '', 160) !== uid) throw new Error('Sadece kendi mesajınızı silebilirsiniz.');

    const deletedAt = nowMs();
    await ref.set({ text: '', deletedAt, status: 'deleted' }, { merge: true });
    await rebuildConversationSummary(chatId);
    req.app.get('io')?.to(`user_${targetUid}`).emit('chat:dm_deleted', { chatId, messageId, byUid: uid, deletedAt });
    req.app.get('io')?.to(`user_${uid}`).emit('chat:dm_deleted', { chatId, messageId, byUid: uid, deletedAt });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Mesaj silinemedi.' });
  }
});

async function updateEdge(uid, targetUid, patch = {}) {
  const current = await getPeerRelationshipFlags(uid, targetUid);
  await setSocialEdgeFlags(uid, targetUid, { ...current.mine, ...patch });
}

router.post('/chat/direct/archive', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');
    await updateEdge(uid, targetUid, { archived: true });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Arşivleme başarısız.' });
  }
});

router.post('/chat/direct/unarchive', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');
    await updateEdge(uid, targetUid, { archived: false });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Arşiv kaldırılamadı.' });
  }
});

router.post('/chat/block', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');
    await updateEdge(uid, targetUid, { blocked: true });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Engelleme başarısız.' });
  }
});

router.post('/chat/unblock', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');
    await updateEdge(uid, targetUid, { blocked: false });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Engel kaldırılamadı.' });
  }
});

router.post('/chat/mute', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');
    await updateEdge(uid, targetUid, { muted: true });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Sessize alma başarısız.' });
  }
});

router.post('/chat/unmute', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.body?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz hedef.');
    await updateEdge(uid, targetUid, { muted: false });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Sessiz kaldırma başarısız.' });
  }
});

router.get('/chat/settings', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.query?.targetUid || '', 160);
    if (!targetUid || targetUid === uid) return res.status(400).json({ ok: false, error: 'Geçersiz hedef.' });
    const flags = await getPeerRelationshipFlags(uid, targetUid);
    return res.json({ ok: true, mine: flags.mine, theirs: flags.theirs });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Ayarlar yüklenemedi.' });
  }
});

router.get('/chat/direct/history', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const targetUid = cleanStr(req.query?.targetUid || '', 160);
    const limit = Math.max(1, Math.min(200, safeNum(req.query?.limit, 60)));
    const cursorData = decodeCursor(req.query?.cursor || '');
    if (!targetUid || targetUid === uid) throw new Error('Geçersiz konuşma.');
    await assertDmAllowed(uid, targetUid);
    const chatId = getPersistentDirectChatId(uid, targetUid);

    const query = colChats().doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(limit + 25);

    const [metaMap, snap] = await Promise.all([
      buildMetaMap([uid, targetUid]),
      query.get().catch(() => ({ docs: [] }))
    ]);
    const filteredDocs = filterHistoryPageDocs(snap.docs || [], cursorData, limit + 1);
    const hasMore = filteredDocs.length > limit;
    const pageDocs = hasMore ? filteredDocs.slice(0, limit) : filteredDocs;
    const items = pageDocs.map((doc) => normalizeMessage(doc, metaMap, uid, targetUid)).reverse();
    const last = pageDocs[pageDocs.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: safeNum(last.data()?.createdAt, 0), messageId: last.id }) : '';
    const policy = await getChatRetentionPolicyConfig().catch(() => CHAT_RETENTION_POLICY);
    return res.json({ ok: true, chatId, items, nextCursor, policy, lifecycle: buildChatLifecycleSnapshot(policy) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Geçmiş yüklenemedi.' });
  }
});

module.exports = router;
