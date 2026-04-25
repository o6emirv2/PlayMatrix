'use strict';

const crypto = require('crypto');
let firebaseCache = null;
const { cleanStr, nowMs, safeNum } = require('./helpers');
const {
  REWARD_SOURCE_ALIASES,
  getRewardDefinition,
  listRewardCatalog,
  buildRewardCatalogSummary,
  canonicalizeRewardSource
} = require('../config/rewardCatalog');

function getFirebase() {
  if (!firebaseCache) firebaseCache = require('../config/firebase');
  return firebaseCache;
}

const colRewardLedger = () => getFirebase().db.collection('reward_ledger');

const REWARD_SOURCE_REASON_ALIASES = Object.freeze({
  chess_disconnect_win: 'disconnect',
  chess_leave_win: 'leave',
  chess_resign_win: 'resign',
  pisti_disconnect_win: 'disconnect',
  pisti_room_reward: 'room'
});

const REWARD_SOURCE_LABELS = Object.freeze(Object.fromEntries(
  listRewardCatalog({ includePrivate: true }).map((item) => [item.source, item.label])
));

function normalizeRewardSource(source = '', meta = {}) {
  const rawSource = cleanStr(source || 'reward', 80).toLowerCase() || 'reward';
  const safeMeta = meta && typeof meta === 'object' ? { ...meta } : {};
  const canonicalSource = canonicalizeRewardSource(rawSource);
  if (!safeMeta.reason && REWARD_SOURCE_REASON_ALIASES[rawSource]) {
    safeMeta.reason = REWARD_SOURCE_REASON_ALIASES[rawSource];
  }
  return { source: canonicalSource, meta: safeMeta, originalSource: rawSource };
}

function buildLedgerDocId({ uid = '', currency = 'MC', source = '', referenceId = '', idempotencyKey = '' } = {}) {
  const safeIdempotencyKey = cleanStr(idempotencyKey || '', 220);
  if (safeIdempotencyKey) return `idem_${safeIdempotencyKey}`;
  const safeUid = cleanStr(uid, 160);
  const safeCurrency = cleanStr(currency || 'MC', 16) || 'MC';
  const safeSource = cleanStr(source || 'reward', 80) || 'reward';
  const safeReferenceId = cleanStr(referenceId || '', 180);
  const digest = crypto.createHash('sha256').update(`${safeUid}|${safeCurrency}|${safeSource}|${safeReferenceId}`).digest('hex');
  return `auto_${digest.slice(0, 48)}`;
}

function normalizeRewardLedgerItem(doc) {
  const data = doc?.data ? (doc.data() || {}) : (doc || {});
  const normalized = normalizeRewardSource(data.source, data.meta);
  const definition = getRewardDefinition(normalized.source);
  return {
    id: doc?.id || cleanStr(data.id || '', 160),
    uid: cleanStr(data.uid || '', 160),
    amount: Math.floor(safeNum(data.amount, 0)),
    currency: cleanStr(data.currency || definition?.currency || 'MC', 16) || definition?.currency || 'MC',
    source: normalized.source,
    originalSource: normalized.originalSource,
    referenceId: cleanStr(data.referenceId || '', 180),
    meta: normalized.meta,
    createdAt: safeNum(data.createdAt?.toMillis?.() || data.createdAt, 0),
    timestamp: safeNum(data.timestamp?.toMillis?.() || data.timestamp, 0),
    definition
  };
}

function formatRewardLabel(source = '', meta = {}) {
  const normalized = normalizeRewardSource(source, meta);
  const key = normalized.source;
  const reason = cleanStr(normalized.meta?.reason || '', 24).toLowerCase();

  if (key === 'chess_win') {
    if (reason === 'disconnect') return 'Satranç Teknik Galibiyet';
    if (reason === 'leave') return 'Satranç Terk Galibiyeti';
    if (reason === 'resign') return 'Satranç Pes Galibiyeti';
  }

  if (key === 'pisti_online_win') {
    if (reason === 'disconnect') return 'Pişti Teknik Galibiyet';
  }

  return REWARD_SOURCE_LABELS[key] || key.replace(/_/g, ' ').replace(/\w/g, (m) => m.toUpperCase());
}

