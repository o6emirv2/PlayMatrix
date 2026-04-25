'use strict';

const { safeNum } = require('./helpers');

const ACCOUNT_LEVEL_CAP = 100;
const ACCOUNT_PROGRESSION_VERSION = 6;
const ACCOUNT_LEVEL_CURVE_MODE = 'MD_FACTORIAL_OPTION_A_BIGINT';
const ACCOUNT_BASE_XP = 120;
const MIGRATION_ACCOUNT_XP_STEP = 100;
const MAX_SAFE_XP_NUMBER = Number.MAX_SAFE_INTEGER;

const LEGACY_V4_LEVEL_STEP_SEGMENTS = Object.freeze([
  Object.freeze({ from: 1, to: 9, startStep: 120, endStep: 420 }),
  Object.freeze({ from: 10, to: 24, startStep: 460, endStep: 1280 }),
  Object.freeze({ from: 25, to: 49, startStep: 1360, endStep: 3320 }),
  Object.freeze({ from: 50, to: 74, startStep: 3440, endStep: 5960 }),
  Object.freeze({ from: 75, to: 99, startStep: 6100, endStep: 9100 })
]);

const MONTHLY_ACTIVITY_STAGES = Object.freeze([
  Object.freeze({ min: 0, key: 'level', name: 'Aylık Başlangıç', className: 'rank-level' }),
  Object.freeze({ min: 30, key: 'level', name: 'Isınma', className: 'rank-level' }),
  Object.freeze({ min: 90, key: 'level', name: 'Aktif', className: 'rank-level' }),
  Object.freeze({ min: 210, key: 'level', name: 'İstikrarlı', className: 'rank-level' }),
  Object.freeze({ min: 420, key: 'level', name: 'Yükseliş', className: 'rank-level' }),
  Object.freeze({ min: 700, key: 'level', name: 'Zirve', className: 'rank-level' })
]);

const MONTHLY_ACTIVITY_BASE_STATE = Object.freeze({
  activityRank: MONTHLY_ACTIVITY_STAGES[0].name,
  activityRankKey: MONTHLY_ACTIVITY_STAGES[0].key,
  activityRankClass: MONTHLY_ACTIVITY_STAGES[0].className,
  monthlyActiveScore: 0,
  activityScore: 0,
  monthlyActivity: 0
});

function clampPositiveInt(value = 0, fallback = 0) {
  const parsed = Math.floor(safeNum(value, fallback));
  return parsed > 0 ? parsed : Math.max(0, Math.floor(safeNum(fallback, 0)));
}

function normalizeLevel(level = 1) {
  return Math.max(1, Math.min(ACCOUNT_LEVEL_CAP, clampPositiveInt(level, 1)));
}

function parseXpBigInt(value = 0) {
  if (typeof value === 'bigint') return value > 0n ? value : 0n;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0n;
    return BigInt(Math.floor(Math.min(value, Number.MAX_VALUE)));
  }
  const raw = String(value ?? '').trim();
  if (!raw) return 0n;
  if (/^\d+$/.test(raw)) return BigInt(raw);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
  return BigInt(Math.floor(Math.min(parsed, Number.MAX_VALUE)));
}

function toFiniteXpNumber(value = 0n) {
  const exact = parseXpBigInt(value);
  if (exact <= BigInt(MAX_SAFE_XP_NUMBER)) return Number(exact);
  const approx = Number(exact.toString());
  return Number.isFinite(approx) ? approx : Number.MAX_VALUE;
}

function normalizeXp(value = 0) {
  return toFiniteXpNumber(parseXpBigInt(value));
}

function normalizeXpExact(value = 0) {
  return parseXpBigInt(value).toString();
}

function interpolateStep(segment, level) {
  const span = Math.max(1, (segment.to - segment.from));
  const offset = Math.max(0, Math.min(span, level - segment.from));
  const ratio = offset / span;
  return Math.round(segment.startStep + ((segment.endStep - segment.startStep) * ratio));
}

function getLegacyV4XpStepForLevel(level = 1) {
  const safeLevel = normalizeLevel(level);
  if (safeLevel >= ACCOUNT_LEVEL_CAP) return 0;
  const segment = LEGACY_V4_LEVEL_STEP_SEGMENTS.find((item) => safeLevel >= item.from && safeLevel <= item.to)
    || LEGACY_V4_LEVEL_STEP_SEGMENTS[LEGACY_V4_LEVEL_STEP_SEGMENTS.length - 1];
  return interpolateStep(segment, safeLevel);
}

