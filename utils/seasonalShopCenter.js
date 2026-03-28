'use strict';

let firebaseCache = null;
const { buildSeasonalShop } = require('../config/seasonalShop');
const { buildProgressionSnapshot } = require('./progression');
const { cleanStr, nowMs, safeNum } = require('./helpers');
const { resolveInventorySlot, mapInventoryFieldForSlot } = require('./experienceCenter');
const { getSeasonCalendarParts } = require('./season');

const MAX_PURCHASE_HISTORY = 40;

function getFirebase() {
  if (!firebaseCache) firebaseCache = require('../config/firebase');
  return firebaseCache;
}

const colUsers = () => getFirebase().db.collection('users');

function normalizeInventoryKey(value = '') {
  return cleanStr(value || '', 80).toLowerCase();
}

function normalizePurchaseHistory(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      key: normalizeInventoryKey(item?.key || item?.itemKey || ''),
      label: cleanStr(item?.label || '', 80),
      category: cleanStr(item?.category || 'cosmetic', 32) || 'cosmetic',
      slot: cleanStr(item?.slot || '', 24),
      priceMc: Math.max(0, Math.floor(safeNum(item?.priceMc, 0))),
      icon: cleanStr(item?.icon || '🎁', 8) || '🎁',
      seasonKey: cleanStr(item?.seasonKey || '', 16),
      purchasedAt: safeNum(item?.purchasedAt || item?.createdAt, 0),
      vipOnly: item?.vipOnly === true
    }))
    .filter((item) => item.key)
    .sort((a, b) => (b.purchasedAt || 0) - (a.purchasedAt || 0))
    .slice(0, MAX_PURCHASE_HISTORY);
}

function getOwnedCosmeticKeys(user = {}) {
  const keys = new Set();
  const direct = Array.isArray(user?.cosmeticInventoryOwned) ? user.cosmeticInventoryOwned : [];
  direct.forEach((item) => {
    const key = normalizeInventoryKey(item);
    if (key) keys.add(key);
  });
  normalizePurchaseHistory(user?.cosmeticPurchaseHistory).forEach((item) => {
    if (item.key) keys.add(item.key);
  });
  [
    user?.vipTheme,
    user?.vipNameplate,
    user?.vipBubble,
    user?.vipBannerPreset,
    user?.vipHalo,
    user?.vipTableTheme
  ].forEach((item) => {
    const key = normalizeInventoryKey(item);
    if (key) keys.add(key);
  });
  return Array.from(keys);
}

function getEquippedCosmeticKeys(user = {}) {
  return [
    user?.vipTheme,
    user?.vipNameplate,
    user?.vipBubble,
    user?.vipBannerPreset,
    user?.vipHalo,
    user?.vipTableTheme
  ].map((item) => normalizeInventoryKey(item)).filter(Boolean);
}

async function notifySeasonalPurchase(payload = {}) {
  try {
    const { createNotification } = require('./notifications');
    return await createNotification(payload);
  } catch (_error) {
    return null;
  }
}

function hasVipShopAccess(user = {}) {
  const progression = buildProgressionSnapshot(user);
  if (safeNum(progression?.vipTier, 0) > 0) return true;
  if (user?.vipActive === true) return true;
  return safeNum(user?.vipExpiresAt, 0) > nowMs();
}

function buildSeasonalShopRuntime(options = {}) {
  const user = options.user && typeof options.user === 'object' ? options.user : {};
  const featureFlags = options.featureFlags && typeof options.featureFlags === 'object' ? options.featureFlags : {};
  const seasonKey = cleanStr(options.seasonKey || getSeasonCalendarParts().seasonKey, 16) || getSeasonCalendarParts().seasonKey;
  const ownedKeys = getOwnedCosmeticKeys(user);
  const equippedKeys = getEquippedCosmeticKeys(user);
  const base = buildSeasonalShop({ seasonKey, featureFlags, ownedKeys, equippedKeys });
  const balanceMc = Math.max(0, safeNum(user?.balance ?? user?.coins, 0));
  const vipAccess = hasVipShopAccess(user);
  const purchaseHistory = normalizePurchaseHistory(user?.cosmeticPurchaseHistory);

  const items = (Array.isArray(base.items) ? base.items : []).map((item) => {
    const key = normalizeInventoryKey(item.key);
    const slot = resolveInventorySlot(key);
    const owned = item.owned === true || ownedKeys.includes(key);
    const equipped = item.equipped === true || equippedKeys.includes(key);
    const vipLocked = item.vipOnly === true && !vipAccess;
    const affordable = balanceMc >= Math.max(0, safeNum(item.priceMc, 0));
    let status = 'available';
    if (owned) status = 'owned';
    else if (vipLocked) status = 'locked_vip';
    else if (!affordable) status = 'insufficient_funds';
    return {
      ...item,
      key,
      slot,
      owned,
      equipped,
      affordable,
      vipLocked,
      canPurchase: base.enabled && !owned && !vipLocked && affordable,
      canEquip: owned && !!mapInventoryFieldForSlot(slot),
      status,
      statusLabel: owned ? 'Sende Var' : vipLocked ? 'VIP Gerekli' : affordable ? 'Satın Alınabilir' : 'Bakiye Yetersiz'
    };
  });

  const affordableCount = items.filter((item) => item.canPurchase).length;
  const ownedCount = items.filter((item) => item.owned).length;
  const lockedCount = items.filter((item) => item.vipLocked).length;
  const featuredItems = items.filter((item) => item.featured).slice(0, 4);

  return {
    ...base,
    items,
    featuredItems,
    balanceMc,
    ownedCount,
    affordableCount,
    lockedCount,
    vipAccess,
    purchaseHistory,
    purchaseCount: purchaseHistory.length,
    summaryLabel: !base.enabled
      ? 'Sezonluk mağaza şu anda kapalı.'
      : ownedCount > 0
        ? `${ownedCount} mağaza ürünü envanterine işlendi`
        : `${items.length} sezonluk kozmetik hazır`
  };
}

