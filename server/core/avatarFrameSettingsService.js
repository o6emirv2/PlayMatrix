'use strict';

const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');

const AVATAR_FRAME_VARIANTS = Object.freeze([
  'homeTopbar', 'leaderboard', 'accountModal', 'accountProfileCard', 'marketCard',
  'crashTopbar', 'crashLivePanel', 'crashWinNotice', 'chessTopbar', 'chessGameCard',
  'pistiTopbar', 'pistiScoreCard', 'snakeTopbar', 'spaceTopbar', 'patternTopbar'
]);
const FRAME_TYPES = Object.freeze(['normal', 'market']);
const THICKNESS_PROFILES = Object.freeze(['thin', 'normal', 'thick', 'ultra']);
const CACHE_KEY = 'avatar-frame:settings:v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DOC_PATH = Object.freeze({ collection: 'systemConfig', doc: 'avatarFrame' });

function finite(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeVariant(value = '') {
  const variant = String(value || '').trim();
  return AVATAR_FRAME_VARIANTS.includes(variant) ? variant : '';
}

function normalizeFrameType(value = '') {
  const type = String(value || '').trim().toLowerCase();
  return FRAME_TYPES.includes(type) ? type : '';
}

function normalizeFrameIndex(type = '', value = 0) {
  const normalizedType = normalizeFrameType(type);
  const max = normalizedType === 'market' ? 32 : 18;
  const number = Math.trunc(Number(value) || 0);
  return Math.max(0, Math.min(max, number));
}

function normalizeSetting(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const thickness = String(source.thickness || source.profile || 'normal').trim().toLowerCase();
  return {
    avatarScale: finite(source.avatarScale, 1, 0.65, 1.5),
    frameScale: finite(source.frameScale, 1, 0.7, 1.8),
    avatarOffsetX: finite(source.avatarOffsetX, 0, -30, 30),
    avatarOffsetY: finite(source.avatarOffsetY, 0, -30, 30),
    frameOffsetX: finite(source.frameOffsetX, 0, -30, 30),
    frameOffsetY: finite(source.frameOffsetY, 0, -30, 30),
    innerPadding: finite(source.innerPadding, 0, 0, 24),
    outerPadding: finite(source.outerPadding, 0, 0, 24),
    thickness: THICKNESS_PROFILES.includes(thickness) ? thickness : 'normal',
    overflow: source.overflow === 'hidden' ? 'hidden' : 'visible'
  };
}

function frameSettingKey(type = '', index = 0, variant = '') {
  const safeType = normalizeFrameType(type);
  const safeIndex = normalizeFrameIndex(safeType, index);
  const safeVariant = normalizeVariant(variant);
  return safeType && safeIndex && safeVariant ? `${safeType}:${safeIndex}:${safeVariant}` : '';
}

function emptyConfig() {
  return { version: 1, variants: {}, frames: {}, updatedAt: 0, updatedBy: null };
}

function normalizeConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const variants = {};
  const frames = {};
  for (const variant of AVATAR_FRAME_VARIANTS) {
    if (source.variants?.[variant]) variants[variant] = normalizeSetting(source.variants[variant]);
  }
  for (const [key, value] of Object.entries(source.frames || {})) {
    const [type, indexRaw, variant] = String(key).split(':');
    const normalizedKey = frameSettingKey(type, indexRaw, variant);
    if (normalizedKey) frames[normalizedKey] = normalizeSetting(value);
  }
  return {
    version: 1,
    variants,
    frames,
    updatedAt: Number(source.updatedAt || 0) || 0,
    updatedBy: source.updatedBy && typeof source.updatedBy === 'object'
      ? { uid: String(source.updatedBy.uid || '').slice(0, 160), email: String(source.updatedBy.email || '').slice(0, 200) }
      : null
  };
}

async function readAvatarFrameSettings({ force = false } = {}) {
  if (!force) {
    const cached = runtimeStore.temporary.get(CACHE_KEY);
    if (cached) return normalizeConfig(cached);
  }
  const { db } = initFirebaseAdmin();
  if (!db) return emptyConfig();
  const snap = await db.collection(DOC_PATH.collection).doc(DOC_PATH.doc).get().catch(() => null);
  const config = normalizeConfig(snap?.exists ? snap.data() : {});
  runtimeStore.temporary.set(CACHE_KEY, config, CACHE_TTL_MS);
  return config;
}

async function saveAvatarFrameSetting({ variant, frameType = '', frameIndex = 0, setting = {}, reset = false, actor = null } = {}) {
  const safeVariant = normalizeVariant(variant);
  if (!safeVariant) throw Object.assign(new Error('INVALID_AVATAR_FRAME_VARIANT'), { statusCode: 400 });
  const safeType = normalizeFrameType(frameType);
  const safeIndex = normalizeFrameIndex(safeType, frameIndex);
  const specificKey = safeType && safeIndex ? frameSettingKey(safeType, safeIndex, safeVariant) : '';
  const current = await readAvatarFrameSettings({ force: true });
  if (specificKey) {
    if (reset) delete current.frames[specificKey];
    else current.frames[specificKey] = normalizeSetting(setting);
  } else if (reset) delete current.variants[safeVariant];
  else current.variants[safeVariant] = normalizeSetting(setting);
  current.updatedAt = Date.now();
  current.updatedBy = actor ? { uid: String(actor.uid || '').slice(0, 160), email: String(actor.email || '').slice(0, 200) } : null;
  const normalized = normalizeConfig(current);
  const { db } = initFirebaseAdmin();
  if (db) await db.collection(DOC_PATH.collection).doc(DOC_PATH.doc).set(normalized, { merge: false });
  runtimeStore.temporary.set(CACHE_KEY, normalized, CACHE_TTL_MS);
  return { config: normalized, key: specificKey || safeVariant, setting: specificKey ? normalized.frames[specificKey] || null : normalized.variants[safeVariant] || null };
}

module.exports = {
  AVATAR_FRAME_VARIANTS,
  FRAME_TYPES,
  THICKNESS_PROFILES,
  normalizeVariant,
  normalizeFrameType,
  normalizeFrameIndex,
  normalizeSetting,
  normalizeConfig,
  frameSettingKey,
  readAvatarFrameSettings,
  saveAvatarFrameSetting
};
