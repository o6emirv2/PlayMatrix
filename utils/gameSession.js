'use strict';

const { db } = require('../config/firebase');
const { cleanStr } = require('./helpers');

const colChess = () => db.collection('chess_rooms');
const colOnlinePisti = () => db.collection('pisti_online_rooms');
const colBJ = () => db.collection('bj_sessions');

async function listActiveSessionsForUid(uid = '', options = {}) {
  const safeUid = cleanStr(uid, 160);
  if (!safeUid) return [];
  const includeBlackjack = options && options.includeBlackjack === true;
  const [chessSnap, pistiSnap, bjSnap] = await Promise.all([
    colChess().orderBy('updatedAt', 'desc').limit(100).get().catch(() => ({ docs: [] })),
    colOnlinePisti().orderBy('updatedAt', 'desc').limit(100).get().catch(() => ({ docs: [] })),
    includeBlackjack ? colBJ().doc(safeUid).get().catch(() => ({ exists: false, data: () => ({}) })) : Promise.resolve({ exists: false, data: () => ({}) })
  ]);

  const sessions = [];
  for (const doc of chessSnap.docs || []) {
    const data = doc.data() || {};
    const status = cleanStr(data.status || '', 24);
    const cleanupAt = Number(data.cleanupAt || 0);
    const resumable = ['waiting', 'playing'].includes(status) || (['finished', 'abandoned'].includes(status) && cleanupAt > Date.now());
    if (!resumable) continue;
    if ([cleanStr(data.host?.uid || '', 160), cleanStr(data.guest?.uid || '', 160)].includes(safeUid)) {
      sessions.push({ gameType: 'chess', roomId: doc.id, status, cleanupAt, resumeAvailableUntil: Number(data.resumeAvailableUntil || cleanupAt || 0), canResume: ['waiting','playing'].includes(status), canReview: ['finished','abandoned'].includes(status) && cleanupAt > Date.now(), resumePath: `/Online Oyunlar/Satranc.html?joinRoom=${encodeURIComponent(doc.id)}`, resumeLabel: ['waiting','playing'].includes(status) ? 'Oyuna Dön' : 'Sonucu Gör', antiStallThresholdMs: 16000 });
    }
  }
  for (const doc of pistiSnap.docs || []) {
    const data = doc.data() || {};
    const status = cleanStr(data.status || '', 24);
    const cleanupAt = Number(data.cleanupAt || 0);
    const resumable = ['waiting', 'playing'].includes(status) || (['finished', 'abandoned'].includes(status) && cleanupAt > Date.now());
    if (!resumable) continue;
    const players = Array.isArray(data.players) ? data.players : [];
    if (players.some((player) => cleanStr(player?.uid || '', 160) === safeUid)) {
      sessions.push({ gameType: 'pisti', roomId: doc.id, status, cleanupAt, resumeAvailableUntil: Number(data.resumeAvailableUntil || cleanupAt || 0), canResume: ['waiting','playing'].includes(status), canReview: ['finished','abandoned'].includes(status) && cleanupAt > Date.now(), resumePath: `/Online Oyunlar/Pisti.html?joinRoom=${encodeURIComponent(doc.id)}`, resumeLabel: ['waiting','playing'].includes(status) ? 'Oyuna Dön' : 'Sonucu Gör', antiStallThresholdMs: 18000 });
    }
  }
  if (includeBlackjack && bjSnap && bjSnap.exists) {
    const data = bjSnap.data() || {};
    const gameState = cleanStr(data.gameState || '', 24);
    const cleanupAt = Number(data.cleanupAt || 0);
    const resumeAvailableUntil = Number(data.resumeAvailableUntil || cleanupAt || 0);
    const resumable = ['playing', 'resolving'].includes(gameState) || (gameState === 'finished' && cleanupAt > Date.now());
    if (resumable) {
      sessions.push({
        gameType: 'blackjack',
        roomId: cleanStr(data.roundId || safeUid, 160) || safeUid,
        sessionId: safeUid,
        status: gameState || 'playing',
        cleanupAt,
        resumeAvailableUntil,
        canResume: ['playing', 'resolving'].includes(gameState),
        canReview: gameState === 'finished' && cleanupAt > Date.now(),
        resumePath: '/Casino/BlackJack.html?resume=1',
        resumeLabel: ['playing', 'resolving'].includes(gameState) ? 'Masaya Dön' : 'Sonucu Gör',
        antiStallThresholdMs: 14000
      });
    }
  }

  return sessions;
}

function pickActiveGameConflict(sessions = [], { allowGameType = '', allowRoomId = '' } = {}) {
  const safeAllowGameType = cleanStr(allowGameType || '', 24);
  const relevant = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  if (!relevant.length) return null;

  const filtered = relevant.filter((entry) => {
    if (!entry) return false;
    if (allowRoomId && entry.roomId === allowRoomId) return false;
    return true;
  });

  if (!filtered.length) return null;

  const crossGameConflict = filtered.find((entry) => safeAllowGameType && cleanStr(entry.gameType || '', 24) !== safeAllowGameType);
  if (crossGameConflict) return crossGameConflict;

  const sameGamePlayingConflict = filtered.find((entry) => cleanStr(entry.gameType || '', 24) === safeAllowGameType && cleanStr(entry.status || '', 24) === 'playing');
  if (sameGamePlayingConflict) return sameGamePlayingConflict;

  const sameGameWaitingConflict = filtered.find((entry) => cleanStr(entry.gameType || '', 24) === safeAllowGameType && cleanStr(entry.status || '', 24) === 'waiting');
  if (sameGameWaitingConflict) return sameGameWaitingConflict;

  return filtered[0] || null;
}

async function assertNoOtherActiveGame(uid = '', { allowGameType = '', allowRoomId = '' } = {}) {
  const sessions = await listActiveSessionsForUid(uid);
  const conflict = pickActiveGameConflict(sessions, { allowGameType, allowRoomId });
  if (conflict) {
    const gameType = cleanStr(conflict.gameType || allowGameType || '', 24);
    const label = gameType === 'chess'
      ? 'Satranç'
      : (gameType === 'pisti' ? 'Pişti' : 'oyun');
    throw new Error(`Önce aktif ${label} oturumunu kapatmalısın.`);
  }
  return true;
}

module.exports = {
  listActiveSessionsForUid,
  pickActiveGameConflict,
  assertNoOtherActiveGame
};
