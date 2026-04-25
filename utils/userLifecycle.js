'use strict';

const { db, auth, admin } = require('../config/firebase');
const { cleanStr, nowMs, safeNum } = require('./helpers');
const { createNotification } = require('./notifications');
const { revokeAllUserSessions } = require('./activity');

const colUsers = () => db.collection('users');
const colCleanupReports = () => db.collection('account_cleanup_reports');

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_WARN_AFTER_MS = Math.max(1 * DAY_MS, safeNum(process.env.INACTIVE_WARN_AFTER_MS, 23 * DAY_MS));
const INACTIVE_HARD_DELETE_AFTER_MS = Math.max(INACTIVE_WARN_AFTER_MS, safeNum(process.env.INACTIVE_HARD_DELETE_AFTER_MS, 30 * DAY_MS));

async function queryCollectionIds(collectionName, field, value, limit = 500, startAfterDoc = null) {
  let query = db.collection(collectionName).where(field, '==', value).limit(limit);
  if (startAfterDoc) query = query.startAfter(startAfterDoc);
  const snap = await query.get().catch(() => ({ docs: [], empty: true }));
  return snap.docs || [];
}

async function deleteCollectionDocsByField(collectionName, field, value, limit = 500) {
  let removed = 0;
  while (true) {
    const docs = await queryCollectionIds(collectionName, field, value, limit);
    if (!docs.length) break;
    const batch = db.batch();
    docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += docs.length;
    if (docs.length < limit) break;
  }
  return removed;
}

async function deleteCollectionDocsByArrayContains(collectionName, field, value, limit = 200) {
  let removed = 0;
  while (true) {
    const snap = await db.collection(collectionName).where(field, 'array-contains', value).limit(limit).get();
    if (!snap.docs.length) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.docs.length;
    if (snap.docs.length < limit) break;
  }
  return removed;
}

async function deleteCollectionGroupDocsByField(subcollectionName, field, value, limit = 200) {
  let removed = 0;
  while (true) {
    const snap = await db.collectionGroup(subcollectionName).where(field, '==', value).limit(limit).get();
    if (!snap.docs.length) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.docs.length;
    if (snap.docs.length < limit) break;
  }
  return removed;
}

async function scanCollection(collectionName, pageSize, visitor) {
  let lastDoc = null;
  while (true) {
    let query = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snap = await query.get();
    if (!snap.docs.length) break;
    for (const doc of snap.docs) {
      await visitor(doc);
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) break;
  }
}

async function deleteAllSubcollectionDocs(parentRef, subcollectionName, pageSize = 250) {
  let removed = 0;
  while (true) {
    const snap = await parentRef.collection(subcollectionName).limit(pageSize).get();
    if (!snap.docs.length) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.docs.length;
    if (snap.docs.length < pageSize) break;
  }
  return removed;
}

function roomContainsUid(data = {}, uid = '') {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return false;
  const players = Array.isArray(data.players) ? data.players : [];
  const participants = Array.isArray(data.participants) ? data.participants : [];
  const playerUids = players.map((player) => cleanStr(player?.uid || '', 160));
  const hostUid = cleanStr(data.host?.uid || '', 160);
  const guestUid = cleanStr(data.guest?.uid || '', 160);
  const ownerUid = cleanStr(data.ownerUid || data.uid || '', 160);
  return [hostUid, guestUid, ownerUid, ...playerUids, ...participants.map((item) => cleanStr(item || '', 160))].includes(safeUid);
}

function createCleanupTracker(uid = '', options = {}) {
  const report = {
    uid: cleanStr(uid, 160),
    trigger: cleanStr(options.trigger || 'system', 40) || 'system',
    reason: cleanStr(options.reason || 'inactive_cleanup', 64) || 'inactive_cleanup',
    initiatedBy: cleanStr(options.initiatedBy || 'system', 80) || 'system',
    startedAt: nowMs(),
    status: 'running',
    removed: 0,
    steps: [],
    errors: []
  };
  const ref = colCleanupReports().doc(`${report.uid || 'unknown'}_${report.startedAt}`);

  async function flush(extra = {}) {
    try {
      await ref.set({ ...report, ...extra }, { merge: true });
    } catch (_) {}
  }

  function addStep(name, removed = 0, meta = {}) {
    report.steps.push({
      name: cleanStr(name || 'step', 120),
      removed: safeNum(removed, 0),
      meta: meta && typeof meta === 'object' ? meta : {},
      at: nowMs()
    });
    report.removed += Math.max(0, safeNum(removed, 0));
  }

  function addError(step, error) {
    report.errors.push({
      step: cleanStr(step || 'unknown', 120),
      message: cleanStr(error?.message || error || 'unknown_error', 400),
      at: nowMs()
    });
  }

  return { ref, report, flush, addStep, addError };
}

