'use strict';

const VIP_TIER_DEFINITIONS = Object.freeze([
  { tier: 0, key: 'standard', name: 'Standart', short: 'STD', xpRequired: 0, spendRequired: 0 },
  { tier: 1, key: 'classic', name: 'Classic', short: 'CLS', xpRequired: 0, spendRequired: 0 },
  { tier: 2, key: 'amateur', name: 'Amateur', short: 'AMT', xpRequired: 1000, spendRequired: 5000 },
  { tier: 3, key: 'iron', name: 'Iron', short: 'IRN', xpRequired: 2500, spendRequired: 15000 },
  { tier: 4, key: 'bronze', name: 'Bronze', short: 'BRZ', xpRequired: 5000, spendRequired: 50000 },
  { tier: 5, key: 'silver', name: 'Silver', short: 'SLV', xpRequired: 10000, spendRequired: 100000 },
  { tier: 6, key: 'gold', name: 'Gold', short: 'GLD', xpRequired: 20000, spendRequired: 250000 },
  { tier: 7, key: 'platinum', name: 'Platinum', short: 'PLT', xpRequired: 35000, spendRequired: 500000 },
  { tier: 8, key: 'diamond', name: 'Diamond', short: 'DMD', xpRequired: 60000, spendRequired: 1000000 },
  { tier: 9, key: 'emerald', name: 'Emerald', short: 'EMR', xpRequired: 100000, spendRequired: 2000000 },
  { tier: 10, key: 'lord', name: 'Lord', short: 'LRD', xpRequired: 175000, spendRequired: 3500000 },
  { tier: 11, key: 'emperor', name: 'Emperor', short: 'EMP', xpRequired: 300000, spendRequired: 5000000 }
]);

const VIP_APPEARANCE_THEMES = Object.freeze([
  { key: 'obsidian', label: 'Obsidyen Pro', tierRequired: 0, accent: '#7c92ff', badge: 'Profesyonel' },
  { key: 'aurora', label: 'Aurora Neon', tierRequired: 4, accent: '#3dd9ff', badge: 'Canlı HUD' },
  { key: 'royal', label: 'Royal Gold', tierRequired: 6, accent: '#ffc761', badge: 'VIP Elite' },
  { key: 'nova', label: 'Nova Purple', tierRequired: 8, accent: '#c28bff', badge: 'Ultra Glow' }
]);

const VIP_NAMEPLATES = Object.freeze([
  { key: 'clean', label: 'Clean Plate', tierRequired: 0 },
  { key: 'signal', label: 'Signal Edge', tierRequired: 3 },
  { key: 'monarch', label: 'Monarch Gold', tierRequired: 6 },
  { key: 'crown', label: 'Crown Signature', tierRequired: 9 }
]);

const VIP_CHAT_STYLES = Object.freeze([
  { key: 'default', label: 'Standart Sohbet', tierRequired: 0 },
  { key: 'glass', label: 'Glass Bubble', tierRequired: 2 },
  { key: 'pulse', label: 'Pulse Bubble', tierRequired: 5 },
  { key: 'royal', label: 'Royal Bubble', tierRequired: 8 }
]);

const VIP_BANNER_PRESETS = Object.freeze([
  { key: 'none', label: 'Banner Yok', tierRequired: 0 },
  { key: 'mesh', label: 'Midnight Mesh', tierRequired: 1 },
  { key: 'arc', label: 'Aurora Arc', tierRequired: 5 },
  { key: 'halo', label: 'Diamond Halo', tierRequired: 8 }
]);

const VIP_AVATAR_HALOS = Object.freeze([
  { key: 'none', label: 'Halo Yok', tierRequired: 0, tone: 'neutral' },
  { key: 'soft', label: 'Soft Halo', tierRequired: 2, tone: 'cool' },
  { key: 'royal', label: 'Royal Halo', tierRequired: 6, tone: 'gold' },
  { key: 'diamond', label: 'Diamond Halo', tierRequired: 8, tone: 'ice' }
]);

const VIP_ENTRANCE_EFFECTS = Object.freeze([
  { key: 'standard', label: 'Standart Giriş', tierRequired: 0, intensity: 'minimal' },
  { key: 'pulse', label: 'Pulse Entry', tierRequired: 4, intensity: 'soft' },
  { key: 'royal_gate', label: 'Royal Gate', tierRequired: 7, intensity: 'premium' },
  { key: 'imperial', label: 'Imperial Arrival', tierRequired: 10, intensity: 'elite' }
]);

const VIP_PARTY_BANNER_PRESETS = Object.freeze([
  { key: 'none', label: 'Parti Banner Yok', tierRequired: 0 },
  { key: 'mesh_squad', label: 'Mesh Squad', tierRequired: 4 },
  { key: 'royal_squad', label: 'Royal Squad', tierRequired: 6 },
  { key: 'emperor_procession', label: 'Emperor Procession', tierRequired: 10 }
]);

const VIP_EMOTE_PACKS = Object.freeze([
  { key: 'standard', label: 'Standart Tepkiler', tierRequired: 0 },
  { key: 'elite_signals', label: 'Elite Signals', tierRequired: 5 },
  { key: 'royal_reactions', label: 'Royal Reactions', tierRequired: 8 }
]);

const VIP_STICKER_PACKS = Object.freeze([
  { key: 'standard', label: 'Standart Sticker', tierRequired: 0 },
  { key: 'lobby_icons', label: 'Lobby Icons', tierRequired: 4 },
  { key: 'diamond_marks', label: 'Diamond Marks', tierRequired: 7 }
]);

