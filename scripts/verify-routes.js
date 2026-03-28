'use strict';

const assert = require('assert');
const { buildPublicRouteManifest, isCompatRewriteCandidate, toCompatApiPath } = require('../utils/routeManifest');

const manifest = buildPublicRouteManifest();
assert.equal(manifest.ok, true, 'Route manifest ok olmalı.');
assert.equal(manifest.apiBase, '/api', 'API tabanı /api olmalı.');
assert.ok(Array.isArray(manifest.routeGroups?.admin), 'Admin route grubu bulunmalı.');
assert.ok(manifest.routeGroups.admin.includes('/api/admin/overview'), 'Admin overview manifestte bulunmalı.');
assert.ok(manifest.routeGroups.leaderboard.includes('/leaderboard'), 'Leaderboard compat path manifestte bulunmalı.');
assert.ok(manifest.routeGroups.home.includes('/api/home/showcase'), 'Home showcase manifestte bulunmalı.');
assert.equal(isCompatRewriteCandidate('/leaderboard'), true, 'Leaderboard compat rewrite adayı olmalı.');
assert.equal(isCompatRewriteCandidate('/home/showcase'), true, 'Home showcase compat rewrite adayı olmalı.');
assert.equal(isCompatRewriteCandidate('/auth/admin/bootstrap'), true, 'Admin bootstrap compat rewrite adayı olmalı.');
assert.equal(isCompatRewriteCandidate('/admin/index.html'), false, 'Admin HTML sayfası API rewrite adayı olmamalı.');
assert.equal(toCompatApiPath('/leaderboard'), '/api/leaderboard', 'Leaderboard compat rewrite yolu doğru olmalı.');
assert.equal(toCompatApiPath('/home/showcase'), '/api/home/showcase', 'Home showcase compat rewrite yolu doğru olmalı.');
assert.equal(toCompatApiPath('/admin/overview'), '/api/admin/overview', 'Admin overview compat rewrite yolu doğru olmalı.');
console.log('FAZ 1 route doğrulaması geçti.');
