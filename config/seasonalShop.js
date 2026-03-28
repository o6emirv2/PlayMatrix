'use strict';

const { getSeasonCalendarParts } = require('../utils/season');
const { cleanStr, safeNum } = require('../utils/helpers');

const BASE_SEASONAL_SHOP_ITEMS = Object.freeze([
  { key: 'vip_nameplate_obsidian', label: 'Obsidyen İsim Plakası', description: 'Profil ve liderlik görünümünde koyu premium isim plakası.', category: 'cosmetic', slot: 'nameplate', priceMc: 15000, icon: '🪪', vipOnly: false, order: 10 },
  { key: 'vip_banner_nova', label: 'Nova Profil Bannerı', description: 'Profil vitrini ve sosyal merkez için neon mor banner.', category: 'cosmetic', slot: 'banner', priceMc: 24000, icon: '🎴', vipOnly: true, order: 20 },
  { key: 'emote_pack_elite', label: 'Elite Emote Paketi', description: 'VIP lobiler için genişletilmiş emote paketi.', category: 'emote', slot: 'emote', priceMc: 18000, icon: '😎', vipOnly: true, order: 30 },
  { key: 'sticker_pack_lobby', label: 'Lobi Sticker Paketi', description: 'Sosyal merkez ve parti alanı için sticker seti.', category: 'sticker', slot: 'sticker', priceMc: 9000, icon: '💬', vipOnly: false, order: 40 },
  { key: 'halo_royal', label: 'Royal Halo Efekti', description: 'Avatar çevresinde kontrollü altın halo efekti.', category: 'cosmetic', slot: 'halo', priceMc: 32000, icon: '✨', vipOnly: true, order: 50 },
  { key: 'table_theme_gold', label: 'Gold Masa Teması', description: 'Kart ve masa yüzeylerinde premium altın vurgu.', category: 'table', slot: 'tableTheme', priceMc: 27000, icon: '🃏', vipOnly: false, order: 60 }
]);

function normalizeShopItem(item = {}, currentSeasonKey = '') {
  return {
    key: cleanStr(item.key || '', 80),
    label: cleanStr(item.label || '', 80) || 'Ürün',
    category: cleanStr(item.category || 'misc', 32) || 'misc',
    slot: cleanStr(item.slot || '', 24),
    description: cleanStr(item.description || '', 180),
    priceMc: Math.max(0, Math.floor(safeNum(item.priceMc, 0))),
    icon: cleanStr(item.icon || '🎁', 8) || '🎁',
    vipOnly: item.vipOnly === true,
    seasonKey: cleanStr(item.seasonKey || currentSeasonKey, 16) || currentSeasonKey,
    featured: item.featured === true,
    owned: item.owned === true,
    equipped: item.equipped === true,
    order: Math.max(0, Math.floor(safeNum(item.order, 0)))
  };
}

function buildSeasonalShop(options = {}) {
  const seasonKey = cleanStr(options.seasonKey || getSeasonCalendarParts().seasonKey, 16) || getSeasonCalendarParts().seasonKey;
  const featureFlags = options.featureFlags && typeof options.featureFlags === 'object' ? options.featureFlags : {};
  const shopEnabled = featureFlags.seasonalShop !== false;
  const ownedKeys = new Set(Array.isArray(options.ownedKeys) ? options.ownedKeys.map((item) => cleanStr(item || '', 80)).filter(Boolean) : []);
  const equippedKeys = new Set(Array.isArray(options.equippedKeys) ? options.equippedKeys.map((item) => cleanStr(item || '', 80)).filter(Boolean) : []);
  const items = BASE_SEASONAL_SHOP_ITEMS
    .map((item, index) => normalizeShopItem({ ...item, seasonKey, featured: index < 2, owned: ownedKeys.has(item.key), equipped: equippedKeys.has(item.key) }, seasonKey))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return {
    enabled: shopEnabled,
    seasonKey,
    currency: 'MC',
    itemCount: items.length,
    featuredCount: items.filter((item) => item.featured).length,
    items
  };
}

module.exports = {
  BASE_SEASONAL_SHOP_ITEMS,
  normalizeShopItem,
  buildSeasonalShop
};
