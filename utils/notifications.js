'use strict';

const crypto = require('crypto');
const { db, admin } = require('../config/firebase');
const { cleanStr, nowMs, safeNum } = require('./helpers');

const colNotifications = () => db.collection('notifications');

function normalizeNotificationType(value = '') {
  const safe = cleanStr(value || 'system', 40).toLowerCase();
  return safe || 'system';
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
  return { id: ref.id, duplicated: !!result.exists, ...(result.data || payload) };
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
  const snap = await colNotifications().where('uid', '==', safeUid).orderBy('createdAt', 'desc').limit(safeLimit).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

module.exports = {
  createNotification,
  markNotificationsRead,
  markAllNotificationsRead,
  listNotifications,
  normalizeNotificationType,
  buildNotificationDocId
};
