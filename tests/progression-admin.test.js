'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractInlineAdminContext,
  hasAdminPermission,
  hasEveryPermission,
  expandRolePermissions
} = require('../middlewares/admin.middleware');
const { buildProgressionSnapshot } = require('../utils/progression');

test('sadece superadmin rolü tüm izinleri genişletir', () => {
  const perms = expandRolePermissions('superadmin');
  assert.deepEqual(perms, ['*']);
  assert.deepEqual(expandRolePermissions('support'), []);
});

test('claim tabanlı yetki artık admin vermez; yalnız env whitelist çalışır', () => {
  process.env.ADMIN_UIDS = 'TAwee0MuAuPKEP156leMcSIHjzh2';
  process.env.ADMIN_EMAILS = 'o6emirv2@gmail.com';

  const rejected = extractInlineAdminContext({
    uid: 'user-1',
    email: 'ops@example.com',
    claims: { admin: true, role: 'moderator' }
  });

  assert.equal(rejected.isAdmin, false);
  assert.equal(hasAdminPermission(rejected, 'moderation.write'), false);
  assert.equal(hasEveryPermission(rejected, ['admin.read', 'users.read']), false);

  const accepted = extractInlineAdminContext({
    uid: 'TAwee0MuAuPKEP156leMcSIHjzh2',
    email: 'o6emirv2@gmail.com'
  });

  assert.equal(accepted.isAdmin, true);
  assert.equal(hasAdminPermission(accepted, 'moderation.write'), true);
  assert.equal(hasAdminPermission(accepted, 'rewards.write'), true);
  assert.equal(hasEveryPermission(accepted, ['admin.read', 'users.read']), true);
});

test('progression snapshot yeni VIP terminolojisini ve meta alanlarını üretir', () => {
  const snapshot = buildProgressionSnapshot({
    rp: 4200,
    seasonRp: 1250,
    level: 18,
    monthlyActiveScore: 44,
    vipLevel: 7,
    vipPoints: 42000,
    totalSpentMc: 750000
  });

  assert.equal(snapshot.accountLevel, 18);
  assert.equal(snapshot.competitiveScore, 4200);
  assert.equal(snapshot.totalRank, 'Gold');
  assert.equal(snapshot.totalRankScore, 4200);
  assert.equal(snapshot.seasonScore, 1250);
  assert.equal(snapshot.seasonRank, 'Silver');
  assert.equal(snapshot.monthlyActivity, 44);
  assert.equal(snapshot.labels.accountLevel, 'Hesap Seviyesi');
  assert.equal(snapshot.labels.totalRank, 'Toplam Rank');
  assert.equal(snapshot.rank, 'Silver');
  assert.equal(snapshot.vipLevel, 7);
  assert.equal(snapshot.vipBand, 4);
  assert.equal(snapshot.vipName, 'Platinum');
  assert.equal(snapshot.vipLabel, 'Platinum 7');
  assert.equal(snapshot.vipProgress.nextLabel, 'Diamond 8');
  assert.equal(snapshot.accountLevelScore > 0, true);
});
