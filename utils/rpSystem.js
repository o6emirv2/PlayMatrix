// utils/rpSystem.js
'use strict';

const { admin } = require('../config/firebase');
const { RP_TIERS } = require('../config/constants');
const { safeNum, safeSignedNum, cleanStr, nowMs } = require('./helpers');
const { normalizeUserRankState } = require('./progression');

// ---------------------------------------------------------
// TEMEL RP VE SEVİYE HESAPLAMALARI
// ---------------------------------------------------------

function getTierIndex(rp){
  const v = safeNum(rp, 0);
  for (let i = 0; i < RP_TIERS.length; i++){
    if (v >= RP_TIERS[i].min && v <= RP_TIERS[i].max) return i;
  }
  return 0;
}

function clampRp(rp){
  const v = safeNum(rp, 0);
  // Sadece eksiye düşmesi engelleniyor (15.000 sınırı kaldırılmıştı)
  return Math.max(0, v);
}

function applyRpDelta(currentRp, delta){
  return clampRp(safeNum(currentRp, 0) + safeSignedNum(delta, 0));
}

function calcDisplayLevelFromRp(rp) {
  const safeRp = Math.max(0, safeNum(rp, 0));
  const level = Math.floor(Math.sqrt(safeRp / 10)) + 1;
  return Math.max(1, Math.min(100, level));
}

function calcVipLevel(rp) {
  const value = safeNum(rp, 0);
  if (value < 1000) return 1;
  if (value < 3000) return 2;
  if (value < 5000) return 3;
  if (value < 10000) return 4;
  if (value < 15000) return 5;
  return 6;
}

// ---------------------------------------------------------
// MC HARCAMA BAZLI RP KAZANIM MANTIĞI
// ---------------------------------------------------------

function normalizeRpSourceKey(source = '') {
  return String(source || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isCasinoRpSource(source = '') {
  const key = normalizeRpSourceKey(source);
  return ['crash_bet', 'mines_bet', 'bj_bet', 'bj_spend'].includes(key);
}

function rpEarnedFromMcSpend(mc, source = ''){
  const v = Math.floor(safeNum(mc, 0));
  if (v <= 0) return 0;

  if (isCasinoRpSource(source)) {
    return Math.max(1, Math.floor(v / 100));
  }

  // Kullanıcının istediği RP kademeleri:
  if (v >= 200000) return 100;
  if (v >= 100000) return 60;
  if (v >= 40000)  return 40;
  if (v >= 20000)  return 3;
  if (v >= 10000)  return 2;
  if (v >= 1000)   return 1;
  return 0;
}

// ---------------------------------------------------------
// VERİTABANI İŞLEMLERİ (TRANSACTIONS)
// ---------------------------------------------------------

function setUserRpRank(tx, uRef, nextRp, extra = {}){
  const v = clampRp(nextRp);
  const normalized = normalizeUserRankState({ rp: v, ...(extra && typeof extra === 'object' ? extra : {}) });
  tx.set(uRef, { ...normalized, rpUpdatedAt: nowMs(), ...extra }, { merge: true });
  return v;
}

function incrementUserRpRank(tx, uRef, delta, extra = {}) {
  const safeDelta = Math.max(0, Math.floor(safeNum(delta, 0)));
  if (safeDelta <= 0) return 0;
  tx.set(uRef, {
    rp: admin.firestore.FieldValue.increment(safeDelta),
    rank: admin.firestore.FieldValue.increment(safeDelta),
    totalRp: admin.firestore.FieldValue.increment(safeDelta),
    competitiveScore: admin.firestore.FieldValue.increment(safeDelta),
    seasonRp: admin.firestore.FieldValue.increment(safeDelta),
    seasonScore: admin.firestore.FieldValue.increment(safeDelta),
    rpUpdatedAt: nowMs(),
    ...extra
  }, { merge: true });
  return safeDelta;
}

function addUserActivityCounters(tx, uRef, { score = 0, rounds = 0, spentMc = 0 } = {}) {
  const payload = {};
  const safeScore = Math.max(0, Math.floor(safeNum(score, 0)));
  const safeRounds = Math.max(0, Math.floor(safeNum(rounds, 0)));
  const safeSpent = Math.max(0, Math.floor(safeNum(spentMc, 0)));

  if (safeScore > 0) payload.monthlyActiveScore = admin.firestore.FieldValue.increment(safeScore);
  if (safeRounds > 0) payload.totalRounds = admin.firestore.FieldValue.increment(safeRounds);
  if (safeSpent > 0) payload.totalSpentMc = admin.firestore.FieldValue.increment(safeSpent);

  if (Object.keys(payload).length) {
    payload.activityUpdatedAt = nowMs();
    tx.set(uRef, payload, { merge: true });
  }
}

function awardRpFromSpend(tx, uRef, uData, spendMc, source, options = {}){
  const safeSource = cleanStr(source || 'SPEND');
  const safeSpend = Math.max(0, Math.floor(safeNum(spendMc, 0)));
  const earned = rpEarnedFromMcSpend(safeSpend, safeSource);
  const hasCustomActivityScore = Object.prototype.hasOwnProperty.call(options || {}, 'activityScore');
  const activityScore = hasCustomActivityScore ? Math.max(0, Math.floor(safeNum(options.activityScore, 0))) : (safeSpend > 0 ? 1 : 0);
  const rounds = Math.max(0, Math.floor(safeNum(options.rounds, 0)));
  addUserActivityCounters(tx, uRef, { score: activityScore, rounds, spentMc: safeSpend });

  if (earned <= 0) return 0;
  incrementUserRpRank(tx, uRef, earned, { lastRpSource: safeSource, lastRpEarned: earned });
  return earned;
}

module.exports = {
  getTierIndex,
  clampRp,
  applyRpDelta,
  calcDisplayLevelFromRp,
  calcVipLevel,
  normalizeRpSourceKey,
  isCasinoRpSource,
  rpEarnedFromMcSpend,
  setUserRpRank,
  incrementUserRpRank,
  addUserActivityCounters,
  awardRpFromSpend
};