'use strict';

const express = require('express');

const { db, admin, auth } = require('../config/firebase');
const { verifyAdmin, requireAdminPermission } = require('../middlewares/admin.middleware');
const { adminLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum, safeSignedNum, nowMs } = require('../utils/helpers');
const { recordAuditLog, APP_LOG_PATH } = require('../utils/logger');
const { recordRewardLedger } = require('../utils/rewardLedger');
const { createNotification } = require('../utils/notifications');
const { DEFAULT_FEATURE_FLAGS } = require('../config/featureFlags');
const { sanitizeFeatureFlags, buildFeatureFlagRows } = require('../utils/featureFlags');
const { buildOpsHealthSnapshot } = require('../utils/opsHealth');
const { buildPlatformControlSnapshot } = require('../utils/platformControl');

const router = express.Router();
const colUsers = () => db.collection('users');
const colTickets = () => db.collection('support_tickets');
const colAudit = () => db.collection('audit_logs');
const colConfig = () => db.collection('ops_config');
const colOpsErrors = () => db.collection('ops_errors');
const USER_PAGE_LIMIT_MAX = 100;
const DEFAULT_PAGE_LIMIT = 25;
const BULK_BATCH_SIZE = 250;
const REMOTE_DEFAULTS = {
  balance: 0,
  rp: 0,
  seasonRp: 0,
  level: 1,
  xp: 0,
  chessElo: 1000,
  pistiElo: 1000,
  rank: 0,
  monthlyActiveScore: 0,
  activityScore: 0
};
const BULK_RESET_FIELD_LABELS = {
  balance: 'Bakiye',
  rp: 'RP',
  seasonRp: 'Sezon RP',
  level: 'Seviye',
  xp: 'XP',
  chessElo: 'Satranç Elo',
  pistiElo: 'Pişti Elo',
  rank: 'Rank',
  monthlyActiveScore: 'Aylık aktiflik',
  activityScore: 'Aktiflik puanı'
};
const EDITABLE_COMMON_FIELDS = new Set([
  'username', 'fullName', 'email', 'avatar', 'balance', 'rp', 'seasonRp', 'level', 'xp', 'rank',
  'chessElo', 'pistiElo', 'monthlyActiveScore', 'activityScore', 'activeFrame', 'activeFrameClass',
  'isMuted', 'isBanned', 'isFlagged', 'moderationReason', 'badge', 'vip', 'vipTier'
]);
const BLOCKED_PATCH_KEYS = new Set([
  '__proto__', 'prototype', 'constructor', 'customClaims', 'passwordHash', 'passwordSalt',
  'tokensValidAfterTime', 'metadata', 'providerData'
]);

router.use('/admin', verifyAdmin, adminLimiter);

async function recordAdminAudit(req, payload = {}) {
  const metadata = {
    ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
    requestId: cleanStr(req.requestId || '', 120),
    ip: cleanStr(req.ip || req.headers['x-forwarded-for'] || '', 120),
    route: cleanStr(req.originalUrl || req.url || '', 240),
    method: cleanStr(req.method || '', 16),
    userAgent: cleanStr(req.headers['user-agent'] || '', 240)
  };

  return recordAuditLog({
    ...payload,
    actorUid: cleanStr(req.user?.uid || payload.actorUid || '', 160),
    actorEmail: cleanStr(req.user?.email || payload.actorEmail || '', 200),
    metadata
  });
}

async function getFeatureFlagsDocument() {
  try {
    const snap = await colConfig().doc('feature_flags').get();
    const data = snap.exists ? (snap.data() || {}) : {};
    return sanitizeFeatureFlags(data.flags || data, DEFAULT_FEATURE_FLAGS);
  } catch (_) {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}

async function setFeatureFlagsDocument(nextFlags = {}, actorUid = '') {
  const flags = sanitizeFeatureFlags(nextFlags, DEFAULT_FEATURE_FLAGS);
  await colConfig().doc('feature_flags').set({
    flags,
    updatedAt: nowMs(),
    updatedBy: cleanStr(actorUid || '', 160),
    version: admin.firestore.FieldValue.increment(1)
  }, { merge: true });
  return flags;
}

async function listOpsErrors(limit = 30) {
  try {
    const snap = await colOpsErrors().orderBy('createdAt', 'desc').limit(Math.max(1, Math.min(100, limit))).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(serializeValue(doc.data() || {})) }));
  } catch (_) {
    return [];
  }
}

