const express = require('express');
const { requireAuth, requireAdmin } = require('../core/security');
const { requireAdminReauth, writeAdminAudit } = require('../core/adminReauthService');
const { listMarketItems, decorateMarketItemsForUser, upsertMarketItem, purchaseItem, equipItem, refundItem, getMarketStatus, setMarketStatus, ensureMarketEnabled } = require('../core/marketService');
const { runtimeStore } = require('../core/runtimeStore');
const router = express.Router();

function isEmailVerified(user = {}) {
  return !!(user.email_verified || user.emailVerified);
}

function requireVerifiedEmailForMarket(req, res, next) {
  if (isEmailVerified(req.user || {})) return next();
  return res.status(403).json({
    ok: false,
    error: 'EMAIL_VERIFICATION_REQUIRED',
    message: 'Market işlemleri için e-posta adresini doğrulaman gerekiyor.'
  });
}

function adminNotifyMode(req, fallback = 'none') {
  const raw = String(req.body?.notificationMode || fallback || 'none').trim().toLowerCase();
  if (['all', 'system', 'public'].includes(raw)) return 'all';
  if (['personal', 'user', 'target'].includes(raw)) return 'personal';
  return 'none';
}
function pushAdminNotice(key, row, limit = 160) {
  const list = runtimeStore.temporary.get(key) || [];
  runtimeStore.temporary.set(key, [row, ...list].slice(0, limit), 30 * 86400000);
  return row;
}
function cleanNoticeText(value, max = 2000) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, max); }
function dispatchMarketAdminNotification(req, { uid = '', systemTitle = '', systemMessage = '', personalTitle = '', personalMessage = '', icon = 'fa-store' } = {}) {
  const mode = adminNotifyMode(req, 'none');
  const at = Date.now();
  const sent = { mode, system: false, personal: false };
  if (mode === 'all') {
    pushAdminNotice('notify:system', { id: `market_sys_${at}_${Math.random().toString(36).slice(2)}`, type:'system', title:cleanNoticeText(systemTitle, 120), message:cleanNoticeText(systemMessage, 2000), icon, at, source:'admin-market', read:false });
    sent.system = true;
  }
  if ((mode === 'personal' || mode === 'all') && uid) {
    pushAdminNotice(`notify:personal:${uid}`, { id: `market_user_${at}_${Math.random().toString(36).slice(2)}`, type:'personal', title:cleanNoticeText(personalTitle || systemTitle, 120), message:cleanNoticeText(personalMessage || systemMessage, 2000), icon, at, source:'admin-market', read:false });
    sent.personal = true;
  }
  return sent;
}

router.get('/market/status', requireAuth, async (req, res) => {
  const status = await getMarketStatus();
  res.json({ ok: true, enabled: status.enabled !== false, status });
});
router.get('/market/items', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'private, max-age=3, stale-while-revalidate=15');
  const marketState = await ensureMarketEnabled();
  if (!marketState.ok) return res.status(503).json(marketState);
  const items = await decorateMarketItemsForUser((await listMarketItems()).filter((item) => item.active !== false && item.visible !== false), req.user.uid);
  res.json({ ok: true, enabled: true, items, ownedIds: items.filter((item) => item.owned).map((item) => item.id), equippedItemId: items.find((item) => item.equipped)?.id || '' });
});
router.post('/market/purchase', requireAuth, requireVerifiedEmailForMarket, async (req, res) => {
  const result = await purchaseItem({ uid: req.user.uid, itemId: req.body.itemId, idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey });
  res.status(result.ok ? 200 : result.error === 'MARKET_OFFLINE' ? 503 : 400).json(result);
});
router.post('/market/equip', requireAuth, requireVerifiedEmailForMarket, async (req, res) => {
  const result = await equipItem({ uid: req.user.uid, itemId: req.body.itemId });
  res.status(result.ok ? 200 : result.error === 'MARKET_OFFLINE' ? 503 : 400).json(result);
});
router.post('/admin/market/item', requireAuth, requireAdmin, requireAdminReauth, async (req, res) => {
  const result = await upsertMarketItem(req.body || {});
  try { await writeAdminAudit(req, 'market.item.upsert', { itemId: result?.item?.id || req.body?.id || req.body?.itemId || '' }); } catch (_) {}
  res.json(result);
});
router.get('/admin/market/status', requireAuth, requireAdmin, async (req, res) => {
  const status = await getMarketStatus();
  res.json({ ok: true, enabled: status.enabled !== false, status });
});
router.get('/admin/market/items', requireAuth, requireAdmin, async (req, res) => {
  const status = await getMarketStatus();
  const items = await listMarketItems({ includeHidden: true });
  res.json({ ok: true, enabled: status.enabled !== false, status, items });
});

router.post('/admin/market/items/bulk', requireAuth, requireAdmin, requireAdminReauth, async (req, res) => {
  const rows = Array.isArray(req.body?.items) ? req.body.items.slice(0, 40) : [];
  const saved = [];
  const failed = [];
  for (const row of rows) {
    try {
      const result = await upsertMarketItem({ ...(row || {}) });
      if (result?.ok === false) failed.push({ id: row?.id || '', error: result.error || 'SAVE_FAILED' });
      else saved.push(result.item || { id: row?.id || '' });
    } catch (error) {
      failed.push({ id: row?.id || '', error: error?.message || 'SAVE_FAILED' });
    }
  }
  res.status(failed.length ? 207 : 200).json({ ok: failed.length === 0, savedCount: saved.length, failedCount: failed.length, saved, failed });
});

router.post('/admin/market/status', requireAuth, requireAdmin, requireAdminReauth, async (req, res) => {
  const result = await setMarketStatus({ enabled: req.body?.enabled !== false, adminUid: req.user.uid });
  const notification = dispatchMarketAdminNotification(req, { systemTitle: req.body?.enabled !== false ? 'Market Açıldı' : 'Market Kapatıldı', systemMessage: req.body?.enabled !== false ? 'Market kullanıcılar için tekrar aktif edildi.' : 'Market geçici olarak çevrim dışı alındı.', icon: 'fa-store' });
  try { await writeAdminAudit(req, 'market.status.update', { enabled: req.body?.enabled !== false }); } catch (_) {}
  res.json({ ...result, notification });
});
router.post('/admin/market/refund', requireAuth, requireAdmin, requireAdminReauth, async (req, res) => {
  const result = await refundItem({ adminUid: req.user.uid, uid: req.body.uid, identifier: req.body.identifier, itemId: req.body.itemId, productName: req.body.productName || req.body.product || req.body.name, idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey });
  const notification = result.ok ? dispatchMarketAdminNotification(req, { uid: result.uid || req.body.uid, systemTitle: 'Market Ürün İadesi', systemMessage: 'Bir market ürün iadesi admin panelinden işlendi.', personalTitle: 'Market Ürün İadesi', personalMessage: 'Market ürün iaden admin panelinden tamamlandı.', icon: 'fa-rotate-left' }) : null;
  try { await writeAdminAudit(req, 'market.refund', { uid: result?.uid || req.body?.uid || '', itemId: req.body?.itemId || '' }); } catch (_) {}
  res.status(result.ok ? 200 : 400).json({ ...result, notification });
});
module.exports = router;
