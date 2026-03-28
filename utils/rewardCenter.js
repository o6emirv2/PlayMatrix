'use strict';

const { cleanStr, safeNum } = require('./helpers');
const { canonicalizeRewardSource, getRewardDefinition } = require('../config/rewardCatalog');
const { getRewardCatalogConfig } = require('./adminConfig');

const DEFAULT_WHEEL_POOL = Object.freeze([2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000]);
const DEFAULT_ACTIVITY_PASS_TIERS = Object.freeze([
  Object.freeze({ level: 1, need: 10, rewardMc: 2500, badge: 'Başlangıç' }),
  Object.freeze({ level: 2, need: 25, rewardMc: 5000, badge: 'Aktif Oyuncu' }),
  Object.freeze({ level: 3, need: 50, rewardMc: 7500, badge: 'Sosyal Usta' }),
  Object.freeze({ level: 4, need: 80, rewardMc: 10000, badge: 'Sezon Koşucusu' }),
  Object.freeze({ level: 5, need: 120, rewardMc: 15000, badge: 'PlayMatrix Elite' })
]);

function buildRewardCatalogMap(items = []) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const source = canonicalizeRewardSource(item?.source || '');
    if (!source) return;
    map.set(source, item);
  });
  return map;
}

function getRewardItem(source = '', itemsOrMap = null) {
  const key = canonicalizeRewardSource(source || '');
  if (!key) return null;
  if (itemsOrMap instanceof Map) return itemsOrMap.get(key) || getRewardDefinition(key) || null;
  if (Array.isArray(itemsOrMap)) return buildRewardCatalogMap(itemsOrMap).get(key) || getRewardDefinition(key) || null;
  return getRewardDefinition(key) || null;
}

function isRewardEnabled(item = null) {
  return !item || item.enabled !== false;
}

function getFixedRewardAmount(source = '', itemsOrMap = null, fallback = 0) {
  const item = getRewardItem(source, itemsOrMap);
  if (!isRewardEnabled(item)) return 0;
  return Math.max(0, Math.floor(safeNum(item?.amount, fallback)));
}

function getRewardLadder(source = '', itemsOrMap = null, fallback = []) {
  const item = getRewardItem(source, itemsOrMap);
  const base = Array.isArray(item?.ladder) ? item.ladder : fallback;
  return base.map((value) => Math.max(0, Math.floor(safeNum(value, 0)))).filter((value) => value > 0);
}

function getWheelRewardPool(itemsOrMap = null) {
  const item = getRewardItem('wheel_spin', itemsOrMap);
  if (!isRewardEnabled(item)) return [];
  const pool = Array.isArray(item?.wheelPool) ? item.wheelPool : DEFAULT_WHEEL_POOL;
  const normalized = pool.map((value) => Math.max(0, Math.floor(safeNum(value, 0)))).filter((value) => value > 0);
  if (normalized.length) return normalized;
  const min = Math.max(0, Math.floor(safeNum(item?.amountMin, DEFAULT_WHEEL_POOL[0])));
  const max = Math.max(min, Math.floor(safeNum(item?.amountMax, DEFAULT_WHEEL_POOL[DEFAULT_WHEEL_POOL.length - 1])));
  return [min, max].filter((value, index, arr) => index === 0 || value !== arr[index - 1]);
}

function normalizeActivityPassTier(item = {}, index = 0) {
  const level = Math.max(1, Math.floor(safeNum(item?.level, index + 1)));
  const need = Math.max(1, Math.floor(safeNum(item?.need, 0)));
  const rewardMc = Math.max(0, Math.floor(safeNum(item?.rewardMc ?? item?.amount, 0)));
  const badge = cleanStr(item?.badge || `Seviye ${level}`, 40) || `Seviye ${level}`;
  return { level, need, rewardMc, badge };
}

function getActivityPassMilestones(itemsOrMap = null) {
  const item = getRewardItem('activity_pass', itemsOrMap);
  if (!isRewardEnabled(item)) return [];
  const tiers = Array.isArray(item?.tiers) ? item.tiers : DEFAULT_ACTIVITY_PASS_TIERS;
  return tiers.map(normalizeActivityPassTier).sort((a, b) => a.level - b.level);
}

function buildRegistrationRewardSnapshot(itemsOrMap = null) {
  const signupAmount = getFixedRewardAmount('signup_reward', itemsOrMap, 50000);
  const emailAmount = getFixedRewardAmount('email_verify_reward', itemsOrMap, 100000);
  return {
    signupAmount,
    emailAmount,
    totalAmount: signupAmount + emailAmount,
    label: `${signupAmount.toLocaleString('tr-TR')} + ${emailAmount.toLocaleString('tr-TR')} MC`
  };
}

function buildRewardCatalogSourceMeta(itemsOrMap = null) {
  const registration = buildRegistrationRewardSnapshot(itemsOrMap);
  const monthlyLadder = getRewardLadder('monthly_active_reward', itemsOrMap, [50000, 20000, 10000, 5000, 2500]);
  const wheelPool = getWheelRewardPool(itemsOrMap);
  const activityPass = getActivityPassMilestones(itemsOrMap);
  return {
    registration,
    monthlyLadder,
    wheelPool,
    activityPass,
    chessWinAmount: getFixedRewardAmount('chess_win', itemsOrMap, 5000),
    chessDailyCap: Math.max(0, Math.floor(safeNum(getRewardItem('chess_win', itemsOrMap)?.dailyCap, 10))),
    referralInviterAmount: getFixedRewardAmount('referral_inviter', itemsOrMap, 50000),
    referralInviteeAmount: getFixedRewardAmount('referral_invitee', itemsOrMap, 10000)
  };
}

async function getRewardRuntimeCatalog(options = {}) {
  const config = await getRewardCatalogConfig(options);
  const map = buildRewardCatalogMap(config?.items || []);
  return { ...config, map, meta: buildRewardCatalogSourceMeta(map) };
}

module.exports = {
  DEFAULT_WHEEL_POOL,
  DEFAULT_ACTIVITY_PASS_TIERS,
  buildRewardCatalogMap,
  getRewardItem,
  isRewardEnabled,
  getFixedRewardAmount,
  getRewardLadder,
  getWheelRewardPool,
  getActivityPassMilestones,
  buildRegistrationRewardSnapshot,
  buildRewardCatalogSourceMeta,
  getRewardRuntimeCatalog
};
