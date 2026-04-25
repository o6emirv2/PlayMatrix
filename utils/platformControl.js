'use strict';

const {
  CHAT_RETENTION_POLICY,
  ACTIVITY_RESET_TIMEZONE,
  ACTIVITY_RESET_WINDOW_HOURS,
  MONTHLY_REWARD_WINDOW_HOURS
} = require('../config/constants');
const { buildRewardFlowOverview, buildRewardCatalogSummary, REWARD_POLICY_VERSION } = require('../config/rewardCatalog');
const { getActivityCalendarParts, getPreviousActivityPeriodKey } = require('./activityPeriod');
const { buildProgressionPolicySummary, ACCOUNT_PROGRESSION_VERSION } = require('./progression');
const { safeNum, nowMs } = require('./helpers');

function buildTsiTimestamp(year, month, day = 1, hour = 0, minute = 0, second = 0) {
  return Date.UTC(year, month - 1, day, hour, minute, second) - (3 * 60 * 60 * 1000);
}

function getNextActivityResetMeta(date = new Date()) {
  const current = getActivityCalendarParts(date, ACTIVITY_RESET_TIMEZONE);
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const timestamp = buildTsiTimestamp(nextYear, nextMonth, 1, 0, 0, 0);
  const label = `${String(1).padStart(2, '0')}.${String(nextMonth).padStart(2, '0')}.${nextYear} 00:00 TSİ`;
  return { timestamp, label, timezone: ACTIVITY_RESET_TIMEZONE };
}

function getActivityResetWindowMeta(date = new Date()) {
  const period = getActivityCalendarParts(date, ACTIVITY_RESET_TIMEZONE);
  const currentResetAt = buildTsiTimestamp(period.year, period.month, 1, 0, 0, 0);
  const activityWindowClosesAt = currentResetAt + (safeNum(ACTIVITY_RESET_WINDOW_HOURS, 6) * 60 * 60 * 1000);
  const monthlyWindowClosesAt = currentResetAt + (safeNum(MONTHLY_REWARD_WINDOW_HOURS, 6) * 60 * 60 * 1000);
  const currentTime = date instanceof Date ? date.getTime() : nowMs();
  return {
    timezone: ACTIVITY_RESET_TIMEZONE,
    currentPeriodKey: period.periodKey,
    previousPeriodKey: getPreviousActivityPeriodKey(period.periodKey),
    resetAt: currentResetAt,
    resetLabel: `${String(1).padStart(2, '0')}.${String(period.month).padStart(2, '0')}.${period.year} 00:00 TSİ`,
    activityWindowHours: safeNum(ACTIVITY_RESET_WINDOW_HOURS, 6),
    monthlyWindowHours: safeNum(MONTHLY_REWARD_WINDOW_HOURS, 6),
    activityWindowClosesAt,
    monthlyWindowClosesAt,
    isActivityResetWindowOpen: currentTime >= currentResetAt && currentTime < activityWindowClosesAt,
    isMonthlyRewardWindowOpen: currentTime >= currentResetAt && currentTime < monthlyWindowClosesAt,
    rewardMonthKey: getPreviousActivityPeriodKey(period.periodKey)
  };
}

function buildSessionOverview(activeSessions = []) {
  const rows = Array.isArray(activeSessions) ? activeSessions.filter(Boolean) : [];
  const byGameType = {};
  const byStatus = {};
  let resumableCount = 0;
  let reviewCount = 0;

  rows.forEach((entry) => {
    const gameType = String(entry?.gameType || 'unknown').trim() || 'unknown';
    const status = String(entry?.status || 'unknown').trim() || 'unknown';
    byGameType[gameType] = safeNum(byGameType[gameType], 0) + 1;
    byStatus[status] = safeNum(byStatus[status], 0) + 1;
    if (entry?.canResume) resumableCount += 1;
    if (entry?.canReview) reviewCount += 1;
  });

  return {
    total: rows.length,
    resumableCount,
    reviewCount,
    byGameType,
    byStatus
  };
}

