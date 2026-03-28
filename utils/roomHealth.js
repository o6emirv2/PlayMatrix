'use strict';

let firebaseCache = null;

function getFirebase() {
  if (!firebaseCache) firebaseCache = require('../config/firebase');
  return firebaseCache;
}
const { nowMs, safeNum } = require('./helpers');

async function countCollection(name) {
  try {
    const snap = await getFirebase().db.collection(name).count().get();
    return safeNum(snap.data()?.count, 0);
  } catch (_) {
    return 0;
  }
}

async function listRecentRows(name, { orderBy = 'updatedAt', limit = 50 } = {}) {
  try {
    const snap = await getFirebase().db.collection(name).orderBy(orderBy, 'desc').limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  } catch (_) {
    return [];
  }
}

function summarizeRooms(rows = [], now = nowMs()) {
  const summary = { total: 0, waiting: 0, playing: 0, closing: 0, resumable: 0, stale: 0, cleanupDue: 0, disconnectMarked: 0, avgQueueMs: 0, avgResumeMs: 0 };
  let queueTotal = 0;
  let queueCount = 0;
  let resumeTotal = 0;
  let resumeCount = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    summary.total += 1;
    const state = String(row.state || row.status || row.gameState || '').toLowerCase();
    if (state === 'waiting') summary.waiting += 1;
    else if (state === 'playing' || state === 'active' || state === 'resolving') summary.playing += 1;
    else if (state === 'closed' || state === 'finished' || state === 'closing' || state === 'abandoned') summary.closing += 1;
    const cleanupAt = safeNum(row.cleanupAt, 0);
    const createdAt = safeNum(row.createdAt, 0);
    const resumeAvailableUntil = safeNum(row.resumeAvailableUntil, 0);
    if (cleanupAt && cleanupAt <= now) {
      summary.cleanupDue += 1;
      summary.stale += 1;
    }
    if (resumeAvailableUntil > now) {
      summary.resumable += 1;
      resumeTotal += (resumeAvailableUntil - now);
      resumeCount += 1;
    }
    if (row.disconnectState || row.disconnectAt || row.lastDisconnectAt) summary.disconnectMarked += 1;
    if (createdAt > 0 && state === 'waiting' && !cleanupAt) {
      queueTotal += Math.max(0, now - createdAt);
      queueCount += 1;
    }
  }
  summary.avgQueueMs = queueCount ? Math.round(queueTotal / queueCount) : 0;
  summary.avgResumeMs = resumeCount ? Math.round(resumeTotal / resumeCount) : 0;
  return summary;
}

async function buildRoomHealthSnapshot() {
  const now = nowMs();
  const [chessRows, pistiRows, blackjackRows, partyInvites, gameInvites, queueCount, socketConnections] = await Promise.all([
    listRecentRows('chess_rooms', { orderBy: 'updatedAt', limit: 80 }),
    listRecentRows('pisti_online_rooms', { orderBy: 'updatedAt', limit: 80 }),
    listRecentRows('bj_sessions', { orderBy: 'lastActionAtMs', limit: 80 }),
    countCollection('party_invites'),
    countCollection('game_invites'),
    countCollection('matchmaking_queue'),
    countCollection('socket_connections')
  ]);
  const chess = summarizeRooms(chessRows, now);
  const pisti = summarizeRooms(pistiRows, now);
  const blackjack = summarizeRooms(blackjackRows, now);
  return {
    generatedAt: now,
    live: {
      socketConnections,
      matchmakingQueue: queueCount,
      staleInvites: partyInvites + gameInvites,
      partyInvites,
      gameInvites
    },
    chess,
    pisti,
    blackjack,
    totals: {
      totalRooms: chess.total + pisti.total + blackjack.total,
      activeRooms: chess.playing + pisti.playing + blackjack.playing,
      waitingRooms: chess.waiting + pisti.waiting + blackjack.waiting,
      staleRooms: chess.stale + pisti.stale + blackjack.stale,
      cleanupDue: chess.cleanupDue + pisti.cleanupDue + blackjack.cleanupDue,
      resumableRooms: chess.resumable + pisti.resumable + blackjack.resumable,
      disconnectMarked: chess.disconnectMarked + pisti.disconnectMarked + blackjack.disconnectMarked
    },
    samples: {
      chess: chessRows.slice(0, 12),
      pisti: pistiRows.slice(0, 12),
      blackjack: blackjackRows.slice(0, 12)
    }
  };
}

module.exports = {
  summarizeRooms,
  buildRoomHealthSnapshot
};
