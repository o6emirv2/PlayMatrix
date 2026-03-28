'use strict';

const { buildReleaseSnapshot } = require('./release');
const { DEFAULT_PUBLIC_BACKEND_ORIGIN } = require('../config/constants');

const COMPAT_ROUTE_GROUPS = {
  health: ['/healthz', '/api/healthz', '/deployment-healthz', '/api/deployment-healthz', '/route-manifest', '/api/route-manifest', '/critical-api-status', '/api/critical-api-status'],
  leaderboard: ['/api/leaderboard', '/leaderboard'],
  home: ['/api/home/showcase', '/home/showcase'],
  stats: ['/api/stats-center', '/stats-center', '/api/reward-center', '/reward-center', '/api/user-stats/:uid', '/user-stats/:uid'],
  auth: [
    '/api/auth/resolve-login', '/api/auth/session/create', '/api/auth/session/logout', '/api/auth/session/status',
    '/api/auth/admin/bootstrap', '/api/auth/admin/status',
    '/auth/resolve-login', '/auth/session/create', '/auth/session/logout', '/auth/session/status', '/auth/admin/bootstrap', '/auth/admin/status'
  ],
  admin: [
    '/api/admin/ping', '/api/admin/overview', '/api/admin/deployment-health', '/api/admin/ops/health', '/api/admin/ops/errors',
    '/api/admin/ops/runtime-center', '/api/admin/ops/panel', '/api/admin/ops/live-observation', '/api/admin/ops/smoke-matrix', '/api/admin/ops/release-gate', '/api/admin/ops/controlled-rollout', '/api/admin/rooms/health', '/api/admin/retention-policy', '/api/admin/reward-catalog',
    '/api/admin/feature-flags', '/api/admin/platform/control', '/api/admin/cleanup-reports',
    '/admin/ping', '/admin/overview', '/admin/deployment-health', '/admin/ops/health', '/admin/ops/errors',
    '/admin/ops/runtime-center', '/admin/ops/panel', '/admin/ops/live-observation', '/admin/ops/smoke-matrix', '/admin/ops/release-gate', '/admin/ops/controlled-rollout', '/admin/rooms/health', '/admin/retention-policy', '/admin/reward-catalog', '/admin/feature-flags',
    '/admin/platform/control', '/admin/cleanup-reports'
  ]
};

const COMPAT_REWRITE_PATTERNS = [
  /^\/leaderboard\/?$/i,
  /^\/home\/showcase\/?$/i,
  /^\/stats-center\/?$/i,
  /^\/reward-center\/?$/i,
  /^\/user-stats\/[^/]+\/?$/i,
  /^\/auth\/(?:resolve-login|session\/(?:create|logout|status)|admin\/(?:bootstrap|status))\/?$/i,
  /^\/admin\/(?:ping|overview|deployment-health|ops\/(?:health|errors|runtime-center|panel|live-observation|smoke-matrix|release-gate|controlled-rollout)|rooms\/health|retention-policy|reward-catalog|feature-flags|platform\/control|cleanup-reports)\/?$/i
];

function normalizePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  const [pathname] = raw.split('?');
  return pathname || '/';
}

function isCompatRewriteCandidate(pathname = '') {
  const normalized = normalizePath(pathname);
  if (!normalized || normalized === '/' || normalized.startsWith('/api/')) return false;
  return COMPAT_REWRITE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function toCompatApiPath(pathname = '') {
  const normalized = normalizePath(pathname);
  if (!normalized || normalized.startsWith('/api/')) return normalized || '/api';
  return `/api${normalized}`.replace(/\/\/{2,}/g, '/');
}

function buildPublicRouteManifest() {
  return {
    ok: true,
    service: 'PlayMatrix API',
    release: buildReleaseSnapshot(),
    apiBase: '/api',
    publicBackendOrigin: DEFAULT_PUBLIC_BACKEND_ORIGIN || null,
    compatibilityMode: 'api_prefix_rewrite',
    routeGroups: COMPAT_ROUTE_GROUPS,
    notes: [
      'Kritik route’lar /api altında çalışır.',
      'Reverse proxy veya deploy katmanı /api önekini düşürürse seçili route’lar kök path üzerinden /api altına yeniden yazılır.',
      'Bu endpoint canlı sürüm ile backend sürümünün eşleşmesini doğrulamak için kullanılabilir.'
    ]
  };
}

module.exports = {
  COMPAT_ROUTE_GROUPS,
  isCompatRewriteCandidate,
  toCompatApiPath,
  buildPublicRouteManifest
};