function normalizeModAction(value = '') {
  const normalized = cleanStr(value, 24).toLowerCase();
  return ['mute', 'unmute', 'ban', 'unban', 'flag'].includes(normalized) ? normalized : '';
}

async function getCount(queryBuilder) {
  try {
    const snap = await queryBuilder.count().get();
    return safeNum(snap.data()?.count, 0);
  } catch (_) {
    return 0;
  }
}

function normalizeTimestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return safeNum(value.toMillis(), 0);
  if (typeof value._seconds === 'number') return safeNum((value._seconds * 1000) + Math.round((value._nanoseconds || 0) / 1e6), 0);
  if (value instanceof Date) return safeNum(value.getTime(), 0);
  return safeNum(value, 0);
}

function serializeValue(value, depth = 0) {
  if (depth > 8) return null;
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => serializeValue(item, depth + 1));
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date || typeof value.toMillis === 'function' || typeof value._seconds === 'number') {
    return normalizeTimestampValue(value);
  }
  if (value && typeof value.path === 'string') return { path: value.path };
  if (value && typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(value)) return value.toString('base64');
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = serializeValue(child, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeUserDoc(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    username: cleanStr(data.username || data.fullName || 'Oyuncu', 60) || 'Oyuncu',
    fullName: cleanStr(data.fullName || '', 120),
    email: cleanStr(data.email || '', 200),
    avatar: cleanStr(data.avatar || '', 400),
    level: safeNum(data.level, 1),
    xp: safeNum(data.xp, 0),
    rp: safeNum(data.rp, 0),
    seasonRp: safeNum(data.seasonRp, 0),
    balance: safeNum(data.balance, 0),
    rank: safeNum(data.rank, 0),
    monthlyActiveScore: safeNum(data.monthlyActiveScore, 0),
    activityScore: safeNum(data.activityScore, 0),
    chessElo: safeNum(data.chessElo, 1000),
    pistiElo: safeNum(data.pistiElo, 1000),
    activeFrame: safeNum(data.activeFrame, 0),
    activeFrameClass: cleanStr(data.activeFrameClass || '', 80),
    isMuted: !!data.isMuted,
    isBanned: !!data.isBanned,
    isFlagged: !!data.isFlagged,
    moderationReason: cleanStr(data.moderationReason || '', 280),
    moderationUpdatedAt: normalizeTimestampValue(data.moderationUpdatedAt),
    updatedAt: normalizeTimestampValue(data.updatedAt),
    createdAt: normalizeTimestampValue(data.createdAt)
  };
}

function clampLimit(value) {
  const num = Math.floor(safeNum(value, DEFAULT_PAGE_LIMIT));
  return Math.min(USER_PAGE_LIMIT_MAX, Math.max(1, num || DEFAULT_PAGE_LIMIT));
}

