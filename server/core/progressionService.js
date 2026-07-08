const MAX_LEVEL = 100;
const MAX_XP = 4000000000000n;
const FIRST_STEP_XP = 250n;

function normalizeXpBigInt(value = 0) {
  if (typeof value === 'bigint') return value > 0n ? (value > MAX_XP ? MAX_XP : value) : 0n;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? normalizeXpBigInt(BigInt(Math.floor(value))) : 0n;
  const raw = String(value ?? '0').replace(/[^0-9]/g, '');
  if (!raw) return 0n;
  const parsed = BigInt(raw);
  return parsed > MAX_XP ? MAX_XP : parsed;
}

function formatBigInt(value) {
  return normalizeXpBigInt(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function curveMultiplierForStep(level) {
  if (level < 10) return 1.35;
  if (level < 30) return 1.45;
  if (level < 60) return 1.55;
  if (level < 80) return 1.70;
  if (level < 95) return 1.90;
  return 2.25;
}

function buildCurve() {
  const rawSteps = Array(MAX_LEVEL + 1).fill(0);
  rawSteps[1] = Number(FIRST_STEP_XP);
  for (let level = 2; level < MAX_LEVEL; level += 1) {
    rawSteps[level] = rawSteps[level - 1] * curveMultiplierForStep(level - 1);
  }
  const rawTailTotal = rawSteps.slice(2, MAX_LEVEL).reduce((sum, item) => sum + item, 0) || 1;
  const targetTail = MAX_XP - FIRST_STEP_XP;
  const requiredStepByLevel = Array(MAX_LEVEL + 1).fill(0n);
  const totalXpByLevel = Array(MAX_LEVEL + 1).fill(0n);
  requiredStepByLevel[1] = FIRST_STEP_XP;
  totalXpByLevel[1] = 0n;
  totalXpByLevel[2] = FIRST_STEP_XP;
  let allocated = FIRST_STEP_XP;
  for (let level = 2; level < MAX_LEVEL; level += 1) {
    let step = level === MAX_LEVEL - 1
      ? MAX_XP - allocated
      : BigInt(Math.max(1, Math.floor((Number(targetTail) * rawSteps[level]) / rawTailTotal)));
    if (allocated + step > MAX_XP) step = MAX_XP - allocated;
    requiredStepByLevel[level] = step;
    totalXpByLevel[level + 1] = totalXpByLevel[level] + step;
    allocated += step;
  }
  totalXpByLevel[MAX_LEVEL] = MAX_XP;
  return {
    requiredStepByLevel,
    totalXpByLevel,
    rawSteps,
    firstStepXp: FIRST_STEP_XP.toString(),
    normalizedTargetXp: MAX_XP.toString(),
    curveMode: 'PM_V2_PROTOCOL_NORMALIZED_SEGMENTED_CURVE'
  };
}

const CURVE = buildCurve();
const THRESHOLDS = CURVE.totalXpByLevel.map((v) => Number(v <= BigInt(Number.MAX_SAFE_INTEGER) ? v : BigInt(Number.MAX_SAFE_INTEGER)));

function xpForLevel(level = 1) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(Number(level) || 1)));
  return CURVE.totalXpByLevel[safeLevel].toString();
}

function levelStepXp(level = 1) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL - 1, Math.trunc(Number(level) || 1)));
  return CURVE.requiredStepByLevel[safeLevel].toString();
}

function getProgression(xpValue = 0) {
  const xp = normalizeXpBigInt(xpValue);
  let level = 1;
  for (let candidate = 1; candidate <= MAX_LEVEL; candidate += 1) {
    if (xp >= CURVE.totalXpByLevel[candidate]) level = candidate;
    else break;
  }
  const isMaxLevel = level >= MAX_LEVEL;
  const currentLevelStartXp = CURVE.totalXpByLevel[level];
  const nextLevelXp = isMaxLevel ? MAX_XP : CURVE.totalXpByLevel[level + 1];
  const xpIntoLevel = xp > currentLevelStartXp ? xp - currentLevelStartXp : 0n;
  const xpToNextLevel = isMaxLevel ? 0n : (nextLevelXp > xp ? nextLevelXp - xp : 0n);
  const span = nextLevelXp > currentLevelStartXp ? nextLevelXp - currentLevelStartXp : 1n;
  const progressPercent = isMaxLevel ? 100 : Number((xpIntoLevel * 10000n) / span) / 100;
  const safeNumber = (v) => v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : Number.MAX_SAFE_INTEGER;
  return {
    level,
    xp: xp.toString(),
    maxXp: MAX_XP.toString(),
    currentLevelStartXp: currentLevelStartXp.toString(),
    nextLevelXp: nextLevelXp.toString(),
    requiredXpForNextLevel: levelStepXp(level),
    xpIntoLevel: xpIntoLevel.toString(),
    xpToNextLevel: xpToNextLevel.toString(),
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    isMaxLevel,
    xpLocked: isMaxLevel,
    xpAwarded: 0,
    xpReason: isMaxLevel ? 'MAX_LEVEL_REACHED' : '',
    formattedXp: formatBigInt(xp),
    formattedMaxXp: formatBigInt(MAX_XP),
    formattedNextLevelXp: formatBigInt(nextLevelXp),
    formattedXpToNextLevel: formatBigInt(xpToNextLevel),
    accountLevel: level,
    currentXp: safeNumber(xp),
    accountLevelProgressPct: Math.max(0, Math.min(100, progressPercent)),
    version: 'playmatrix-progression-final-protocol-4t',
    accountProgressionVersion: 'playmatrix-progression-final-protocol-4t',
    accountLevelCurveMode: 'PM_V2_PROTOCOL_NORMALIZED_SEGMENTED_CURVE',
    curveMode: 'PM_V2_PROTOCOL_NORMALIZED_SEGMENTED_CURVE'
  };
}

module.exports = { MAX_LEVEL, MAX_XP, FIRST_STEP_XP, THRESHOLDS, normalizeXpBigInt, formatBigInt, getProgression, xpForLevel, levelStepXp, CURVE };
