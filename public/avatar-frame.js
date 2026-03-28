'use strict';

(() => {
  const FALLBACK_AVATAR = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_xNqOtfFq83d6nI4V3B_b-05aBw_Nl7U5ng&s';
  const FRAME_VISUAL_PROFILES = Object.freeze({
    1:  { scale: 1.24, avatar: 0.88 },
    2:  { scale: 1.24, avatar: 0.88 },
    3:  { scale: 1.26, avatar: 0.87 },
    4:  { scale: 1.27, avatar: 0.87 },
    5:  { scale: 1.28, avatar: 0.86 },
    6:  { scale: 1.29, avatar: 0.86 },
    7:  { scale: 1.30, avatar: 0.86 },
    8:  { scale: 1.31, avatar: 0.85 },
    9:  { scale: 1.31, avatar: 0.86 },
    10: { scale: 1.32, avatar: 0.85 },
    11: { scale: 1.33, avatar: 0.85 },
    12: { scale: 1.34, avatar: 0.85 },
    13: { scale: 1.35, avatar: 0.84 },
    14: { scale: 1.34, avatar: 0.85 },
    15: { scale: 1.35, avatar: 0.84 },
    16: { scale: 1.36, avatar: 0.84, shiftX: '1px', shiftY: '-2px' },
    17: { scale: 1.37, avatar: 0.83, shiftY: '1px' },
    18: { scale: 1.33, avatar: 0.86, shiftY: '1px' },
    19: { scale: 1.39, avatar: 0.83 },
    20: { scale: 1.35, avatar: 0.84 }
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
    return Math.max(0, Math.min(20, value));
  }

  function getFrameAssetIndex(level = 0) {
    const lvl = normalizeLevel(level);
    if (lvl < 5) return 0;
    return Math.min(20, Math.max(1, Math.floor(lvl / 5)));
  }

  function resolveFrameIndex(level = 0, exactFrameIndex = null) {
    const exact = normalizeFrameIndex(exactFrameIndex);
    if (exact > 0) return exact;
    return getFrameAssetIndex(level);
  }

  function getFrameProfile(frameIndex = 0) {
    return FRAME_VISUAL_PROFILES[normalizeFrameIndex(frameIndex)] || { scale: 1.30, avatar: 0.86, shiftX: '0px', shiftY: '0px' };
  }

  function buildHTML({ avatarUrl = '', level = 0, exactFrameIndex = null, sizePx = 45, extraClass = '', imageClass = 'pm-premium-img', wrapperClass = 'pm-premium-avatar', alt = 'Oyuncu', sizeTag = '' } = {}) {
    const frameIndex = resolveFrameIndex(level, exactFrameIndex);
    const safeAvatar = safeAvatarUrl(avatarUrl);
    const profile = getFrameProfile(frameIndex);
    const classes = [wrapperClass, frameIndex > 0 ? 'has-frame' : '', extraClass].filter(Boolean).join(' ');
    const normalizedSize = Math.max(18, Number(sizePx) || 45);
    const styleVars = [
      `width:${normalizedSize}px`,
      `height:${normalizedSize}px`,
      `--pm-avatar-fit:${profile.avatar}`,
      `--pm-frame-scale:${profile.scale}`,
      `--pm-frame-shift-x:${profile.shiftX || '0px'}`,
      `--pm-frame-shift-y:${profile.shiftY || '0px'}`
    ].join(';');
    const frameHtml = frameIndex > 0
      ? `<img src="/Cerceve/frame-${frameIndex}.png" class="pm-frame-image pm-avatar-shell__frame frame-${frameIndex}" alt="" aria-hidden="true" data-frame-index="${frameIndex}" data-fallback="/Çerçeve/frame-${frameIndex}.png" onerror="if(this.dataset.fallback && this.src !== this.dataset.fallback){this.src=this.dataset.fallback;return;}this.hidden=true;">`
      : '';
    const sizeAttr = sizeTag ? ` data-pm-avatar-size="${escapeAttr(sizeTag)}"` : '';
    return `<div class="${escapeAttr(classes)}" data-pm-avatar="true" data-frame-index="${frameIndex}"${sizeAttr} style="${styleVars}"><img src="${escapeAttr(safeAvatar)}" alt="${escapeAttr(alt || 'Oyuncu')}" class="${escapeAttr(imageClass)}" loading="lazy" decoding="async" draggable="false">${frameHtml}</div>`;
  }

  function createNode(options = {}) {
    const template = document.createElement('template');
    template.innerHTML = buildHTML(options).trim();
    return template.content.firstElementChild;
  }


  function upgradeLegacyFrameImage(img) {
    if (!img || !img.classList) return null;
    const match = [...img.classList].find((cls) => /^frame-\d+$/.test(cls));
    if (!match) return null;
    img.classList.add('pm-frame-image', 'pm-avatar-shell__frame');
    img.setAttribute('aria-hidden', 'true');
    img.setAttribute('alt', '');
    return match;
  }

  function reconcileLegacyAvatarHost(host) {
    if (!host || !host.classList) return host;
    if (host.classList.contains('avatar-frame') || host.classList.contains('frame-base')) {
      host.dataset.pmAvatarLegacy = 'true';
      [...host.classList]
        .filter((cls) => /^frame-lvl-\d+$/.test(cls))
        .forEach((cls) => host.classList.remove(cls));
      host.style.background = 'transparent';
      host.style.border = '0';
      host.style.boxShadow = 'none';
      host.querySelectorAll('img').forEach(upgradeLegacyFrameImage);
    }
    return host;
  }

  function reconcileLegacyAvatarTree(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    let touched = 0;
    root.querySelectorAll('.avatar-frame, .frame-base').forEach((host) => {
      reconcileLegacyAvatarHost(host);
      touched += 1;
    });
    root.querySelectorAll('img[class*="frame-"]').forEach((img) => {
      if (upgradeLegacyFrameImage(img)) touched += 1;
    });
    return touched;
  }

  function installLegacyObserver() {
    if (typeof MutationObserver !== 'function' || !document?.documentElement) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes?.forEach((node) => {
          if (!node || node.nodeType !== 1) return;
          reconcileLegacyAvatarHost(node);
          reconcileLegacyAvatarTree(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function mount(target, options = {}) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) return null;
    const node = createNode(options);
    host.replaceChildren(node);
    return node;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        reconcileLegacyAvatarTree(document);
        installLegacyObserver();
      }, { once: true });
    } else {
      reconcileLegacyAvatarTree(document);
      installLegacyObserver();
    }
  }

  window.PMAvatar = Object.freeze({
    FALLBACK_AVATAR,
    FRAME_VISUAL_PROFILES,
    normalizeLevel,
    normalizeFrameIndex,
    getFrameAssetIndex,
    resolveFrameIndex,
    getFrameProfile,
    buildHTML,
    createNode,
    mount,
    upgradeLegacyFrameImage,
    reconcileLegacyAvatarHost,
    reconcileLegacyAvatarTree
  });
})();
