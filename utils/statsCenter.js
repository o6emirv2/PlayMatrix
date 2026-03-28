'use strict';

const { CHAT_RETENTION_POLICY, SEASON_RESET_TIMEZONE } = require('../config/constants');
const { safeNum, nowMs } = require('./helpers');
const { buildProgressionSnapshot, normalizeUserRankState } = require('./progression');
const { getNextSeasonResetMeta } = require('./platformControl');

function buildLegacyDrift(user = {}) {
  const normalized = normalizeUserRankState(user);
  const mismatches = [];
  ['rp', 'rank', 'totalRp', 'competitiveScore', 'seasonRp', 'seasonScore', 'totalRank', 'totalRankKey', 'totalRankClass', 'seasonRank', 'seasonRankKey', 'seasonRankClass'].forEach((key) => {
    const left = user?.[key];
    const right = normalized?.[key];
    if (typeof right === 'number') {
      if (safeNum(left, Number.NaN) !== safeNum(right, Number.NaN)) mismatches.push(key);
      return;
    }
    if (String(left ?? '') !== String(right ?? '')) mismatches.push(key);
  });
  return {
    hasDrift: mismatches.length > 0,
    mismatches,
    canonicalState: normalized
  };
}

function buildResetScheduleSnapshot(date = new Date(), options = {}) {
  const nextReset = getNextSeasonResetMeta(date);
  const chatRetention = options.chatRetention && typeof options.chatRetention === 'object' ? options.chatRetention : CHAT_RETENTION_POLICY;
  return {
    timezone: SEASON_RESET_TIMEZONE,
    nextSeasonResetAt: safeNum(nextReset.timestamp, nowMs()),
    nextSeasonResetLabel: nextReset.label,
    nextActivityRewardResetAt: safeNum(nextReset.timestamp, nowMs()),
    nextActivityRewardResetLabel: nextReset.label,
    chatRetention: {
      lobbyDays: safeNum(chatRetention.lobbyDays, 7),
      directDays: safeNum(chatRetention.directDays, CHAT_RETENTION_POLICY.directDays),
      summaryLabel: chatRetention.summaryLabel || CHAT_RETENTION_POLICY.summaryLabel,
      lobbyLabel: chatRetention.lobbyLabel || CHAT_RETENTION_POLICY.lobbyLabel,
      directLabel: chatRetention.directLabel || CHAT_RETENTION_POLICY.directLabel
    }
  };
}

function buildStatsCenterSnapshot(user = {}, options = {}) {
  const progression = options.progression && typeof options.progression === 'object'
    ? options.progression
    : buildProgressionSnapshot(user);
  const drift = buildLegacyDrift(user);
  return {
    generatedAt: safeNum(options.generatedAt, nowMs()),
    accountLevel: progression.accountLevel,
    accountXp: progression.accountXp,
    accountLevelProgressPct: progression.accountLevelProgressPct,
    competitiveScore: progression.competitiveScore,
    totalRank: progression.totalRank,
    totalRankClass: progression.totalRankClass,
    totalRankScore: progression.totalRankScore,
    seasonRank: progression.seasonRank,
    seasonRankClass: progression.seasonRankClass,
    seasonRankScore: progression.seasonScore,
    monthlyActivity: progression.monthlyActivity,
    labels: progression.labels || {},
    canonical: {
      competitiveScore: progression.competitiveScore,
      totalRank: progression.totalRank,
      seasonRank: progression.seasonRank,
      seasonScore: progression.seasonScore,
      monthlyActivity: progression.monthlyActivity,
      accountLevel: progression.accountLevel,
      accountXp: progression.accountXp
    },
    legacyCompat: {
      rp: progression.competitiveScore,
      rank: progression.competitiveRank || progression.totalRank,
      totalRp: progression.competitiveScore,
      seasonRp: progression.seasonScore,
      seasonScore: progression.seasonScore
    },
    legacyDrift: drift
  };
}

module.exports = {
  buildLegacyDrift,
  buildResetScheduleSnapshot,
  buildStatsCenterSnapshot
};
