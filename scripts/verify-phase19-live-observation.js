'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function ensure(pattern, text, label) {
  if (!pattern.test(text)) {
    throw new Error(`VERIFY_FAIL:${label}`);
  }
}

const liveRoutes = read('routes/live.routes.js');
const adminRoutes = read('routes/admin.routes.js');
const runtime = read('public/playmatrix-runtime.js');
const adminHealth = read('public/admin/health.html');
const docs = read('docs/PHASE19_LIVE_OBSERVATION.md');

ensure(/\/live\/observe\/client/, liveRoutes, 'client ingest route');
ensure(/\/admin\/ops\/live-observation/, adminRoutes, 'admin live observation route');
ensure(/PlayMatrixLiveObserve/, runtime, 'frontend observation bridge');
ensure(/layout_shift/, runtime, 'layout shift observer');
ensure(/viewport_zoom/, runtime, 'viewport zoom observer');
ensure(/FAZ 19 · Canlı Gözlem Özeti/, adminHealth, 'health ui section');
ensure(/Canlı Hata ve Gözlemleme Sistemi/, docs, 'phase doc');

console.log('verify-phase19-live-observation: ok');
