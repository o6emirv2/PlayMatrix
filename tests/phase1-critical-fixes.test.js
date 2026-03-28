'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('pişti açık masa oluşturma akışı kalıcı roomId kullanır', () => {
  const source = read('routes/pisti.routes.js');
  assert.match(source, /const newRoomRef = colOnlinePisti\(\)\.doc\(\);\s+const roomId = newRoomRef\.id;/s);
  assert.match(source, /return \{ id: roomId, \.\.\.newRoom \};/);
});

test('ana script davet yönlendirmesinde replace ve auto-join metalarını kullanır', () => {
  const source = read('script.js');
  assert.match(source, /sessionStorage\.setItem\("pm_auto_join_room", roomId\);/);
  assert.match(source, /sessionStorage\.setItem\("pm_auto_join_at", String\(Date\.now\(\)\)\);/);
  assert.match(source, /window\.location\.replace\(href\);/);
});

test('klasik oyun sayfaları doğru anasayfa bağlantısı ve zoom koruması içerir', () => {
  const pages = [
    'Klasik Oyunlar/SnakePro.html',
    'Klasik Oyunlar/PatternMaster.html',
    'Klasik Oyunlar/SpacePro.html'
  ];

  for (const relPath of pages) {
    const html = read(relPath);
    assert.match(html, /href="\.\.\/index\.html"/, relPath);
    assert.match(html, /gesturestart/, relPath);
    assert.match(html, /overscroll-behavior: none;/, relPath);
  }
});


test('ana sayfa çark alanı cooldown metni hedefini içerir', () => {
  const html = read('index.html');
  assert.match(html, /id="wheelCooldownText"/);
  assert.match(html, /id="wheelResult"/);
});

test('oyun oda temizliği process memory timer yerine cleanup alanına dayanır', () => {
  const chess = read('routes/chess.routes.js');
  const pisti = read('routes/pisti.routes.js');
  assert.doesNotMatch(chess, /setTimeout\(\(\) => colChess\(\)\.doc\(safeRoomId\)\.delete/);
  assert.doesNotMatch(pisti, /setTimeout\(\(\) => colOnlinePisti\(\)\.doc\(safeRoomId\)\.delete/);
  assert.match(read('crons/tasks.js'), /cleanupAt > 0 && cleanupAt <= now/);
});
