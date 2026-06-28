const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');

const AVATAR_FRAME_VARIANTS = Object.freeze([
  'homeTopbar', 'leaderboard', 'accountModal', 'accountProfileCard', 'marketCard',
  'crashTopbar', 'crashLivePanel', 'crashWinNotice', 'chessTopbar', 'chessGameCard',
  'pistiTopbar', 'pistiScoreCard', 'snakeTopbar', 'spaceTopbar', 'patternTopbar'
]);

const DEFAULT_VARIANT_SETTING = Object.freeze({
  avatarScale: 1,
  frameScale: 1,
  avatarOffsetX: 0,
  avatarOffsetY: 0,
  frameOffsetX: 0,
  frameOffsetY: 0,
  innerPadding: 0,
  outerPadding: 0,
  overflow: 'visible',
  borderRadiusMode: 'circle',
  zIndex: 1
});

function clamp(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanVariant(value = '') {
  const key = String(value || '').trim();
  return AVATAR_FRAME_VARIANTS.includes(key) ? key : '';
}

function normalizeSetting(input = {}) {
  return {
    avatarScale: clamp(input.avatarScale, DEFAULT_VARIANT_SETTING.avatarScale, 0.5, 1.3),
    frameScale: clamp(input.frameScale, DEFAULT_VARIANT_SETTING.frameScale, 0.7, 1.6),
    avatarOffsetX: clamp(input.avatarOffsetX, DEFAULT_VARIANT_SETTING.avatarOffsetX, -40, 40),
    avatarOffsetY: clamp(input.avatarOffsetY, DEFAULT_VARIANT_SETTING.avatarOffsetY, -40, 40),
    frameOffsetX: clamp(input.frameOffsetX, DEFAULT_VARIANT_SETTING.frameOffsetX, -40, 40),
    frameOffsetY: clamp(input.frameOffsetY, DEFAULT_VARIANT_SETTING.frameOffsetY, -40, 40),
    innerPadding: clamp(input.innerPadding, DEFAULT_VARIANT_SETTING.innerPadding, 0, 40),
    outerPadding: clamp(input.outerPadding, DEFAULT_VARIANT_SETTING.outerPadding, 0, 40),
    overflow: input.overflow === 'hidden' ? 'hidden' : 'visible',
    borderRadiusMode: ['circle', 'rounded', 'square'].includes(String(input.borderRadiusMode || '')) ? String(input.borderRadiusMode) : 'circle',
    zIndex: Math.trunc(clamp(input.zIndex, DEFAULT_VARIANT_SETTING.zIndex, 0, 20))
  };
}

function normalizeSettingsPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const variants = {};
  const rawVariants = source.variants && typeof source.variants === 'object' ? source.variants : source;
  for (const variant of AVATAR_FRAME_VARIANTS) {
    variants[variant] = normalizeSetting(rawVariants[variant] || DEFAULT_VARIANT_SETTING);
  }
  return {
    version: 'playmatrix-avatar-frame-v2',
    variants,
    updatedAt: Number(source.updatedAt || Date.now()) || Date.now()
  };
}

async function getAvatarFrameSettings() {
  const cached = runtimeStore.temporary.get('avatar-frame:settings');
  if (cached) return cached;
  const { db } = initFirebaseAdmin();
  let data = null;
  if (db) {
    const snap = await db.collection('runtimeConfig').doc('avatarFrameSettings').get().catch(() => null);
    data = snap?.exists ? snap.data() : null;
  }
  const settings = normalizeSettingsPayload(data || {});
  runtimeStore.temporary.set('avatar-frame:settings', settings, 60000);
  return settings;
}

async function setAvatarFrameSettings(payload = {}, { actor = {} } = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const replaceAll = source.replaceAll === true || source.mode === 'replace';
  const current = replaceAll ? normalizeSettingsPayload({}) : await getAvatarFrameSettings().catch(() => normalizeSettingsPayload({}));
  const rawVariants = source.variants && typeof source.variants === 'object' ? source.variants : source;
  const nextVariants = { ...(current.variants || {}) };
  for (const [variant, raw] of Object.entries(rawVariants || {})) {
    const cleanKey = cleanVariant(variant);
    if (!cleanKey || !raw || typeof raw !== 'object') continue;
    nextVariants[cleanKey] = normalizeSetting({ ...(nextVariants[cleanKey] || DEFAULT_VARIANT_SETTING), ...raw });
  }
  const settings = normalizeSettingsPayload({ variants: nextVariants, updatedAt: Date.now() });
  settings.actor = { uid: String(actor.uid || ''), email: String(actor.email || '') };
  runtimeStore.temporary.set('avatar-frame:settings', settings, 30 * 86400000);
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('runtimeConfig').doc('avatarFrameSettings').set(settings, { merge: true });
  return { ok: true, firestore: !!db, settings, merge: !replaceAll };
}

module.exports = { AVATAR_FRAME_VARIANTS, DEFAULT_VARIANT_SETTING, getAvatarFrameSettings, setAvatarFrameSettings, normalizeSetting, normalizeSettingsPayload };
