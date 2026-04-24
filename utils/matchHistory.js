'use strict';

const crypto = require('crypto');
const { db } = require('../config/firebase');
const { cleanStr, safeNum, nowMs } = require('./helpers');

const colMatchHistory = () => db.collection('match_history');

async function saveMatchHistory(entry = {}) {
  try {
    const participants = Array.isArray(entry.participants) ? entry.participants.filter(Boolean).map((item) => cleanStr(item, 160)).slice(0, 8) : [];
    if (!participants.length) return false;
    const createdAt = safeNum(entry.createdAt, nowMs());
    const historyId = cleanStr(entry.id || '', 220) || crypto.randomUUID();
    await colMatchHistory().doc(historyId).set({
      gameType: cleanStr(entry.gameType || 'unknown', 24),
      roomId: cleanStr(entry.roomId || '', 160),
      status: cleanStr(entry.status || 'finished', 24),
      result: cleanStr(entry.result || '', 160),
      winnerUid: cleanStr(entry.winnerUid || '', 160),
      loserUid: cleanStr(entry.loserUid || '', 160),
      participants,
      score: entry.score && typeof entry.score === 'object' ? entry.score : {},
      rewards: entry.rewards && typeof entry.rewards === 'object' ? entry.rewards : {},
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
      createdAt
    }, { merge: true });
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeMatchHistoryItem(doc, perspectiveUid = '') {
  const data = doc?.data ? (doc.data() || {}) : (doc || {});
  const safePerspectiveUid = cleanStr(perspectiveUid || '', 160);
  const participants = Array.isArray(data.participants) ? data.participants.map((item) => cleanStr(item || '', 160)).filter(Boolean) : [];
  const winnerUid = cleanStr(data.winnerUid || '', 160);
  const loserUid = cleanStr(data.loserUid || '', 160);
  const gameType = cleanStr(data.gameType || data.game || 'unknown', 24) || 'unknown';
  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : {};
  const createdAt = safeNum(data.createdAt?.toMillis?.() || data.createdAt, 0);
  const myReward = safePerspectiveUid && rewards && typeof rewards === 'object'
    ? safeNum(rewards[safePerspectiveUid], 0)
    : 0;

  let outcome = 'neutral';
  if (safePerspectiveUid) {
    if (winnerUid && winnerUid === safePerspectiveUid) outcome = 'win';
    else if (loserUid && loserUid === safePerspectiveUid) outcome = 'loss';
    else if (cleanStr(data.result || '', 40).toLowerCase() === 'draw') outcome = 'draw';
  }

  const titleMap = {
    chess: 'Satranç',
    pisti: 'Online Pişti',
    crash: 'Crash',
  };

  return {
    id: doc?.id || cleanStr(data.id || '', 220),
    gameType,
    title: titleMap[gameType] || gameType || 'Maç',
    roomId: cleanStr(data.roomId || '', 160),
    status: cleanStr(data.status || 'finished', 24),
    result: cleanStr(data.result || '', 160),
    winnerUid,
    loserUid,
    participants,
    createdAt,
    outcome,
    opponentUid: participants.find((uid) => uid && uid !== safePerspectiveUid) || '',
    score: data.score && typeof data.score === 'object' ? data.score : {},
    rewards,
    rewardMc: myReward,
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {}
  };
}

async function listMatchHistoryForUid(uid = '', { limit = 20, cursor = '', gameType = '' } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return { items: [], nextCursor: '' };
  const safeLimit = Math.max(1, Math.min(100, Math.floor(safeNum(limit, 20))));
  const safeCursor = cleanStr(cursor || '', 220);
  const safeGameType = cleanStr(gameType || '', 24).toLowerCase();

  const snap = await colMatchHistory().where('participants', 'array-contains', safeUid).limit(Math.max(60, safeLimit * 4)).get().catch(() => ({ docs: [] }));
  let items = (snap.docs || []).map((doc) => normalizeMatchHistoryItem(doc, safeUid));
  if (safeGameType) items = items.filter((item) => item.gameType === safeGameType);
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(b.id || '').localeCompare(String(a.id || '')));

  if (safeCursor) {
    const [cursorTsRaw, cursorIdRaw] = safeCursor.split('|');
    const cursorTs = safeNum(cursorTsRaw, 0);
    const cursorId = cleanStr(cursorIdRaw || '', 220);
    items = items.filter((item) => {
      if ((item.createdAt || 0) < cursorTs) return true;
      if ((item.createdAt || 0) > cursorTs) return false;
      return cursorId ? String(item.id || '') < cursorId : false;
    });
  }

  const pageItems = items.slice(0, safeLimit);
  const nextCursor = items.length > safeLimit
    ? `${safeNum(pageItems[pageItems.length - 1]?.createdAt, 0)}|${cleanStr(pageItems[pageItems.length - 1]?.id || '', 220)}`
    : '';
  return { items: pageItems, nextCursor };
}

async function summarizeMatchHistoryForUid(uid = '', { sampleLimit = 120 } = {}) {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return { totalMatches: 0, wins: 0, losses: 0, draws: 0, byGame: {} };
  const safeSampleLimit = Math.max(1, Math.min(500, Math.floor(safeNum(sampleLimit, 120))));
  const page = await listMatchHistoryForUid(safeUid, { limit: safeSampleLimit });
  const byGame = {};
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalRewardMc = 0;

  for (const item of page.items || []) {
    if (item.outcome === 'win') wins += 1;
    else if (item.outcome === 'loss') losses += 1;
    else if (item.outcome === 'draw') draws += 1;
    totalRewardMc += safeNum(item.rewardMc, 0);

    if (!byGame[item.gameType]) byGame[item.gameType] = { matches: 0, wins: 0, losses: 0, draws: 0, rewardMc: 0 };
    byGame[item.gameType].matches += 1;
    if (item.outcome === 'win') byGame[item.gameType].wins += 1;
    if (item.outcome === 'loss') byGame[item.gameType].losses += 1;
    if (item.outcome === 'draw') byGame[item.gameType].draws += 1;
    byGame[item.gameType].rewardMc += safeNum(item.rewardMc, 0);
  }

  return {
    totalMatches: (page.items || []).length,
    wins,
    losses,
    draws,
    totalRewardMc,
    byGame
  };
}

module.exports = {
  saveMatchHistory,
  normalizeMatchHistoryItem,
  listMatchHistoryForUid,
  summarizeMatchHistoryForUid
};
