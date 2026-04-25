'use strict';

const { CHAT_RETENTION_POLICY, SEASON_RESET_TIMEZONE } = require('../config/constants');
const { getSeasonCalendarParts } = require('./season');
const { safeNum, nowMs } = require('./helpers');

function getNextSeasonResetMeta(date = new Date()) {
  const current = getSeasonCalendarParts(date, SEASON_RESET_TIMEZONE);
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const timestamp = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0) - (3 * 60 * 60 * 1000);
  const label = `${String(1).padStart(2, '0')}.${String(nextMonth).padStart(2, '0')}.${nextYear} 00:00 TSİ`;
  return { timestamp, label, timezone: SEASON_RESET_TIMEZONE };
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
  const season = getSeasonCalendarParts(date, SEASON_RESET_TIMEZONE);
  const nextReset = getNextSeasonResetMeta(date);
  const rewardCatalogSummary = options.rewardCatalogSummary && typeof options.rewardCatalogSummary === 'object'
    ? options.rewardCatalogSummary
    : {};
  const featureFlags = options.featureFlags && typeof options.featureFlags === 'object'
    ? options.featureFlags
    : {};
  const opsHealth = options.opsHealth && typeof options.opsHealth === 'object'
    ? options.opsHealth
    : null;
  const recentErrors = Array.isArray(options.recentErrors) ? options.recentErrors : [];
  const moderation = buildModerationOverview(options.users || options.moderationRows || []);
  const activeSessions = buildSessionOverview(options.activeSessions || []);

  return {
    ok: true,
    generatedAt: safeNum(options.generatedAt, nowMs()),
    season: {
      key: season.seasonKey,
      timezone: SEASON_RESET_TIMEZONE,
      nextResetAt: nextReset.timestamp,
      nextResetLabel: nextReset.label
    },
    chatRetention: {
      lobbyDays: safeNum(CHAT_RETENTION_POLICY.lobbyDays, 7),
      directDays: safeNum(CHAT_RETENTION_POLICY.directDays, 7),
      summaryLabel: CHAT_RETENTION_POLICY.summaryLabel,
      lobbyLabel: CHAT_RETENTION_POLICY.lobbyLabel,
      directLabel: CHAT_RETENTION_POLICY.directLabel
    },
    rewards: {
      registrationFlowLabel: '50.000 + 100.000 MC',
      catalogSummary: rewardCatalogSummary,
      sources: Array.isArray(rewardCatalogSummary.sources) ? rewardCatalogSummary.sources.length : 0,
      totalDefinitions: safeNum(rewardCatalogSummary.total, 0)
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
  getNextSeasonResetMeta,
  buildSessionOverview,
  buildModerationOverview,
  buildPlatformControlSnapshot
};
