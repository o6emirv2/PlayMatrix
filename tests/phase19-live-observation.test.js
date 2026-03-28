'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { normalizeObservationEvent, buildLiveObservationSnapshot } = require('../utils/liveObservation');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('normalizeObservationEvent stabil signature ve güvenli alanlar üretir', () => {
  const row = normalizeObservationEvent({
    type: 'layout_shift',
    value: 0.1378,
    message: '<b>layout</b>',
    selector: '#hero',
    durationMs: 220
  }, {
    page: '/index.html',
    viewport: { width: 390, height: 844, scale: 1 },
    sessionId: 'abc123'
  });

  assert.equal(row.type, 'layout_shift');
  assert.equal(row.severity, 'warn');
  assert.equal(row.page, '/index.html');
  assert.equal(row.selector, '#hero');
  assert.equal(row.shiftScore, 0.1378);
  assert.ok(row.signature.length >= 12);
  assert.equal(row.message.includes('<b>'), false);
});

test('buildLiveObservationSnapshot kritik issue ve vitals üretir', () => {
  const now = Date.now();
  const snapshot = buildLiveObservationSnapshot({
    now,
    lookbackMs: 60 * 60 * 1000,
    rows: [
      { type: 'js_error', severity: 'error', createdAt: now - 5000, page: '/casino', message: 'boom', issueKey: 'a' },
      { type: 'long_task', severity: 'warn', createdAt: now - 4000, page: '/casino', longTaskMs: 980, durationMs: 980, issueKey: 'b' },
      { type: 'viewport_zoom', severity: 'error', createdAt: now - 3000, page: '/casino', zoomScale: 1.2, issueKey: 'c' }
    ]
  });

  assert.equal(snapshot.count, 3);
  assert.equal(snapshot.byType.js_error, 1);
  assert.equal(snapshot.vitals.worstLongTaskMs, 980);
  assert.equal(snapshot.vitals.viewportZoomEvents, 1);
  assert.equal(snapshot.status.tone, 'error');
  assert.ok(snapshot.issues.length >= 2);
});

test('phase19 route, runtime ve admin ui izleri dosyalarda mevcut', () => {
  const liveRoutes = read('routes/live.routes.js');
  const adminRoutes = read('routes/admin.routes.js');
  const runtime = read('public/playmatrix-runtime.js');
  const adminHealth = read('public/admin/health.html');
  const manifest = read('utils/routeManifest.js');

  assert.match(liveRoutes, /\/live\/observe\/client/);
  assert.match(adminRoutes, /\/admin\/ops\/live-observation/);
  assert.match(runtime, /PlayMatrixLiveObserve/);
  assert.match(runtime, /layout_shift/);
  assert.match(runtime, /viewport_zoom/);
  assert.match(adminHealth, /FAZ 19 · Canlı Gözlem Özeti/);
  assert.match(manifest, /live-observation/);
});