async function deleteUserGraph(uid = '', options = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return { ok: false, removed: 0 };
  const tracker = createCleanupTracker(safeUid, options);
  await tracker.flush();

  try {
    try {
      await revokeAllUserSessions(safeUid);
      tracker.addStep('revoke_sessions', 0);
    } catch (error) {
      tracker.addError('revoke_sessions', error);
    }

    const userSnap = await colUsers().doc(safeUid).get().catch(() => null);
    const userData = userSnap?.exists ? (userSnap.data() || {}) : {};
    const username = cleanStr(userData.username || '', 40).toLowerCase();

    try {
      const batch = db.batch();
      let removed = 0;
      if (userSnap?.exists) { batch.delete(userSnap.ref); removed += 1; }
      if (username) { batch.delete(db.collection('usernames').doc(username)); removed += 1; }
      await batch.commit();
      tracker.addStep('delete_primary_docs', removed, { username });
    } catch (error) {
      tracker.addError('delete_primary_docs', error);
    }

    const directCollections = [
      ['match_history', 'winnerUid'], ['match_history', 'loserUid'], ['match_history', 'uid'],
      ['support_tickets', 'uid'], ['support_callback_requests', 'uid'], ['support_receipts', 'uid'],
      ['audit_logs', 'actorUid'], ['audit_logs', 'targetId'], ['reward_ledger', 'uid'],
      ['notifications', 'uid'], ['sessions', 'uid'], ['crash_bets', 'uid'], ['game_audit_logs', 'actorUid'], ['game_audit_logs', 'subjectUid'],
      ['promo_claims', 'uid'], ['referrals', 'uid'], ['referrals', 'referrerUid'], ['referrals', 'invitedUid'],
      ['presence', 'uid'], ['user_settings', 'uid'], ['server_logs', 'uid'], ['lobby_chat', 'uid'],
      ['game_invites', 'targetUid'], ['game_invites', 'hostUid'], ['matchmaking_queue', 'uid'],
      ['socket_connections', 'uid'], ['admins', 'uid'], ['ops_errors', 'uid']
    ];

    for (const [collectionName, field] of directCollections) {
      try {
        const removed = await deleteCollectionDocsByField(collectionName, field, safeUid);
        if (removed > 0) tracker.addStep(`delete:${collectionName}.${field}`, removed);
      } catch (error) {
        tracker.addError(`delete:${collectionName}.${field}`, error);
      }
    }

    try {
      const removed = await deleteCollectionDocsByArrayContains('chats', 'participants', safeUid, 200);
      if (removed > 0) tracker.addStep('delete:chats.participants', removed);
    } catch (error) {
      tracker.addError('delete:chats.participants', error);
    }

    try {
      const removedSender = await deleteCollectionGroupDocsByField('messages', 'sender', safeUid, 300);
      const removedSenderUid = await deleteCollectionGroupDocsByField('messages', 'senderUid', safeUid, 300);
      if (removedSender + removedSenderUid > 0) tracker.addStep('delete:messages.collection_group', removedSender + removedSenderUid);
    } catch (error) {
      tracker.addError('delete:messages.collection_group', error);
    }

    try {
      let removed = 0;
      await scanCollection('friends', 250, async (doc) => {
        const data = doc.data() || {};
        if ([data.requesterUid, data.recipientUid].includes(safeUid)) {
          await doc.ref.delete();
          removed += 1;
        }
      });
      if (removed > 0) tracker.addStep('scan:friends', removed);
    } catch (error) {
      tracker.addError('scan:friends', error);
    }

    try {
      let removed = 0;
      await scanCollection('users', 150, async (doc) => {
        const edgeRef = doc.ref.collection('social_edges').doc(safeUid);
        const edgeSnap = await edgeRef.get().catch(() => null);
        if (edgeSnap?.exists) {
          await edgeRef.delete();
          removed += 1;
        }
        if (doc.id === safeUid) {
          removed += await deleteAllSubcollectionDocs(doc.ref, 'social_edges', 250);
        }
      });
      if (removed > 0) tracker.addStep('scan:users.social_edges', removed);
    } catch (error) {
      tracker.addError('scan:users.social_edges', error);
    }

    try {
      let removed = 0;
      await scanCollection('chats', 150, async (chatDoc) => {
        const data = chatDoc.data() || {};
        const participants = Array.isArray(data.participants) ? data.participants : [];
        if (!participants.includes(safeUid)) return;
        removed += await deleteAllSubcollectionDocs(chatDoc.ref, 'messages', 300);
        await chatDoc.ref.delete();
        removed += 1;
      });
      if (removed > 0) tracker.addStep('scan:chats.messages', removed);
    } catch (error) {
      tracker.addError('scan:chats.messages', error);
    }

    try {
      let removed = 0;
      for (const collectionName of ['chess_rooms']) {
        await scanCollection(collectionName, 150, async (doc) => {
          if (!roomContainsUid(doc.data() || {}, safeUid)) return;
          await doc.ref.delete();
          removed += 1;
        });
      }
      if (removed > 0) tracker.addStep('scan:game_rooms', removed);
    } catch (error) {
      tracker.addError('scan:game_rooms', error);
    }

    try {
      await auth.deleteUser(safeUid);
      tracker.addStep('auth.delete_user', 1);
    } catch (error) {
      tracker.addError('auth.delete_user', error);
    }

    tracker.report.status = tracker.report.errors.length ? 'completed_with_warnings' : 'completed';
    tracker.report.finishedAt = nowMs();
    await tracker.flush();
    return { ok: true, removed: tracker.report.removed, reportId: tracker.ref.id, warnings: tracker.report.errors.length };
  } catch (error) {
    tracker.addError('fatal', error);
    tracker.report.status = 'failed';
    tracker.report.finishedAt = nowMs();
    await tracker.flush();
    return { ok: false, removed: tracker.report.removed, reportId: tracker.ref.id, warnings: tracker.report.errors.length, error: cleanStr(error?.message || error || 'cleanup_failed', 280) };
  }
}

