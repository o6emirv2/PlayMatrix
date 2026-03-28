'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSocialHubSnapshot, buildUnifiedNotificationsCenter } = require('../utils/socialHub');

test('buildUnifiedNotificationsCenter adds derived social notifications', () => {
  const center = buildUnifiedNotificationsCenter([], {
    inviteCenter: { pendingCount: 2, summaryLabel: '2 davet bekliyor' },
    partyCenter: { counts: { incoming: 1, outgoing: 0 }, summaryLabel: 'Parti hareketli' },
    partyVoice: { enabled: true, label: 'Parti ses alanı hazır' }
  });
  assert.ok(center.unreadCount >= 2);
  assert.ok(center.items.some((item) => item.type === 'invite'));
  assert.ok(center.items.some((item) => item.type === 'party'));
});

test('buildSocialHubSnapshot returns notes and last played summary', () => {
  const snapshot = buildSocialHubSnapshot({
    friends: [
      { uid: 'u1', username: 'A', pinned: true, note: 'Takım arkadaşı', online: true, lastPlayedAt: Date.now() - 1000, seasonRp: 120 },
      { uid: 'u2', username: 'B', pinned: false, note: '', online: false, lastPlayedAt: 0 }
    ],
    recentPlayers: [{ uid: 'u1', username: 'A', seasonRp: 120 }],
    recentMatches: [{ id: 'm1', createdAt: Date.now() - 1000 }],
    notifications: [],
    inviteCenter: { pendingCount: 0 },
    partyCenter: { counts: { incoming: 0, outgoing: 0 } },
    partyVoice: { enabled: true, label: 'Ses hazır' }
  });
  assert.equal(snapshot.notes.total, 1);
  assert.equal(snapshot.pinnedFriends.length, 1);
  assert.equal(snapshot.partyVoice.enabled, true);
  assert.ok(snapshot.lastPlayedTogether.items.length >= 1);
});
