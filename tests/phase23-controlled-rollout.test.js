'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildControlledRolloutSnapshot, sanitizeControlledRollout } = require('../utils/controlledRollout');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('phase23 controlled rollout snapshot canary varsayılanlarını korur', () => {
  const config = sanitizeControlledRollout({ mode: 'canary', publicTrafficPercent: 15, stage: 'beta' }, 'zed');
  const snapshot = buildControlledRolloutSnapshot({ config, gate: { locked: false }, release: { releaseId: 'r2', phase: 'P23' } });
  assert.equal(snapshot.mode, 'canary');
  assert.equal(snapshot.publicTrafficPercent, 15);
  assert.match(snapshot.summaryLabel, /15% trafik/);
});

test('phase23 route ve ui izleri mevcut', () => {
  assert.match(read('routes/admin.routes.js'), /\/admin\/ops\/controlled-rollout/);
  assert.match(read('public\/admin\/health.html'), /FAZ 23 · Canlıya Kontrollü Geçiş/);
});
