const crypto = require('crypto');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');

const DEFAULT_BALANCE = 50000;
function clampAmount(value, { min = -1_000_000_000, max = 1_000_000_000 } = {}) {
  const n = Math.trunc(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
}
function localBalanceKey(uid) { return `balance:${uid}`; }
function getLocalBalance(uid) { return Math.max(0, Number(runtimeStore.temporary.get(localBalanceKey(uid)) ?? DEFAULT_BALANCE) || 0); }
function setLocalBalance(uid, next) { runtimeStore.temporary.set(localBalanceKey(uid), Math.max(0, Math.trunc(Number(next) || 0)), 30 * 86400000); }
async function readBalance(uid) {
  const { db } = initFirebaseAdmin();
  if (!db) return getLocalBalance(uid);
  const snap = await db.collection('users').doc(uid).get();
  return Math.max(0, Number((snap.exists ? snap.data().balance : DEFAULT_BALANCE) || 0));
}
async function mutateBalance({ uid, amount, reason = 'economy', idempotencyKey = '', metadata = {} }) {
  if (!uid) return { ok: false, error: 'UID_REQUIRED' };
  const safeAmount = clampAmount(amount);
  if (!safeAmount) return { ok: true, amount: 0, balance: await readBalance(uid), reason };
  const key = String(idempotencyKey || `${uid}:${reason}:${crypto.randomUUID()}`);
  const idemMemoryKey = `idem:economy:${key}`;
  if (runtimeStore.temporary.get(idemMemoryKey)) return { ok: true, duplicate: true, balance: await readBalance(uid) };
  const { db, admin } = initFirebaseAdmin();
  if (!db || !admin) {
    const current = getLocalBalance(uid);
    if (safeAmount < 0 && current + safeAmount < 0) return { ok: false, error: 'INSUFFICIENT_BALANCE', balance: current };
    const balance = current + safeAmount;
    setLocalBalance(uid, balance);
    runtimeStore.temporary.set(idemMemoryKey, true, 24 * 3600000);
    return { ok: true, firestore: false, uid, amount: safeAmount, balance, reason };
  }
  const idemRef = db.collection('idempotency').doc(key);
  const userRef = db.collection('users').doc(uid);
  let output = null;
  await db.runTransaction(async (tx) => {
    const idem = await tx.get(idemRef);
    if (idem.exists) { output = { ok: true, duplicate: true, ...(idem.data().result || {}) }; return; }
    const snap = await tx.get(userRef);
    const current = Math.max(0, Number((snap.exists ? snap.data().balance : DEFAULT_BALANCE) || 0));
    if (safeAmount < 0 && current + safeAmount < 0) throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { statusCode: 409, balance: current });
    const balance = Math.max(0, current + safeAmount);
    tx.set(userRef, { balance, updatedAt: Date.now() }, { merge: true });
    const auditId = `economy_${crypto.randomUUID()}`;
    const audit = { uid, amount: safeAmount, reason, balanceAfter: balance, metadata, at: Date.now() };
    tx.set(db.collection('audit').doc(auditId), audit, { merge: false });
    output = { ok: true, uid, amount: safeAmount, balance, reason, auditId };
    tx.set(idemRef, { key, type: 'economy', uid, createdAt: Date.now(), result: output }, { merge: false });
  });
  runtimeStore.temporary.set(idemMemoryKey, true, 3600000);
  return output || { ok: true, duplicate: true, balance: await readBalance(uid) };
}
async function debitBalance(opts) { return mutateBalance({ ...opts, amount: -Math.abs(clampAmount(opts.amount)) }); }
async function creditBalance(opts) { return mutateBalance({ ...opts, amount: Math.abs(clampAmount(opts.amount)) }); }
module.exports = { DEFAULT_BALANCE, readBalance, mutateBalance, debitBalance, creditBalance, clampAmount };
