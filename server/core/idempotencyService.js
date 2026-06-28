const { runtimeStore } = require('./runtimeStore');
async function runOnce({ key, db, collection = 'idempotency', ttlMs = 30 * 86400000, execute }) {
  if (!key) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  if (runtimeStore.temporary.get(`idem:${key}`)) return { ok: true, duplicate: true };
  if (db) {
    const ref = db.collection(collection).doc(String(key));
    const snap = await ref.get();
    if (snap.exists) return { ok: true, duplicate: true, stored: true };
    const result = execute ? await execute() : {};
    await ref.set({ key, createdAt: Date.now(), expiresAt: Date.now() + ttlMs, result: result || {} }, { merge: false });
    runtimeStore.temporary.set(`idem:${key}`, true, Math.min(ttlMs, 3600000));
    return { ok: true, duplicate: false, result };
  }
  const result = execute ? await execute() : {};
  runtimeStore.temporary.set(`idem:${key}`, true, ttlMs);
  return { ok: true, duplicate: false, result };
}
module.exports = { runOnce };
