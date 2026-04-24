'use strict';

const express = require('express');
const crypto = require('crypto');

const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { supportLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum, nowMs } = require('../utils/helpers');
const { recordAuditLog } = require('../utils/logger');

const router = express.Router();
const colTickets = () => db.collection('support_tickets');

function normalizePriority(value = '') {
  const normalized = cleanStr(value || 'normal', 16).toLowerCase();
  return ['low', 'normal', 'high', 'critical'].includes(normalized) ? normalized : 'normal';
}

function normalizeCategory(value = '') {
  const normalized = cleanStr(value || 'general', 32).toLowerCase();
  return ['general', 'payment', 'game', 'account', 'bug', 'reward', 'moderation'].includes(normalized) ? normalized : 'general';
}

function formatTicket(doc, requesterUid = '') {
  const data = doc.data() || {};
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return {
    id: doc.id,
    uid: cleanStr(data.uid || '', 160),
    subject: cleanStr(data.subject || 'Destek Talebi', 120) || 'Destek Talebi',
    category: normalizeCategory(data.category),
    priority: normalizePriority(data.priority),
    status: cleanStr(data.status || 'open', 24) || 'open',
    createdAt: safeNum(data.createdAt, 0),
    updatedAt: safeNum(data.updatedAt, 0),
    lastReplyAt: safeNum(data.lastReplyAt, 0),
    unreadForUser: !!data.unreadForUser,
    unreadForAdmin: !!data.unreadForAdmin,
    messages: messages
      .slice(-50)
      .map((message) => ({
        id: cleanStr(message.id || '', 120) || crypto.randomUUID(),
        sender: cleanStr(message.sender || 'user', 16) || 'user',
        senderUid: cleanStr(message.senderUid || '', 160),
        text: cleanStr(message.text || '', 3000),
        createdAt: safeNum(message.createdAt, 0)
      })),
    canReply: requesterUid ? cleanStr(data.uid || '', 160) === requesterUid : false
  };
}

router.get('/support/meta', verifyAuth, (_req, res) => {
  res.json({
    ok: true,
    categories: ['general', 'payment', 'game', 'account', 'bug', 'reward', 'moderation'],
    priorities: ['low', 'normal', 'high', 'critical'],
    statuses: ['open', 'waiting_user', 'waiting_admin', 'resolved', 'closed']
  });
});

router.post('/support/tickets', verifyAuth, supportLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const subject = cleanStr(req.body?.subject || '', 120);
    const text = cleanStr(req.body?.message || req.body?.text || '', 3000);
    const category = normalizeCategory(req.body?.category);
    const priority = normalizePriority(req.body?.priority);

    if (!subject || subject.length < 4) throw new Error('Konu en az 4 karakter olmalı.');
    if (!text || text.length < 8) throw new Error('Mesaj en az 8 karakter olmalı.');

    const now = nowMs();
    const ticketRef = colTickets().doc();
    const message = { id: crypto.randomUUID(), sender: 'user', senderUid: uid, text, createdAt: now };

    await ticketRef.set({
      uid,
      email: cleanStr(req.user.email || '', 200),
      subject,
      category,
      priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      lastReplyAt: now,
      unreadForUser: false,
      unreadForAdmin: true,
      messages: [message]
    });

    await recordAuditLog({
      actorUid: uid,
      actorEmail: req.user.email || '',
      action: 'support.ticket.create',
      targetType: 'support_ticket',
      targetId: ticketRef.id,
      metadata: { category, priority }
    });

    res.json({ ok: true, ticket: { id: ticketRef.id, subject, category, priority, status: 'open', createdAt: now, updatedAt: now, messages: [message] } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Destek talebi oluşturulamadı.' });
  }
});

router.get('/support/tickets', verifyAuth, async (req, res) => {
  try {
    const snap = await colTickets().where('uid', '==', req.user.uid).orderBy('updatedAt', 'desc').limit(50).get();
    const tickets = snap.docs.map((doc) => formatTicket(doc, req.user.uid));
    res.json({ ok: true, tickets });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Destek kayıtları yüklenemedi.' });
  }
});

router.get('/support/tickets/:id', verifyAuth, async (req, res) => {
  try {
    const ticketId = cleanStr(req.params.id || '', 160);
    if (!ticketId) throw new Error('Geçersiz kayıt.');
    const snap = await colTickets().doc(ticketId).get();
    if (!snap.exists) throw new Error('Destek kaydı bulunamadı.');
    const ticket = formatTicket(snap, req.user.uid);
    if (!ticket.canReply) return res.status(403).json({ ok: false, error: 'Bu kaydı görüntüleme yetkiniz yok.' });

    await colTickets().doc(ticketId).set({ unreadForUser: false, updatedAt: nowMs() }, { merge: true });
    res.json({ ok: true, ticket: { ...ticket, unreadForUser: false } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Destek kaydı yüklenemedi.' });
  }
});

router.post('/support/tickets/:id/reply', verifyAuth, supportLimiter, async (req, res) => {
  try {
    const ticketId = cleanStr(req.params.id || '', 160);
    const text = cleanStr(req.body?.message || req.body?.text || '', 3000);
    if (!ticketId || !text) throw new Error('Yanıt bilgisi eksik.');

    const ticketRef = colTickets().doc(ticketId);
    const now = nowMs();
    const message = { id: crypto.randomUUID(), sender: 'user', senderUid: req.user.uid, text, createdAt: now };

    const ticket = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) throw new Error('Destek kaydı bulunamadı.');
      const data = snap.data() || {};
      if (cleanStr(data.uid || '', 160) !== req.user.uid) throw new Error('Yetkisiz erişim.');
      const messages = Array.isArray(data.messages) ? data.messages.slice(-99) : [];
      messages.push(message);
      const status = ['resolved', 'closed'].includes(cleanStr(data.status || '', 24)) ? 'waiting_admin' : (cleanStr(data.status || 'open', 24) || 'open');
      tx.set(ticketRef, { messages, status, unreadForAdmin: true, unreadForUser: false, updatedAt: now, lastReplyAt: now }, { merge: true });
      return { id: ticketId, ...data, messages, status, updatedAt: now, lastReplyAt: now, unreadForAdmin: true, unreadForUser: false };
    });

    await recordAuditLog({
      actorUid: req.user.uid,
      actorEmail: req.user.email || '',
      action: 'support.ticket.reply_user',
      targetType: 'support_ticket',
      targetId: ticketId
    });

    res.json({ ok: true, ticket });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Yanıt eklenemedi.' });
  }
});

module.exports = router;