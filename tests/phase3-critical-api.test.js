'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('critical api matrisi kritik endpointleri ve ortak kontratı içerir', () => {
  const { CRITICAL_API_ENDPOINTS, buildCriticalApiSnapshot } = require('../utils/criticalApiMatrix');
  const snapshot = buildCriticalApiSnapshot();
  assert.ok(Array.isArray(CRITICAL_API_ENDPOINTS));
  assert.ok(CRITICAL_API_ENDPOINTS.some((item) => item.path === '/api/leaderboard'));
  assert.ok(CRITICAL_API_ENDPOINTS.some((item) => item.path === '/api/admin/overview'));
  assert.ok(snapshot.responseContract.successFields.includes('requestId'));
  assert.ok(snapshot.responseContract.errorFields.includes('retryable'));
});

test('api response yardımcıları meta, requestId ve hata kodu üretir', () => {
  const { sendApiSuccess, sendApiError } = require('../utils/apiResponse');
  function createRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };
  }
  const req = { requestId: 'req-phase3', originalUrl: '/api/leaderboard' };
  const okRes = createRes();
  sendApiSuccess(req, okRes, { items: [] });
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.body.ok, true);
  assert.equal(okRes.body.requestId, 'req-phase3');
  assert.equal(okRes.body.endpoint, '/api/leaderboard');
  assert.ok(okRes.body.meta);

  const errRes = createRes();
  sendApiError(req, errRes, 503, 'Geçici hata', { code: 'TEMP_FAIL', retryable: true });
  assert.equal(errRes.statusCode, 503);
  assert.equal(errRes.body.ok, false);
  assert.equal(errRes.body.code, 'TEMP_FAIL');
  assert.equal(errRes.body.retryable, true);
});

test('faz 3 kaynakları kritik endpointler için ortak yardımcıları kullanır', () => {
  const serverText = read('server.js');
  const profileText = read(path.join('routes', 'profile.routes.js'));
  const authText = read(path.join('routes', 'auth.routes.js'));
  const adminText = read(path.join('routes', 'admin.routes.js'));
  const socialCenterText = read(path.join('routes', 'socialcenter.routes.js'));

  assert.match(serverText, /\/api\/critical-api-status/);
  assert.match(serverText, /ROUTE_NOT_FOUND/);
  assert.match(profileText, /LEADERBOARD_LOAD_FAILED/);
  assert.match(profileText, /USER_STATS_LOAD_FAILED/);
  assert.match(authText, /ADMIN_STATUS_FAILED/);
  assert.match(adminText, /ADMIN_OVERVIEW_LOAD_FAILED/);
  assert.match(socialCenterText, /SOCIAL_CENTER_SUMMARY_FAILED/);
});
