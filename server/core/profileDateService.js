'use strict';

const DEFAULT_TOUCH_THROTTLE_MS = 60_000;

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (value instanceof Date) return Math.max(0, value.getTime());
  if (typeof value?.toMillis === 'function') {
    try { return Math.max(0, Math.trunc(value.toMillis())); } catch (_) { return 0; }
  }
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return Math.max(0, Math.trunc(Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6));
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

async function ensureProfileDates({ uid = '', profile = {}, db = null, auth = null, touch = true, touchThrottleMs = DEFAULT_TOUCH_THROTTLE_MS } = {}) {
  const safeUid = String(uid || '').trim();
  const current = profile && typeof profile === 'object' ? { ...profile } : {};
  const now = Date.now();
  let createdAt = timestampMs(current.createdAt || current.registeredAt || current.signupAt);
  let lastActiveAt = timestampMs(current.lastActiveAt || current.lastSeen || current.lastLogin);

  if (safeUid && auth && (!createdAt || !lastActiveAt)) {
    const record = await auth.getUser(safeUid).catch(() => null);
    if (!createdAt) createdAt = timestampMs(record?.metadata?.creationTime);
    if (!lastActiveAt) lastActiveAt = timestampMs(record?.metadata?.lastSignInTime);
  }

  if (!createdAt) createdAt = now;
  if (!lastActiveAt) lastActiveAt = createdAt;
  if (touch && now - lastActiveAt >= Math.max(10_000, Number(touchThrottleMs) || DEFAULT_TOUCH_THROTTLE_MS)) lastActiveAt = now;

  const patch = {};
  if (timestampMs(current.createdAt) !== createdAt) patch.createdAt = createdAt;
  if (timestampMs(current.lastActiveAt) !== lastActiveAt) patch.lastActiveAt = lastActiveAt;
  if (timestampMs(current.lastSeen) !== lastActiveAt) patch.lastSeen = lastActiveAt;

  if (safeUid && db && Object.keys(patch).length) {
    await db.collection('users').doc(safeUid).set({ ...patch, updatedAt: now }, { merge: true }).catch(() => null);
  }
  return { ...current, ...patch, createdAt, lastActiveAt, lastSeen: lastActiveAt };
}

module.exports = { DEFAULT_TOUCH_THROTTLE_MS, timestampMs, ensureProfileDates };
