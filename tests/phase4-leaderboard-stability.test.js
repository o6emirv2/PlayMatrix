'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildLeaderboardPayload, getLeaderboardCategoryMeta } = require('../utils/leaderboardCenter');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('leaderboard payload degraded/stale meta üretir', () => {
  const payload = buildLeaderboardPayload({
    levelTop: [{ uid: 'u1', username: 'Zed', accountLevel: 11 }],
    seasonTop: []
  }, { degradedTabs: ['season'], stale: true, source: 'cache' });

  assert.equal(payload.levelTop.length, 1);
  assert.equal(payload.rankTop.length, 0);
  assert.equal(payload.leaderboardMeta.state, 'partial');
  assert.equal(payload.leaderboardMeta.stale, true);
  assert.equal(payload.leaderboardMeta.source, 'cache');
  assert.equal(payload.leaderboardMeta.degradedTabs.includes('season'), true);
  assert.equal(getLeaderboardCategoryMeta('activity').scoreLabel, 'AKTİFLİK');
});

test('phase4 kaynakları leaderboard fallback ve stats-center cache içerir', () => {
  const profileText = read(path.join('routes', 'profile.routes.js'));
  const scriptText = read('script.js');
  assert.match(profileText, /leaderboardPayloadCache/);
  assert.match(profileText, /statsCenterCache/);
  assert.match(profileText, /buildLeaderboardResponsePayload/);
  assert.match(profileText, /source: 'cache'/);
  assert.match(scriptText, /getLeaderboardEmptyMessage/);
  assert.match(scriptText, /leaderboardRetryBtn/);
  assert.match(scriptText, /currentLeaderboardMeta/);
});

test('level tabı artık season fallback ile doldurulmaz', () => {
  const scriptText = read('script.js');
  assert.doesNotMatch(scriptText, /levelTop:\s*\(Array\.isArray\(payload\.levelTop\) \? payload\.levelTop : Array\.isArray\(payload\.rankTop\) \? payload\.rankTop/);
  assert.match(scriptText, /seasonTop:\s*\(Array\.isArray\(payload\.seasonTop\) \? payload\.seasonTop : Array\.isArray\(payload\.rankTop\) \? payload\.rankTop/);
});
