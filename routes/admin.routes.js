'use strict';

const express = require('express');

const { db, admin, auth } = require('../config/firebase');
const { verifyAdmin, requireAdminPermission } = require('../middlewares/admin.middleware');
const { adminLimiter } = require('../middlewares/rateLimiters');
const { cleanStr, safeNum, safeSignedNum, nowMs } = require('../utils/helpers');
const { recordAuditLog, APP_LOG_PATH, logCaughtError } = require('../utils/logger');
const { recordRewardLedger } = require('../utils/rewardLedger');
const { createNotification } = require('../utils/notifications');
const { grantReward, grantRewardToAllUsers } = require('../utils/rewardService');
const { DEFAULT_FEATURE_FLAGS } = require('../config/featureFlags');
const { buildRewardCatalogSummary } = require('../config/rewardCatalog');
const { GAME_ISSUES, SOCIAL_ISSUES } = require('../config/adminKnownIssues');
const { sanitizeFeatureFlags, buildFeatureFlagRows } = require('../utils/featureFlags');
const { getFeatureFlagsDocument: storeGetFeatureFlagsDocument, setFeatureFlagsDocument: storeSetFeatureFlagsDocument } = require('../utils/featureFlagStore');
const { buildOpsHealthSnapshot } = require('../utils/opsHealth');
const { buildPlatformControlSnapshot } = require('../utils/platformControl');
const { buildCanonicalUserState } = require('../utils/accountState');
const { normalizeUserRankState } = require('../utils/progression');
const { restrictionSnapshot } = require('../utils/userRestrictions');

