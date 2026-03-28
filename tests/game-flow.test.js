'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeUidList,
  buildTimelineEvent,
  appendTimelineEntry,
  bumpStateVersion,
  evaluateInviteRoomState
} = require('../utils/gameFlow');

test('sanitizeUidList tekrarları ve boş değerleri temizler', () => {
  assert.deepEqual(sanitizeUidList(['a', '', 'a', ' b ', null, 'b']), ['a', 'b']);
});

test('timeline helper son kayıtları limitli tutar ve stateVersion artırır', () => {
  const room = { stateVersion: 3, timeline: [{ type: 'old' }] };
  appendTimelineEntry(room, buildTimelineEvent('player_joined', { actorUid: 'u2', participantUids: ['u1', 'u2'] }), { limit: 2 });
  appendTimelineEntry(room, buildTimelineEvent('match_started', { actorUid: 'u2', participantUids: ['u1', 'u2'] }), { limit: 2 });
  bumpStateVersion(room);
  assert.equal(room.timeline.length, 2);
  assert.equal(room.timeline[0].type, 'player_joined');
  assert.equal(room.timeline[1].type, 'match_started');
  assert.equal(room.stateVersion, 4);
});

test('chess invite state guest başka oyuncuysa bloklar', () => {
  const decision = evaluateInviteRoomState(
    { status: 'waiting', host: { uid: 'host' }, guest: { uid: 'other' } },
    { gameKey: 'chess', targetUid: 'guest' },
    'guest'
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.code, 'ROOM_FULL');
});

test('chess invite state hedef aynı oyuncuysa playing odada rejoin izin verir', () => {
  const decision = evaluateInviteRoomState(
    { status: 'playing', host: { uid: 'host' }, guest: { uid: 'guest' } },
    { gameKey: 'chess', targetUid: 'guest' },
    'guest'
  );
  assert.equal(decision.ok, true);
});

test('pisti invite state waiting ve yer varsa izin verir', () => {
  const decision = evaluateInviteRoomState(
    { status: 'waiting', maxPlayers: 4, players: [{ uid: 'host' }, { uid: 'p2' }] },
    { gameKey: 'pisti', targetUid: 'guest' },
    'guest'
  );
  assert.equal(decision.ok, true);
});

test('pisti invite state playing ve hedef içeride değilse bloklar', () => {
  const decision = evaluateInviteRoomState(
    { status: 'playing', maxPlayers: 2, players: [{ uid: 'host' }, { uid: 'other' }] },
    { gameKey: 'pisti', targetUid: 'guest' },
    'guest'
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.code, 'ROOM_NOT_JOINABLE');
});
