'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getPublicGameCatalog, buildGameCatalogSummary } = require('../config/gameCatalog');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('game catalog summary toplamları doğru üretir', () => {
  const catalog = getPublicGameCatalog();
  const summary = buildGameCatalogSummary(catalog);
  assert.equal(summary.total, catalog.length);
  assert.equal(summary.byCategory.online, 3);
  assert.equal(summary.byCategory.casino, 3);
  assert.equal(summary.byCategory.classic >= 3, true);
  assert.equal(summary.byAccess.auth, 6);
  assert.equal(summary.byAccess.free >= 3, true);
});

test('ana sayfa kaynakları home showcase senkron katmanını içerir', () => {
  const profileRoute = read(path.join('routes', 'profile.routes.js'));
  const indexHtml = read('index.html');
  const scriptText = read('script.js');
  assert.match(profileRoute, /\/home\/showcase/);
  assert.match(profileRoute, /homeShowcaseCache/);
  assert.match(indexHtml, /id="gamesSectionCopy"/);
  assert.match(indexHtml, /id="homeSyncNote"/);
  assert.match(scriptText, /loadHomeShowcase/);
  assert.match(scriptText, /getHomeGameCatalog/);
  assert.match(scriptText, /\/api\/home\/showcase/);
  assert.doesNotMatch(scriptText, /metricGamesCount"\)\.textContent = String\(GAMES\.length\)/);
});

test('phase5 doğrulama scripti ve dökümanı mevcut', () => {
  const doc = read(path.join('docs', 'PHASE5_HOME_SYNC.md'));
  const verify = read(path.join('scripts', 'verify-home-sync.js'));
  assert.match(doc, /FAZ 5/);
  assert.match(verify, /getPublicGameCatalog/);
  assert.match(verify, /home\/showcase/);
});
