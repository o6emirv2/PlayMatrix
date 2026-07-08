const { runtimeStore } = require('./runtimeStore');
const SENSITIVE_KEYS = /password|token|secret|key|salt|hash|authorization|cookie/i;
function sanitize(value, depth = 0) {
  if (depth > 4) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 50).map(v => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? '[redacted]' : sanitize(v, depth + 1)]));
  }
  return value;
}
async function routeData({ classification = 'DISCARD', collection = 'events', key, payload = {}, db }) {
  const clean = sanitize(payload);
  if (classification === 'DISCARD') return { ok: true, route: 'discard' };
  if (classification === 'TEMPORARY') { runtimeStore.temporary.set(key || `${collection}:${Date.now()}:${Math.random()}`, clean); return { ok: true, route: 'memory' }; }
  if (classification === 'IMPORTANT') { console.log(`[important:${collection}]`, clean); return { ok: true, route: 'console' }; }
  if (classification === 'CRITICAL') {
    if (!db) { console.warn(`[critical:${collection}] Firestore unavailable`, clean); return { ok: true, route: 'console-fallback' }; }
    const ref = key ? db.collection(collection).doc(String(key)) : db.collection(collection).doc();
    await ref.set({ ...clean, updatedAt: Date.now() }, { merge: true });
    return { ok: true, route: 'firestore' };
  }
  return { ok: true, route: 'discard' };
}
module.exports = { routeData, sanitize };
