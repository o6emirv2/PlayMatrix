'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildPublicRouteManifest, isCompatRewriteCandidate, toCompatApiPath } = require('../utils/routeManifest');

function read(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
}

test('route manifest kritik route gruplarını döner', () => {
  const manifest = buildPublicRouteManifest();
  assert.equal(manifest.ok, true);
  assert.equal(manifest.apiBase, '/api');
  assert.match(JSON.stringify(manifest.routeGroups.admin), /\/api\/admin\/overview/);
  assert.match(JSON.stringify(manifest.routeGroups.leaderboard), /\/leaderboard/);
  assert.match(JSON.stringify(manifest.routeGroups.home), /\/api\/home\/showcase/);
});

test('compat rewrite yalnız seçili kritik pathleri yeniden yazar', () => {
  assert.equal(isCompatRewriteCandidate('/leaderboard'), true);
  assert.equal(isCompatRewriteCandidate('/home/showcase'), true);
  assert.equal(isCompatRewriteCandidate('/auth/admin/bootstrap'), true);
  assert.equal(isCompatRewriteCandidate('/admin/overview'), true);
  assert.equal(isCompatRewriteCandidate('/admin/index.html'), false);
  assert.equal(isCompatRewriteCandidate('/premium-phase5.css'), false);
  assert.equal(toCompatApiPath('/leaderboard'), '/api/leaderboard');
  assert.equal(toCompatApiPath('/home/showcase'), '/api/home/showcase');
  assert.equal(toCompatApiPath('/admin/overview'), '/api/admin/overview');
});

test('server faz1 deployment health ve route manifest endpointlerini içerir', () => {
  const source = read('server.js');
  assert.match(source, /app\.get\('\/deployment-healthz'/);
  assert.match(source, /app\.get\('\/api\/deployment-healthz'/);
  assert.match(source, /app\.get\('\/route-manifest'/);
  assert.match(source, /app\.get\('\/api\/route-manifest'/);
  assert.match(source, /isCompatRewriteCandidate/);
  assert.match(source, /toCompatApiPath/);
});

test('faz1 dökümanı ve doğrulama scripti mevcut', () => {
  const doc = read('docs', 'PHASE1_DEPLOY_ROUTE.md');
  const script = read('scripts', 'verify-routes.js');
  assert.match(doc, /FAZ 1/);
  assert.match(script, /buildPublicRouteManifest/);
});
