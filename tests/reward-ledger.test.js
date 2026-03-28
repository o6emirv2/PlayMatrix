'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRewardSource, normalizeRewardLedgerItem, formatRewardLabel } = require('../utils/rewardLedger');

test('ödül kaynak aliasları kanonik kaynağa çevrilir', () => {
  const normalized = normalizeRewardSource('pisti_room_reward', { mode: '2-52' });
  assert.equal(normalized.source, 'pisti_online_win');
  assert.equal(normalized.meta.reason, 'room');
});

test('satranç varyant ödülleri tek label sisteminde doğru okunur', () => {
  const normalizedItem = normalizeRewardLedgerItem({
    id: 'doc-1',
    source: 'chess_disconnect_win',
    uid: 'user-1',
    amount: 5000,
    meta: {}
  });

  assert.equal(normalizedItem.source, 'chess_win');
  assert.equal(normalizedItem.meta.reason, 'disconnect');
  assert.equal(formatRewardLabel(normalizedItem.source, normalizedItem.meta), 'Satranç Teknik Galibiyet');
});

test('davet ödülleri anlamlı Türkçe etiket döndürür', () => {
  assert.equal(formatRewardLabel('referral_inviter'), 'Davet Eden Bonusu');
  assert.equal(formatRewardLabel('referral_invitee'), 'Davet Katılım Bonusu');
});
