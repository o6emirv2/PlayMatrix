'use strict';

const { cleanStr, safeNum, nowMs } = require('./helpers');
const { getSeasonCalendarParts, getPreviousSeasonKey } = require('./season');
const { buildSeasonalShop } = require('../config/seasonalShop');
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
  VIP_SEASON_PASS_SKINS
} = require('../config/vip');
const { buildSpectatorModeCenter, buildReplayCenter, buildMatchSummaryShareCard, buildPostGameAnalytics } = require('./gameProductCenter');

const INVENTORY_SLOT_LABELS = Object.freeze({
  theme: 'Tema',
  nameplate: 'İsim Plakası',
  bubble: 'Sohbet Balonu',
  banner: 'Banner',
  halo: 'Halo',
  tableTheme: 'Masa Teması',
  emote: 'Emote Paketi',
  sticker: 'Sticker Paketi',
  partyBanner: 'Parti Banner',
  entranceFx: 'Giriş Efekti',
  loungeBackdrop: 'Lounge',
  seasonPassSkin: 'Season Pass',
  cosmetic: 'Kozmetik'
});

function bucketSeasonArchive(matchItems = [], rewardItems = [], maxSeasons = 4) {
  const currentSeasonKey = getSeasonCalendarParts().seasonKey;
  const keys = [currentSeasonKey];
  while (keys.length < Math.max(1, Math.min(6, maxSeasons))) keys.push(getPreviousSeasonKey(keys[keys.length - 1]));
  const archiveMap = new Map(keys.map((key) => [key, { seasonKey: key, matches: 0, rewardMc: 0, wins: 0, losses: 0, draws: 0, lastActivityAt: 0 }]));
  (Array.isArray(matchItems) ? matchItems : []).forEach((item) => {
    const createdAt = safeNum(item?.createdAt, 0);
    if (!createdAt) return;
    const seasonKey = getSeasonCalendarParts(new Date(createdAt)).seasonKey;
    if (!archiveMap.has(seasonKey)) return;
    const row = archiveMap.get(seasonKey);
    row.matches += 1;
    if (item?.outcome === 'win') row.wins += 1;
    else if (item?.outcome === 'loss') row.losses += 1;
    else if (item?.outcome === 'draw') row.draws += 1;
    row.lastActivityAt = Math.max(row.lastActivityAt, createdAt);
  });
  (Array.isArray(rewardItems) ? rewardItems : []).forEach((item) => {
    const createdAt = safeNum(item?.createdAt || item?.timestamp, 0);
    if (!createdAt) return;
    const seasonKey = getSeasonCalendarParts(new Date(createdAt)).seasonKey;
    if (!archiveMap.has(seasonKey)) return;
    const row = archiveMap.get(seasonKey);
    row.rewardMc += safeNum(item?.amount, 0);
    row.lastActivityAt = Math.max(row.lastActivityAt, createdAt);
  });
  return keys.map((key, index) => {
    const row = archiveMap.get(key) || { seasonKey: key, matches: 0, rewardMc: 0, wins: 0, losses: 0, draws: 0, lastActivityAt: 0 };
    const total = row.matches || 0;
    return { ...row, current: index === 0, winRatePct: total ? Math.round((row.wins / Math.max(1, total)) * 100) : 0, activityLabel: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : '' };
  });
}

function buildFavoriteGameStats(matchSummary = {}) {
  const byGame = matchSummary && typeof matchSummary.byGame === 'object' ? matchSummary.byGame : {};
  const rows = Object.entries(byGame).map(([key, value]) => {
    const matches = safeNum(value?.matches, 0);
    const wins = safeNum(value?.wins, 0);
    return { gameType: cleanStr(key || 'unknown', 24) || 'unknown', matches, wins, losses: safeNum(value?.losses, 0), draws: safeNum(value?.draws, 0), rewardMc: safeNum(value?.rewardMc, 0), winRatePct: matches ? Math.round((wins / Math.max(1, matches)) * 100) : 0 };
  }).sort((a, b) => (b.matches - a.matches) || (b.rewardMc - a.rewardMc));
  return { favoriteGame: rows[0]?.gameType || '', items: rows, summary: rows[0] || null };
}

