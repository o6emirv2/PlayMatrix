'use strict';

let firebaseCache = null;
const { CHAT_RETENTION_POLICY } = require('../config/constants');
const { listRewardCatalog } = require('../config/rewardCatalog');
const { cleanStr, safeNum, nowMs } = require('./helpers');
const { TtlCache } = require('./cache');
const { DEFAULT_SMOKE_MATRIX_CONFIG, normalizeSmokeMatrixConfig } = require('./smokeMatrix');
const { DEFAULT_CONTROLLED_ROLLOUT, sanitizeControlledRollout } = require('./controlledRollout');

function getFirebase() {
  if (!firebaseCache) firebaseCache = require('../config/firebase');
  return firebaseCache;
}

const colConfig = () => getFirebase().db.collection('ops_config');
const policyCache = new TtlCache(15000, 32);
const rewardCache = new TtlCache(15000, 16);
const smokeCache = new TtlCache(15000, 8);
const rolloutCache = new TtlCache(15000, 8);

function sanitizeRetentionValue(value, fallback) {
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? Math.floor(numeric) : Math.floor(safeNum(fallback, 7));
  return Math.max(1, Math.min(90, base));
}

function normalizeChatRetentionPolicy(data = {}) {
  const lobbyDays = sanitizeRetentionValue(data.lobbyDays, CHAT_RETENTION_POLICY.lobbyDays);
  const directDays = sanitizeRetentionValue(data.directDays, CHAT_RETENTION_POLICY.directDays);
  return {
    lobbyDays,
    directDays,
    lobbyLabel: `Global ${lobbyDays} Gün`,
    directLabel: `DM ${directDays} Gün`,
    summaryLabel: `Global ${lobbyDays} Gün · DM ${directDays} Gün`
  };
}

async function getChatRetentionPolicyConfig() {
  return policyCache.remember('chat-retention', async () => {
    try {
      const snap = await colConfig().doc('runtime_policy').get();
      const raw = snap.exists ? (snap.data() || {}) : {};
      const policy = normalizeChatRetentionPolicy(raw.chatRetention || raw);
      return {
        ...policy,
        updatedAt: safeNum(raw.updatedAt, 0),
        updatedBy: cleanStr(raw.updatedBy || '', 160)
      };
    } catch (_) {
      return {
        ...normalizeChatRetentionPolicy(CHAT_RETENTION_POLICY),
        updatedAt: 0,
        updatedBy: ''
      };
    }
  }, 15000);
}

async function setChatRetentionPolicyConfig(input = {}, actorUid = '') {
  const policy = normalizeChatRetentionPolicy(input);
  const payload = {
    chatRetention: policy,
    updatedAt: nowMs(),
    updatedBy: cleanStr(actorUid || '', 160),
    version: getFirebase().admin.firestore.FieldValue.increment(1)
  };
  await colConfig().doc('runtime_policy').set(payload, { merge: true });
  const result = { ...policy, updatedAt: payload.updatedAt, updatedBy: payload.updatedBy };
  policyCache.set('chat-retention', result, 15000);
  return result;
}

function sanitizeRewardOverride(source = '', value = {}) {
  const safeSource = cleanStr(source || '', 80).toLowerCase();
  if (!safeSource) return null;
  const out = { source: safeSource };
  if (value && typeof value === 'object') {
    if (value.enabled !== undefined) out.enabled = value.enabled !== false;
    if (value.amount !== undefined) out.amount = Math.max(0, Math.floor(safeNum(value.amount, 0)));
    if (value.amountMin !== undefined) out.amountMin = Math.max(0, Math.floor(safeNum(value.amountMin, 0)));
    if (value.amountMax !== undefined) out.amountMax = Math.max(0, Math.floor(safeNum(value.amountMax, 0)));
    if (value.dailyCap !== undefined) out.dailyCap = Math.max(0, Math.floor(safeNum(value.dailyCap, 0)));
    if (value.cadence !== undefined) out.cadence = cleanStr(value.cadence || '', 40);
    if (value.formula !== undefined) out.formula = cleanStr(value.formula || '', 120);
    if (value.description !== undefined) out.description = cleanStr(value.description || '', 280);
    if (Array.isArray(value.ladder)) out.ladder = value.ladder.slice(0, 10).map((n) => Math.max(0, Math.floor(safeNum(n, 0))));
    if (Array.isArray(value.wheelPool)) out.wheelPool = value.wheelPool.slice(0, 24).map((n) => Math.max(0, Math.floor(safeNum(n, 0)))).filter((n) => n > 0);
    if (Array.isArray(value.tiers)) out.tiers = value.tiers.slice(0, 12).map((row, index) => ({
      level: Math.max(1, Math.floor(safeNum(row?.level, index + 1))),
      need: Math.max(1, Math.floor(safeNum(row?.need, 1))),
      rewardMc: Math.max(0, Math.floor(safeNum(row?.rewardMc ?? row?.amount, 0))),
      badge: cleanStr(row?.badge || `Seviye ${index + 1}`, 40) || `Seviye ${index + 1}`
    }));
  }
  return out;
}

