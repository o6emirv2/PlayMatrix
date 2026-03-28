'use strict';

const { safeNum } = require('./helpers');
const { buildProgressionSnapshot } = require('./progression');
const {
  VIP_APPEARANCE_THEMES,
  VIP_NAMEPLATES,
  VIP_CHAT_STYLES,
  VIP_BANNER_PRESETS,
  VIP_AVATAR_HALOS,
  VIP_ENTRANCE_EFFECTS,
  VIP_PARTY_BANNER_PRESETS,
  VIP_EMOTE_PACKS,
  VIP_STICKER_PACKS,
  VIP_LOUNGE_BACKDROPS,
  VIP_SEASON_PASS_SKINS,
  VIP_PERK_MILESTONES,
  normalizeVipTier,
  filterUnlockedByTier,
  filterLockedByTier,
  getVipTierMeta,
  getVipNextTierMeta,
  formatVipLabel,
  getVipPrestigeScore
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

function buildMissionChain(tier = 0) {
  const safeTier = normalizeVipTier(tier);
  const enabled = safeTier >= 6;
  const stages = [
    { key: 'profile_mastery', label: 'Profil vitrini güçlendirme', tierRequired: 6 },
    { key: 'social_presence', label: 'Parti ve sosyal görünüm zinciri', tierRequired: 7 },
    { key: 'elite_tables', label: 'Özel masa / lobi hakimiyeti', tierRequired: 8 },
    { key: 'tournament_lane', label: 'Turnuva erişim şeridi', tierRequired: 9 }
  ].map((item) => ({ ...item, unlocked: safeTier >= normalizeVipTier(item.tierRequired || 0) }));
  return {
    enabled,
    statusLabel: enabled ? `${stages.filter((item) => item.unlocked).length}/${stages.length} görev şeridi açık` : 'VIP görev zinciri Silver 6 ile açılır',
    stages,
    spotlight: enabled ? (stages.find((item) => !item.unlocked)?.label || 'Tüm görev şeritleri açık') : 'Henüz kapalı'
  };
}

function buildExclusiveAccess(tier = 0, selections = {}) {
  const safeTier = normalizeVipTier(tier);
  return {
    tableAccess: safeTier >= 8,
    tournamentAccess: safeTier >= 9,
    queuePriority: safeTier >= 8,
    selectedLoungeBackdrop: selections.selectedLoungeBackdrop,
    selectedSeasonPassSkin: selections.selectedSeasonPassSkin,
    statusLabel: safeTier >= 9 ? 'Özel masa + turnuva erişimi açık' : safeTier >= 8 ? 'VIP masa / lobi erişimi açık' : 'Özel erişim ilerlemeyle açılır'
  };
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
        vipBannerPreset: user.vipBannerPreset || 'none',
        vipHalo: user.vipHalo || 'none',
        vipEntranceFx: user.vipEntranceFx || 'standard',
        vipPartyBanner: user.vipPartyBanner || 'none',
        vipEmotePack: user.vipEmotePack || 'standard',
        vipStickerPack: user.vipStickerPack || 'standard',
        vipLoungeBackdrop: user.vipLoungeBackdrop || 'standard',
        vipSeasonPassSkin: user.vipSeasonPassSkin || 'standard'
      };

  const selectedTheme = pickCatalogItem(VIP_APPEARANCE_THEMES, safeShowcase.vipTheme, 'obsidian');
  const selectedNameplate = pickCatalogItem(VIP_NAMEPLATES, safeShowcase.vipNameplate, 'clean');
  const selectedBubble = pickCatalogItem(VIP_CHAT_STYLES, safeShowcase.vipBubble, 'default');
  const selectedBannerPreset = pickCatalogItem(VIP_BANNER_PRESETS, safeShowcase.vipBannerPreset, 'none');
  const selectedHalo = pickCatalogItem(VIP_AVATAR_HALOS, safeShowcase.vipHalo, 'none');
  const selectedEntranceFx = pickCatalogItem(VIP_ENTRANCE_EFFECTS, safeShowcase.vipEntranceFx, 'standard');
  const selectedPartyBanner = pickCatalogItem(VIP_PARTY_BANNER_PRESETS, safeShowcase.vipPartyBanner, 'none');
  const selectedEmotePack = pickCatalogItem(VIP_EMOTE_PACKS, safeShowcase.vipEmotePack, 'standard');
  const selectedStickerPack = pickCatalogItem(VIP_STICKER_PACKS, safeShowcase.vipStickerPack, 'standard');
  const selectedLoungeBackdrop = pickCatalogItem(VIP_LOUNGE_BACKDROPS, safeShowcase.vipLoungeBackdrop, 'standard');
  const selectedSeasonPassSkin = pickCatalogItem(VIP_SEASON_PASS_SKINS, safeShowcase.vipSeasonPassSkin, 'standard');

  const unlockedPerks = filterUnlockedByTier(VIP_PERK_MILESTONES, tier);
  const lockedPerks = filterLockedByTier(VIP_PERK_MILESTONES, tier);
  const nextUnlocks = lockedPerks.slice(0, 3);
  const comfortPerks = unlockedPerks.filter((item) => ['service', 'profile', 'social'].includes(String(item?.category || '')));
  const experiencePerks = unlockedPerks.filter((item) => ['games', 'progression', 'appearance'].includes(String(item?.category || '')));
  const spendPct = Math.max(0, Math.min(100, Number(vipProgress.spendProgressPct || 0)));
  const xpPct = Math.max(0, Math.min(100, Number(vipProgress.xpProgressPct || 0)));
  const combinedPct = Math.round((xpPct + spendPct) / 2);
  const prestigeScore = getVipPrestigeScore(tier);
  const missionChain = buildMissionChain(tier);
  const exclusiveAccess = buildExclusiveAccess(tier, { selectedLoungeBackdrop, selectedSeasonPassSkin });

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
      selectedHalo,
      profileBannerUrl: String(safeShowcase.profileBanner || '').trim(),
      themes: serializeCatalog(VIP_APPEARANCE_THEMES, tier, selectedTheme?.key),
      nameplates: serializeCatalog(VIP_NAMEPLATES, tier, selectedNameplate?.key),
      bubbles: serializeCatalog(VIP_CHAT_STYLES, tier, selectedBubble?.key),
      banners: serializeCatalog(VIP_BANNER_PRESETS, tier, selectedBannerPreset?.key),
      halos: serializeCatalog(VIP_AVATAR_HALOS, tier, selectedHalo?.key)
    },
    identity: {
      selectedEntranceFx,
      selectedPartyBanner,
      selectedEmotePack,
      selectedStickerPack,
      selectedLoungeBackdrop,
      selectedSeasonPassSkin,
      entranceEffects: serializeCatalog(VIP_ENTRANCE_EFFECTS, tier, selectedEntranceFx?.key),
      partyBanners: serializeCatalog(VIP_PARTY_BANNER_PRESETS, tier, selectedPartyBanner?.key),
      emotePacks: serializeCatalog(VIP_EMOTE_PACKS, tier, selectedEmotePack?.key),
      stickerPacks: serializeCatalog(VIP_STICKER_PACKS, tier, selectedStickerPack?.key),
      loungeBackdrops: serializeCatalog(VIP_LOUNGE_BACKDROPS, tier, selectedLoungeBackdrop?.key),
      seasonPassSkins: serializeCatalog(VIP_SEASON_PASS_SKINS, tier, selectedSeasonPassSkin?.key)
    },
    perks: {
      unlocked: unlockedPerks,
      locked: lockedPerks,
      nextUnlocks,
      comfort: comfortPerks,
      experiences: experiencePerks
    },
    missions: missionChain,
    exclusiveAccess,
    overview: {
      activePerkCount: unlockedPerks.length,
      lockedPerkCount: lockedPerks.length,
      appearanceUnlockCount: [
        ...filterUnlockedByTier(VIP_APPEARANCE_THEMES, tier),
        ...filterUnlockedByTier(VIP_NAMEPLATES, tier),
        ...filterUnlockedByTier(VIP_CHAT_STYLES, tier),
        ...filterUnlockedByTier(VIP_BANNER_PRESETS, tier),
        ...filterUnlockedByTier(VIP_AVATAR_HALOS, tier)
      ].length,
      identityUnlockCount: [
        ...filterUnlockedByTier(VIP_ENTRANCE_EFFECTS, tier),
        ...filterUnlockedByTier(VIP_PARTY_BANNER_PRESETS, tier),
        ...filterUnlockedByTier(VIP_EMOTE_PACKS, tier),
        ...filterUnlockedByTier(VIP_STICKER_PACKS, tier),
        ...filterUnlockedByTier(VIP_LOUNGE_BACKDROPS, tier),
        ...filterUnlockedByTier(VIP_SEASON_PASS_SKINS, tier)
      ].length,
      comfortUnlockCount: comfortPerks.length,
      prestigeScore,
      readinessLabel: nextTierMeta ? `${formatVipLabel(nextTierMeta.tier)} için ilerleme sürüyor` : 'Maksimum VIP kademesi açık',
      spotlight: unlockedPerks[unlockedPerks.length - 1]?.label || 'Standart görünüm aktif',
      statusLabel: tier >= 8 ? 'VIP artık kozmetik + statü + konfor paketi olarak aktif' : 'VIP görünüm ve ayrıcalıklar kademeli açılıyor'
    }
  };
}

function buildVipCatalog() {
  return {
    themes: VIP_APPEARANCE_THEMES,
    nameplates: VIP_NAMEPLATES,
    bubbles: VIP_CHAT_STYLES,
    banners: VIP_BANNER_PRESETS,
    halos: VIP_AVATAR_HALOS,
    entranceEffects: VIP_ENTRANCE_EFFECTS,
    partyBanners: VIP_PARTY_BANNER_PRESETS,
    emotePacks: VIP_EMOTE_PACKS,
    stickerPacks: VIP_STICKER_PACKS,
    loungeBackdrops: VIP_LOUNGE_BACKDROPS,
    seasonPassSkins: VIP_SEASON_PASS_SKINS,
    perks: VIP_PERK_MILESTONES
  };
}

module.exports = {
  buildVipCenterSnapshot,
  buildVipCatalog
};
