'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeErrorRows, buildOpsHealthSnapshot } = require('../utils/opsHealth');

test('summarizeErrorRows severity toplamlarını üretir', () => {
  const summary = summarizeErrorRows([
    { severity: 'fatal' },
    { severity: 'error' },
    { severity: 'warn' },
    { severity: 'custom' }
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.fatal, 1);
  assert.equal(summary.error, 1);
  assert.equal(summary.warn, 1);
  assert.equal(summary.other, 1);
});

test('buildOpsHealthSnapshot temel proses ve flag özetini döner', () => {
  const snapshot = buildOpsHealthSnapshot({
    featureFlags: { premiumUi: true },
    recentErrors: [{ severity: 'error', message: 'boom' }],
    tailLines: 5
  });
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.featureFlags.premiumUi, true);
  assert.equal(snapshot.errorSummary.error, 1);
  assert.ok(snapshot.process.uptimeSec >= 0);
});
