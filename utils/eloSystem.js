// utils/eloSystem.js
'use strict';

const { db, admin } = require('../config/firebase');
const { COMPETITIVE_ELO_DEFAULT, COMPETITIVE_ELO_FLOOR, COMPETITIVE_ELO_K } = require('../config/constants');
const { safeNum, safeSignedNum, nowMs } = require('./helpers');

const colUsers = () => db.collection('users');

// ---------------------------------------------------------
// ELO YARDIMCI FONKSİYONLARI
// ---------------------------------------------------------

function normalizeGameType(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('sat') || raw === 'chess') return 'chess';
  if (raw.includes('pist') || raw === 'pisti') return 'pisti';
  return '';
}

function getSafeCompetitiveElo(value, fallback = COMPETITIVE_ELO_DEFAULT) {
  const parsed = Math.round(safeNum(value, fallback));
  return Math.max(COMPETITIVE_ELO_FLOOR, parsed || fallback);
}

function getCompetitiveEloField(gameType = '') {
  return normalizeGameType(gameType) === 'pisti' ? 'pistiElo' : 'chessElo';
}

function formatEloDelta(delta = 0) {
  const safeDelta = Math.round(safeSignedNum(delta, 0));
  return `${safeDelta >= 0 ? '+' : ''}${safeDelta}`;
}

// ---------------------------------------------------------
// ELO MATEMATİĞİ (KAZANÇ / KAYIP HESAPLAMA)
// ---------------------------------------------------------

function calculateEloMatch(ratingA, ratingB, scoreA = 1, scoreB = 0, kFactor = COMPETITIVE_ELO_K) {
  const safeA = getSafeCompetitiveElo(ratingA);
  const safeB = getSafeCompetitiveElo(ratingB);
  
  const expectedA = 1 / (1 + Math.pow(10, (safeB - safeA) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (safeA - safeB) / 400));
  
  const newA = Math.max(COMPETITIVE_ELO_FLOOR, Math.round(safeA + kFactor * (safeNum(scoreA, 0) - expectedA)));
  const newB = Math.max(COMPETITIVE_ELO_FLOOR, Math.round(safeB + kFactor * (safeNum(scoreB, 0) - expectedB)));

  return {
    ratingA: safeA,
    ratingB: safeB,
    expectedA,
    expectedB,
    newA,
    newB,
    deltaA: newA - safeA,
    deltaB: newB - safeB
  };
}

// ---------------------------------------------------------
// VERİTABANI İŞLEMİ (TRANSACTION İÇİNDE ELO GÜNCELLEMESİ)
// ---------------------------------------------------------

