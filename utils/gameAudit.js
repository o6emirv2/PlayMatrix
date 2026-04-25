'use strict';

const crypto = require('crypto');
const { db, admin } = require('../config/firebase');
const { cleanStr, safeNum, nowMs } = require('./helpers');

const colGameAudit = () => db.collection('game_audit_logs');

function buildGameAuditId({ gameType = '', entityId = '', eventType = '', subjectUid = '', idempotencyKey = '' } = {}) {
  const safeIdempotencyKey = cleanStr(idempotencyKey || '', 220);
  if (safeIdempotencyKey) return `idem_${safeIdempotencyKey}`;
  const digest = crypto.createHash('sha256')
    .update(`${cleanStr(gameType, 24)}|${cleanStr(entityId, 180)}|${cleanStr(eventType, 80)}|${cleanStr(subjectUid, 160)}`)
    .digest('hex');
  return `auto_${digest.slice(0, 48)}`;
}

async function recordGameAudit({
  gameType = '',
  entityType = 'match',
  entityId = '',
  roomId = '',
  roundId = '',
  betId = '',
  eventType = '',
  resultCode = '',
  reason = '',
  status = '',
  actorUid = '',
  subjectUid = '',
  amount = 0,
  payout = 0,
  meta = {},
  idempotencyKey = ''
} = {}) {
  const safeGameType = cleanStr(gameType || '', 24);
  const safeEntityId = cleanStr(entityId || roomId || betId || '', 180);
  const safeEventType = cleanStr(eventType || '', 80);
  if (!safeGameType || !safeEntityId || !safeEventType) return null;

  const payload = {
    gameType: safeGameType,
    entityType: cleanStr(entityType || 'match', 32) || 'match',
    entityId: safeEntityId,
    roomId: cleanStr(roomId || '', 180),
    roundId: cleanStr(roundId || '', 180),
    betId: cleanStr(betId || '', 180),
    eventType: safeEventType,
    resultCode: cleanStr(resultCode || '', 64),
    reason: cleanStr(reason || '', 48),
    status: cleanStr(status || '', 24),
    actorUid: cleanStr(actorUid || '', 160),
    subjectUid: cleanStr(subjectUid || '', 160),
    amount: safeNum(amount, 0),
    payout: safeNum(payout, 0),
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt: nowMs(),
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  const ref = colGameAudit().doc(buildGameAuditId({
    gameType: safeGameType,
    entityId: safeEntityId,
    eventType: safeEventType,
    subjectUid: payload.subjectUid || payload.actorUid,
    idempotencyKey
  }));

  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { duplicated: true, data: snap.data() || {} };
    tx.set(ref, payload, { merge: false });
    return { duplicated: false, data: payload };
  });

  return { id: ref.id, duplicated: !!out.duplicated, ...(out.data || payload) };
}

module.exports = {
  recordGameAudit,
  buildGameAuditId
};