function normalizePatchPrimitive(value) {
  if (value === null) return null;
  if (typeof value === 'string') return cleanStr(value, 5000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function sanitizePatchObject(value, depth = 0) {
  if (depth > 6 || value === undefined) return undefined;
  const primitive = normalizePatchPrimitive(value);
  if (primitive !== undefined) return primitive;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizePatchObject(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return undefined;

  const out = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = String(rawKey || '').trim();
    if (!key || key.length > 100) continue;
    if (BLOCKED_PATCH_KEYS.has(key)) continue;
    if (!/^[a-zA-Z0-9_\-.]+$/.test(key)) continue;
    const sanitized = sanitizePatchObject(rawValue, depth + 1);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return out;
}

function sanitizeFieldUpdateMap(payload = {}) {
  const out = {};
  for (const field of EDITABLE_COMMON_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const value = payload[field];
    if (typeof value === 'string') {
      out[field] = cleanStr(value, field === 'avatar' ? 400 : 2000);
      continue;
    }
    if (typeof value === 'boolean') {
      out[field] = value;
      continue;
    }
    if (typeof value === 'number') {
      out[field] = Number.isFinite(value) ? value : 0;
    }
  }
  return out;
}

async function scanUsersForSearch(queryText = '', hardLimit = 50) {
  const q = cleanStr(queryText, 120).toLowerCase();
  if (!q) return [];

  const results = [];
  let lastDoc = null;
  while (results.length < hardLimit) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(150);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const user = sanitizeUserDoc(doc);
      const haystack = [user.uid, user.username, user.fullName, user.email].join(' ').toLowerCase();
      if (haystack.includes(q)) results.push(user);
      if (results.length >= hardLimit) break;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 150) break;
  }

  return results.slice(0, hardLimit);
}

async function listUsersPage({ limit = DEFAULT_PAGE_LIMIT, cursor = '', q = '' } = {}) {
  const totalCount = await getCount(colUsers());
  const trimmedQ = cleanStr(q, 120);
  if (trimmedQ.length >= 2) {
    const users = await scanUsersForSearch(trimmedQ, limit);
    return { users, nextCursor: '', totalCount, search: trimmedQ };
  }

  let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get();
  const users = snap.docs.map((doc) => sanitizeUserDoc(doc));
  const nextCursor = snap.size === limit ? snap.docs[snap.docs.length - 1].id : '';
  return { users, nextCursor, totalCount, search: '' };
}

async function listAuditForUser(targetUid, limit = 20) {
  try {
    const snap = await colAudit().orderBy('createdAt', 'desc').limit(150).get();
    return snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((item) => String(item.targetId || '') === targetUid || String(item.actorUid || '') === targetUid)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        action: cleanStr(item.action || '', 120),
        targetType: cleanStr(item.targetType || '', 80),
        targetId: cleanStr(item.targetId || '', 220),
        actorUid: cleanStr(item.actorUid || '', 160),
        status: cleanStr(item.status || 'success', 24),
        createdAt: normalizeTimestampValue(item.createdAt)
      }));
  } catch (_) {
    return [];
  }
}

async function listTicketsForUser(targetUid, limit = 10) {
  try {
    const snap = await colTickets().orderBy('updatedAt', 'desc').limit(150).get();
    return snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((item) => String(item.uid || '') === targetUid)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        subject: cleanStr(item.subject || 'Destek Talebi', 120) || 'Destek Talebi',
        status: cleanStr(item.status || 'open', 24) || 'open',
        priority: cleanStr(item.priority || 'normal', 24) || 'normal',
        updatedAt: normalizeTimestampValue(item.updatedAt)
      }));
  } catch (_) {
    return [];
  }
}

async function getUserDetail(uid = '') {
  const userRef = colUsers().doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const error = new Error('Kullanıcı bulunamadı.');
    error.statusCode = 404;
    throw error;
  }

  const firestoreData = userSnap.data() || {};
  let authRecord = null;
  try {
    const record = await auth.getUser(uid);
    authRecord = {
      uid: record.uid,
      email: record.email || '',
      displayName: record.displayName || '',
      disabled: !!record.disabled,
      emailVerified: !!record.emailVerified,
      creationTime: record.metadata?.creationTime || '',
      lastSignInTime: record.metadata?.lastSignInTime || '',
      customClaims: record.customClaims || {}
    };
  } catch (_) {
    authRecord = null;
  }

  const [auditRows, ticketRows] = await Promise.all([
    listAuditForUser(uid),
    listTicketsForUser(uid)
  ]);

  return {
    ok: true,
    summary: sanitizeUserDoc(userSnap),
    firestore: serializeValue(firestoreData),
    auth: authRecord,
    recentAudit: auditRows,
    recentTickets: ticketRows
  };
}

