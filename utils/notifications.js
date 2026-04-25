'use strict';

const crypto = require('crypto');
const { db, admin } = require('../config/firebase');
const { cleanStr, nowMs, safeNum } = require('./helpers');

const colNotifications = () => db.collection('notifications');

function normalizeNotificationType(value = '') {
  const safe = cleanStr(value || 'system', 40).toLowerCase();
  return safe || 'system';
}

function deriveNotificationSource(item = {}) {
  const directDataSource = cleanStr(item?.data?.source || item?.source || '', 80).toLowerCase();
  if (directDataSource) return directDataSource;
  const type = normalizeNotificationType(item?.type || 'system');
  return type;
}

function deriveNotificationCategory(source = '', type = '') {
  const safeSource = cleanStr(source || '', 80).toLowerCase();
  const safeType = normalizeNotificationType(type || 'system');
  if (safeType === 'reward' || safeSource.includes('reward') || safeSource.includes('promo') || safeSource.includes('spin')) return 'economy';
  if (safeType === 'invite' || safeSource.includes('invite')) return 'social';
  if (safeType === 'moderation' || safeSource.includes('mute') || safeSource.includes('ban') || safeSource.includes('report')) return 'moderation';
  if (safeType === 'dm' || safeSource.includes('dm') || safeSource.includes('chat')) return 'chat';
  return 'system';
}

function deriveNotificationActionUrl(item = {}) {
  const explicit = cleanStr(item?.data?.actionUrl || item?.actionUrl || '', 280);
  if (explicit) return explicit;
  const source = deriveNotificationSource(item);
  if (source.includes('invite')) return '/#social';
  if (source.includes('reward') || source.includes('promo') || source.includes('spin') || source.includes('activity_pass')) return '/#social';
  if (source.includes('chat') || source.includes('dm')) return '/#social';
  return '';
}

function shapeNotificationItem(item = {}, id = '') {
  const source = deriveNotificationSource(item);
  const type = normalizeNotificationType(item?.type || 'system');
  return {
    id: cleanStr(id || item?.id || '', 180),
    uid: cleanStr(item?.uid || '', 160),
    type,
    category: deriveNotificationCategory(source, type),
    source,
    title: cleanStr(item?.title || '', 140),
    body: cleanStr(item?.body || '', 600),
    read: !!item?.read,
    createdAt: safeNum(item?.createdAt || item?.timestamp?.toMillis?.() || item?.timestamp, 0),
    readAt: safeNum(item?.readAt, 0),
    actionUrl: deriveNotificationActionUrl(item),
    data: item?.data && typeof item.data === 'object' ? item.data : {}
  };
}

function buildNotificationDocId({ uid = '', type = 'system', title = '', body = '', idempotencyKey = '' } = {}) {
  const safeIdempotencyKey = cleanStr(idempotencyKey || '', 220);
  if (safeIdempotencyKey) return `idem_${safeIdempotencyKey}`;
  const digest = crypto.createHash('sha256').update(`${cleanStr(uid, 160)}|${normalizeNotificationType(type)}|${cleanStr(title, 140)}|${cleanStr(body, 600)}`).digest('hex');
  return `auto_${digest.slice(0, 48)}`;
}

async function createNotification({ uid = '', type = 'system', title = '', body = '', data = {}, read = false, idempotencyKey = '' } = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return null;
  const payload = {
    uid: safeUid,
    type: normalizeNotificationType(type),
    title: cleanStr(title, 140),
    body: cleanStr(body, 600),
    data: data && typeof data === 'object' ? data : {},
    source: deriveNotificationSource({ type, data }),
    read: !!read,
    createdAt: nowMs(),
    readAt: 0,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  const ref = colNotifications().doc(buildNotificationDocId({ uid: safeUid, type: payload.type, title: payload.title, body: payload.body, idempotencyKey }));
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { exists: true, data: snap.data() || {} };
    tx.set(ref, payload, { merge: false });
    return { exists: false, data: payload };
  });
  return shapeNotificationItem(result.data || payload, ref.id);
}

async function markNotificationsRead(uid = '', ids = []) {
  const safeUid = cleanStr(uid, 160);
  const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => cleanStr(id, 160)).filter(Boolean))).slice(0, 100);
  if (!safeUid || uniqueIds.length === 0) return 0;
  const batch = db.batch();
  let changed = 0;
  const readAt = nowMs();
  for (const id of uniqueIds) {
    const ref = colNotifications().doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    if (cleanStr(data.uid, 160) !== safeUid || data.read === true) continue;
    batch.set(ref, { read: true, readAt }, { merge: true });
    changed += 1;
  }
  if (changed > 0) await batch.commit();
  return changed;
}

async function markAllNotificationsRead(uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return 0;
  const snap = await colNotifications().where('uid', '==', safeUid).where('read', '==', false).limit(250).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  const readAt = nowMs();
  snap.docs.forEach((doc) => batch.set(doc.ref, { read: true, readAt }, { merge: true }));
  await batch.commit();
  return snap.size;
}

async function listNotifications(uid = '', limit = 30) {
  const safeUid = cleanStr(uid, 160);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(safeNum(limit, 30))));
  if (!safeUid) return [];

  const shapeAndSort = (snap) => snap.docs
    .map((doc) => shapeNotificationItem(doc.data() || {}, doc.id))
    .sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0))
    .slice(0, safeLimit);

  try {
    const snap = await colNotifications()
      .where('uid', '==', safeUid)
      .orderBy('createdAt', 'desc')
      .limit(safeLimit)
      .get();
    return snap.docs.map((doc) => shapeNotificationItem(doc.data() || {}, doc.id));
  } catch (error) {
    const message = String(error?.message || error || '');
    const code = String(error?.code || '');
    const indexMissing = code.includes('failed-precondition') || /index|requires an index|FAILED_PRECONDITION/i.test(message);
    if (!indexMissing) throw error;
    const fallbackSnap = await colNotifications()
      .where('uid', '==', safeUid)
      .limit(Math.max(safeLimit, 50))
      .get();
    return shapeAndSort(fallbackSnap);
  }
}

module.exports = {
  createNotification,
  markNotificationsRead,
  markAllNotificationsRead,
  listNotifications,
  normalizeNotificationType,
  buildNotificationDocId,
  shapeNotificationItem,
  deriveNotificationSource,
  deriveNotificationCategory,
  deriveNotificationActionUrl
};
