'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildPlatformControlSnapshot, buildSessionOverview, buildModerationOverview } = require('../utils/platformControl');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('platform control snapshot sezon, retention ve operasyon özetini üretir', () => {
  const snapshot = buildPlatformControlSnapshot({
    featureFlags: { vip: true, party: true },
    recentErrors: [{ severity: 'error' }, { severity: 'warn' }],
    rewardCatalogSummary: { total: 9, sources: ['register', 'wheel'] },
    activeSessions: [
      { gameType: 'chess', status: 'playing', canResume: true },
      { gameType: 'pisti', status: 'finished', canReview: true }
    ],
    users: [
      { isMuted: true },
      { isBanned: true, isFlagged: true },
      { isFlagged: true },
      {}
    ],
    opsHealth: { process: { pid: 1 }, host: { hostname: 'pm' }, errorSummary: { error: 1, warn: 1 } }
  });

  assert.equal(snapshot.ok, true);
  assert.match(snapshot.season.key, /^\d{4}-\d{2}$/);
  assert.match(snapshot.season.nextResetLabel, /^01\.\d{2}\.\d{4} 00:00 TSİ$/);
  assert.equal(snapshot.chatRetention.summaryLabel, 'Global 7 Gün · DM 14 Gün');
  assert.equal(snapshot.rewards.totalDefinitions, 9);
  assert.equal(snapshot.activeSessions.total, 2);
  assert.equal(snapshot.activeSessions.resumableCount, 1);
  assert.equal(snapshot.activeSessions.reviewCount, 1);
  assert.equal(snapshot.moderation.muted, 1);
  assert.equal(snapshot.moderation.banned, 1);
  assert.equal(snapshot.moderation.flagged, 2);
  assert.equal(snapshot.operations.featureFlagCount, 2);
  assert.equal(snapshot.operations.recentErrorCount, 2);
});

test('session ve moderation yardımcıları özet sayaçları doğru döner', () => {
  const sessionOverview = buildSessionOverview([
    { gameType: 'chess', status: 'waiting', canResume: true },
    { gameType: 'chess', status: 'playing', canResume: true },
    { gameType: 'pisti', status: 'abandoned', canReview: true }
  ]);
  const moderationOverview = buildModerationOverview([
    { isMuted: true },
    { isBanned: true },
    { isFlagged: true },
    {}
  ]);

  assert.deepEqual(sessionOverview.byGameType, { chess: 2, pisti: 1 });
  assert.deepEqual(sessionOverview.byStatus, { waiting: 1, playing: 1, abandoned: 1 });
  assert.equal(sessionOverview.resumableCount, 2);
  assert.equal(sessionOverview.reviewCount, 1);
  assert.equal(moderationOverview.restricted, 2);
  assert.equal(moderationOverview.reviewed, 3);
  assert.equal(moderationOverview.clean, 1);
});

test('admin ve sosyal route kaynak kodu platform kontrol endpointlerini içerir', () => {
  const adminRoute = read('routes/admin.routes.js');
  const socialRoute = read('routes/socialcenter.routes.js');
  assert.match(adminRoute, /\/admin\/platform\/control/);
  assert.match(adminRoute, /buildPlatformControlSnapshot/);
  assert.match(socialRoute, /\/platform\/control/);
  assert.match(socialRoute, /buildPlatformControlSnapshot/);
});
