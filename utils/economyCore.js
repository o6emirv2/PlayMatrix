'use strict';

const { admin } = require('../config/firebase');
const { safeNum, nowMs, cleanStr } = require('./helpers');
const { buildCanonicalUserState } = require('./accountState');
const { addAccountXpExact, normalizeUserRankState } = require('./progression');

function normalizeMcAmount(value = 0) {
  const amount = Math.floor(safeNum(value, 0));
  return amount > 0 ? amount : 0;
}

function normalizeXpAmount(value = 0) {
  const amount = Math.floor(safeNum(value, 0));
  return amount > 0 ? amount : 0;
}

function calculateSpendProgressReward(spendMc = 0, source = '') {
  const spend = normalizeMcAmount(spendMc);
  const normalizedSource = cleanStr(source || 'GAME_SPEND', 64) || 'GAME_SPEND';
  if (spend <= 0) return { xpEarned: 0, activityEarned: 0, roundsEarned: 0, spentMc: 0, source: normalizedSource };
  let xpEarned = 0;
  if (spend >= 200000) xpEarned = 120;
  else if (spend >= 100000) xpEarned = 72;
  else if (spend >= 40000) xpEarned = 42;
  else if (spend >= 20000) xpEarned = 24;
  else if (spend >= 10000) xpEarned = 14;
  else if (spend >= 1000) xpEarned = 6;
  return { xpEarned, activityEarned: 1, roundsEarned: 1, spentMc: spend, source: normalizedSource };
}

function buildProgressionPatch(userData = {}, progress = {}) {
  const xpEarned = normalizeXpAmount(progress.xpEarned ?? progress.xp ?? progress.amount);
  const activityEarned = Math.max(0, Math.floor(safeNum(progress.activityEarned, 0)));
  const roundsEarned = Math.max(0, Math.floor(safeNum(progress.roundsEarned, 0)));
  const spentMc = normalizeMcAmount(progress.spentMc);
  const updatedAt = Math.max(0, safeNum(progress.updatedAt, nowMs())) || nowMs();
  const nextUser = {
    ...userData,
    accountXpExact: addAccountXpExact(userData, xpEarned),
    monthlyActiveScore: Math.max(0, safeNum(userData.monthlyActiveScore, 0) + activityEarned),
    totalRounds: Math.max(0, safeNum(userData.totalRounds, 0) + roundsEarned),
    totalSpentMc: Math.max(0, safeNum(userData.totalSpentMc, 0) + spentMc)
  };
  const canonical = buildCanonicalUserState(nextUser, { defaultFrame: 0 });
  const normalized = normalizeUserRankState({ ...nextUser, ...canonical, monthlyActiveScore: nextUser.monthlyActiveScore });
  const source = cleanStr(progress.source || 'PROGRESSION', 80) || 'PROGRESSION';
  const patch = {
    ...canonical,
    ...normalized,
    monthlyActiveScore: nextUser.monthlyActiveScore,
    totalRounds: nextUser.totalRounds,
    totalSpentMc: nextUser.totalSpentMc,
    activityUpdatedAt: updatedAt,
    accountProgressionUpdatedAt: updatedAt,
    lastGameProgressSource: source,
    lastGameXpEarned: xpEarned
  };
  if (progress.referenceId) patch.lastGameProgressReferenceId = cleanStr(progress.referenceId, 180);
  return { patch, canonical, normalized, nextUser, xpEarned, activityEarned, roundsEarned, spentMc, source };
}

function applyProgressionPatchInTransaction(tx, userRef, userData = {}, progress = {}) {
  if (!tx || typeof tx.set !== 'function') throw new Error('ECONOMY_TRANSACTION_REQUIRED');
  if (!userRef) throw new Error('ECONOMY_USER_REF_REQUIRED');
  const out = buildProgressionPatch(userData, progress);
  tx.set(userRef, out.patch, { merge: true });
  return out;
}

function buildBalanceDebitPatch(amount = 0, extra = {}) {
  const safeAmount = normalizeMcAmount(amount);
  if (safeAmount <= 0) throw new Error('INVALID_MC_DEBIT_AMOUNT');
  return {
    balance: admin.firestore.FieldValue.increment(-safeAmount),
    updatedAt: Math.max(0, safeNum(extra.updatedAt, nowMs())) || nowMs(),
    lastMcDebitAmount: safeAmount,
    lastMcDebitSource: cleanStr(extra.source || 'mc_debit', 80)
  };
}

function buildBalanceCreditPatch(amount = 0, extra = {}) {
  const safeAmount = normalizeMcAmount(amount);
  if (safeAmount <= 0) throw new Error('INVALID_MC_CREDIT_AMOUNT');
  return {
    balance: admin.firestore.FieldValue.increment(safeAmount),
    updatedAt: Math.max(0, safeNum(extra.updatedAt, nowMs())) || nowMs(),
    lastMcCreditAmount: safeAmount,
    lastMcCreditSource: cleanStr(extra.source || 'mc_credit', 80)
  };
}

module.exports = {
  normalizeMcAmount,
  normalizeXpAmount,
  calculateSpendProgressReward,
  buildProgressionPatch,
  applyProgressionPatchInTransaction,
  buildBalanceDebitPatch,
  buildBalanceCreditPatch
};