async function runUserBatches(mutator) {
  let totalUpdated = 0;
  let batchCount = 0;
  let lastDoc = null;

  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(BULK_BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      const patch = mutator(doc);
      if (patch && Object.keys(patch).length > 0) {
        batch.set(doc.ref, patch, { merge: true });
        totalUpdated += 1;
      }
    }
    await batch.commit();
    batchCount += 1;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BULK_BATCH_SIZE) break;
  }

  return { totalUpdated, batchCount };
}


router.get('/admin/ping', requireAdminPermission('admin.read'), async (req, res) => {
  return res.json({
    ok: true,
    admin: {
      uid: cleanStr(req.user?.uid || '', 160),
      email: cleanStr(req.user?.email || '', 200)
    },
    serverTime: nowMs(),
    service: 'PlayMatrix Admin API'
  });
});

router.get('/admin/overview', requireAdminPermission('admin.read', 'users.read'), async (_req, res) => {
  try {
    const [userCount, openTicketCount, unresolvedTicketCount, bannedCount, mutedCount, recentTicketsSnap, recentAuditSnap, leaderboardSnap, featureFlags, recentErrors] = await Promise.all([
      getCount(colUsers()),
      getCount(colTickets().where('status', 'in', ['open', 'waiting_admin'])),
      getCount(colTickets().where('status', '!=', 'resolved')),
      getCount(colUsers().where('isBanned', '==', true)),
      getCount(colUsers().where('isMuted', '==', true)),
      colTickets().orderBy('updatedAt', 'desc').limit(8).get(),
      colAudit().orderBy('createdAt', 'desc').limit(12).get(),
      colUsers().orderBy('monthlyActiveScore', 'desc').limit(5).get(),
      getFeatureFlagsDocument(),
      listOpsErrors(5)
    ]);

    const recentTickets = recentTicketsSnap.docs.map((doc) => ({
      id: doc.id,
      subject: cleanStr(doc.data()?.subject || 'Destek Talebi', 120) || 'Destek Talebi',
      status: cleanStr(doc.data()?.status || 'open', 24) || 'open',
      priority: cleanStr(doc.data()?.priority || 'normal', 24) || 'normal',
      uid: cleanStr(doc.data()?.uid || '', 160),
      updatedAt: normalizeTimestampValue(doc.data()?.updatedAt)
    }));

    const recentAudit = recentAuditSnap.docs.map((doc) => ({
      id: doc.id,
      action: cleanStr(doc.data()?.action || '', 120),
      targetType: cleanStr(doc.data()?.targetType || '', 80),
      targetId: cleanStr(doc.data()?.targetId || '', 220),
      actorUid: cleanStr(doc.data()?.actorUid || '', 160),
      status: cleanStr(doc.data()?.status || 'success', 24),
      createdAt: normalizeTimestampValue(doc.data()?.createdAt)
    }));

    const activeTop = leaderboardSnap.docs.map((doc, index) => ({ rankPosition: index + 1, ...sanitizeUserDoc(doc) }));

    res.json({
      ok: true,
      metrics: {
        userCount,
        openTicketCount,
        unresolvedTicketCount,
        bannedCount,
        mutedCount,
        timestamp: nowMs(),
        uptimeSec: Math.round(process.uptime())
      },
      recentTickets,
      recentAudit,
      activeTop,
      ops: {
        featureFlags: buildFeatureFlagRows(featureFlags),
        recentErrors
      }
    });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Yönetim özeti yüklenemedi.' });
  }
});

