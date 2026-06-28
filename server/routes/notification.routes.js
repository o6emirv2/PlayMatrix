const express = require('express');
const { requireAuth, requireAdmin } = require('../core/security');
const { runtimeStore } = require('../core/runtimeStore');

const router = express.Router();
const now = () => Date.now();
const clean = (value, max = 2000) => String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').trim().slice(0, max);
const cleanMultiline = (value, max = 4000) => String(value || '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '')
  .trim()
  .slice(0, max);
const uidOf = (req) => String(req.user?.uid || '').trim();
const TTL_30_DAYS = 30 * 86400000;
const LIMIT = 20;

function normalizeNotification(row = {}, fallback = {}) {
  const id = clean(row.id || row.notificationId || fallback.id || `nt_${now()}_${Math.random().toString(36).slice(2)}`, 160);
  return {
    id,
    notificationId: id,
    type: clean(row.type || fallback.type || 'generic', 40),
    title: clean(row.title || fallback.title || 'Bildirim', 120),
    message: cleanMultiline(row.message || row.text || row.body || fallback.message || '', 4000),
    icon: clean(row.icon || fallback.icon || 'fa-bell', 60),
    at: Number(row.at || row.createdAt || row.updatedAt || fallback.at || now()) || now(),
    read: !!(row.read || row.readAt || fallback.read),
    source: clean(row.source || fallback.source || 'runtime', 80),
    severity: clean(row.severity || fallback.severity || 'info', 24),
    data: row.data && typeof row.data === 'object' ? row.data : (fallback.data || {})
  };
}

function listFromKey(key, limit = LIMIT) {
  return (runtimeStore.temporary.get(key) || [])
    .map((item) => normalizeNotification(item))
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, limit);
}

function writeList(key, rows) {
  runtimeStore.temporary.set(key, Array.isArray(rows) ? rows.slice(0, 80) : [], TTL_30_DAYS);
}

function runtimeBucket(uid) {
  const personal = listFromKey(`notify:personal:${uid}`);
  const system = listFromKey('notify:system');
  for (const value of runtimeStore.notifications.values()) {
    if (!value || typeof value !== 'object') continue;
    const target = clean(value.uid || value.userId || value.targetUid, 160);
    const item = normalizeNotification(value, { source: 'runtime' });
    if (target && target === uid) personal.push(item);
    if (!target && item.type === 'system') system.push(item);
  }
  const sortAndLimit = (arr) => arr.sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, LIMIT);
  const cleanPersonal = sortAndLimit(personal);
  const cleanSystem = sortAndLimit(system);
  const unreadPersonal = cleanPersonal.filter((item) => !item.read).length;
  const unreadSystem = cleanSystem.filter((item) => !item.read).length;
  return {
    ok: true,
    memoryOnly: true,
    personal: cleanPersonal,
    system: cleanSystem,
    items: sortAndLimit([...cleanPersonal, ...cleanSystem]),
    counts: {
      personal: cleanPersonal.length,
      system: cleanSystem.length,
      unreadPersonal,
      unreadSystem,
      unread: unreadPersonal + unreadSystem
    },
    unread: unreadPersonal + unreadSystem,
    summary: { total: cleanPersonal.length + cleanSystem.length, unread: unreadPersonal + unreadSystem }
  };
}

function keyForTab(uid, tab) {
  return tab === 'personal' ? `notify:personal:${uid}` : 'notify:system';
}

router.get('/notifications', requireAuth, (req, res) => res.json(runtimeBucket(uidOf(req))));
router.get('/notifications/memory', requireAuth, (req, res) => res.json(runtimeBucket(uidOf(req))));

router.post(['/notifications/read', '/notifications/memory/read'], requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const id = clean(req.body?.id || req.body?.notificationId || '', 160);
  if (!id) return res.status(400).json({ ok: false, error: 'NOTIFICATION_ID_REQUIRED' });
  const key = keyForTab(uid, tab);
  const current = runtimeStore.temporary.get(key) || [];
  const next = current.map((item) => String(item.id || item.notificationId || item.key || '') === id ? { ...item, read: true, readAt: now() } : item);
  writeList(key, next);
  res.json({ ok: true, notificationId: id, tab });
});

router.post(['/notifications/read-all', '/notifications/memory/read-all'], requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const key = keyForTab(uid, tab);
  const current = runtimeStore.temporary.get(key) || [];
  const next = current.map((item) => ({ ...item, read: true, readAt: now() }));
  writeList(key, next);
  res.json({ ok: true, count: next.length, tab });
});

router.post(['/notifications/delete', '/notifications/memory/delete'], requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const id = clean(req.body?.id || req.body?.notificationId || '', 160);
  if (!id) return res.status(400).json({ ok: false, error: 'NOTIFICATION_ID_REQUIRED' });
  const key = keyForTab(uid, tab);
  const current = runtimeStore.temporary.get(key) || [];
  const next = current.filter((item) => String(item.id || item.notificationId || item.key || '') !== id);
  writeList(key, next);
  res.json({ ok: true, deleted: current.length - next.length, tab });
});

router.post(['/notifications/delete-all', '/notifications/clear', '/notifications/memory/clear'], requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const key = keyForTab(uid, tab);
  const count = (runtimeStore.temporary.get(key) || []).length;
  writeList(key, []);
  res.json({ ok: true, cleared: true, count, tab });
});

router.post('/notifications/check', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const notificationId = clean(req.body?.notificationId || '', 160);
  const key = `notificationReceipt:${uid}:${notificationId}`;
  res.json({ ok: true, show: !runtimeStore.temporary.get(key), memoryOnly: true });
});

router.post('/notifications/ack', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const notificationId = clean(req.body?.notificationId || '', 160);
  if (!notificationId) return res.status(400).json({ ok: false, error: 'NOTIFICATION_ID_REQUIRED' });
  const key = `notificationReceipt:${uid}:${notificationId}`;
  runtimeStore.temporary.set(key, { uid, notificationId, type: clean(req.body?.type || 'generic', 40), shownAt: now() }, TTL_30_DAYS);
  res.json({ ok: true, memoryOnly: true });
});

router.post('/notifications/system', requireAuth, requireAdmin, (req, res) => {
  const explicitTitle = clean(req.body?.title || '', 100);
  const explicitMessage = cleanMultiline(req.body?.message || req.body?.text || '', 4000);
  if (!explicitTitle || !explicitMessage) return res.status(400).json({ ok: false, error: 'TITLE_AND_MESSAGE_REQUIRED' });
  const row = normalizeNotification({
    id: `sn_${now()}_${Math.random().toString(36).slice(2)}`,
    type: 'system',
    title: explicitTitle,
    message: explicitMessage,
    icon: clean(req.body?.icon || 'fa-bullhorn', 60),
    at: now()
  });
  const current = runtimeStore.temporary.get('notify:system') || [];
  writeList('notify:system', [row, ...current]);
  res.json({ ok: true, row });
});

module.exports = router;
