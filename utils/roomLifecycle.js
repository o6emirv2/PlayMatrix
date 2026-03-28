'use strict';

const { nowMs, safeNum, cleanStr } = require('./helpers');

const ROOM_STALE_WINDOW_MS = 20 * 60 * 1000;
const ROOM_RECONCILE_SCAN_BATCH_LIMIT = 200;
const ROOM_RECONCILE_MAX_PASSES = 6;
const CHESS_DISCONNECT_GRACE_MS = 90 * 1000;
const CHESS_RESULT_RETENTION_MS = 2 * 60 * 1000;
const PISTI_DISCONNECT_GRACE_MS = 90 * 1000;
const PISTI_RESULT_RETENTION_MS = 2 * 60 * 1000;
const SINGLE_PISTI_RESULT_RETENTION_MS = 5 * 1000;
const BJ_RESULT_RETENTION_MS = 2 * 60 * 1000;

function applyPersistedCleanupWindow(entity = {}, { delayMs = 0, minRetentionMs = 0, lifecycleKind = '', cleanupPolicy = 'cron_persisted' } = {}) {
  const retentionMs = Math.max(safeNum(minRetentionMs, 0), safeNum(delayMs, 0));
  const cleanupAt = nowMs() + retentionMs;
  entity.cleanupAt = cleanupAt;
  entity.resumeAvailableUntil = cleanupAt;
  entity.cleanupPolicy = cleanStr(cleanupPolicy || 'cron_persisted', 48) || 'cron_persisted';
  entity.lifecycleVersion = 2;
  if (lifecycleKind) entity.lifecycleKind = cleanStr(lifecycleKind, 32) || entity.lifecycleKind || '';
  return entity;
}

function applyChessCloseWindow(room = {}, delayMs = CHESS_RESULT_RETENTION_MS) {
  return applyPersistedCleanupWindow(room, { delayMs, minRetentionMs: CHESS_DISCONNECT_GRACE_MS, lifecycleKind: 'chess_room' });
}

function applyOnlinePistiCloseWindow(room = {}, delayMs = PISTI_RESULT_RETENTION_MS) {
  return applyPersistedCleanupWindow(room, { delayMs, minRetentionMs: PISTI_DISCONNECT_GRACE_MS, lifecycleKind: 'pisti_online_room' });
}

function applySinglePistiCloseWindow(session = {}, delayMs = SINGLE_PISTI_RESULT_RETENTION_MS) {
  return applyPersistedCleanupWindow(session, { delayMs, minRetentionMs: SINGLE_PISTI_RESULT_RETENTION_MS, lifecycleKind: 'pisti_single_session' });
}

function applyBlackjackCloseWindow(session = {}, delayMs = BJ_RESULT_RETENTION_MS) {
  return applyPersistedCleanupWindow(session, { delayMs, minRetentionMs: 15 * 1000, lifecycleKind: 'blackjack_session' });
}

function inferLegacyCleanupAt(updatedAt = 0, retentionMs = 0, now = nowMs()) {
  const safeUpdatedAt = safeNum(updatedAt, 0);
  const safeRetention = Math.max(15 * 1000, safeNum(retentionMs, 0));
  if (safeUpdatedAt <= 0) return now + safeRetention;
  return Math.max(safeUpdatedAt + safeRetention, now + 15 * 1000);
}

function getBlackjackStakeForRefund(session) {
  if (!session || !['playing', 'resolving'].includes(cleanStr(session.gameState || '', 24))) return 0;
  const handsTotal = Array.isArray(session.hands) ? session.hands.reduce((sum, hand) => sum + safeNum(hand?.bet, 0), 0) : 0;
  return handsTotal + safeNum(session.insuranceBet, 0) + safeNum(session.totalSideBets, 0);
}

module.exports = {
  ROOM_STALE_WINDOW_MS,
  ROOM_RECONCILE_SCAN_BATCH_LIMIT,
  ROOM_RECONCILE_MAX_PASSES,
  CHESS_DISCONNECT_GRACE_MS,
  CHESS_RESULT_RETENTION_MS,
  PISTI_DISCONNECT_GRACE_MS,
  PISTI_RESULT_RETENTION_MS,
  SINGLE_PISTI_RESULT_RETENTION_MS,
  BJ_RESULT_RETENTION_MS,
  applyPersistedCleanupWindow,
  applyChessCloseWindow,
  applyOnlinePistiCloseWindow,
  applySinglePistiCloseWindow,
  applyBlackjackCloseWindow,
  inferLegacyCleanupAt,
  getBlackjackStakeForRefund
};
