'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(projectRoot, file), 'utf8');
}

test('klasik oyunlar ortak shell ve satranc üst barını kullanır', () => {
  const shellFiles = [
    'Klasik Oyunlar/Matrix2048.html',
    'Klasik Oyunlar/MemoryFlip.html',
    'Klasik Oyunlar/TicTacArena.html'
  ];

  shellFiles.forEach((file) => {
    const content = read(file);
    assert.match(content, /class="top-bar-full"/);
    assert.match(content, /id="ui-balance"/);
    assert.match(content, /id="uiVipBar"/);
    assert.match(content, /\/game-shell\.css/);
    assert.match(content, /\/game-shell\.js/);
  });

  const allGameFiles = [
    'Casino/BlackJack.html',
    'Casino/Mines.html',
    'Casino/Pisti.html',
    'Klasik Oyunlar/Matrix2048.html',
    'Klasik Oyunlar/MemoryFlip.html',
    'Klasik Oyunlar/PatternMaster.html',
    'Klasik Oyunlar/SnakePro.html',
    'Klasik Oyunlar/SpacePro.html',
    'Klasik Oyunlar/TicTacArena.html',
    'Online Oyunlar/Crash.html',
    'Online Oyunlar/Pisti.html',
    'Online Oyunlar/Satranc.html'
  ];

  allGameFiles.forEach((file) => {
    const content = read(file);
    assert.match(content, /top-bar-full/);
  });
});

test('admin panel viewport fix ve ops panel fallback içerir', () => {
  const adminIndex = read('public/admin/index.html');
  assert.match(adminIndex, /initial-scale=1/);
  assert.match(adminIndex, /interactive-widget=resizes-content/);
  assert.match(adminIndex, /function buildFallbackOpsPanel/);
  assert.match(adminIndex, /apiSoft\('\/admin\/ops\/panel'\)/);
  assert.match(adminIndex, /probeAdminCapability\(probe\.base, token, '\/admin\/overview'\)/);
});

test('admin ops panel route partial failure durumunda allSettled kullanır', () => {
  const adminRoutes = read('routes/admin.routes.js');
  assert.match(adminRoutes, /Promise\.allSettled/);
  assert.match(adminRoutes, /partial:/);
});
