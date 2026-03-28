'use strict';

const fs = require('fs');
const path = require('path');

function mustInclude(file, snippets = []) {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  snippets.forEach((snippet) => {
    if (!source.includes(snippet)) {
      throw new Error(`${file} içinde eksik ifade: ${snippet}`);
    }
  });
}

mustInclude('crons/tasks.js', [
  "const colPisti = () => db.collection('pisti_sessions');",
  'reconcileRoomLifecycleState',
  'ROOM_STALE_WINDOW_MS',
  'await sweepCollectionInPasses(',
  "() => colBJ().limit(CLEANUP_SCAN_BATCH_LIMIT).get()",
  'getBlackjackStakeForRefund',
  'cleanupStaleData, reconcileRoomLifecycleState'
]);

mustInclude('routes/blackjack.routes.js', [
  'applyBlackjackCloseWindow',
  'BJ_RESULT_RETENTION_MS',
  'cleanupAt: safeNum(session.cleanupAt, 0)',
  "cleanupPolicy: cleanStr(session.cleanupPolicy || '', 32)"
]);

mustInclude('utils/roomLifecycle.js', [
  'applyBlackjackCloseWindow',
  'applySinglePistiCloseWindow',
  'inferLegacyCleanupAt',
  'ROOM_RECONCILE_SCAN_BATCH_LIMIT'
]);

console.log('FAZ 8 verify geçti');
