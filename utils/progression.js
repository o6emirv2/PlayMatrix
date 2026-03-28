'use strict';

const { safeNum } = require('./helpers');
const {
  VIP_MAX_TIER,
  normalizeVipTier,
  getVipTierMeta,
  getVipNextTierMeta,
  formatVipLabel,
  getVipProgressWindow,
  getVipDisplayBand
} = require('../config/vip');

const ACCOUNT_LEVEL_CAP = 100;
const ACCOUNT_XP_STEP = 100;

function clampPositiveInt(value = 0, fallback = 0) {
  const parsed = Math.floor(safeNum(value, fallback));
  return parsed > 0 ? parsed : Math.max(0, Math.floor(safeNum(fallback, 0)));
}

function deriveXpFromLevel(level = 1) {
  const safeLevel = Math.max(1, Math.min(ACCOUNT_LEVEL_CAP, clampPositiveInt(level, 1)));
  return Math.max(0, Math.round(Math.pow(Math.max(0, safeLevel - 1), 2) * ACCOUNT_XP_STEP));
}

function deriveLegacyXpFromRp(rp = 0) {
  return Math.max(0, Math.round(safeNum(rp, 0) * 10));
}

function getAccountXp(user = {}) {
  const explicitAccountXp = safeNum(user.accountXp, Number.NaN);
  if (Number.isFinite(explicitAccountXp) && explicitAccountXp >= 0) return Math.round(explicitAccountXp);

  const explicitXp = safeNum(user.xp, Number.NaN);
  if (Number.isFinite(explicitXp) && explicitXp >= 0) return Math.round(explicitXp);

  const explicitLevel = safeNum(user.level, Number.NaN);
  if (Number.isFinite(explicitLevel) && explicitLevel > 0) return deriveXpFromLevel(explicitLevel);

  return deriveLegacyXpFromRp(getCompetitiveScore(user));
}

function getAccountLevelFromXp(xp = 0) {
  const safeXp = Math.max(0, safeNum(xp, 0));
  const computed = Math.floor(Math.sqrt(safeXp / ACCOUNT_XP_STEP)) + 1;
  return Math.max(1, Math.min(ACCOUNT_LEVEL_CAP, computed));
}

function getAccountLevel(user = {}) {
  const explicitLevel = safeNum(user.level, Number.NaN);
  if (Number.isFinite(explicitLevel) && explicitLevel > 0) {
    return Math.max(1, Math.min(ACCOUNT_LEVEL_CAP, Math.floor(explicitLevel)));
  }
  return getAccountLevelFromXp(getAccountXp(user));
}

function getAccountLevelWindow(level = 1) {
  const safeLevel = Math.max(1, Math.min(ACCOUNT_LEVEL_CAP, clampPositiveInt(level, 1)));
  const currentLevelXp = deriveXpFromLevel(safeLevel);
  const nextLevelXp = safeLevel >= ACCOUNT_LEVEL_CAP ? currentLevelXp : deriveXpFromLevel(safeLevel + 1);
  return {
    currentLevelXp,
    nextLevelXp,
    currentLevelSpan: Math.max(1, nextLevelXp - currentLevelXp)
  };
}

function getAccountLevelProgress(user = {}) {
  const accountXp = getAccountXp(user);
  const accountLevel = getAccountLevel(user);
  const { currentLevelXp, nextLevelXp, currentLevelSpan } = getAccountLevelWindow(accountLevel);
  const progressInLevel = accountLevel >= ACCOUNT_LEVEL_CAP ? currentLevelSpan : Math.max(0, accountXp - currentLevelXp);
  const progressPct = accountLevel >= ACCOUNT_LEVEL_CAP ? 100 : Math.max(0, Math.min(100, (progressInLevel / currentLevelSpan) * 100));
  return {
    accountXp,
    accountLevel,
    currentLevelXp,
    nextLevelXp,
    progressInLevel,
    progressPct,
    score: accountXp
  };
}

