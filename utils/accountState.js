'use strict';

const { safeNum, cleanStr } = require('./helpers');
const {
  ACCOUNT_PROGRESSION_VERSION,
  ACCOUNT_LEVEL_CURVE_MODE,
  buildProgressionSnapshot,
  getAccountLevel,
  getAccountXpExact
} = require('./progression');

const FRAME_LEVEL_CAP = 100;
const FRAME_LEVEL_TO_ASSET = Object.freeze([
  Object.freeze({ min: 1, max: 15, asset: 1 }),
  Object.freeze({ min: 16, max: 30, asset: 2 }),
  Object.freeze({ min: 31, max: 40, asset: 3 }),
  Object.freeze({ min: 41, max: 50, asset: 4 }),
  Object.freeze({ min: 51, max: 60, asset: 5 }),
  Object.freeze({ min: 61, max: 80, asset: 6 }),
  Object.freeze({ min: 81, max: 85, asset: 7 }),
  Object.freeze({ min: 86, max: 90, asset: 8 }),
  Object.freeze({ min: 91, max: 91, asset: 9 }),
  Object.freeze({ min: 92, max: 92, asset: 10 }),
  Object.freeze({ min: 93, max: 93, asset: 11 }),
  Object.freeze({ min: 94, max: 94, asset: 12 }),
  Object.freeze({ min: 95, max: 95, asset: 13 }),
  Object.freeze({ min: 96, max: 96, asset: 14 }),
  Object.freeze({ min: 97, max: 97, asset: 15 }),
  Object.freeze({ min: 98, max: 98, asset: 16 }),
  Object.freeze({ min: 99, max: 99, asset: 17 }),
  Object.freeze({ min: 100, max: 100, asset: 18 })
]);

function normalizeInt(value = 0, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const parsed = Math.floor(safeNum(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeAccountLevel(value = 1) {
  return normalizeInt(value, 1, FRAME_LEVEL_CAP, 1);
}

function normalizeSelectedFrameLevel(value = 0) {
  return normalizeInt(value, 0, FRAME_LEVEL_CAP, 0);
}

function parseFrameClassToken(value = '') {
  const raw = cleanStr(value || '', 120);
  if (!raw) return 0;
  const match = raw.match(/(?:frame(?:-lvl)?-|lvl-|^)(\d{1,3})$/i) || raw.match(/(\d{1,3})/);
  if (!match) return 0;
  return normalizeSelectedFrameLevel(match[1]);
}

function getFrameAssetIndexForLevel(frameLevel = 0) {
  const selectedFrame = normalizeSelectedFrameLevel(frameLevel);
  if (selectedFrame <= 0) return 0;
  const range = FRAME_LEVEL_TO_ASSET.find((item) => selectedFrame >= item.min && selectedFrame <= item.max);
  return range ? range.asset : FRAME_LEVEL_TO_ASSET[FRAME_LEVEL_TO_ASSET.length - 1].asset;
}

function isSelectedFrameUnlocked(selectedFrame = 0, accountLevel = 1) {
  const frameLevel = normalizeSelectedFrameLevel(selectedFrame);
  if (frameLevel <= 0) return true;
  return frameLevel <= normalizeAccountLevel(accountLevel);
}

function resolveRawSelectedFrame(user = {}, defaultFrame = 0) {
  const hasSelectedFrame = Object.prototype.hasOwnProperty.call(user || {}, 'selectedFrame')
    && user.selectedFrame !== undefined
    && user.selectedFrame !== null
    && String(user.selectedFrame).trim() !== '';
  if (hasSelectedFrame) return normalizeSelectedFrameLevel(user.selectedFrame);

  const activeNumeric = normalizeSelectedFrameLevel(user.activeFrame);
  if (activeNumeric > 0) return activeNumeric;

  const classNumeric = parseFrameClassToken(user.activeFrameClass);
  if (classNumeric > 0) return classNumeric;

  return normalizeSelectedFrameLevel(defaultFrame);
}

function getCanonicalSelectedFrame(user = {}, options = {}) {
  const defaultFrame = normalizeSelectedFrameLevel(options.defaultFrame ?? 0);
  const accountLevel = normalizeAccountLevel(options.accountLevel ?? user.accountLevel ?? getAccountLevel(user));
  const resolved = resolveRawSelectedFrame(user, defaultFrame);
  return isSelectedFrameUnlocked(resolved, accountLevel) ? resolved : 0;
}

function buildFrameState(selectedFrame = 0, accountLevel = 1) {
  const safeSelectedFrame = normalizeSelectedFrameLevel(selectedFrame);
  const safeAccountLevel = normalizeAccountLevel(accountLevel);
  const unlocked = isSelectedFrameUnlocked(safeSelectedFrame, safeAccountLevel);
  const activeFrame = unlocked ? safeSelectedFrame : 0;
  return Object.freeze({
    selectedFrame: activeFrame,
    requestedFrame: safeSelectedFrame,
    accountLevel: safeAccountLevel,
    assetIndex: getFrameAssetIndexForLevel(activeFrame),
    unlocked,
    frameless: activeFrame === 0,
    requirementLevel: safeSelectedFrame > 0 ? safeSelectedFrame : 0
  });
}

function buildCanonicalUserState(user = {}, options = {}) {
  const progression = buildProgressionSnapshot(user);
  const monthlyActiveScore = normalizeInt(user.monthlyActiveScore ?? progression.monthlyActivity, 0, Number.MAX_SAFE_INTEGER, 0);
  const accountLevel = normalizeAccountLevel(progression.accountLevel);
  const accountXp = normalizeInt(progression.accountXp, 0, Number.MAX_SAFE_INTEGER, 0);
  const accountXpExact = getAccountXpExact({ ...user, ...progression });
  const selectedFrame = getCanonicalSelectedFrame(user, { accountLevel, defaultFrame: options.defaultFrame ?? 0 });

  return {
    accountXp,
    accountXpExact,
    xp: accountXp,
    accountLevel,
    level: accountLevel,
    accountLevelScore: accountXp,
    accountLevelScoreExact: accountXpExact,
    accountLevelProgressPct: progression.accountLevelProgressPct,
    accountLevelCurrentXp: progression.accountLevelCurrentXp,
    accountLevelNextXp: progression.accountLevelNextXp,
    accountLevelRemainingXp: progression.accountLevelRemainingXp,
    accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION,
    accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE,
    selectedFrame,
    monthlyActiveScore,
    progression: {
      ...progression,
      accountXp,
      accountXpExact,
      accountLevel,
      accountLevelScore: accountXp,
      accountLevelScoreExact: accountXpExact,
      selectedFrame,
      accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION,
      accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE,
      monthlyActivity: monthlyActiveScore
    }
  };
}

module.exports = {
  FRAME_LEVEL_CAP,
  FRAME_LEVEL_TO_ASSET,
  normalizeSelectedFrameLevel,
  getFrameAssetIndexForLevel,
  isSelectedFrameUnlocked,
  buildFrameState,
  parseFrameClassToken,
  getCanonicalSelectedFrame,
  buildCanonicalUserState
};
