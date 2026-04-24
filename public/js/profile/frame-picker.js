const DEFAULT_ROOT_ID = 'framePickerModal';
const DEFAULT_CONTAINER_ID = 'framePickerContainer';
const DEFAULT_FALLBACK_AVATAR = '/assets/avatars/system/fallback.svg';

function normalizeFrameLevel(value = 0) {
  const parsed = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(100, parsed));
}

function createElement(tagName, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function resolveFrameAssetIndex(level = 0) {
  if (window.PMAvatar?.getFrameAssetIndex) return window.PMAvatar.getFrameAssetIndex(level);
  const normalized = normalizeFrameLevel(level);
  if (normalized <= 0) return 0;
  if (normalized <= 15) return 1;
  if (normalized <= 30) return 2;
  if (normalized <= 40) return 3;
  if (normalized <= 50) return 4;
  if (normalized <= 60) return 5;
  if (normalized <= 80) return 6;
  if (normalized <= 85) return 7;
  if (normalized <= 90) return 8;
  return Math.min(18, normalized - 82);
}

function mountFramePreview(host, { avatar = DEFAULT_FALLBACK_AVATAR, frameLevel = 0, size = 64, extraClass = 'pm-avatar--picker' } = {}) {
  if (!host) return null;
  if (window.PMAvatar?.mount) {
    return window.PMAvatar.mount(host, {
      avatarUrl: avatar || DEFAULT_FALLBACK_AVATAR,
      level: normalizeFrameLevel(frameLevel),
      sizePx: size,
      extraClass,
      alt: 'Çerçeve önizlemesi',
      sizeTag: 'frame-picker'
    });
  }

  const img = document.createElement('img');
  img.src = avatar || DEFAULT_FALLBACK_AVATAR;
  img.alt = 'Çerçeve önizlemesi';
  img.className = 'pm-frame-picker-fallback-img';
  img.addEventListener('error', () => {
    if (img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    img.src = DEFAULT_FALLBACK_AVATAR;
  });
  host.replaceChildren(img);
  return img;
}

export function createFramePicker({
  documentRef = document,
  rootId = DEFAULT_ROOT_ID,
  containerId = DEFAULT_CONTAINER_ID,
  fallbackAvatar = DEFAULT_FALLBACK_AVATAR,
  getSelectedFrame = () => 0,
  getCurrentLevel = () => 1,
  getCurrentAvatar = () => fallbackAvatar,
  onSelect = null,
  openModal = null,
  closeModal = null,
} = {}) {
  const root = () => documentRef.getElementById(rootId);
  const container = () => documentRef.getElementById(containerId);

  function closeFramePicker() {
    if (typeof closeModal === 'function') closeModal(rootId);
    else root()?.classList.remove('active');
  }

  function getCardStatus(level, selectedFrame, currentLevel) {
    if (level > currentLevel) return 'Şuanda Aktif Değil';
    if (level === selectedFrame) return 'Kullanımda';
    return 'Seç';
  }

  function buildFrameCard(level, selectedFrame, currentLevel, avatar) {
    const normalizedLevel = normalizeFrameLevel(level);
    const isLocked = normalizedLevel > currentLevel;
    const isSelected = normalizedLevel === selectedFrame;
    const card = createElement('button', 'frame-picker-card');
    card.type = 'button';
    card.dataset.frameLevel = String(normalizedLevel);
    card.dataset.frameAssetIndex = String(resolveFrameAssetIndex(normalizedLevel));
    card.classList.toggle('is-locked', isLocked);
    card.classList.toggle('is-selected', isSelected);
    card.disabled = isLocked;
    card.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    card.setAttribute('aria-label', normalizedLevel === 0 ? 'Çerçevesiz profil görünümü' : `Seviye ${normalizedLevel} çerçevesi`);
    if (isLocked) card.setAttribute('title', `Seviye ${normalizedLevel} kilitli. Açmak için hesap seviyen ${normalizedLevel} olmalı.`);

    const preview = createElement('span', 'frame-picker-preview');
    mountFramePreview(preview, {
      avatar,
      frameLevel: normalizedLevel,
      size: normalizedLevel === 0 ? 60 : 64,
    });

    const meta = createElement('span', 'frame-picker-meta');
    const title = createElement('strong', 'frame-picker-card-title');
    title.textContent = normalizedLevel === 0 ? 'Çerçevesiz' : `Seviye ${normalizedLevel}`;

    const status = createElement('span', 'frame-picker-card-status');
    status.textContent = getCardStatus(normalizedLevel, selectedFrame, currentLevel);
    if (isLocked) status.dataset.requirement = `Seviye ${normalizedLevel}`;

    const asset = createElement('span', 'frame-picker-card-asset');
    const frameAssetIndex = resolveFrameAssetIndex(normalizedLevel);
    asset.textContent = frameAssetIndex > 0 ? `Çerçeve ${frameAssetIndex}` : 'Standart';

    meta.append(title, asset, status);
    card.append(preview, meta);

    if (!isLocked) {
      card.addEventListener('click', async () => {
        if (card.disabled) return;
        card.disabled = true;
        card.classList.add('is-saving');
        try {
          if (typeof onSelect === 'function') await onSelect(normalizedLevel);
          renderFrameOptions();
        } finally {
          card.classList.remove('is-saving');
        }
      });
    }

    return card;
  }

  function renderFrameOptions() {
    const host = container();
    if (!host) return null;

    const currentLevel = normalizeFrameLevel(getCurrentLevel());
    const selectedFrame = Math.min(currentLevel, normalizeFrameLevel(getSelectedFrame()));
    const avatar = getCurrentAvatar() || fallbackAvatar;
    host.textContent = '';

    const summary = createElement('div', 'frame-picker-summary');
    const summaryPreview = createElement('div', 'frame-picker-summary-preview');
    mountFramePreview(summaryPreview, { avatar, frameLevel: selectedFrame, size: 78, extraClass: 'pm-avatar--picker' });

    const summaryCopy = createElement('div', 'frame-picker-summary-copy');
    const summaryTitle = createElement('strong');
    summaryTitle.textContent = selectedFrame > 0 ? `Seviye ${selectedFrame} Çerçevesi` : 'Çerçevesiz Görünüm';
    const summaryText = createElement('span');
    summaryText.textContent = `Mevcut seviyen: ${currentLevel}. Seviye ${currentLevel} ve altındaki çerçeveler aktif.`;
    summaryCopy.append(summaryTitle, summaryText);
    summary.append(summaryPreview, summaryCopy);

    const grid = createElement('div', 'frame-picker-grid');
    for (let level = 0; level <= 100; level += 1) {
      grid.appendChild(buildFrameCard(level, selectedFrame, currentLevel, avatar));
    }

    host.append(summary, grid);
    return host;
  }

  function openFramePicker() {
    renderFrameOptions();
    if (typeof openModal === 'function') openModal(rootId);
    else root()?.classList.add('active');
    window.setTimeout(() => container()?.focus?.(), 30);
    return root();
  }

  function updateActiveSelection() {
    const host = container();
    if (!host) return;
    const currentLevel = normalizeFrameLevel(getCurrentLevel());
    const selectedFrame = Math.min(currentLevel, normalizeFrameLevel(getSelectedFrame()));
    host.querySelectorAll('.frame-picker-card').forEach((card) => {
      const level = normalizeFrameLevel(card.dataset.frameLevel);
      const locked = level > currentLevel;
      const selected = level === selectedFrame;
      card.classList.toggle('is-locked', locked);
      card.classList.toggle('is-selected', selected);
      card.disabled = locked;
      card.setAttribute('aria-disabled', locked ? 'true' : 'false');
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const status = card.querySelector('.frame-picker-card-status');
      if (status) status.textContent = getCardStatus(level, selectedFrame, currentLevel);
    });
  }

  return Object.freeze({
    openFramePicker,
    closeFramePicker,
    renderFrameOptions,
    updateActiveSelection,
  });
}
