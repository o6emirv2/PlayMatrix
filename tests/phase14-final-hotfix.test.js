'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildPublicRouteManifest } = require('../utils/routeManifest');

test('deployment health exposes public backend origin field', () => {
  const payload = buildPublicRouteManifest();
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'publicBackendOrigin'));
});

test('admin pages discover remote fallback dynamically via deployment health', () => {
  for (const file of ['public/admin/index.html', 'public/admin/health.html']) {
    const content = fs.readFileSync(file, 'utf8');
    assert.match(content, /readRuntimeRemoteFallbacks/);
    assert.match(content, /deployment-healthz/);
    assert.match(content, /https:\/\/emirhan-siye\.onrender\.com/);
  }
});

test('main script discovers remote fallback dynamically via deployment health', () => {
  const content = fs.readFileSync('script.js', 'utf8');
  assert.match(content, /fetchRuntimeRemoteApiHints/);
  assert.match(content, /deployment-healthz/);
  assert.match(content, /https:\/\/emirhan-siye\.onrender\.com/);
});

test('env fallback files include provided single admin values', () => {
  for (const file of ['.env.env', 'env.env']) {
    const content = fs.readFileSync(file, 'utf8');
    assert.match(content, /ADMIN_UIDS=TAwee0MuAuPKEP156leMcSIHjzh2/);
    assert.match(content, /ADMIN_EMAILS=o6emirv2@gmail.com/);
  }
});