async function warnInactiveUsersAndCleanup() {
  const now = nowMs();
  const warnCutoff = now - INACTIVE_WARN_AFTER_MS;
  const hardDeleteCutoff = now - INACTIVE_HARD_DELETE_AFTER_MS;

  const warnSnap = await colUsers().where('lastActiveAt', '<', warnCutoff).limit(100).get().catch(() => ({ docs: [] }));
  for (const doc of warnSnap.docs) {
    const data = doc.data() || {};
    if (safeNum(data.inactiveWarnedAt, 0) > 0 || safeNum(data.deletedAt, 0) > 0) continue;
    await Promise.allSettled([
      doc.ref.set({ inactiveWarnedAt: now }, { merge: true }),
      createNotification({
        uid: doc.id,
        type: 'account',
        title: 'Hesabın pasif görünüyor',
        body: '30 gün boyunca hiç aktif olmazsan hesap ve bağlı veriler tamamen kaldırılacak.',
        data: { policy: 'inactive_cleanup', step: 'warn', deleteAfterMs: INACTIVE_HARD_DELETE_AFTER_MS }
      })
    ]);
  }

  const hardSnap = await colUsers().where('lastActiveAt', '<', hardDeleteCutoff).limit(50).get().catch(() => ({ docs: [] }));
  for (const doc of hardSnap.docs) {
    await deleteUserGraph(doc.id, { trigger: 'cron', reason: 'inactive_cleanup', initiatedBy: 'system_cron' }).catch(() => null);
  }
}

module.exports = {
  deleteUserGraph,
  warnInactiveUsersAndCleanup,
  INACTIVE_WARN_AFTER_MS,
  INACTIVE_HARD_DELETE_AFTER_MS
};
