'use strict';

const { buildReleaseSnapshot } = require('./release');

const CRITICAL_API_ENDPOINTS = Object.freeze([
  { key: 'health', method: 'GET', path: '/api/healthz', auth: 'public', group: 'health' },
  { key: 'deploymentHealth', method: 'GET', path: '/api/deployment-healthz', auth: 'public', group: 'health' },
  { key: 'routeManifest', method: 'GET', path: '/api/route-manifest', auth: 'public', group: 'health' },
  { key: 'leaderboard', method: 'GET', path: '/api/leaderboard', auth: 'optional', group: 'profile' },
  { key: 'userStats', method: 'GET', path: '/api/user-stats/:uid', auth: 'required', group: 'profile' },
  { key: 'statsCenter', method: 'GET', path: '/api/stats-center', auth: 'required', group: 'profile' },
  { key: 'rewardCenter', method: 'GET', path: '/api/reward-center', auth: 'required', group: 'profile' },
  { key: 'socialSummary', method: 'GET', path: '/api/social-center/summary', auth: 'required', group: 'social' },
  { key: 'sessionStatus', method: 'GET', path: '/api/auth/session/status', auth: 'optional', group: 'auth' },
  { key: 'adminStatus', method: 'GET', path: '/api/auth/admin/status', auth: 'required', group: 'auth' },
  { key: 'adminDiagnostics', method: 'GET', path: '/api/auth/admin/diagnostics', auth: 'optional', group: 'auth' },
  { key: 'adminOverview', method: 'GET', path: '/api/admin/overview', auth: 'admin', group: 'admin' },
  { key: 'adminPing', method: 'GET', path: '/api/admin/ping', auth: 'admin', group: 'admin' }
]);

function buildCriticalApiSnapshot() {
  return {
    ok: true,
    service: 'PlayMatrix Critical API Matrix',
    release: buildReleaseSnapshot(),
    responseContract: {
      successFields: ['ok', 'requestId', 'timestamp', 'endpoint', 'meta'],
      errorFields: ['ok', 'error', 'code', 'retryable', 'requestId', 'timestamp', 'endpoint', 'meta']
    },
    endpoints: CRITICAL_API_ENDPOINTS,
    notes: [
      'Bu liste canlı smoke test ve deploy doğrulama için kritik endpointleri içerir.',
      'Tüm kritik cevaplar requestId, timestamp ve endpoint meta alanlarını taşır.',
      'Bu matriste listelenen pathler yeni sürüm ile backend uyumunu kontrol etmek için kullanılmalıdır.'
    ]
  };
}

module.exports = { CRITICAL_API_ENDPOINTS, buildCriticalApiSnapshot };
