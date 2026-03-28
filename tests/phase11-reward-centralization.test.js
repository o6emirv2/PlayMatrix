'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getRewardDefinition, buildRewardCatalogSummary } = require('../config/rewardCatalog');
const { getWheelRewardPool, getActivityPassMilestones, buildRegistrationRewardSnapshot, buildRewardCatalogMap } = require('../utils/rewardCenter');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('ödül kataloğu özetine total ve sources alanları eklenir', () => {
  const summary = buildRewardCatalogSummary({ includePrivate: false });
  assert.ok(summary.total >= 9);
  assert.equal(summary.total, summary.itemCount);
  assert.ok(Array.isArray(summary.sources));
  assert.ok(summary.sources.includes('signup_reward'));
});

test('merkezi reward helper kayıt, çark ve activity pass meta üretir', () => {
  const map = buildRewardCatalogMap([
    getRewardDefinition('signup_reward'),
    getRewardDefinition('email_verify_reward'),
    getRewardDefinition('wheel_spin'),
    getRewardDefinition('activity_pass')
  ]);
  const registration = buildRegistrationRewardSnapshot(map);
  const wheelPool = getWheelRewardPool(map);
  const pass = getActivityPassMilestones(map);
  assert.equal(registration.signupAmount, 50000);
  assert.equal(registration.emailAmount, 100000);
  assert.ok(wheelPool.includes(50000));
  assert.equal(pass[0].level, 1);
  assert.equal(pass[0].rewardMc, 2500);
});

test('faz 11 entegrasyonları kaynak kodda görünür', () => {
  const profile = read('routes/profile.routes.js');
  const social = read('routes/socialcenter.routes.js');
  const chess = read('routes/chess.routes.js');
  const tasks = read('crons/tasks.js');
  assert.match(profile, /getRewardRuntimeCatalog\(/);
  assert.match(profile, /getWheelRewardPool\(rewardRuntime\.map\)/);
  assert.match(social, /getActivityPassMilestones/);
  assert.match(chess, /getChessRewardConfig/);
  assert.match(tasks, /getRewardLadder\('monthly_active_reward'/);
});
