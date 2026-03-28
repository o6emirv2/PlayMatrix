'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildReleaseGateSnapshot } = require('../utils/releaseGate');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('phase22 release gate fatal ve zoom olayında kilit açar', () => {
  const gate = buildReleaseGateSnapshot({
    smokeMatrix: { summary: { fail: 0, criticalFailed: 0, criticalPending: 1, warn: 1 } },
    liveObservation: { severity: { fatal: 1, error: 0 }, vitals: { viewportZoomEvents: 1, worstLongTaskMs: 400 } },
    opsHealth: { errorSummary: { fatal: 0, error: 1 } },
    featureFlags: { maintenanceMode: false },
    rollout: { mode: 'canary' },
    release: { releaseId: 'r1', phase: 'P22' }
  });
  assert.equal(gate.locked, true);
  assert.match(gate.label, /Regresyon kilidi/);
});

test('phase22 route ve ui izleri mevcut', () => {
  assert.match(read('routes/admin.routes.js'), /\/admin\/ops\/release-gate/);
  assert.match(read('public\/admin\/health.html'), /FAZ 22 · Son Kalite Geçişi \/ Regresyon Kilidi/);
});
