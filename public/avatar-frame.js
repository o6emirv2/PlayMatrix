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



  const AVATAR_FRAME_VARIANTS = Object.freeze([
    'homeTopbar', 'leaderboard', 'accountModal', 'accountProfileCard', 'marketCard',
    'crashTopbar', 'crashLivePanel', 'crashWinNotice', 'chessTopbar', 'chessGameCard',
    'pistiTopbar', 'pistiScoreCard', 'snakeTopbar', 'spaceTopbar', 'patternTopbar'
  ]);
  const DEFAULT_VARIANT_SETTING = Object.freeze({ avatarScale: 1, frameScale: 1, avatarOffsetX: 0, avatarOffsetY: 0, frameOffsetX: 0, frameOffsetY: 0, innerPadding: 0, outerPadding: 0, overflow: 'visible', borderRadiusMode: 'circle', zIndex: 1 });
  let avatarFrameRuntimeSettings = { variants: {} };
  let avatarFrameSettingsPromise = null;
  const clampNumber = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  function normalizeVariant(value = '') {
    const key = String(value || '').trim();
    return AVATAR_FRAME_VARIANTS.includes(key) ? key : '';
  }
  function frameAllowedForVariant(variant = '') {
    return normalizeVariant(variant) !== 'homeTopbar';
  }
  function normalizeVariantSetting(input = {}) {
    return {
      avatarScale: clampNumber(input.avatarScale, DEFAULT_VARIANT_SETTING.avatarScale, 0.5, 1.3),
      frameScale: clampNumber(input.frameScale, DEFAULT_VARIANT_SETTING.frameScale, 0.7, 1.6),
      avatarOffsetX: clampNumber(input.avatarOffsetX, DEFAULT_VARIANT_SETTING.avatarOffsetX, -40, 40),
      avatarOffsetY: clampNumber(input.avatarOffsetY, DEFAULT_VARIANT_SETTING.avatarOffsetY, -40, 40),
      frameOffsetX: clampNumber(input.frameOffsetX, DEFAULT_VARIANT_SETTING.frameOffsetX, -40, 40),
      frameOffsetY: clampNumber(input.frameOffsetY, DEFAULT_VARIANT_SETTING.frameOffsetY, -40, 40),
      innerPadding: clampNumber(input.innerPadding, DEFAULT_VARIANT_SETTING.innerPadding, 0, 40),
      outerPadding: clampNumber(input.outerPadding, DEFAULT_VARIANT_SETTING.outerPadding, 0, 40),
      overflow: input.overflow === 'hidden' ? 'hidden' : 'visible',
      borderRadiusMode: ['circle', 'rounded', 'square'].includes(String(input.borderRadiusMode || '')) ? String(input.borderRadiusMode) : 'circle',
      zIndex: Math.trunc(clampNumber(input.zIndex, DEFAULT_VARIANT_SETTING.zIndex, 0, 20))
    };
  }
  function getVariantSetting(variant = '', overrideSetting = null) {
    if (overrideSetting && typeof overrideSetting === 'object') return normalizeVariantSetting(overrideSetting);
    const key = normalizeVariant(variant);
    const variants = avatarFrameRuntimeSettings?.variants || {};
    return normalizeVariantSetting((key && variants[key]) || DEFAULT_VARIANT_SETTING);
  }
  function applyVariantSetting(node, variant = '', overrideSetting = null) {
    if (!node) return node;
    const setting = getVariantSetting(variant, overrideSetting);
    const avatarShift = `translate3d(${setting.avatarOffsetX}px, ${setting.avatarOffsetY}px, 0) scale(${setting.avatarScale})`;
    node.dataset.pmAvatarVariant = normalizeVariant(variant) || '';
    node.style.setProperty('--pm-avatar-scale', String(setting.avatarScale));
    node.style.setProperty('--pm-avatar-shift-x', `${setting.avatarOffsetX}px`);
    node.style.setProperty('--pm-avatar-shift-y', `${setting.avatarOffsetY}px`);
    node.style.setProperty('--pm-frame-variant-scale', String(setting.frameScale));
    node.style.setProperty('--pm-frame-variant-shift-x', `${setting.frameOffsetX}px`);
    node.style.setProperty('--pm-frame-variant-shift-y', `${setting.frameOffsetY}px`);
    node.style.padding = setting.innerPadding ? `${setting.innerPadding}px` : '';
    node.style.margin = setting.outerPadding ? `${setting.outerPadding}px` : '';
    node.style.overflow = setting.overflow;
    node.style.zIndex = String(setting.zIndex || 1);
    const avatar = node.querySelector('img:not(.pm-frame-image):not(.pm-avatar-shell__frame):not(.pm-game-frame):not(.t-frame)');
    if (avatar) avatar.style.transform = avatarShift;
    const frame = node.querySelector('.pm-avatar-shell__frame');
    if (frame) {
      frame.style.setProperty('--pm-frame-scale', `calc(var(--pm-frame-base-scale, 1) * ${setting.frameScale})`);
      frame.style.setProperty('--pm-frame-shift-x', `calc(var(--pm-frame-base-shift-x, 0px) + ${setting.frameOffsetX}px)`);
      frame.style.setProperty('--pm-frame-shift-y', `calc(var(--pm-frame-base-shift-y, 0px) + ${setting.frameOffsetY}px)`);
    }
    return node;
  }
  async function loadPublicSettings({ force = false } = {}) {
    if (avatarFrameSettingsPromise && !force) return avatarFrameSettingsPromise;
    avatarFrameSettingsPromise = fetch('/api/avatar-frame/settings', { cache: 'no-store', credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((payload) => {
        const settings = payload?.settings || payload || {};
        avatarFrameRuntimeSettings = { variants: settings.variants || {}, version: settings.version || 'playmatrix-avatar-frame-v2', updatedAt: settings.updatedAt || 0 };
        return avatarFrameRuntimeSettings;
      })
      .catch(() => avatarFrameRuntimeSettings);
    return avatarFrameSettingsPromise;
  }
  function setRuntimeSettings(settings = {}) {
    avatarFrameRuntimeSettings = { variants: settings.variants || {}, version: settings.version || 'playmatrix-avatar-frame-v2', updatedAt: settings.updatedAt || Date.now() };
    return avatarFrameRuntimeSettings;
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

  function getFrameProfile(frameIndex = 0) {
    const normalized = normalizeFrameIndex(frameIndex);
    if (normalized <= 0) return { scale: 1, avatar: 1, shiftX: '0px', shiftY: '0px' };
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

  function buildHTML({ avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, extraClass = '', imageClass = 'pm-avatar-img', wrapperClass = 'pm-avatar', alt = 'Oyuncu', sizeTag = '', variant = '' } = {}) {
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const safeAvatar = safeAvatarUrl(avatarUrl);
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const frameSrc = customFrameUrl || (frameIndex > 0 ? `/public/assets/frames/frame-${frameIndex}.png` : '');
    const classes = [wrapperClass, hasFrame ? 'has-frame' : '', customFrameUrl ? 'has-market-frame' : '', extraClass].filter(Boolean).join(' ');
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    const sizeAttr = sizeTag ? ` data-pm-avatar-size="${escapeAttr(sizeTag)}"` : '';
    const frameHtml = hasFrame
      ? `<img src="${escapeAttr(frameSrc)}" class="pm-frame-image pm-avatar-shell__frame frame-${frameIndex || 'market'}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-market-frame="${customFrameUrl ? 'true' : 'false'}" data-fallback="${escapeAttr(frameSrc)}">`
      : '';
    return `<div class="${escapeAttr(classes)}" data-pm-avatar="true" data-avatar-registered="${isRegisteredAvatarUrl(avatarUrl) ? 'true' : 'false'}" data-frame-registered="${customFrameUrl || frameIndex === 0 || isRegisteredFrameAssetIndex(frameIndex) ? 'true' : 'false'}" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-frame-asset-index="${frameIndex}" data-pm-avatar-size-px="${normalizedSize}" data-pm-avatar-variant="${escapeAttr(normalizedVariant)}"${sizeAttr}><img src="${escapeAttr(safeAvatar)}" alt="${escapeAttr(alt || 'Oyuncu')}" class="${escapeAttr(imageClass)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-fallback="${escapeAttr(FALLBACK_AVATAR)}">${frameHtml}</div>`;
  }

  function applyNodeProfile(node, { avatarUrl = '', level = 0, exactFrameIndex = null, frameUrl = '', sizePx = 45, variant = '', variantSetting = null } = {}) {
    if (!node) return node;
    const normalizedVariant = normalizeVariant(variant);
    const allowFrame = frameAllowedForVariant(normalizedVariant);
    const normalizedLevel = allowFrame ? normalizeLevel(level) : 0;
    const frameIndex = allowFrame ? resolveFrameIndex(normalizedLevel, exactFrameIndex) : 0;
    const customFrameUrl = allowFrame ? safeFrameUrl(frameUrl) : '';
    const hasFrame = allowFrame && (frameIndex > 0 || !!customFrameUrl);
    const profile = getFrameProfile(frameIndex || 18);
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
    node.style.setProperty('--pm-avatar-fit', '1');
    node.style.setProperty('--pm-avatar-scale', String(profile.avatar || 1));
    node.style.setProperty('--pm-frame-base-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-base-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-base-shift-y', profile.shiftY || '0px');
    node.style.setProperty('--pm-frame-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
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
    applyVariantSetting(node, normalizedVariant, variantSetting);
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
    if (host.dataset.pmAvatarMountKey === key && host.firstElementChild) return host.firstElementChild;
    const node = createNode(normalizedOptions);
    host.replaceChildren(node);
    host.dataset.pmAvatarMountKey = key;
    return node;
  }

  function getFrameRanges() {
    return FRAME_LEVEL_TO_ASSET.map((item) => Object.freeze({ ...item }));
  }

  window.PMAvatar = Object.freeze({
    FALLBACK_AVATAR,
    FRAME_ASSET_COUNT,
    FRAME_LEVEL_TO_ASSET,
    FRAME_VISUAL_PROFILES,
    AVATAR_FRAME_VARIANTS,
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
    getVariantSetting,
    loadPublicSettings,
    setRuntimeSettings,
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
})();
