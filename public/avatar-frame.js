'use strict';

(() => {
  const FALLBACK_AVATAR = '/public/assets/avatars/system/fallback.svg';
  const FRAME_ASSET_COUNT = 18;
  const FRAME_LEVEL_TO_ASSET = Object.freeze([
    Object.freeze({ min: 1, max: 15, asset: 1 }),
    Object.freeze({ min: 16, max: 30, asset: 2 }),
    Object.freeze({ min: 31, max: 40, asset: 3 }),
    Object.freeze({ min: 41, max: 50, asset: 4 }),
    Object.freeze({ min: 51, max: 60, asset: 5 }),
    Object.freeze({ min: 61, max: 80, asset: 6 }),
    Object.freeze({ min: 81, max: 85, asset: 7 }),
    Object.freeze({ min: 86, max: 90, asset: 8 }),
    Object.freeze({ min: 91, max: 91, asset: 9 }),
    Object.freeze({ min: 92, max: 92, asset: 10 }),
    Object.freeze({ min: 93, max: 93, asset: 11 }),
    Object.freeze({ min: 94, max: 94, asset: 12 }),
    Object.freeze({ min: 95, max: 95, asset: 13 }),
    Object.freeze({ min: 96, max: 96, asset: 14 }),
    Object.freeze({ min: 97, max: 97, asset: 15 }),
    Object.freeze({ min: 98, max: 98, asset: 16 }),
    Object.freeze({ min: 99, max: 99, asset: 17 }),
    Object.freeze({ min: 100, max: 100, asset: 18 })
  ]);

  const DEFAULT_FRAME_PROFILE = Object.freeze({ scale: 1.18, avatar: 1, shiftX: '0%', shiftY: '0%' });
  const FRAME_VISUAL_PROFILES = Object.freeze({
    1: Object.freeze({ scale: 1.27, avatar: 1, shiftX: '-0.6%', shiftY: '3.1%' }),
    2: Object.freeze({ scale: 1.30, avatar: 1, shiftX: '-0.2%', shiftY: '-1.6%' }),
    3: Object.freeze({ scale: 1.23, avatar: 1, shiftX: '2.1%', shiftY: '-1.2%' }),
    4: Object.freeze({ scale: 1.11, avatar: 1, shiftX: '0.6%', shiftY: '1.6%' }),
    5: Object.freeze({ scale: 1.13, avatar: 1, shiftX: '-0.3%', shiftY: '0.3%' }),
    6: Object.freeze({ scale: 1.32, avatar: 1, shiftX: '1.1%', shiftY: '-0.7%' }),
    7: Object.freeze({ scale: 1.18, avatar: 1, shiftX: '-0.6%', shiftY: '1.7%' }),
    8: Object.freeze({ scale: 1.14, avatar: 1, shiftX: '0.6%', shiftY: '-0.1%' }),
    9: Object.freeze({ scale: 1.09, avatar: 1, shiftX: '-0.4%', shiftY: '-0.7%' }),
    10: Object.freeze({ scale: 1.16, avatar: 1, shiftX: '0.1%', shiftY: '-1.7%' }),
    11: Object.freeze({ scale: 1.41, avatar: 1, shiftX: '0%', shiftY: '0.1%' }),
    12: Object.freeze({ scale: 1.23, avatar: 1, shiftX: '-0.2%', shiftY: '0.6%' }),
    13: Object.freeze({ scale: 1.32, avatar: 1, shiftX: '0.2%', shiftY: '-0.7%' }),
    14: Object.freeze({ scale: 1.22, avatar: 1, shiftX: '-5.6%', shiftY: '-5.6%' }),
    15: Object.freeze({ scale: 1.17, avatar: 1, shiftX: '-0.5%', shiftY: '-0.6%' }),
    16: Object.freeze({ scale: 1.20, avatar: 1, shiftX: '0%', shiftY: '-2.6%' }),
    17: Object.freeze({ scale: 1.22, avatar: 1, shiftX: '-0.1%', shiftY: '0.1%' }),
    18: Object.freeze({ scale: 1.54, avatar: 1, shiftX: '-0.6%', shiftY: '-0.7%' }),
    100: Object.freeze({ scale: 1.54, avatar: 1, shiftX: '-0.6%', shiftY: '-0.7%' })
  });

  const DEFAULT_MARKET_FRAME_PROFILE = Object.freeze({ scale: 1.08, avatar: 1.08, shiftX: '0px', shiftY: '0px', profile: 'market' });
  const MARKET_FRAME_VISUAL_PROFILES = Object.freeze({
    1: Object.freeze({ scale: 1.12, avatar: 1.04, shiftX: '0px', shiftY: '0px', profile: 'normal' }),
    2: Object.freeze({ scale: 1.10, avatar: 1.05, shiftX: '0px', shiftY: '0px', profile: 'normal' }),
    3: Object.freeze({ scale: 1.10, avatar: 1.06, shiftX: '0px', shiftY: '0px', profile: 'normal' }),
    4: Object.freeze({ scale: 1.08, avatar: 1.06, shiftX: '0px', shiftY: '0px', profile: 'normal' }),
    5: Object.freeze({ scale: 1.08, avatar: 1.06, shiftX: '0px', shiftY: '0px', profile: 'normal' }),
    6: Object.freeze({ scale: 1.06, avatar: 1.08, shiftX: '0px', shiftY: '0px', profile: 'thick' }),
    7: Object.freeze({ scale: 1.06, avatar: 1.08, shiftX: '0px', shiftY: '0px', profile: 'thick' }),
    8: Object.freeze({ scale: 1.08, avatar: 1.06, shiftX: '0px', shiftY: '0px', profile: 'normal' }),
    9: Object.freeze({ scale: 1.08, avatar: 1.07, shiftX: '0px', shiftY: '0px', profile: 'thick' }),
    10: Object.freeze({ scale: 1.06, avatar: 1.08, shiftX: '0px', shiftY: '0px', profile: 'thick' }),
    11: Object.freeze({ scale: 1.04, avatar: 1.10, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    12: Object.freeze({ scale: 1.04, avatar: 1.10, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    13: Object.freeze({ scale: 1.02, avatar: 1.11, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    14: Object.freeze({ scale: 1.02, avatar: 1.11, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    15: Object.freeze({ scale: 1.06, avatar: 1.08, shiftX: '0px', shiftY: '0px', profile: 'thick' }),
    16: Object.freeze({ scale: 1.04, avatar: 1.10, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    17: Object.freeze({ scale: 1.01, avatar: 1.13, shiftX: '0px', shiftY: '-1px', profile: 'ultra' }),
    18: Object.freeze({ scale: 0.94, avatar: 1.20, shiftX: '0px', shiftY: '-1px', profile: 'ultraMega' }),
    19: Object.freeze({ scale: 1.03, avatar: 1.13, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    20: Object.freeze({ scale: 0.93, avatar: 1.21, shiftX: '0px', shiftY: '-1px', profile: 'ultraMega' }),
    21: Object.freeze({ scale: 1.04, avatar: 1.10, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    22: Object.freeze({ scale: 0.93, avatar: 1.22, shiftX: '0px', shiftY: '-2px', profile: 'ultraMega' }),
    23: Object.freeze({ scale: 1.02, avatar: 1.13, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    24: Object.freeze({ scale: 1.04, avatar: 1.10, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    25: Object.freeze({ scale: 0.93, avatar: 1.22, shiftX: '0px', shiftY: '-1px', profile: 'ultraMega' }),
    26: Object.freeze({ scale: 0.92, avatar: 1.23, shiftX: '0px', shiftY: '-1px', profile: 'ultraMega' }),
    27: Object.freeze({ scale: 1.00, avatar: 1.14, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    28: Object.freeze({ scale: 1.04, avatar: 1.11, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    29: Object.freeze({ scale: 1.08, avatar: 1.08, shiftX: '0px', shiftY: '0px', profile: 'ultra' }),
    30: Object.freeze({ scale: 0.92, avatar: 1.23, shiftX: '0px', shiftY: '-1px', profile: 'ultraMega' }),
    31: Object.freeze({ scale: 0.89, avatar: 1.26, shiftX: '0px', shiftY: '-2px', profile: 'ultraMega' }),
    32: Object.freeze({ scale: 0.89, avatar: 1.26, shiftX: '0px', shiftY: '-2px', profile: 'ultraMega' })
  });




  const AVATAR_FRAME_VARIANTS = Object.freeze([
    'homeTopbar', 'leaderboard', 'accountModal', 'accountProfileCard', 'marketCard',
    'crashTopbar', 'crashLivePanel', 'crashWinNotice', 'chessTopbar', 'chessGameCard',
    'pistiTopbar', 'pistiScoreCard', 'snakeTopbar', 'spaceTopbar', 'patternTopbar'
  ]);
  function normalizeVariant(value = '') {
    const key = String(value || '').trim();
    return AVATAR_FRAME_VARIANTS.includes(key) ? key : '';
  }
  const DEFAULT_VARIANT_SETTING = Object.freeze({
    avatarScale: 1,
    frameScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    frameOffsetX: 0,
    frameOffsetY: 0,
    innerPadding: 0,
    outerPadding: 0,
    thickness: 'normal',
    overflow: 'visible'
  });
  const settingsState = { config: { version: 1, variants: {}, frames: {}, updatedAt: 0 }, promise: null, loaded: false };
  const mountedHosts = new Set();

  function finiteSetting(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function normalizeVariantSetting(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const thickness = ['thin', 'normal', 'thick', 'ultra'].includes(String(source.thickness || '').toLowerCase())
      ? String(source.thickness).toLowerCase()
      : 'normal';
    return {
      avatarScale: finiteSetting(source.avatarScale, 1, 0.65, 1.5),
      frameScale: finiteSetting(source.frameScale, 1, 0.7, 1.8),
      avatarOffsetX: finiteSetting(source.avatarOffsetX, 0, -30, 30),
      avatarOffsetY: finiteSetting(source.avatarOffsetY, 0, -30, 30),
      frameOffsetX: finiteSetting(source.frameOffsetX, 0, -30, 30),
      frameOffsetY: finiteSetting(source.frameOffsetY, 0, -30, 30),
      innerPadding: finiteSetting(source.innerPadding, 0, 0, 24),
      outerPadding: finiteSetting(source.outerPadding, 0, 0, 24),
      thickness,
      overflow: source.overflow === 'hidden' ? 'hidden' : 'visible'
    };
  }

  function normalizeSettingsConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const variants = {};
    const frames = {};
    AVATAR_FRAME_VARIANTS.forEach((variant) => {
      if (source.variants?.[variant]) variants[variant] = normalizeVariantSetting(source.variants[variant]);
    });
    Object.entries(source.frames || {}).forEach(([key, value]) => {
      if (/^(normal:(?:[1-9]|1[0-8])|market:(?:[1-9]|[12][0-9]|3[0-2])):(?:homeTopbar|leaderboard|accountModal|accountProfileCard|marketCard|crashTopbar|crashLivePanel|crashWinNotice|chessTopbar|chessGameCard|pistiTopbar|pistiScoreCard|snakeTopbar|spaceTopbar|patternTopbar)$/.test(key)) {
        frames[key] = normalizeVariantSetting(value);
      }
    });
    return { version: 1, variants, frames, updatedAt: Number(source.updatedAt || 0) || 0 };
  }

  function getSpecificSettingKey(variant = '', frameIndex = 0, frameUrl = '') {
    const safeVariant = normalizeVariant(variant);
    if (!safeVariant) return '';
    const marketIndex = frameUrl ? getMarketFrameAssetIndex(frameUrl) : 0;
    if (marketIndex > 0) return `market:${marketIndex}:${safeVariant}`;
    const normalIndex = normalizeFrameIndex(frameIndex);
    return normalIndex > 0 ? `normal:${normalIndex}:${safeVariant}` : '';
  }

  function mergeVariantSettings(...items) {
    const merged = { ...DEFAULT_VARIANT_SETTING };
    items.filter(Boolean).forEach((item) => Object.assign(merged, normalizeVariantSetting(item)));
    return normalizeVariantSetting(merged);
  }

  function resolveVariantSetting(variant = '', frameIndex = 0, frameUrl = '', provided = null) {
    const safeVariant = normalizeVariant(variant);
    const specificKey = getSpecificSettingKey(safeVariant, frameIndex, frameUrl);
    return mergeVariantSettings(
      settingsState.config.variants?.[safeVariant],
      specificKey ? settingsState.config.frames?.[specificKey] : null,
      provided
    );
  }

  function setSettings(config = {}) {
    settingsState.config = normalizeSettingsConfig(config);
    settingsState.loaded = true;
    refreshAllMounted();
    return settingsState.config;
  }

  function settingsUrl() {
    try { return window.__PM_API__?.buildUrl ? window.__PM_API__.buildUrl('/api/avatar-frame/settings') : `${String(window.__PLAYMATRIX_API_URL__ || location.origin).replace(/\/+$/, '')}/api/avatar-frame/settings`; }
    catch (_) { return '/api/avatar-frame/settings'; }
  }

  async function loadSettings({ force = false } = {}) {
    if (settingsState.loaded && !force) return settingsState.config;
    if (settingsState.promise) return settingsState.promise;
    settingsState.promise = fetch(settingsUrl(), { credentials: 'include', cache: force ? 'no-store' : 'default' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setSettings(payload?.config || {}))
      .catch(() => settingsState.config)
      .finally(() => { settingsState.promise = null; });
    return settingsState.promise;
  }
  function frameAllowedForVariant(variant = '') {
    return normalizeVariant(variant) !== 'homeTopbar';
  }
  function applyVariantSetting(node, variant = '', variantSetting = null, frameIndex = 0, frameUrl = '') {
    if (!node) return node;
    const safeVariant = normalizeVariant(variant);
    const setting = resolveVariantSetting(safeVariant, frameIndex, frameUrl, variantSetting);
    const size = Math.max(18, Number(node.dataset.pmAvatarSizePx || node.style.width?.replace('px', '') || 45) || 45);
    const baseAvatarScale = finiteSetting(node.style.getPropertyValue('--pm-avatar-base-scale') || node.style.getPropertyValue('--pm-avatar-scale'), 1, 0.2, 3);
    const baseFrameScale = finiteSetting(node.style.getPropertyValue('--pm-frame-base-scale') || node.style.getPropertyValue('--pm-frame-scale'), 1, 0.2, 3);
    const innerFactor = Math.max(0.55, 1 - ((setting.innerPadding * 2) / size));
    const outerFactor = Math.max(0.55, 1 - ((setting.outerPadding * 2) / size));
    const baseFrameX = node.style.getPropertyValue('--pm-frame-base-shift-x') || '0px';
    const baseFrameY = node.style.getPropertyValue('--pm-frame-base-shift-y') || '0px';
    node.dataset.pmAvatarVariant = safeVariant;
    node.dataset.pmFrameThickness = setting.thickness;
    node.style.setProperty('--pm-avatar-scale', String(baseAvatarScale * setting.avatarScale * innerFactor));
    node.style.setProperty('--pm-avatar-shift-x', `${setting.avatarOffsetX}px`);
    node.style.setProperty('--pm-avatar-shift-y', `${setting.avatarOffsetY}px`);
    node.style.setProperty('--pm-frame-scale', String(baseFrameScale * setting.frameScale * outerFactor));
    node.style.setProperty('--pm-frame-shift-x', `calc(${baseFrameX} + ${setting.frameOffsetX}px)`);
    node.style.setProperty('--pm-frame-shift-y', `calc(${baseFrameY} + ${setting.frameOffsetY}px)`);
    node.style.setProperty('--pm-avatar-inner-padding', `${setting.innerPadding}px`);
    node.style.setProperty('--pm-avatar-frame-outer-padding', `${setting.outerPadding}px`);
    node.style.overflow = setting.overflow;
    return node;
  }

  function normalizeAssetPath(value = '') {
    const raw = String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw, window.location.origin);
        if (parsed.protocol !== 'https:') return '';
        return parsed.href;
      } catch (_) { return ''; }
    }
    if (raw.startsWith('/')) return raw.replace(/\/+/g, '/');
    if (/^(assets\/|\.\/assets\/|public\/|\.\/public\/)/i.test(raw)) return `/${raw.replace(/^\.?\//, '')}`.replace(/\/+/g, '/');
    return '';
  }

  function getAvatarRegistry() {
    const registry = window.PMAvatarRegistry && typeof window.PMAvatarRegistry === 'object' ? window.PMAvatarRegistry : {};
    const fallback = normalizeAssetPath(registry.fallback || FALLBACK_AVATAR) || FALLBACK_AVATAR;
    const avatarSet = new Set();
    if (Array.isArray(registry.avatars)) {
      registry.avatars.forEach((entry) => {
        const normalized = normalizeAssetPath(entry);
        if (normalized) avatarSet.add(normalized);
      });
    }
    avatarSet.add(fallback);
    return { fallback, avatarSet };
  }

  function isRegisteredAvatarUrl(value = '') {
    const normalized = normalizeAssetPath(value);
    if (!normalized) return false;
    const { avatarSet } = getAvatarRegistry();
    return avatarSet.has(normalized);
  }

  function safeAvatarUrl(value = '') {
    const normalized = normalizeAssetPath(value);
    const { fallback, avatarSet } = getAvatarRegistry();
    if (!normalized) return fallback;
    if (avatarSet.has(normalized)) return normalized;
    if (/^\/public\/assets\/market\/(generated|avatars)\//i.test(normalized)) return normalized;
    return fallback;
  }

  function safeFrameUrl(value = '') {
    const normalized = normalizeAssetPath(value);
    if (!normalized) return '';
    if (/^https:\/\//i.test(normalized)) return '';
    if (!/\/public\/assets\/(market\/frames|frames)\//i.test(normalized)) return '';
    return normalized;
  }

  function escapeAttr(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function normalizeLevel(level = 0) {
    const value = Math.floor(Number(level) || 0);
    return Math.max(0, Math.min(100, value));
  }

  function normalizeFrameIndex(frameIndex = 0) {
    const value = Math.floor(Number(frameIndex) || 0);
    return Math.max(0, Math.min(FRAME_ASSET_COUNT, value));
  }

  function getFrameRange(level = 0) {
    const lvl = normalizeLevel(level);
    if (lvl <= 0) return null;
    return FRAME_LEVEL_TO_ASSET.find((item) => lvl >= item.min && lvl <= item.max) || FRAME_LEVEL_TO_ASSET[FRAME_LEVEL_TO_ASSET.length - 1];
  }

  function getFrameRangeByAssetIndex(assetIndex = 0) {
    const idx = normalizeFrameIndex(assetIndex);
    if (idx <= 0) return null;
    return FRAME_LEVEL_TO_ASSET.find((item) => item.asset === idx) || null;
  }

  function getFrameAssetIndex(level = 0) {
    const matchedRange = getFrameRange(level);
    return matchedRange ? matchedRange.asset : 0;
  }

  function getFrameUnlockLevel(value = 0) {
    const range = getFrameRange(value);
    return range ? range.min : 0;
  }

  function getFrameLabel(level = 0) {
    const range = getFrameRange(level);
    if (!range) return 'Çerçevesiz';
    return range.min === range.max ? `Seviye ${range.min}` : `Seviye ${range.min}-${range.max}`;
  }

  function resolveFrameIndex(level = 0, exactFrameIndex = null) {
    const numericExact = Math.floor(Number(exactFrameIndex) || 0);
    if (numericExact > 0 && numericExact <= FRAME_ASSET_COUNT) return normalizeFrameIndex(numericExact);
    if (numericExact > FRAME_ASSET_COUNT) return getFrameAssetIndex(numericExact);
    return getFrameAssetIndex(level);
  }

  function isRegisteredFrameAssetIndex(frameIndex = 0) {
    const normalized = normalizeFrameIndex(frameIndex);
    return normalized >= 1 && normalized <= FRAME_ASSET_COUNT;
  }

  function getMarketFrameAssetIndex(frameUrl = '') {
    const normalized = normalizeAssetPath(frameUrl);
    const match = normalized.match(/\/market-(\d{1,3})\.(?:png|webp|jpe?g|svg)(?:[?#].*)?$/i)
      || normalized.match(/(?:market[-_]?frame|market|frame)[-_]?(\d{1,3})/i);
    return match ? Math.max(0, Math.trunc(Number(match[1]) || 0)) : 0;
  }

  function getMarketFrameProfile(frameUrl = '') {
    const index = getMarketFrameAssetIndex(frameUrl);
    return MARKET_FRAME_VISUAL_PROFILES[index] || DEFAULT_MARKET_FRAME_PROFILE;
  }

  function getFrameProfile(frameIndex = 0, frameUrl = '') {
    if (frameUrl) return getMarketFrameProfile(frameUrl);
    const normalized = normalizeFrameIndex(frameIndex);
    if (normalized <= 0) return { scale: 1, avatar: 1, shiftX: '0px', shiftY: '0px', profile: 'none' };
    return FRAME_VISUAL_PROFILES[normalized] || DEFAULT_FRAME_PROFILE;
  }

  function isFrameUnlocked(frameLevel = 0, accountLevel = 1) {
    const selected = normalizeLevel(frameLevel);
    if (selected <= 0) return true;
    const unlockLevel = getFrameUnlockLevel(selected);
    return unlockLevel <= normalizeLevel(accountLevel);
  }

  function getSafeSelectedFrame(frameLevel = 0, accountLevel = 1) {
    const selected = normalizeLevel(frameLevel);
    if (selected <= 0) return 0;
    return isFrameUnlocked(selected, accountLevel) ? selected : 0;
  }

  function createImage({ src, className = '', alt = '', hidden = false, fallback = '', ariaHidden = false } = {}) {
    const img = document.createElement('img');
    img.src = src || FALLBACK_AVATAR;
    img.alt = alt || '';
    if (className) img.className = className;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    if (fallback) img.dataset.fallback = fallback;
    if (ariaHidden) img.setAttribute('aria-hidden', 'true');
    if (hidden) img.hidden = true;
    return img;
  }

  function buildHTML({ avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, extraClass = '', imageClass = 'pm-avatar-img', wrapperClass = 'pm-avatar', alt = 'Oyuncu', sizeTag = '', variant = '', variantSetting = null } = {}) {
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const safeAvatar = safeAvatarUrl(avatarUrl);
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const frameSrc = customFrameUrl || (frameIndex > 0 ? `/public/assets/frames/frame-${frameIndex}.png` : '');
    const profile = customFrameUrl ? getMarketFrameProfile(customFrameUrl) : getFrameProfile(frameIndex);
    const classes = [wrapperClass, hasFrame ? 'has-frame' : '', customFrameUrl ? 'has-market-frame' : '', extraClass].filter(Boolean).join(' ');
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    const sizeAttr = sizeTag ? ` data-pm-avatar-size="${escapeAttr(sizeTag)}"` : '';
    const setting = resolveVariantSetting(normalizedVariant, frameIndex, customFrameUrl, variantSetting);
    const innerFactor = Math.max(0.55, 1 - ((setting.innerPadding * 2) / normalizedSize));
    const outerFactor = Math.max(0.55, 1 - ((setting.outerPadding * 2) / normalizedSize));
    const avatarScale = (Number(profile.avatar || 1) * setting.avatarScale * innerFactor);
    const frameScale = (Number(profile.scale || 1) * setting.frameScale * outerFactor);
    const styleAttr = ` style="--pm-avatar-base-scale:${escapeAttr(String(profile.avatar || 1))};--pm-avatar-fit:${escapeAttr(String(avatarScale))};--pm-avatar-scale:${escapeAttr(String(avatarScale))};--pm-avatar-shift-x:${escapeAttr(String(setting.avatarOffsetX))}px;--pm-avatar-shift-y:${escapeAttr(String(setting.avatarOffsetY))}px;--pm-frame-base-scale:${escapeAttr(String(profile.scale || 1))};--pm-frame-base-shift-x:${escapeAttr(profile.shiftX || '0px')};--pm-frame-base-shift-y:${escapeAttr(profile.shiftY || '0px')};--pm-frame-scale:${escapeAttr(String(frameScale))};--pm-frame-shift-x:calc(${escapeAttr(profile.shiftX || '0px')} + ${escapeAttr(String(setting.frameOffsetX))}px);--pm-frame-shift-y:calc(${escapeAttr(profile.shiftY || '0px')} + ${escapeAttr(String(setting.frameOffsetY))}px);--pm-avatar-inner-padding:${escapeAttr(String(setting.innerPadding))}px;--pm-avatar-frame-outer-padding:${escapeAttr(String(setting.outerPadding))}px;overflow:${escapeAttr(setting.overflow)};"`;
    const frameHtml = hasFrame
      ? `<img src="${escapeAttr(frameSrc)}" class="pm-frame-image pm-avatar-shell__frame frame-${frameIndex || 'market'}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-market-frame="${customFrameUrl ? 'true' : 'false'}" data-fallback="${escapeAttr(frameSrc)}">`
      : '';
    return `<div class="${escapeAttr(classes)}" data-pm-avatar="true" data-avatar-registered="${isRegisteredAvatarUrl(avatarUrl) ? 'true' : 'false'}" data-frame-registered="${customFrameUrl || frameIndex === 0 || isRegisteredFrameAssetIndex(frameIndex) ? 'true' : 'false'}" data-market-frame="${customFrameUrl ? 'true' : 'false'}" data-market-frame-profile="${escapeAttr(customFrameUrl ? (profile.profile || 'market') : '')}" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-frame-asset-index="${frameIndex}" data-pm-avatar-size-px="${normalizedSize}" data-pm-avatar-variant="${escapeAttr(normalizedVariant)}" data-pm-frame-thickness="${escapeAttr(setting.thickness)}"${sizeAttr}${styleAttr}><img src="${escapeAttr(safeAvatar)}" alt="${escapeAttr(alt || 'Oyuncu')}" class="${escapeAttr(imageClass)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-fallback="${escapeAttr(FALLBACK_AVATAR)}">${frameHtml}</div>`;
  }

  function applyNodeProfile(node, { avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, variant = '', variantSetting = null } = {}) {
    if (!node) return node;
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const profile = customFrameUrl ? getMarketFrameProfile(customFrameUrl) : getFrameProfile(frameIndex);
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    node.dataset.avatarRegistered = isRegisteredAvatarUrl(avatarUrl) ? 'true' : 'false';
    node.dataset.frameRegistered = customFrameUrl || frameIndex === 0 || isRegisteredFrameAssetIndex(frameIndex) ? 'true' : 'false';
    node.dataset.marketFrame = customFrameUrl ? 'true' : 'false';
    node.dataset.frameIndex = String(frameIndex);
    node.dataset.frameLevel = String(normalizedLevel);
    node.dataset.frameAssetIndex = String(frameIndex);
    node.dataset.pmAvatarSizePx = String(normalizedSize);
    node.classList.toggle('has-frame', hasFrame);
    node.classList.toggle('has-market-frame', !!customFrameUrl);
    node.style.width = `${normalizedSize}px`;
    node.style.height = `${normalizedSize}px`;
    node.style.setProperty('--pm-avatar-base-scale', String(profile.avatar || 1));
    node.style.setProperty('--pm-avatar-fit', String(profile.avatar || 1));
    node.style.setProperty('--pm-avatar-scale', String(profile.avatar || 1));
    node.style.setProperty('--pm-frame-base-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-base-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-base-shift-y', profile.shiftY || '0px');
    node.style.setProperty('--pm-frame-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
    node.style.setProperty('--pm-frame-variant-scale', customFrameUrl ? String(profile.scale || 1) : '1');
    node.style.setProperty('--pm-frame-variant-shift-x', customFrameUrl ? (profile.shiftX || '0px') : '0px');
    node.style.setProperty('--pm-frame-variant-shift-y', customFrameUrl ? (profile.shiftY || '0px') : '0px');
    node.dataset.marketFrameProfile = customFrameUrl ? (profile.profile || 'market') : '';
    const frame = node.querySelector('.pm-avatar-shell__frame');
    if (frame) {
      const frameSrc = customFrameUrl || (frameIndex > 0 ? `/public/assets/frames/frame-${frameIndex}.png` : '');
      frame.dataset.frameIndex = String(frameIndex);
      frame.dataset.frameLevel = String(normalizedLevel);
      frame.dataset.marketFrame = customFrameUrl ? 'true' : 'false';
      frame.dataset.fallback = frameSrc;
      frame.src = frameSrc;
      frame.hidden = !frameSrc;
      frame.style.setProperty('--pm-frame-base-scale', String(profile.scale));
      frame.style.setProperty('--pm-frame-base-shift-x', profile.shiftX || '0px');
      frame.style.setProperty('--pm-frame-base-shift-y', profile.shiftY || '0px');
      frame.style.setProperty('--pm-frame-scale', String(profile.scale));
      frame.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
      frame.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
    }
    applyVariantSetting(node, normalizedVariant, variantSetting, frameIndex, customFrameUrl);
    return node;
  }

  function createNode(options = {}) {
    const { avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, extraClass = '', imageClass = 'pm-avatar-img', wrapperClass = 'pm-avatar', alt = 'Oyuncu', sizeTag = '', variant = '', variantSetting = null } = options || {};
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const node = document.createElement('div');
    node.className = [wrapperClass, hasFrame ? 'has-frame' : '', customFrameUrl ? 'has-market-frame' : '', extraClass].filter(Boolean).join(' ');
    node.dataset.pmAvatar = 'true';
    if (sizeTag) node.dataset.pmAvatarSize = String(sizeTag);
    if (normalizedVariant) node.dataset.pmAvatarVariant = normalizedVariant;
    const avatar = createImage({ src: safeAvatarUrl(avatarUrl), className: imageClass, alt: alt || 'Oyuncu', fallback: FALLBACK_AVATAR });
    node.appendChild(avatar);
    if (hasFrame) {
      const frameSrc = customFrameUrl || `/public/assets/frames/frame-${frameIndex}.png`;
      const frame = createImage({ src: frameSrc, className: `pm-frame-image pm-avatar-shell__frame frame-${frameIndex || 'market'}`, alt: '', fallback: frameSrc, ariaHidden: true });
      frame.dataset.marketFrame = customFrameUrl ? 'true' : 'false';
      node.appendChild(frame);
    }
    applyNodeProfile(node, { ...options, variantSetting, level: normalizedLevel, exactFrameIndex: frameIndex, frameUrl: customFrameUrl, sizePx, variant: normalizedVariant });
    return node;
  }

  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = img.dataset.fallback || '';
    if (!fallback) return;
    if (img.dataset.fallbackApplied === 'true') {
      if (img.classList.contains('pm-avatar-shell__frame')) img.hidden = true;
      return;
    }
    img.dataset.fallbackApplied = 'true';
    img.src = fallback;
  }, true);

  function mount(target, options = {}) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) return null;
    mountedHosts.add(host);
    host.__pmAvatarMountOptions = { ...(options || {}) };
    const variant = normalizeVariant(options.variant || '');
    const allowFrame = frameAllowedForVariant(variant);
    const normalizedOptions = {
      ...options,
      variant,
      level: allowFrame ? normalizeLevel(options.level || 0) : 0,
      exactFrameIndex: allowFrame ? (options.exactFrameIndex ?? null) : 0,
      frameUrl: allowFrame ? safeFrameUrl(options.frameUrl || '') : ''
    };
    const key = JSON.stringify({
      avatarUrl: safeAvatarUrl(normalizedOptions.avatarUrl || ''),
      level: normalizedOptions.level,
      exactFrameIndex: normalizedOptions.exactFrameIndex,
      frameUrl: normalizedOptions.frameUrl,
      sizePx: Math.max(18, Number(normalizedOptions.sizePx) || 45),
      extraClass: normalizedOptions.extraClass || '',
      imageClass: normalizedOptions.imageClass || 'pm-avatar-img',
      wrapperClass: normalizedOptions.wrapperClass || 'pm-avatar',
      sizeTag: normalizedOptions.sizeTag || '',
      variant,
      variantSetting: normalizedOptions.variantSetting || null
    });
    if (!options.force && host.dataset.pmAvatarMountKey === key && host.firstElementChild) return host.firstElementChild;
    const node = createNode(normalizedOptions);
    host.replaceChildren(node);
    host.dataset.pmAvatarMountKey = key;
    return node;
  }

  function refreshAllMounted() {
    mountedHosts.forEach((host) => {
      if (!host?.isConnected) { mountedHosts.delete(host); return; }
      const options = host.__pmAvatarMountOptions || {};
      mount(host, { ...options, force: true });
    });
  }

  function getFrameRanges() {
    return FRAME_LEVEL_TO_ASSET.map((item) => Object.freeze({ ...item }));
  }

  window.PMAvatar = Object.freeze({
    FALLBACK_AVATAR,
    FRAME_ASSET_COUNT,
    FRAME_LEVEL_TO_ASSET,
    FRAME_VISUAL_PROFILES,
    MARKET_FRAME_VISUAL_PROFILES,
    AVATAR_FRAME_VARIANTS,
    DEFAULT_VARIANT_SETTING,
    normalizeVariantSetting,
    resolveVariantSetting,
    getSettings: () => settingsState.config,
    setSettings,
    loadSettings,
    refreshAllMounted,
    normalizeLevel,
    normalizeFrameIndex,
    normalizeVariant,
    frameAllowedForVariant,
    getFrameRange,
    getFrameRanges,
    getFrameRangeByAssetIndex,
    getFrameUnlockLevel,
    getFrameLabel,
    getFrameAssetIndex,
    resolveFrameIndex,
    getFrameProfile,
    getMarketFrameAssetIndex,
    getMarketFrameProfile,
    isFrameUnlocked,
    getSafeSelectedFrame,
    isRegisteredAvatarUrl,
    safeAvatarUrl,
    safeFrameUrl,
    isRegisteredFrameAssetIndex,
    buildHTML,
    applyNodeProfile,
    createNode,
    renderAvatarNode: createNode,
    mount
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => loadSettings().catch(() => null), { once: true });
  else loadSettings().catch(() => null);
})();
