const { runtimeStore } = require('./runtimeStore');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');

const TTL_30_DAYS = 30 * 86400000;
function safeUid(uid = '') { return String(uid || '').trim(); }
function clampRights(value = 0) { return Math.max(0, Math.min(100000, Math.trunc(Number(value || 0) || 0))); }
function normalizeRightsFromUser(data = {}) {
  return clampRights(
    Number(data.extraWheelRights || 0) +
    Number(data.wheelExtraRights || 0) +
    Number(data.wheelRights || 0) +
    Number(data.wheelBonusRights?.count || 0)
  );
}
function memoryKey(uid) { return `wheel:rights:${safeUid(uid)}`; }
async function getWheelRights(uid) {
  const id = safeUid(uid);
  if (!id) return 0;
  const { db } = initFirebaseAdmin();
  if (db) {
    const snap = await db.collection('users').doc(id).get().catch(() => null);
    if (snap?.exists) return normalizeRightsFromUser(snap.data() || {});
  }
  return clampRights(runtimeStore.temporary.get(memoryKey(id)) || 0);
}
async function grantWheelRights({ uid, count = 1, source = 'system', reason = '', code = '', actor = null } = {}) {
  const id = safeUid(uid);
  const add = clampRights(count);
  if (!id || !add) return { ok: false, error: 'INVALID_WHEEL_RIGHT_GRANT', count: 0, total: await getWheelRights(id) };
  const { db, admin } = initFirebaseAdmin();
  if (db && admin) {
    const userRef = db.collection('users').doc(id);
    let total = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists ? (snap.data() || {}) : {};
      total = normalizeRightsFromUser(data) + add;
      tx.set(userRef, {
        extraWheelRights: total,
        wheelExtraRights: 0,
        wheelRights: 0,
        wheelBonusRights: { count: 0, migratedAt: Date.now() },
        wheelRightsHistory: admin.firestore.FieldValue.arrayUnion({ type: 'grant', count: add, total, source: String(source || ''), reason: String(reason || '').slice(0, 160), code: String(code || '').slice(0, 80), actor, at: Date.now() }),
        updatedAt: Date.now()
      }, { merge: true });
    });
    return { ok: true, count: add, total, source };
  }
  const total = clampRights(runtimeStore.temporary.get(memoryKey(id)) || 0) + add;
  runtimeStore.temporary.set(memoryKey(id), total, TTL_30_DAYS);
  return { ok: true, count: add, total, source, memoryOnly: true };
}
async function consumeWheelRight({ uid, reason = 'wheel-spin-extra', claimKey = '' } = {}) {
  const id = safeUid(uid);
  if (!id) return { ok: false, error: 'INVALID_UID', consumed: false, remaining: 0 };
  const { db, admin } = initFirebaseAdmin();
  if (db && admin) {
    const userRef = db.collection('users').doc(id);
    let output = { ok: false, error: 'NO_EXTRA_WHEEL_RIGHTS', consumed: false, remaining: 0 };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists ? (snap.data() || {}) : {};
      const total = normalizeRightsFromUser(data);
      if (total <= 0) { output = { ok: false, error: 'NO_EXTRA_WHEEL_RIGHTS', consumed: false, remaining: 0 }; return; }
      const remaining = total - 1;
      output = { ok: true, consumed: true, remaining };
      tx.set(userRef, {
        extraWheelRights: remaining,
        wheelExtraRights: 0,
        wheelRights: 0,
        wheelBonusRights: { count: 0, migratedAt: Date.now() },
        wheelRightsHistory: admin.firestore.FieldValue.arrayUnion({ type: 'consume', count: 1, remaining, reason: String(reason || '').slice(0, 160), claimKey: String(claimKey || '').slice(0, 140), at: Date.now() }),
        updatedAt: Date.now()
      }, { merge: true });
    });
    return output;
  }
  const current = clampRights(runtimeStore.temporary.get(memoryKey(id)) || 0);
  if (current <= 0) return { ok: false, error: 'NO_EXTRA_WHEEL_RIGHTS', consumed: false, remaining: 0, memoryOnly: true };
  runtimeStore.temporary.set(memoryKey(id), current - 1, TTL_30_DAYS);
  return { ok: true, consumed: true, remaining: current - 1, memoryOnly: true };
}
module.exports = { getWheelRights, grantWheelRights, consumeWheelRight, normalizeRightsFromUser };
