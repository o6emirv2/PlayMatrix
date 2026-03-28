'use strict';

const express = require('express');
const router = express.Router();

const { verifyAuth } = require('../middlewares/auth.middleware');
const { safeNum } = require('../utils/helpers');
const { listNotifications, markAllNotificationsRead, markNotificationsRead } = require('../utils/notifications');

router.get('/notifications', verifyAuth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Math.floor(safeNum(req.query?.limit, 30))));
    const items = await listNotifications(req.user.uid, limit);
    const unread = items.reduce((sum, item) => sum + (item.read ? 0 : 1), 0);
    return res.json({ ok: true, items, unread });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Bildirimler yüklenemedi.' });
  }
});

router.post('/notifications/read', verifyAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const changed = await markNotificationsRead(req.user.uid, ids);
    return res.json({ ok: true, changed });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Bildirimler güncellenemedi.' });
  }
});

router.post('/notifications/read-all', verifyAuth, async (req, res) => {
  try {
    const changed = await markAllNotificationsRead(req.user.uid);
    return res.json({ ok: true, changed });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Bildirimler güncellenemedi.' });
  }
});

module.exports = router;
