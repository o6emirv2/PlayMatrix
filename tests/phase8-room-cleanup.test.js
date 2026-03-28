'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('cleanup cron blackjack ve single pisti için persisted cleanup / reconcile içerir', () => {
  const source = read('crons/tasks.js');
  assert.match(source, /const colPisti = \(\) => db\.collection\('pisti_sessions'\);/);
  assert.match(source, /async function reconcileRoomLifecycleState\(/);
  assert.match(source, /await scanCollectionByDocId\(\s*colBJ,/s);
  assert.match(source, /await scanCollectionByDocId\(\s*colPisti,/s);
  assert.match(source, /await sweepCollectionInPasses\(\s*\(\) => colBJ\(\)\.limit\(CLEANUP_SCAN_BATCH_LIMIT\)\.get\(\)/s);
  assert.match(source, /const shouldDeleteClosed = gameState === 'finished'/);
  assert.match(source, /module\.exports = \{ initCrons, getSeasonCalendarParts, cleanupStaleData, reconcileRoomLifecycleState \};/);
});

test('blackjack sonuç cleanupı timer silme yerine persisted cleanup alanları yazar', () => {
  const source = read('routes/blackjack.routes.js');
  assert.match(source, /applyBlackjackCloseWindow\(s, BJ_RESULT_RETENTION_MS\);/);
  assert.match(source, /cleanupAt: safeNum\(s\.cleanupAt, 0\)/);
  assert.match(source, /resumeAvailableUntil: safeNum\(s\.resumeAvailableUntil, 0\)/);
  assert.match(source, /cleanupPolicy: cleanStr\(s\.cleanupPolicy \|\| 'cron_persisted', 32\)/);
  assert.doesNotMatch(source, /setTimeout\(async \(\) => \{\s*await colBJ\(\)\.doc\(uid\)\.delete\(\)/s);
});

test('tek kişilik pişti finish cleanupı helper üstünden lifecycle metadata yazar', () => {
  const source = read('routes/pisti.routes.js');
  assert.match(source, /applySinglePistiCloseWindow\(s, SINGLE_PISTI_RESULT_RETENTION_MS\);/);
  assert.match(source, /const \{ PISTI_DISCONNECT_GRACE_MS, PISTI_RESULT_RETENTION_MS, SINGLE_PISTI_RESULT_RETENTION_MS, applyOnlinePistiCloseWindow, applySinglePistiCloseWindow \} = require\('\.\.\/utils\/roomLifecycle'\);/);
});

test('room health snapshot blackjack oturumlarını da toplama dahil eder', () => {
  const source = read('utils/roomHealth.js');
  assert.match(source, /listRecentRows\('bj_sessions', \{ orderBy: 'lastActionAtMs', limit: 80 \}\)/);
  assert.match(source, /const blackjack = summarizeRooms\(blackjackRows, now\);/);
  assert.match(source, /blackjack,/);
  assert.match(source, /totalRooms: chess\.total \+ pisti\.total \+ blackjack\.total/);
});