router.get('/admin/tickets', requireAdminPermission('tickets.read'), async (req, res) => {
  try {
    const status = cleanStr(req.query?.status || '', 24).toLowerCase();
    let query = colTickets().orderBy('updatedAt', 'desc').limit(50);
    if (status && ['open', 'waiting_user', 'waiting_admin', 'resolved', 'closed'].includes(status)) {
      query = colTickets().where('status', '==', status).orderBy('updatedAt', 'desc').limit(50);
    }
    const snap = await query.get();
    const tickets = snap.docs.map((doc) => ({ id: doc.id, ...(serializeValue(doc.data() || {})) }));
    res.json({ ok: true, tickets });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Destek kayıtları yüklenemedi.' });
  }
});

router.post('/admin/tickets/:id/status', requireAdminPermission('tickets.write'), async (req, res) => {
  try {
    const ticketId = cleanStr(req.params.id || '', 160);
    const status = cleanStr(req.body?.status || '', 24).toLowerCase();
    const note = cleanStr(req.body?.note || '', 1000);
    if (!ticketId) throw new Error('Geçersiz kayıt.');
    if (!['open', 'waiting_user', 'waiting_admin', 'resolved', 'closed'].includes(status)) throw new Error('Geçersiz durum.');

    const ticketRef = colTickets().doc(ticketId);
    const now = nowMs();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) throw new Error('Destek kaydı bulunamadı.');
      const data = snap.data() || {};
      const messages = Array.isArray(data.messages) ? data.messages.slice(-99) : [];
      if (note) {
        messages.push({ id: `admin_${now}`, sender: 'admin', senderUid: req.user.uid, text: note, createdAt: now });
      }
      tx.set(ticketRef, { status, messages, unreadForUser: true, unreadForAdmin: false, updatedAt: now, lastReplyAt: now }, { merge: true });
    });

    await recordAdminAudit(req, {
      action: 'support.ticket.status',
      targetType: 'support_ticket',
      targetId: ticketId,
      metadata: { status }
    });

    res.json({ ok: true, ticketId, status });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Durum güncellenemedi.' });
  }
});

router.get('/admin/users', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const limit = clampLimit(req.query?.limit);
    const cursor = cleanStr(req.query?.cursor || '', 200);
    const q = cleanStr(req.query?.q || '', 120);
    const payload = await listUsersPage({ limit, cursor, q });
    res.json({ ok: true, ...payload, limit });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Kullanıcı listesi yüklenemedi.' });
  }
});

router.get('/admin/users/search', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const q = cleanStr(req.query?.q || '', 80).toLowerCase();
    if (!q || q.length < 2) return res.json({ ok: true, users: [] });
    const users = await scanUsersForSearch(q, 20);
    res.json({ ok: true, users });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Kullanıcı araması başarısız.' });
  }
});

router.get('/admin/users/:uid', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const uid = cleanStr(req.params.uid || '', 160);
    if (!uid) throw new Error('Kullanıcı UID gerekli.');
    const payload = await getUserDetail(uid);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 400).json({ ok: false, error: error.message || 'Kullanıcı detayı alınamadı.' });
  }
});

router.patch('/admin/users/:uid', requireAdminPermission('users.write'), async (req, res) => {
  try {
    const uid = cleanStr(req.params.uid || '', 160);
    if (!uid) throw new Error('Kullanıcı UID gerekli.');

    const commonFields = sanitizeFieldUpdateMap(req.body || {});
    const mergePatch = sanitizePatchObject(req.body?.mergePatch || req.body?.patch || {});
    const patch = { ...commonFields, ...(mergePatch && typeof mergePatch === 'object' ? mergePatch : {}) };
    if (Object.keys(patch).length === 0) throw new Error('Güncellenecek en az bir alan gerekli.');
    patch.updatedAt = nowMs();
    patch.lastAdminEditAt = nowMs();
    patch.lastAdminEditBy = req.user.uid;

    await colUsers().doc(uid).set(patch, { merge: true });
    await recordAdminAudit(req, {
      action: 'user.profile.edit',
      targetType: 'user',
      targetId: uid,
      metadata: { fields: Object.keys(patch).sort() }
    });

    const payload = await getUserDetail(uid);
    res.json({ ok: true, message: 'Kullanıcı güncellendi.', ...payload });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Kullanıcı güncellenemedi.' });
  }
});

