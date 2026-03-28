
'use strict';

const { cleanStr, safeNum, nowMs } = require('./helpers');

const GAME_LABELS = Object.freeze({
  chess: 'Satranç',
  pisti: 'Online Pişti',
  blackjack: 'BlackJack',
  crash: 'Crash',
  mines: 'Mines'
});

function gameLabel(key = '') {
  const safeKey = cleanStr(key || '', 24).toLowerCase();
  return GAME_LABELS[safeKey] || safeKey || 'Oyun';
}

function buildSpectatorPath(gameType = '', roomId = '') {
  const safeGameType = cleanStr(gameType || '', 24).toLowerCase();
  const safeRoomId = cleanStr(roomId || '', 160);
  if (!safeRoomId) return '';
  if (safeGameType === 'chess') return `/Online Oyunlar/Satranc.html?spectateRoom=${encodeURIComponent(safeRoomId)}`;
  if (safeGameType === 'pisti') return `/Online Oyunlar/Pisti.html?spectateRoom=${encodeURIComponent(safeRoomId)}`;
  if (safeGameType === 'blackjack') return `/Casino/BlackJack.html?spectateRoom=${encodeURIComponent(safeRoomId)}`;
  return '';
}

function mapSpectatorCandidate(item = {}) {
  const gameType = cleanStr(item?.gameType || '', 24).toLowerCase();
  const roomId = cleanStr(item?.roomId || '', 160);
  const status = cleanStr(item?.status || '', 24).toLowerCase();
  const canWatch = !!roomId && ['waiting', 'playing', 'resolving'].includes(status) && ['chess', 'pisti', 'blackjack'].includes(gameType);
  return {
    gameType,
    gameLabel: gameLabel(gameType),
    roomId,
    status,
    canWatch,
    watchLabel: canWatch ? 'İzle' : 'Hazır Değil',
    spectatorPath: canWatch ? buildSpectatorPath(gameType, roomId) : '',
    cleanupAt: safeNum(item?.cleanupAt, 0),
    resumeAvailableUntil: safeNum(item?.resumeAvailableUntil || item?.cleanupAt, 0),
    liveBadge: status === 'playing' ? 'Canlı' : (status === 'waiting' ? 'Bekliyor' : 'İnceleme'),
    note: canWatch ? `${gameLabel(gameType)} odası için izleme bilgisi hazır.` : 'Bu oturum izleme moduna uygun değil.'
  };
}

function buildSpectatorModeCenter(activeSessions = [], featureFlags = {}) {
  const items = (Array.isArray(activeSessions) ? activeSessions : []).map(mapSpectatorCandidate).filter((item) => item.canWatch).slice(0, 8);
  return {
    enabled: featureFlags.spectatorMode !== false,
    label: 'Canlı izleme merkezi',
    totalCandidates: items.length,
    available: items.length > 0,
    items,
    summaryLabel: items.length ? `${items.length} canlı oturum izlemeye uygun.` : 'Şu anda izlenebilir canlı oturum yok.'
  };
}

function buildMatchSummaryShareCard(matchItem = {}, options = {}) {
  const perspectiveName = cleanStr(options?.perspectiveName || 'Sen', 40) || 'Sen';
  const title = cleanStr(matchItem?.title || gameLabel(matchItem?.gameType || ''), 60) || 'Maç Özeti';
  const outcome = cleanStr(matchItem?.outcome || 'neutral', 16);
  const outcomeLabel = outcome === 'win' ? 'Galibiyet' : (outcome === 'loss' ? 'Mağlubiyet' : (outcome === 'draw' ? 'Berabere' : 'Tamamlandı'));
  const rewardMc = safeNum(matchItem?.rewardMc, 0);
  const createdAt = safeNum(matchItem?.createdAt, 0);
  const lines = [
    `${title} · ${outcomeLabel}`,
    `${perspectiveName} · ${rewardMc.toLocaleString('tr-TR')} MC`,
    createdAt ? new Date(createdAt).toLocaleString('tr-TR') : 'Zaman bilgisi hazır değil'
  ];
  return {
    matchId: cleanStr(matchItem?.id || '', 220),
    title,
    subtitle: `${outcomeLabel} · ${gameLabel(matchItem?.gameType || '')}`,
    outcome,
    outcomeLabel,
    rewardMc,
    cardLines: lines,
    shareText: `${title} | ${outcomeLabel} | ${rewardMc.toLocaleString('tr-TR')} MC | PlayMatrix`,
    badge: rewardMc > 0 ? `${rewardMc.toLocaleString('tr-TR')} MC` : outcomeLabel,
    generatedAt: nowMs()
  };
}

