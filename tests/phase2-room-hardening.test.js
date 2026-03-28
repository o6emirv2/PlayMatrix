'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('cleanup cron çoklu batch taraması ve single pisti refund koruması içerir', () => {
  const source = read('crons/tasks.js');
  assert.match(source, /const CLEANUP_SCAN_BATCH_LIMIT = 250;/);
  assert.match(source, /async function sweepCollectionInPasses\(/);
  assert.match(source, /await sweepCollectionInPasses\(\s*\(\) => colOnlinePisti\(\)\.limit\(CLEANUP_SCAN_BATCH_LIMIT\)\.get\(\)/s);
  assert.match(source, /await sweepCollectionInPasses\(\s*\(\) => colChess\(\)\.limit\(CLEANUP_SCAN_BATCH_LIMIT\)\.get\(\)/s);
  assert.match(source, /await sweepCollectionInPasses\(\s*\(\) => colPisti\(\)\.limit\(CLEANUP_SCAN_BATCH_LIMIT\)\.get\(\)/s);
  assert.match(source, /if \(shouldDeleteStale && status === 'playing'\) \{/);
  assert.match(source, /balance: admin\.firestore\.FieldValue\.increment\(refund\)/);
});

test('online pişti state cleanup ve resume metadata taşır', () => {
  const source = read('routes/pisti.routes.js');
  assert.match(source, /applyOnlinePistiCloseWindow|cleanupPolicy = 'cron_persisted'/);
  assert.match(source, /cleanupAt: safeNum\(room\.cleanupAt, 0\)/);
  assert.match(source, /resumeAvailableUntil: safeNum\(room\.resumeAvailableUntil, 0\)/);
  assert.match(source, /canResume: \['waiting', 'playing'\]\.includes\(cleanStr\(room\.status \|\| 'waiting', 24\)\) \|\| safeNum\(room\.resumeAvailableUntil, 0\) > nowMs\(\)/);
});

test('satranç close window cleanup politikasını room üstünde saklar', () => {
  const source = read('routes/chess.routes.js');
  assert.match(source, /applyChessCloseWindow|cleanupPolicy = 'cron_persisted'/);
});