function buildRewardHistory(rewardItems = []) {
  const items = (Array.isArray(rewardItems) ? rewardItems : []).map((item) => ({
    id: cleanStr(item?.id || '', 120), source: cleanStr(item?.source || '', 60), label: cleanStr(item?.label || item?.source || 'Ödül', 120), amount: safeNum(item?.amount, 0), currency: cleanStr(item?.currency || 'MC', 12) || 'MC', createdAt: safeNum(item?.createdAt || item?.timestamp, 0), referenceId: cleanStr(item?.referenceId || '', 160)
  }));
  const promoHistory = items.filter((item) => item.source === 'promo_code').slice(0, 12);
  return { total: items.length, items: items.slice(0, 24), promoHistory, lastRewardAt: items[0]?.createdAt || 0 };
}

function buildReferralFunnel(user = {}, rewardItems = []) {
  const inviterRewards = (Array.isArray(rewardItems) ? rewardItems : []).filter((item) => cleanStr(item?.source || '', 60) === 'referral_inviter');
  const inviteeRewards = (Array.isArray(rewardItems) ? rewardItems : []).filter((item) => cleanStr(item?.source || '', 60) === 'referral_invitee');
  return {
    referralCode: cleanStr(user?.referralCode || '', 32), referredBy: cleanStr(user?.referredBy || '', 160), referralCount: safeNum(user?.referralCount, inviterRewards.length), inviterRewardTotal: inviterRewards.reduce((sum, item) => sum + safeNum(item?.amount, 0), 0), inviteeRewardTotal: inviteeRewards.reduce((sum, item) => sum + safeNum(item?.amount, 0), 0), converted: safeNum(user?.referralCount, 0) > 0, claimedAt: safeNum(user?.referralClaimedAt, 0), summaryLabel: safeNum(user?.referralCount, 0) > 0 ? `${safeNum(user?.referralCount, 0)} aktif yönlendirme tamamlandı` : 'Henüz yönlendirme dönüşümü yok'
  };
}