function mergeRewardCatalog(baseItems = [], overrideRows = []) {
  const overrideMap = new Map((Array.isArray(overrideRows) ? overrideRows : []).map((row) => [row.source, row]));
  return (Array.isArray(baseItems) ? baseItems : []).map((item) => {
    const override = overrideMap.get(item.source);
    if (!override) return { ...item, enabled: item.enabled !== false };
    const merged = { ...item, ...override };
    if (override.ladder) merged.ladder = override.ladder.slice(0, 10);
    if (override.wheelPool) merged.wheelPool = override.wheelPool.slice(0, 24);
    if (override.tiers) merged.tiers = override.tiers.slice(0, 12);
    merged.enabled = override.enabled !== false;
    return merged;
  }).sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function getRewardCatalogConfig({ includePrivate = true } = {}) {
  const cacheKey = includePrivate ? 'reward:all' : 'reward:public';
  return rewardCache.remember(cacheKey, async () => {
    const baseItems = listRewardCatalog({ includePrivate });
    try {
      const snap = await colConfig().doc('reward_catalog').get();
      const raw = snap.exists ? (snap.data() || {}) : {};
      const rawOverrides = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {};
      const overrides = Object.entries(rawOverrides).map(([source, value]) => sanitizeRewardOverride(source, value)).filter(Boolean);
      return {
        items: mergeRewardCatalog(baseItems, overrides),
        overrides,
        updatedAt: safeNum(raw.updatedAt, 0),
        updatedBy: cleanStr(raw.updatedBy || '', 160)
      };
    } catch (_) {
      return { items: mergeRewardCatalog(baseItems, []), overrides: [], updatedAt: 0, updatedBy: '' };
    }
  }, 15000);
}

async function setRewardCatalogConfig(overrides = {}, actorUid = '') {
  const known = new Set(listRewardCatalog({ includePrivate: true }).map((item) => item.source));
  const out = {};
  for (const [source, value] of Object.entries(overrides || {})) {
    const safe = sanitizeRewardOverride(source, value);
    if (!safe || !known.has(safe.source)) continue;
    const copy = { ...safe };
    delete copy.source;
    out[safe.source] = copy;
  }
  await colConfig().doc('reward_catalog').set({
    overrides: out,
    updatedAt: nowMs(),
    updatedBy: cleanStr(actorUid || '', 160),
    version: getFirebase().admin.firestore.FieldValue.increment(1)
  }, { merge: true });
  rewardCache.clear();
  return getRewardCatalogConfig({ includePrivate: true });
}


async function getSmokeMatrixConfig() {
  return smokeCache.remember('smoke-matrix', async () => {
    try {
      const snap = await colConfig().doc('smoke_matrix').get();
      const raw = snap.exists ? (snap.data() || {}) : {};
      return normalizeSmokeMatrixConfig(raw);
    } catch (_) {
      return { ...DEFAULT_SMOKE_MATRIX_CONFIG, cases: {} };
    }
  }, 15000);
}

async function setSmokeMatrixConfig(input = {}, actorUid = '') {
  const current = await getSmokeMatrixConfig();
  const incoming = input?.cases && typeof input.cases === 'object' ? input.cases : input;
  const next = normalizeSmokeMatrixConfig({
    ...current,
    cases: {
      ...(current.cases || {}),
      ...Object.entries(incoming || {}).reduce((acc, [caseId, value]) => {
        const safeCaseId = cleanStr(caseId || '', 120);
        if (!safeCaseId) return acc;
        acc[safeCaseId] = {
          status: cleanStr(value?.status || 'pending', 16),
          note: cleanStr(value?.note || value?.notes || '', 280),
          testedAt: safeNum(value?.testedAt || nowMs(), nowMs()),
          testedBy: cleanStr(value?.testedBy || actorUid || '', 160),
          build: cleanStr(value?.build || '', 120)
        };
        return acc;
      }, {})
    },
    updatedAt: nowMs(),
    updatedBy: cleanStr(actorUid || '', 160)
  }, actorUid);
  await colConfig().doc('smoke_matrix').set({
    ...next,
    version: getFirebase().admin.firestore.FieldValue.increment(1)
  }, { merge: true });
  smokeCache.set('smoke-matrix', next, 15000);
  return next;
}

async function getControlledRolloutConfig() {
  return rolloutCache.remember('controlled-rollout', async () => {
    try {
      const snap = await colConfig().doc('controlled_rollout').get();
      const raw = snap.exists ? (snap.data() || {}) : {};
      return sanitizeControlledRollout({ ...DEFAULT_CONTROLLED_ROLLOUT, ...raw });
    } catch (_) {
      return sanitizeControlledRollout(DEFAULT_CONTROLLED_ROLLOUT);
    }
  }, 15000);
}

async function setControlledRolloutConfig(input = {}, actorUid = '') {
  const next = sanitizeControlledRollout({
    ...(await getControlledRolloutConfig()),
    ...(input && typeof input === 'object' ? input : {}),
    updatedAt: nowMs(),
    updatedBy: cleanStr(actorUid || '', 160)
  }, actorUid);
  await colConfig().doc('controlled_rollout').set({
    ...next,
    version: getFirebase().admin.firestore.FieldValue.increment(1)
  }, { merge: true });
  rolloutCache.set('controlled-rollout', next, 15000);
  return next;
}

module.exports = {
  normalizeChatRetentionPolicy,
  getChatRetentionPolicyConfig,
  setChatRetentionPolicyConfig,
  sanitizeRewardOverride,
  mergeRewardCatalog,
  getRewardCatalogConfig,
  setRewardCatalogConfig,
  getSmokeMatrixConfig,
  setSmokeMatrixConfig,
  getControlledRolloutConfig,
  setControlledRolloutConfig
};
