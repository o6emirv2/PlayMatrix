'use strict';

(() => {
  const FALLBACK_AVATAR = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_xNqOtfFq83d6nI4V3B_b-05aBw_Nl7U5ng&s';
  const FRAME_VISUAL_PROFILES = Object.freeze({
    1: { scale: 1.34, avatar: 0.86 },
    2: { scale: 1.34, avatar: 0.86 },
    3: { scale: 1.34, avatar: 0.86 },
    4: { scale: 1.34, avatar: 0.86 },
    5: { scale: 1.34, avatar: 0.86 },
    6: { scale: 1.34, avatar: 0.86 },
    7: { scale: 1.34, avatar: 0.86 },
    8: { scale: 1.34, avatar: 0.86 },
    9: { scale: 1.34, avatar: 0.86 },
    10: { scale: 1.34, avatar: 0.86 },
    11: { scale: 1.34, avatar: 0.86 },
    12: { scale: 1.34, avatar: 0.86 },
    13: { scale: 1.34, avatar: 0.86 },
    14: { scale: 1.34, avatar: 0.86 },
    15: { scale: 1.34, avatar: 0.86 },
    16: { scale: 1.34, avatar: 0.86 },
    17: { scale: 1.34, avatar: 0.86 },
    18: { scale: 1.34, avatar: 0.86 },
    19: { scale: 1.34, avatar: 0.86 },
    20: { scale: 1.34, avatar: 0.86 },
    21: { scale: 1.34, avatar: 0.86 },
    22: { scale: 1.34, avatar: 0.86 },
    23: { scale: 1.34, avatar: 0.86 },
    24: { scale: 1.34, avatar: 0.86 },
    25: { scale: 1.34, avatar: 0.86 },
    26: { scale: 1.34, avatar: 0.86 },
    27: { scale: 1.34, avatar: 0.86 },
    28: { scale: 1.34, avatar: 0.86 },
    29: { scale: 1.34, avatar: 0.86 },
    30: { scale: 1.34, avatar: 0.86 },
    31: { scale: 1.35, avatar: 0.86 },
    32: { scale: 1.35, avatar: 0.86 },
    33: { scale: 1.35, avatar: 0.86 },
    34: { scale: 1.35, avatar: 0.86 },
    35: { scale: 1.35, avatar: 0.86 },
    36: { scale: 1.35, avatar: 0.86 },
    37: { scale: 1.35, avatar: 0.86 },
    38: { scale: 1.35, avatar: 0.86 },
    39: { scale: 1.35, avatar: 0.86 },
    40: { scale: 1.35, avatar: 0.86 },
    41: { scale: 1.28, avatar: 0.85 },
    42: { scale: 1.28, avatar: 0.85 },
    43: { scale: 1.28, avatar: 0.85 },
    44: { scale: 1.28, avatar: 0.85 },
    45: { scale: 1.28, avatar: 0.85 },
    46: { scale: 1.28, avatar: 0.85 },
    47: { scale: 1.28, avatar: 0.85 },
    48: { scale: 1.28, avatar: 0.85 },
    49: { scale: 1.28, avatar: 0.85 },
    50: { scale: 1.28, avatar: 0.85 },
    51: { scale: 1.34, avatar: 0.86 },
    52: { scale: 1.34, avatar: 0.86 },
    53: { scale: 1.34, avatar: 0.86 },
    54: { scale: 1.34, avatar: 0.86 },
    55: { scale: 1.34, avatar: 0.86 },
    56: { scale: 1.34, avatar: 0.86 },
    57: { scale: 1.34, avatar: 0.86 },
    58: { scale: 1.34, avatar: 0.86 },
    59: { scale: 1.34, avatar: 0.86 },
    60: { scale: 1.34, avatar: 0.86 },
    61: { scale: 1.24, avatar: 0.84 },
    62: { scale: 1.24, avatar: 0.84 },
    63: { scale: 1.24, avatar: 0.84 },
    64: { scale: 1.24, avatar: 0.84 },
    65: { scale: 1.24, avatar: 0.84 },
    66: { scale: 1.24, avatar: 0.84 },
    67: { scale: 1.24, avatar: 0.84 },
    68: { scale: 1.24, avatar: 0.84 },
    69: { scale: 1.24, avatar: 0.84 },
    70: { scale: 1.24, avatar: 0.84 },
    71: { scale: 1.24, avatar: 0.84 },
    72: { scale: 1.24, avatar: 0.84 },
    73: { scale: 1.24, avatar: 0.84 },
    74: { scale: 1.24, avatar: 0.84 },
    75: { scale: 1.24, avatar: 0.84 },
    76: { scale: 1.24, avatar: 0.84 },
    77: { scale: 1.24, avatar: 0.84 },
    78: { scale: 1.24, avatar: 0.84 },
    79: { scale: 1.24, avatar: 0.84 },
    80: { scale: 1.24, avatar: 0.84 },
    81: { scale: 1.28, avatar: 0.84 },
    82: { scale: 1.28, avatar: 0.84 },
    83: { scale: 1.28, avatar: 0.84 },
    84: { scale: 1.28, avatar: 0.84 },
    85: { scale: 1.28, avatar: 0.84 },
    86: { scale: 1.28, avatar: 0.84 },
    87: { scale: 1.28, avatar: 0.84 },
    88: { scale: 1.28, avatar: 0.84 },
    89: { scale: 1.28, avatar: 0.84 },
    90: { scale: 1.28, avatar: 0.84 },
    91: { scale: 1.28, avatar: 0.84 },
    92: { scale: 1.28, avatar: 0.84 },
    93: { scale: 1.24, avatar: 0.84 },
    94: { scale: 1.28, avatar: 0.84 },
    95: { scale: 1.24, avatar: 0.84 },
    96: { scale: 1.28, avatar: 0.84 },
    97: { scale: 1.24, avatar: 0.84 },
    98: { scale: 1.28, avatar: 0.84 },
    99: { scale: 1.24, avatar: 0.84 },
    100: { scale: 1.46, avatar: 0.80, shiftY: '4px' }
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
    return Math.max(0, Math.min(100, value));
  }

  function getFrameAssetIndex(level = 0) {
    const lvl = normalizeLevel(level);
    if (lvl <= 0) return 0;
    return Math.max(1, Math.min(100, lvl));
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

  function mount(target, options = {}) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) return null;
    const node = createNode(options);
    host.replaceChildren(node);
    return node;
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
    mount
  });
})();
