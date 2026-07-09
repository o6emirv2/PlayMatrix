const { runtimeStore } = require('./runtimeStore');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const DEFAULT_REWARDS = Object.freeze([
  { id: 'mc-5000', label: '5.000 MC', type: 'mc', amount: 5000, weight: 44 },
  { id: 'mc-10000', label: '10.000 MC', type: 'mc', amount: 10000, weight: 40 },
  { id: 'mc-15000', label: '15.000 MC', type: 'mc', amount: 15000, weight: 34 },
  { id: 'mc-20000', label: '20.000 MC', type: 'mc', amount: 20000, weight: 30 },
  { id: 'mc-25000', label: '25.000 MC', type: 'mc', amount: 25000, weight: 24 },
  { id: 'mc-45000', label: '45.000 MC', type: 'mc', amount: 45000, weight: 18 },
  { id: 'mc-65000', label: '65.000 MC', type: 'mc', amount: 65000, weight: 12 },
  { id: 'mc-90000', label: '90.000 MC', type: 'mc', amount: 90000, weight: 8 },
  { id: 'mc-120000', label: '120.000 MC', type: 'mc', amount: 120000, weight: 5 },
  { id: 'mc-250000', label: '250.000 MC', type: 'mc', amount: 250000, weight: 3 },
  { id: 'mc-500000', label: '500.000 MC', type: 'mc', amount: 500000, weight: 2 },
  { id: 'mc-1000000', label: '1.000.000 MC', type: 'mc', amount: 1000000, weight: 1 }
]);

function normalizeRewardType(value = 'mc') {
  const raw = String(value || 'mc').trim().toLocaleLowerCase('tr-TR');
  if (raw === 'xp') return 'xp';
  if (['empty', 'blank', 'none', 'bos', 'boş'].includes(raw)) return 'empty';
  return raw === 'mc' ? 'mc' : 'empty';
}

function sanitizeReward(reward = {}, index = 0) {
  const type = normalizeRewardType(reward.type || 'mc');
  const rawAmount = Math.max(0, Math.min(100000000, Math.trunc(Number(reward.amount || reward.prize || 0))));
  const amount = type === 'empty' ? 0 : rawAmount;
  const weight = Math.max(0.01, Math.min(100000, Number(reward.weight || 1)));
  const id = String(reward.id || `${type}-${amount || index}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || `${type}-${index}`;
  const fallbackLabel = type === 'mc'
    ? `${amount.toLocaleString('tr-TR')} MC`
    : type === 'xp'
      ? `${amount.toLocaleString('tr-TR')} XP`
      : 'Boş';
  const label = String(reward.label || fallbackLabel).replace(/[<>]/g, '').slice(0, 80);
  return { id, label, type, amount, weight };
}

function normalizeRewards(rewards = []) {
  const rows = Array.isArray(rewards)
    ? rewards.map(sanitizeReward).filter((item) => item.weight > 0 && (item.amount > 0 || item.type === 'empty'))
    : [];
  return rows.length ? rows.slice(0, 50) : DEFAULT_REWARDS.map((item, index) => sanitizeReward(item, index));
}

async function getWheelConfig() {
  const cached = runtimeStore.temporary.get('wheel:config');
  if (cached) return cached;
  const defaults = {
    active: true,
    resetTimezone: 'Europe/Istanbul',
    reset: '00:00',
    rewards: normalizeRewards(DEFAULT_REWARDS),
    source: 'default',
    memoryOnly: false,
    updatedAt: 0
  };
  const { db } = initFirebaseAdmin();
  if (db) {
    const snap = await db.collection('runtimeConfig').doc('wheel').get().catch(() => null);
    if (snap?.exists) {
      const data = snap.data() || {};
      const config = { ...defaults, ...data, active: data.active !== false, rewards: normalizeRewards(data.rewards || data.rewardPool || DEFAULT_REWARDS), source: 'firestore', memoryOnly: false };
      runtimeStore.temporary.set('wheel:config', config, 60000);
      return config;
    }
  }
  runtimeStore.temporary.set('wheel:config', defaults, 60000);
  return defaults;
}

async function setWheelConfig(input = {}, { actor = {} } = {}) {
  const config = {
    active: input.active !== false,
    resetTimezone: 'Europe/Istanbul',
    reset: '00:00',
    rewards: normalizeRewards(input.rewards || input.rewardPool || []),
    updatedAt: Date.now(),
    actor: { uid: String(actor.uid || ''), email: String(actor.email || '') },
    source: 'firestore',
    memoryOnly: false
  };
  runtimeStore.temporary.set('wheel:config', config, 60000);
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('runtimeConfig').doc('wheel').set(config, { merge: true });
  return { ok: true, firestore: !!db, memoryOnly: !db, config };
}

function pickWeightedReward(rewards = DEFAULT_REWARDS) {
  const rows = normalizeRewards(rewards);
  const total = rows.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 1;
  let roll = Math.random() * total;
  for (const reward of rows) {
    roll -= Number(reward.weight || 0);
    if (roll <= 0) return reward;
  }
  return rows[0];
}

module.exports = { DEFAULT_REWARDS, getWheelConfig, setWheelConfig, pickWeightedReward, normalizeRewards };
