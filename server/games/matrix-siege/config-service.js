'use strict';

const { initFirebaseAdmin } = require('../../config/firebaseAdmin');
const { runtimeStore } = require('../../core/runtimeStore');

const BASE_CONFIG = Object.freeze({
  version: 1,
  energy: { start: 3, max: 10, regenPerSecond: 1 },
  maxUnitsOnField: 56,
  playerUnits: [
    { unitId: 'code-runner', name: 'Kod Koşucusu', role: 'fighter', energyCost: 3, maxHp: 140, damage: 34, attackRange: 24, attackCooldownMs: 700, movementSpeed: 72, color: '#39ff88', radius: 11, unlockStage: 1 },
    { unitId: 'neon-ranger', name: 'Neon Nişancı', role: 'ranged', energyCost: 4, maxHp: 105, damage: 42, attackRange: 150, attackCooldownMs: 950, movementSpeed: 54, color: '#41d7ff', radius: 10, unlockStage: 2 },
    { unitId: 'matrix-guardian', name: 'Matrix Muhafızı', role: 'tank', energyCost: 6, maxHp: 360, damage: 28, attackRange: 28, attackCooldownMs: 900, movementSpeed: 36, color: '#ffd166', radius: 15, unlockStage: 4 },
    { unitId: 'pulse-mage', name: 'Pulse Büyücüsü', role: 'aoe', energyCost: 7, maxHp: 125, damage: 45, attackRange: 125, attackCooldownMs: 1300, movementSpeed: 42, color: '#d66cff', radius: 12, unlockStage: 7 },
    { unitId: 'cyber-commander', name: 'Siber Komutan', role: 'support', energyCost: 9, maxHp: 210, damage: 30, attackRange: 80, attackCooldownMs: 1000, movementSpeed: 40, color: '#ff4fa3', radius: 13, unlockStage: 11 }
  ],
  enemyUnits: [
    { unitId: 'glitch-raider', name: 'Glitch Akıncı', role: 'fighter', maxHp: 120, damage: 28, attackRange: 24, attackCooldownMs: 780, movementSpeed: 65, color: '#ff5b63', radius: 11 },
    { unitId: 'void-drone', name: 'Void Drone', role: 'ranged', maxHp: 95, damage: 36, attackRange: 140, attackCooldownMs: 1050, movementSpeed: 50, color: '#f973ff', radius: 10 },
    { unitId: 'iron-brute', name: 'Demir Dev', role: 'tank', maxHp: 320, damage: 33, attackRange: 30, attackCooldownMs: 980, movementSpeed: 31, color: '#ff9f43', radius: 16 },
    { unitId: 'hex-caster', name: 'Hex Büyücüsü', role: 'aoe', maxHp: 120, damage: 40, attackRange: 118, attackCooldownMs: 1350, movementSpeed: 39, color: '#a855f7', radius: 12 },
    { unitId: 'null-warden', name: 'Null Muhafız', role: 'support', maxHp: 190, damage: 29, attackRange: 75, attackCooldownMs: 1050, movementSpeed: 38, color: '#ef4444', radius: 13 }
  ],
  bosses: [
    { unitId: 'boss-sentinel', name: 'Kuantum Sentinel', role: 'tank', maxHp: 1800, damage: 72, attackRange: 50, attackCooldownMs: 900, movementSpeed: 23, color: '#ffbf36', radius: 25 },
    { unitId: 'boss-null-titan', name: 'Null Titan', role: 'aoe', maxHp: 2900, damage: 92, attackRange: 105, attackCooldownMs: 1200, movementSpeed: 19, color: '#ff3d81', radius: 29 }
  ],
  xp: { maxPerRun: 1000, baseWin: 180, perStar: 120, bossBonus: 160 },
  crystals: { baseWin: 18, perStar: 6, bossBonus: 15 },
  upgradeCosts: [0, 40, 90, 160, 260, 400, 580, 820, 1120, 1500],
  missions: [
    { missionId: 'spawn-5', title: '5 birlik üret', type: 'spawn', target: 5, rewardCrystals: 20 },
    { missionId: 'spawn-ranger-2', title: '2 Neon Nişancı üret', type: 'spawn-unit', unitId: 'neon-ranger', target: 2, rewardCrystals: 24 },
    { missionId: 'win-1', title: 'Bir savaş kazan', type: 'wins', target: 1, rewardCrystals: 25 },
    { missionId: 'win-3', title: '3 savaş kazan', type: 'wins', target: 3, rewardCrystals: 50 },
    { missionId: 'defeat-25', title: '25 düşman yok et', type: 'defeats', target: 25, rewardCrystals: 35 },
    { missionId: 'no-base-damage', title: 'Üs hasarı almadan kazan', type: 'perfect-win', target: 1, rewardCrystals: 45 },
    { missionId: 'fast-win', title: '90 saniye altında kazan', type: 'fast-win', target: 1, rewardCrystals: 40 },
    { missionId: 'boss-win', title: 'Bir boss yen', type: 'boss-win', target: 1, rewardCrystals: 60 },
    { missionId: 'stars-6', title: 'Toplam 6 yıldız kazan', type: 'stars', target: 6, rewardCrystals: 45 },
    { missionId: 'damage-5000', title: '5.000 hasar ver', type: 'damage', target: 5000, rewardCrystals: 55 }
  ]
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const integer = (value, min, max, fallback) => Math.trunc(clamp(value, min, max, fallback));
const safeText = (value, fallback, max = 80) => {
  const text = String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
  return text || fallback;
};
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
const ROLES = new Set(['fighter', 'ranged', 'tank', 'aoe', 'support']);

function sanitizeUnitList(input, baseList, kind) {
  const rows = Array.isArray(input) ? input : [];
  return baseList.map((base) => {
    const source = rows.find((row) => String(row?.unitId || '') === base.unitId) || base;
    const player = kind === 'player';
    return {
      ...base,
      name: safeText(source.name, base.name, 60),
      role: ROLES.has(String(source.role || '')) ? String(source.role) : base.role,
      ...(player ? { energyCost: integer(source.energyCost, 1, 10, base.energyCost), unlockStage: integer(source.unlockStage, 1, 20, base.unlockStage) } : {}),
      maxHp: integer(source.maxHp, player ? 40 : 40, kind === 'boss' ? 20000 : 6000, base.maxHp),
      damage: integer(source.damage, 1, kind === 'boss' ? 1000 : 600, base.damage),
      attackRange: integer(source.attackRange, 8, 320, base.attackRange),
      attackCooldownMs: integer(source.attackCooldownMs, 250, 6000, base.attackCooldownMs),
      movementSpeed: integer(source.movementSpeed, 5, 220, base.movementSpeed),
      color: safeColor(source.color, base.color),
      radius: integer(source.radius, 6, kind === 'boss' ? 48 : 32, base.radius)
    };
  });
}

function sanitizeMissions(input) {
  const rows = Array.isArray(input) ? input : [];
  return BASE_CONFIG.missions.map((base) => {
    const source = rows.find((row) => String(row?.missionId || '') === base.missionId) || base;
    return {
      ...base,
      title: safeText(source.title, base.title, 90),
      target: integer(source.target, 1, 100000, base.target),
      rewardCrystals: integer(source.rewardCrystals, 0, 10000, base.rewardCrystals)
    };
  });
}

function stageWorld(stage) {
  return stage <= 7 ? 1 : stage <= 14 ? 2 : 3;
}

function stageName(stage) {
  const names = ['Neon Ova', 'Kod Vadisi', 'Siber Geçit'];
  return `${names[stageWorld(stage) - 1]} ${stage}`;
}

function buildStages(config = BASE_CONFIG) {
  const stages = [];
  for (let index = 1; index <= 20; index += 1) {
    const world = stageWorld(index);
    const boss = index === 10 ? 'boss-sentinel' : index === 20 ? 'boss-null-titan' : '';
    const scale = 1 + (index - 1) * 0.08;
    const ids = config.enemyUnits.map((unit) => unit.unitId);
    const waves = [];
    let atMs = 3500;
    const waveCount = Math.min(9, 3 + Math.floor(index / 2));
    for (let wave = 0; wave < waveCount; wave += 1) {
      const unitId = ids[(index + wave) % Math.min(ids.length, 1 + Math.ceil(index / 4))];
      waves.push({ atMs, unitId, count: 1 + Math.floor((index + wave) / 6), gapMs: 700 - Math.min(300, index * 10) });
      atMs += 6500 - Math.min(2200, index * 90);
    }
    if (boss) waves.push({ atMs: Math.max(28000, atMs - 2000), unitId: boss, count: 1, gapMs: 1000 });
    stages.push({
      stageId: index,
      name: stageName(index),
      world,
      isBoss: Boolean(boss),
      bossId: boss,
      durationMs: 120000,
      parTimeMs: Math.max(55000, 100000 - index * 1600),
      playerBaseHp: 1000,
      enemyBaseHp: Math.round((900 + index * 85) * (boss ? 1.12 : 1)),
      difficulty: Number(scale.toFixed(2)),
      waves
    });
  }
  return stages;
}

function sanitizeStages(input, config) {
  const rows = Array.isArray(input) ? input : [];
  const allowedEnemies = new Set([...config.enemyUnits, ...config.bosses].map((unit) => unit.unitId));
  return buildStages(config).map((base) => {
    const source = rows.find((row) => Number(row?.stageId) === base.stageId) || base;
    const durationMs = integer(source.durationMs, 45000, 300000, base.durationMs);
    const rawWaves = Array.isArray(source.waves) ? source.waves : base.waves;
    const waves = rawWaves.slice(0, 80).map((wave) => ({
      atMs: integer(wave?.atMs, 0, durationMs, 0),
      unitId: allowedEnemies.has(String(wave?.unitId || '')) ? String(wave.unitId) : '',
      count: integer(wave?.count, 1, 20, 1),
      gapMs: integer(wave?.gapMs, 100, 10000, 600)
    })).filter((wave) => wave.unitId).sort((a, b) => a.atMs - b.atMs);
    return {
      ...base,
      name: safeText(source.name, base.name, 70),
      durationMs,
      parTimeMs: integer(source.parTimeMs, 30000, durationMs, Math.min(base.parTimeMs, durationMs)),
      playerBaseHp: integer(source.playerBaseHp, 200, 20000, base.playerBaseHp),
      enemyBaseHp: integer(source.enemyBaseHp, 200, 30000, base.enemyBaseHp),
      difficulty: Number(clamp(source.difficulty, 0.25, 20, base.difficulty).toFixed(2)),
      waves: waves.length ? waves : base.waves
    };
  });
}

function sanitizeConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const next = clone(BASE_CONFIG);
  next.version = integer(source.version, 1, Number.MAX_SAFE_INTEGER, 1);
  next.maxUnitsOnField = integer(source.maxUnitsOnField, 20, 100, BASE_CONFIG.maxUnitsOnField);
  next.energy = {
    start: clamp(source.energy?.start, 0, 10, BASE_CONFIG.energy.start),
    max: clamp(source.energy?.max, 5, 20, BASE_CONFIG.energy.max),
    regenPerSecond: clamp(source.energy?.regenPerSecond, 0.2, 5, BASE_CONFIG.energy.regenPerSecond)
  };
  if (next.energy.start > next.energy.max) next.energy.start = next.energy.max;
  next.xp = {
    maxPerRun: integer(source.xp?.maxPerRun, 1, 1000, BASE_CONFIG.xp.maxPerRun),
    baseWin: integer(source.xp?.baseWin, 0, 1000, BASE_CONFIG.xp.baseWin),
    perStar: integer(source.xp?.perStar, 0, 400, BASE_CONFIG.xp.perStar),
    bossBonus: integer(source.xp?.bossBonus, 0, 500, BASE_CONFIG.xp.bossBonus)
  };
  next.crystals = {
    baseWin: integer(source.crystals?.baseWin, 0, 10000, BASE_CONFIG.crystals.baseWin),
    perStar: integer(source.crystals?.perStar, 0, 5000, BASE_CONFIG.crystals.perStar),
    bossBonus: integer(source.crystals?.bossBonus, 0, 10000, BASE_CONFIG.crystals.bossBonus)
  };
  next.playerUnits = sanitizeUnitList(source.playerUnits, BASE_CONFIG.playerUnits, 'player');
  next.enemyUnits = sanitizeUnitList(source.enemyUnits, BASE_CONFIG.enemyUnits, 'enemy');
  next.bosses = sanitizeUnitList(source.bosses, BASE_CONFIG.bosses, 'boss');
  next.missions = sanitizeMissions(source.missions);
  next.upgradeCosts = [...BASE_CONFIG.upgradeCosts];
  next.stages = sanitizeStages(source.stages, next);
  return next;
}

async function getConfig() {
  const cached = runtimeStore.temporary.get('matrix-siege:config');
  if (cached) return cached;
  const { db } = initFirebaseAdmin();
  let config = sanitizeConfig(BASE_CONFIG);
  if (db) {
    const snapshot = await db.collection('matrixSiegeConfigs').doc('active').get().catch(() => null);
    if (snapshot?.exists) config = sanitizeConfig(snapshot.data() || {});
  }
  runtimeStore.temporary.set('matrix-siege:config', config, 60000);
  return config;
}

async function saveConfig(input, actor = {}) {
  const current = await getConfig();
  const config = sanitizeConfig({ ...current, ...input, version: Number(current.version || 1) + 1 });
  const { db } = initFirebaseAdmin();
  if (db) {
    await db.collection('matrixSiegeConfigs').doc(`v${config.version}`).set({ ...config, actor, createdAt: Date.now() }, { merge: false });
    await db.collection('matrixSiegeConfigs').doc('active').set({ ...config, actor, updatedAt: Date.now() }, { merge: false });
  }
  runtimeStore.temporary.set('matrix-siege:config', config, 60000);
  return config;
}

module.exports = { BASE_CONFIG, buildStages, sanitizeConfig, getConfig, saveConfig, stageWorld };