function normalizeInventoryKey(value = '') { return cleanStr(value || '', 80).toLowerCase(); }
function collectUserOwnedInventoryKeys(user = {}) {
  const keys = new Set();
  (Array.isArray(user?.cosmeticInventoryOwned) ? user.cosmeticInventoryOwned : []).forEach((item) => { const key = normalizeInventoryKey(item); if (key) keys.add(key); });
  (Array.isArray(user?.cosmeticPurchaseHistory) ? user.cosmeticPurchaseHistory : []).forEach((item) => { const key = normalizeInventoryKey(item?.key || item?.itemKey || ''); if (key) keys.add(key); });
  return Array.from(keys);
}
function resolveInventorySlot(itemKey = '') {
  const safeKey = normalizeInventoryKey(itemKey);
  if (!safeKey) return '';
  if (VIP_APPEARANCE_THEMES.some((item) => item.key === safeKey)) return 'theme';
  if (VIP_NAMEPLATES.some((item) => item.key === safeKey)) return 'nameplate';
  if (VIP_CHAT_STYLES.some((item) => item.key === safeKey)) return 'bubble';
  if (VIP_BANNER_PRESETS.some((item) => item.key === safeKey)) return 'banner';
  if (VIP_AVATAR_HALOS.some((item) => item.key === safeKey)) return 'halo';
  if (VIP_ENTRANCE_EFFECTS.some((item) => item.key === safeKey)) return 'entranceFx';
  if (VIP_PARTY_BANNER_PRESETS.some((item) => item.key === safeKey)) return 'partyBanner';
  if (VIP_EMOTE_PACKS.some((item) => item.key === safeKey)) return 'emote';
  if (VIP_STICKER_PACKS.some((item) => item.key === safeKey)) return 'sticker';
  if (VIP_LOUNGE_BACKDROPS.some((item) => item.key === safeKey)) return 'loungeBackdrop';
  if (VIP_SEASON_PASS_SKINS.some((item) => item.key === safeKey)) return 'seasonPassSkin';
  if (safeKey.startsWith('vip_nameplate_')) return 'nameplate';
  if (safeKey.startsWith('vip_banner_')) return 'banner';
  if (safeKey.startsWith('halo_')) return 'halo';
  if (safeKey.startsWith('table_theme_')) return 'tableTheme';
  if (safeKey.startsWith('party_banner_')) return 'partyBanner';
  if (safeKey.startsWith('entrance_')) return 'entranceFx';
  if (safeKey.startsWith('lounge_')) return 'loungeBackdrop';
  if (safeKey.startsWith('season_pass_')) return 'seasonPassSkin';
  if (safeKey.startsWith('emote_')) return 'emote';
  if (safeKey.startsWith('sticker_')) return 'sticker';
  return 'cosmetic';
}
function mapInventoryFieldForSlot(slot = '') {
  const safeSlot = cleanStr(slot || '', 24);
  if (safeSlot === 'theme') return 'vipTheme';
  if (safeSlot === 'nameplate') return 'vipNameplate';
  if (safeSlot === 'bubble') return 'vipBubble';
  if (safeSlot === 'banner') return 'vipBannerPreset';
  if (safeSlot === 'halo') return 'vipHalo';
  if (safeSlot === 'tableTheme') return 'vipTableTheme';
  if (safeSlot === 'partyBanner') return 'vipPartyBanner';
  if (safeSlot === 'entranceFx') return 'vipEntranceFx';
  if (safeSlot === 'loungeBackdrop') return 'vipLoungeBackdrop';
  if (safeSlot === 'seasonPassSkin') return 'vipSeasonPassSkin';
  if (safeSlot === 'emote') return 'vipEmotePack';
  if (safeSlot === 'sticker') return 'vipStickerPack';
  return '';
}
function collectUnlockedAppearanceEntries(vipCenter = {}) {
  const groups = [
    ['theme', 'Tema', Array.isArray(vipCenter?.appearance?.themes) ? vipCenter.appearance.themes : [], 'appearance'],
    ['nameplate', 'İsim Plakası', Array.isArray(vipCenter?.appearance?.nameplates) ? vipCenter.appearance.nameplates : [], 'appearance'],
    ['bubble', 'Sohbet Balonu', Array.isArray(vipCenter?.appearance?.bubbles) ? vipCenter.appearance.bubbles : [], 'chat'],
    ['banner', 'Banner', Array.isArray(vipCenter?.appearance?.banners) ? vipCenter.appearance.banners : [], 'appearance'],
    ['halo', 'Halo', Array.isArray(vipCenter?.appearance?.halos) ? vipCenter.appearance.halos : [], 'appearance'],
    ['entranceFx', 'Giriş Efekti', Array.isArray(vipCenter?.identity?.entranceEffects) ? vipCenter.identity.entranceEffects : [], 'identity'],
    ['partyBanner', 'Parti Banner', Array.isArray(vipCenter?.identity?.partyBanners) ? vipCenter.identity.partyBanners : [], 'social'],
    ['emote', 'Emote Paketi', Array.isArray(vipCenter?.identity?.emotePacks) ? vipCenter.identity.emotePacks : [], 'social'],
    ['sticker', 'Sticker Paketi', Array.isArray(vipCenter?.identity?.stickerPacks) ? vipCenter.identity.stickerPacks : [], 'social'],
    ['loungeBackdrop', 'Lounge', Array.isArray(vipCenter?.identity?.loungeBackdrops) ? vipCenter.identity.loungeBackdrops : [], 'appearance'],
    ['seasonPassSkin', 'Season Pass', Array.isArray(vipCenter?.identity?.seasonPassSkins) ? vipCenter.identity.seasonPassSkins : [], 'progression']
  ];
  const items = [];
  groups.forEach(([slot, slotLabel, rows, category]) => rows.filter((row) => row?.unlocked).forEach((row) => items.push({ key: normalizeInventoryKey(row?.key || ''), label: cleanStr(row?.label || row?.key || slotLabel, 80), slot, slotLabel, category, source: 'vip_catalog', owned: true, equipped: row?.selected === true, vipOnly: safeNum(row?.tierRequired, 0) > 0, priceMc: 0, icon: row?.badge ? '⭐' : slot === 'emote' ? '😎' : slot === 'sticker' ? '💬' : slot === 'partyBanner' ? '🎴' : slot === 'entranceFx' ? '✨' : slot === 'seasonPassSkin' ? '🎫' : '🎨' })));
  return items;
}