function getRankMetaFromScore(score = 0) {
  const value = safeNum(score, 0);
  if (value < 1000) return { key: 'bronze', name: 'Bronze', className: 'rank-bronze' };
  if (value < 3000) return { key: 'silver', name: 'Silver', className: 'rank-silver' };
  if (value < 5000) return { key: 'gold', name: 'Gold', className: 'rank-gold' };
  if (value < 10000) return { key: 'platinum', name: 'Platinum', className: 'rank-platinum' };
  if (value < 15000) return { key: 'diamond', name: 'Diamond', className: 'rank-diamond' };
  return { key: 'champion', name: 'Champion', className: 'rank-champion' };
}

function getCompetitiveScore(user = {}) {
  const candidates = [user.competitiveScore, user.rp, user.rank, user.totalRp, user.totalRankScore];
  for (const candidate of candidates) {
    const parsed = safeNum(candidate, Number.NaN);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return 0;
}

function getSeasonScore(user = {}) {
  const candidates = [user.seasonScore, user.seasonRp, user.seasonRankScore];
  for (const candidate of candidates) {
    const parsed = safeNum(candidate, Number.NaN);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return 0;
}

function getRankMetaFromRp(rp = 0) {
  return getRankMetaFromScore(rp);
}

function getTotalRankMeta(user = {}) {
  return getRankMetaFromScore(getCompetitiveScore(user));
}

function getSeasonRankMeta(user = {}) {
  return getRankMetaFromScore(getSeasonScore(user));
}

function getVipTier(user = {}) {
  const expiresAt = safeNum(user.vipExpiresAt, 0);
  const activeMembership = expiresAt > 0 ? expiresAt : 0;
  const explicitTier = normalizeVipTier(user.vipTier ?? user.vip ?? user.vipLevel ?? 0, 0);
  const hasVipFlag = user.vipActive === true || activeMembership > Date.now();
  if (explicitTier > 0) return explicitTier;
  if (hasVipFlag) return 1;
  return 0;
}

function getVipLabel(user = {}) {
  return formatVipLabel(getVipTier(user));
}

function getVipDisplayTier(user = {}) {
  return getVipDisplayBand(getVipTier(user));
}

function getVipProgress(user = {}) {
  const tier = getVipTier(user);
  const currentMeta = getVipTierMeta(tier);
  const nextMeta = getVipNextTierMeta(tier);
  const vipPoints = Math.max(0, Math.round(safeNum(user.vipPoints, 0)));
  const totalSpentMc = Math.max(0, safeNum(user.totalSpentMc, 0));
  const { currentXpRequired, nextXpRequired, currentSpendRequired, nextSpendRequired } = getVipProgressWindow(tier);

  const xpSpan = Math.max(1, nextXpRequired - currentXpRequired);
  const spendSpan = Math.max(1, nextSpendRequired - currentSpendRequired);
  const xpProgress = nextMeta ? Math.max(0, vipPoints - currentXpRequired) : xpSpan;
  const spendProgress = nextMeta ? Math.max(0, totalSpentMc - currentSpendRequired) : spendSpan;
  const xpPct = nextMeta ? Math.max(0, Math.min(100, (xpProgress / xpSpan) * 100)) : 100;
  const spendPct = nextMeta ? Math.max(0, Math.min(100, (spendProgress / spendSpan) * 100)) : 100;

  return {
    tier,
    band: getVipDisplayBand(tier),
    name: currentMeta.name,
    short: currentMeta.short,
    label: formatVipLabel(tier),
    currentXp: vipPoints,
    currentSpend: totalSpentMc,
    currentXpRequired,
    nextXpRequired,
    currentSpendRequired,
    nextSpendRequired,
    xpProgress,
    spendProgress,
    xpProgressPct: xpPct,
    spendProgressPct: spendPct,
    nextTier: nextMeta ? nextMeta.tier : currentMeta.tier,
    nextLabel: nextMeta ? formatVipLabel(nextMeta.tier) : formatVipLabel(currentMeta.tier),
    isMax: !nextMeta
  };
}

function getVipMembershipScore(user = {}) {
  const progress = getVipProgress(user);
  const expiresAt = safeNum(user.vipExpiresAt, 0);
  const activeMembership = user.vipActive === true || expiresAt > Date.now() ? 1_000_000 : 0;
  const normalizedTierWeight = normalizeVipTier(progress.tier, 0) * 100_000;
  return activeMembership + normalizedTierWeight + progress.currentXp + Math.floor(progress.currentSpend / 100);
}

function normalizeUserRankState(user = {}) {
  const competitiveScore = getCompetitiveScore(user);
  const seasonScore = getSeasonScore(user);
  const totalRankMeta = getTotalRankMeta(user);
  const seasonRankMeta = getSeasonRankMeta(user);
  return {
    rp: competitiveScore,
    rank: competitiveScore,
    totalRp: competitiveScore,
    competitiveScore,
    totalRank: totalRankMeta.name,
    totalRankKey: totalRankMeta.key,
    totalRankClass: totalRankMeta.className,
    seasonRp: seasonScore,
    seasonScore,
    seasonRank: seasonRankMeta.name,
    seasonRankKey: seasonRankMeta.key,
    seasonRankClass: seasonRankMeta.className
  };
}

function buildProgressionSnapshot(user = {}) {
  const levelProgress = getAccountLevelProgress(user);
  const competitiveScore = getCompetitiveScore(user);
  const seasonScore = getSeasonScore(user);
  const totalRankMeta = getTotalRankMeta({ ...user, competitiveScore });
  const seasonRankMeta = getSeasonRankMeta({ ...user, seasonScore });
  const vipProgress = getVipProgress(user);

  return {
    accountXp: levelProgress.accountXp,
    accountLevel: levelProgress.accountLevel,
    accountLevelProgressPct: levelProgress.progressPct,
    accountLevelCurrentXp: levelProgress.currentLevelXp,
    accountLevelNextXp: levelProgress.nextLevelXp,
    accountLevelScore: levelProgress.score,
    competitiveScore,
    competitiveRank: totalRankMeta.name,
    competitiveRankKey: totalRankMeta.key,
    competitiveRankClass: totalRankMeta.className,
    totalRank: totalRankMeta.name,
    totalRankKey: totalRankMeta.key,
    totalRankClass: totalRankMeta.className,
    totalRankScore: competitiveScore,
    seasonScore,
    seasonRank: seasonRankMeta.name,
    seasonRankKey: seasonRankMeta.key,
    seasonRankClass: seasonRankMeta.className,
    seasonRankScore: seasonScore,
    monthlyActivity: safeNum(user.monthlyActiveScore, 0),
    vipLevel: vipProgress.tier,
    vipTier: vipProgress.tier,
    vipBand: vipProgress.band,
    vipName: vipProgress.name,
    vipShort: vipProgress.short,
    vipLabel: vipProgress.label,
    vipScore: getVipMembershipScore(user),
    vipProgress,
    nextVipLabel: vipProgress.nextLabel,
    rank: seasonRankMeta.name,
    rankKey: seasonRankMeta.key,
    rankClass: seasonRankMeta.className,
    labels: {
      accountLevel: 'Hesap Seviyesi',
      totalRank: 'Toplam Rank',
      competitiveScore: 'Rekabetçi Puan',
      seasonRank: 'Sezon Rank',
      seasonScore: 'Sezon RP',
      monthlyActivity: 'Aylık Aktiflik',
      vipLevel: 'VIP Kulübü'
    }
  };
}

module.exports = {
  ACCOUNT_LEVEL_CAP,
  ACCOUNT_XP_STEP,
  VIP_MAX_TIER,
  deriveXpFromLevel,
  deriveLegacyXpFromRp,
  getAccountXp,
  getAccountLevelFromXp,
  getAccountLevel,
  getAccountLevelProgress,
  getCompetitiveScore,
  getSeasonScore,
  getRankMetaFromRp,
  getTotalRankMeta,
  getSeasonRankMeta,
  getVipTier,
  getVipLabel,
  getVipDisplayTier,
  getVipProgress,
  getVipMembershipScore,
  normalizeUserRankState,
  buildProgressionSnapshot
};
