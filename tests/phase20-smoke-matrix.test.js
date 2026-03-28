'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildSmokeMatrixSnapshot, classifyObservationProfile } = require('../utils/smokeMatrix');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('phase20 smoke matrix snapshot özet üretir', () => {
  const matrix = buildSmokeMatrixSnapshot({
    config: { cases: { 'ios-safari-390::home': { status: 'pass', testedBy: 'zed' } } },
    observations: [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari', viewport: { width: 390 }, type: 'layout_shift', severity: 'warn', createdAt: Date.now() }]
  });
  assert.ok(matrix.summary.total > 10);
  assert.equal(matrix.summary.pass >= 1, true);
  assert.equal(classifyObservationProfile({ userAgent: 'SamsungBrowser/24 Android', viewport: { width: 360 } }), 'android-samsung-360');
});

test('phase20 route ve admin health izleri dosyalarda mevcut', () => {
  assert.match(read('routes/admin.routes.js'), /\/admin\/ops\/smoke-matrix/);
  assert.match(read('public\/admin\/health.html'), /FAZ 20 · Device \/ Browser Smoke Matrix/);
  assert.match(read('utils\/routeManifest.js'), /smoke-matrix/);
});