async function purchaseSeasonalShopItem({ uid = '', itemKey = '', featureFlags = {} } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  const safeItemKey = normalizeInventoryKey(itemKey);
  if (!safeUid || !safeItemKey) throw new Error('Geçerli kullanıcı ve ürün gerekli.');

  const { db, admin } = getFirebase();
  const result = await db.runTransaction(async (tx) => {
    const userRef = colUsers().doc(safeUid);
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
    const user = snap.data() || {};
    const runtime = buildSeasonalShopRuntime({ user, featureFlags });
    if (runtime.enabled === false) throw new Error('Sezonluk mağaza şu anda kapalı.');
    const item = (runtime.items || []).find((entry) => entry.key === safeItemKey);
    if (!item) throw new Error('Ürün bulunamadı.');
    if (item.owned) throw new Error('Bu ürün zaten envanterinde var.');
    if (item.vipLocked) throw new Error('Bu ürün için aktif VIP erişimi gerekli.');
    if (!item.affordable) throw new Error('Bu ürün için yeterli MC bakiyesi yok.');

    const slot = cleanStr(item.slot || '', 24);
    const equipField = mapInventoryFieldForSlot(slot);
    const currentEquipped = normalizeInventoryKey(user?.[equipField] || '');
    const autoEquip = !!equipField && !currentEquipped;
    const purchaseEntry = {
      key: safeItemKey,
      label: cleanStr(item.label || safeItemKey, 80),
      category: cleanStr(item.category || 'cosmetic', 32) || 'cosmetic',
      slot,
      priceMc: Math.max(0, Math.floor(safeNum(item.priceMc, 0))),
      icon: cleanStr(item.icon || '🎁', 8) || '🎁',
      seasonKey: cleanStr(item.seasonKey || runtime.seasonKey, 16) || runtime.seasonKey,
      purchasedAt: nowMs(),
      vipOnly: item.vipOnly === true
    };
    const purchaseHistory = normalizePurchaseHistory([purchaseEntry, ...normalizePurchaseHistory(user?.cosmeticPurchaseHistory)]);
    const updatePayload = {
      balance: admin.firestore.FieldValue.increment(-purchaseEntry.priceMc),
      totalSpentMc: admin.firestore.FieldValue.increment(purchaseEntry.priceMc),
      cosmeticInventoryOwned: admin.firestore.FieldValue.arrayUnion(safeItemKey),
      cosmeticPurchaseHistory: purchaseHistory,
      updatedAt: nowMs()
    };
    if (autoEquip) updatePayload[equipField] = safeItemKey;
    tx.set(userRef, updatePayload, { merge: true });
    return {
      item: {
        ...purchaseEntry,
        status: 'owned',
        canEquip: !!equipField,
        autoEquipped: autoEquip
      },
      remainingBalance: Math.max(0, runtime.balanceMc - purchaseEntry.priceMc),
      equipped: autoEquip ? { slot, field: equipField, key: safeItemKey, label: purchaseEntry.label } : null,
      seasonKey: runtime.seasonKey
    };
  });

  await notifySeasonalPurchase({
    uid: safeUid,
    type: 'seasonal_shop',
    title: 'Sezonluk Mağaza Alımı',
    body: `${result.item.label} envanterine eklendi. ${result.item.priceMc.toLocaleString('tr-TR')} MC harcandı.`,
    data: { itemKey: result.item.key, seasonKey: result.seasonKey }
  });

  return result;
}

module.exports = {
  normalizePurchaseHistory,
  getOwnedCosmeticKeys,
  getEquippedCosmeticKeys,
  hasVipShopAccess,
  buildSeasonalShopRuntime,
  purchaseSeasonalShopItem
};
