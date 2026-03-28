'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { buildLeaderboardPayload, LEADERBOARD_CATEGORIES } = require('../utils/leaderboardCenter');

const root = path.join(__dirname, '..');
const profileSource = fs.readFileSync(path.join(root, 'routes', 'profile.routes.js'), 'utf8');
const scriptSource = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

const payload = buildLeaderboardPayload({ levelTop: [{ uid: 'u1', username: 'A', accountLevel: 9 }] }, { degradedTabs: ['season'], source: 'primary' });
assert.equal(Array.isArray(payload.levelTop), true);
assert.equal(payload.leaderboardMeta.state, 'partial');
assert.equal(payload.leaderboardMeta.degradedTabs.includes('season'), true);
assert.equal(LEADERBOARD_CATEGORIES.length >= 6, true);
assert.match(profileSource, /buildLeaderboardResponsePayload/);
assert.match(profileSource, /leaderboardPayloadCache/);
assert.match(profileSource, /statsCenterCache/);
assert.match(scriptSource, /getLeaderboardEmptyMessage/);
assert.match(scriptSource, /leaderboardRetryBtn/);

console.log('phase4 leaderboard/stats verification ok');
