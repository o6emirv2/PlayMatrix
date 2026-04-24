export const PROFILE_STATS_MODULE = 'phase5-canonical-player-stats';

export function normalizePlayerStatsPayload(payload = {}) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const stats = data.statistics && typeof data.statistics === 'object' ? data.statistics : {};
  const gameStats = data.gameStats && typeof data.gameStats === 'object' ? data.gameStats : {};
  const total = gameStats.total && typeof gameStats.total === 'object' ? gameStats.total : {};
  const asNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return Object.freeze({
    uid: String(data.uid || '').trim(),
    username: String(data.username || 'Oyuncu').trim() || 'Oyuncu',
    avatar: String(data.avatar || '').trim(),
    selectedFrame: Math.max(0, Math.min(100, Math.floor(asNumber(data.selectedFrame ?? data.progression?.selectedFrame, 0)))),
    accountLevel: Math.max(1, Math.min(100, Math.floor(asNumber(data.accountLevel ?? data.level ?? data.progression?.accountLevel, 1)))),
    accountXp: Math.max(0, asNumber(data.accountXp ?? data.progression?.accountXp, 0)),
    accountLevelProgressPct: Math.max(0, Math.min(100, asNumber(data.accountLevelProgressPct ?? data.progression?.accountLevelProgressPct, 0))),
    monthlyActiveScore: Math.max(0, asNumber(data.monthlyActiveScore ?? data.progression?.monthlyActivity ?? stats.monthlyActiveScore, 0)),
    totalRounds: Math.max(0, asNumber(data.totalRounds ?? total.rounds ?? stats.totalRounds, 0)),
    totalWins: Math.max(0, asNumber(data.totalWins ?? total.wins ?? stats.totalWins, 0)),
    totalLosses: Math.max(0, asNumber(data.totalLosses ?? total.losses ?? stats.totalLosses, 0)),
    totalDraws: Math.max(0, asNumber(data.totalDraws ?? total.draws ?? stats.totalDraws, 0)),
    winRatePct: Math.max(0, Math.min(100, asNumber(data.winRatePct ?? data.winRate ?? total.winRatePct ?? stats.winRatePct, 0))),
    gameStats,
    recentGames: Array.isArray(data.recentGames) ? data.recentGames.slice(0, 6) : []
  });
}

export function buildPlayerStatsRows(payload = {}) {
  const normalized = normalizePlayerStatsPayload(payload);
  return Object.freeze({
    general: [
      ['Seviye', String(normalized.accountLevel)],
      ['Hesap XP', String(Math.round(normalized.accountXp))],
      ['Aylık Aktiflik', String(Math.round(normalized.monthlyActiveScore))],
      ['Toplam Oyun', String(Math.round(normalized.totalRounds))],
      ['Kazanma Oranı', `%${normalized.winRatePct.toFixed(1)}`]
    ],
    recentGames: normalized.recentGames
  });
}