function buildCosmeticInventory(user = {}, vipCenter = {}, featureFlags = {}) {
  const selected = { theme: cleanStr(user?.vipTheme || vipCenter?.appearance?.selectedTheme?.key || '', 24), nameplate: cleanStr(user?.vipNameplate || vipCenter?.appearance?.selectedNameplate?.key || '', 24), bubble: cleanStr(user?.vipBubble || vipCenter?.appearance?.selectedBubble?.key || '', 24), banner: cleanStr(user?.vipBannerPreset || vipCenter?.appearance?.selectedBannerPreset?.key || '', 24), halo: cleanStr(user?.vipHalo || vipCenter?.appearance?.selectedHalo?.key || '', 24), tableTheme: cleanStr(user?.vipTableTheme || '', 24), partyBanner: cleanStr(user?.vipPartyBanner || vipCenter?.identity?.selectedPartyBanner?.key || '', 24), entranceFx: cleanStr(user?.vipEntranceFx || vipCenter?.identity?.selectedEntranceFx?.key || '', 24), loungeBackdrop: cleanStr(user?.vipLoungeBackdrop || vipCenter?.identity?.selectedLoungeBackdrop?.key || '', 24), seasonPassSkin: cleanStr(user?.vipSeasonPassSkin || vipCenter?.identity?.selectedSeasonPassSkin?.key || '', 24), emote: cleanStr(user?.vipEmotePack || vipCenter?.identity?.selectedEmotePack?.key || '', 24), sticker: cleanStr(user?.vipStickerPack || vipCenter?.identity?.selectedStickerPack?.key || '', 24) };
  const unlockedAppearanceEntries = collectUnlockedAppearanceEntries(vipCenter);
  const explicitOwnedKeys = collectUserOwnedInventoryKeys(user);
  const ownedKeys = new Set(Object.values(selected).filter(Boolean).map((item) => normalizeInventoryKey(item)));
  explicitOwnedKeys.forEach((item) => ownedKeys.add(normalizeInventoryKey(item)));
  unlockedAppearanceEntries.forEach((item) => ownedKeys.add(normalizeInventoryKey(item.key)));
  const shop = buildSeasonalShop({ seasonKey: getSeasonCalendarParts().seasonKey, featureFlags, ownedKeys: Array.from(ownedKeys), equippedKeys: Object.values(selected).filter(Boolean) });
  const ownedItemsMap = new Map();
  unlockedAppearanceEntries.forEach((item) => {
    const key = normalizeInventoryKey(item.key); if (!key) return;
    ownedItemsMap.set(key, { key, label: item.label, slot: item.slot, slotLabel: item.slotLabel, category: item.category, source: item.source, owned: true, equipped: item.equipped, vipOnly: item.vipOnly, priceMc: item.priceMc, icon: item.icon, equippable: ['theme', 'nameplate', 'bubble', 'banner', 'halo', 'partyBanner', 'entranceFx', 'loungeBackdrop', 'seasonPassSkin', 'emote', 'sticker'].includes(item.slot) });
  });
  (Array.isArray(shop.items) ? shop.items : []).forEach((item) => {
    const key = normalizeInventoryKey(item.key); const slot = resolveInventorySlot(item.key); const existing = ownedItemsMap.get(key);
    const next = { key, label: cleanStr(item.label || item.key, 80), slot, slotLabel: INVENTORY_SLOT_LABELS[slot] || 'Kozmetik', category: cleanStr(item.category || 'misc', 32), source: 'seasonal_shop', owned: item.owned === true || ownedKeys.has(key), equipped: item.equipped === true || normalizeInventoryKey(selected[slot] || '') === key, vipOnly: item.vipOnly === true, priceMc: safeNum(item.priceMc, 0), icon: cleanStr(item.icon || '🎁', 8) || '🎁', equippable: ['theme', 'nameplate', 'bubble', 'banner', 'halo', 'tableTheme', 'partyBanner', 'entranceFx', 'loungeBackdrop', 'seasonPassSkin', 'emote', 'sticker'].includes(slot) };
    ownedItemsMap.set(key, existing ? { ...existing, ...next, owned: existing.owned || next.owned, equipped: existing.equipped || next.equipped } : next);
  });
  Object.entries(selected).forEach(([slot, keyValue]) => {
    const key = normalizeInventoryKey(keyValue); if (!key) return; const existing = ownedItemsMap.get(key) || {};
    ownedItemsMap.set(key, { ...existing, key, label: existing.label || key, slot, slotLabel: INVENTORY_SLOT_LABELS[slot] || slot, category: existing.category || 'appearance', source: existing.source || 'selected', owned: true, equipped: true, priceMc: safeNum(existing.priceMc, 0), icon: existing.icon || '✨', equippable: ['theme', 'nameplate', 'bubble', 'banner', 'halo', 'tableTheme', 'partyBanner', 'entranceFx', 'loungeBackdrop', 'seasonPassSkin', 'emote', 'sticker'].includes(slot) });
  });
  const ownedItems = Array.from(ownedItemsMap.values()).filter((item) => item.owned).sort((a,b)=>Number(!!b.equipped)-Number(!!a.equipped)||a.slotLabel.localeCompare(b.slotLabel,'tr')||a.label.localeCompare(b.label,'tr'));
  const byCategoryMap = new Map();
  ownedItems.forEach((item)=>{ const key=cleanStr(item.category||'misc',32)||'misc'; const current=byCategoryMap.get(key)||{category:key,count:0}; current.count+=1; byCategoryMap.set(key,current); });
  const slotItems = ['theme','nameplate','bubble','banner','halo','tableTheme','partyBanner','entranceFx','loungeBackdrop','seasonPassSkin','emote','sticker'].map((slot)=>({ slot, slotLabel: INVENTORY_SLOT_LABELS[slot] || slot, field: mapInventoryFieldForSlot(slot), equippedKey: normalizeInventoryKey(selected[slot]||''), equippedLabel: ownedItems.find((item)=>item.slot===slot&&item.equipped)?.label || '', ownedCount: ownedItems.filter((item)=>item.slot===slot).length, items: ownedItems.filter((item)=>item.slot===slot).slice(0,8) })).filter((item)=>item.ownedCount > 0 || item.equippedKey);
  return { ownedCount: ownedItems.length, equippedCount: ownedItems.filter((item)=>item.equipped).length, equipped: selected, ownedKeys: ownedItems.map((item)=>item.key), items: ownedItems, categories: Array.from(byCategoryMap.values()).sort((a,b)=>b.count-a.count), slots: slotItems, seasonalShop: shop, summaryLabel: ownedItems.length ? `${ownedItems.length} görünüm / kozmetik kaydı hazır` : 'Henüz envanter öğesi yok' };
}
function buildProfileHub(options = {}) {
  const user = options.user || {}; const matchPage = options.matchPage || { items: [] }; const matchSummary = options.matchSummary || {}; const rewardPage = options.rewardPage || { items: [] }; const rewardSummary = options.rewardSummary || {}; const achievements = options.achievements || { items: [], summary: {} };
  const customTitle = cleanStr(user?.customTitle || user?.showcaseTitle || '', 40);
  const favoriteGameStats = buildFavoriteGameStats(matchSummary);
  const rewardHistory = buildRewardHistory(rewardPage.items || []);
  const seasonArchive = bucketSeasonArchive(matchPage.items || [], rewardPage.items || [], 4);
  const topSeason = [...seasonArchive].sort((a,b)=>(b.rewardMc-a.rewardMc)||(b.matches-a.matches))[0] || null;
  const showcase = { customTitle, profileBanner: cleanStr(user?.profileBanner || '', 220), favoriteGame: cleanStr(user?.favoriteGame || favoriteGameStats.favoriteGame || '', 24), selectedBadge: cleanStr(user?.selectedBadge || '', 32), vipTheme: cleanStr(user?.vipTheme || '', 24), vipNameplate: cleanStr(user?.vipNameplate || '', 24), vipHalo: cleanStr(user?.vipHalo || '', 24), vipEntranceFx: cleanStr(user?.vipEntranceFx || '', 24), vipPartyBanner: cleanStr(user?.vipPartyBanner || '', 24), vipEmotePack: cleanStr(user?.vipEmotePack || '', 24), vipStickerPack: cleanStr(user?.vipStickerPack || '', 24), vipLoungeBackdrop: cleanStr(user?.vipLoungeBackdrop || '', 24), vipSeasonPassSkin: cleanStr(user?.vipSeasonPassSkin || '', 24) };
  const recentAchievements = (Array.isArray(achievements?.items) ? achievements.items : []).slice().sort((a,b)=>Number(!!b.unlocked)-Number(!!a.unlocked)||(b.progressPct||0)-(a.progressPct||0)).slice(0,4);
  return { generatedAt: nowMs(), customTitle, showcase, seasonArchive, seasonHighlights: { current: seasonArchive.find((item)=>item.current) || null, best: topSeason, totalTrackedSeasons: seasonArchive.length }, rewardHistory, achievementShowcase: { total: safeNum(achievements?.summary?.total,0), unlocked: safeNum(achievements?.summary?.unlocked,0), items: Array.isArray(achievements?.items)?achievements.items.slice(0,8):[], spotlight: recentAchievements }, favoriteGameStats, summary: { totalMatches: safeNum(matchSummary?.totalMatches,0), totalRewardMc: safeNum(rewardSummary?.totalMc || rewardSummary?.totalRewardMc,0), favoriteGame: favoriteGameStats.favoriteGame || '', completionPct: safeNum(achievements?.summary?.completionPct,0) } };
}
function buildEconomyHub(options = {}) {
  const user = options.user || {}; const rewardPage = options.rewardPage || { items: [] }; const rewardSummary = options.rewardSummary || {}; const vipCenter = options.vipCenter || {}; const featureFlags = options.featureFlags || {}; const rewardCatalog = Array.isArray(options.rewardCatalog) ? options.rewardCatalog : [];
  const rewardHistory = buildRewardHistory(rewardPage.items || []); const referralFunnel = buildReferralFunnel(user, rewardPage.items || []); const cosmeticInventory = buildCosmeticInventory(user, vipCenter, featureFlags); const seasonalShop = buildSeasonalShop({ seasonKey: getSeasonCalendarParts().seasonKey, featureFlags, ownedKeys: cosmeticInventory.ownedKeys, equippedKeys: Object.values(cosmeticInventory.equipped).filter(Boolean) }); const topSources = (Array.isArray(rewardSummary?.bySource) ? rewardSummary.bySource : []).slice(0,5);
  return { generatedAt: nowMs(), rewardLedger: { totalMc: safeNum(rewardSummary?.totalMc,0), itemCount: safeNum(rewardSummary?.itemCount, rewardHistory.total), categoryCount: Array.isArray(rewardSummary?.categories) ? rewardSummary.categories.length : 0, items: rewardHistory.items, topSources }, promoHistory: rewardHistory.promoHistory, referralFunnel, seasonalShop: { ...seasonalShop, featuredItems: (Array.isArray(seasonalShop.items) ? seasonalShop.items : []).filter((item)=>item.featured).slice(0,4), purchaseCount: (Array.isArray(user?.cosmeticPurchaseHistory) ? user.cosmeticPurchaseHistory : []).length }, cosmeticInventory, rewardCatalog, catalogHighlights: rewardCatalog.slice(0,6), summaryLabel: rewardHistory.total ? `${rewardHistory.total} ödül kaydı ve ${cosmeticInventory.ownedCount} envanter öğesi hazır` : 'Ekonomi merkezi hazır', balanceView: { mcBalance: safeNum(user?.coins || user?.balance || 0,0), rewardVelocity: topSources[0]?.label || '', lastRewardAt: rewardHistory.lastRewardAt || 0 } };
}
function buildInventoryHub(options = {}) {
  const user = options.user || {}; const vipCenter = options.vipCenter || {}; const featureFlags = options.featureFlags || {}; const rewardSummary = options.rewardSummary || {};
  const cosmeticInventory = buildCosmeticInventory(user, vipCenter, featureFlags);
  return { generatedAt: nowMs(), summaryLabel: cosmeticInventory.summaryLabel, ownedCount: cosmeticInventory.ownedCount, equippedCount: cosmeticInventory.equippedCount, slotCount: cosmeticInventory.slots.length, ownedItems: cosmeticInventory.items.slice(0,24), equippedItems: cosmeticInventory.items.filter((item)=>item.equipped).slice(0,8), categories: cosmeticInventory.categories, slots: cosmeticInventory.slots, rewardBackedCount: safeNum(rewardSummary?.itemCount,0), seasonalShop: cosmeticInventory.seasonalShop, purchaseHistory: (Array.isArray(user?.cosmeticPurchaseHistory) ? user.cosmeticPurchaseHistory : []).slice(0,12) };
}
function buildGameExperienceHub(options = {}) {
  const activeSessions = Array.isArray(options.activeSessions) ? options.activeSessions : []; const featureFlags = options.featureFlags || {};
  const matchItems = Array.isArray(options.matchItems) ? options.matchItems : [];
  const perspectiveName = cleanStr(options.user?.username || options.user?.displayName || 'Sen', 40) || 'Sen';
  const resumableItems = activeSessions.filter((item)=>item?.canResume).slice(0,8).map((item)=>({ gameType: cleanStr(item?.gameType || '',24), roomId: cleanStr(item?.roomId || '',160), status: cleanStr(item?.status || '',24), resumePath: cleanStr(item?.resumePath || '',220), resumeLabel: cleanStr(item?.resumeLabel || 'Oyuna Dön',40), resumeAvailableUntil: safeNum(item?.resumeAvailableUntil || item?.cleanupAt,0), antiStallThresholdMs: safeNum(item?.antiStallThresholdMs,15000) }));
  const reviewableItems = activeSessions.filter((item)=>item?.canReview).slice(0,8).map((item)=>({ gameType: cleanStr(item?.gameType || '',24), roomId: cleanStr(item?.roomId || '',160), status: cleanStr(item?.status || '',24), resumePath: cleanStr(item?.resumePath || '',220), resumeLabel: cleanStr(item?.resumeLabel || 'Sonucu Gör',40) }));
  const spectatorMode = buildSpectatorModeCenter(activeSessions, featureFlags);
  const replayCenter = buildReplayCenter(matchItems, { perspectiveName });
  const analytics = buildPostGameAnalytics(matchItems);
  const latestShareCard = replayCenter.latestShareCard || buildMatchSummaryShareCard(matchItems[0] || {}, { perspectiveName });
  return { generatedAt: nowMs(), resumeSupport: { available: resumableItems.length > 0, count: resumableItems.length, reviewCount: reviewableItems.length, items: resumableItems, reviewItems: reviewableItems }, reconnectOverlay: { enabled: featureFlags.reconnectOverlay !== false, strategy: 'socket_poll_resume', graceWindowMs: 15000, message: 'Bağlantı koptuğunda oturum korunur ve yeniden bağlanma katmanı gösterilir.', supportedGames: Array.from(new Set(activeSessions.map((item)=>cleanStr(item?.gameType || '',24)).filter(Boolean))), notices: ['Socket kopsa bile kısa süreli yeniden bağlanma denenir.', 'Aktif odalar için resume bağlantısı korunur.', 'Yeniden bağlanma sonucu oyun merkezinde görünür kalır.'] }, spectatorMode, replayCenter, matchSummaryShareCard: { enabled: true, label: 'Maç özeti paylaşım kartı', latest: latestShareCard }, postGameAnalytics: analytics, antiStallTimerUi: { enabled: featureFlags.antiStallUi !== false, label: 'Sıra gecikmelerinde görünür anti-stall zamanlayıcı', thresholdMs: 15000, items: resumableItems.map((item)=>({ gameType: item.gameType, roomId: item.roomId, thresholdMs: item.antiStallThresholdMs, label: `${item.gameType} anti-stall` })) }, sessionSummary: { total: activeSessions.length, resumable: resumableItems.length, reviewable: reviewableItems.length, spectatable: spectatorMode.totalCandidates || 0 } };
}
module.exports = { INVENTORY_SLOT_LABELS, bucketSeasonArchive, buildFavoriteGameStats, buildRewardHistory, buildReferralFunnel, resolveInventorySlot, mapInventoryFieldForSlot, buildCosmeticInventory, buildProfileHub, buildEconomyHub, buildInventoryHub, buildGameExperienceHub };