const LEGACY_V4_LEVEL_THRESHOLDS = Object.freeze((() => {
  const table = new Array(ACCOUNT_LEVEL_CAP + 1).fill(0);
  let cumulativeXp = 0;
  table[1] = 0;
  for (let level = 2; level <= ACCOUNT_LEVEL_CAP; level += 1) {
    cumulativeXp += getLegacyV4XpStepForLevel(level - 1);
    table[level] = cumulativeXp;
  }
  return table;
})());

function buildMdFactorialStepTableExact() {
  const table = new Array(ACCOUNT_LEVEL_CAP + 1).fill(0n);
  let step = BigInt(ACCOUNT_BASE_XP);
  for (let level = 1; level < ACCOUNT_LEVEL_CAP; level += 1) {
    if (level === 1) step = BigInt(ACCOUNT_BASE_XP);
    else step *= BigInt(level);
    table[level] = step;
  }
  return table;
}

const ACCOUNT_LEVEL_STEPS_BIGINT = Object.freeze(buildMdFactorialStepTableExact());
const ACCOUNT_LEVEL_STEPS_EXACT = Object.freeze(ACCOUNT_LEVEL_STEPS_BIGINT.map((xp) => xp.toString()));
const ACCOUNT_LEVEL_STEPS = Object.freeze(ACCOUNT_LEVEL_STEPS_BIGINT.map((xp) => toFiniteXpNumber(xp)));

const ACCOUNT_LEVEL_THRESHOLDS_BIGINT = Object.freeze((() => {
  const table = new Array(ACCOUNT_LEVEL_CAP + 1).fill(0n);
  let cumulativeXp = 0n;
  table[1] = 0n;
  for (let level = 2; level <= ACCOUNT_LEVEL_CAP; level += 1) {
    cumulativeXp += ACCOUNT_LEVEL_STEPS_BIGINT[level - 1];
    table[level] = cumulativeXp;
  }
  return table;
})());
const ACCOUNT_LEVEL_THRESHOLDS_EXACT = Object.freeze(ACCOUNT_LEVEL_THRESHOLDS_BIGINT.map((xp) => xp.toString()));
const ACCOUNT_LEVEL_THRESHOLDS = Object.freeze(ACCOUNT_LEVEL_THRESHOLDS_BIGINT.map((xp) => toFiniteXpNumber(xp)));

const ACCOUNT_LEVEL_STEP_RULES = Object.freeze(Array.from({ length: ACCOUNT_LEVEL_CAP - 1 }, (_, index) => {
  const level = index + 1;
  return Object.freeze({
    fromLevel: level,
    toLevel: level + 1,
    multiplier: level === 1 ? 1 : level,
    stepXp: ACCOUNT_LEVEL_STEPS[level],
    stepXpExact: ACCOUNT_LEVEL_STEPS_EXACT[level]
  });
}));

function getXpStepForLevel(level = 1) {
  const safeLevel = normalizeLevel(level);
  if (safeLevel >= ACCOUNT_LEVEL_CAP) return 0;
  return ACCOUNT_LEVEL_STEPS[safeLevel];
}

function getXpStepExactForLevel(level = 1) {
  const safeLevel = normalizeLevel(level);
  if (safeLevel >= ACCOUNT_LEVEL_CAP) return '0';
  return ACCOUNT_LEVEL_STEPS_EXACT[safeLevel];
}

const ACCOUNT_XP_STEP = getXpStepForLevel(1);

function deriveXpFromLevel(level = 1) {
  return ACCOUNT_LEVEL_THRESHOLDS[normalizeLevel(level)] || 0;
}

function deriveXpExactFromLevel(level = 1) {
  return ACCOUNT_LEVEL_THRESHOLDS_EXACT[normalizeLevel(level)] || '0';
}

function deriveLegacyV4XpFromLevel(level = 1) {
  return LEGACY_V4_LEVEL_THRESHOLDS[normalizeLevel(level)] || 0;
}

function deriveMigrationQuadraticXpFromLevel(level = 1) {
  const safeLevel = normalizeLevel(level);
  return Math.max(0, Math.round(Math.pow(Math.max(0, safeLevel - 1), 2) * MIGRATION_ACCOUNT_XP_STEP));
}