const router = express.Router();
const colUsers = () => db.collection('users');
const colTickets = () => db.collection('support_tickets');
const colAudit = () => db.collection('audit_logs');
const colConfig = () => db.collection('ops_config');
const colOpsErrors = () => db.collection('ops_errors');
const colPromos = () => db.collection('promo_codes');
const colGameAudit = () => db.collection('game_audit_logs');
const colChess = () => db.collection('chess_rooms');
const colPistiRooms = () => db.collection('pisti_online_rooms');
const USER_PAGE_LIMIT_MAX = 100;
const DEFAULT_PAGE_LIMIT = 25;
const BULK_BATCH_SIZE = 250;
const REMOTE_DEFAULTS = {
  balance: 0,
  accountLevel: 1,
  accountXp: 0,
  accountLevelScore: 0,
  selectedFrame: 0,
  monthlyActiveScore: 0,
  activityScore: 0
};
const BULK_RESET_FIELD_LABELS = {
  balance: 'Bakiye',
  accountLevel: 'Hesap Seviyesi',
  accountXp: 'Hesap XP',
  selectedFrame: 'Seçili Çerçeve',
  monthlyActiveScore: 'Aylık aktiflik',
  activityScore: 'Aktiflik puanı'
};
const EDITABLE_COMMON_FIELDS = new Set([
  'username', 'fullName', 'email', 'avatar', 'balance', 'accountLevel', 'accountXp', 'accountLevelScore', 'selectedFrame',
  'monthlyActiveScore', 'activityScore',
  'isMuted', 'isBanned', 'isFlagged', 'moderationReason', 'badge'
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
    return await storeGetFeatureFlagsDocument();
  } catch (error) {
    logCaughtError('admin.feature_flags.get', error);
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}

async function setFeatureFlagsDocument(nextFlags = {}, actorUid = '') {
  return storeSetFeatureFlagsDocument(nextFlags, actorUid);
}

async function listOpsErrors(limit = 30) {
  try {
    const snap = await colOpsErrors().orderBy('createdAt', 'desc').limit(Math.max(1, Math.min(100, limit))).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(serializeValue(doc.data() || {})) }));
  } catch (error) {
    logCaughtError('admin.ops_errors.list', error, { limit });
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
  const canonical = buildCanonicalUserState(data, { defaultFrame: 0 });
  return {
    uid: doc.id,
    username: cleanStr(data.username || data.fullName || 'Oyuncu', 60) || 'Oyuncu',
    fullName: cleanStr(data.fullName || '', 120),
    email: cleanStr(data.email || '', 200),
    avatar: cleanStr(data.avatar || '', 400),
    balance: safeNum(data.balance, 0),
    accountLevel: canonical.accountLevel,
    accountXp: canonical.accountXp,
    accountLevelScore: canonical.accountLevelScore,
    selectedFrame: canonical.selectedFrame,
    monthlyActiveScore: canonical.monthlyActiveScore,
    activityScore: safeNum(data.activityScore, 0),
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

function normalizeEditableEmail(value = '') {
  return cleanStr(value || '', 200).toLowerCase();
}

function isValidEditableEmail(value = '') {
  const email = normalizeEditableEmail(value);
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function syncAdminEditedEmail({ uid = '', currentUser = {}, requestedPatch = {} } = {}) {
  if (!Object.prototype.hasOwnProperty.call(requestedPatch, 'email')) return null;

  const nextEmail = normalizeEditableEmail(requestedPatch.email);
  const currentEmail = normalizeEditableEmail(currentUser.email);

  if (!isValidEditableEmail(nextEmail)) {
    const error = new Error('Geçerli bir e-posta adresi girilmelidir.');
    error.statusCode = 400;
    throw error;
  }

  requestedPatch.email = nextEmail;
  if (nextEmail === currentEmail) return null;

  try {
    const existing = await auth.getUserByEmail(nextEmail);
    if (existing && existing.uid !== uid) {
      const error = new Error('Bu e-posta başka bir hesapta kullanılıyor.');
      error.statusCode = 409;
      throw error;
    }
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  let authRecord = null;
  try {
    authRecord = await auth.getUser(uid);
  } catch (error) {
    const wrapped = new Error('Firebase Auth kullanıcısı bulunamadı, e-posta senkronu yapılamadı.');
    wrapped.statusCode = 404;
    throw wrapped;
  }

  const previousEmail = normalizeEditableEmail(authRecord.email);
  const previousVerified = !!authRecord.emailVerified;
  if (previousEmail === nextEmail) return null;

  await auth.updateUser(uid, {
    email: nextEmail,
    emailVerified: false
  });

  requestedPatch.emailVerified = false;
  return { email: previousEmail, emailVerified: previousVerified };
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



async function resolveUserByIdentifier(identifier = '') {
  const raw = cleanStr(identifier || '', 200).trim();
  if (!raw) {
    const error = new Error('Kullanıcı bilgisi gerekli.');
    error.statusCode = 400;
    throw error;
  }

  const safe = raw.toLowerCase();
  const direct = await colUsers().doc(raw).get().catch(() => null);
  if (direct?.exists) return { uid: direct.id, data: direct.data() || {} };

  const users = await scanUsersForSearch(raw, 25);
  const exact = users.find((user) => {
    return [user.uid, user.email, user.username, user.fullName]
      .map((item) => cleanStr(item || '', 200).toLowerCase())
      .includes(safe);
  }) || users[0];

  if (!exact?.uid) {
    const error = new Error('Kullanıcı bulunamadı.');
    error.statusCode = 404;
    throw error;
  }

  return { uid: exact.uid, data: exact };
}

async function countUsersByScan(predicate) {
  let total = 0;
  let lastDoc = null;
  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(250);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      if (predicate(doc.data() || {})) total += 1;
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 250) break;
  }
  return total;
}

async function summarizeEconomyAndRooms() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const [chessSnap, pistiSnap, auditSnap] = await Promise.all([
    colChess().limit(500).get().catch(() => ({ docs: [] })),
    colPistiRooms().limit(500).get().catch(() => ({ docs: [] })),
    colGameAudit().orderBy('createdAt', 'desc').limit(2500).get().catch(() => ({ docs: [] }))
  ]);

  const openRoomCount = (chessSnap.docs || []).filter((doc) => ['waiting', 'playing'].includes(cleanStr(doc.data()?.status || '', 24))).length
    + (pistiSnap.docs || []).filter((doc) => ['waiting', 'playing'].includes(cleanStr(doc.data()?.status || '', 24))).length;

  let dailySpend = 0;
  let totalAmount = 0;
  let totalPayout = 0;
  for (const doc of auditSnap.docs || []) {
    const data = doc.data() || {};
    const createdAt = safeNum(data.createdAt, 0);
    const amount = Math.max(0, safeNum(data.amount, 0));
    const payout = Math.max(0, safeNum(data.payout, 0));
    totalAmount += amount;
    totalPayout += payout;
    if (createdAt >= dayStart) dailySpend += amount;
  }

  return {
    dailyMcSpend: dailySpend,
    totalProfit: Math.max(0, totalAmount - totalPayout),
    totalLoss: Math.max(0, totalPayout - totalAmount),
    openRoomCount
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
      email: cleanStr(req.user?.email || '', 200),
      role: cleanStr(req.adminContext?.role || 'admin', 40),
      roles: Array.isArray(req.adminContext?.roles) ? req.adminContext.roles : [],
      permissions: Array.isArray(req.adminContext?.permissions) ? req.adminContext.permissions : [],
      source: cleanStr(req.adminContext?.source || '', 40)
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
  let emailRollbackState = null;
  let uid = '';

  try {
    uid = cleanStr(req.params.uid || '', 160);
    if (!uid) throw new Error('Kullanıcı UID gerekli.');

    const commonFields = sanitizeFieldUpdateMap(req.body || {});
    const mergePatch = sanitizePatchObject(req.body?.mergePatch || req.body?.patch || {});
    const requestedPatch = { ...commonFields, ...(mergePatch && typeof mergePatch === 'object' ? mergePatch : {}) };
    if (Object.keys(requestedPatch).length === 0) throw new Error('Güncellenecek en az bir alan gerekli.');

    const userRef = colUsers().doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error('Kullanıcı bulunamadı.');
    const currentUser = userSnap.data() || {};
    emailRollbackState = await syncAdminEditedEmail({ uid, currentUser, requestedPatch });
    const mergedUser = { ...currentUser, ...requestedPatch };
    const canonicalState = buildCanonicalUserState(mergedUser, { defaultFrame: 0 });
    const patch = {
      ...requestedPatch,
      ...canonicalState,
      ...normalizeUserRankState({ ...mergedUser, ...canonicalState }),
      updatedAt: nowMs(),
      lastAdminEditAt: nowMs(),
      lastAdminEditBy: req.user.uid
    };

    await userRef.set(patch, { merge: true });
    await recordAdminAudit(req, {
      action: 'user.profile.edit',
      targetType: 'user',
      targetId: uid,
      metadata: { fields: Object.keys(patch).sort() }
    });

    const payload = await getUserDetail(uid);
    res.json({ ok: true, message: 'Kullanıcı güncellendi.', ...payload });
  } catch (error) {
    if (uid && emailRollbackState && emailRollbackState.email) {
      try {
        await auth.updateUser(uid, {
          email: emailRollbackState.email,
          emailVerified: !!emailRollbackState.emailVerified
        });
      } catch (_) {}
    }

    res.status(error.statusCode || 400).json({ ok: false, error: error.message || 'Kullanıcı güncellenemedi.' });
  }
});

router.post('/admin/users/:uid/reset-values', requireAdminPermission('users.write'), async (req, res) => {
  try {
    const uid = cleanStr(req.params.uid || '', 160);
    if (!uid) throw new Error('Kullanıcı UID gerekli.');
    const requestedFields = Array.isArray(req.body?.fields) ? req.body.fields.map((item) => cleanStr(item, 60)).filter(Boolean) : [];
    if (requestedFields.length === 0) throw new Error('Sıfırlanacak alan seçmelisin.');

    const userRef = colUsers().doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error('Kullanıcı bulunamadı.');
    const currentUser = userSnap.data() || {};
    const requestedPatch = { updatedAt: nowMs(), lastAdminResetAt: nowMs(), lastAdminResetBy: req.user.uid };
    for (const field of requestedFields) {
      if (!Object.prototype.hasOwnProperty.call(REMOTE_DEFAULTS, field)) continue;
      requestedPatch[field] = REMOTE_DEFAULTS[field];
    }
    if (Object.keys(requestedPatch).length <= 3) throw new Error('Geçerli sıfırlama alanı yok.');

    const mergedUser = { ...currentUser, ...requestedPatch };
    const canonicalState = buildCanonicalUserState(mergedUser, { defaultFrame: 0 });
    const patch = {
      ...requestedPatch,
      ...canonicalState,
      ...normalizeUserRankState({ ...mergedUser, ...canonicalState })
    };

    await userRef.set(patch, { merge: true });
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
    const result = await runUserBatches((doc) => {
      const currentUser = doc.data() || {};
      const requestedPatch = { updatedAt: now, lastBulkResetAt: now, lastBulkResetBy: req.user.uid };
      requestedFields.forEach((field) => { requestedPatch[field] = REMOTE_DEFAULTS[field]; });
      const mergedUser = { ...currentUser, ...requestedPatch };
      const canonicalState = buildCanonicalUserState(mergedUser, { defaultFrame: 0 });
      return {
        ...requestedPatch,
        ...canonicalState,
        ...normalizeUserRankState({ ...mergedUser, ...canonicalState })
      };
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

router.post('/admin/activity/reset', requireAdminPermission('system.read', 'users.write'), async (req, res) => {
  try {
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    if (confirmText !== 'AKTIFLIK SIFIRLA') throw new Error('Onay metni hatalı.');
    const resetMonthly = req.body?.resetMonthly !== false;
    const activityLabel = cleanStr(req.body?.activityLabel || '', 80) || new Date().toISOString().slice(0, 10);
    const now = nowMs();

    const result = await runUserBatches(() => {
      const patch = {
        activityRank: 'Seviye',
        activityRankKey: 'level',
        activityRankClass: 'rank-level',
        lastActivityResetAt: now,
        lastActivityResetBy: req.user.uid,
        lastActivityLabel: activityLabel,
        updatedAt: now
      };
      if (resetMonthly) patch.monthlyActiveScore = 0;
      return patch;
    });

    await recordAdminAudit(req, {
      action: 'activity.reset',
      targetType: 'system',
      targetId: activityLabel,
      metadata: {
        resetMonthly,
        activityLabel,
        totalUpdated: result.totalUpdated
      }
    });

    res.json({
      ok: true,
      message: 'Aylık aktiflik sıfırlandı.',
      activityLabel,
      resetMonthly,
      totalUpdated: result.totalUpdated,
      batchCount: result.batchCount
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Aylık aktiflik sıfırlanamadı.' });
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

    const grant = await grantReward({
      uid,
      amount,
      source: 'admin_manual_grant',
      referenceId: `admin:${req.user.uid}`,
      idempotencyKey: cleanStr(req.body?.idempotencyKey || `admin_manual:${req.user.uid}:${uid}:${nowMs()}`, 220),
      actorUid: req.user.uid,
      reason,
      userPatch: {
        lastManualRewardAt: nowMs(),
        lastManualRewardAmount: amount,
        lastManualRewardReason: reason
      }
    });

    await recordAdminAudit(req, {
      action: 'reward.manual_grant',
      targetType: 'user',
      targetId: uid,
      metadata: { amount, reason, ledgerId: grant.id, duplicated: !!grant.duplicated }
    });

    res.json({ ok: true, uid, amount, ledgerId: grant.id, duplicated: !!grant.duplicated });
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
      rewardCatalogSummary: buildRewardCatalogSummary({ includePrivate: true }),
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





router.get('/admin/matrix/dashboard', requireAdminPermission('admin.read', 'users.read'), async (_req, res) => {
  try {
    const [userCount, mutedCount, deletedCount, flags, economy, recentErrors] = await Promise.all([
      getCount(colUsers()),
      countUsersByScan((row) => restrictionSnapshot(row).globalChatBlocked || !!row.isMuted),
      countUsersByScan((row) => safeNum(row.deletedAt, 0) > 0 || !!row.disabledAt),
      getFeatureFlagsDocument(),
      summarizeEconomyAndRooms(),
      listOpsErrors(24)
    ]);

    return res.json({
      ok: true,
      metrics: {
        userCount,
        mutedCount,
        deletedCount,
        dailyMcSpend: economy.dailyMcSpend,
        totalProfit: economy.totalProfit,
        totalLoss: economy.totalLoss,
        openRoomCount: economy.openRoomCount
      },
      maintenance: {
        crash: !!flags.crashMaintenance,
        pisti: !!flags.pistiMaintenance,
        chess: !!flags.chessMaintenance,
        classic: !!flags.classicGamesMaintenance,
        global: !!flags.maintenanceMode
      },
      issues: {
        games: GAME_ISSUES,
        systems: SOCIAL_ISSUES,
        recentErrors
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Dashboard yüklenemedi.' });
  }
});

router.post('/admin/matrix/reset-nuclear', requireAdminPermission('users.write'), async (req, res) => {
  try {
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    if (confirmText !== 'ONAYLIYORUM') throw new Error('Onay metni hatalı.');
    const requestedFields = Array.isArray(req.body?.fields)
      ? req.body.fields.map((item) => cleanStr(item, 60)).filter((item) => Object.prototype.hasOwnProperty.call(REMOTE_DEFAULTS, item))
      : [];
    if (!requestedFields.length) throw new Error('Sıfırlanacak alan seçilmedi.');
    const now = nowMs();
    const result = await runUserBatches((doc) => {
      const currentUser = doc.data() || {};
      const requestedPatch = { updatedAt: now, lastBulkResetAt: now, lastBulkResetBy: _req.user.uid };
      requestedFields.forEach((field) => { requestedPatch[field] = REMOTE_DEFAULTS[field]; });
      const mergedUser = { ...currentUser, ...requestedPatch };
      const canonicalState = buildCanonicalUserState(mergedUser, { defaultFrame: 0 });
      return {
        ...requestedPatch,
        ...canonicalState,
        ...normalizeUserRankState({ ...mergedUser, ...canonicalState })
      };
    });
    await recordAdminAudit(_req, { action: 'matrix.reset_nuclear', targetType: 'system', targetId: 'all_users', metadata: { fields: requestedFields, totalUpdated: result.totalUpdated } });
    return res.json({ ok: true, totalUpdated: result.totalUpdated, fields: requestedFields });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Toplu sıfırlama başarısız.' });
  }
});

router.post('/admin/matrix/restrict-user', requireAdminPermission('moderation.write'), async (req, res) => {
  try {
    const target = await resolveUserByIdentifier(req.body?.identifier || req.body?.uid || '');
    const action = cleanStr(req.body?.action || '', 64).toLowerCase();
    const durationMinutes = Math.max(0, Math.min(5256000, Math.floor(safeNum(req.body?.durationMinutes, 0))));
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    const reason = cleanStr(req.body?.reason || '', 500);
    if (confirmText !== 'ONAYLIYORUM') throw new Error('Onay metni hatalı.');
    if (!['games_mute', 'global_chat_mute', 'dm_mute', 'ban'].includes(action)) throw new Error('Geçersiz işlem.');
    const until = durationMinutes > 0 ? nowMs() + (durationMinutes * 60 * 1000) : 0;
    const patch = { moderationReason: reason, moderationUpdatedAt: nowMs(), updatedAt: nowMs() };
    if (action === 'games_mute') patch.gamesRestrictedUntil = until;
    if (action === 'global_chat_mute') patch.globalChatMutedUntil = until;
    if (action === 'dm_mute') patch.dmChatMutedUntil = until;
    if (action === 'ban') {
      patch.isBanned = true;
      patch.globalChatMutedUntil = 0;
      patch.dmChatMutedUntil = 0;
      patch.gamesRestrictedUntil = 0;
    }
    await colUsers().doc(target.uid).set(patch, { merge: true });
    await createNotification({ uid: target.uid, type: 'system', title: 'Yönetici işlemi', body: reason || 'Hesabın üzerinde yönetici kısıtlaması güncellendi.', data: { action, until, source: 'admin_matrix' } }).catch(() => null);
    await recordAdminAudit(_req, { action: `matrix.restrict.${action}`, targetType: 'user', targetId: target.uid, metadata: { durationMinutes, reason } });
    return res.json({ ok: true, uid: target.uid, action, until });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Kısıtlama işlemi başarısız.' });
  }
});

router.post('/admin/matrix/reward-user', requireAdminPermission('rewards.write'), async (req, res) => {
  try {
    const target = await resolveUserByIdentifier(req.body?.identifier || req.body?.uid || '');
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    const amount = Math.max(1, Math.min(100000000, Math.floor(safeSignedNum(req.body?.amount, 0))));
    const reason = cleanStr(req.body?.reason || '', 240);
    if (confirmText !== 'ONAYLIYORUM') throw new Error('Onay metni hatalı.');
    const grant = await grantReward({
      uid: target.uid,
      amount,
      source: 'admin_manual_grant',
      referenceId: `admin_matrix:${_req.user.uid}`,
      idempotencyKey: cleanStr(req.body?.idempotencyKey || `admin_matrix_user:${_req.user.uid}:${target.uid}:${nowMs()}`, 220),
      actorUid: _req.user.uid,
      reason
    });
    await recordAdminAudit(_req, { action: 'matrix.reward_user', targetType: 'user', targetId: target.uid, metadata: { amount, reason, ledgerId: grant.id, duplicated: !!grant.duplicated } });
    return res.json({ ok: true, uid: target.uid, amount, ledgerId: grant.id, duplicated: !!grant.duplicated });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Kullanıcı ödülü verilemedi.' });
  }
});

router.post('/admin/matrix/reward-all', requireAdminPermission('rewards.write'), async (req, res) => {
  try {
    const confirmText = cleanStr(req.body?.confirmText || '', 120).toUpperCase();
    const amount = Math.max(1, Math.min(1000000, Math.floor(safeSignedNum(req.body?.amount, 0))));
    const reason = cleanStr(req.body?.reason || '', 240);
    if (confirmText !== 'ONAYLIYORUM') throw new Error('Onay metni hatalı.');
    const bulkId = cleanStr(req.body?.bulkId || `admin_reward_all:${_req.user.uid}:${nowMs()}`, 180);
    const result = await grantRewardToAllUsers({
      amount,
      source: 'admin_bulk_grant',
      referenceId: bulkId,
      bulkId,
      actorUid: _req.user.uid,
      reason,
      meta: { operation: 'matrix.reward_all' }
    });
    await recordAdminAudit(_req, { action: 'matrix.reward_all', targetType: 'system', targetId: 'all_users', metadata: { amount, reason, ...result } });
    return res.json({ ok: true, totalUpdated: result.totalGranted, amount, reason, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Toplu ödül verilemedi.' });
  }
});

router.post('/admin/matrix/promo-codes', requireAdminPermission('rewards.write'), async (req, res) => {
  try {
    const code = cleanStr(req.body?.code || '', 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const amount = Math.max(1, Math.min(100000000, Math.floor(safeSignedNum(req.body?.amount, 0))));
    const usageLimit = Math.max(1, Math.min(1000000, Math.floor(safeNum(req.body?.usageLimit, 1))));
    const durationHours = Math.max(1, Math.min(8760, Math.floor(safeNum(req.body?.durationHours, 24))));
    const onePerAccount = req.body?.onePerAccount !== false;
    if (!code || code.length < 4) throw new Error('Promo kodu geçersiz.');
    const exists = await colPromos().doc(code).get();
    if (exists.exists) throw new Error('Bu promo kodu zaten var.');
    await colPromos().doc(code).set({
      code,
      normalizedCode: code,
      amount,
      limitLeft: usageLimit,
      limitInitial: usageLimit,
      onePerAccount,
      active: true,
      createdAt: nowMs(),
      expiresAt: nowMs() + (durationHours * 60 * 60 * 1000),
      createdByUid: _req.user.uid,
      description: cleanStr(req.body?.description || '', 240)
    }, { merge: true });
    await recordAdminAudit(_req, { action: 'matrix.promo_create', targetType: 'promo', targetId: code, metadata: { amount, usageLimit, durationHours, onePerAccount } });
    return res.json({ ok: true, code, amount, usageLimit, durationHours, onePerAccount });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Promo kod oluşturulamadı.' });
  }
});

router.get('/admin/matrix/promos', requireAdminPermission('rewards.read'), async (_req, res) => {
  try {
    const snap = await colPromos().orderBy('createdAt', 'desc').limit(40).get().catch(() => ({ docs: [] }));
    const items = (snap.docs || []).map((doc) => ({ id: doc.id, ...(serializeValue(doc.data() || {})) }));
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Promo kod listesi alınamadı.' });
  }
});

router.patch('/admin/matrix/maintenance', requireAdminPermission('system.read'), async (_req, res) => {
  try {
    const current = await getFeatureFlagsDocument();
    const nextFlags = sanitizeFeatureFlags({
      ...current,
      crashMaintenance: _req.body?.crash === true,
      pistiMaintenance: _req.body?.pisti === true,
      chessMaintenance: _req.body?.chess === true,
      classicGamesMaintenance: _req.body?.classic === true
    }, DEFAULT_FEATURE_FLAGS);
    await setFeatureFlagsDocument(nextFlags, _req.user?.uid || '');
    await recordAdminAudit(_req, { action: 'matrix.maintenance_update', targetType: 'system', targetId: 'maintenance', metadata: { crash: nextFlags.crashMaintenance, pisti: nextFlags.pistiMaintenance, chess: nextFlags.chessMaintenance, classic: nextFlags.classicGamesMaintenance } });
    return res.json({ ok: true, maintenance: { crash: nextFlags.crashMaintenance, pisti: nextFlags.pistiMaintenance, chess: nextFlags.chessMaintenance, classic: nextFlags.classicGamesMaintenance } });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Bakım modu güncellenemedi.' });
  }
});

router.get('/admin/matrix/issues', requireAdminPermission('system.read'), async (_req, res) => {
  try {
    const recentErrors = await listOpsErrors(50);
    return res.json({ ok: true, games: GAME_ISSUES, systems: SOCIAL_ISSUES, recentErrors });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Hata listesi alınamadı.' });
  }
});

module.exports = router;
