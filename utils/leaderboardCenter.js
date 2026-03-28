'use strict';

const { cleanStr, safeNum } = require('./helpers');

const LEADERBOARD_CATEGORY_MAP = Object.freeze({
  level: Object.freeze({ key: 'level', label: 'Hesap Seviyesi', scoreLabel: 'HESAP', field: 'accountLevelScore', emptyMessage: 'Henüz hesap seviyesi verisi oluşmadı.' }),
  season: Object.freeze({ key: 'season', label: 'Sezon RP', scoreLabel: 'SEZON RP', field: 'seasonRp', emptyMessage: 'Bu sezon için liderlik verisi henüz oluşmadı.' }),
  activity: Object.freeze({ key: 'activity', label: 'Aylık Aktiflik', scoreLabel: 'AKTİFLİK', field: 'monthlyActiveScore', emptyMessage: 'Aylık aktiflik verisi henüz oluşmadı.' }),
  vip: Object.freeze({ key: 'vip', label: 'VIP Kulübü', scoreLabel: 'VIP', field: 'vipScore', emptyMessage: 'VIP liderliği için henüz veri yok.' }),
  chess: Object.freeze({ key: 'chess', label: 'Satranç ELO', scoreLabel: 'ELO', field: 'chessElo', emptyMessage: 'Satranç ELO liderliği henüz oluşmadı.' }),
  pisti: Object.freeze({ key: 'pisti', label: 'Online Pişti ELO', scoreLabel: 'ELO', field: 'pistiElo', emptyMessage: 'Online Pişti ELO liderliği henüz oluşmadı.' })
});

const LEADERBOARD_CATEGORIES = Object.freeze(Object.values(LEADERBOARD_CATEGORY_MAP));

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function getLeaderboardCategoryMeta(key = '') {
  return LEADERBOARD_CATEGORY_MAP[cleanStr(key || '', 32)] || null;
}

function normalizeLeaderboardRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(Boolean)
    .map((item, index) => ({
      rank: safeNum(item.rank, index + 1),
      uid: cleanStr(item.uid || '', 180),
      username: cleanStr(item.username || 'Oyuncu', 64) || 'Oyuncu',
      avatar: cleanStr(item.avatar || '', 260),
      accountLevel: Math.max(1, safeNum(item.accountLevel ?? item.level, 1)),
      seasonRp: safeNum(item.seasonRp ?? item.score, 0),
      monthlyActiveScore: safeNum(item.monthlyActiveScore ?? item.activityScore ?? item.score, 0),
      vipLevel: Math.max(0, safeNum(item.vipLevel, 0)),
      vipLabel: cleanStr(item.vipLabel || '', 64),
      chessElo: Math.max(100, safeNum(item.chessElo, 1000)),
      pistiElo: Math.max(100, safeNum(item.pistiElo, 1000)),
      selectedFrame: safeNum(item.selectedFrame, 0),
      totalRank: cleanStr(item.totalRank || '', 48),
      totalRankClass: cleanStr(item.totalRankClass || '', 64),
      seasonRank: cleanStr(item.seasonRank || '', 48),
      seasonRankClass: cleanStr(item.seasonRankClass || '', 64)
    }));
}

function buildLeaderboardPayload(input = {}, options = {}) {
  const levelTop = normalizeLeaderboardRows(input.levelTop);
  const seasonTop = normalizeLeaderboardRows(input.seasonTop || input.rankTop);
  const activityTop = normalizeLeaderboardRows(input.activityTop || input.monthlyActiveTop);
  const vipTop = normalizeLeaderboardRows(input.vipTop);
  const chessTop = normalizeLeaderboardRows(input.chessTop);
  const pistiTop = normalizeLeaderboardRows(input.pistiTop);
  const degradedTabs = Array.isArray(options.degradedTabs)
    ? [...new Set(options.degradedTabs.map((item) => cleanStr(item || '', 32)).filter(Boolean))]
    : [];
  const totalEntries = levelTop.length + seasonTop.length + activityTop.length + vipTop.length + chessTop.length + pistiTop.length;
  const availableTabs = LEADERBOARD_CATEGORIES.filter((item) => {
    if (item.key === 'level') return levelTop.length > 0;
    if (item.key === 'season') return seasonTop.length > 0;
    if (item.key === 'activity') return activityTop.length > 0;
    if (item.key === 'vip') return vipTop.length > 0;
    if (item.key === 'chess') return chessTop.length > 0;
    if (item.key === 'pisti') return pistiTop.length > 0;
    return false;
  }).map((item) => item.key);

  return {
    levelTop,
    rankTop: seasonTop,
    seasonTop,
    activityTop,
    monthlyActiveTop: activityTop,
    vipTop,
    chessTop,
    pistiTop,
    self: cloneSerializable(input.self || {}),
    leaderboardMeta: {
      state: degradedTabs.length ? 'partial' : 'ready',
      stale: options.stale === true,
      source: cleanStr(options.source || 'primary', 32) || 'primary',
      degradedTabs,
      availableTabs,
      totalEntries,
      populatedCategories: availableTabs.length,
      emptyTabs: LEADERBOARD_CATEGORIES.map((item) => item.key).filter((key) => !availableTabs.includes(key)),
      categories: cloneSerializable(LEADERBOARD_CATEGORIES)
    }
  };
}

module.exports = {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_CATEGORY_MAP,
  getLeaderboardCategoryMeta,
  normalizeLeaderboardRows,
  buildLeaderboardPayload
};