function buildReplayCenter(matchItems = [], options = {}) {
  const perspectiveName = cleanStr(options?.perspectiveName || 'Sen', 40) || 'Sen';
  const items = (Array.isArray(matchItems) ? matchItems : []).slice(0, 10).map((item) => {
    const shareCard = buildMatchSummaryShareCard(item, { perspectiveName });
    return {
      matchId: shareCard.matchId,
      gameType: cleanStr(item?.gameType || '', 24).toLowerCase(),
      gameLabel: gameLabel(item?.gameType || ''),
      outcome: cleanStr(item?.outcome || 'neutral', 16),
      outcomeLabel: shareCard.outcomeLabel,
      result: cleanStr(item?.result || '', 160),
      createdAt: safeNum(item?.createdAt, 0),
      rewardMc: safeNum(item?.rewardMc, 0),
      replayLabel: 'Maç Özeti',
      replayAvailable: !!shareCard.matchId,
      shareCard,
      summaryLabel: `${shareCard.outcomeLabel} · ${shareCard.rewardMc.toLocaleString('tr-TR')} MC`
    };
  });
  return {
    enabled: true,
    count: items.length,
    lastMatches: items,
    summaryLabel: items.length ? `${items.length} maç özeti hazır.` : 'Henüz maç özeti yok.',
    latestShareCard: items[0]?.shareCard || null
  };
}

function buildPostGameAnalytics(matchItems = []) {
  const items = Array.isArray(matchItems) ? matchItems : [];
  let wins = 0; let losses = 0; let draws = 0; let rewardMc = 0;
  const gameCounts = new Map();
  let streakType = ''; let streakCount = 0;
  items.forEach((item, index) => {
    const outcome = cleanStr(item?.outcome || 'neutral', 16);
    if (outcome === 'win') wins += 1;
    else if (outcome === 'loss') losses += 1;
    else if (outcome === 'draw') draws += 1;
    rewardMc += safeNum(item?.rewardMc, 0);
    const safeGameType = cleanStr(item?.gameType || '', 24).toLowerCase();
    if (safeGameType) gameCounts.set(safeGameType, (gameCounts.get(safeGameType) || 0) + 1);
    if (index === 0) {
      streakType = outcome;
      streakCount = 1;
    } else if (outcome && outcome === streakType) streakCount += 1;
  });
  const total = items.length;
  const primaryGame = Array.from(gameCounts.entries()).sort((a, b) => b[1] - a[1])[0] || [];
  return {
    totalMatches: total,
    winRatePct: total ? Math.round((wins / Math.max(1, total)) * 100) : 0,
    rewardMc,
    streak: { type: streakType || 'neutral', count: streakCount, label: streakCount ? `${streakCount} maçlık seri` : 'Seri yok' },
    gameDiversity: gameCounts.size,
    primaryGame: primaryGame[0] ? { gameType: primaryGame[0], gameLabel: gameLabel(primaryGame[0]), matches: primaryGame[1] } : null,
    summaryLabel: total ? `%${total ? Math.round((wins / Math.max(1, total)) * 100) : 0} kazanma oranı · ${rewardMc.toLocaleString('tr-TR')} MC` : 'Henüz analiz edilecek maç yok.'
  };
}

module.exports = {
  gameLabel,
  buildSpectatorPath,
  buildSpectatorModeCenter,
  buildMatchSummaryShareCard,
  buildReplayCenter,
  buildPostGameAnalytics
};
