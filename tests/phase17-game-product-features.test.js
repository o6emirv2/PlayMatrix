
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpectatorModeCenter, buildReplayCenter, buildMatchSummaryShareCard, buildPostGameAnalytics } = require('../utils/gameProductCenter');
const { buildGameExperienceHub } = require('../utils/experienceCenter');

test('phase17 spectator center builds watchable items', () => {
  const center = buildSpectatorModeCenter([
    { gameType: 'chess', roomId: 'room1', status: 'playing' },
    { gameType: 'blackjack', roomId: 'u1', status: 'resolving' },
    { gameType: 'crash', roomId: 'c1', status: 'playing' }
  ], { spectatorMode: true });
  assert.equal(center.enabled, true);
  assert.equal(center.totalCandidates, 2);
  assert.match(center.items[0].spectatorPath, /spectateRoom=/);
});

test('phase17 replay center and share card expose summary', () => {
  const match = { id: 'm1', gameType: 'chess', title: 'Satranç', outcome: 'win', rewardMc: 5000, createdAt: 1700000000000 };
  const replay = buildReplayCenter([match], { perspectiveName: 'Zed' });
  assert.equal(replay.count, 1);
  assert.equal(replay.latestShareCard.matchId, 'm1');
  const share = buildMatchSummaryShareCard(match, { perspectiveName: 'Zed' });
  assert.match(share.shareText, /PlayMatrix/);
});

test('phase17 analytics and experience hub include product features', () => {
  const matchItems = [
    { id: 'm1', gameType: 'chess', title: 'Satranç', outcome: 'win', rewardMc: 5000, createdAt: 1 },
    { id: 'm2', gameType: 'pisti', title: 'Online Pişti', outcome: 'win', rewardMc: 2000, createdAt: 2 },
    { id: 'm3', gameType: 'chess', title: 'Satranç', outcome: 'loss', rewardMc: 0, createdAt: 3 }
  ];
  const analytics = buildPostGameAnalytics(matchItems);
  assert.equal(analytics.totalMatches, 3);
  const hub = buildGameExperienceHub({
    activeSessions: [{ gameType: 'chess', roomId: 'r1', status: 'playing', canResume: true, resumePath: '/Online Oyunlar/Satranc.html?joinRoom=r1', resumeLabel: 'Oyuna Dön', antiStallThresholdMs: 16000 }],
    featureFlags: { reconnectOverlay: true, replayCenter: true, antiStallUi: true, spectatorMode: true },
    matchItems,
    user: { username: 'Zed' }
  });
  assert.equal(hub.spectatorMode.enabled, true);
  assert.equal(hub.replayCenter.count, 3);
  assert.ok(hub.matchSummaryShareCard.latest);
  assert.equal(hub.postGameAnalytics.totalMatches, 3);
});
