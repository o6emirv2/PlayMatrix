'use strict';

const { safeNum, cleanStr } = require('./helpers');
const {
  ACCOUNT_PROGRESSION_VERSION,
  ACCOUNT_LEVEL_CURVE_MODE,
  buildProgressionSnapshot,
  getAccountLevel
} = require('./progression');

function normalizeInt(value = 0, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const parsed = Math.floor(safeNum(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseFrameClassToken(value = '') {
  const raw = cleanStr(value || '', 120);
  if (!raw) return 0;
  const match = raw.match(/(?:frame(?:-lvl)?-|lvl-|^)(\d{1,3})$/i) || raw.match(/(\d{1,3})/);
  if (!match) return 0;
  return normalizeInt(match[1], 1, 100, 0);
}

function getCanonicalSelectedFrame(user = {}, options = {}) {
  const defaultFrame = normalizeInt(options.defaultFrame, 0, 100, 0);
  const accountLevel = normalizeInt(options.accountLevel ?? user.accountLevel ?? getAccountLevel(user), 1, 100, 1);
  const directNumeric = normalizeInt(user.selectedFrame, 0, 100, 0);
  const activeNumeric = normalizeInt(user.activeFrame, 0, 100, 0);
  const classNumeric = parseFrameClassToken(user.activeFrameClass);
  const hasSelectedFrame = Object.prototype.hasOwnProperty.call(user || {}, 'selectedFrame') && user.selectedFrame !== undefined && user.selectedFrame !== null && String(user.selectedFrame).trim() !== '';
  const resolved = hasSelectedFrame
    ? directNumeric
    : (activeNumeric > 0 ? activeNumeric : (classNumeric > 0 ? classNumeric : defaultFrame));
  return Math.max(0, Math.min(accountLevel, resolved));
}

function buildCanonicalUserState(user = {}, options = {}) {
  const progression = buildProgressionSnapshot(user);
  const monthlyActiveScore = normalizeInt(user.monthlyActiveScore ?? progression.monthlyActivity, 0, Number.MAX_SAFE_INTEGER, 0);
  const accountLevel = normalizeInt(progression.accountLevel, 1, 100, 1);
  const accountXp = normalizeInt(progression.accountXp, 0, Number.MAX_SAFE_INTEGER, 0);
  const selectedFrame = getCanonicalSelectedFrame(user, { accountLevel, defaultFrame: options.defaultFrame ?? 0 });

  return {
    accountXp,
    xp: accountXp,
    accountLevel,
    level: accountLevel,
    accountLevelScore: accountXp,
    accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION,
    accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE,
    selectedFrame,
    monthlyActiveScore,
    progression: {
      ...progression,
      accountXp,
      accountLevel,
      accountLevelScore: accountXp,
      accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION,
      accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE,
      monthlyActivity: monthlyActiveScore
    }
  };
}

module.exports = {
  parseFrameClassToken,
  getCanonicalSelectedFrame,
  buildCanonicalUserState
};
