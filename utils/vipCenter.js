'use strict';

const { safeNum } = require('./helpers');
const { buildProgressionSnapshot } = require('./progression');
const {
  VIP_APPEARANCE_THEMES,
  VIP_NAMEPLATES,
  VIP_CHAT_STYLES,
  VIP_BANNER_PRESETS,
  VIP_PERK_MILESTONES,
  normalizeVipTier,
  filterUnlockedByTier,
  filterLockedByTier,
  getVipTierMeta,
  getVipNextTierMeta,
  formatVipLabel
} = require('../config/vip');

function sanitizeKey(value = '', fallback = '') {
  const safe = String(value || '').trim().toLowerCase();
  return safe || fallback;
}

function pickCatalogItem(items = [], key = '', fallbackKey = '') {
  const safeKey = sanitizeKey(key, fallbackKey);
  return items.find((item) => item.key === safeKey) || items.find((item) => item.key === fallbackKey) || items[0] || null;
}

function serializeCatalog(items = [], tier = 0, selectedKey = '') {
  const safeTier = normalizeVipTier(tier);
  return items.map((item) => ({
    ...item,
    unlocked: safeTier >= normalizeVipTier(item?.tierRequired || 0),
    selected: String(item?.key || '') === String(selectedKey || '')
  }));
}

function buildVipCenterSnapshot({ user = {}, progression = null, showcase = null } = {}) {
  const safeProgression = progression && typeof progression === 'object' ? progression : buildProgressionSnapshot(user);
  const vipProgress = safeProgression.vipProgress || {};
  const tier = normalizeVipTier(safeProgression.vipTier ?? safeProgression.vipLevel ?? vipProgress.tier ?? user.vipTier ?? 0);
  const currentTierMeta = getVipTierMeta(tier);
  const nextTierMeta = getVipNextTierMeta(tier);
  const safeShowcase = showcase && typeof showcase === 'object'
    ? showcase
    : {
        profileBanner: user.profileBanner || user.showcaseProfileBanner || '',
        vipTheme: user.vipTheme || 'obsidian',
        vipNameplate: user.vipNameplate || 'clean',
        vipBubble: user.vipBubble || 'default',
        vipBannerPreset: user.vipBannerPreset || 'none'
      };

  const selectedTheme = pickCatalogItem(VIP_APPEARANCE_THEMES, safeShowcase.vipTheme, 'obsidian');
  const selectedNameplate = pickCatalogItem(VIP_NAMEPLATES, safeShowcase.vipNameplate, 'clean');
  const selectedBubble = pickCatalogItem(VIP_CHAT_STYLES, safeShowcase.vipBubble, 'default');
  const selectedBannerPreset = pickCatalogItem(VIP_BANNER_PRESETS, safeShowcase.vipBannerPreset, 'none');

  const unlockedPerks = filterUnlockedByTier(VIP_PERK_MILESTONES, tier);
  const lockedPerks = filterLockedByTier(VIP_PERK_MILESTONES, tier);
  const nextUnlocks = lockedPerks.slice(0, 3);
  const spendPct = Math.max(0, Math.min(100, Number(vipProgress.spendProgressPct || 0)));
  const xpPct = Math.max(0, Math.min(100, Number(vipProgress.xpProgressPct || 0)));
  const combinedPct = Math.round((xpPct + spendPct) / 2);

  return {
    tier,
    label: safeProgression.vipLabel || formatVipLabel(tier),
    short: safeProgression.vipShort || currentTierMeta.short,
    band: safeProgression.vipBand || vipProgress.band || 1,
    currentTier: currentTierMeta,
    nextTier: nextTierMeta,
    progress: {
      vipPoints: safeNum(vipProgress.currentXp, 0),
      totalSpentMc: safeNum(vipProgress.currentSpend, 0),
      xpProgressPct: xpPct,
      spendProgressPct: spendPct,
      combinedPct,
      nextLabel: safeProgression.nextVipLabel || (nextTierMeta ? formatVipLabel(nextTierMeta.tier) : formatVipLabel(tier)),
      isMax: !nextTierMeta
    },
    appearance: {
      selectedTheme,
      selectedNameplate,
      selectedBubble,
      selectedBannerPreset,
      profileBannerUrl: String(safeShowcase.profileBanner || '').trim(),
      themes: serializeCatalog(VIP_APPEARANCE_THEMES, tier, selectedTheme?.key),
      nameplates: serializeCatalog(VIP_NAMEPLATES, tier, selectedNameplate?.key),
      bubbles: serializeCatalog(VIP_CHAT_STYLES, tier, selectedBubble?.key),
      banners: serializeCatalog(VIP_BANNER_PRESETS, tier, selectedBannerPreset?.key)
    },
    perks: {
      unlocked: unlockedPerks,
      locked: lockedPerks,
      nextUnlocks
    },
    overview: {
      activePerkCount: unlockedPerks.length,
      lockedPerkCount: lockedPerks.length,
      appearanceUnlockCount: [
        ...filterUnlockedByTier(VIP_APPEARANCE_THEMES, tier),
        ...filterUnlockedByTier(VIP_NAMEPLATES, tier),
        ...filterUnlockedByTier(VIP_CHAT_STYLES, tier),
        ...filterUnlockedByTier(VIP_BANNER_PRESETS, tier)
      ].length,
      readinessLabel: nextTierMeta ? `${formatVipLabel(nextTierMeta.tier)} için ilerleme sürüyor` : 'Maksimum VIP kademesi açık',
      spotlight: unlockedPerks[unlockedPerks.length - 1]?.label || 'Standart görünüm aktif'
    }
  };
}

function buildVipCatalog() {
  return {
    themes: VIP_APPEARANCE_THEMES,
    nameplates: VIP_NAMEPLATES,
    bubbles: VIP_CHAT_STYLES,
    banners: VIP_BANNER_PRESETS,
    perks: VIP_PERK_MILESTONES
  };
}

module.exports = {
  buildVipCenterSnapshot,
  buildVipCatalog
};