router.post('/admin/users/:uid/reset-values', requireAdminPermission('users.write'), async (req, res) => {
  try {
    const uid = cleanStr(req.params.uid || '', 160);
    if (!uid) throw new Error('Kullanıcı UID gerekli.');
    const requestedFields = Array.isArray(req.body?.fields) ? req.body.fields.map((item) => cleanStr(item, 60)).filter(Boolean) : [];
    if (requestedFields.length === 0) throw new Error('Sıfırlanacak alan seçmelisin.');

    const patch = { updatedAt: nowMs(), lastAdminResetAt: nowMs(), lastAdminResetBy: req.user.uid };
    for (const field of requestedFields) {
      if (!Object.prototype.hasOwnProperty.call(REMOTE_DEFAULTS, field)) continue;
      patch[field] = REMOTE_DEFAULTS[field];
    }
    if (Object.keys(patch).length <= 3) throw new Error('Geçerli sıfırlama alanı yok.');

    await colUsers().doc(uid).set(patch, { merge: true });
    await recordAdminAudit(req, {
      action: 'user.values.reset',
      targetType: 'user',
      targetId: uid,
      metadata: { fields: requestedFields }
    });

    const payload = await getUserDetail(uid);
    res.json({ ok: true, message: 'Kullanıcı değerleri sıfırlandı.', fields: requestedFields, ...payload });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Kullanıcı değerleri sıfırlanamadı.' });
  }
});

