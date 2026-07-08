const { runtimeStore } = require('./runtimeStore');

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 60;

function safeText(value = '', max = 500) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').trim().slice(0, max);
}
function safeMultilineText(value = '', max = 4000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, max);
}

function pushRuntimeNotification(key = '', row = {}, options = {}) {
  const safeKey = safeText(key, 180);
  if (!safeKey) return [];
  const ttlMs = Math.max(60_000, Number(options.ttlMs || DEFAULT_TTL_MS) || DEFAULT_TTL_MS);
  const limit = Math.max(1, Math.min(250, Math.trunc(Number(options.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT)));
  const current = runtimeStore.temporary.get(safeKey) || [];
  const item = {
    ...row,
    id: safeText(row.id || `notify_${Date.now()}_${Math.random().toString(36).slice(2)}`, 160),
    title: safeText(row.title || 'Bildirim', 120),
    message: safeMultilineText(row.message || row.body || '', 4000),
    icon: safeText(row.icon || 'fa-bell', 80),
    type: safeText(row.type || 'system', 80),
    amount: Number(row.amount || 0) || 0,
    at: Number(row.at || Date.now()) || Date.now()
  };
  const next = [item, ...current].slice(0, limit);
  runtimeStore.temporary.set(safeKey, next, ttlMs);
  return next;
}

function listRuntimeNotifications(key = '', limit = DEFAULT_LIMIT) {
  return (runtimeStore.temporary.get(safeText(key, 180)) || []).slice(0, Math.max(1, Math.min(250, Number(limit || DEFAULT_LIMIT) || DEFAULT_LIMIT)));
}

module.exports = { pushRuntimeNotification, listRuntimeNotifications };
