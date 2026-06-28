// PlayMatrix frontend display policy mirrors /server/core/progressionService.js.
// Frontend must prefer backend-returned progression fields; these helpers are only safe display fallbacks.
export const ACCOUNT_LEVEL_CAP = 100;
export const ACCOUNT_PROGRESSION_VERSION = 'playmatrix-progression-v1';
export const ACCOUNT_LEVEL_CURVE_MODE = 'PM_TIERED_MULTIPLIER_BACKEND_V1';
export const ACCOUNT_BASE_XP = 250;
export const ACCOUNT_LEVEL_STEP_MULTIPLIER_RULES = Object.freeze([
  { fromLevel: 1, toLevel: 10, multiplier: 1.35, label: '1–10 x1.35' },
  { fromLevel: 10, toLevel: 30, multiplier: 1.45, label: '10–30 x1.45' },
  { fromLevel: 30, toLevel: 60, multiplier: 1.55, label: '30–60 x1.55' },
  { fromLevel: 60, toLevel: 80, multiplier: 1.70, label: '60–80 x1.70' },
  { fromLevel: 80, toLevel: 95, multiplier: 1.90, label: '80–95 x1.90' },
  { fromLevel: 95, toLevel: 100, multiplier: 2.25, label: '95–100 x2.25' }
]);
const MULTIPLIERS = Object.freeze([
  { from: 1, to: 10, num: 135n, den: 100n },
  { from: 10, to: 30, num: 145n, den: 100n },
  { from: 30, to: 60, num: 155n, den: 100n },
  { from: 60, to: 80, num: 170n, den: 100n },
  { from: 80, to: 95, num: 190n, den: 100n },
  { from: 95, to: 100, num: 225n, den: 100n }
]);
function parseXpBigInt(value = 0) {
  if (typeof value === 'bigint') return value > 0n ? value : 0n;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? BigInt(Math.floor(value)) : 0n;
  const raw = String(value ?? '0').replace(/[^0-9]/g, '');
  return raw ? BigInt(raw) : 0n;
}
function ceilDiv(a, b) { return (a + b - 1n) / b; }
function multiplierForTransition(level) { return MULTIPLIERS.find((range) => level >= range.from && level < range.to) || MULTIPLIERS[MULTIPLIERS.length - 1]; }
function buildCurve() {
  const steps = Array(ACCOUNT_LEVEL_CAP + 1).fill(0n);
  const totals = Array(ACCOUNT_LEVEL_CAP + 1).fill(0n);
  steps[1] = BigInt(ACCOUNT_BASE_XP);
  for (let level = 1; level < ACCOUNT_LEVEL_CAP; level += 1) {
    const step = level === 1 ? BigInt(ACCOUNT_BASE_XP) : steps[level];
    totals[level + 1] = totals[level] + step;
    const m = multiplierForTransition(level);
    steps[level + 1] = ceilDiv(step * m.num, m.den);
    if (steps[level + 1] < step) steps[level + 1] = step;
  }
  return { steps, totals };
}
const CURVE = buildCurve();
export const ACCOUNT_LEVEL_STEPS_EXACT = Object.freeze(CURVE.steps.map((v) => v.toString()));
export const ACCOUNT_LEVEL_THRESHOLDS_EXACT = Object.freeze(CURVE.totals.map((v) => v.toString()));
function safeNumber(value) { return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.MAX_SAFE_INTEGER; }
function normalizeAccountLevel(level = 1) { const parsed = Math.floor(Number(level) || 1); return Math.max(1, Math.min(ACCOUNT_LEVEL_CAP, parsed)); }
export function normalizeAccountXp(value = 0) { return safeNumber(parseXpBigInt(value)); }
export function normalizeAccountXpExact(value = 0) { return parseXpBigInt(value).toString(); }
export function formatXpExact(value = 0) { return normalizeAccountXpExact(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
export function compactXpExact(value = 0) { const exact = normalizeAccountXpExact(value); if (exact.length <= 6) return formatXpExact(exact); const units = [[24, 'Sp'], [21, 'Sx'], [18, 'Qi'], [15, 'Qa'], [12, 'T'], [9, 'B'], [6, 'M']]; for (const [digits, label] of units) { if (exact.length > digits) { const head = exact.slice(0, exact.length - digits); const frac = exact.slice(exact.length - digits, exact.length - digits + 2).replace(/0+$/, ''); return `${head}${frac ? `,${frac}` : ''}${label}`; } } return formatXpExact(exact); }
export function getXpStepMultiplierForLevel(level = 1) { const safeLevel = normalizeAccountLevel(level); const rule = MULTIPLIERS.find((item) => safeLevel >= item.from && safeLevel < item.to); return rule ? Number(rule.num) / Number(rule.den) : 0; }
export function getXpStepExactForLevel(level = 1) { const safeLevel = normalizeAccountLevel(level); return safeLevel >= ACCOUNT_LEVEL_CAP ? '0' : (ACCOUNT_LEVEL_STEPS_EXACT[safeLevel] || '0'); }
export function getXpStepForLevel(level = 1) { return normalizeAccountXp(getXpStepExactForLevel(level)); }
export function deriveXpExactFromLevel(level = 1) { return ACCOUNT_LEVEL_THRESHOLDS_EXACT[normalizeAccountLevel(level)] || '0'; }
export function deriveXpFromLevel(level = 1) { return normalizeAccountXp(deriveXpExactFromLevel(level)); }
export function getAccountLevelFromXp(xp = 0) { const safeXp = parseXpBigInt(xp); let resolved = 1; for (let level = 1; level <= ACCOUNT_LEVEL_CAP; level += 1) { if (safeXp >= parseXpBigInt(deriveXpExactFromLevel(level))) resolved = level; else break; } return normalizeAccountLevel(resolved); }
export function getAccountLevelProgressFromXp(xp = 0) {
  const accountXpExact = normalizeAccountXpExact(xp);
  const accountXpBig = parseXpBigInt(accountXpExact);
  const accountLevel = getAccountLevelFromXp(accountXpExact);
  const currentLevelXpExact = deriveXpExactFromLevel(accountLevel);
  const nextLevelXpExact = accountLevel >= ACCOUNT_LEVEL_CAP ? currentLevelXpExact : deriveXpExactFromLevel(accountLevel + 1);
  const currentBig = parseXpBigInt(currentLevelXpExact);
  const nextBig = parseXpBigInt(nextLevelXpExact);
  const spanBig = nextBig > currentBig ? nextBig - currentBig : 1n;
  const progressBig = accountLevel >= ACCOUNT_LEVEL_CAP ? spanBig : (accountXpBig > currentBig ? accountXpBig - currentBig : 0n);
  const remainingBig = accountLevel >= ACCOUNT_LEVEL_CAP ? 0n : (nextBig > accountXpBig ? nextBig - accountXpBig : 0n);
  const accountLevelProgressPct = accountLevel >= ACCOUNT_LEVEL_CAP ? 100 : Math.max(0, Math.min(100, Number((progressBig * 10000n) / spanBig) / 100));
  return { accountXp: normalizeAccountXp(accountXpExact), accountXpExact, accountXpLabel: compactXpExact(accountXpExact), accountXpFullLabel: formatXpExact(accountXpExact), accountLevel, accountLevelProgressPct, accountLevelCurrentXp: normalizeAccountXp(currentLevelXpExact), accountLevelCurrentXpExact: currentLevelXpExact, accountLevelCurrentXpLabel: compactXpExact(currentLevelXpExact), accountLevelNextXp: normalizeAccountXp(nextLevelXpExact), accountLevelNextXpExact: nextLevelXpExact, accountLevelNextXpLabel: compactXpExact(nextLevelXpExact), accountLevelSpanXp: normalizeAccountXp(spanBig), accountLevelSpanXpExact: spanBig.toString(), accountLevelSpanXpLabel: compactXpExact(spanBig), accountLevelRemainingXp: normalizeAccountXp(remainingBig), accountLevelRemainingXpExact: remainingBig.toString(), accountLevelRemainingXpLabel: compactXpExact(remainingBig), accountLevelScore: normalizeAccountXp(accountXpExact), accountLevelScoreExact: accountXpExact, accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION, accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE, accountLevelBaseXp: ACCOUNT_BASE_XP };
}
export const PMProgressionPolicy = Object.freeze({ ACCOUNT_LEVEL_CAP, ACCOUNT_PROGRESSION_VERSION, ACCOUNT_LEVEL_CURVE_MODE, ACCOUNT_BASE_XP, ACCOUNT_LEVEL_STEP_MULTIPLIER_RULES, ACCOUNT_LEVEL_STEPS_EXACT, ACCOUNT_LEVEL_THRESHOLDS_EXACT, normalizeAccountXp, normalizeAccountXpExact, formatXpExact, compactXpExact, getXpStepMultiplierForLevel, getXpStepForLevel, getXpStepExactForLevel, deriveXpFromLevel, deriveXpExactFromLevel, getAccountLevelFromXp, getAccountLevelProgressFromXp });
