'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getPublicGameCatalog, buildGameCatalogSummary } = require('../config/gameCatalog');

const root = path.join(__dirname, '..');

test('phase21 yeni oyunlar katalogda görünür', () => {
  const catalog = getPublicGameCatalog();
  const keys = new Set(catalog.map((item) => item.key));
  assert.equal(keys.has('matrix-2048'), true);
  assert.equal(keys.has('memory-flip'), true);
  assert.equal(keys.has('tic-tac-arena'), true);
  const summary = buildGameCatalogSummary(catalog);
  assert.ok(summary.total >= 12);
});

test('phase21 yeni oyun dosyaları mevcut', () => {
  ['Klasik Oyunlar/Matrix2048.html', 'Klasik Oyunlar/MemoryFlip.html', 'Klasik Oyunlar/TicTacArena.html'].forEach((file) => {
    assert.equal(fs.existsSync(path.join(root, file)), true);
  });
});
