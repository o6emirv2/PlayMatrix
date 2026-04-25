'use strict';

(() => {
  const FALLBACK_AVATAR = '/assets/avatars/system/fallback.svg';
  const FRAME_ASSET_COUNT = 18;
  const DEFAULT_FRAME_PROFILE = Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' });
  const FRAME_LEVEL_TO_ASSET = Object.freeze([
    { min: 1, max: 15, asset: 1 },
    { min: 16, max: 30, asset: 2 },
    { min: 31, max: 40, asset: 3 },
    { min: 41, max: 50, asset: 4 },
    { min: 51, max: 60, asset: 5 },
    { min: 61, max: 80, asset: 6 },
    { min: 81, max: 85, asset: 7 },
    { min: 86, max: 90, asset: 8 },
    { min: 91, max: 91, asset: 9 },
    { min: 92, max: 92, asset: 10 },
    { min: 93, max: 93, asset: 11 },
    { min: 94, max: 94, asset: 12 },
    { min: 95, max: 95, asset: 13 },
    { min: 96, max: 96, asset: 14 },
    { min: 97, max: 97, asset: 15 },
    { min: 98, max: 98, asset: 16 },
    { min: 99, max: 99, asset: 17 },
    { min: 100, max: 100, asset: 18 }
  ]);
  const FRAME_VISUAL_PROFILES = Object.freeze({
    1: Object.freeze({ scale: 1.34, avatar: 0.82, shiftX: '0px', shiftY: '0px' }),
    2: Object.freeze({ scale: 1.34, avatar: 0.82, shiftX: '0px', shiftY: '0px' }),
    3: Object.freeze({ scale: 1.35, avatar: 0.82, shiftX: '0px', shiftY: '0px' }),
    4: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    5: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    6: Object.freeze({ scale: 1.24, avatar: 0.86, shiftX: '0px', shiftY: '0px' }),
    7: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    8: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    9: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    10: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    11: Object.freeze({ scale: 1.24, avatar: 0.86, shiftX: '0px', shiftY: '0px' }),
    12: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    13: Object.freeze({ scale: 1.24, avatar: 0.86, shiftX: '0px', shiftY: '0px' }),
    14: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    15: Object.freeze({ scale: 1.24, avatar: 0.86, shiftX: '0px', shiftY: '0px' }),
    16: Object.freeze({ scale: 1.28, avatar: 0.84, shiftX: '0px', shiftY: '0px' }),
    17: Object.freeze({ scale: 1.24, avatar: 0.86, shiftX: '0px', shiftY: '0px' }),
    18: Object.freeze({ scale: 1.46, avatar: 0.78, shiftX: '0px', shiftY: '4px' })
  });

  function safeAvatarUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return FALLBACK_AVATAR;
    if (/^(https?:|data:|\/)/i.test(raw)) return raw;
    if (/^(assets\/|\.\/assets\/)/i.test(raw)) return `/${raw.replace(/^\.?\//, '')}`;
    return FALLBACK_AVATAR;
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

  function getFrameAssetIndex(level = 0) {
    const lvl = normalizeLevel(level);
    if (lvl <= 0) return 0;
    const matchedRange = FRAME_LEVEL_TO_ASSET.find((item) => lvl >= item.min && lvl <= item.max);
    return matchedRange ? matchedRange.asset : FRAME_ASSET_COUNT;
  }

  function resolveFrameIndex(level = 0, exactFrameIndex = null) {
    const numericExact = Math.floor(Number(exactFrameIndex) || 0);
    if (numericExact > 0) {
      if (numericExact <= FRAME_ASSET_COUNT) return normalizeFrameIndex(numericExact);
      return getFrameAssetIndex(numericExact);
    }
    return getFrameAssetIndex(level);
  }

  function getFrameProfile(frameIndex = 0) {
    const normalized = normalizeFrameIndex(frameIndex);
    if (normalized <= 0) return { scale: 1, avatar: 1, shiftX: '0px', shiftY: '0px' };
    return FRAME_VISUAL_PROFILES[normalized] || DEFAULT_FRAME_PROFILE;
  }

  function isFrameUnlocked(frameLevel = 0, accountLevel = 1) {
    const selected = normalizeLevel(frameLevel);
    if (Number(frameLevel) <= 0) return true;
    return selected <= normalizeLevel(accountLevel);
  }

  function getSafeSelectedFrame(frameLevel = 0, accountLevel = 1) {
    const selected = normalizeLevel(frameLevel);
    if (Number(frameLevel) <= 0) return 0;
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

  function buildHTML({ avatarUrl = '', level = 0, exactFrameIndex = null, sizePx = 45, extraClass = '', imageClass = 'pm-avatar-img', wrapperClass = 'pm-avatar', alt = 'Oyuncu', sizeTag = '' } = {}) {
    const normalizedLevel = normalizeLevel(level);
    const frameIndex = resolveFrameIndex(normalizedLevel, exactFrameIndex);
    const safeAvatar = safeAvatarUrl(avatarUrl);
    const classes = [wrapperClass, frameIndex > 0 ? 'has-frame' : '', extraClass].filter(Boolean).join(' ');
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    const sizeAttr = sizeTag ? ` data-pm-avatar-size="${escapeAttr(sizeTag)}"` : '';
    const frameHtml = frameIndex > 0
      ? `<img src="/Cerceve/frame-${frameIndex}.png" class="pm-frame-image pm-avatar-shell__frame frame-${frameIndex}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-fallback="/Çerçeve/frame-${frameIndex}.png">`
      : '';
    return `<div class="${escapeAttr(classes)}" data-pm-avatar="true" data-frame-index="${frameIndex}" data-frame-level="${normalizedLevel}" data-frame-asset-index="${frameIndex}" data-pm-avatar-size-px="${normalizedSize}"${sizeAttr}><img src="${escapeAttr(safeAvatar)}" alt="${escapeAttr(alt || 'Oyuncu')}" class="${escapeAttr(imageClass)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-fallback="${escapeAttr(FALLBACK_AVATAR)}">${frameHtml}</div>`;
  }

  function applyNodeProfile(node, { level = 0, exactFrameIndex = null, sizePx = 45 } = {}) {
    if (!node) return node;
    const normalizedLevel = normalizeLevel(level);
    const frameIndex = resolveFrameIndex(normalizedLevel, exactFrameIndex);
    const profile = getFrameProfile(frameIndex);
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    node.dataset.frameIndex = String(frameIndex);
    node.dataset.frameLevel = String(normalizedLevel);
    node.dataset.frameAssetIndex = String(frameIndex);
    node.dataset.pmAvatarSizePx = String(normalizedSize);
    node.classList.toggle('has-frame', frameIndex > 0);
    node.style.width = `${normalizedSize}px`;
    node.style.height = `${normalizedSize}px`;
    node.style.setProperty('--pm-avatar-fit', String(profile.avatar));
    node.style.setProperty('--pm-frame-scale', String(profile.scale));
    node.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
    node.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
    const frame = node.querySelector('.pm-avatar-shell__frame');
    if (frame) {
      frame.dataset.frameIndex = String(frameIndex);
      frame.dataset.frameLevel = String(normalizedLevel);
      frame.style.setProperty('--pm-frame-scale', String(profile.scale));
      frame.style.setProperty('--pm-frame-shift-x', profile.shiftX || '0px');
      frame.style.setProperty('--pm-frame-shift-y', profile.shiftY || '0px');
    }
    return node;
  }

  function createNode(options = {}) {
    const {
      avatarUrl = '',
      level = 0,
      exactFrameIndex = null,
      sizePx = 45,
      extraClass = '',
      imageClass = 'pm-avatar-img',
      wrapperClass = 'pm-avatar',
      alt = 'Oyuncu',
      sizeTag = ''
    } = options || {};
    const normalizedLevel = normalizeLevel(level);
    const frameIndex = resolveFrameIndex(normalizedLevel, exactFrameIndex);
    const node = document.createElement('div');
    node.className = [wrapperClass, frameIndex > 0 ? 'has-frame' : '', extraClass].filter(Boolean).join(' ');
    node.dataset.pmAvatar = 'true';
    if (sizeTag) node.dataset.pmAvatarSize = String(sizeTag);
    const avatar = createImage({
      src: safeAvatarUrl(avatarUrl),
      className: imageClass,
      alt: alt || 'Oyuncu',
      fallback: FALLBACK_AVATAR
    });
    node.appendChild(avatar);
    if (frameIndex > 0) {
      const frame = createImage({
        src: `/Cerceve/frame-${frameIndex}.png`,
        className: `pm-frame-image pm-avatar-shell__frame frame-${frameIndex}`,
        alt: '',
        fallback: `/Çerçeve/frame-${frameIndex}.png`,
        ariaHidden: true
      });
      node.appendChild(frame);
    }
    applyNodeProfile(node, { ...options, level: normalizedLevel, sizePx });
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
    const node = createNode(options);
    host.replaceChildren(node);
    return node;
  }

  window.PMAvatar = Object.freeze({
    FALLBACK_AVATAR,
    FRAME_ASSET_COUNT,
    FRAME_LEVEL_TO_ASSET,
    FRAME_VISUAL_PROFILES,
    normalizeLevel,
    normalizeFrameIndex,
    getFrameAssetIndex,
    resolveFrameIndex,
    getFrameProfile,
    isFrameUnlocked,
    getSafeSelectedFrame,
    buildHTML,
    applyNodeProfile,
    createNode,
    mount
  });
})();