function buildModerationOverview(users = []) {
  const rows = Array.isArray(users) ? users.filter(Boolean) : [];
  const summary = {
    total: rows.length,
    muted: 0,
    banned: 0,
    flagged: 0,
    clean: 0
  };

  rows.forEach((row) => {
    const muted = !!row?.isMuted;
    const banned = !!row?.isBanned;
    const flagged = !!row?.isFlagged;
    if (muted) summary.muted += 1;
    if (banned) summary.banned += 1;
    if (flagged) summary.flagged += 1;
    if (!muted && !banned && !flagged) summary.clean += 1;
  });

  return {
    ...summary,
    restricted: summary.muted + summary.banned,
    reviewed: summary.total - summary.clean
  };
}

function buildPlatformControlSnapshot(options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const period = getActivityCalendarParts(date, ACTIVITY_RESET_TIMEZONE);
  const nextReset = getNextActivityResetMeta(date);
  const resetWindow = getActivityResetWindowMeta(date);
  const rewardCatalogSummary = options.rewardCatalogSummary && typeof options.rewardCatalogSummary === 'object'
    ? options.rewardCatalogSummary
    : buildRewardCatalogSummary({ includePrivate: false });
  const progressionSummary = options.progressionSummary && typeof options.progressionSummary === 'object'
    ? options.progressionSummary
    : buildProgressionPolicySummary();
  const featureFlags = options.featureFlags && typeof options.featureFlags === 'object'
    ? options.featureFlags
    : {};
  const opsHealth = options.opsHealth && typeof options.opsHealth === 'object'
    ? options.opsHealth
    : null;
  const recentErrors = Array.isArray(options.recentErrors) ? options.recentErrors : [];
  const moderation = buildModerationOverview(options.users || options.moderationRows || []);
  const activeSessions = buildSessionOverview(options.activeSessions || []);
  const rewardFlow = buildRewardFlowOverview({ verified: false, disposableEmail: false });

  return {
    ok: true,
    generatedAt: safeNum(options.generatedAt, nowMs()),
    activity: {
      key: period.periodKey,
      timezone: ACTIVITY_RESET_TIMEZONE,
      nextResetAt: nextReset.timestamp,
      nextResetLabel: nextReset.label,
      currentResetAt: resetWindow.resetAt,
      currentResetLabel: resetWindow.resetLabel,
      resetWindowOpen: resetWindow.isActivityResetWindowOpen,
      resetWindowClosesAt: resetWindow.activityWindowClosesAt,
      monthlyRewardWindowOpen: resetWindow.isMonthlyRewardWindowOpen,
      monthlyRewardWindowClosesAt: resetWindow.monthlyWindowClosesAt,
      previousPeriodKey: resetWindow.previousPeriodKey,
      rewardMonthKey: resetWindow.rewardMonthKey
    },
    chatRetention: {
      lobbyDays: safeNum(CHAT_RETENTION_POLICY.lobbyDays, 7),
      directDays: safeNum(CHAT_RETENTION_POLICY.directDays, 7),
      summaryLabel: CHAT_RETENTION_POLICY.summaryLabel,
      lobbyLabel: CHAT_RETENTION_POLICY.lobbyLabel,
      directLabel: CHAT_RETENTION_POLICY.directLabel
    },
    rewards: {
      policyVersion: REWARD_POLICY_VERSION,
      registrationFlowLabel: rewardFlow.registrationFlowLabel,
      catalogSummary: rewardCatalogSummary,
      sources: Array.isArray(rewardCatalogSummary.sources) ? rewardCatalogSummary.sources.length : 0,
      totalDefinitions: safeNum(rewardCatalogSummary.total || rewardCatalogSummary.itemCount, 0),
      referralInviterAmount: safeNum(rewardFlow.referral?.inviterAmount, 0),
      referralInviteeAmount: safeNum(rewardFlow.referral?.inviteeAmount, 0),
      monthlyActiveSummaryLabel: rewardFlow.monthlyActive?.summaryLabel || ''
    },
    progression: {
      policyVersion: ACCOUNT_PROGRESSION_VERSION,
      summary: progressionSummary
    },
    activeSessions,
    moderation,
    operations: {
      featureFlagCount: Object.keys(featureFlags).length,
      featureFlags,
      recentErrorCount: recentErrors.length,
      process: opsHealth?.process || null,
      host: opsHealth?.host || null,
      errorSummary: opsHealth?.errorSummary || null
    }
  };
}

module.exports = {
  getNextActivityResetMeta,
  getActivityResetWindowMeta,
  buildSessionOverview,
  buildModerationOverview,
  buildPlatformControlSnapshot
};