const VIP_LOUNGE_BACKDROPS = Object.freeze([
  { key: 'standard', label: 'Standart Lounge', tierRequired: 0 },
  { key: 'obsidian_lounge', label: 'Obsidyen Lounge', tierRequired: 5 },
  { key: 'royal_lounge', label: 'Royal Lounge', tierRequired: 8 }
]);

const VIP_SEASON_PASS_SKINS = Object.freeze([
  { key: 'standard', label: 'Standart Şerit', tierRequired: 0 },
  { key: 'elite_lane', label: 'Elite Lane', tierRequired: 7 },
  { key: 'emperor_lane', label: 'Emperor Lane', tierRequired: 10 }
]);

const VIP_PERK_MILESTONES = Object.freeze([
  { key: 'priority_support', label: 'Öncelikli destek kuyruğu', tierRequired: 1, category: 'service' },
  { key: 'advanced_profile', label: 'Gelişmiş profil vitrini', tierRequired: 2, category: 'profile' },
  { key: 'avatar_halo', label: 'Kontrollü avatar halo seçenekleri', tierRequired: 2, category: 'appearance' },
  { key: 'animated_nameplate', label: 'Animasyonlu isim plakası', tierRequired: 4, category: 'appearance' },
  { key: 'party_banner', label: 'Parti banner preseti ve takım vitrini', tierRequired: 4, category: 'social' },
  { key: 'chat_signature', label: 'VIP sohbet stili', tierRequired: 5, category: 'social' },
  { key: 'vip_emote_pack', label: 'VIP emote / sticker paketi', tierRequired: 5, category: 'social' },
  { key: 'table_skin', label: 'Özel masa / tahta temaları', tierRequired: 6, category: 'games' },
  { key: 'vip_missions', label: 'Özel görev zinciri', tierRequired: 6, category: 'progression' },
  { key: 'elite_showcase', label: 'Genişletilmiş vitrin alanı', tierRequired: 7, category: 'profile' },
  { key: 'vip_season_pass', label: 'VIP season pass şeridi', tierRequired: 7, category: 'progression' },
  { key: 'priority_matchmaking', label: 'Öncelikli eşleşme sırası', tierRequired: 8, category: 'games' },
  { key: 'vip_table_access', label: 'VIP özel masa / lobi arka planı', tierRequired: 8, category: 'games' },
  { key: 'vip_tournament_access', label: 'VIP özel turnuva / masa erişimi', tierRequired: 9, category: 'games' },
  { key: 'royal_presence', label: 'Giriş ve sonuç ekranı efekti', tierRequired: 10, category: 'appearance' }
]);

const VIP_MAX_TIER = VIP_TIER_DEFINITIONS[VIP_TIER_DEFINITIONS.length - 1].tier;
const VIP_DEFAULT_TIER = 0;

function normalizeVipTier(value = 0, fallback = VIP_DEFAULT_TIER) {
  const parsed = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : Number(fallback || 0);
  if (!Number.isFinite(parsed)) return VIP_DEFAULT_TIER;
  return Math.max(VIP_DEFAULT_TIER, Math.min(VIP_MAX_TIER, parsed));
}

function getVipTierMeta(tier = 0) {
  const safeTier = normalizeVipTier(tier);
  return VIP_TIER_DEFINITIONS.find((item) => item.tier === safeTier) || VIP_TIER_DEFINITIONS[0];
}

function getVipNextTierMeta(tier = 0) {
  const safeTier = normalizeVipTier(tier);
  return VIP_TIER_DEFINITIONS.find((item) => item.tier === safeTier + 1) || null;
}

function formatVipLabel(tier = 0) {
  const meta = getVipTierMeta(tier);
  return meta.tier > 0 ? `${meta.name} ${meta.tier}` : meta.name;
}

function getVipProgressWindow(tier = 0) {
  const current = getVipTierMeta(tier);
  const next = getVipNextTierMeta(tier);
  return {
    current,
    next,
    currentXpRequired: current.xpRequired,
    nextXpRequired: next ? next.xpRequired : current.xpRequired,
    currentSpendRequired: current.spendRequired,
    nextSpendRequired: next ? next.spendRequired : current.spendRequired
  };
}

function getVipDisplayBand(tier = 0) {
  const safeTier = normalizeVipTier(tier);
  if (safeTier >= 11) return 6;
  if (safeTier >= 9) return 5;
  if (safeTier >= 7) return 4;
  if (safeTier >= 5) return 3;
  if (safeTier >= 3) return 2;
  return 1;
}

function filterUnlockedByTier(items = [], tier = 0) {
  const safeTier = normalizeVipTier(tier);
  return items.filter((item) => safeTier >= normalizeVipTier(item?.tierRequired || 0));
}

function filterLockedByTier(items = [], tier = 0) {
  const safeTier = normalizeVipTier(tier);
  return items.filter((item) => safeTier < normalizeVipTier(item?.tierRequired || 0));
}

function getVipPrestigeScore(tier = 0) {
  const safeTier = normalizeVipTier(tier);
  return Math.max(0, (safeTier * 120) + (filterUnlockedByTier(VIP_PERK_MILESTONES, safeTier).length * 15));
}

module.exports = {
  VIP_TIER_DEFINITIONS,
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
  VIP_MAX_TIER,
  VIP_DEFAULT_TIER,
  normalizeVipTier,
  getVipTierMeta,
  getVipNextTierMeta,
  formatVipLabel,
  getVipProgressWindow,
  getVipDisplayBand,
  filterUnlockedByTier,
  filterLockedByTier,
  getVipPrestigeScore
};
