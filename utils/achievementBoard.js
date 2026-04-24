'use strict';

const { cleanStr, safeNum } = require('./helpers');

const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'first_win', label: 'İlk Zafer', description: 'İlk maç galibiyetini al.', metric: 'wins', target: 1, icon: '🏆' }),
  Object.freeze({ key: 'chess_rookie', label: 'Satranç Çaylağı', description: 'Satrançta 1 galibiyet al.', metric: 'chessWins', target: 1, icon: '♟️' }),
  Object.freeze({ key: 'activity_runner', label: 'Aktif Oyuncu', description: "Aylık aktiflik puanını 25'e çıkar.", metric: 'monthlyActiveScore', target: 25, icon: '⚡' }),
  Object.freeze({ key: 'reward_collector', label: 'Ödül Koleksiyoncusu', description: 'En az 5 ödül kaydı topla.', metric: 'rewardItems', target: 5, icon: '🎁' }),
  Object.freeze({ key: 'level_start', label: 'Seviye Başlangıcı', description: 'Hesap seviyeni 10 seviyesine çıkar.', metric: 'accountLevel', target: 10, icon: '📈' })
]);

const MISSION_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'mission_matches_3', label: '3 Maç Tamamla', description: 'Herhangi bir modda toplam 3 maç tamamla.', metric: 'matches', target: 3, bucket: 'core' }),
  Object.freeze({ key: 'mission_win_1', label: '1 Galibiyet Al', description: 'Günün akışını açmak için tek bir galibiyet yeterli.', metric: 'wins', target: 1, bucket: 'core' }),
  Object.freeze({ key: 'mission_activity_25', label: 'Aktiflik 25', description: 'Aylık aktiflik puanını 25 seviyesine getir.', metric: 'monthlyActiveScore', target: 25, bucket: 'activity' }),
  Object.freeze({ key: 'mission_reward_3', label: '3 Ödül Topla', description: 'Sistemde en az 3 farklı ödül kaydı üret.', metric: 'rewardItems', target: 3, bucket: 'economy' }),
  Object.freeze({ key: 'mission_level_25', label: 'Seviye 25', description: 'Hesap seviyeni 25 seviyesine taşı.', metric: 'accountLevel', target: 25, bucket: 'rank' })
]);

function clampProgress(current = 0, target = 1) {
  const safeTarget = Math.max(1, safeNum(target, 1));
  const safeCurrent = Math.max(0, safeNum(current, 0));
  return Math.max(0, Math.min(100, Math.round((safeCurrent / safeTarget) * 100)));
}

function buildMetricBag({ user = {}, matchSummary = {}, rewardSummary = {}, context = {} } = {}) {
  const byGame = matchSummary.byGame || {};
  return {
    wins: safeNum(matchSummary.wins, 0),
    matches: safeNum(matchSummary.totalMatches, 0),
    chessWins: safeNum(byGame.chess?.wins, 0),
    monthlyActiveScore: safeNum(user.monthlyActiveScore, 0),
    rewardItems: safeNum(rewardSummary.itemCount, 0),
    accountLevel: safeNum(user.accountLevel ?? user.level ?? user.progression?.accountLevel, 1),
    friendCount: safeNum(context.friendCount, 0)
  };
}

function decorateProgressItem(definition, metrics = {}) {
  const current = safeNum(metrics[definition.metric], 0);
  const target = safeNum(definition.target, 1);
  const unlocked = current >= target;
  return {
    key: cleanStr(definition.key || '', 64),
    label: cleanStr(definition.label || '', 80),
    description: cleanStr(definition.description || '', 220),
    metric: cleanStr(definition.metric || '', 64),
    bucket: cleanStr(definition.bucket || 'general', 24),
    icon: definition.icon || '⭐',
    current,
    target,
    unlocked,
    progressPct: clampProgress(current, target)
  };
}

function buildAchievementBoard({ user = {}, matchSummary = {}, rewardSummary = {}, context = {} } = {}) {
  const metrics = buildMetricBag({ user, matchSummary, rewardSummary, context });
  const items = ACHIEVEMENT_DEFINITIONS.map((definition) => decorateProgressItem(definition, metrics));
  const unlockedCount = items.filter((item) => item.unlocked).length;
  return {
    metrics,
    summary: {
      total: items.length,
      unlocked: unlockedCount,
      locked: Math.max(0, items.length - unlockedCount),
      completionPct: items.length ? Math.round((unlockedCount / items.length) * 100) : 0
    },
    items
  };
}

function buildMissionBoard({ user = {}, matchSummary = {}, rewardSummary = {}, context = {} } = {}) {
  const metrics = buildMetricBag({ user, matchSummary, rewardSummary, context });
  const items = MISSION_DEFINITIONS.map((definition) => decorateProgressItem(definition, metrics));
  const completedCount = items.filter((item) => item.unlocked).length;
  return {
    metrics,
    summary: {
      total: items.length,
      completed: completedCount,
      pending: Math.max(0, items.length - completedCount),
      completionPct: items.length ? Math.round((completedCount / items.length) * 100) : 0
    },
    items
  };
}

module.exports = {
  ACHIEVEMENT_DEFINITIONS,
  MISSION_DEFINITIONS,
  buildAchievementBoard,
  buildMissionBoard,
  buildMetricBag
};