function getLevelFromThresholds(xp = 0, thresholds = ACCOUNT_LEVEL_THRESHOLDS_BIGINT) {
  const safeXp = parseXpBigInt(xp);
  const thresholdTable = Array.isArray(thresholds) ? thresholds : ACCOUNT_LEVEL_THRESHOLDS_BIGINT;
  let low = 1;
  let high = ACCOUNT_LEVEL_CAP;
  let resolved = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const threshold = parseXpBigInt(thresholdTable[normalizeLevel(mid)] || 0);
    if (safeXp >= threshold) {
      resolved = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return normalizeLevel(resolved);
}

function mapXpBetweenCurves(storedXp = 0, options = {}) {
  const safeStoredXp = normalizeXp(storedXp);
  const fromThresholds = Array.isArray(options.fromThresholds) ? options.fromThresholds : LEGACY_V4_LEVEL_THRESHOLDS;
  const fromStepForLevel = typeof options.fromStepForLevel === 'function' ? options.fromStepForLevel : getLegacyV4XpStepForLevel;
  const storedLevel = getLevelFromThresholds(safeStoredXp, fromThresholds);
  const storedLevelXp = fromThresholds[storedLevel] || 0;
  const storedSpan = storedLevel >= ACCOUNT_LEVEL_CAP ? 1 : Math.max(1, fromStepForLevel(storedLevel));
  const progressRatio = storedLevel >= ACCOUNT_LEVEL_CAP ? 1 : Math.max(0, Math.min(1, (safeStoredXp - storedLevelXp) / storedSpan));
  const currentLevelXp = deriveXpFromLevel(storedLevel);
  const currentSpan = storedLevel >= ACCOUNT_LEVEL_CAP ? 1 : Math.max(1, getXpStepForLevel(storedLevel));
  return normalizeXp(currentLevelXp + (currentSpan * progressRatio));
}

function getMigrationLevelFromStoredXp(xp = 0) {
  const safeXp = normalizeXp(xp);
  const computed = Math.floor(Math.sqrt(safeXp / MIGRATION_ACCOUNT_XP_STEP)) + 1;
  return normalizeLevel(computed);
}

function mapLegacyQuadraticXpToCurrentXp(storedXp = 0) {
  const safeStoredXp = normalizeXp(storedXp);
  const storedLevel = getMigrationLevelFromStoredXp(safeStoredXp);
  const storedLevelXp = deriveMigrationQuadraticXpFromLevel(storedLevel);
  const storedNextLevelXp = storedLevel >= ACCOUNT_LEVEL_CAP ? storedLevelXp : deriveMigrationQuadraticXpFromLevel(storedLevel + 1);
  const storedSpan = Math.max(1, storedNextLevelXp - storedLevelXp);
  const progressRatio = storedLevel >= ACCOUNT_LEVEL_CAP ? 1 : Math.max(0, Math.min(1, (safeStoredXp - storedLevelXp) / storedSpan));
  const currentLevelXp = deriveXpFromLevel(storedLevel);
  const currentSpan = storedLevel >= ACCOUNT_LEVEL_CAP ? 1 : Math.max(1, getXpStepForLevel(storedLevel));
  return normalizeXp(currentLevelXp + (currentSpan * progressRatio));
}

function mapStoredXpToCurrentXp(storedXp = 0, version = 0) {
  const safeVersion = Math.floor(safeNum(version, 0));
  if (safeVersion >= ACCOUNT_PROGRESSION_VERSION) return normalizeXp(storedXp);
  if (safeVersion >= 4) {
    return mapXpBetweenCurves(storedXp, { fromThresholds: LEGACY_V4_LEVEL_THRESHOLDS, fromStepForLevel: getLegacyV4XpStepForLevel });
  }
  return mapLegacyQuadraticXpToCurrentXp(storedXp);
}

function getAccountLevelFromXp(xp = 0) {
  return getLevelFromThresholds(xp, ACCOUNT_LEVEL_THRESHOLDS_BIGINT);
}

function isCurrentProgressionVersion(user = {}) {
  const version = Math.floor(safeNum(user.accountProgressionVersion ?? user.progression?.accountProgressionVersion, 0));
  const curveMode = String(user.accountLevelCurveMode ?? user.progression?.accountLevelCurveMode ?? '').trim();
  return version >= ACCOUNT_PROGRESSION_VERSION && curveMode === ACCOUNT_LEVEL_CURVE_MODE;
}

function getMonthlyActivity(user = {}) {
  const candidates = [user.monthlyActiveScore, user.monthlyActivity, user.activityScore, user.progression?.monthlyActivity];
  for (const candidate of candidates) {
    const parsed = safeNum(candidate, Number.NaN);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return 0;
}

function getAccountXpExact(user = {}) {
  const exactCandidates = [user.accountXpExact, user.accountLevelScoreExact, user.progression?.accountXpExact, user.progression?.accountLevelScoreExact];
  if (isCurrentProgressionVersion(user)) {
    for (const candidate of exactCandidates) {
      if (String(candidate ?? '').trim()) return normalizeXpExact(candidate);
    }
  }
  const explicitAccountXp = safeNum(user.accountXp ?? user.accountLevelScore, Number.NaN);
  const explicitXp = safeNum(user.xp, Number.NaN);
  const explicitLevel = safeNum(user.accountLevel ?? user.level, Number.NaN);
  const progressionVersion = Math.floor(safeNum(user.accountProgressionVersion ?? user.progression?.accountProgressionVersion, 0));

  if (isCurrentProgressionVersion(user)) {
    if (Number.isFinite(explicitAccountXp) && explicitAccountXp >= 0) return normalizeXpExact(explicitAccountXp);
    if (Number.isFinite(explicitXp) && explicitXp >= 0) return normalizeXpExact(explicitXp);
    if (Number.isFinite(explicitLevel) && explicitLevel > 0) return deriveXpExactFromLevel(explicitLevel);
    return '0';
  }

  if (Number.isFinite(explicitAccountXp) && explicitAccountXp >= 0) return normalizeXpExact(mapStoredXpToCurrentXp(explicitAccountXp, progressionVersion));
  if (Number.isFinite(explicitXp) && explicitXp >= 0) return normalizeXpExact(mapStoredXpToCurrentXp(explicitXp, progressionVersion));
  if (Number.isFinite(explicitLevel) && explicitLevel > 0) return deriveXpExactFromLevel(explicitLevel);
  return '0';
}

function getAccountXp(user = {}) {
  return normalizeXp(getAccountXpExact(user));
}

function getAccountLevel(user = {}) {
  const explicitLevel = safeNum(user.accountLevel ?? user.level, Number.NaN);
  if (isCurrentProgressionVersion(user) && Number.isFinite(explicitLevel) && explicitLevel > 0) return normalizeLevel(explicitLevel);
  return getAccountLevelFromXp(getAccountXpExact(user));
}

function getAccountLevelWindow(level = 1) {
  const safeLevel = normalizeLevel(level);
  const currentLevelXpExact = deriveXpExactFromLevel(safeLevel);
  const nextLevelXpExact = safeLevel >= ACCOUNT_LEVEL_CAP ? currentLevelXpExact : deriveXpExactFromLevel(safeLevel + 1);
  const currentLevelSpanExact = (parseXpBigInt(nextLevelXpExact) - parseXpBigInt(currentLevelXpExact)).toString();
  return {
    currentLevelXp: normalizeXp(currentLevelXpExact),
    nextLevelXp: normalizeXp(nextLevelXpExact),
    currentLevelSpan: Math.max(1, normalizeXp(currentLevelSpanExact)),
    xpSpanToNextLevel: Math.max(1, normalizeXp(currentLevelSpanExact)),
    currentLevelXpExact,
    nextLevelXpExact,
    currentLevelSpanExact,
    xpSpanToNextLevelExact: currentLevelSpanExact
  };
}

function getAccountLevelProgress(user = {}) {
  const accountXpExact = getAccountXpExact(user);
  const accountXpBig = parseXpBigInt(accountXpExact);
  const accountLevel = getAccountLevel(user);
  const window = getAccountLevelWindow(accountLevel);
  const currentLevelXpBig = parseXpBigInt(window.currentLevelXpExact);
  const nextLevelXpBig = parseXpBigInt(window.nextLevelXpExact);
  const spanBig = nextLevelXpBig > currentLevelXpBig ? (nextLevelXpBig - currentLevelXpBig) : 1n;
  const progressBig = accountLevel >= ACCOUNT_LEVEL_CAP ? spanBig : (accountXpBig > currentLevelXpBig ? accountXpBig - currentLevelXpBig : 0n);
  const remainingBig = accountLevel >= ACCOUNT_LEVEL_CAP ? 0n : (nextLevelXpBig > accountXpBig ? nextLevelXpBig - accountXpBig : 0n);
  const progressPct = accountLevel >= ACCOUNT_LEVEL_CAP ? 100 : Math.max(0, Math.min(100, Number((progressBig * 10000n) / spanBig) / 100));
  return {
    accountXp: normalizeXp(accountXpExact),
    accountXpExact,
    accountLevel,
    currentLevelXp: window.currentLevelXp,
    nextLevelXp: window.nextLevelXp,
    currentLevelSpan: window.currentLevelSpan,
    xpSpanToNextLevel: window.xpSpanToNextLevel,
    currentLevelXpExact: window.currentLevelXpExact,
    nextLevelXpExact: window.nextLevelXpExact,
    currentLevelSpanExact: window.currentLevelSpanExact,
    xpSpanToNextLevelExact: window.xpSpanToNextLevelExact,
    xpToNextLevel: normalizeXp(remainingBig),
    xpToNextLevelExact: remainingBig.toString(),
    progressInLevel: normalizeXp(progressBig),
    progressInLevelExact: progressBig.toString(),
    progressPct,
    score: normalizeXp(accountXpExact),
    scoreExact: accountXpExact
  };
}

function buildLevelRankMeta(accountLevel = 1) {
  const safeLevel = normalizeLevel(accountLevel);
  return { key: 'level', name: `Seviye ${safeLevel}`, className: 'rank-level' };
}

function getRankMetaFromScore(score = 0) {
  return buildLevelRankMeta(getAccountLevelFromXp(score));
}

function getTotalRankMeta(user = {}) {
  return buildLevelRankMeta(getAccountLevel(user));
}

function getActivityRankMeta(user = {}) {
  const score = getMonthlyActivity(user);
  let resolved = MONTHLY_ACTIVITY_STAGES[0];
  for (const stage of MONTHLY_ACTIVITY_STAGES) if (score >= stage.min) resolved = stage;
  return resolved;
}

function buildActivityResetState(currentPeriodKey = '', options = {}) {
  const resetAt = Math.max(0, safeNum(options.resetAt, 0));
  const activityPassClaimed = options.resetActivityPass === false
    ? undefined
    : (options.activityPassClaimed && typeof options.activityPassClaimed === 'object' ? options.activityPassClaimed : {});
  const payload = {
    monthlyActiveScore: 0,
    activityScore: 0,
    monthlyActivity: 0,
    activityRank: MONTHLY_ACTIVITY_BASE_STATE.activityRank,
    activityRankKey: MONTHLY_ACTIVITY_BASE_STATE.activityRankKey,
    activityRankClass: MONTHLY_ACTIVITY_BASE_STATE.activityRankClass,
    lastActivityResetKey: String(currentPeriodKey || '').trim() || null
  };
  if (resetAt > 0) payload.activityResetAt = resetAt;
  if (activityPassClaimed !== undefined) payload.activityPassClaimed = activityPassClaimed;
  if (String(currentPeriodKey || '').trim()) payload.activityPassClaimedPeriodKey = String(currentPeriodKey || '').trim();
  if (resetAt > 0 && options.includePresentationResetAt) payload.activityPresentationResetAt = resetAt;
  return payload;
}

function normalizeUserRankState(user = {}) {
  const monthlyActivityValue = getMonthlyActivity(user);
  const totalRankMeta = getTotalRankMeta(user);
  const activityRankMeta = getActivityRankMeta({ ...user, monthlyActiveScore: monthlyActivityValue });
  return {
    totalRank: totalRankMeta.name,
    totalRankKey: totalRankMeta.key,
    totalRankClass: totalRankMeta.className,
    activityRank: activityRankMeta.name,
    activityRankKey: activityRankMeta.key,
    activityRankClass: activityRankMeta.className,
    activityScore: monthlyActivityValue,
    monthlyActivity: monthlyActivityValue
  };
}

function buildProgressionSnapshot(user = {}) {
  const levelProgress = getAccountLevelProgress(user);
  const monthlyActivityValue = getMonthlyActivity(user);
  const totalRankMeta = buildLevelRankMeta(levelProgress.accountLevel);
  const activityRankMeta = getActivityRankMeta({ ...user, monthlyActiveScore: monthlyActivityValue });
  return {
    accountXp: levelProgress.accountXp,
    accountXpExact: levelProgress.accountXpExact,
    accountLevel: levelProgress.accountLevel,
    accountLevelProgressPct: levelProgress.progressPct,
    accountLevelCurrentXp: levelProgress.currentLevelXp,
    accountLevelCurrentXpExact: levelProgress.currentLevelXpExact,
    accountLevelNextXp: levelProgress.nextLevelXp,
    accountLevelNextXpExact: levelProgress.nextLevelXpExact,
    accountLevelSpanXp: levelProgress.currentLevelSpan,
    accountLevelSpanXpExact: levelProgress.currentLevelSpanExact,
    accountLevelRemainingXp: levelProgress.xpToNextLevel,
    accountLevelRemainingXpExact: levelProgress.xpToNextLevelExact,
    accountLevelScore: levelProgress.score,
    accountLevelScoreExact: levelProgress.scoreExact,
    accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION,
    accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE,
    accountLevelBaseXp: ACCOUNT_BASE_XP,
    totalRank: totalRankMeta.name,
    totalRankKey: totalRankMeta.key,
    totalRankClass: totalRankMeta.className,
    activityRank: activityRankMeta.name,
    activityRankKey: activityRankMeta.key,
    activityRankClass: activityRankMeta.className,
    monthlyActivity: monthlyActivityValue,
    labels: {
      accountLevel: 'Hesap Seviyesi',
      totalRank: 'Toplam Seviye',
      activityRank: 'Aylık Durum',
      monthlyActivity: 'Aylık Aktiflik'
    }
  };
}

function addAccountXpExact(user = {}, xpDelta = 0) {
  const next = parseXpBigInt(getAccountXpExact(user)) + parseXpBigInt(xpDelta);
  return (next > 0n ? next : 0n).toString();
}

function buildProgressionPolicySummary() {
  return {
    version: ACCOUNT_PROGRESSION_VERSION,
    curveMode: ACCOUNT_LEVEL_CURVE_MODE,
    levelCap: ACCOUNT_LEVEL_CAP,
    baseXp: ACCOUNT_BASE_XP,
    openingStepXp: getXpStepForLevel(1),
    openingStepXpExact: getXpStepExactForLevel(1),
    endgameStepXp: getXpStepForLevel(ACCOUNT_LEVEL_CAP - 1),
    endgameStepXpExact: getXpStepExactForLevel(ACCOUNT_LEVEL_CAP - 1),
    formula: 'step[1] = BASE_XP; step[n] = step[n - 1] * n; exact values are stored as decimal strings to avoid unsafe Number precision.',
    rules: ACCOUNT_LEVEL_STEP_RULES.map((rule) => ({ ...rule })),
    thresholds: ACCOUNT_LEVEL_THRESHOLDS.map((xp, level) => ({ level, xp, xpExact: ACCOUNT_LEVEL_THRESHOLDS_EXACT[level] })).filter((entry) => entry.level >= 1),
    activityStages: MONTHLY_ACTIVITY_STAGES.map((stage) => ({ min: stage.min, key: stage.key, name: stage.name }))
  };
}

module.exports = {
  ACCOUNT_LEVEL_CAP,
  ACCOUNT_BASE_XP,
  ACCOUNT_XP_STEP,
  ACCOUNT_LEVEL_CURVE_MODE,
  ACCOUNT_LEVEL_STEPS,
  ACCOUNT_LEVEL_STEPS_EXACT,
  ACCOUNT_LEVEL_STEP_RULES,
  ACCOUNT_LEVEL_THRESHOLDS,
  ACCOUNT_LEVEL_THRESHOLDS_EXACT,
  ACCOUNT_PROGRESSION_VERSION,
  LEGACY_V4_LEVEL_STEP_SEGMENTS,
  LEGACY_V4_LEVEL_THRESHOLDS,
  MONTHLY_ACTIVITY_STAGES,
  MONTHLY_ACTIVITY_BASE_STATE,
  buildLevelRankMeta,
  buildActivityResetState,
  buildProgressionPolicySummary,
  deriveXpFromLevel,
  deriveXpExactFromLevel,
  getXpStepForLevel,
  getXpStepExactForLevel,
  getAccountXp,
  getAccountXpExact,
  addAccountXpExact,
  getAccountLevelFromXp,
  getAccountLevel,
  getAccountLevelWindow,
  getAccountLevelProgress,
  getMonthlyActivity,
  getTotalRankMeta,
  getActivityRankMeta,
  normalizeUserRankState,
  buildProgressionSnapshot,
  mapStoredXpToCurrentXp,
  normalizeXpExact
};