async function applyMatchEloUpdate(tx, playerAUid, playerBUid, gameType, scoreA, scoreB) {
  const safeGameType = normalizeGameType(gameType);
  if (!playerAUid || !playerBUid || playerAUid === playerBUid || !safeGameType) {
    return { applied: false, reason: 'INVALID_MATCH' };
  }

  const field = getCompetitiveEloField(safeGameType);
  const [playerASnap, playerBSnap] = await Promise.all([
    tx.get(colUsers().doc(playerAUid)),
    tx.get(colUsers().doc(playerBUid))
  ]);

  if (!playerASnap.exists || !playerBSnap.exists) {
    return { applied: false, reason: 'USER_NOT_FOUND' };
  }

  const playerAData = playerASnap.data() || {};
  const playerBData = playerBSnap.data() || {};
  const currentA = getSafeCompetitiveElo(playerAData[field], COMPETITIVE_ELO_DEFAULT);
  const currentB = getSafeCompetitiveElo(playerBData[field], COMPETITIVE_ELO_DEFAULT);

  const result = calculateEloMatch(currentA, currentB, scoreA, scoreB, COMPETITIVE_ELO_K);

  const scoreAValue = safeNum(scoreA, 0);
  const scoreBValue = safeNum(scoreB, 0);
  const aWon = scoreAValue > scoreBValue;
  const bWon = scoreBValue > scoreAValue;

  const statFieldPrefix = safeGameType === 'chess' ? 'chess' : 'pisti';

  // Oyuncu A'yı Güncelle
  tx.set(colUsers().doc(playerAUid), {
    [field]: result.newA,
    [`${field}UpdatedAt`]: nowMs(),
    totalRounds: admin.firestore.FieldValue.increment(1),
    monthlyActiveScore: admin.firestore.FieldValue.increment(1),
    ...(aWon ? { [`${statFieldPrefix}Wins`]: admin.firestore.FieldValue.increment(1) } : bWon ? { [`${statFieldPrefix}Losses`]: admin.firestore.FieldValue.increment(1) } : {})
  }, { merge: true });

  // Oyuncu B'yi Güncelle
  tx.set(colUsers().doc(playerBUid), {
    [field]: result.newB,
    [`${field}UpdatedAt`]: nowMs(),
    totalRounds: admin.firestore.FieldValue.increment(1),
    monthlyActiveScore: admin.firestore.FieldValue.increment(1),
    ...(bWon ? { [`${statFieldPrefix}Wins`]: admin.firestore.FieldValue.increment(1) } : aWon ? { [`${statFieldPrefix}Losses`]: admin.firestore.FieldValue.increment(1) } : {})
  }, { merge: true });

  return {
    applied: true,
    field,
    gameType: safeGameType,
    playerA: {
      uid: playerAUid,
      oldElo: result.ratingA,
      newElo: result.newA,
      delta: result.deltaA,
      score: safeNum(scoreA, 0)
    },
    playerB: {
      uid: playerBUid,
      oldElo: result.ratingB,
      newElo: result.newB,
      delta: result.deltaB,
      score: safeNum(scoreB, 0)
    }
  };
}

// ---------------------------------------------------------
// SOCKET.IO BİLDİRİM YÜKLERİ
// ---------------------------------------------------------

function buildEloSocketPayload(summary, viewerUid) {
  if (!summary?.applied || !viewerUid) return null;
  const safeGameType = normalizeGameType(summary.gameType);
  const label = safeGameType === 'pisti' ? 'Pişti' : 'Satranç';
  const me = summary.playerA?.uid === viewerUid ? summary.playerA : summary.playerB;
  const opponent = summary.playerA?.uid === viewerUid ? summary.playerB : summary.playerA;
  
  if (!me || !opponent) return null;

  let outcome = 'draw';
  if (me.score > opponent.score) outcome = 'win';
  else if (me.score < opponent.score) outcome = 'loss';

  let message = `${label} ELO güncellendi. Yeni puanın: ${me.newElo} (${formatEloDelta(me.delta)})`;
  if (outcome === 'win') {
    message = `${label} maçını kazandın! Yeni ELO: ${me.newElo} (${formatEloDelta(me.delta)})`;
  } else if (outcome === 'loss') {
    message = `${label} maçını kaybettin. Yeni ELO: ${me.newElo} (${formatEloDelta(me.delta)})`;
  } else if (opponent) {
    message = `${label} maçı berabere bitti. Yeni ELO: ${me.newElo} (${formatEloDelta(me.delta)})`;
  }

  return {
    gameType: safeGameType,
    field: summary.field,
    newElo: me.newElo,
    oldElo: me.oldElo,
    delta: me.delta,
    score: me.score,
    outcome,
    message
  };
}

// Global io objesini parametre olarak alarak modüler yapıyı koruyoruz
function emitMatchEloSummary(io, summary) {
  if (!io || !summary?.applied) return;
  [summary.playerA?.uid, summary.playerB?.uid].filter(Boolean).forEach((uid) => {
    const payload = buildEloSocketPayload(summary, uid);
    if (payload) io.to(`user_${uid}`).emit('game:elo_update', payload);
  });
}

module.exports = {
  normalizeGameType,
  getSafeCompetitiveElo,
  getCompetitiveEloField,
  calculateEloMatch,
  applyMatchEloUpdate,
  buildEloSocketPayload,
  emitMatchEloSummary
};