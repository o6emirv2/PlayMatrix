'use strict';

const { db } = require('../config/firebase');
const { cleanStr, safeNum } = require('./helpers');

const colChess = () => db.collection('chess_rooms');
const colOnlinePisti = () => db.collection('pisti_online_rooms');

async function listActiveSessionsForUid(uid = '') {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return [];

  const [chessSnap, pistiSnap] = await Promise.all([
    colChess().orderBy('updatedAt', 'desc').limit(100).get().catch(() => ({ docs: [] })),
    colOnlinePisti().orderBy('updatedAt', 'desc').limit(100).get().catch(() => ({ docs: [] }))
  ]);

  const sessions = [];
  for (const doc of chessSnap.docs || []) {
    const data = doc.data() || {};
    const status = cleanStr(data.status || '', 24);
    const participants = [cleanStr(data.host?.uid || '', 160), cleanStr(data.guest?.uid || '', 160)].filter(Boolean);
    if (!participants.includes(safeUid)) continue;
    const cleanupAt = safeNum(data.cleanupAt, 0);
    const lastActivityAt = Math.max(safeNum(data.lastActivityAt, 0), safeNum(data.updatedAt, 0), safeNum(data.host?.lastPing, 0), safeNum(data.guest?.lastPing, 0));
    sessions.push({
      gameType: 'chess',
      roomId: doc.id,
      status,
      cleanupAt,
      updatedAt: safeNum(data.updatedAt, 0),
      lastActivityAt,
      settlementStatus: cleanStr(data.settlementStatus || '', 24),
      resultCode: cleanStr(data.resultCode || '', 64),
      canResume: ['waiting', 'playing'].includes(status),
      canReview: ['finished', 'abandoned'].includes(status) && cleanupAt > Date.now()
    });
  }


  for (const doc of pistiSnap.docs || []) {
    const data = doc.data() || {};
    const status = cleanStr(data.status || '', 24);
    const players = Array.isArray(data.players) ? data.players : [];
    if (!players.some((player) => cleanStr(player?.uid || '', 160) === safeUid)) continue;
    const cleanupAt = safeNum(data.cleanupAt, 0);
    const lastActivityAt = Math.max(safeNum(data.updatedAt, 0), ...players.map((player) => safeNum(player?.lastPing, 0)));
    sessions.push({
      gameType: 'pisti',
      roomId: doc.id,
      status,
      cleanupAt,
      updatedAt: safeNum(data.updatedAt, 0),
      lastActivityAt,
      settlementStatus: cleanStr(data.settlementStatus || '', 24),
      resultCode: cleanStr(data.resultCode || '', 64),
      canResume: ['waiting', 'playing'].includes(status),
      canReview: ['finished', 'abandoned'].includes(status) && cleanupAt > Date.now()
    });
  }

  sessions.sort((a, b) => safeNum(b.cleanupAt || 0, 0) - safeNum(a.cleanupAt || 0, 0));
  return sessions.slice(0, 20);
}

async function assertNoOtherActiveGame(uid = '', { allowGameType = '', allowRoomId = '' } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return true;
  const sessions = await listActiveSessionsForUid(safeUid);
  const blocked = sessions.find((item) => {
    if (!['waiting', 'playing'].includes(cleanStr(item.status || '', 24))) return false;
    if (allowRoomId && cleanStr(item.roomId || '', 160) === cleanStr(allowRoomId || '', 160)) return false;
    if (allowGameType && cleanStr(item.gameType || '', 24) === cleanStr(allowGameType || '', 24)) return false;
    return true;
  });
  if (blocked) {
    const label = cleanStr(blocked.gameType || '', 24) === 'pisti' ? 'Pişti' : cleanStr(blocked.gameType || '', 24) === 'chess' ? 'Satranç' : 'oyun';
    throw new Error(`Başka aktif bir ${label} oturumun var.`);
  }
  return true;
}

module.exports = {
  listActiveSessionsForUid,
  assertNoOtherActiveGame
};