router.post('/admin/users/bulk-reset', requireAdminPermission('users.write'), async (req, res) => {
  try {
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    if (confirmText !== 'TUM KULLANICILARI SIFIRLA') throw new Error('Onay metni hatalı.');

    const requestedFields = Array.isArray(req.body?.fields)
      ? req.body.fields.map((item) => cleanStr(item, 60)).filter((item) => Object.prototype.hasOwnProperty.call(REMOTE_DEFAULTS, item))
      : [];
    if (requestedFields.length === 0) throw new Error('Sıfırlanacak alan seçmelisin.');

    const now = nowMs();
    const result = await runUserBatches(() => {
      const patch = { updatedAt: now, lastBulkResetAt: now, lastBulkResetBy: req.user.uid };
      requestedFields.forEach((field) => { patch[field] = REMOTE_DEFAULTS[field]; });
      return patch;
    });

    await recordAdminAudit(req, {
      action: 'users.bulk_reset',
      targetType: 'system',
      targetId: 'all_users',
      metadata: { fields: requestedFields, totalUpdated: result.totalUpdated }
    });

    res.json({
      ok: true,
      message: 'Toplu sıfırlama tamamlandı.',
      totalUpdated: result.totalUpdated,
      batchCount: result.batchCount,
      fields: requestedFields,
      labels: requestedFields.map((field) => BULK_RESET_FIELD_LABELS[field] || field)
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Toplu sıfırlama başarısız.' });
  }
});

router.post('/admin/season/reset', requireAdminPermission('system.read', 'users.write'), async (req, res) => {
  try {
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    if (confirmText !== 'SEZONU SIFIRLA') throw new Error('Onay metni hatalı.');

    const resetRank = req.body?.resetRank === true;
    const resetMonthly = req.body?.resetMonthly !== false;
    const seasonLabel = cleanStr(req.body?.seasonLabel || '', 80) || new Date().toISOString().slice(0, 10);
    const now = nowMs();

    const result = await runUserBatches(() => {
      const patch = {
        seasonRp: 0,
        lastSeasonResetAt: now,
        lastSeasonResetBy: req.user.uid,
        lastSeasonLabel: seasonLabel,
        updatedAt: now
      };
      if (resetMonthly) patch.monthlyActiveScore = 0;
      if (resetRank) patch.rank = 0;
      return patch;
    });

    await recordAdminAudit(req, {
      action: 'season.reset',
      targetType: 'system',
      targetId: seasonLabel,
      metadata: {
        resetRank,
        resetMonthly,
        seasonLabel,
        totalUpdated: result.totalUpdated
      }
    });

    res.json({
      ok: true,
      message: 'Sezon sıfırlandı.',
      seasonLabel,
      resetRank,
      resetMonthly,
      totalUpdated: result.totalUpdated,
      batchCount: result.batchCount
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Sezon sıfırlanamadı.' });
  }
});

router.post('/admin/users/:uid/moderate', requireAdminPermission('moderation.write'), async (req, res) => {
  try {
    const targetUid = cleanStr(req.params.uid || '', 160);
    const action = normalizeModAction(req.body?.action);
    const reason = cleanStr(req.body?.reason || '', 500);
    if (!targetUid || !action) throw new Error('Geçersiz moderasyon isteği.');

    const patch = { moderationReason: reason, moderationUpdatedAt: nowMs(), updatedAt: nowMs() };
    if (action === 'mute') patch.isMuted = true;
    if (action === 'unmute') patch.isMuted = false;
    if (action === 'ban') patch.isBanned = true;
    if (action === 'unban') patch.isBanned = false;
    if (action === 'flag') patch.isFlagged = true;

    await colUsers().doc(targetUid).set(patch, { merge: true });
    await recordAdminAudit(req, {
      action: `moderation.${action}`,
      targetType: 'user',
      targetId: targetUid,
      metadata: { reason }
    });

    res.json({ ok: true, targetUid, action });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Moderasyon işlemi başarısız.' });
  }
});

router.post('/admin/rewards/grant', requireAdminPermission('rewards.write'), async (req, res) => {
  try {
    const uid = cleanStr(req.body?.uid || '', 160);
    const amount = Math.max(1, Math.min(100000000, Math.floor(safeSignedNum(req.body?.amount, 0))));
    const reason = cleanStr(req.body?.reason || '', 240);
    if (!uid || !amount) throw new Error('UID ve tutar zorunlu.');

    await colUsers().doc(uid).set({
      balance: admin.firestore.FieldValue.increment(amount),
      updatedAt: nowMs(),
      lastManualRewardAt: nowMs(),
      lastManualRewardAmount: amount,
      lastManualRewardReason: reason
    }, { merge: true });

    await recordAdminAudit(req, {
      action: 'reward.manual_grant',
      targetType: 'user',
      targetId: uid,
      metadata: { amount, reason }
    });
    await Promise.allSettled([
      recordRewardLedger({ uid, amount, source: 'admin_manual_grant', referenceId: req.user.uid, meta: { reason } }),
      createNotification({ uid, type: 'reward', title: 'Manuel ödül', body: `${amount} MC hesabına eklendi.`, data: { source: 'admin_manual_grant', amount, reason } })
    ]);

    res.json({ ok: true, uid, amount });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Ödül verilemedi.' });
  }
});

router.get('/admin/audit', requireAdminPermission('admin.read'), async (_req, res) => {
  try {
    const snap = await colAudit().orderBy('createdAt', 'desc').limit(100).get();
    const rows = snap.docs.map((doc) => ({ id: doc.id, ...(serializeValue(doc.data() || {})) }));
    res.json({ ok: true, rows });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Denetim kayıtları yüklenemedi.' });
  }
});



router.get('/admin/feature-flags', requireAdminPermission('system.read'), async (_req, res) => {
  try {
    const flags = await getFeatureFlagsDocument();
    return res.json({ ok: true, flags, rows: buildFeatureFlagRows(flags) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Feature flag verileri alınamadı.' });
  }
});

router.patch('/admin/feature-flags', requireAdminPermission('system.read'), async (req, res) => {
  try {
    const incoming = req.body?.flags && typeof req.body.flags === 'object' ? req.body.flags : (req.body || {});
    const previous = await getFeatureFlagsDocument();
    const nextFlags = sanitizeFeatureFlags({ ...previous, ...incoming }, DEFAULT_FEATURE_FLAGS);
    const changedKeys = Object.keys(nextFlags).filter((key) => nextFlags[key] !== previous[key]);
    await setFeatureFlagsDocument(nextFlags, req.user?.uid || '');
    await recordAdminAudit(req, {
      action: 'system.feature_flags.update',
      targetType: 'system',
      targetId: 'feature_flags',
      metadata: { changedKeys, nextFlags }
    });
    return res.json({ ok: true, flags: nextFlags, rows: buildFeatureFlagRows(nextFlags), changedKeys });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Feature flag güncellemesi başarısız.' });
  }
});

router.get('/admin/ops/errors', requireAdminPermission('system.read'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, safeNum(req.query?.limit, 30)));
    const rows = await listOpsErrors(limit);
    return res.json({ ok: true, rows, count: rows.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Operasyon hataları alınamadı.' });
  }
});

router.get('/admin/ops/health', requireAdminPermission('system.read'), async (_req, res) => {
  try {
    const [ticketCount, auditCount, userCount, flags, recentErrors] = await Promise.all([
      getCount(colTickets()),
      getCount(colAudit()),
      getCount(colUsers()),
      getFeatureFlagsDocument(),
      listOpsErrors(12)
    ]);

    const snapshot = buildOpsHealthSnapshot({
      featureFlags: flags,
      recentErrors,
      logPath: APP_LOG_PATH,
      tailLines: 20
    });

    return res.json({
      ok: true,
      health: {
        ...snapshot,
        counters: { userCount, ticketCount, auditCount }
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Operasyon health alınamadı.' });
  }
});


router.get('/admin/platform/control', requireAdminPermission('system.read'), async (_req, res) => {
  try {
    const [flags, recentErrors, userSnap] = await Promise.all([
      getFeatureFlagsDocument(),
      listOpsErrors(12),
      colUsers().limit(120).get()
    ]);

    const users = (userSnap.docs || []).map((doc) => serializeValue(doc.data() || {}));
    const opsHealth = buildOpsHealthSnapshot({
      featureFlags: flags,
      recentErrors,
      logPath: APP_LOG_PATH,
      tailLines: 12
    });
    const control = buildPlatformControlSnapshot({
      featureFlags: flags,
      recentErrors,
      rewardCatalogSummary: { total: 0, sources: [] },
      users,
      opsHealth
    });

    return res.json({ ok: true, control });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Platform kontrol özeti alınamadı.' });
  }
});

router.get('/admin/cleanup-reports', requireAdminPermission('system.read'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, safeNum(req.query?.limit, 20)));
    const snap = await db.collection('account_cleanup_reports').orderBy('startedAt', 'desc').limit(limit).get();
    const items = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Temizlik raporları yüklenemedi.' });
  }
});

router.get('/admin/deployment-health', requireAdminPermission('system.read'), async (_req, res) => {
  try {
    const [ticketCount, auditCount, userCount, flags, recentErrors] = await Promise.all([
      getCount(colTickets()),
      getCount(colAudit()),
      getCount(colUsers()),
      getFeatureFlagsDocument(),
      listOpsErrors(8)
    ]);

    const snapshot = buildOpsHealthSnapshot({
      featureFlags: flags,
      recentErrors,
      logPath: APP_LOG_PATH,
      tailLines: 12
    });

    res.json({
      ok: true,
      deployment: {
        node: snapshot.process.node,
        uptimeSec: snapshot.process.uptimeSec,
        memory: snapshot.process.memory,
        pid: snapshot.process.pid,
        ticketCount,
        auditCount,
        userCount,
        timestamp: snapshot.timestamp,
        hostname: snapshot.host.hostname,
        loadavg: snapshot.host.loadavg,
        flags
      },
      health: {
        ...snapshot,
        counters: { ticketCount, auditCount, userCount }
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Dağıtım sağlık bilgisi alınamadı.' });
  }
});



module.exports = router;
