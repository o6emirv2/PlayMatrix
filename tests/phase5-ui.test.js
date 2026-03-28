'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('ana sayfa premium phase5 varlıklarını içerir ve kontrol merkezi bölümünü göstermez', () => {
  const indexHtml = read('index.html');
  assert.match(indexHtml, /premium-phase5\.css/);
  assert.match(indexHtml, /premium-phase5\.js/);
  assert.doesNotMatch(indexHtml, /Sistem Kontrol Merkezi/);
  assert.doesNotMatch(indexHtml, /seasonResetBadge/);
  assert.doesNotMatch(indexHtml, /activityResetBadge/);
  assert.doesNotMatch(indexHtml, /retentionBadge/);
  assert.doesNotMatch(indexHtml, /rewardFlowBadge/);
  assert.doesNotMatch(indexHtml, /seasonKeyBadge/);
});

test('oyun sayfaları premium phase5 varlıklarını yükler', () => {
  const pages = [
    'Online Oyunlar/Crash.html',
    'Online Oyunlar/Satranc.html',
    'Online Oyunlar/Pisti.html',
    'Casino/Mines.html',
    'Casino/BlackJack.html',
    'Casino/Pisti.html',
    'Klasik Oyunlar/SnakePro.html',
    'Klasik Oyunlar/PatternMaster.html',
    'Klasik Oyunlar/SpacePro.html'
  ];

  for (const relPath of pages) {
    const html = read(relPath);
    assert.match(html, /premium-phase5\.css/, relPath);
    assert.match(html, /premium-phase5\.js/, relPath);
  }
});


test('admin panel ve runtime dosyaları sabit uzak backend fallback kullanmaz', () => {
  const files = [
    'public/admin/index.html',
    'public/admin/health.html',
    'public/playmatrix-runtime.js',
    'script.js',
    'index.html',
    'Online Oyunlar/Pisti.html',
    'Online Oyunlar/Crash.html',
    'Online Oyunlar/Satranc.html',
    'Klasik Oyunlar/PatternMaster.html',
    'Klasik Oyunlar/SnakePro.html',
    'Klasik Oyunlar/SpacePro.html'
  ];

  for (const relPath of files) {
    const source = read(relPath);
    assert.doesNotMatch(source, /https:\/\/emirhan-siye\.onrender\.com\/api/, relPath);
  }
});

test('avatar frame css görüntüye zorunlu border veya sahte halka uygulamaz', () => {
  const css = read('public/avatar-frame.css');
  assert.match(css, /background:\s*transparent\s*!important;/);
  assert.match(css, /border:\s*0\s*!important;/);
  assert.match(css, /box-shadow:\s*none\s*!important;/);
});


test('ana sayfa CSP ve kaynakları güvenli uzak backend hinti tasiyabilir', () => {
  const indexHtml = read('index.html');
  assert.match(indexHtml, /playmatrix-remote-api-url/);
  assert.match(indexHtml, /https:\/\/emirhan-siye\.onrender\.com/);
});