function describeRewardLedgerItem(item = {}) {
  const normalizedItem = normalizeRewardLedgerItem(item);
  const definition = normalizedItem.definition || getRewardDefinition(normalizedItem.source);
  return {
    ...normalizedItem,
    label: formatRewardLabel(normalizedItem.source, normalizedItem.meta),
    category: definition?.category || 'other',
    cadence: definition?.cadence || 'manual',
    grantType: definition?.grantType || 'manual',
    description: definition?.description || '',
    visibility: definition?.visibility || 'public'
  };
}

async function recordRewardLedger({ uid = '', amount = 0, currency = 'MC', source = '', referenceId = '', meta = {}, idempotencyKey = '' } = {}) {
  const safeUid = cleanStr(uid, 160);
  const safeAmount = Math.floor(safeNum(amount, 0));
  if (!safeUid || safeAmount <= 0) return null;

  const normalized = normalizeRewardSource(source, meta);
  const definition = getRewardDefinition(normalized.source);
  const payload = {
    uid: safeUid,
    amount: safeAmount,
    currency: cleanStr(currency || definition?.currency || 'MC', 16) || definition?.currency || 'MC',
    source: normalized.source,
    referenceId: cleanStr(referenceId || '', 180),
    meta: normalized.meta,
    createdAt: nowMs(),
    timestamp: getFirebase().admin.firestore.FieldValue.serverTimestamp()
  };

  const docId = buildLedgerDocId({
    uid: safeUid,
    currency: payload.currency,
    source: payload.source,
    referenceId: payload.referenceId,
    idempotencyKey
  });
  const ref = colRewardLedger().doc(docId);

  const result = await getFirebase().db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { exists: true, data: snap.data() || {} };
    tx.set(ref, payload, { merge: false });
    return { exists: false, data: payload };
  });

  return { id: ref.id, duplicated: !!result.exists, ...(result.data || payload) };
}

async function listRewardLedgerForUid(uid = '', { limit = 20, cursor = '' } = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return { items: [], nextCursor: '' };
  const safeLimit = Math.max(1, Math.min(100, Math.floor(safeNum(limit, 20))));
  const safeCursor = cleanStr(cursor || '', 220);

  let query = colRewardLedger().where('uid', '==', safeUid).orderBy('createdAt', 'desc').limit(safeLimit + 1);
  if (safeCursor) {
    const cursorDoc = await colRewardLedger().doc(safeCursor).get().catch(() => null);
    if (cursorDoc?.exists) query = query.startAfter(cursorDoc);
  }

  const snap = await query.get().catch(() => ({ docs: [] }));
  const docs = snap.docs || [];
  const hasMore = docs.length > safeLimit;
  const pageDocs = hasMore ? docs.slice(0, safeLimit) : docs;
  const items = pageDocs.map((doc) => describeRewardLedgerItem(doc));
  return {
    items,
    nextCursor: hasMore ? pageDocs[pageDocs.length - 1]?.id || '' : ''
  };
}

async function summarizeRewardLedgerForUid(uid = '', { sampleLimit = 120 } = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return { totalMc: 0, categories: [], itemCount: 0, bySource: [] };
  const limit = Math.max(1, Math.min(500, Math.floor(safeNum(sampleLimit, 120))));
  const snap = await colRewardLedger().where('uid', '==', safeUid).orderBy('createdAt', 'desc').limit(limit).get().catch(() => ({ docs: [] }));
  const totals = new Map();
  let totalMc = 0;
  for (const doc of snap.docs || []) {
    const item = describeRewardLedgerItem(doc);
    totalMc += item.amount;
    const categoryKey = item.source;
    const current = totals.get(categoryKey) || {
      source: item.source,
      label: item.label,
      amount: 0,
      count: 0,
      category: item.category,
      cadence: item.cadence,
      grantType: item.grantType
    };
    current.amount += item.amount;
    current.count += 1;
    totals.set(categoryKey, current);
  }
  const bySource = Array.from(totals.values()).sort((a, b) => b.amount - a.amount);
  const categories = bySource.slice(0, 8);
  return {
    totalMc,
    itemCount: (snap.docs || []).length,
    categories,
    bySource,
    catalog: listRewardCatalog({ includePrivate: false }),
    catalogSummary: buildRewardCatalogSummary({ includePrivate: false })
  };
}

module.exports = {
  REWARD_SOURCE_ALIASES,
  REWARD_SOURCE_LABELS,
  normalizeRewardSource,
  recordRewardLedger,
  buildLedgerDocId,
  normalizeRewardLedgerItem,
  describeRewardLedgerItem,
  formatRewardLabel,
  listRewardLedgerForUid,
  summarizeRewardLedgerForUid
};
